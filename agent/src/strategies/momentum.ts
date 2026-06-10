/**
 * Momentum engine — targets 50%+ moves.
 *
 * Implements Mark Minervini's Trend Template (the 8 criteria, verified against
 * "Trade Like a Stock Market Wizard"), gated by IBD RS rating and broad-market
 * regime (CAN SLIM "M" — only buy in a confirmed uptrend), with a
 * volume-confirmed entry near the 52-week high.
 *
 * Minervini Trend Template:
 *   1. Price > 50-, 150-, 200-day SMA
 *   2. 150-day SMA > 200-day SMA
 *   3. 50-day SMA > 150- and 200-day SMA
 *   4. 200-day SMA trending up for ≥ ~1 month
 *   5. Price ≥ 30% above 52-week low
 *   6. Price within 25% of 52-week high
 *   7. RS rating ≥ 70 (prefer ≥ 80-90)
 *   8. (growth overlay) — handled by the fundamental engine, not here
 *
 * Stops are ATR-based; targets are R-multiples sized for a 50%+ runner.
 */

import {
  type Strategy,
  type Bar,
  type StrategySignal,
  type StrategyContext,
  noEntry,
  toColumns,
} from "./types.js";
import {
  calculateSMA,
  calculateATR,
  distanceFromHigh,
  distanceFromLow,
  smaSlopePct,
  calculateVolumeRatio,
} from "../analysis/indicators.js";

export class MomentumStrategy implements Strategy {
  readonly name = "Momentum (Minervini Trend Template)";
  readonly kind = "MOMENTUM" as const;
  readonly minBars = 252; // need a full year for 52-wk + 200-SMA slope

  constructor(
    private readonly atrStopMultiple = 2.5,
    private readonly minRsRating = 70,
  ) {}

  evaluate(bars: Bar[], ctx?: StrategyContext): StrategySignal {
    const { closes, highs, lows, volumes } = toColumns(bars);
    const price = closes[closes.length - 1];

    // Regime gate (CAN SLIM "M"): if we know the market is NOT in an uptrend,
    // stand aside. If unknown (undefined), we don't block — caller decides.
    if (ctx?.marketUptrend === false) {
      return noEntry("Market not in confirmed uptrend");
    }

    const sma50 = calculateSMA(closes, 50);
    const sma150 = calculateSMA(closes, 150);
    const sma200 = calculateSMA(closes, 200);

    const reasons: string[] = [];
    const risks: string[] = [];

    // ── Trend Template criteria 1-6 ──
    const c1 = price > sma50 && price > sma150 && price > sma200;
    const c2 = sma150 > sma200;
    const c3 = sma50 > sma150 && sma50 > sma200;
    const slope200 = smaSlopePct(closes, 200, 21); // ~1 month
    const c4 = slope200 !== null && slope200 > 0;
    const distLow = distanceFromLow(closes, 252); // % above 52-wk low
    const c5 = distLow !== null && distLow >= 30;
    const distHigh = distanceFromHigh(closes, 252); // % below 52-wk high
    const c6 = distHigh !== null && distHigh <= 25;

    const trendOk = c1 && c2 && c3 && c4 && c5 && c6;
    if (!trendOk) {
      return noEntry(
        `Trend Template fail (1:${c1} 2:${c2} 3:${c3} 4:${c4} 5:${c5} 6:${c6})`,
      );
    }
    reasons.push("Minervini Trend Template: all stage-2 criteria met");

    // ── Criterion 7: RS rating ──
    const rs = ctx?.rsRating;
    if (rs !== undefined && rs < this.minRsRating) {
      return noEntry(`RS rating ${rs} < ${this.minRsRating}`);
    }
    if (rs !== undefined) reasons.push(`RS rating ${rs} (leader)`);

    // ── Entry trigger: volume-confirmed proximity to 52-wk high ──
    const volRatio = calculateVolumeRatio(volumes, 50);
    const nearHigh = distHigh !== null && distHigh <= 10;
    if (!nearHigh) {
      return noEntry(`Not near 52-wk high (${distHigh?.toFixed(0)}% below)`);
    }
    if (volRatio < 1.0) {
      return noEntry(`No volume confirmation (${volRatio.toFixed(2)}x)`);
    }
    reasons.push(`Within ${distHigh.toFixed(0)}% of 52-wk high on ${volRatio.toFixed(1)}x volume`);

    if (distHigh !== null && distHigh < 1) {
      risks.push("Extended — at/near 52-wk high, expect volatility");
    }

    // ── Risk geometry: ATR stop, R-multiple targets for a 50%+ runner ──
    const atr = calculateATR(highs, lows, closes, 14) || price * 0.03;
    const stopLoss = Math.max(price - atr * this.atrStopMultiple, sma50 * 0.99);
    const risk = price - stopLoss;
    if (risk <= 0) return noEntry("Invalid stop geometry");

    // Targets: 4R, 8R, and a 50% objective — momentum winners run.
    const targets = [
      price + risk * 4,
      price + risk * 8,
      Math.max(price * 1.5, price + risk * 12),
    ];

    // Score by RS and how tight the stop is relative to price (lower risk% = higher score).
    const riskPct = (risk / price) * 100;
    const rsComponent = rs !== undefined ? rs : 75;
    const score = Math.min(
      100,
      Math.round(rsComponent * 0.7 + Math.max(0, 30 - riskPct) * 1.0),
    );

    return {
      enter: true,
      stopLoss,
      targets,
      score,
      maxHoldBars: 252, // momentum positions can run for months
      reasons,
      risks,
      suggestedTimeframe: "LONG",
    };
  }
}
