import type { TechnicalIndicators, MACDResult } from "../types/index.js";

export type { TechnicalIndicators, MACDResult };

export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    return 50;
  }

  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));

  const recentGains = gains.slice(-period);
  const recentLosses = losses.slice(-period);

  const avgGain = recentGains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = recentLosses.reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return calculateSMA(prices, prices.length);
  }

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    period = prices.length;
  }

  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calculateMACD(prices: number[]): MACDResult {
  if (prices.length < 26) {
    return { value: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;

  // Calculate MACD line for each point to compute signal EMA
  const macdValues: number[] = [];
  for (let i = 25; i < prices.length; i++) {
    const ema12AtI = calculateEMA(prices.slice(0, i + 1), 12);
    const ema26AtI = calculateEMA(prices.slice(0, i + 1), 26);
    macdValues.push(ema12AtI - ema26AtI);
  }

  const signalLine = calculateEMA(macdValues, 9);

  return {
    value: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  };
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number {
  if (highs.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    trueRanges.push(tr);
  }

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
}

export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2,
) {
  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);

  const squaredDiffs = recentPrices.map((p) => Math.pow(p - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: sma + std * stdDev,
    middle: sma,
    lower: sma - std * stdDev,
  };
}

export function calculateVolumeRatio(
  volumes: number[],
  period: number = 20,
): number {
  if (volumes.length < period + 1) {
    return 1;
  }

  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = calculateSMA(volumes.slice(-period - 1, -1), period);

  return currentVolume / avgVolume;
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
