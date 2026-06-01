// ─── Zerodha / Market Data ────────────────────────────────────

export interface Quote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
  change: number;
  changePercent: number;
}

export interface HistoricalData {
  dates: Date[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export interface KiteWatchlist {
  id: number;
  name: string;
  weight: number;
}

// ─── Technical Analysis ───────────────────────────────────────

export interface MACDResult {
  value: number;
  signal: number;
  histogram: number;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: MACDResult;
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  atr: number;
  bollingerBands: { upper: number; middle: number; lower: number };
  currentPrice: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
}

export interface MultiTimeframeIndicators {
  // 1hr candles — short-term signals (1-2 weeks)
  hourly: {
    rsi: number;
    macd: MACDResult;
    sma20: number;
    ema12: number;
    atr: number;
    trend: "UP" | "DOWN" | "SIDEWAYS";
  };
  // Daily candles — medium-term signals (1-3 months)
  daily: {
    rsi: number;
    macd: MACDResult;
    sma20: number;
    sma50: number;
    ema12: number;
    ema26: number;
    bollingerBands: { upper: number; middle: number; lower: number };
    atr: number;
    volumeRatio: number;
    trend: "UP" | "DOWN" | "SIDEWAYS";
    currentPrice: number;
  };
  // Weekly candles — long-term signals (6+ months)
  weekly: {
    rsi: number;
    sma20: number;
    sma50: number;
    atr: number;
    trend: "UP" | "DOWN" | "SIDEWAYS";
  };
  // Alignment score: how well all three timeframes agree
  alignmentScore: number; // 0-100
  suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
}

// ─── Sector Analysis ──────────────────────────────────────────

export interface SectorData {
  sector: string;
  theme: string; // e.g. "Defence budget boost", "EV adoption surge"
  trendStrength: number; // 1-10
  symbols: string[]; // Top 5-7 stocks in this sector
}

export interface SectorScanResult {
  hotSectors: SectorData[];
  allSymbols: string[]; // Deduplicated flat list
  generatedAt: string;
}

// ─── Fundamental Analysis ─────────────────────────────────────

export interface FundamentalData {
  symbol: string;

  // Valuation
  pe: number | null;
  pb: number | null;
  marketCap: number;
  dividendYield: number | null;

  // Profitability
  roe: number | null;
  roa: number | null;
  netMargin: number | null;

  // Growth
  revenueGrowth: number | null;
  profitGrowth: number | null;
  epsGrowth: number | null;

  // Financial Health
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;

  // Ownership
  promoterHolding: number | null;
  promoterChange: number | null;

  // Sector comparison
  sectorPE: number | null;
  sectorPB: number | null;
}

export interface FundamentalScore {
  symbol: string;
  overallScore: number;
  valuation: "Undervalued" | "Fair" | "Overvalued";
  profitability: "Excellent" | "Good" | "Average" | "Poor";
  growth: "High" | "Moderate" | "Low" | "Negative";
  financialHealth: "Strong" | "Stable" | "Weak";
  strengths: string[];
  concerns: string[];
  recommendation: string;
}

// ─── News & Sentiment ─────────────────────────────────────────

export interface NewsItem {
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  source: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  importance: "HIGH" | "MEDIUM" | "LOW";
  category: "RESULTS" | "CORPORATE_ACTION" | "NEWS" | "ANNOUNCEMENT";
}

export interface SentimentScore {
  symbol: string;
  overallSentiment:
    | "VERY_POSITIVE"
    | "POSITIVE"
    | "NEUTRAL"
    | "NEGATIVE"
    | "VERY_NEGATIVE";
  score: number;
  newsItems: NewsItem[];
  hotPoints: string[];
  upcomingEvents: string[];
  socialSentiment: number | null;
  reasoning: string;
}

// ─── Investment Signals & Memory ─────────────────────────────

export interface InvestmentSignal {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  sectorTheme: string;

  // Trade setup
  action: "BUY" | "HOLD" | "SKIP";
  entry: number;
  stopLoss: number;
  targets: number[];
  quantity: number;
  riskAmount: number;
  potentialReward: number;
  riskRewardRatio: number;

  // Timeframe
  suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
  expectedReturn: number;
  holdingPeriod: string;

  // Analysis results
  technicalScore: number;
  fundamentalScore: number | null;
  sentimentScore: number | null;
  overallScore: number;

  // Supporting detail
  technicalSummary: string;
  fundamentalSummary: string;
  newsSummary: string;
  keyReasons: string[];
  risks: string[];

  // Market data
  price: number;
  changePercent: number;
  volume: number;

  // User feedback (filled by dashboard)
  userScore?: number;
  executed?: boolean;
  outcome?: "WIN" | "LOSS" | "PENDING" | "SKIPPED";
  actualEntry?: number;
  actualExit?: number;
  notes?: string;

  timestamp: string;
}

export interface TradingMemory {
  totalSignalsGenerated: number;
  signalsExecuted: number;
  averageScore: number;
  winRate: number;
  bestSetups: string[];
  avoidPatterns: string[];
  symbolPreferences: Record<string, number>;
  strategyPerformance: Record<string, { avgScore: number; winRate: number }>;
  learnings: string[];
}
