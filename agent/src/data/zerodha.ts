import { KiteConnect } from "kiteconnect";
import type { Quote, HistoricalData } from "../types/index.js";

export type { Quote, HistoricalData };

export class ZerodhaClient {
  private kite: any;
  private instrumentsCache: any[] = [];

  constructor(apiKey: string, accessToken: string) {
    this.kite = new KiteConnect({ api_key: apiKey });
    this.kite.setAccessToken(accessToken);
  }

  async initialize() {
    console.log("📥 Fetching NSE instruments...");
    this.instrumentsCache = await this.kite.getInstruments("NSE");
    console.log(`✅ Loaded ${this.instrumentsCache.length} NSE instruments`);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const instrument = `NSE:${symbol}`;
    const quotes = await this.kite.getQuote([instrument]);
    const quote = quotes[instrument];

    if (!quote) {
      throw new Error(`Quote not found for ${symbol}`);
    }

    return {
      symbol,
      price: quote.last_price,
      open: quote.ohlc.open,
      high: quote.ohlc.high,
      low: quote.ohlc.low,
      close: quote.ohlc.close,
      volume: quote.volume,
      timestamp: new Date(quote.timestamp),
      change: quote.last_price - quote.ohlc.close,
      changePercent:
        ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
    };
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    const instruments = symbols.map((s) => `NSE:${s}`);
    const quotes = await this.kite.getQuote(instruments);

    const result: Record<string, Quote> = {};

    for (const symbol of symbols) {
      const instrument = `NSE:${symbol}`;
      const quote = quotes[instrument];

      if (quote) {
        result[symbol] = {
          symbol,
          price: quote.last_price,
          open: quote.ohlc.open,
          high: quote.ohlc.high,
          low: quote.ohlc.low,
          close: quote.ohlc.close,
          volume: quote.volume,
          timestamp: new Date(quote.timestamp),
          change: quote.last_price - quote.ohlc.close,
          changePercent:
            ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100,
        };
      }
    }

    return result;
  }

  async getHistoricalData(
    symbol: string,
    days: number = 100,
    interval: "minute" | "60minute" | "day" | "week" = "day",
  ): Promise<HistoricalData> {
    const instrumentToken = this.getInstrumentToken(symbol);

    if (!instrumentToken) {
      throw new Error(`Instrument token not found for ${symbol}`);
    }

    const toDate = new Date();
    let fromDate: Date;

    if (interval === "minute" || interval === "60minute") {
      fromDate = new Date(Date.now() - Math.min(days, 60) * 24 * 60 * 60 * 1000);
    } else {
      fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    const data = await this.kite.getHistoricalData(
      instrumentToken,
      interval,
      fromDate,
      toDate,
    );

    return {
      dates: data.map((d: any) => d.date),
      opens: data.map((d: any) => d.open),
      highs: data.map((d: any) => d.high),
      lows: data.map((d: any) => d.low),
      closes: data.map((d: any) => d.close),
      volumes: data.map((d: any) => d.volume),
    };
  }

  getNSE500Symbols(): string[] {
    return this.instrumentsCache
      .filter((i) => {
        if (i.instrument_type !== "EQ" || i.exchange !== "NSE") return false;
        const name = (i.name || "").toUpperCase();
        const sym = (i.tradingsymbol || "").toUpperCase();
        if (
          name.includes("ETF") ||
          name.includes("BEES") ||
          name.includes(" FUND") ||
          name.includes("GOLD") ||
          name.includes("SGB")
        )
          return false;
        if (
          sym.startsWith("NIFTY") ||
          sym.startsWith("SENSEX") ||
          sym.startsWith("HANGSENG") ||
          sym.startsWith("MON100") ||
          sym.startsWith("MAFANG")
        )
          return false;
        if (
          sym.endsWith("BEES") ||
          sym.endsWith("GOLD") ||
          sym.endsWith("BENCHMARK")
        )
          return false;
        if (sym.length > 20) return false;
        return true;
      })
      .map((i) => i.tradingsymbol);
  }

  async getTopGainers(limit: number = 50): Promise<string[]> {
    const liquidStocks = this.instrumentsCache
      .filter(
        (i) =>
          i.instrument_type === "EQ" &&
          i.exchange === "NSE" &&
          i.lot_size === 1,
      )
      .map((i) => i.tradingsymbol);

    const topLiquid = liquidStocks.slice(0, 200);
    const quotes = await this.getQuotes(topLiquid);

    const gainers = Object.entries(quotes)
      .filter(([_, quote]) => quote.changePercent > 0)
      .sort((a, b) => b[1].changePercent - a[1].changePercent)
      .slice(0, limit)
      .map(([symbol, _]) => symbol);

    return gainers;
  }

  async getTopLosers(limit: number = 50): Promise<string[]> {
    const liquidStocks = this.instrumentsCache
      .filter(
        (i) =>
          i.instrument_type === "EQ" &&
          i.exchange === "NSE" &&
          i.lot_size === 1,
      )
      .map((i) => i.tradingsymbol);

    const topLiquid = liquidStocks.slice(0, 200);
    const quotes = await this.getQuotes(topLiquid);

    const losers = Object.entries(quotes)
      .filter(([_, quote]) => quote.changePercent < 0)
      .sort((a, b) => a[1].changePercent - b[1].changePercent)
      .slice(0, limit)
      .map(([symbol, _]) => symbol);

    return losers;
  }

  async getHighVolumeStocks(limit: number = 50): Promise<string[]> {
    const liquidStocks = this.instrumentsCache
      .filter(
        (i) =>
          i.instrument_type === "EQ" &&
          i.exchange === "NSE" &&
          i.lot_size === 1,
      )
      .map((i) => i.tradingsymbol);

    const topLiquid = liquidStocks.slice(0, 200);
    const quotes = await this.getQuotes(topLiquid);

    const highVolume = Object.entries(quotes)
      .filter(([_, quote]) => quote.volume > 500000)
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, limit)
      .map(([symbol, _]) => symbol);

    return highVolume;
  }

  async getNear52WeekHigh(limit: number = 50): Promise<string[]> {
    const liquidStocks = this.instrumentsCache
      .filter(
        (i) =>
          i.instrument_type === "EQ" &&
          i.exchange === "NSE" &&
          i.lot_size === 1,
      )
      .map((i) => i.tradingsymbol)
      .slice(0, 100);

    const near52High: string[] = [];

    for (const symbol of liquidStocks) {
      try {
        const historical = await this.getHistoricalData(symbol, 252);
        const high52w = Math.max(...historical.highs);
        const currentPrice = historical.closes[historical.closes.length - 1];

        if (currentPrice >= high52w * 0.95) {
          near52High.push(symbol);
        }

        if (near52High.length >= limit) break;
      } catch {
        continue;
      }
    }

    return near52High;
  }

  getInstrumentIdentifier(
    symbol: string,
    exchange: string = "NSE",
  ): string | null {
    const instrument = this.instrumentsCache.find(
      (i) =>
        i.tradingsymbol === symbol &&
        i.instrument_type === "EQ" &&
        i.exchange === exchange,
    );
    if (!instrument) return null;
    return `${exchange}:${instrument.instrument_token}`;
  }

  private getInstrumentToken(symbol: string): number | null {
    const instrument = this.instrumentsCache.find(
      (i) => i.tradingsymbol === symbol && i.instrument_type === "EQ",
    );
    return instrument?.instrument_token || null;
  }

  isMarketOpen(): boolean {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    });
    const istTime = new Date(now);
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const day = istTime.getDay();

    if (day === 0 || day === 6) return false;

    const currentTime = hours * 60 + minutes;
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;

    return currentTime >= marketOpen && currentTime <= marketClose;
  }

  getMarketStatus(): string {
    return this.isMarketOpen() ? "OPEN" : "CLOSED";
  }
}

export async function generateAccessToken() {
  console.log("\n🔐 Zerodha OAuth Token Generator\n");

  const apiKey = process.env.ZERODHA_API_KEY;
  const apiSecret = process.env.ZERODHA_API_SECRET;
  const requestToken = process.env.ZERODHA_REQUEST_TOKEN;

  if (!apiKey || !apiSecret) {
    console.error(
      "❌ Please set ZERODHA_API_KEY and ZERODHA_API_SECRET in .env file",
    );
    process.exit(1);
  }

  if (!requestToken) {
    console.log("📝 Steps to get access token:");
    console.log("1. Visit: https://kite.trade/connect/login?api_key=" + apiKey);
    console.log("2. Login and authorize the app");
    console.log("3. Copy the request_token from the redirect URL");
    console.log("4. Set ZERODHA_REQUEST_TOKEN in .env file");
    console.log("5. Run this script again");
    process.exit(0);
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    const session = await kite.generateSession(requestToken, apiSecret);

    console.log("✅ Access Token generated successfully!\n");
    console.log("Add this to your .env file:");
    console.log(`ZERODHA_ACCESS_TOKEN=${session.access_token}\n`);
    console.log(
      "⚠️  Note: Access token expires daily. You need to regenerate it every day.",
    );
  } catch (error: any) {
    console.error("❌ Error generating access token:", error.message);
    console.log(
      "\n💡 Tip: Make sure the request_token is fresh (valid for only 2 minutes)",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateAccessToken();
}
