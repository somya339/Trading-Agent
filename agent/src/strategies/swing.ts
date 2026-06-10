/**
 * Short-swing engine — 1 to 4 week holds.
 *
 * Two classic, well-documented setups:
 *  A) BREAKOUT: price closes above its recent N-bar high (consolidation
 *     resistance) on volume ≥ 1.5× average. Enter the breakout.
 *  B) PULLBACK: in an established uptrend (price > rising 50-SMA), price pulls
 *     back to the 20-EMA and turns up. Buy the bounce.
 *
 * Both require an uptrending backdrop, use ATR-based stops, and enforce a
 * minimum 2:1 reward:risk (the research is emphatic that R:R discipline, not
 * win rate, is what makes swing trading profitable).
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
  calculateEMA,
  calculateATR,
  calculateVolumeRatio,
  smaSlopePct,
} from "../analysis/indicators.js";

export class SwingStrategy implements Strategy {
  readonly name = "Short Swing (breakout / pullback)";
  readonly kind = "SWING" as const;
  readonly minBars = 60;

  constructor(
    private readonly breakoutLookback = 20,
    private readonly atrStopMultiple = 2.0,
    private readonly minRewardRisk = 2.0,
  ) {}

  evaluate(bars: Bar[], ctx?: StrategyContext): StrategySignal {
    const { closes, highs, lows, volumes } = toColumns(bars);
    const price = closes[closes.length - 1];

    if (ctx?.marketUptrend === false) {
      return noEntry("Market not in confirmed uptrend");
    }

    const sma50 = calculateSMA(closes, 50);
    const ema20 = calculateEMA(closes, 20);
    const slope50 = smaSlopePct(closes, 50, 10);
    const uptrend = price > sma50 && slope50 !== null && slope50 > 0;
    if (!uptrend) {
      return noEntry("No uptrend backdrop (price below / 50-SMA not rising)");
    }

    const atr = calculateATR(highs, lows, closes, 14) || price * 0.02;
    const volRatio = calculateVolumeRatio(volumes, 20);

    const reasons: string[] = [];
    const risks: string[] = [];
    let entryKind: "BREAKOUT" | "PULLBACK" | null = null;

    // ── Setup A: breakout above prior N-bar high (exclude the current bar) ──
    const priorWindow = highs.slice(-this.breakoutLookback - 1, -1);
    const priorHigh = priorWindow.length ? Math.max(...priorWindow) : Infinity;
    const brokeOut = price > priorHigh;
    if (brokeOut && volRatio >= 1.5) {
      entryKind = "BREAKOUT";
      reasons.push(
        `Breakout above ${this.breakoutLookback}-bar high on ${volRatio.toFixed(1)}x volume`,
      );
    }

    // ── Setup B: pullback to 20-EMA in an uptrend, turning back up ──
    if (!entryKind) {
      const prevClose = closes[closes.length - 2] ?? price;
      const nearEma = Math.abs(price - ema20) / ema20 <= 0.02; // within 2%
      const touchedEma = lows[lows.length - 1] <= ema20 * 1.01;
      const turningUp = price > prevClose;
      if ((nearEma || touchedEma) && turningUp) {
        entryKind = "PULLBACK";
        reasons.push("Pullback to rising 20-EMA, turning up");
      }
    }

    if (!entryKind) return noEntry("No breakout or pullback trigger");

    // ── Risk geometry ──
    // Breakout: stop below the breakout base. Pullback: stop below the EMA/swing low.
    const recentSwingLow = Math.min(...lows.slice(-this.breakoutLookback));
    const atrStop = price - atr * this.atrStopMultiple;
    const stopLoss =
      entryKind === "BREAKOUT"
        ? Math.max(atrStop, priorHigh * 0.98) // just under the broken level
        : Math.max(atrStop, recentSwingLow * 0.99);

    const risk = price - stopLoss;
    if (risk <= 0) return noEntry("Invalid stop geometry");

    // Targets at 2R and 3R (swing-appropriate), enforce min R:R.
    const targets = [price + risk * this.minRewardRisk, price + risk * 3];
    const rr = (targets[0] - price) / risk;
    if (rr < this.minRewardRisk) {
      return noEntry(`Reward:risk ${rr.toFixed(1)} < ${this.minRewardRisk}`);
    }

    if (volRatio < 1.0) risks.push("Below-average volume");

    const riskPct = (risk / price) * 100;
    const score = Math.min(
      100,
      Math.round(
        (entryKind === "BREAKOUT" ? 60 : 50) +
          Math.min(volRatio, 3) * 8 +
          Math.max(0, 12 - riskPct),
      ),
    );

    return {
      enter: true,
      stopLoss,
      targets,
      score,
      maxHoldBars: 20, // ~4 weeks
      reasons,
      risks,
      suggestedTimeframe: "SHORT",
    };
  }
}
