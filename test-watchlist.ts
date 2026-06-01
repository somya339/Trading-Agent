#!/usr/bin/env node
/**
 * Integration test for ZerodhaWatchlistManager.
 *
 * Creates a new Kite market watchlist and adds 2 instruments with notes.
 *
 * Required .env (from kite.zerodha.com cookies after login):
 *   ZERODHA_ENCTOKEN, ZERODHA_PUBLIC_TOKEN, ZERODHA_USER_ID
 *   ZERODHA_API_KEY, ZERODHA_ACCESS_TOKEN (for instrument init)
 *
 * Optional:
 *   ZERODHA_KF_SESSION
 *
 * Run: npm run test-watchlist
 */

import * as dotenv from "dotenv";
import { ZerodhaWatchlistManager } from "./agent/src/watchlist/manager.js";
import { ZerodhaClient } from "./agent/src/data/zerodha.js";
import type { InvestmentSignal } from "./agent/src/types/index.js";

dotenv.config();

function buildTestSignal(
  symbol: string,
  name: string,
  opts: {
    price: number;
    stopLoss: number;
    targets: number[];
    holdingPeriod: string;
    overallScore: number;
    fundamentalSummary: string;
    newsSummary: string;
  },
): InvestmentSignal {
  const risk = opts.price - opts.stopLoss;
  const target0 = opts.targets[0];
  return {
    id: `${symbol}-watchlist-test`,
    symbol,
    name,
    sector: "Test",
    sectorTheme: "Watchlist integration test",
    action: "BUY",
    price: opts.price,
    entry: opts.price,
    stopLoss: opts.stopLoss,
    targets: opts.targets,
    quantity: 1,
    riskAmount: risk,
    potentialReward: target0 - opts.price,
    riskRewardRatio: risk > 0 ? (target0 - opts.price) / risk : 0,
    suggestedTimeframe: "MEDIUM",
    expectedReturn: ((target0 - opts.price) / opts.price) * 100,
    holdingPeriod: opts.holdingPeriod,
    technicalScore: 70,
    fundamentalScore: 65,
    sentimentScore: 60,
    overallScore: opts.overallScore,
    technicalSummary: "Test signal — daily trend UP",
    fundamentalSummary: opts.fundamentalSummary,
    newsSummary: opts.newsSummary,
    keyReasons: ["Integration test item"],
    risks: ["Not investment advice"],
    changePercent: 0.5,
    volume: 1_000_000,
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const enctoken = process.env.ZERODHA_ENCTOKEN;
  const publicToken = process.env.ZERODHA_PUBLIC_TOKEN;
  const userId = process.env.ZERODHA_USER_ID;
  const apiKey = process.env.ZERODHA_API_KEY;
  const accessToken = process.env.ZERODHA_ACCESS_TOKEN;
  const kfSession = process.env.ZERODHA_KF_SESSION;

  if (!enctoken || !publicToken || !userId) {
    console.error(
      "\n❌ Missing Kite web session env vars.\n" +
        "   Set in .env (from DevTools → Application → Cookies on kite.zerodha.com):\n" +
        "   ZERODHA_ENCTOKEN, ZERODHA_PUBLIC_TOKEN, ZERODHA_USER_ID\n",
    );
    process.exit(1);
  }

  if (!apiKey || !accessToken) {
    console.error(
      "\n❌ Missing Kite Connect env vars: ZERODHA_API_KEY, ZERODHA_ACCESS_TOKEN\n" +
        "   Run: npm run auth\n",
    );
    process.exit(1);
  }

  console.log("\n🧪 ZerodhaWatchlistManager integration test\n");
  console.log("=".repeat(60));

  const zerodha = new ZerodhaClient(apiKey, accessToken);
  await zerodha.initialize();

  const manager = new ZerodhaWatchlistManager(
    enctoken,
    publicToken,
    userId,
    kfSession,
  );

  console.log("\n📋 Step 1: List existing watchlists");
  const before = await manager.getWatchlists();
  console.log(`   Found ${before.length} watchlist(s)`);
  before.slice(0, 5).forEach((w) => {
    console.log(`   - [${w.id}] "${w.name}"`);
  });
  if (before.length > 5) console.log(`   ... and ${before.length - 5} more`);

  const signals: InvestmentSignal[] = [
    buildTestSignal("RELIANCE", "Reliance Industries", {
      price: 1320,
      stopLoss: 1250,
      targets: [1400, 1480, 1550],
      holdingPeriod: "1-3 months",
      overallScore: 72,
      fundamentalSummary: "Test note A — strong cash flows",
      newsSummary: "Test item 1 for watchlist manager",
    }),
    buildTestSignal("TCS", "Tata Consultancy Services", {
      price: 4100,
      stopLoss: 3950,
      targets: [4300, 4500, 4700],
      holdingPeriod: "6+ months",
      overallScore: 68,
      fundamentalSummary: "Test note B — IT sector leader",
      newsSummary: "Test item 2 for watchlist manager",
    }),
  ];

  console.log("\n📋 Step 2: Create watchlist + add 2 stocks with notes");
  console.log("   Symbols: RELIANCE, TCS");
  console.log(
    "   Notes are set via Kite API (CMP, targets, SL, holding period, score)\n",
  );

  const result = await manager.createWatchlistFromSignals(signals);

  console.log("\n📋 Step 3: Verify watchlist exists");
  const after = await manager.getWatchlists();
  const created = after.find((w) => w.id === result.watchlistId);

  console.log("=".repeat(60));
  if (result.added === 2 && created) {
    console.log("\n✅ Test passed");
    console.log(`   Watchlist: "${result.name}" (id ${result.watchlistId})`);
    console.log(`   Items added: ${result.added}/2`);
    console.log(
      "\n   Open Kite → Market Watch → select the new list to confirm notes on each row.",
    );
  } else {
    console.log("\n⚠️  Test completed with issues");
    console.log(`   Watchlist id: ${result.watchlistId}`);
    console.log(`   Items added: ${result.added}/2 (expected 2)`);
    console.log(`   Watchlist visible in API: ${created ? "yes" : "no"}`);
    if (result.added < 2) {
      console.log(
        "\n   Tip: Refresh enctoken/public_token from kite.zerodha.com if session expired.",
      );
    }
    process.exit(1);
  }

  console.log("");
}

main().catch((err: unknown) => {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    (err as { response?: { data?: unknown; status?: number } }).response
  ) {
    const { status, data } = (
      err as {
        response: { data?: unknown; status?: number };
      }
    ).response;
    console.error("\n❌ Kite API error:", status, data);
  } else if (err instanceof Error) {
    console.error("\n❌ Error:", err.message);
  } else {
    console.error("\n❌ Error:", err);
  }
  process.exit(1);
});
