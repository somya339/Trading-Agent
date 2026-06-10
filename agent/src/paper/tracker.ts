/**
 * Paper-trading tracker.
 *
 * Simulates a real book WITHOUT placing real orders, so you can build evidence
 * that the strategies work on live forward data (the only honest test for the
 * fundamental/multibagger engine, which can't be backtested).
 *
 * Lifecycle each run:
 *   1. update(): mark every OPEN position to the latest price; close any that
 *      hit their stop or final target. Realize P&L net of costs+slippage.
 *   2. openFromSignals(): open NEW paper positions from today's accepted,
 *      risk-sized signals (deduped against already-open symbols).
 *   3. snapshot(): return cumulative performance for the dashboard/logs.
 *
 * Fills are intentionally pessimistic: entries fill at the current price plus
 * slippage, exits at stop/target/current minus slippage, and every leg pays the
 * full NSE cost stack. If it's profitable here, it has a real shot live.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { applySlippage, roundTripCost } from "../risk/costs.js";
import {
  computeMetrics,
  type ClosedTrade,
  type EquityPoint,
  type PerformanceMetrics,
} from "../backtest/metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE = path.join(__dirname, "../../../dashboard/paper-book.json");

export interface PaperPosition {
  id: string;
  symbol: string;
  sector: string;
  strategy: string;
  entryDate: string;
  entryPrice: number; // filled, incl. slippage
  quantity: number;
  stopLoss: number;
  targets: number[];
  liquidity: "HIGH" | "MEDIUM" | "LOW";
  // marked each update
  lastPrice: number;
  lastDate: string;
  unrealizedPct: number;
}

export interface PaperBook {
  startingCapital: number;
  cash: number;
  open: PaperPosition[];
  closed: ClosedTrade[];
  equityCurve: EquityPoint[];
  updatedAt: string;
}

export interface PaperEntry {
  symbol: string;
  sector: string;
  strategy: string;
  price: number; // current market price (pre-slippage)
  quantity: number;
  stopLoss: number;
  targets: number[];
  liquidity: "HIGH" | "MEDIUM" | "LOW";
}

function emptyBook(startingCapital: number): PaperBook {
  return {
    startingCapital,
    cash: startingCapital,
    open: [],
    closed: [],
    equityCurve: [],
    updatedAt: new Date().toISOString(),
  };
}

export class PaperTracker {
  private book: PaperBook;

  private constructor(book: PaperBook) {
    this.book = book;
  }

  static async load(startingCapital: number): Promise<PaperTracker> {
    try {
      const raw = await fs.readFile(STORE, "utf-8");
      return new PaperTracker(JSON.parse(raw));
    } catch {
      return new PaperTracker(emptyBook(startingCapital));
    }
  }

  async save(): Promise<void> {
    this.book.updatedAt = new Date().toISOString();
    await fs.writeFile(STORE, JSON.stringify(this.book, null, 2));
  }

  /**
   * Mark open positions to `prices` (symbol → latest price). Close any that
   * breached stop or hit the final target. `asOf` stamps the event.
   */
  update(prices: Record<string, number>, asOf: string): ClosedTrade[] {
    const justClosed: ClosedTrade[] = [];
    const stillOpen: PaperPosition[] = [];

    for (const pos of this.book.open) {
      const px = prices[pos.symbol];
      if (px === undefined) {
        stillOpen.push(pos); // no quote this run; leave as-is
        continue;
      }

      let exit: { price: number; reason: string } | null = null;
      if (px <= pos.stopLoss) exit = { price: pos.stopLoss, reason: "STOP" };
      else if (pos.targets.length && px >= pos.targets[pos.targets.length - 1])
        exit = { price: pos.targets[pos.targets.length - 1], reason: "TARGET" };

      if (exit) {
        const exitFill = applySlippage(exit.price, "SELL", pos.liquidity);
        const gross = (exitFill - pos.entryPrice) * pos.quantity;
        const costs = roundTripCost(pos.entryPrice, exitFill, pos.quantity).total;
        const netPnl = gross - costs;
        const invested = pos.entryPrice * pos.quantity;
        const trade: ClosedTrade = {
          symbol: pos.symbol,
          entryDate: pos.entryDate,
          exitDate: asOf,
          entryPrice: pos.entryPrice,
          exitPrice: exitFill,
          quantity: pos.quantity,
          netPnl,
          returnPct: invested > 0 ? netPnl / invested : 0,
          exitReason: exit.reason,
        };
        this.book.closed.push(trade);
        justClosed.push(trade);
        this.book.cash += pos.entryPrice * pos.quantity + netPnl;
      } else {
        pos.lastPrice = px;
        pos.lastDate = asOf;
        pos.unrealizedPct = ((px - pos.entryPrice) / pos.entryPrice) * 100;
        stillOpen.push(pos);
      }
    }

    this.book.open = stillOpen;
    this.recordEquity(prices, asOf);
    return justClosed;
  }

  /** Open new paper positions; skips symbols already held. */
  openFromSignals(entries: PaperEntry[], asOf: string): PaperPosition[] {
    const heldSymbols = new Set(this.book.open.map((p) => p.symbol));
    const opened: PaperPosition[] = [];

    for (const e of entries) {
      if (heldSymbols.has(e.symbol)) continue;
      if (e.quantity < 1) continue;

      const entryFill = applySlippage(e.price, "BUY", e.liquidity);
      const cost = entryFill * e.quantity;
      if (cost > this.book.cash) continue; // not enough paper cash

      const pos: PaperPosition = {
        id: `${e.symbol}-${asOf}`,
        symbol: e.symbol,
        sector: e.sector,
        strategy: e.strategy,
        entryDate: asOf,
        entryPrice: entryFill,
        quantity: e.quantity,
        stopLoss: e.stopLoss,
        targets: e.targets,
        liquidity: e.liquidity,
        lastPrice: entryFill,
        lastDate: asOf,
        unrealizedPct: 0,
      };
      this.book.open.push(pos);
      this.book.cash -= cost;
      heldSymbols.add(e.symbol);
      opened.push(pos);
    }
    return opened;
  }

  private recordEquity(prices: Record<string, number>, asOf: string): void {
    let openValue = 0;
    for (const pos of this.book.open) {
      const px = prices[pos.symbol] ?? pos.lastPrice;
      openValue += px * pos.quantity;
    }
    const equity = this.book.cash + openValue;
    // Keep one point per date (overwrite same-day re-runs).
    const last = this.book.equityCurve[this.book.equityCurve.length - 1];
    if (last && last.date === asOf) last.equity = equity;
    else this.book.equityCurve.push({ date: asOf, equity });
  }

  metrics(): PerformanceMetrics {
    return computeMetrics(
      this.book.closed,
      this.book.equityCurve,
      this.book.startingCapital,
    );
  }

  snapshot() {
    const openValue = this.book.open.reduce(
      (a, p) => a + p.lastPrice * p.quantity,
      0,
    );
    const equity = this.book.cash + openValue;
    return {
      startingCapital: this.book.startingCapital,
      cash: this.book.cash,
      openPositions: this.book.open.length,
      openValue,
      equity,
      totalReturnPct:
        ((equity - this.book.startingCapital) / this.book.startingCapital) * 100,
      metrics: this.metrics(),
      open: this.book.open,
    };
  }
}
