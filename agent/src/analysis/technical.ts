import type { MultiTimeframeIndicators } from "../types/index.js";
import type { ZerodhaClient } from "../data/zerodha.js";
import {
  calculateAllIndicators,
  calculateRSI,
  calculateMACD,
  calculateSMA,
  calculateEMA,
  calculateATR,
} from "./indicators.js";

// ---------------------------------------------------------------------------
// Types — extended but backward-compatible with your existing MultiTimeframeIndicators
// ---------------------------------------------------------------------------

export type TechnicalResult = {
  symbol: string;
  alignmentScore: number; // now −100 to +100 (negative = bearish setup)
  direction: "LONG" | "SHORT" | "NEUTRAL";
  mtf: MultiTimeframeIndicators;
  price: number;
  changePercent: number;
  volume: number;
  // New fields — safe to ignore if downstream code doesn't use them yet
  supertrend: { trend: "UP" | "DOWN"; upperBand: number; lowerBand: number };
  pivotPoints: PivotPoints;
  proximity52wHigh: number; // percentage: 97.3 means price is 97.3% of 52w high
  proximity52wLow: number;
  bbSqueeze: boolean;
};

export type PivotPoints = {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
};

// ---------------------------------------------------------------------------
// Local indicator helpers (no changes to your indicators.ts needed)
// ---------------------------------------------------------------------------

function calcPivotPoints(
  high: number,
  low: number,
  close: number,
): PivotPoints {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

function calcSupertrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 10,
  multiplier = 3,
): { trend: "UP" | "DOWN"; upperBand: number; lowerBand: number } {
  if (closes.length < period + 1) {
    const price = closes[closes.length - 1];
    return { trend: "UP", upperBand: price * 1.03, lowerBand: price * 0.97 };
  }

  const atr = calculateATR(highs, lows, closes, period);
  const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  const trend = closes[closes.length - 1] > lowerBand ? "UP" : "DOWN";
  return { trend, upperBand, lowerBand };
}

/**
 * SMA slope as % change over `lookback` candles — tells you whether the
 * average is accelerating or decelerating.
 */
function smaSlope(closes: number[], period: number, lookback = 5): number {
  if (closes.length < period + lookback) return 0;
  const recent = calculateSMA(closes, period);
  const prior = calculateSMA(closes.slice(0, -lookback), period);
  return ((recent - prior) / prior) * 100;
}

/**
 * Higher-highs / higher-lows structure detection over the last `window` candles.
 * Returns 1 for bullish structure, -1 for bearish, 0 for mixed.
 */
function hhhlStructure(
  highs: number[],
  lows: number[],
  window = 10,
): 1 | -1 | 0 {
  if (highs.length < window) return 0;
  const h = highs.slice(-window);
  const l = lows.slice(-window);
  const half = Math.floor(window / 2);
  const hhhl = h[window - 1] > h[half - 1] && l[window - 1] > l[half - 1];
  const lllh = h[window - 1] < h[half - 1] && l[window - 1] < l[half - 1];
  if (hhhl) return 1;
  if (lllh) return -1;
  return 0;
}

/**
 * Stochastic RSI — catches divergences that plain RSI misses.
 * Returns a value 0–100 (above 80 = overbought, below 20 = oversold).
 */
function calcStochRSI(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
): number {
  if (closes.length < rsiPeriod + stochPeriod) return 50;

  // Build a rolling RSI series
  const rsiSeries: number[] = [];
  for (let i = stochPeriod; i <= closes.length; i++) {
    rsiSeries.push(calculateRSI(closes.slice(0, i), rsiPeriod));
  }
  if (rsiSeries.length < stochPeriod) return 50;

  const window = rsiSeries.slice(-stochPeriod);
  const minRsi = Math.min(...window);
  const maxRsi = Math.max(...window);
  if (maxRsi === minRsi) return 50;
  return ((rsiSeries[rsiSeries.length - 1] - minRsi) / (maxRsi - minRsi)) * 100;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

export class TechnicalPipeline {
  constructor(private zerodha: ZerodhaClient) {}

  // ── Public entry point ────────────────────────────────────────────────────

  async runMultiTimeframeTechnical(
    symbols: string[],
    concurrency = 5, // tune down if Zerodha rate-limits you
  ): Promise<TechnicalResult[]> {
    // Process `concurrency` symbols in parallel instead of sequentially.
    // This keeps the outer loop fast without hammering the Zerodha API.
    const results: TechnicalResult[] = [];
    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map((s) => this.analyseSymbol(s)),
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
        else if (r.status === "rejected")
          console.warn("[TechnicalPipeline] symbol failed:", r.reason);
      }
    }
    return results;
  }

  // ── Per-symbol analysis ───────────────────────────────────────────────────

  private async analyseSymbol(symbol: string): Promise<TechnicalResult | null> {
    try {
      const [hourly, daily, weekly] = await Promise.all([
        this.zerodha.getHistoricalData(symbol, 30, "60minute"),
        this.zerodha.getHistoricalData(symbol, 252, "day"), // full year for 52w
        this.zerodha.getHistoricalData(symbol, 500, "week"),
      ]);

      if (!daily.closes.length) return null;

      const price = daily.closes[daily.closes.length - 1];
      const prevClose = daily.closes[daily.closes.length - 2] ?? price;
      const changePercent = ((price - prevClose) / prevClose) * 100;
      const volume = daily.volumes[daily.volumes.length - 1] ?? 0;

      // ── Daily indicators ─────────────────────────────────────────────────
      const dailyIndicators = calculateAllIndicators(
        daily.closes,
        daily.highs,
        daily.lows,
        daily.volumes,
      );

      const dailyTrend = this.detectTrend(
        daily.closes,
        daily.highs,
        daily.lows,
        dailyIndicators.sma20,
        dailyIndicators.sma50,
      );

      const dailyStochRsi = calcStochRSI(daily.closes);

      // ── 52-week high / low ───────────────────────────────────────────────
      const high52w = Math.max(...daily.highs);
      const low52w = Math.min(...daily.lows);
      const proximity52wHigh = (price / high52w) * 100;
      const proximity52wLow = ((price - low52w) / low52w) * 100;

      // ── Bollinger Band squeeze detection ─────────────────────────────────
      const { upper, lower, middle } = dailyIndicators.bollingerBands;
      const bbWidth = (upper - lower) / (middle || 1);
      const bbSqueeze = bbWidth < 0.06; // tight bands → breakout brewing

      // ── Supertrend (daily) ───────────────────────────────────────────────
      const supertrend = calcSupertrend(daily.highs, daily.lows, daily.closes);

      // ── Pivot points (yesterday's candle) ────────────────────────────────
      const yHigh =
        daily.highs[daily.highs.length - 2] ??
        daily.highs[daily.highs.length - 1];
      const yLow =
        daily.lows[daily.lows.length - 2] ?? daily.lows[daily.lows.length - 1];
      const yClose = daily.closes[daily.closes.length - 2] ?? price;
      const pivotPoints = calcPivotPoints(yHigh, yLow, yClose);

      // ── Hourly indicators ────────────────────────────────────────────────
      let hourlyRsi = 50,
        hourlyStochRsi = 50;
      let hourlyMacd = { value: 0, signal: 0, histogram: 0 };
      let hourlySma20 = price,
        hourlyEma12 = price,
        hourlyAtr = price * 0.02;
      let hourlyTrend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";
      let hourlySupertrend = calcSupertrend([], [], []);

      if (hourly.closes.length >= 20) {
        hourlyRsi = calculateRSI(hourly.closes, 14);
        hourlyStochRsi = calcStochRSI(hourly.closes);
        hourlyMacd = calculateMACD(hourly.closes);
        hourlySma20 = calculateSMA(hourly.closes, 20);
        hourlyEma12 = calculateEMA(hourly.closes, 12);
        hourlyAtr = calculateATR(hourly.highs, hourly.lows, hourly.closes, 14);
        hourlyTrend = this.detectTrend(
          hourly.closes,
          hourly.highs,
          hourly.lows,
          hourlySma20,
          hourlySma20,
        );
        hourlySupertrend = calcSupertrend(
          hourly.highs,
          hourly.lows,
          hourly.closes,
        );
      }

      // ── Weekly indicators ────────────────────────────────────────────────
      let weeklyRsi = 50;
      let weeklySma20 = price,
        weeklySma50 = price,
        weeklyAtr = price * 0.03;
      let weeklyTrend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";
      let weeklyVolumeRatio = 1;

      if (weekly.closes.length >= 20) {
        weeklyRsi = calculateRSI(weekly.closes, 14);
        weeklySma20 = calculateSMA(weekly.closes, 20);
        weeklySma50 = calculateSMA(
          weekly.closes,
          Math.min(50, weekly.closes.length),
        );
        weeklyAtr = calculateATR(weekly.highs, weekly.lows, weekly.closes, 14);
        weeklyTrend = this.detectTrend(
          weekly.closes,
          weekly.highs,
          weekly.lows,
          weeklySma20,
          weeklySma50,
        );

        // Weekly volume ratio — avg of last 4 weeks vs avg of prior 12
        if (weekly.volumes.length >= 16) {
          const recent4 =
            weekly.volumes.slice(-4).reduce((a, b) => a + b, 0) / 4;
          const prior12 =
            weekly.volumes.slice(-16, -4).reduce((a, b) => a + b, 0) / 12;
          weeklyVolumeRatio = prior12 > 0 ? recent4 / prior12 : 1;
        }
      }

      // ── Assemble MTF object (same shape as before — no breaking changes) ─
      const mtf: MultiTimeframeIndicators = {
        hourly: {
          rsi: hourlyRsi,
          macd: hourlyMacd,
          sma20: hourlySma20,
          ema12: hourlyEma12,
          atr: hourlyAtr,
          trend: hourlyTrend,
        },
        daily: {
          rsi: dailyIndicators.rsi,
          macd: dailyIndicators.macd,
          sma20: dailyIndicators.sma20,
          sma50: dailyIndicators.sma50,
          ema12: dailyIndicators.ema12,
          ema26: dailyIndicators.ema26,
          bollingerBands: dailyIndicators.bollingerBands,
          atr: dailyIndicators.atr,
          volumeRatio: dailyIndicators.volumeRatio,
          trend: dailyTrend,
          currentPrice: price,
        },
        weekly: {
          rsi: weeklyRsi,
          sma20: weeklySma20,
          sma50: weeklySma50,
          atr: weeklyAtr,
          trend: weeklyTrend,
        },
        alignmentScore: 0,
        suggestedTimeframe: "MEDIUM",
      };

      const { alignmentScore, suggestedTimeframe, direction } =
        this.scoreAlignment(
          mtf,
          dailyStochRsi,
          hourlyStochRsi,
          weeklyVolumeRatio,
          supertrend,
          hourlySupertrend,
          proximity52wHigh,
          bbSqueeze,
          bbWidth,
        );

      mtf.alignmentScore = alignmentScore;
      mtf.suggestedTimeframe = suggestedTimeframe;

      console.log(
        `   ${symbol}: daily ${dailyTrend} | weekly ${weeklyTrend} | RSI ${dailyIndicators.rsi.toFixed(0)}` +
          ` | StochRSI ${dailyStochRsi.toFixed(0)} | ST ${supertrend.trend}` +
          ` | 52wH ${proximity52wHigh.toFixed(1)}% | score ${alignmentScore} (${direction})`,
      );

      return {
        symbol,
        alignmentScore,
        direction,
        mtf,
        price,
        changePercent,
        volume,
        supertrend,
        pivotPoints,
        proximity52wHigh,
        proximity52wLow,
        bbSqueeze,
      };
    } catch (err) {
      console.warn(
        `[TechnicalPipeline] ${symbol} failed:`,
        (err as Error).message,
      );
      return null;
    }
  }

  // ── Scoring — now bidirectional (−100 bullish short → +100 strong long) ──

  scoreAlignment(
    mtf: MultiTimeframeIndicators,
    dailyStochRsi = 50,
    hourlyStochRsi = 50,
    weeklyVolumeRatio = 1,
    supertrend = { trend: "UP" as "UP" | "DOWN", upperBand: 0, lowerBand: 0 },
    hourlySupertrend = {
      trend: "UP" as "UP" | "DOWN",
      upperBand: 0,
      lowerBand: 0,
    },
    proximity52wHigh = 80,
    bbSqueeze = false,
    bbWidth = 0.1,
  ): {
    alignmentScore: number;
    suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
    direction: "LONG" | "SHORT" | "NEUTRAL";
  } {
    let score = 0;
    const currentPrice = mtf.daily.currentPrice;

    // ── 1. Multi-timeframe trend alignment (±40) ──────────────────────────
    const trends = [mtf.hourly.trend, mtf.daily.trend, mtf.weekly.trend];
    const bullish = trends.filter((t) => t === "UP").length;
    const bearish = trends.filter((t) => t === "DOWN").length;

    if (bullish === 3) score += 40;
    else if (bullish === 2) score += 22;
    else if (bullish === 1) score += 8;
    if (bearish === 3) score -= 40;
    else if (bearish === 2) score -= 22;
    else if (bearish === 1) score -= 8;

    // ── 2. Supertrend confirmation (±15) ─────────────────────────────────
    if (supertrend.trend === "UP") score += 10;
    else if (supertrend.trend === "DOWN") score -= 10;
    if (hourlySupertrend.trend === "UP") score += 5;
    else if (hourlySupertrend.trend === "DOWN") score -= 5;

    // ── 3. RSI — differentiated thresholds (±20) ─────────────────────────
    const rsi = mtf.daily.rsi;
    const wRsi = mtf.weekly.rsi;

    // Oversold bounce setup (one of the best Indian market setups)
    if (wRsi < 35 && rsi < 40) score += 20;
    // Strong momentum zone
    else if (rsi > 50 && rsi < 65) score += 15;
    // Uptrend continuation — high RSI is OK if weekly is bullish
    else if (rsi >= 65 && rsi < 78 && mtf.weekly.trend === "UP") score += 8;
    // Overbought warning
    else if (rsi >= 78) score -= 10;

    // Oversold extreme (bearish confirmation)
    if (wRsi > 72 && rsi > 70) score -= 15;

    // ── 4. StochRSI (±10) ────────────────────────────────────────────────
    if (dailyStochRsi < 20 && hourlyStochRsi < 30)
      score += 10; // both oversold
    else if (dailyStochRsi > 80 && hourlyStochRsi > 70)
      score -= 10; // both overbought
    else if (dailyStochRsi < 30) score += 5;
    else if (dailyStochRsi > 70) score -= 5;

    // ── 5. MACD (±10) ────────────────────────────────────────────────────
    const macd = mtf.daily.macd;
    if (macd.value > macd.signal && macd.histogram > 0) score += 10;
    else if (macd.value > macd.signal) score += 5;
    if (macd.value < macd.signal && macd.histogram < 0) score -= 10;
    else if (macd.value < macd.signal) score -= 5;

    // ── 6. Volume confirmation — daily + weekly (±15) ────────────────────
    const dvr = mtf.daily.volumeRatio;
    if (dvr > 1.5 && weeklyVolumeRatio > 1.2)
      score += 15; // both timeframes
    else if (dvr > 1.5) score += 10;
    else if (dvr > 1.0) score += 5;
    else if (dvr < 0.7) score -= 5; // low volume — weak move

    // ── 7. Price vs moving averages (±10) ────────────────────────────────
    if (currentPrice > mtf.daily.sma20 && currentPrice > mtf.daily.sma50)
      score += 10;
    else if (currentPrice > mtf.daily.sma50) score += 5;
    if (currentPrice < mtf.daily.sma20 && currentPrice < mtf.daily.sma50)
      score -= 10;
    else if (currentPrice < mtf.daily.sma50) score -= 5;

    // ── 8. Bollinger Band signals (±15) ──────────────────────────────────
    const { upper, lower, middle } = mtf.daily.bollingerBands;
    if (currentPrice < lower && rsi < 40)
      score += 15; // mean-reversion long
    else if (currentPrice > upper && rsi > 65) score -= 12; // overbought extension
    if (bbSqueeze) score += 5; // breakout brewing
    // Wide bands = high volatility, be cautious
    if (bbWidth > 0.15) score -= 5;

    // ── 9. 52-week high proximity (±10) ──────────────────────────────────
    // Near 52w high + strong volume = breakout candidate
    if (proximity52wHigh >= 95 && dvr > 1.5) score += 10;
    else if (proximity52wHigh >= 90) score += 5;
    // Deep value zone near 52w low (mean reversion)
    else if (proximity52wHigh < 60 && wRsi < 40) score += 8;

    // ── Derive direction and timeframe ────────────────────────────────────
    const direction: "LONG" | "SHORT" | "NEUTRAL" =
      score > 15 ? "LONG" : score < -15 ? "SHORT" : "NEUTRAL";

    // Timeframe is now decoupled from weekly bias — short trades can work
    // in any weekly trend if hourly + daily are aligned
    let suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
    if (
      mtf.weekly.trend === "UP" &&
      mtf.daily.trend === "UP" &&
      mtf.hourly.trend === "UP" &&
      score > 50
    ) {
      suggestedTimeframe = "LONG";
    } else if (
      (mtf.daily.trend === "UP" && mtf.hourly.trend === "UP") ||
      (mtf.daily.trend === "DOWN" && mtf.hourly.trend === "DOWN")
    ) {
      suggestedTimeframe = "MEDIUM";
    } else {
      suggestedTimeframe = "SHORT";
    }

    return {
      alignmentScore: Math.max(-100, Math.min(score, 100)),
      suggestedTimeframe,
      direction,
    };
  }

  // ── Trend detection — HH/HL structure + SMA slope + momentum ─────────────

  detectTrend(
    closes: number[],
    highs: number[],
    lows: number[],
    smaShort: number,
    smaLong: number,
  ): "UP" | "DOWN" | "SIDEWAYS" {
    if (closes.length < 10) return "SIDEWAYS";

    const current = closes[closes.length - 1];

    // 10-candle momentum
    const momentum =
      ((current - closes[closes.length - 10]) / closes[closes.length - 10]) *
      100;

    // SMA slope over last 5 candles
    const slope = smaSlope(closes, 20, 5);

    // Price structure
    const structure = highs.length >= 10 ? hhhlStructure(highs, lows, 10) : 0;

    const bullConditions =
      structure === 1 &&
      current > smaShort &&
      smaShort >= smaLong &&
      slope > 0.1 &&
      momentum > 0.8;

    const bearConditions =
      structure === -1 &&
      current < smaShort &&
      smaShort <= smaLong &&
      slope < -0.1 &&
      momentum < -0.8;

    if (bullConditions) return "UP";
    if (bearConditions) return "DOWN";
    return "SIDEWAYS";
  }
}
