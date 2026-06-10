/**
 * Sector Analyst — Step 1 & 2 of the investment pipeline
 */

import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";
import type { ZerodhaClient } from "../data/zerodha.js";
import type { SectorData, SectorScanResult } from "../types/index.js";
import { SECTOR_SYMBOLS } from "../config/index.js";

export type { SectorData, SectorScanResult };

const NSE_TOP_SECTORS = Object.keys(SECTOR_SYMBOLS);

export class SectorAnalyst {
  private openai: OpenAI;
  private zerodha: ZerodhaClient;
  private memory?: any;

  constructor(openaiApiKey: string, zerodha: ZerodhaClient, memory?: any) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.zerodha = zerodha;
    this.memory = memory;
  }

  async findHotSectorsAndStocks(): Promise<SectorScanResult> {
    console.log("\n🌐 Step 1: Searching for trending hot sectors...");
    const hotSectorData = await this.getHotSectorsFromAI();

    console.log(`\n📊 Step 2: Finding best stocks per sector...`);
    const hotSectors = await this.getBestStocksPerSector(hotSectorData);

    const allSymbols = Array.from(
      new Set(hotSectors.flatMap((s) => s.symbols)),
    );

    console.log(
      `   ✅ Hot sectors: ${hotSectors.map((s) => s.sector).join(", ")}`,
    );
    console.log(`   ✅ Total stocks to analyze: ${allSymbols.length}`);

    return {
      hotSectors,
      allSymbols,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getHotSectorsFromAI(): Promise<
    Array<{ sector: string; theme: string; trendStrength: number }>
  > {
    let headlines = "";
    try {
      headlines = await this.fetchMarketHeadlines();
      console.log(
        `   Fetched ${headlines.length > 0 ? "real" : "no"} market headlines`,
      );
    } catch {
      console.log("   Using AI knowledge for sector identification");
    }

    const today = new Date().toISOString().split("T")[0];

    const memoryContext = this.memory
      ? `
Previous performance insights:
- Best performing sectors: ${this.memory.bestSetups.slice(0, 3).join(", ") || "None yet"}
- Sectors to avoid: ${this.memory.avoidPatterns.slice(0, 3).join(", ") || "None yet"}
- Win rate: ${(this.memory.winRate * 100).toFixed(0)}% (from ${this.memory.signalsExecuted} executed signals)
${this.memory.learnings.length > 0 ? `- Key learnings: ${this.memory.learnings.slice(0, 2).join("; ")}` : ""}
`
      : "";

    const prompt = `Today is ${today}. You are a senior Indian market strategist.

Available NSE sectors: ${NSE_TOP_SECTORS.join(", ")}

${headlines ? `Recent market headlines:\n${headlines}\n\n` : ""}
${memoryContext}

Based on current macro trends, government policies, global cues, sector rotation patterns in Indian markets${this.memory ? ", and the historical performance insights above" : ""}, identify the TOP 5-6 HOTTEST trending sectors right now that offer the best investment opportunities.

For each sector:
- It must be genuinely trending with strong momentum
- Consider: budget allocations, policy tailwinds, earnings growth, FII/DII flows, global trends
- Rank them by opportunity strength

Return JSON:
{
  "hotSectors": [
    {
      "sector": "<exact sector name from the list>",
      "theme": "<one-line reason why it's hot>",
      "trendStrength": <1-10>
    }
  ]
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content:
            "You are an expert Indian stock market analyst specializing in sector rotation and thematic investing. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000, // Higher for deeper macro analysis
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const sectors: { sector: string; theme: string; trendStrength: number }[] =
      result.hotSectors || [];

    const valid = sectors.filter((s) => SECTOR_SYMBOLS[s.sector]);
    console.log(
      `   AI identified: ${valid.map((s) => `${s.sector} (${s.trendStrength}/10)`).join(", ")}`,
    );

    return valid.slice(0, 6);
  }

  private async getBestStocksPerSector(
    sectorData: Array<{ sector: string; theme: string; trendStrength: number }>,
  ): Promise<SectorData[]> {
    const results: SectorData[] = [];

    for (const sectorInfo of sectorData) {
      const candidates = SECTOR_SYMBOLS[sectorInfo.sector] || [];
      console.log(
        `   Ranking ${candidates.length} stocks in ${sectorInfo.sector}...`,
      );

      const scored: { symbol: string; score: number }[] = [];

      try {
        const quotes = await this.zerodha.getQuotes(candidates);

        for (const symbol of candidates) {
          const quote = quotes[symbol];
          if (!quote) continue;

          let score = 0;

          if (quote.changePercent > 3) score += 30;
          else if (quote.changePercent > 1) score += 20;
          else if (quote.changePercent > 0) score += 10;
          else if (quote.changePercent > -1) score += 5;

          if (quote.volume > 1000000) score += 20;
          else if (quote.volume > 500000) score += 15;
          else if (quote.volume > 100000) score += 10;
          else if (quote.volume > 0) score += 5;

          if (quote.price > 0) score += 10;

          scored.push({ symbol, score });
        }
      } catch (err) {
        candidates.forEach((s) => scored.push({ symbol: s, score: 50 }));
      }

      const enriched = await this.enrichWithHistoricalReturns(scored);

      enriched.sort((a, b) => b.score - a.score);
      const topSymbols = enriched.slice(0, 7).map((s) => s.symbol);

      results.push({
        sector: sectorInfo.sector,
        theme: sectorInfo.theme,
        trendStrength: sectorInfo.trendStrength,
        symbols: topSymbols,
      });
    }

    return results;
  }

  private async enrichWithHistoricalReturns(
    stocks: { symbol: string; score: number }[],
  ): Promise<{ symbol: string; score: number }[]> {
    const enriched = [...stocks];

    await Promise.allSettled(
      enriched.map(async (stock) => {
        try {
          const hist = await this.zerodha.getHistoricalData(stock.symbol, 252);
          if (!hist.closes.length) return;

          const currentPrice = hist.closes[hist.closes.length - 1];

          if (hist.closes.length >= 21) {
            const price1M = hist.closes[hist.closes.length - 21];
            const ret1M = ((currentPrice - price1M) / price1M) * 100;
            if (ret1M > 15) stock.score += 25;
            else if (ret1M > 8) stock.score += 15;
            else if (ret1M > 3) stock.score += 8;
            else if (ret1M < -10) stock.score -= 10;
          }

          if (hist.closes.length >= 252) {
            const price1Y = hist.closes[0];
            const ret1Y = ((currentPrice - price1Y) / price1Y) * 100;
            if (ret1Y > 50) stock.score += 20;
            else if (ret1Y > 25) stock.score += 12;
            else if (ret1Y > 10) stock.score += 6;
          }
        } catch {
          // Skip if data unavailable
        }
      }),
    );

    return enriched;
  }

  private async fetchMarketHeadlines(): Promise<string> {
    try {
      const response = await axios.get(
        "https://economictimes.indiatimes.com/markets/stocks/news",
        {
          timeout: 8000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
      );

      const $ = cheerio.load(response.data);
      const headlines: string[] = [];

      $("h3 a, h2 a, .eachStory h3 a").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20 && text.length < 200) {
          headlines.push(text);
        }
      });

      return headlines.slice(0, 15).join("\n");
    } catch {
      return "";
    }
  }
}
