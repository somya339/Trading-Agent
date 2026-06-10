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

import {
  config,
  TIMEFRAME_WEIGHTS,
  TIMEFRAME_HOLDING_DAYS,
  sizing,
} from "../config/index.js";
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
import { allocate, type SizingCandidate } from "../risk/engine.js";
import { PaperTracker } from "../paper/tracker.js";
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
    );
    const enctoken = process.env.ZERODHA_ENCTOKEN;
    const publicToken = process.env.ZERODHA_PUBLIC_TOKEN;
    const userId = process.env.ZERODHA_USER_ID;
    const kfSession = process.env.ZERODHA_KF_SESSION;
    this.watchlistManager =
      enctoken && publicToken && userId
        ? new ZerodhaWatchlistManager(enctoken, publicToken, userId, kfSession)
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
    console.log(
      `⚙️  Risk profile: ${config.riskProfile.toUpperCase()} | ` +
        `risk/trade ${(config.risk.riskPerTradePct * 100).toFixed(1)}% | ` +
        `heat cap ${(config.risk.maxPortfolioHeatPct * 100).toFixed(0)}% | ` +
        `max ${config.risk.maxOpenPositions} positions | ` +
        `BUY ≥ ${config.signals.buyScoreThreshold}`,
    );
    if (config.riskProfile === "aggressive") {
      console.log(
        "   ⚠ AGGRESSIVE: amplified returns AND losses. Paper-trade to confirm edge before live capital.",
      );
    }

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
      (r) =>
        r.alignmentScore >= config.signals.minAlignment &&
        r.mtf.daily.trend !== "DOWN",
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

    // Ranking: in conviction mode, prioritize duration-adjusted return
    // (annualized %) weighted by score confidence — the best profit-per-time
    // trades come first. In risk mode, keep pure score ordering.
    const rankValue = (s: InvestmentSignal) =>
      sizing.mode === "conviction"
        ? s.annualizedReturn * (s.overallScore / 100)
        : s.overallScore;
    signals.sort((a, b) => rankValue(b) - rankValue(a));
    const topSignals = signals.slice(0, config.maxSignals);

    // ── Portfolio-level risk gate ──────────────────────────────
    // Enforces portfolio heat, per-sector and per-position caps, and a
    // min-notional floor across the BUY/HOLD set. This is the fix for the old
    // behaviour where 20 signals × 2% could put 40% of capital at risk at once.
    this.applyRiskLimits(topSignals);

    // ── Paper-trading tracker ──────────────────────────────────
    // Forward-test every accepted signal with realistic fills + costs, so we
    // accumulate live evidence before any real capital is risked.
    await this.updatePaperBook(topSignals);

    // ── Zerodha Watchlist (before dashboard writes — avoids nodemon restart mid-add)
    // Add ALL signals regardless of action — the user does their own analysis
    // on whatever lands in the watchlist.
    if (this.watchlistManager && topSignals.length > 0) {
      try {
        const result =
          await this.watchlistManager.createWatchlistFromSignals(topSignals);
        if (result.added < topSignals.length) {
          console.warn(
            `\n⚠ Watchlist: added ${result.added}/${topSignals.length} symbols`,
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

      // Weights depend on the holding timeframe: fundamentals only matter for
      // long holds. For SHORT (1-2wk) they're ~ignored, so missing fundamental
      // data should NOT skip the trade — only missing sentiment does.
      const weights = TIMEFRAME_WEIGHTS[mtf.suggestedTimeframe];

      if (sentScore === null) {
        console.log(`   ⚠ ${sym}: skipping — no sentiment data`);
        continue;
      }
      // Long-horizon trades genuinely need fundamentals; short ones don't.
      if (fundScore === null && weights.fund >= 0.3) {
        console.log(
          `   ⚠ ${sym}: skipping — ${mtf.suggestedTimeframe} trade needs fundamentals (none available)`,
        );
        continue;
      }

      // If fundamentals are missing on a short/medium trade, redistribute their
      // (small) weight to technical + sentiment rather than scoring them as 0.
      let { tech: wTech, fund: wFund, sent: wSent } = weights;
      let effFund = fundScore ?? 0;
      if (fundScore === null) {
        const total = wTech + wSent;
        wTech /= total;
        wSent /= total;
        wFund = 0;
        effFund = 0;
      }

      const overallScore = Math.round(
        techScore * wTech + effFund * wFund + sentScore * wSent,
      );

      let action: "BUY" | "HOLD" | "SKIP" = "BUY";
      if (
        overallScore < config.signals.holdScoreThreshold ||
        sentScore < config.signals.minSentiment
      ) {
        action = "SKIP";
      } else if (
        overallScore < config.signals.buyScoreThreshold ||
        techScore < config.signals.minAlignment
      ) {
        action = "HOLD";
      }

      // Stop width scales with risk appetite (wider ATR multiple → more room
      // for high-beta names to run before stopping out). The 8% hard floor
      // (entry*0.92) caps catastrophic single-trade loss regardless of profile.
      const atr = mtf.daily.atr || tech.price * 0.02;
      const entry = tech.price;
      const stopLoss = Math.max(
        entry - atr * config.risk.atrStopMultiple,
        entry * 0.92,
      );
      const risk = entry - stopLoss;

      // Target ladder uses the profile's R-multiples — aggressive reaches for
      // bigger payoffs (e.g. 3/6/10R) vs conservative (2/3R).
      const rMultiples = config.signals.targetMultipliers;
      let targets: number[];
      let expectedReturn: number;
      let holdingPeriod: string;

      if (mtf.suggestedTimeframe === "SHORT") {
        const m = rMultiples.slice(0, 2);
        targets = m.map((x) => entry + risk * x);
        expectedReturn = ((risk * m[0]) / entry) * 100;
        holdingPeriod = "1-2 weeks";
      } else if (mtf.suggestedTimeframe === "MEDIUM") {
        targets = rMultiples.map((x) => entry + risk * x);
        expectedReturn = ((risk * rMultiples[0]) / entry) * 100;
        holdingPeriod = "1-3 months";
      } else {
        // LONG: percentage targets scaled up for aggressive (multibagger reach).
        const longScale = config.riskProfile === "aggressive" ? 2 : 1;
        targets = [
          entry * (1 + 0.15 * longScale),
          entry * (1 + 0.25 * longScale),
          entry * (1 + 0.4 * longScale),
        ];
        expectedReturn = 15 * longScale;
        holdingPeriod = "6+ months";
      }

      // Duration-adjusted return: scale expected % to an annual rate so a 20%
      // gain in 2 weeks ranks far above 20% over 6 months. This is the metric
      // the user cares about (profit relative to trade duration). Uses SIMPLE
      // (linear) scaling, not compounding — compounding a 2-week return to a
      // year produces absurd 5-figure %s that swamp every other factor and
      // collapse the ranking to "shortest timeframe wins". Linear keeps the
      // spread meaningful while still rewarding faster trades proportionally.
      const holdDays = TIMEFRAME_HOLDING_DAYS[mtf.suggestedTimeframe];
      const annualizedReturn = expectedReturn * (365 / holdDays);

      // Fixed-fractional sizing: risk a fixed % of capital on the entry→stop
      // distance. The old `risk * 100` cap had no financial meaning. Final
      // per-position and portfolio caps are enforced by the risk engine after
      // all signals are built (see applyRiskLimits).
      const riskBudget = config.capital * config.risk.riskPerTradePct;
      const quantity = Math.max(1, Math.floor(riskBudget / risk));
      const riskAmount = risk * quantity;
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
        annualizedReturn: Math.round(annualizedReturn),
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

  // ─── Portfolio risk gate ──────────────────────────────────────

  /**
   * Size BUY/HOLD signals. Two modes (SIZING_MODE):
   *  - "risk"       : layered risk engine with per-position/sector/heat caps.
   *  - "conviction" : NO caps — allocate capital proportional to conviction
   *                   (annualized return × score) so the best profit-per-time
   *                   trades get the most. Sizing is advisory; nothing is
   *                   demoted to SKIP for breaching a cap.
   */
  private applyRiskLimits(signals: InvestmentSignal[]): void {
    const actionable = signals.filter((s) => s.action !== "SKIP");
    if (actionable.length === 0) return;

    if (sizing.mode === "conviction") {
      this.sizeByConviction(actionable);
      return;
    }

    const candidates: SizingCandidate[] = actionable.map((s) => ({
      symbol: s.symbol,
      sector: s.sector,
      entry: s.entry,
      stopLoss: s.stopLoss,
      priority: s.overallScore,
    }));

    const result = allocate(candidates, {
      capital: config.capital,
      riskPerTradePct: config.risk.riskPerTradePct,
      maxPortfolioHeatPct: config.risk.maxPortfolioHeatPct,
      maxPositionPct: config.risk.maxPositionPct,
      maxSectorPct: config.risk.maxSectorPct,
      maxOpenPositions: config.risk.maxOpenPositions,
      minPositionValue: config.risk.minPositionValue,
      maxTotalDeploymentPct: sizing.maxTotalDeploymentPct,
    });

    const sizedBySymbol = new Map(result.accepted.map((p) => [p.symbol, p]));
    const rejectedBySymbol = new Map(
      result.rejected.map((r) => [r.symbol, r.reason]),
    );

    for (const s of signals) {
      const sized = sizedBySymbol.get(s.symbol);
      if (sized) {
        s.quantity = sized.quantity;
        s.riskAmount = Math.round(sized.riskAmount);
        s.potentialReward = Math.round(
          (s.targets[0] - s.entry) * sized.quantity,
        );
      } else if (s.action !== "SKIP") {
        const reason = rejectedBySymbol.get(s.symbol) || "Risk cap";
        s.action = "SKIP";
        s.risks = [...(s.risks || []), `Risk gate: ${reason}`];
      }
    }

    console.log(
      `\n🛡️  Risk gate: ${result.accepted.length} positions approved | ` +
        `heat ${result.portfolioHeatPct.toFixed(1)}% (cap ${(config.risk.maxPortfolioHeatPct * 100).toFixed(0)}%) | ` +
        `capital deployed ${result.capitalDeployedPct.toFixed(0)}%`,
    );
    if (result.rejected.length > 0) {
      const summary = result.rejected
        .slice(0, 5)
        .map((r) => `${r.symbol} (${r.reason})`)
        .join(", ");
      console.log(
        `   Rejected: ${summary}${result.rejected.length > 5 ? " …" : ""}`,
      );
    }
  }

  /**
   * Conviction sizing — NO position/sector/heat caps. Capital is allocated in
   * proportion to each trade's conviction weight (annualized return × score),
   * so the highest profit-per-time opportunities get the largest suggested
   * positions. Quantities are ADVISORY: with an uncapped deployment ceiling the
   * suggested notionals may sum past your cash, and you allocate manually.
   */
  private sizeByConviction(actionable: InvestmentSignal[]): void {
    const weightOf = (s: InvestmentSignal) =>
      Math.max(0.0001, s.annualizedReturn) * (s.overallScore / 100);
    const totalWeight = actionable.reduce((a, s) => a + weightOf(s), 0);

    // Notional budget to distribute. Uncapped (Infinity) → use 1× capital as
    // the proportional base so suggested sizes are sensible numbers; the user
    // scales up as they see fit. Finite ceiling → use that multiple of capital.
    const deployMult = Number.isFinite(sizing.maxTotalDeploymentPct)
      ? sizing.maxTotalDeploymentPct
      : 1;
    const notionalBudget = config.capital * deployMult;

    let suggestedTotal = 0;
    for (const s of actionable) {
      const share = weightOf(s) / totalWeight;
      const targetNotional = notionalBudget * share;
      const qty = Math.max(1, Math.floor(targetNotional / s.entry));
      s.quantity = qty;
      s.riskAmount = Math.round((s.entry - s.stopLoss) * qty);
      s.potentialReward = Math.round((s.targets[0] - s.entry) * qty);
      suggestedTotal += qty * s.entry;
    }

    const ceiling = Number.isFinite(sizing.maxTotalDeploymentPct)
      ? `${(sizing.maxTotalDeploymentPct * 100).toFixed(0)}% of capital`
      : "uncapped";
    console.log(
      `\n🎯 Conviction sizing (NO caps): ${actionable.length} positions | ` +
        `ranked by annualized return × score | deployment ceiling: ${ceiling}`,
    );
    console.log(
      `   Suggested total notional ₹${Math.round(suggestedTotal).toLocaleString("en-IN")} ` +
        `(${((suggestedTotal / config.capital) * 100).toFixed(0)}% of ₹${config.capital.toLocaleString("en-IN")} capital) — advisory, allocate manually`,
    );
  }

  // ─── Paper trading ────────────────────────────────────────────

  /**
   * Mark the paper book to current prices (closing stops/targets) and open new
   * paper positions from the approved BUY signals. Persisted to paper-book.json.
   */
  private async updatePaperBook(signals: InvestmentSignal[]): Promise<void> {
    try {
      const tracker = await PaperTracker.load(config.capital);
      const asOf = new Date().toISOString().split("T")[0];

      // Mark-to-market: price every open position + any approved-today symbol.
      const prices: Record<string, number> = {};
      for (const s of signals) prices[s.symbol] = s.price;

      const closed = tracker.update(prices, asOf);
      for (const t of closed) {
        console.log(
          `   📕 Paper close ${t.symbol}: ${t.exitReason} ${(t.returnPct * 100).toFixed(1)}% (₹${t.netPnl.toFixed(0)})`,
        );
      }

      // Open new positions from approved BUY signals only.
      const entries = signals
        .filter((s) => s.action === "BUY" && s.quantity >= 1)
        .map((s) => ({
          symbol: s.symbol,
          sector: s.sector,
          strategy: s.suggestedTimeframe,
          price: s.price,
          quantity: s.quantity,
          stopLoss: s.stopLoss,
          targets: s.targets,
          liquidity: "MEDIUM" as const,
        }));
      const opened = tracker.openFromSignals(entries, asOf);
      await tracker.save();

      const snap = tracker.snapshot();
      console.log(
        `\n📒 Paper book: ${snap.openPositions} open | equity ₹${Math.round(snap.equity).toLocaleString("en-IN")} | ` +
          `return ${snap.totalReturnPct.toFixed(1)}% | win rate ${snap.metrics.winRate.toFixed(0)}% (${snap.metrics.totalTrades} closed)`,
      );
      if (opened.length > 0) {
        console.log(
          `   Opened ${opened.length}: ${opened.map((p) => p.symbol).join(", ")}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   ⚠ Paper tracker error: ${message}`);
    }
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
