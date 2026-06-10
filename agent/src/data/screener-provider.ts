import axios, { type AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import type {
  FundamentalsProvider,
  ProviderFundamentals,
} from "./fundamentals-provider.js";

const SCREENER_BASE = "https://www.screener.in";
const DEFAULT_DELAY_MS = 450;

export class ScreenerFundamentalsProvider implements FundamentalsProvider {
  private http: AxiosInstance;
  private lastRequestAt = 0;
  private companyUrlCache = new Map<string, string>();
  private readonly requestDelayMs: number;

  constructor(requestDelayMs = DEFAULT_DELAY_MS) {
    this.requestDelayMs = requestDelayMs;
    this.http = axios.create({
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
  }

  async fetchFundamentals(
    symbol: string,
  ): Promise<ProviderFundamentals | null> {
    await this.throttle();

    const pageUrl = await this.resolveCompanyUrl(symbol);
    if (!pageUrl) {
      console.warn(`   Screener: no company found for ${symbol}`);
      return null;
    }

    await this.throttle();
    const html = await this.fetchPage(pageUrl);
    if (!html) return null;

    const $ = cheerio.load(html);
    const top = this.parseTopRatios($);
    const shareholding = this.parsePromoterShareholding($);
    const growth = this.parseAnnualGrowth($);
    const debtToEquity = this.parseDebtToEquity($);
    const netMargin = this.parseNetProfitMargin($);

    const currentPrice = top.currentPrice;
    const bookValue = top.bookValue;
    const pb =
      currentPrice != null && bookValue != null && bookValue > 0
        ? round(currentPrice / bookValue, 2)
        : null;

    return {
      symbol,
      currentPrice: currentPrice ?? undefined,
      pe: top.pe ?? undefined,
      pb: pb ?? undefined,
      marketCap: top.marketCap ?? undefined,
      dividendYield: top.dividendYield ?? undefined,
      roe: top.roe ?? undefined,
      roa: top.roce ?? undefined,
      netMargin: netMargin ?? undefined,
      revenueGrowth: growth.revenueGrowth ?? undefined,
      profitGrowth: growth.profitGrowth ?? undefined,
      epsGrowth: growth.profitGrowth ?? undefined,
      debtToEquity: debtToEquity ?? undefined,
      promoterHolding: shareholding.promoterHolding ?? undefined,
      promoterChange: shareholding.promoterChange ?? undefined,
    };
  }

  private async resolveCompanyUrl(symbol: string): Promise<string | null> {
    const cached = this.companyUrlCache.get(symbol);
    if (cached) return cached;

    try {
      const res = await this.http.get(`${SCREENER_BASE}/api/company/search/`, {
        params: { q: symbol, limit: 8 },
      });
      const results: { url: string; name: string }[] = res.data ?? [];
      const symUpper = symbol.toUpperCase();

      const exact = results.find((r) => {
        const slug = r.url.split("/company/")[1]?.split("/")[0]?.toUpperCase();
        return slug === symUpper;
      });
      const pick = exact ?? results[0];
      if (!pick?.url) return null;

      const path = pick.url.endsWith("/") ? pick.url : `${pick.url}/`;
      const url = `${SCREENER_BASE}${path}`;
      this.companyUrlCache.set(symbol, url);
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   Screener search failed for ${symbol}:`, message);
      return null;
    }
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const res = await this.http.get(url, {
        headers: { Accept: "text/html" },
        responseType: "text",
      });
      return res.data as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   Screener page fetch failed:`, message);
      return null;
    }
  }

  private parseTopRatios($: cheerio.CheerioAPI): {
    marketCap: number | null;
    currentPrice: number | null;
    bookValue: number | null;
    pe: number | null;
    dividendYield: number | null;
    roce: number | null;
    roe: number | null;
  } {
    const ratios: Record<string, number> = {};

    $("#top-ratios li").each((_, el) => {
      const name = $(el).find(".name").first().text().trim();
      const raw = $(el).find(".number").first().text().trim();
      const value = parseIndianNumber(raw);
      if (name && value != null) ratios[name] = value;
    });

    const highLow = $("#top-ratios li")
      .filter((_, el) => $(el).find(".name").text().trim() === "High / Low")
      .find(".number")
      .map((_, el) => parseIndianNumber($(el).text()))
      .get()
      .filter((n): n is number => n != null);

    if (highLow.length >= 2) {
      // stored for potential future use (52w range)
      void highLow;
    }

    return {
      marketCap: ratios["Market Cap"] ?? null,
      currentPrice: ratios["Current Price"] ?? null,
      bookValue: ratios["Book Value"] ?? null,
      pe: ratios["Stock P/E"] ?? null,
      dividendYield: ratios["Dividend Yield"] ?? null,
      roce: ratios["ROCE"] ?? null,
      roe: ratios["ROE"] ?? null,
    };
  }

  private parsePromoterShareholding($: cheerio.CheerioAPI): {
    promoterHolding: number | null;
    promoterChange: number | null;
  } {
    let promoterHolding: number | null = null;
    let promoterChange: number | null = null;

    $("#quarterly-shp table tbody tr").each((_, row) => {
      const label = $(row).find("td.text").first().text().trim();
      if (!label.toLowerCase().startsWith("promoter")) return;

      const values = $(row)
        .find("td")
        .slice(1)
        .map((__, cell) => parsePercent($(cell).text()))
        .get()
        .filter((v): v is number => v != null);

      if (values.length > 0) {
        promoterHolding = values[values.length - 1];
        if (values.length >= 2) {
          promoterChange = round(
            values[values.length - 1] - values[values.length - 2],
            2,
          );
        }
      }
    });

    return { promoterHolding, promoterChange };
  }

  private parseAnnualGrowth($: cheerio.CheerioAPI): {
    revenueGrowth: number | null;
    profitGrowth: number | null;
  } {
    const section = $("#profit-loss table tbody");
    let sales: number[] = [];
    let netProfit: number[] = [];

    section.find("tr").each((_, row) => {
      const label = $(row).find("td.text").first().text().trim().toLowerCase();
      const nums = $(row)
        .find("td")
        .slice(1)
        .map((__, cell) => parseIndianNumber($(cell).text()))
        .get()
        .filter((n): n is number => n != null);

      if (label.startsWith("sales")) sales = nums;
      if (label.startsWith("net profit")) netProfit = nums;
    });

    return {
      revenueGrowth: yoyGrowthPercent(sales),
      profitGrowth: yoyGrowthPercent(netProfit),
    };
  }

  private parseDebtToEquity($: cheerio.CheerioAPI): number | null {
    let borrowings: number | null = null;
    let equityCapital: number | null = null;
    let reserves: number | null = null;

    $("#balance-sheet table tbody tr").each((_, row) => {
      const label = $(row).find("td.text").first().text().trim().toLowerCase();
      const cells = $(row)
        .find("td")
        .slice(1)
        .map((__, cell) => parseIndianNumber($(cell).text()))
        .get()
        .filter((n): n is number => n != null);
      const latest = cells.length > 0 ? cells[cells.length - 1] : null;

      if (label.includes("borrowing")) borrowings = latest;
      if (label === "equity capital") equityCapital = latest;
      if (label === "reserves") reserves = latest;
    });

    const equity = (equityCapital ?? 0) + (reserves ?? 0);
    if (borrowings == null || equity <= 0) return null;
    return round(borrowings / equity, 2);
  }

  private parseNetProfitMargin($: cheerio.CheerioAPI): number | null {
    const section = $("#profit-loss table tbody");
    let sales: number[] = [];
    let netProfit: number[] = [];

    section.find("tr").each((_, row) => {
      const label = $(row).find("td.text").first().text().trim().toLowerCase();
      const nums = $(row)
        .find("td")
        .slice(1)
        .map((__, cell) => parseIndianNumber($(cell).text()))
        .get()
        .filter((n): n is number => n != null);

      if (label.startsWith("sales")) sales = nums;
      if (label.startsWith("net profit")) netProfit = nums;
    });

    if (sales.length === 0 || netProfit.length === 0) return null;
    const s = sales[sales.length - 1];
    const p = netProfit[netProfit.length - 1];
    if (s <= 0) return null;
    return round((p / s) * 100, 2);
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.requestDelayMs) {
      await sleep(this.requestDelayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

function parseIndianNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePercent(raw: string): number | null {
  const n = parseIndianNumber(raw.replace("%", ""));
  return n;
}

function yoyGrowthPercent(series: number[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const latest = series[series.length - 1];
  if (prev === 0) return null;
  return round(((latest - prev) / Math.abs(prev)) * 100, 2);
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
