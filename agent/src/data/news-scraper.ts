/**
 * Indian market news scraping agent.
 *
 * Sources: NSE/BSE corporate announcements, RSS feeds (ET, MC, BS, Mint),
 * Yahoo Finance, Google News, optional Reddit sentiment.
 *
 * `NewsScraperAgent` preserves the existing scrapeNews / getCompanyName API.
 * `IndianNewsAgent` + `createNewsAgent` support polling-based workflows.
 */

import axios, { type AxiosInstance } from "axios";
import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "../types/index.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RawNewsItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: Date;
  source: string;
  tickers: string[];
  sentiment?: "positive" | "negative" | "neutral";
}

export interface CorporateAnnouncement {
  symbol: string;
  company: string;
  subject: string;
  description: string;
  date: Date;
  exchange: "NSE" | "BSE";
  filingUrl?: string;
}

export interface NewsAgentConfig {
  watchlist: string[];
  pollIntervalMs?: number;
  enableSentiment?: boolean;
  enableReddit?: boolean;
  onNews?: (items: RawNewsItem[]) => void;
  onAnnouncement?: (items: CorporateAnnouncement[]) => void;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const RSS_FEEDS: Record<string, string> = {
  "Economic Times Markets":
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  "Economic Times Stocks":
    "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  "Moneycontrol Latest": "https://www.moneycontrol.com/rss/latestnews.xml",
  "Moneycontrol Markets": "https://www.moneycontrol.com/rss/marketreports.xml",
  "Business Standard Markets":
    "https://www.business-standard.com/rss/markets-106.rss",
  "LiveMint Markets": "https://www.livemint.com/rss/markets",
  "NDTV Profit": "https://www.ndtvprofit.com/rss",
  "Financial Express Market": "https://www.financialexpress.com/market/feed/",
  "Hindu BusinessLine":
    "https://www.thehindubusinessline.com/markets/?service=rss",
};

const NSE_BASE = "https://www.nseindia.com";
const NSE_ANNOUNCEMENTS_API =
  "https://www.nseindia.com/api/corporate-announcements?index=equities";

const BSE_ANNOUNCEMENTS_API =
  "https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C&subcategory=-1";

// Alternative NSE endpoint that doesn't require cookies (less data but more reliable)
const NSE_ALTERNATIVE_API = "https://www.nseindia.com/api/merged-daily-reports?key=favmerged";

const POSITIVE_WORDS = [
  "profit",
  "growth",
  "surge",
  "record",
  "beat",
  "upgrade",
  "buy",
  "strong",
  "rally",
  "gains",
  "outperform",
  "bullish",
  "dividend",
  "expansion",
  "partnership",
  "order",
  "win",
  "award",
  "approves",
];

const NEGATIVE_WORDS = [
  "loss",
  "decline",
  "fall",
  "miss",
  "downgrade",
  "sell",
  "weak",
  "penalty",
  "sebi",
  "fraud",
  "investigation",
  "suspend",
  "crash",
  "debt",
  "default",
  "downfall",
  "bearish",
  "concern",
  "risk",
];

export const COMPANY_MAPPING: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  HDFCBANK: "HDFC Bank",
  INFY: "Infosys",
  ICICIBANK: "ICICI Bank",
  HINDUNILVR: "Hindustan Unilever",
  ITC: "ITC Limited",
  SBIN: "State Bank of India",
  BHARTIARTL: "Bharti Airtel",
  KOTAKBANK: "Kotak Mahindra Bank",
  LT: "Larsen & Toubro",
  AXISBANK: "Axis Bank",
  ASIANPAINT: "Asian Paints",
  MARUTI: "Maruti Suzuki",
  BAJFINANCE: "Bajaj Finance",
  HCLTECH: "HCL Technologies",
  WIPRO: "Wipro",
  TITAN: "Titan Company",
  SUNPHARMA: "Sun Pharma",
  ULTRACEMCO: "UltraTech Cement",
  TATAMOTORS: "Tata Motors",
  TATASTEEL: "Tata Steel",
  TECHM: "Tech Mahindra",
  POWERGRID: "Power Grid",
  NTPC: "NTPC",
  NESTLEIND: "Nestle India",
  ADANIPORTS: "Adani Ports",
  ONGC: "ONGC",
  JSWSTEEL: "JSW Steel",
  INDUSINDBK: "IndusInd Bank",
  DRREDDY: "Dr Reddy",
  "M&M": "Mahindra & Mahindra",
  CIPLA: "Cipla",
  COALINDIA: "Coal India",
  GRASIM: "Grasim Industries",
  DIVISLAB: "Divis Lab",
  BRITANNIA: "Britannia",
  EICHERMOT: "Eicher Motors",
  SHREECEM: "Shree Cement",
  UPL: "UPL",
  HINDALCO: "Hindalco",
  "BAJAJ-AUTO": "Bajaj Auto",
  HEROMOTOCO: "Hero MotoCorp",
  APOLLOHOSP: "Apollo Hospital",
  SBILIFE: "SBI Life",
  HDFCLIFE: "HDFC Life",
  TATACONSUM: "Tata Consumer",
  ADANIENT: "Adani Enterprises",
  BPCL: "BPCL",
};

// ─────────────────────────────────────────────
// Core agent
// ─────────────────────────────────────────────

export class IndianNewsAgent {
  private config: Required<NewsAgentConfig>;
  private http: AxiosInstance;
  private nseHttp: AxiosInstance;
  private xmlParser: XMLParser;
  private seenUrls = new Set<string>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private nseCookies = "";

  constructor(config: NewsAgentConfig) {
    this.config = {
      pollIntervalMs: 5 * 60 * 1000,
      enableSentiment: true,
      enableReddit: false,
      onNews: () => {},
      onAnnouncement: () => {},
      ...config,
    };

    this.http = axios.create({
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    this.nseHttp = axios.create({
      timeout: 15_000,
      baseURL: NSE_BASE,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://www.nseindia.com/",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
    });

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
    });
  }

  async start(): Promise<void> {
    console.log("[IndianNewsAgent] Starting…");
    await this.refreshNseCookies();
    await this.poll();
    this.pollTimer = setInterval(
      () => void this.poll(),
      this.config.pollIntervalMs,
    );
    console.log(
      `[IndianNewsAgent] Polling every ${this.config.pollIntervalMs / 1000}s`,
    );
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      console.log("[IndianNewsAgent] Stopped.");
    }
  }

  private async poll(): Promise<void> {
    const [rssNews, nseAnns, bseAnns, yahooNews, redditItems] =
      await Promise.allSettled([
        this.fetchAllRssFeeds(),
        this.fetchNseAnnouncements(),
        this.fetchBseAnnouncements(),
        this.fetchYahooFinanceNews(),
        this.config.enableReddit
          ? this.fetchRedditSentiment()
          : Promise.resolve([]),
      ]);

    const allNews: RawNewsItem[] = [
      ...(rssNews.status === "fulfilled" ? rssNews.value : []),
      ...(yahooNews.status === "fulfilled" ? yahooNews.value : []),
      ...(redditItems.status === "fulfilled" ? redditItems.value : []),
    ].filter((n) => !this.seenUrls.has(n.url));

    const allAnns: CorporateAnnouncement[] = [
      ...(nseAnns.status === "fulfilled" ? nseAnns.value : []),
      ...(bseAnns.status === "fulfilled" ? bseAnns.value : []),
    ];

    allNews.forEach((n) => this.seenUrls.add(n.url));

    const relevantNews = allNews.filter(
      (n) =>
        n.tickers.length === 0 ||
        n.tickers.some((t) => this.config.watchlist.includes(t)),
    );

    if (relevantNews.length > 0) {
      console.log(`[IndianNewsAgent] ${relevantNews.length} new news items`);
      this.config.onNews(relevantNews);
    }

    const relevantAnns = allAnns.filter((a) =>
      this.config.watchlist.includes(a.symbol),
    );
    if (relevantAnns.length > 0) {
      console.log(`[IndianNewsAgent] ${relevantAnns.length} new announcements`);
      this.config.onAnnouncement(relevantAnns);
    }
  }

  private async loadSavedCookies(): Promise<boolean> {
    try {
      // Try to load cookies from the refresh script's cache
      const cookiePath = ".nse-cookies.json";
      const fs = await import("fs");

      if (fs.existsSync(cookiePath)) {
        const data = fs.readFileSync(cookiePath, "utf8");
        const cookieData = JSON.parse(data);

        // Check if cookies are not too old (< 20 minutes)
        const age = Date.now() - new Date(cookieData.timestamp).getTime();
        const ageMinutes = Math.floor(age / 60000);

        if (ageMinutes < 20) {
          this.nseCookies = cookieData.cookies;
          this.nseHttp.defaults.headers.common["Cookie"] = this.nseCookies;
          this.nseHttp.defaults.headers.common["User-Agent"] = cookieData.userAgent;
          console.log(`[IndianNewsAgent] Loaded cached NSE cookies (${ageMinutes}min old)`);
          return true;
        } else {
          console.log(`[IndianNewsAgent] Cached cookies too old (${ageMinutes}min)`);
        }
      }
    } catch (err) {
      // Ignore errors, will try fresh refresh
    }
    return false;
  }

  private async refreshNseCookies(retries = 3): Promise<void> {
    // First, try to load saved cookies
    const loaded = await this.loadSavedCookies();
    if (loaded) return;

    // If no saved cookies or expired, try to get fresh ones
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Add delay between retries to avoid rate limiting
        if (attempt > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, 2000 * Math.pow(2, attempt)),
          );
        }

        const res = await this.nseHttp.get("/", {
          validateStatus: (status) => status === 200,
        });

        const setCookieHeader = res.headers["set-cookie"];
        if (setCookieHeader) {
          this.nseCookies = setCookieHeader
            .map((c: string) => c.split(";")[0])
            .join("; ");
          this.nseHttp.defaults.headers.common["Cookie"] = this.nseCookies;
          console.log("[IndianNewsAgent] NSE session cookie refreshed.");

          // Save cookies for future use
          try {
            const fs = await import("fs");
            const cookieData = {
              cookies: this.nseCookies,
              userAgent: this.nseHttp.defaults.headers.common["User-Agent"],
              timestamp: new Date().toISOString(),
            };
            fs.writeFileSync(".nse-cookies.json", JSON.stringify(cookieData, null, 2));
          } catch (err) {
            // Ignore save errors
          }

          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === retries - 1) {
          console.warn(
            `[IndianNewsAgent] NSE cookie refresh failed after ${retries} attempts:`,
            message,
          );
          console.warn(
            "[IndianNewsAgent] Run 'node refresh-nse-cookies.js --save' to manually refresh cookies.",
          );
          console.warn(
            "[IndianNewsAgent] Will skip NSE announcements and use other sources.",
          );
        }
      }
    }
  }

  private async fetchNseAnnouncements(): Promise<CorporateAnnouncement[]> {
    // Skip NSE if we don't have cookies
    if (!this.nseCookies) {
      console.warn(
        "[IndianNewsAgent] Skipping NSE announcements - no valid session",
      );
      return [];
    }

    try {
      // Add small delay before API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      const res = await this.nseHttp.get(NSE_ANNOUNCEMENTS_API, {
        validateStatus: (status) => status === 200,
      });
      const data: Record<string, unknown>[] = res.data?.data ?? [];

      console.log("[IndianNewsAgent] NSE announcements fetched:", data.length);
      return data.slice(0, 50).map((item) => ({
        symbol: String(item.symbol ?? ""),
        company: String(item.comp ?? ""),
        subject: String(item.subject ?? ""),
        description: String(item.body ?? item.subject ?? ""),
        date: new Date(String(item.sort_date ?? item.an_dt ?? Date.now())),
        exchange: "NSE" as const,
        filingUrl: item.attchmntFile
          ? `https://nseindia.com/${String(item.attchmntFile)}`
          : undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[IndianNewsAgent] NSE announcements error:", message);
      console.warn("[IndianNewsAgent] Trying alternative NSE endpoint...");
      return this.fetchNseAlternative();
    }
  }

  private async fetchNseAlternative(): Promise<CorporateAnnouncement[]> {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // This endpoint is more reliable but provides less detailed data
      const res = await this.http.get(NSE_ALTERNATIVE_API, {
        validateStatus: (status) => status === 200,
      });

      const data: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
      console.log("[IndianNewsAgent] Alternative NSE data fetched:", data.length);

      // Transform the alternative format to our announcement format
      return data.slice(0, 30).map((item) => ({
        symbol: String(item.symbol ?? ""),
        company: String(item.companyName ?? ""),
        subject: "Market Activity Update",
        description: `Trading data update for ${String(item.symbol ?? "")}`,
        date: new Date(),
        exchange: "NSE" as const,
      }));
    } catch (err) {
      console.warn("[IndianNewsAgent] Alternative NSE endpoint also failed");
      return [];
    }
  }

  private async fetchBseAnnouncements(): Promise<CorporateAnnouncement[]> {
    try {
      const res = await this.http.get(BSE_ANNOUNCEMENTS_API);
      const data: Record<string, unknown>[] = res.data?.Table ?? [];
      console.log("[IndianNewsAgent] BSE announcements fetched:", data.length);

      return data.slice(0, 50).map((item) => ({
        symbol: String(item.SCRIP_CD ?? ""),
        company: String(item.LONG_NAME ?? ""),
        subject: String(item.HEADLINE ?? ""),
        description: String(item.HEADLINE ?? ""),
        date: new Date(String(item.News_submission_dt ?? Date.now())),
        exchange: "BSE" as const,
        filingUrl: item.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${String(item.ATTACHMENTNAME)}`
          : undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[IndianNewsAgent] BSE announcements error:", message);
      return [];
    }
  }

  private async fetchAllRssFeeds(): Promise<RawNewsItem[]> {
    const results = await Promise.allSettled(
      Object.entries(RSS_FEEDS).map(([source, url]) =>
        this.fetchRssFeed(source, url),
      ),
    );

    return results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  private async fetchRssFeed(
    source: string,
    url: string,
  ): Promise<RawNewsItem[]> {
    try {
      const res = await this.http.get(url, {
        headers: { Accept: "application/rss+xml, text/xml" },
        responseType: "text",
      });

      const parsed = this.xmlParser.parse(res.data as string);
      const items: Record<string, unknown>[] =
        parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];

      const normalized = Array.isArray(items) ? items : [items];

      return normalized.map((item) => {
        const title = String(item.title ?? "");
        const description = String(item.description ?? item.summary ?? "");
        const link =
          typeof item.link === "string"
            ? item.link
            : String(
                (item.link as Record<string, unknown>)?.["#text"] ??
                  (item.link as Record<string, unknown>)?.href ??
                  "",
              );
        const pubDate = String(
          item.pubDate ?? item.published ?? item.updated ?? "",
        );

        const text = `${title} ${description}`;
        return {
          title,
          summary: description.replace(/<[^>]+>/g, "").slice(0, 300),
          url: link,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          source,
          tickers: this.extractTickers(text),
          sentiment: this.config.enableSentiment
            ? this.scoreSentiment(text)
            : undefined,
        } satisfies RawNewsItem;
      });
    } catch {
      return [];
    }
  }

  private async fetchYahooFinanceNews(): Promise<RawNewsItem[]> {
    const results = await Promise.allSettled(
      this.config.watchlist.map((symbol) =>
        this.fetchRssFeed(
          `Yahoo Finance (${symbol})`,
          `https://finance.yahoo.com/rss/headline?s=${symbol}.NS`,
        ),
      ),
    );

    return results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  async fetchGoogleNews(
    symbol: string,
    company: string,
  ): Promise<RawNewsItem[]> {
    const query = encodeURIComponent(`${company} NSE stock`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
    return this.fetchRssFeed(`Google News (${symbol})`, url);
  }

  private async fetchRedditSentiment(): Promise<RawNewsItem[]> {
    try {
      const res = await this.http.get(
        "https://www.reddit.com/r/IndianStockMarket/new.json?limit=25",
        { headers: { Accept: "application/json" } },
      );
      const posts: { data: Record<string, unknown> }[] =
        res.data?.data?.children ?? [];

      return posts.map((post) => {
        const d = post.data;
        const text = `${String(d.title ?? "")} ${String(d.selftext ?? "")}`;
        return {
          title: String(d.title ?? ""),
          summary: String(d.selftext ?? "").slice(0, 300),
          url: `https://reddit.com${String(d.permalink ?? "")}`,
          publishedAt: new Date(Number(d.created_utc ?? 0) * 1000),
          source: "Reddit r/IndianStockMarket",
          tickers: this.extractTickers(text),
          sentiment: this.config.enableSentiment
            ? this.scoreSentiment(text)
            : undefined,
        } satisfies RawNewsItem;
      });
    } catch {
      return [];
    }
  }

  extractTickers(text: string): string[] {
    const found = new Set<string>();

    const prefixed = text.match(/[$₹]([A-Z]{2,12})/g) ?? [];
    prefixed.forEach((m) => found.add(m.slice(1)));

    this.config.watchlist.forEach((sym) => {
      if (
        new RegExp(`\\b${sym}\\b`, "i").test(text) ||
        text.toUpperCase().includes(sym)
      ) {
        found.add(sym);
      }
    });

    const stockWords =
      /(?:shares?|stock|NSE|BSE|equity|scrip|listed|rally|gains?|falls?|surges?|declines?)\s+(?:of\s+)?([A-Z]{2,12})/g;
    let match: RegExpExecArray | null;
    while ((match = stockWords.exec(text)) !== null) {
      found.add(match[1]);
    }

    return [...found].filter((t) => t.length >= 2 && t.length <= 12);
  }

  scoreSentiment(text: string): "positive" | "negative" | "neutral" {
    const lower = text.toLowerCase();
    const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
    const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;
    if (pos > neg) return "positive";
    if (neg > pos) return "negative";
    return "neutral";
  }

  async getAnnouncementsForSymbol(
    symbol: string,
  ): Promise<CorporateAnnouncement[]> {
    // Try to refresh cookies if we don't have them
    if (!this.nseCookies) {
      await this.refreshNseCookies();
    }

    // Skip if still no cookies after refresh attempt
    if (!this.nseCookies) {
      console.warn(
        `[IndianNewsAgent] Skipping NSE announcements for ${symbol} - no valid session`,
      );
      return [];
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const url = `${NSE_ANNOUNCEMENTS_API}&symbol=${symbol}`;
      const res = await this.nseHttp.get(url, {
        validateStatus: (status) => status === 200,
      });
      const data: Record<string, unknown>[] = res.data?.data ?? [];
      return data.map((item) => ({
        symbol,
        company: String(item.comp ?? ""),
        subject: String(item.subject ?? ""),
        description: String(item.body ?? item.subject ?? ""),
        date: new Date(String(item.sort_date ?? item.an_dt ?? Date.now())),
        exchange: "NSE" as const,
        filingUrl: item.attchmntFile
          ? `https://nseindia.com/${String(item.attchmntFile)}`
          : undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[IndianNewsAgent] NSE announcements error for ${symbol}:`,
        message,
      );
      return [];
    }
  }

  async getNewsForSymbol(
    symbol: string,
    company?: string,
  ): Promise<RawNewsItem[]> {
    // Prioritize sources that don't require NSE cookies
    const [yahoo, google, rss, anns] = await Promise.allSettled([
      this.fetchRssFeed(
        `Yahoo Finance (${symbol})`,
        `https://finance.yahoo.com/rss/headline?s=${symbol}.NS`,
      ),
      company ? this.fetchGoogleNews(symbol, company) : Promise.resolve([]),
      this.fetchAllRssFeeds(),
      // NSE announcements are fetched last and may fail
      this.getAnnouncementsForSymbol(symbol),
    ]);

    const newsFromAnns: RawNewsItem[] = (
      anns.status === "fulfilled" ? anns.value : []
    ).map((a) => ({
      title: a.subject,
      summary: a.description,
      url: a.filingUrl ?? "https://www.nseindia.com",
      publishedAt: a.date,
      source: "NSE Corporate Announcements",
      tickers: [a.symbol],
      sentiment: this.config.enableSentiment
        ? this.scoreSentiment(a.subject)
        : undefined,
    }));

    const rssFiltered =
      rss.status === "fulfilled"
        ? rss.value.filter(
            (item) =>
              item.tickers.includes(symbol) ||
              (company
                ? `${item.title} ${item.summary}`
                    .toLowerCase()
                    .includes(company.toLowerCase())
                : false),
          )
        : [];

    const allNews = [
      ...(yahoo.status === "fulfilled" ? yahoo.value : []),
      ...(google.status === "fulfilled" ? google.value : []),
      ...newsFromAnns,
      ...rssFiltered,
    ];

    console.log(
      `[IndianNewsAgent] Total news for ${symbol}: ${allNews.length} (Yahoo: ${yahoo.status === "fulfilled" ? yahoo.value.length : 0}, Google: ${google.status === "fulfilled" ? google.value.length : 0}, RSS: ${rssFiltered.length}, NSE: ${newsFromAnns.length})`,
    );

    return allNews.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }
}

export function createNewsAgent(config: NewsAgentConfig): IndianNewsAgent {
  return new IndianNewsAgent(config);
}

// ─────────────────────────────────────────────
// Backward-compatible wrapper for existing code
// ─────────────────────────────────────────────

export class NewsScraperAgent {
  mapping: Record<string, string> = { ...COMPANY_MAPPING };

  private agent: IndianNewsAgent;

  constructor() {
    this.agent = new IndianNewsAgent({
      watchlist: Object.keys(this.mapping),
      enableSentiment: true,
      enableReddit: false,
    });
  }

  getCompanyName(symbol: string): string {
    return this.mapping[symbol] || symbol;
  }

  async scrapeNews(symbol: string, companyName?: string): Promise<NewsItem[]> {
    console.log(`📰 Scraping real news for ${symbol}...`);

    const company = companyName ?? this.getCompanyName(symbol);
    const rawItems = await this.agent.getNewsForSymbol(symbol, company);

    const seen = new Set<string>();
    const newsItems = rawItems
      .filter((item) => {
        if (!item.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .map((item) => this.toNewsItem(item));

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentNews = newsItems.filter(
      (n) => n.publishedAt.getTime() > sevenDaysAgo,
    );

    console.log(`   Found ${recentNews.length} news items from last 7 days`);
    return recentNews;
  }

  private toNewsItem(item: RawNewsItem): NewsItem {
    const text = `${item.title} ${item.summary}`;
    return {
      title: item.title,
      description: item.summary,
      url: item.url,
      publishedAt: item.publishedAt,
      source: item.source,
      sentiment: this.normalizeSentiment(item.sentiment, text),
      importance: this.detectImportance(item.title),
      category: this.detectCategory(item.title),
    };
  }

  private normalizeSentiment(
    sentiment: RawNewsItem["sentiment"],
    text: string,
  ): NewsItem["sentiment"] {
    const scored = sentiment ?? this.agent.scoreSentiment(text);
    if (scored === "positive") return "POSITIVE";
    if (scored === "negative") return "NEGATIVE";
    return "NEUTRAL";
  }

  private detectImportance(title: string): NewsItem["importance"] {
    const lower = title.toLowerCase();

    const highKeywords = [
      "result",
      "profit",
      "revenue",
      "earning",
      "quarter",
      "q1",
      "q2",
      "q3",
      "q4",
      "dividend",
      "bonus",
      "split",
      "buyback",
      "acquisition",
      "merger",
      "promoter",
      "insider",
      "stake",
      "fii",
      "dii",
      "block deal",
      "bulk deal",
      "record",
      "beat",
      "miss",
      "guidance",
      "outlook",
    ];

    const mediumKeywords = [
      "launch",
      "expansion",
      "contract",
      "deal",
      "order",
      "partnership",
      "upgrade",
      "downgrade",
      "rating",
      "target",
      "recommendation",
    ];

    for (const keyword of highKeywords) {
      if (lower.includes(keyword)) return "HIGH";
    }

    for (const keyword of mediumKeywords) {
      if (lower.includes(keyword)) return "MEDIUM";
    }

    return "LOW";
  }

  private detectCategory(title: string): NewsItem["category"] {
    const lower = title.toLowerCase();

    if (
      lower.includes("result") ||
      lower.includes("profit") ||
      lower.includes("earning") ||
      lower.includes("quarter") ||
      lower.match(/q[1-4]/)
    ) {
      return "RESULTS";
    }

    if (
      lower.includes("dividend") ||
      lower.includes("bonus") ||
      lower.includes("split") ||
      lower.includes("buyback") ||
      lower.includes("promoter") ||
      lower.includes("stake")
    ) {
      return "CORPORATE_ACTION";
    }

    if (
      lower.includes("announce") ||
      lower.includes("declare") ||
      lower.includes("notify")
    ) {
      return "ANNOUNCEMENT";
    }

    return "NEWS";
  }
}

export async function testNewsScraper() {
  console.log("🧪 Testing News Scraper...\n");

  const scraper = new NewsScraperAgent();
  const testSymbols = ["RELIANCE", "TCS", "TITAN"];

  for (const symbol of testSymbols) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing: ${symbol}`);
    console.log("=".repeat(60));

    const companyName = scraper.getCompanyName(symbol);
    const news = await scraper.scrapeNews(symbol, companyName);

    console.log(`\nResults: ${news.length} items found\n`);

    news.slice(0, 5).forEach((item, i) => {
      console.log(
        `${i + 1}. [${item.importance}] [${item.sentiment}] ${item.title}`,
      );
      console.log(
        `   Source: ${item.source} | Date: ${item.publishedAt.toLocaleDateString()}`,
      );
      console.log(`   Category: ${item.category}`);
      console.log(`   URL: ${item.url}\n`);
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testNewsScraper().catch(console.error);
}
