import type { FundamentalData } from "../types/index.js";

/** Partial fundamentals from an external source (before Zerodha enrichment). */
export type ProviderFundamentals = Partial<Omit<FundamentalData, "symbol">> & {
  symbol: string;
  /** Screener "Current Price" — used to scale market cap with live quote */
  currentPrice?: number;
};

export interface FundamentalsProvider {
  fetchFundamentals(symbol: string): Promise<ProviderFundamentals | null>;
}
