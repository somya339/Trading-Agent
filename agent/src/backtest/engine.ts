/**
 * Event-driven, single-symbol backtester.
 *
 * Guarantees that keep results honest:
 *  - NO LOOK-AHEAD: the strategy sees bars[0..i] and any entry fills at
 *    bar i+1's OPEN (with slippage). A close-based signal can't use same-bar
 *    hindsight.
 *  - REALISTIC COSTS: every entry and exit runs through the NSE cost model +
 *    slippage. Net P&L is what you'd actually keep.
 *  - INTRABAR EXITS: once in a position, each subsequent bar is checked for
 *    stop-hit (using the bar LOW) and target-hit (using the bar HIGH). When a
 *    bar's range spans both, we conservatively assume the STOP hit first.
 *  - TIME STOP: positions are force-closed after maxHoldBars.
 *
 * Portfolio-level backtests run this per symbol and aggregate; cross-sectional
 * sizing/heat is applied by the risk engine at signal time, so per-symbol
 * equity here uses a fixed fractional notional for apples-to-apples strategy
 * comparison.
 */

import type { Bar, Strategy, StrategyContext } from "../strategies/types.js";
import { applySlippage, roundTripCost } from "../risk/costs.js";
import {
  computeMetrics,
  type ClosedTrade,
  type EquityPoint,
  type PerformanceMetrics,
} from "./metrics.js";

export interface BacktestOptions {
  startingCapital: number;
  /** fraction of capital to deploy per trade (notional), for comparability */
  positionFraction: number;
  liquidity: "HIGH" | "MEDIUM" | "LOW";
  /** optional per-bar context provider (e.g. market regime at bar i) */
  contextAt?: (index: number) => StrategyContext;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  trades: ClosedTrade[];
  equity: EquityPoint[];
  metrics: PerformanceMetrics;
}

interface OpenPosition {
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  targets: number[];
  maxHoldBars: number;
}

export function backtestSymbol(
  symbol: string,
  bars: Bar[],
  strategy: Strategy,
  opts: BacktestOptions,
): BacktestResult {
  const trades: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];

  let cash = opts.startingCapital;
  let realized = 0;
  let open: OpenPosition | null = null;

  const closePosition = (
    exitIndex: number,
    rawExitPrice: number,
    reason: string,
  ) => {
    if (!open) return;
    const exitFill = applySlippage(rawExitPrice, "SELL", opts.liquidity);
    const gross = (exitFill - open.entryPrice) * open.quantity;
    const costs = roundTripCost(open.entryPrice, exitFill, open.quantity).total;
    const netPnl = gross - costs;
    const invested = open.entryPrice * open.quantity;

    realized += netPnl;
    trades.push({
      symbol,
      entryDate: open.entryDate,
      exitDate: bars[exitIndex].date,
      entryPrice: open.entryPrice,
      exitPrice: exitFill,
      quantity: open.quantity,
      netPnl,
      returnPct: invested > 0 ? netPnl / invested : 0,
      exitReason: reason,
    });
    open = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // ── Manage an open position on THIS bar (before considering new entries) ──
    if (open) {
      const held = i - open.entryIndex;

      // Stop first (conservative when a bar spans both stop and target).
      if (bar.low <= open.stopLoss) {
        closePosition(i, open.stopLoss, "STOP");
      } else if (open.targets.length && bar.high >= open.targets[open.targets.length - 1]) {
        // Final target reached.
        closePosition(i, open.targets[open.targets.length - 1], "TARGET");
      } else if (held >= open.maxHoldBars) {
        closePosition(i, bar.close, "TIME_STOP");
      }
    }

    // ── Mark-to-market equity at this bar's close ──
    let mtm = 0;
    if (open) mtm = (bar.close - open.entryPrice) * open.quantity;
    equity.push({ date: bar.date, equity: opts.startingCapital + realized + mtm });

    // ── Look for a new entry (only when flat) ──
    // Decision uses bars[0..i]; fill happens at i+1 open → no look-ahead.
    if (!open && strategy.minBars <= i + 1 && i + 1 < bars.length) {
      const ctx = opts.contextAt ? opts.contextAt(i) : undefined;
      const sig = strategy.evaluate(bars.slice(0, i + 1), ctx);
      if (sig.enter && sig.stopLoss > 0) {
        const nextOpen = bars[i + 1].open;
        const entryFill = applySlippage(nextOpen, "BUY", opts.liquidity);
        const perShareRisk = entryFill - sig.stopLoss;
        if (perShareRisk > 0) {
          const notional = opts.startingCapital * opts.positionFraction;
          const qty = Math.floor(notional / entryFill);
          if (qty >= 1) {
            open = {
              entryIndex: i + 1,
              entryDate: bars[i + 1].date,
              entryPrice: entryFill,
              quantity: qty,
              stopLoss: sig.stopLoss,
              targets: sig.targets,
              maxHoldBars: sig.maxHoldBars || 60,
            };
          }
        }
      }
    }
  }

  // Force-close anything still open at the last bar.
  if (open) closePosition(bars.length - 1, bars[bars.length - 1].close, "EOD");

  const metrics = computeMetrics(trades, equity, opts.startingCapital);
  return { symbol, strategy: strategy.name, trades, equity, metrics };
}

/**
 * Run a strategy across many symbols and aggregate the trade log + a blended
 * equity curve (equal-weight average of per-symbol curves). Good enough to
 * judge whether a strategy has an edge across the universe.
 */
export function backtestUniverse(
  data: Record<string, Bar[]>,
  strategy: Strategy,
  opts: BacktestOptions,
): { perSymbol: BacktestResult[]; aggregate: PerformanceMetrics; allTrades: ClosedTrade[] } {
  const perSymbol: BacktestResult[] = [];
  for (const [symbol, bars] of Object.entries(data)) {
    if (bars.length < strategy.minBars + 2) continue;
    perSymbol.push(backtestSymbol(symbol, bars, strategy, opts));
  }

  const allTrades = perSymbol.flatMap((r) => r.trades);

  // Blended equity curve: align by date, average normalized equity.
  const dateSet = new Set<string>();
  for (const r of perSymbol) for (const p of r.equity) dateSet.add(p.date);
  const dates = [...dateSet].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const blended: EquityPoint[] = dates.map((date) => {
    const vals: number[] = [];
    for (const r of perSymbol) {
      const pt = r.equity.find((p) => p.date === date);
      if (pt) vals.push(pt.equity / opts.startingCapital);
    }
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1;
    return { date, equity: avg * opts.startingCapital };
  });

  const aggregate = computeMetrics(allTrades, blended, opts.startingCapital);
  return { perSymbol, aggregate, allTrades };
}
