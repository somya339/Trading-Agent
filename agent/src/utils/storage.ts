import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { InvestmentSignal, TradingMemory } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.join(__dirname, "../../../dashboard");

export async function saveSignals(
  signals: InvestmentSignal[],
  marketStatus: string,
): Promise<void> {
  const output = {
    generatedAt: new Date().toISOString(),
    marketStatus,
    pipelineVersion: "5-step-sequential",
    signals,
  };

  const filePath = path.join(dashboardPath, "trades.json");
  await fs.writeFile(filePath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved ${signals.length} signals to trades.json`);
}

export async function loadHistory(): Promise<InvestmentSignal[]> {
  try {
    const data = await fs.readFile(
      path.join(dashboardPath, "history.json"),
      "utf-8",
    );
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveMemory(memory: TradingMemory): Promise<void> {
  await fs.writeFile(
    path.join(dashboardPath, "memory.json"),
    JSON.stringify(memory, null, 2),
  );
  console.log(
    `\n💾 Memory updated: ${memory.totalSignalsGenerated} signals, win rate: ${(memory.winRate * 100).toFixed(1)}%`,
  );
}

export async function loadMemory(): Promise<TradingMemory | null> {
  try {
    const data = await fs.readFile(
      path.join(dashboardPath, "memory.json"),
      "utf-8",
    );
    return JSON.parse(data);
  } catch {
    return null;
  }
}
