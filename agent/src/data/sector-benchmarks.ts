import { SECTOR_SYMBOLS } from "../config/index.js";
import type { FundamentalsProvider } from "./fundamentals-provider.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PEERS = 5;

interface SectorBenchmark {
  sectorPE: number | null;
  sectorPB: number | null;
  expiresAt: number;
}

/**
 * Lazily computes median P/E and P/B for sector peers via the fundamentals provider.
 */
export class SectorBenchmarkCache {
  private cache = new Map<string, SectorBenchmark>();

  findSector(symbol: string): string | null {
    for (const [sector, symbols] of Object.entries(SECTOR_SYMBOLS)) {
      if (symbols.includes(symbol)) return sector;
    }
    return null;
  }

  async getBenchmarks(
    symbol: string,
    provider: FundamentalsProvider,
  ): Promise<{ sectorPE: number | null; sectorPB: number | null }> {
    const sector = this.findSector(symbol);
    if (!sector) return { sectorPE: null, sectorPB: null };

    const cached = this.cache.get(sector);
    if (cached && Date.now() < cached.expiresAt) {
      return { sectorPE: cached.sectorPE, sectorPB: cached.sectorPB };
    }

    const peers = SECTOR_SYMBOLS[sector]
      .filter((s) => s !== symbol)
      .slice(0, MAX_PEERS);

    const peValues: number[] = [];
    const pbValues: number[] = [];

    for (const peer of peers) {
      try {
        const data = await provider.fetchFundamentals(peer);
        if (data?.pe != null) peValues.push(data.pe);
        if (data?.pb != null) pbValues.push(data.pb);
      } catch {
        // skip failed peer
      }
    }

    const sectorPE = median(peValues);
    const sectorPB = median(pbValues);

    this.cache.set(sector, {
      sectorPE,
      sectorPB,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return { sectorPE, sectorPB };
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
