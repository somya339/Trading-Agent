#!/usr/bin/env node
/**
 * Test hybrid fundamentals fetch (Screener + optional Zerodha).
 *
 * Run: npx tsx test-fundamentals.ts
 * Requires ZERODHA_API_KEY + ZERODHA_ACCESS_TOKEN for live price adjustment.
 */

import { config } from "./agent/src/config/index.js";
import { FundamentalAnalyzer } from "./agent/src/analysis/fundamentals.js";
import { ZerodhaClient } from "./agent/src/data/zerodha.js";

const symbols = ["RELIANCE", "TCS", "TITAN"];

async function main() {
  const zerodha =
    config.zerodha.apiKey && config.zerodha.accessToken
      ? new ZerodhaClient(config.zerodha.apiKey, config.zerodha.accessToken)
      : null;

  if (zerodha) {
    await zerodha.initialize();
    console.log(
      "✅ Zerodha connected — market cap / P/E will use live price\n",
    );
  } else {
    console.log("⚠️  No Zerodha token — using Screener data only\n");
  }

  const analyzer = new FundamentalAnalyzer(zerodha);

  for (const symbol of symbols) {
    console.log("=".repeat(60));
    console.log(`📊 ${symbol}`);
    console.log("-".repeat(60));

    const data = await analyzer.getFundamentals(symbol);
    if (!data) {
      console.log("   No data\n");
      continue;
    }

    const score = analyzer.analyzeFundamentals(data);
    console.log(`   P/E: ${data.pe} | P/B: ${data.pb} | ROE: ${data.roe}%`);
    console.log(
      `   Revenue growth: ${data.revenueGrowth}% | Profit growth: ${data.profitGrowth}%`,
    );
    console.log(
      `   D/E: ${data.debtToEquity} | Promoter: ${data.promoterHolding}% (${data.promoterChange}% QoQ)`,
    );
    console.log(
      `   Sector P/E: ${data.sectorPE} | Market cap (Cr): ${data.marketCap}`,
    );
    console.log(
      `   Score: ${score.overallScore}/100 — ${score.valuation}, ${score.recommendation.slice(0, 80)}...\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
