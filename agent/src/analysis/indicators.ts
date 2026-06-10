import type { TechnicalIndicators, MACDResult } from "../types/index.js";

export type { TechnicalIndicators, MACDResult };

/**
 * Indicator library.
 *
 * Design notes (these matter for correctness — verified against reference defs):
 * - RSI and ATR use **Wilder's smoothing** (RMA), the standard the indicators
 *   were originally defined with. The previous simple-average version was the
 *   "Cutler's" variant and produces materially different values.
 * - MACD is computed in O(n) via a single EMA pass, not O(n²).
 * - Bollinger Bands use the **population** standard deviation (÷N), which is
 *   John Bollinger's own definition — do not "correct" this to sample (÷N-1).
 * - Functions that previously returned a single latest value still do, so
 *   existing callers keep working; *Series variants are added for backtests
 *   and divergence/slope analysis.
 */

// ─── Moving averages ──────────────────────────────────────────

export function calculateSMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) period = prices.length;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calculateEMA(prices: number[], period: number): number {
  const series = calculateEMASeries(prices, period);
  return series.length
    ? series[series.length - 1]
    : calculateSMA(prices, prices.length);
}

/**
 * Full EMA series, seeded with an SMA of the first `period` values.
 * Returned series is aligned so index i corresponds to prices[period-1+i].
 */
export function calculateEMASeries(prices: number[], period: number): number[] {
  if (prices.length < period || period <= 0) {
    return prices.length ? [calculateSMA(prices, prices.length)] : [];
  }
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = calculateSMA(prices.slice(0, period), period);
  out.push(ema);
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * k + ema;
    out.push(ema);
  }
  return out;
}

// ─── RSI (Wilder's smoothing) ─────────────────────────────────

export function calculateRSI(prices: number[], period: number = 14): number {
  const series = calculateRSISeries(prices, period);
  return series.length ? series[series.length - 1] : 50;
}

/** Full Wilder RSI series (one value per bar once warmed up). */
export function calculateRSISeries(
  prices: number[],
  period: number = 14,
): number[] {
  if (prices.length < period + 1) return [];

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++)
    changes.push(prices[i] - prices[i - 1]);

  // Seed with simple averages of the first `period` changes.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    if (c > 0) avgGain += c;
    else avgLoss += -c;
  }
  avgGain /= period;
  avgLoss /= period;

  const out: number[] = [];
  const rsiFrom = (g: number, l: number) =>
    l === 0 ? 100 : 100 - 100 / (1 + g / l);
  out.push(rsiFrom(avgGain, avgLoss));

  // Wilder's recursive smoothing.
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    const gain = c > 0 ? c : 0;
    const loss = c < 0 ? -c : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push(rsiFrom(avgGain, avgLoss));
  }
  return out;
}

// ─── MACD (O(n)) ──────────────────────────────────────────────

export function calculateMACD(prices: number[]): MACDResult {
  if (prices.length < 26) return { value: 0, signal: 0, histogram: 0 };

  const ema12 = calculateEMASeries(prices, 12);
  const ema26 = calculateEMASeries(prices, 26);

  // Align the two EMA series to a common tail length, then difference.
  const n = Math.min(ema12.length, ema26.length);
  const macdLine: number[] = [];
  for (let i = 0; i < n; i++) {
    macdLine.push(ema12[ema12.length - n + i] - ema26[ema26.length - n + i]);
  }

  const value = macdLine[macdLine.length - 1];
  const signalSeries = calculateEMASeries(macdLine, 9);
  const signal = signalSeries.length
    ? signalSeries[signalSeries.length - 1]
    : value;

  return { value, signal, histogram: value - signal };
}

// ─── ATR (Wilder's smoothing) ─────────────────────────────────

function trueRanges(
  highs: number[],
  lows: number[],
  closes: number[],
): number[] {
  const tr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }
  return tr;
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number {
  if (highs.length < period + 1) return 0;
  const tr = trueRanges(highs, lows, closes);

  // Seed with SMA of first `period` true ranges, then Wilder-smooth.
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ─── Bollinger Bands (population stddev — Bollinger's definition) ──

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2,
) {
  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);
  const variance =
    recentPrices.reduce((a, p) => a + (p - sma) ** 2, 0) / recentPrices.length;
  const std = Math.sqrt(variance);
  return { upper: sma + std * stdDev, middle: sma, lower: sma - std * stdDev };
}

export function calculateVolumeRatio(
  volumes: number[],
  period: number = 20,
): number {
  if (volumes.length < period + 1) return 1;
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = calculateSMA(volumes.slice(-period - 1, -1), period);
  return avgVolume === 0 ? 1 : currentVolume / avgVolume;
}

// ─── Series helpers used by strategy engines ──────────────────

/** Percent return over `lookback` bars (e.g. lookback=21 ≈ 1 month on daily). */
export function periodReturn(
  prices: number[],
  lookback: number,
): number | null {
  if (prices.length < lookback + 1) return null;
  const now = prices[prices.length - 1];
  const then = prices[prices.length - 1 - lookback];
  if (!then) return null;
  return ((now - then) / then) * 100;
}

/** How far current price sits below its highest high over `lookback` bars (%). 0 = at the high. */
export function distanceFromHigh(
  values: number[],
  lookback: number,
): number | null {
  if (values.length === 0) return null;
  const window = values.slice(-lookback);
  const hi = Math.max(...window);
  if (!hi) return null;
  const now = values[values.length - 1];
  return ((hi - now) / hi) * 100;
}

/** How far current price sits above its lowest low over `lookback` bars (%). */
export function distanceFromLow(
  values: number[],
  lookback: number,
): number | null {
  if (values.length === 0) return null;
  const window = values.slice(-lookback);
  const lo = Math.min(...window);
  if (!lo) return null;
  const now = values[values.length - 1];
  return ((now - lo) / lo) * 100;
}

/**
 * Slope of an SMA over `slopeBars`, as % change of the MA across that span.
 * Used to confirm "200-day MA trending up" (Minervini criterion 4).
 */
export function smaSlopePct(
  prices: number[],
  period: number,
  slopeBars: number,
): number | null {
  if (prices.length < period + slopeBars) return null;
  const maNow = calculateSMA(prices, period);
  const maThen = calculateSMA(
    prices.slice(0, prices.length - slopeBars),
    period,
  );
  if (!maThen) return null;
  return ((maNow - maThen) / maThen) * 100;
}

export function calculateAllIndicators(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
): TechnicalIndicators {
  return {
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    ema12: calculateEMA(closes, 12),
    ema26: calculateEMA(closes, 26),
    atr: calculateATR(highs, lows, closes, 14),
    bollingerBands: calculateBollingerBands(closes, 20, 2),
    currentPrice: closes[closes.length - 1],
    volume: volumes[volumes.length - 1],
    avgVolume: calculateSMA(volumes, 20),
    volumeRatio: calculateVolumeRatio(volumes, 20),
  };
}
