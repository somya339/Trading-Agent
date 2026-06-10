import type { FundamentalData, FundamentalScore } from "../types/index.js";
import type { FundamentalsProvider } from "../data/fundamentals-provider.js";
import { ScreenerFundamentalsProvider } from "../data/screener-provider.js";
import { SectorBenchmarkCache } from "../data/sector-benchmarks.js";
import type { ZerodhaClient } from "../data/zerodha.js";

export type { FundamentalData, FundamentalScore };

export class FundamentalAnalyzer {
  private cache: Map<string, FundamentalData> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private CACHE_TTL = 24 * 60 * 60 * 1000;
  private sectorBenchmarks = new SectorBenchmarkCache();

  constructor(
    private zerodha: ZerodhaClient | null = null,
    private provider: FundamentalsProvider = new ScreenerFundamentalsProvider(
      parseInt(process.env.SCREENER_REQUEST_DELAY_MS || "450", 10),
    ),
  ) {}

  async getFundamentals(symbol: string): Promise<FundamentalData | null> {
    const cached = this.getCached(symbol);
    if (cached) return cached;

    try {
      const data = await this.fetchFundamentals(symbol);
      this.setCache(symbol, data);
      return data;
    } catch (error) {
      console.error(`Error fetching fundamentals for ${symbol}:`, error);
      return null;
    }
  }

  analyzeFundamentals(data: FundamentalData): FundamentalScore {
    const scores = {
      valuation: this.scoreValuation(data),
      profitability: this.scoreProfitability(data),
      growth: this.scoreGrowth(data),
      health: this.scoreFinancialHealth(data),
      ownership: this.scoreOwnership(data),
    };

    const overallScore =
      scores.valuation * 0.25 +
      scores.profitability * 0.25 +
      scores.growth * 0.2 +
      scores.health * 0.2 +
      scores.ownership * 0.1;

    const analysis = this.generateAnalysis(data, scores);

    return {
      symbol: data.symbol,
      overallScore: Math.round(overallScore),
      ...analysis,
    };
  }

  async analyzeMultiple(symbols: string[]): Promise<FundamentalScore[]> {
    const results: FundamentalScore[] = [];

    for (const symbol of symbols) {
      const data = await this.getFundamentals(symbol);
      if (data) {
        const score = this.analyzeFundamentals(data);
        results.push(score);
      }
    }

    return results;
  }

  private scoreValuation(data: FundamentalData): number {
    let score = 50;

    if (data.pe !== null && data.sectorPE !== null) {
      const peRatio = data.pe / data.sectorPE;
      if (peRatio < 0.7) score += 25;
      else if (peRatio < 0.85) score += 15;
      else if (peRatio < 1.0) score += 5;
      else if (peRatio > 1.5) score -= 20;
      else if (peRatio > 1.2) score -= 10;
    }

    if (data.pb !== null) {
      if (data.pb < 1.5) score += 10;
      else if (data.pb > 5) score -= 10;
    }

    if (data.dividendYield !== null) {
      if (data.dividendYield > 3) score += 10;
      else if (data.dividendYield > 2) score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreProfitability(data: FundamentalData): number {
    let score = 0;

    if (data.roe !== null) {
      if (data.roe > 25) score += 40;
      else if (data.roe > 20) score += 30;
      else if (data.roe > 15) score += 20;
      else if (data.roe > 10) score += 10;
    }

    if (data.netMargin !== null) {
      if (data.netMargin > 20) score += 30;
      else if (data.netMargin > 15) score += 20;
      else if (data.netMargin > 10) score += 10;
      else if (data.netMargin > 5) score += 5;
    }

    if (data.roa !== null) {
      if (data.roa > 15) score += 30;
      else if (data.roa > 10) score += 20;
      else if (data.roa > 5) score += 10;
    }

    return Math.min(100, score);
  }

  private scoreGrowth(data: FundamentalData): number {
    let score = 0;

    if (data.revenueGrowth !== null) {
      if (data.revenueGrowth > 30) score += 35;
      else if (data.revenueGrowth > 20) score += 25;
      else if (data.revenueGrowth > 15) score += 15;
      else if (data.revenueGrowth > 10) score += 10;
      else if (data.revenueGrowth < 0) score -= 15;
    }

    if (data.profitGrowth !== null) {
      if (data.profitGrowth > 30) score += 40;
      else if (data.profitGrowth > 20) score += 30;
      else if (data.profitGrowth > 15) score += 20;
      else if (data.profitGrowth > 10) score += 10;
      else if (data.profitGrowth < 0) score -= 20;
    }

    if (data.epsGrowth !== null) {
      if (data.epsGrowth > 25) score += 25;
      else if (data.epsGrowth > 15) score += 15;
      else if (data.epsGrowth > 10) score += 10;
    }

    return Math.min(100, score);
  }

  private scoreFinancialHealth(data: FundamentalData): number {
    let score = 50;

    if (data.debtToEquity !== null) {
      if (data.debtToEquity < 0.3) score += 30;
      else if (data.debtToEquity < 0.5) score += 20;
      else if (data.debtToEquity < 1.0) score += 10;
      else if (data.debtToEquity > 2.0) score -= 20;
      else if (data.debtToEquity > 1.5) score -= 10;
    }

    if (data.currentRatio !== null) {
      if (data.currentRatio > 2.0) score += 10;
      else if (data.currentRatio > 1.5) score += 5;
      else if (data.currentRatio < 1.0) score -= 15;
    }

    if (data.interestCoverage !== null) {
      if (data.interestCoverage > 10) score += 10;
      else if (data.interestCoverage > 5) score += 5;
      else if (data.interestCoverage < 2) score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreOwnership(data: FundamentalData): number {
    let score = 50;

    if (data.promoterHolding !== null) {
      if (data.promoterHolding > 70) score += 20;
      else if (data.promoterHolding > 50) score += 10;
      else if (data.promoterHolding < 30) score -= 10;
    }

    if (data.promoterChange !== null) {
      if (data.promoterChange > 1) score += 30;
      else if (data.promoterChange > 0.5) score += 20;
      else if (data.promoterChange < -1) score -= 30;
      else if (data.promoterChange < -0.5) score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateAnalysis(
    data: FundamentalData,
    scores: Record<string, number>,
  ): Omit<FundamentalScore, "symbol" | "overallScore"> {
    const strengths: string[] = [];
    const concerns: string[] = [];

    let valuation: "Undervalued" | "Fair" | "Overvalued" = "Fair";
    if (data.pe && data.sectorPE) {
      const peRatio = data.pe / data.sectorPE;
      if (peRatio < 0.85) {
        valuation = "Undervalued";
        strengths.push(
          `Trading below sector P/E (${data.pe.toFixed(1)} vs ${data.sectorPE.toFixed(1)})`,
        );
      } else if (peRatio > 1.2) {
        valuation = "Overvalued";
        concerns.push(
          `Trading above sector P/E (${data.pe.toFixed(1)} vs ${data.sectorPE.toFixed(1)})`,
        );
      }
    }

    let profitability: "Excellent" | "Good" | "Average" | "Poor";
    if (scores.profitability > 75) {
      profitability = "Excellent";
      if (data.roe && data.roe > 20) {
        strengths.push(`Strong ROE of ${data.roe.toFixed(1)}%`);
      }
    } else if (scores.profitability > 60) {
      profitability = "Good";
    } else if (scores.profitability > 40) {
      profitability = "Average";
    } else {
      profitability = "Poor";
      concerns.push("Weak profitability metrics");
    }

    let growth: "High" | "Moderate" | "Low" | "Negative";
    if (data.profitGrowth !== null) {
      if (data.profitGrowth > 20) {
        growth = "High";
        strengths.push(
          `Strong profit growth (${data.profitGrowth.toFixed(1)}% YoY)`,
        );
      } else if (data.profitGrowth > 10) {
        growth = "Moderate";
      } else if (data.profitGrowth > 0) {
        growth = "Low";
      } else {
        growth = "Negative";
        concerns.push(
          `Negative profit growth (${data.profitGrowth.toFixed(1)}%)`,
        );
      }
    } else {
      growth = "Moderate";
    }

    let financialHealth: "Strong" | "Stable" | "Weak";
    if (scores.health > 70) {
      financialHealth = "Strong";
      if (data.debtToEquity && data.debtToEquity < 0.5) {
        strengths.push(`Low debt (D/E: ${data.debtToEquity.toFixed(2)})`);
      }
    } else if (scores.health > 50) {
      financialHealth = "Stable";
    } else {
      financialHealth = "Weak";
      if (data.debtToEquity && data.debtToEquity > 1.5) {
        concerns.push(`High debt (D/E: ${data.debtToEquity.toFixed(2)})`);
      }
    }

    if (data.promoterChange && data.promoterChange > 0.5) {
      strengths.push(
        `Promoter buying (${data.promoterChange.toFixed(1)}% increase)`,
      );
    } else if (data.promoterChange && data.promoterChange < -0.5) {
      concerns.push(
        `Promoter selling (${Math.abs(data.promoterChange).toFixed(1)}% decrease)`,
      );
    }

    const recommendation = this.generateRecommendation(
      scores,
      valuation,
      profitability,
      growth,
      financialHealth,
      concerns,
    );

    return {
      valuation,
      profitability,
      growth,
      financialHealth,
      strengths,
      concerns,
      recommendation,
    };
  }

  private generateRecommendation(
    scores: Record<string, number>,
    valuation: string,
    profitability: string,
    growth: string,
    financialHealth: string,
    concerns: string[] = [],
  ): string {
    const avgScore =
      (scores.valuation +
        scores.profitability +
        scores.growth +
        scores.health) /
      4;

    if (avgScore > 75) {
      return `Fundamentally strong company with ${valuation.toLowerCase()} valuation and ${profitability.toLowerCase()} profitability. ${growth} growth trajectory. Excellent for ${growth === "High" ? "growth" : "value"} investors.`;
    } else if (avgScore > 60) {
      return `Solid fundamentals with ${profitability.toLowerCase()} profitability. ${valuation === "Undervalued" ? "Attractive" : valuation} valuation. Suitable for ${growth === "High" || growth === "Moderate" ? "moderate risk" : "conservative"} investors.`;
    } else if (avgScore > 40) {
      return `Average fundamentals. ${concerns.length > 0 ? "Key concerns: " + concerns[0] + ". " : ""}Best suited for traders rather than long-term investors.`;
    } else {
      return `Weak fundamentals with ${concerns.length > 0 ? concerns.join(", ").toLowerCase() : "multiple concerns"}. High risk for investors.`;
    }
  }

  private async fetchFundamentals(symbol: string): Promise<FundamentalData> {
    const providerData = await this.provider.fetchFundamentals(symbol);
    if (!providerData) {
      throw new Error(`No fundamental data for ${symbol}`);
    }

    const { sectorPE, sectorPB } = await this.sectorBenchmarks.getBenchmarks(
      symbol,
      this.provider,
    );

    let marketCap = providerData.marketCap ?? 0;
    let pe = providerData.pe ?? null;
    let pb = providerData.pb ?? null;

    if (this.zerodha) {
      try {
        const quote = await this.zerodha.getQuote(symbol);
        const screenerPrice = providerData.currentPrice;

        if (
          screenerPrice != null &&
          screenerPrice > 0 &&
          marketCap > 0 &&
          quote.price > 0
        ) {
          const priceRatio = quote.price / screenerPrice;
          marketCap = Math.round(marketCap * priceRatio);
          if (pe != null) pe = round(pe / priceRatio, 2);
          if (pb != null) pb = round(pb / priceRatio, 2);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err);
        console.warn(`   Zerodha quote skipped for ${symbol}: ${message}`);
      }
    }

    return {
      symbol,
      pe,
      pb,
      marketCap: marketCap > 0 ? marketCap : 0,
      dividendYield: providerData.dividendYield ?? null,
      roe: providerData.roe ?? null,
      roa: providerData.roa ?? null,
      netMargin: providerData.netMargin ?? null,
      revenueGrowth: providerData.revenueGrowth ?? null,
      profitGrowth: providerData.profitGrowth ?? null,
      epsGrowth: providerData.epsGrowth ?? providerData.profitGrowth ?? null,
      debtToEquity: providerData.debtToEquity ?? null,
      currentRatio: providerData.currentRatio ?? null,
      interestCoverage: providerData.interestCoverage ?? null,
      promoterHolding: providerData.promoterHolding ?? null,
      promoterChange: providerData.promoterChange ?? null,
      sectorPE,
      sectorPB,
    };
  }

  private getCached(symbol: string): FundamentalData | null {
    const expiry = this.cacheExpiry.get(symbol);
    if (!expiry || Date.now() > expiry) {
      return null;
    }
    return this.cache.get(symbol) || null;
  }

  private setCache(symbol: string, data: FundamentalData): void {
    this.cache.set(symbol, data);
    this.cacheExpiry.set(symbol, Date.now() + this.CACHE_TTL);
  }
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
