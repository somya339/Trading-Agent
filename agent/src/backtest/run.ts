/**
 * Backtest CLI — validates the price-based strategies on real Kite history.
 *
 *   npm run backtest -- momentum            # default universe
 *   npm run backtest -- swing RELIANCE TCS INFY
 *
 * Pulls daily candles from Zerodha, runs the chosen strategy through the
 * event-driven engine (no look-ahead, next-bar fills, full NSE costs +
 * slippage), and prints aggregate + per-symbol performance.
 *
 * IMPORTANT honesty caveats printed with every run:
 *  - This universe is TODAY's liquid names → survivorship bias (delisted /
 *    blown-up names are absent), so live results will be worse.
 *  - Fundamental/multibagger picks are NOT backtested here (no point-in-time
 *    fundamentals). Validate those via the paper tracker instead.
 */

import { config, SECTOR_SYMBOLS } from "../config/index.js";
import { ZerodhaClient } from "../data/zerodha.js";
import type { Bar, Strategy } from "../strategies/types.js";
import { MomentumStrategy } from "../strategies/momentum.js";
import { SwingStrategy } from "../strategies/swing.js";
import { backtestUniverse } from "./engine.js";
import { formatMetrics } from "./metrics.js";

function pickStrategy(name: string): Strategy {
  switch (name.toLowerCase()) {
    case "momentum":
      // RS gate scales with the active risk profile (aggressive chases earlier).
      return new MomentumStrategy(
        config.risk.atrStopMultiple,
        config.signals.momentumMinRsRating,
      );
    case "swing":
      return new SwingStrategy(
        20,
        config.risk.atrStopMultiple,
        config.signals.swingMinRewardRisk,
      );
    default:
      console.error(`Unknown strategy "${name}". Use: momentum | swing`);
      process.exit(1);
  }
}

function defaultUniverse(): string[] {
  // A liquid, recognizable cross-section across sectors (kept modest so a run
  // finishes quickly and stays within Kite rate limits).
  const picks: string[] = [];
  for (const symbols of Object.values(SECTOR_SYMBOLS)) {
    picks.push(...symbols.slice(0, 4));
  }
  return Array.from(new Set(picks));
}

async function main() {
  const [, , strategyName = "momentum", ...symbolArgs] = process.argv;
  const strategy = pickStrategy(strategyName);
  const symbols = symbolArgs.length ? symbolArgs : defaultUniverse();

  console.log(`\n🔬 Backtest: ${strategy.name}`);
  console.log(`   Universe: ${symbols.length} symbols`);
  console.log(
    "   ⚠ Survivorship bias: today's listed names only — live results will be worse.\n",
  );

  const zerodha = new ZerodhaClient(
    config.zerodha.apiKey,
    config.zerodha.accessToken,
  );
  await zerodha.initialize();

  // Pull ~3 years of daily candles per symbol.
  const data: Record<string, Bar[]> = {};
  for (const symbol of symbols) {
    try {
      const h = await zerodha.getHistoricalData(symbol, 1000, "day");
      if (h.closes.length < strategy.minBars + 2) continue;
      data[symbol] = h.dates.map((d, i) => ({
        date: new Date(d).toISOString().split("T")[0],
        open: h.opens[i],
        high: h.highs[i],
        low: h.lows[i],
        close: h.closes[i],
        volume: h.volumes[i],
      }));
      process.stdout.write(".");
    } catch {
      process.stdout.write("x");
    }
  }
  console.log(`\n   Loaded history for ${Object.keys(data).length} symbols\n`);

  const { aggregate, perSymbol, allTrades } = backtestUniverse(data, strategy, {
    startingCapital: config.capital,
    positionFraction: config.risk.maxPositionPct,
    liquidity: "MEDIUM",
  });

  // Per-symbol leaderboard (top 10 by total return).
  const ranked = [...perSymbol]
    .filter((r) => r.trades.length > 0)
    .sort((a, b) => b.metrics.totalReturnPct - a.metrics.totalReturnPct);

  console.log("─".repeat(64));
  console.log("TOP SYMBOLS (by total return)");
  for (const r of ranked.slice(0, 10)) {
    console.log(
      `  ${r.symbol.padEnd(12)} ${r.metrics.totalReturnPct.toFixed(1).padStart(7)}%  ` +
        `${r.metrics.totalTrades} trades  ${r.metrics.winRate.toFixed(0)}% win  ` +
        `PF ${r.metrics.profitFactor === Infinity ? "∞" : r.metrics.profitFactor.toFixed(2)}`,
    );
  }

  console.log("\n" + "─".repeat(64));
  console.log("AGGREGATE (equal-weight across universe)");
  console.log("  " + formatMetrics(aggregate));
  console.log("─".repeat(64));

  // A blunt verdict — Sharpe and profit factor are the load-bearing numbers.
  const verdict =
    aggregate.totalTrades < 20
      ? "⚠ Too few trades to judge — widen universe / lengthen history."
      : aggregate.sharpe > 1 && aggregate.profitFactor > 1.3
        ? "✅ Shows an edge on this (biased) sample. Validate out-of-sample + paper trade before real capital."
        : "❌ No convincing edge after costs. Do NOT trade this as-is.";
  console.log(`\n${verdict}\n`);
  console.log(`Total trades across universe: ${allTrades.length}`);
}

main().catch((err) => {
  console.error("Backtest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
