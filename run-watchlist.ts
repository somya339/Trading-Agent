#!/usr/bin/env node
/**
 * Create a Zerodha watchlist directly from the latest dashboard/trades.json.
 *
 * trades.json signals are often all marked SKIP because the portfolio RISK GATE
 * demoted them (min-position-value / stop-too-wide) — not because they're low
 * quality. This runner ranks by overallScore and adds the top N, relabeling the
 * chosen ones to BUY/HOLD so the manager's SKIP filter accepts them.
 *
 * Run: npx tsx run-watchlist.ts [topN]   (default topN = 10)
 *
 * Requires in .env: ZERODHA_ENCTOKEN, ZERODHA_PUBLIC_TOKEN, ZERODHA_USER_ID,
 *                   ZERODHA_API_KEY, ZERODHA_ACCESS_TOKEN  (optional ZERODHA_KF_SESSION)
 */

import * as dotenv from "dotenv";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ZerodhaWatchlistManager } from "./agent/src/watchlist/manager.js";
import type { InvestmentSignal } from "./agent/src/types/index.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRADES_PATH = path.join(__dirname, "dashboard", "trades.json");

async function main() {
  const topN = parseInt(process.argv[2] || "10", 10);

  const enctoken = process.env.ZERODHA_ENCTOKEN;
  const publicToken = process.env.ZERODHA_PUBLIC_TOKEN;
  const userId = process.env.ZERODHA_USER_ID;
  const kfSession = process.env.ZERODHA_KF_SESSION;

  if (!enctoken || !publicToken || !userId) {
    console.error(
      "\n❌ Missing watchlist env vars: ZERODHA_ENCTOKEN, ZERODHA_PUBLIC_TOKEN, ZERODHA_USER_ID\n" +
        "   Get them from kite.zerodha.com cookies after login.\n",
    );
    process.exit(1);
  }

  const raw = await readFile(TRADES_PATH, "utf-8");
  const parsed = JSON.parse(raw) as {
    generatedAt: string;
    signals: InvestmentSignal[];
  };
  const all = parsed.signals ?? [];
  console.log(
    `\n📄 Loaded ${all.length} signals from trades.json (generated ${parsed.generatedAt})`,
  );

  // Rank by overallScore, take top N. These were demoted to SKIP by the risk
  // gate, not by quality — relabel so the manager will add them.
  const top = [...all]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, topN)
    .map((s) => ({
      ...s,
      action: (s.overallScore >= 55 ? "BUY" : "HOLD") as InvestmentSignal["action"],
    }));

  console.log(`\n🏆 Top ${top.length} by overallScore:`);
  for (const s of top) {
    console.log(
      `   ${s.symbol.padEnd(12)} score ${String(s.overallScore).padStart(3)} | ` +
        `tech ${s.technicalScore} fund ${s.fundamentalScore} sent ${s.sentimentScore} | ${s.suggestedTimeframe}`,
    );
  }

  const manager = new ZerodhaWatchlistManager(
    enctoken,
    publicToken,
    userId,
    kfSession,
  );

  const result = await manager.createWatchlistFromSignals(top);
  console.log(
    `\n✅ Watchlist "${result.name}" (id ${result.watchlistId}) — ${result.added}/${top.length} added`,
  );
}

main().catch((err) => {
  console.error("\n❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
