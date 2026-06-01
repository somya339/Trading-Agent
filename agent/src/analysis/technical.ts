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

export type TechnicalResult = {
  symbol: string;
  alignmentScore: number;
  mtf: MultiTimeframeIndicators;
  price: number;
  changePercent: number;
  volume: number;
};

export class TechnicalPipeline {
  constructor(private zerodha: ZerodhaClient) {}

  async runMultiTimeframeTechnical(
    symbols: string[],
  ): Promise<TechnicalResult[]> {
    const results: TechnicalResult[] = [];

    for (const symbol of symbols) {
      try {
        const [hourly, daily, weekly] = await Promise.all([
          this.zerodha.getHistoricalData(symbol, 30, "60minute"),
          this.zerodha.getHistoricalData(symbol, 200, "day"),
          this.zerodha.getHistoricalData(symbol, 500, "week"),
        ]);

        if (!daily.closes.length) continue;

        const price = daily.closes[daily.closes.length - 1];
        const prevClose = daily.closes[daily.closes.length - 2] || price;
        const changePercent = ((price - prevClose) / prevClose) * 100;
        const volume = daily.volumes[daily.volumes.length - 1] || 0;

        const dailyIndicators = calculateAllIndicators(
          daily.closes,
          daily.highs,
          daily.lows,
          daily.volumes,
        );

        const dailyTrend = this.detectTrend(
          daily.closes,
          dailyIndicators.sma20,
          dailyIndicators.sma50,
        );

        let hourlyRsi = 50;
        let hourlyMacd = { value: 0, signal: 0, histogram: 0 };
        let hourlySma20 = price;
        let hourlyEma12 = price;
        let hourlyAtr = price * 0.02;
        let hourlyTrend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";

        if (hourly.closes.length >= 20) {
          hourlyRsi = calculateRSI(hourly.closes, 14);
          hourlyMacd = calculateMACD(hourly.closes);
          hourlySma20 = calculateSMA(hourly.closes, 20);
          hourlyEma12 = calculateEMA(hourly.closes, 12);
          hourlyAtr = calculateATR(
            hourly.highs,
            hourly.lows,
            hourly.closes,
            14,
          );
          hourlyTrend = this.detectTrend(
            hourly.closes,
            hourlySma20,
            hourlySma20,
          );
        }

        let weeklyRsi = 50;
        let weeklySma20 = price;
        let weeklySma50 = price;
        let weeklyAtr = price * 0.03;
        let weeklyTrend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";

        if (weekly.closes.length >= 20) {
          weeklyRsi = calculateRSI(weekly.closes, 14);
          weeklySma20 = calculateSMA(weekly.closes, 20);
          weeklySma50 = calculateSMA(
            weekly.closes,
            Math.min(50, weekly.closes.length),
          );
          weeklyAtr = calculateATR(
            weekly.highs,
            weekly.lows,
            weekly.closes,
            14,
          );
          weeklyTrend = this.detectTrend(
            weekly.closes,
            weeklySma20,
            weeklySma50,
          );
        }

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

        const { alignmentScore, suggestedTimeframe } = this.scoreAlignment(mtf);
        mtf.alignmentScore = alignmentScore;
        mtf.suggestedTimeframe = suggestedTimeframe;

        results.push({
          symbol,
          alignmentScore,
          mtf,
          price,
          changePercent,
          volume,
        });
        console.log(
          `   ${symbol}: daily ${dailyTrend} | weekly ${weeklyTrend} | RSI ${dailyIndicators.rsi.toFixed(0)} | alignment ${alignmentScore}`,
        );
      } catch {
        continue;
      }
    }

    return results;
  }

  scoreAlignment(mtf: MultiTimeframeIndicators): {
    alignmentScore: number;
    suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
  } {
    let score = 0;

    const bullish = [
      mtf.hourly.trend,
      mtf.daily.trend,
      mtf.weekly.trend,
    ].filter((t) => t === "UP").length;

    if (bullish === 3) score += 40;
    else if (bullish === 2) score += 25;
    else if (bullish === 1) score += 10;

    if (mtf.daily.rsi < 70 && mtf.daily.rsi > 30) score += 20;
    else if (mtf.daily.rsi < 80) score += 10;

    if (mtf.daily.macd.value > mtf.daily.macd.signal) score += 15;

    if (mtf.daily.volumeRatio > 1.5) score += 15;
    else if (mtf.daily.volumeRatio > 1.0) score += 8;

    const currentPrice = mtf.daily.currentPrice;
    if (currentPrice > mtf.daily.sma20 && currentPrice > mtf.daily.sma50)
      score += 10;

    let suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
    if (
      mtf.weekly.trend === "UP" &&
      mtf.daily.trend === "UP" &&
      mtf.hourly.trend === "UP"
    ) {
      suggestedTimeframe = "LONG";
    } else if (mtf.weekly.trend === "UP" && mtf.daily.trend === "UP") {
      suggestedTimeframe = "MEDIUM";
    } else {
      suggestedTimeframe = "SHORT";
    }

    return { alignmentScore: Math.min(score, 100), suggestedTimeframe };
  }

  detectTrend(
    closes: number[],
    smaShort: number,
    smaLong: number,
  ): "UP" | "DOWN" | "SIDEWAYS" {
    if (closes.length < 5) return "SIDEWAYS";

    const current = closes[closes.length - 1];
    const fivePeriodAgo = closes[closes.length - 5];
    const momentum = ((current - fivePeriodAgo) / fivePeriodAgo) * 100;

    if (current > smaShort && smaShort > smaLong && momentum > 0.5) return "UP";
    if (current < smaShort && smaShort < smaLong && momentum < -0.5)
      return "DOWN";
    return "SIDEWAYS";
  }
}
