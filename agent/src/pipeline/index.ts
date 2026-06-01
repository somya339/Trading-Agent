/**
 * Investment Opportunity Finder — Sequential 5-Step Pipeline
 *
 * Step 1: AI identifies trending hot sectors (internet search + AI reasoning)
 * Step 2: Find best-performing stocks per sector (1W, 1M, 1Y returns)
 * Step 3: Multi-timeframe technical analysis (1hr, 1day, 1week candles)
 * Step 4: Fundamental analysis (P/E, ROE, debt, growth)
 * Step 5: News scraping + AI sentiment analysis
 *
 * Output: Investment signals written to trades.json + memory.json
 */

import { config } from "../config/index.js";
import type {
  InvestmentSignal,
  TradingMemory,
  MultiTimeframeIndicators,
} from "../types/index.js";
import { ZerodhaClient } from "../data/zerodha.js";
import { NewsScraperAgent } from "../data/news-scraper.js";
import { SectorAnalyst } from "../analysis/sector-analyst.js";
import { FundamentalAnalyzer } from "../analysis/fundamentals.js";
import { TechnicalPipeline } from "../analysis/technical.js";
import { SentimentAnalyzer } from "../analysis/sentiment.js";
import { ZerodhaWatchlistManager } from "../watchlist/manager.js";
import {
  saveSignals,
  loadHistory,
  saveMemory,
  loadMemory,
} from "../utils/storage.js";
import { sleep } from "openai/core.js";

export class InvestmentAgent {
  private zerodha: ZerodhaClient;
  private sectorAnalyst: SectorAnalyst;
  private fundamentals: FundamentalAnalyzer;
  private technicalPipeline: TechnicalPipeline;
  private sentimentAnalyzer: SentimentAnalyzer;
  private memory: TradingMemory;
  private watchlistManager: ZerodhaWatchlistManager | null;

  constructor() {
    this.zerodha = new ZerodhaClient(
      config.zerodha.apiKey,
      config.zerodha.accessToken,
    );
    this.memory = this.emptyMemory();
    this.sectorAnalyst = new SectorAnalyst(
      config.openai.apiKey,
      this.zerodha,
      this.memory,
    );
    this.fundamentals = new FundamentalAnalyzer(this.zerodha);
    const newsScraper = new NewsScraperAgent();
    this.technicalPipeline = new TechnicalPipeline(this.zerodha);
    this.sentimentAnalyzer = new SentimentAnalyzer(
      config.openai.apiKey,
      newsScraper,
      this.memory,
    );
    const enctoken = process.env.ZERODHA_ENCTOKEN;
    const publicToken = process.env.ZERODHA_PUBLIC_TOKEN;
    const userId = process.env.ZERODHA_USER_ID;
    const kfSession = process.env.ZERODHA_KF_SESSION;
    this.watchlistManager =
      enctoken && publicToken && userId
        ? new ZerodhaWatchlistManager(
            enctoken,
            publicToken,
            userId,
            kfSession,
          )
        : null;
    if (this.watchlistManager) {
      console.log("📋 Zerodha watchlist manager ready");
    } else {
      console.log(
        "💡 Tip: Set ZERODHA_ENCTOKEN, ZERODHA_PUBLIC_TOKEN, ZERODHA_USER_ID in .env to auto-create watchlists",
      );
    }
  }

  async run() {
    console.log("\n🚀 Investment Opportunity Finder — 5-Step Pipeline\n");
    console.log("═".repeat(60));

    await this.zerodha.initialize();
    await this.initMemory();

    while (true) {
      try {
        await this.runPipeline();

        const nextRunTime = new Date(
          Date.now() + config.runIntervalMinutes * 60 * 1000,
        );
        console.log(
          `\n⏰ Next run scheduled at: ${nextRunTime.toLocaleTimeString()}`,
        );
        console.log(`   Waiting ${config.runIntervalMinutes} minutes...\n`);

        await sleep(config.runIntervalMinutes * 60 * 1000);
      } catch (error: any) {
        console.error(`\n❌ Pipeline error: ${error.message}`);
        console.log(`   Retrying in ${config.runIntervalMinutes} minutes...\n`);
        await sleep(config.runIntervalMinutes * 60 * 1000);
      }
    }
  }

  private async runPipeline() {
    const runStartTime = new Date();
    console.log(
      `\n╔══ Pipeline Run Started: ${runStartTime.toLocaleString()} ══╗`,
    );

    // ── Step 1 & 2: Hot sectors + best stocks ──────────────────
    console.log("\n╔══ STEP 1 & 2: Sector Discovery ══╗");
    const sectorResult = await this.sectorAnalyst.findHotSectorsAndStocks();
    const candidateSymbols = sectorResult.allSymbols;
    const sectorThemeMap: Record<string, string> = {};
    const sectorNameMap: Record<string, string> = {};
    for (const sec of sectorResult.hotSectors) {
      for (const sym of sec.symbols) {
        sectorThemeMap[sym] = sec.theme;
        sectorNameMap[sym] = sec.sector;
      }
    }

    // ── Step 3: Multi-timeframe technical analysis ─────────────
    console.log("\n╔══ STEP 3: Multi-Timeframe Technical Analysis ══╗");
    console.log(
      `   Analyzing ${candidateSymbols.length} stocks across 1hr / 1day / 1week candles...`,
    );
    const technicalResults =
      await this.technicalPipeline.runMultiTimeframeTechnical(candidateSymbols);

    const technicallyValid = technicalResults.filter(
      (r) => r.alignmentScore >= 40 && r.mtf.daily.trend !== "DOWN",
    );
    console.log(
      `   ✅ ${technicallyValid.length} stocks passed technical filter`,
    );

    // ── Step 4: Fundamental analysis ──────────────────────────
    console.log("\n╔══ STEP 4: Fundamental Analysis ══╗");
    const fundamentalResults = await this.runFundamentals(
      technicallyValid.map((r) => r.symbol),
    );

    // ── Step 5: News scraping + AI sentiment ──────────────────
    console.log("\n╔══ STEP 5: News & Sentiment Analysis ══╗");
    const sentimentResults = await this.sentimentAnalyzer.runNewsSentiment(
      technicallyValid.map((r) => r.symbol),
    );

    // ── Combine all analysis → generate signals ───────────────
    console.log("\n📊 Combining analysis to generate investment signals...");
    const signals = await this.buildSignals(
      technicallyValid,
      fundamentalResults,
      sentimentResults,
      sectorThemeMap,
      sectorNameMap,
    );

    signals.sort((a, b) => b.overallScore - a.overallScore);
    const topSignals = signals.slice(0, config.maxSignals);

    // ── Zerodha Watchlist (before dashboard writes — avoids nodemon restart mid-add)
    const watchlistCandidates = topSignals.filter((s) => s.action !== "SKIP");
    if (this.watchlistManager && watchlistCandidates.length > 0) {
      try {
        const result =
          await this.watchlistManager.createWatchlistFromSignals(
            watchlistCandidates,
          );
        if (result.added < watchlistCandidates.length) {
          console.warn(
            `\n⚠ Watchlist: added ${result.added}/${watchlistCandidates.length} symbols`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`\n⚠ Watchlist creation failed: ${message}`);
        console.warn(
          "  Check ZERODHA_ENCTOKEN in .env (get from kite.zerodha.com cookies)",
        );
      }
    } else if (!this.watchlistManager) {
      console.log(
        "\n💡 Tip: Set ZERODHA_ENCTOKEN in .env to auto-create Zerodha watchlists",
      );
    } else if (topSignals.length > 0 && watchlistCandidates.length === 0) {
      console.log(
        "\n📋 Skipping watchlist — all signals are SKIP (no BUY/HOLD candidates)",
      );
    }

    // ── Save ──────────────────────────────────────────────────
    await saveSignals(topSignals, this.zerodha.getMarketStatus());
    await this.updateMemory(topSignals);

    const runEndTime = new Date();
    const durationMin = (
      (runEndTime.getTime() - runStartTime.getTime()) /
      1000 /
      60
    ).toFixed(1);

    console.log("\n✅ Pipeline complete!");
    console.log(`   Generated ${topSignals.length} investment opportunities`);
    console.log(`   Duration: ${durationMin} minutes`);
    console.log(`   Dashboard: http://localhost:3000`);
  }

  // ─── Step 4: Fundamentals ────────────────────────────────────

  private async runFundamentals(
    symbols: string[],
  ): Promise<Record<string, { score: number | null; summary: string }>> {
    const results: Record<string, { score: number | null; summary: string }> =
      {};

    for (const symbol of symbols) {
      try {
        const data = await this.fundamentals.getFundamentals(symbol);
        if (data) {
          const score = this.fundamentals.analyzeFundamentals(data);
          results[symbol] = {
            score: score.overallScore,
            summary: score.recommendation,
          };
          console.log(
            `   ${symbol}: fundamental score ${score.overallScore}/100 — ${score.valuation}`,
          );
        } else {
          results[symbol] = {
            score: null,
            summary: "Fundamental data unavailable",
          };
        }
      } catch {
        results[symbol] = {
          score: null,
          summary: "Error fetching fundamentals",
        };
      }
    }

    return results;
  }

  // ─── Build final signals ──────────────────────────────────────

  async buildSignals(
    technical: {
      symbol: string;
      alignmentScore: number;
      mtf: MultiTimeframeIndicators;
      price: number;
      changePercent: number;
      volume: number;
    }[],
    fundamentals: Record<string, { score: number | null; summary: string }>,
    sentiment: Record<
      string,
      { score: number | null; summary: string; headlines: string[] }
    >,
    sectorThemeMap: Record<string, string>,
    sectorNameMap: Record<string, string>,
  ): Promise<InvestmentSignal[]> {
    const signals: InvestmentSignal[] = [];

    for (const tech of technical) {
      const sym = tech.symbol;
      const fund = fundamentals[sym] || { score: null, summary: "N/A" };
      const sent = sentiment[sym] || {
        score: null,
        summary: "N/A",
        headlines: [],
      };
      const mtf = tech.mtf;

      const techScore = tech.alignmentScore;
      const fundScore = fund.score;
      const sentScore = sent.score;

      if (fundScore === null || sentScore === null) {
        console.log(
          `   ⚠ ${sym}: skipping due to incomplete data (fund: ${fundScore}, sent: ${sentScore})`,
        );
        continue;
      }

      const overallScore = Math.round(
        techScore * 0.4 + fundScore * 0.3 + sentScore * 0.3,
      );

      let action: "BUY" | "HOLD" | "SKIP" = "BUY";
      if (overallScore < 45 || sentScore < 30) {
        action = "SKIP";
      } else if (overallScore < 60 || techScore < 50) {
        action = "HOLD";
      }

      const atr = mtf.daily.atr || tech.price * 0.02;
      const entry = tech.price;
      const stopLoss = Math.max(entry - atr * 1.5, entry * 0.92);
      const risk = entry - stopLoss;

      let targets: number[];
      let expectedReturn: number;
      let holdingPeriod: string;

      if (mtf.suggestedTimeframe === "SHORT") {
        targets = [entry + risk * 2, entry + risk * 3];
        expectedReturn = ((risk * 2) / entry) * 100;
        holdingPeriod = "1-2 weeks";
      } else if (mtf.suggestedTimeframe === "MEDIUM") {
        targets = [entry + risk * 3, entry + risk * 5, entry + risk * 7];
        expectedReturn = ((risk * 3) / entry) * 100;
        holdingPeriod = "1-3 months";
      } else {
        targets = [entry * 1.15, entry * 1.25, entry * 1.4];
        expectedReturn = 15;
        holdingPeriod = "6+ months";
      }

      const riskAmount = Math.min(
        config.capital * config.riskPercent,
        risk * 100,
      );
      const quantity = Math.max(1, Math.floor(riskAmount / risk));
      const potentialReward = (targets[0] - entry) * quantity;
      const riskRewardRatio = (targets[0] - entry) / risk;

      const keyReasons: string[] = [];
      if (mtf.daily.trend === "UP") keyReasons.push("Daily uptrend confirmed");
      if (mtf.weekly.trend === "UP") keyReasons.push("Weekly trend bullish");
      if (mtf.daily.volumeRatio > 1.5)
        keyReasons.push(`Volume surge ${mtf.daily.volumeRatio.toFixed(1)}x`);
      if (mtf.daily.rsi < 65 && mtf.daily.rsi > 40)
        keyReasons.push(`RSI healthy (${mtf.daily.rsi.toFixed(0)})`);
      if (sectorThemeMap[sym])
        keyReasons.push(`Sector theme: ${sectorThemeMap[sym]}`);
      if (sentScore > 65) keyReasons.push("Positive news flow");

      const risks: string[] = [];
      if (mtf.daily.rsi > 65) risks.push("RSI approaching overbought");
      if (mtf.hourly.trend === "DOWN") risks.push("Short-term momentum weak");
      if (sentScore < 45) risks.push("Mixed news sentiment");

      const technicalSummary = `Daily ${mtf.daily.trend} | RSI ${mtf.daily.rsi.toFixed(0)} | MACD ${mtf.daily.macd.histogram > 0 ? "bullish" : "bearish"} | Weekly ${mtf.weekly.trend} | Alignment ${techScore}/100`;

      signals.push({
        id: `${sym}-${Date.now()}`,
        symbol: sym,
        name: sym,
        sector: sectorNameMap[sym] || "Others",
        sectorTheme: sectorThemeMap[sym] || "",
        action,
        entry,
        stopLoss,
        targets,
        quantity,
        riskAmount,
        potentialReward,
        riskRewardRatio,
        suggestedTimeframe: mtf.suggestedTimeframe,
        expectedReturn,
        holdingPeriod,
        technicalScore: techScore,
        fundamentalScore: fundScore,
        sentimentScore: sentScore,
        overallScore,
        technicalSummary,
        fundamentalSummary: fund.summary,
        newsSummary: sent.summary,
        keyReasons,
        risks,
        price: tech.price,
        changePercent: tech.changePercent,
        volume: tech.volume,
        timestamp: new Date().toISOString(),
      });
    }

    return signals;
  }

  // ─── Memory helpers ───────────────────────────────────────────

  private async initMemory() {
    const mem = await loadMemory();
    if (mem) {
      this.memory = mem;
      console.log(
        `\n📚 Memory loaded: ${this.memory.totalSignalsGenerated} total signals, avg score: ${this.memory.averageScore.toFixed(2)}`,
      );
    } else {
      console.log("\n📚 Starting fresh memory");
      this.memory = this.emptyMemory();
    }
  }

  private async updateMemory(signals: InvestmentSignal[]) {
    const history = await loadHistory();
    this.memory.totalSignalsGenerated = history.length + signals.length;

    const rated = history.filter((s) => s.userScore !== undefined);
    if (rated.length > 0) {
      this.memory.averageScore =
        rated.reduce((sum, s) => sum + (s.userScore || 0), 0) / rated.length;
      this.memory.signalsExecuted = rated.filter((s) => s.executed).length;

      const completed = rated.filter(
        (s) => s.outcome === "WIN" || s.outcome === "LOSS",
      );
      this.memory.winRate =
        completed.length > 0
          ? completed.filter((s) => s.outcome === "WIN").length /
            completed.length
          : 0;

      const good = rated.filter((s) => (s.userScore || 0) >= 8);
      this.memory.bestSetups = [...new Set(good.map((s) => s.sector || ""))]
        .filter(Boolean)
        .slice(0, 10);

      const bad = rated.filter((s) => (s.userScore || 0) <= 4);
      this.memory.avoidPatterns = [...new Set(bad.map((s) => s.sector || ""))]
        .filter(Boolean)
        .slice(0, 10);

      for (const s of rated) {
        const prev = this.memory.symbolPreferences[s.symbol] ?? 0;
        this.memory.symbolPreferences[s.symbol] =
          (prev + (s.userScore || 0)) / 2;
      }
    }

    await saveMemory(this.memory);
  }

  private emptyMemory(): TradingMemory {
    return {
      totalSignalsGenerated: 0,
      signalsExecuted: 0,
      averageScore: 0,
      winRate: 0,
      bestSetups: [],
      avoidPatterns: [],
      symbolPreferences: {},
      strategyPerformance: {},
      learnings: [],
    };
  }
}
