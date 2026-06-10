/**
 * Zerodha Watchlist Manager
 *
 * Uses Kite web API (the same endpoints the browser calls):
 *   GET  /api/marketwatch           — list all watchlists
 *   POST /api/marketwatch           — create watchlist  (form: name, weight)
 *   POST /api/marketwatch/{id}/items — add instrument   (form: exchange, tradingsymbol, weight, group)
 *   PUT  /api/marketwatch/{id}/items/{itemId} — set note
 *   DEL  /api/marketwatch/{id}      — delete watchlist
 *
 * Required .env variables:
 *   ZERODHA_ENCTOKEN     — from kite.zerodha.com cookie "enctoken"
 *   ZERODHA_PUBLIC_TOKEN — from kite.zerodha.com cookie "public_token"  (used as CSRF token)
 *   ZERODHA_USER_ID      — your Zerodha client ID, e.g. "EZJ051"
 *
 * All three refresh on each daily login to kite.zerodha.com.
 */

import axios, { type AxiosInstance } from "axios";
import type { InvestmentSignal, KiteWatchlist } from "../types/index.js";

export type { KiteWatchlist };

const MAX_WATCHLISTS = 10;
const ADD_ITEM_DELAY_MS = 300;

function kiteErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export class ZerodhaWatchlistManager {
  private client: AxiosInstance;

  constructor(
    enctoken: string,
    publicToken: string,
    userId: string,
    kfSession?: string,
  ) {
    const cookieHeader = [
      `public_token=${publicToken}`,
      kfSession ? `kf_session=${kfSession}` : "",
      `user_id=${userId}`,
      `enctoken=${enctoken}`,
    ]
      .filter(Boolean)
      .join("; ");

    this.client = axios.create({
      baseURL: "https://kite.zerodha.com",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader,
        origin: "https://kite.zerodha.com",
        referer: "https://kite.zerodha.com/",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "x-csrftoken": publicToken,
        "x-kite-userid": userId,
        "x-kite-version": "3.0.0",
      },
    });
  }

  async createWatchlistFromSignals(
    signals: InvestmentSignal[],
  ): Promise<{ watchlistId: number; name: string; added: number }> {
    // Add ALL signals regardless of action — the user does their own analysis
    // on whatever lands in the watchlist, so BUY/HOLD/SKIP are all included.
    const eligible = signals;
    if (eligible.length === 0) {
      throw new Error("No signals to add to watchlist");
    }

    console.log("\n📋 Creating Zerodha watchlist...");

    const existing = await this.getWatchlists();
    console.log(`   Found ${existing.length} existing watchlists`);

    if (existing.length >= MAX_WATCHLISTS) {
      const oldest = [...existing].sort((a, b) => a.id - b.id)[0];
      console.log(
        `   Limit reached — deleting oldest: "${oldest.name}" (id ${oldest.id})`,
      );
      await this.deleteWatchlist(oldest.id);
    }

    const now = new Date();
    const name = `AI Picks ${now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    })} ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

    const watchlistId = await this.createWatchlist(name);
    if (!watchlistId || Number.isNaN(watchlistId)) {
      throw new Error("Kite did not return a watchlist id after create");
    }
    console.log(`   ✅ Created watchlist "${name}" (id ${watchlistId})`);

    let added = 0;
    for (const signal of eligible) {
      try {
        await this.addItem(watchlistId, signal);
        added++;
        const t1 = signal.targets[0]?.toFixed(0) ?? "—";
        console.log(
          `   + ${signal.symbol.padEnd(14)} [${signal.action}] CMP ₹${signal.price.toFixed(0).padStart(6)} | T1 ₹${t1} | SL ₹${signal.stopLoss.toFixed(0)}`,
        );
        await sleep(ADD_ITEM_DELAY_MS);
      } catch (err) {
        console.warn(
          `   ⚠ Failed to add ${signal.symbol}: ${kiteErrorMessage(err)}`,
        );
      }
    }

    console.log(`   ✅ Added ${added}/${eligible.length} stocks to watchlist`);
    return { watchlistId, name, added };
  }

  async getWatchlists(): Promise<KiteWatchlist[]> {
    const res = await this.client.get("/api/marketwatch");
    const groups: { name: string; items: KiteWatchlist[] }[] =
      res.data?.data ?? [];
    return groups.flatMap((g) => g.items ?? []);
  }

  private async createWatchlist(name: string): Promise<number> {
    const res = await this.client.post(
      "/api/marketwatch",
      new URLSearchParams({ name, weight: "2" }).toString(),
    );
    const id = res.data?.data?.id;
    return typeof id === "number" ? id : Number(id);
  }

  private async deleteWatchlist(id: number): Promise<void> {
    await this.client.delete(`/api/marketwatch/${id}`);
  }

  private async addItem(
    watchlistId: number,
    signal: InvestmentSignal,
  ): Promise<void> {
    const targets = signal.targets ?? [];
    if (targets.length === 0) {
      throw new Error(`No price targets for ${signal.symbol}`);
    }

    const targetsStr = targets.map((t) => `₹${t.toFixed(0)}`).join(" / ");
    const note = `CMP ₹${signal.price.toFixed(0)}-TGT ${targetsStr}-SL ₹${signal.stopLoss.toFixed(0)}-${signal.holdingPeriod}-Score ${signal.overallScore}/100`;

    const addBody = (exch: string) =>
      new URLSearchParams({
        exchange: exch,
        tradingsymbol: signal.symbol,
        weight: "0.0001",
        group: signal.suggestedTimeframe,
      }).toString();

    let itemId: string | null = null;
    try {
      const res = await this.client.post(
        `/api/marketwatch/${watchlistId}/items`,
        addBody("NSE"),
      );
      itemId = res.data?.data?.id ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        const res = await this.client.post(
          `/api/marketwatch/${watchlistId}/items`,
          addBody("BSE"),
        );
        itemId = res.data?.data?.id ?? null;
      } else {
        throw err;
      }
    }

    if (!itemId) {
      throw new Error(
        `Instrument added but Kite returned no item id for ${signal.symbol}`,
      );
    }

    // Use the itemId directly from POST response (format: EXCHANGE:ISIN like "BSE:INE296A01032")
    try {
      await this.client.put(
        `/api/marketwatch/${watchlistId}/items/${itemId}`,
        new URLSearchParams({ note }).toString(),
      );
    } catch (err) {
      console.warn(
        `   ⚠ Note failed for ${signal.symbol} (${itemId}): ${kiteErrorMessage(err)}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
