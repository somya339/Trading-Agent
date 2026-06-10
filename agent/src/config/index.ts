import * as dotenv from "dotenv";
dotenv.config();

/**
 * Risk profiles. Switch with RISK_PROFILE=aggressive|balanced|conservative.
 * Individual values can still be overridden by their own env vars.
 *
 * "aggressive" is for a HIGH risk appetite — higher per-trade risk, more
 * concurrent positions, looser entry gates, wider stops (to let winners run),
 * and bigger position/sector concentration. This amplifies returns AND losses;
 * keep the paper tracker running to confirm the edge is real before live use.
 */
export type RiskProfileName = "conservative" | "balanced" | "aggressive";

interface RiskProfile {
  riskPerTradePct: number;
  maxPortfolioHeatPct: number;
  maxPositionPct: number;
  maxSectorPct: number;
  maxOpenPositions: number;
  minPositionValue: number;
  atrStopMultiple: number;
  // Signal gating + strategy knobs that scale with appetite.
  buyScoreThreshold: number; // overallScore ≥ this → BUY
  holdScoreThreshold: number; // ≥ this (and < buy) → HOLD, else SKIP
  minSentiment: number; // below this sentiment → SKIP
  minAlignment: number; // technical alignment filter
  momentumMinRsRating: number; // momentum engine RS gate
  swingMinRewardRisk: number; // swing engine min R:R
  targetMultipliers: number[]; // R-multiples for target laddering
}

const RISK_PROFILES: Record<RiskProfileName, RiskProfile> = {
  conservative: {
    riskPerTradePct: 0.0075,
    maxPortfolioHeatPct: 0.04,
    maxPositionPct: 0.1,
    maxSectorPct: 0.25,
    maxOpenPositions: 8,
    minPositionValue: 15000,
    atrStopMultiple: 1.5,
    buyScoreThreshold: 65,
    holdScoreThreshold: 50,
    minSentiment: 40,
    minAlignment: 50,
    momentumMinRsRating: 85,
    swingMinRewardRisk: 2.5,
    targetMultipliers: [2, 3],
  },
  balanced: {
    riskPerTradePct: 0.01,
    maxPortfolioHeatPct: 0.06,
    maxPositionPct: 0.15,
    maxSectorPct: 0.3,
    maxOpenPositions: 10,
    minPositionValue: 10000,
    atrStopMultiple: 2.0,
    buyScoreThreshold: 60,
    holdScoreThreshold: 45,
    minSentiment: 30,
    minAlignment: 40,
    momentumMinRsRating: 70,
    swingMinRewardRisk: 2.0,
    targetMultipliers: [3, 5, 7],
  },
  aggressive: {
    riskPerTradePct: 0.02, // 2% risk/trade — double balanced
    maxPortfolioHeatPct: 0.12, // tolerate 12% total open risk
    maxPositionPct: 0.25, // concentrate up to 25% in one name
    maxSectorPct: 0.5, // up to 50% in a hot sector
    maxOpenPositions: 15,
    minPositionValue: 8000,
    atrStopMultiple: 3.0, // wider stops → let high-beta winners run
    buyScoreThreshold: 52, // act on more setups
    holdScoreThreshold: 42,
    minSentiment: 25,
    minAlignment: 35,
    momentumMinRsRating: 60, // chase strength earlier
    swingMinRewardRisk: 1.8,
    targetMultipliers: [3, 6, 10], // reach for bigger payoffs
  },
};

const profileName = (process.env.RISK_PROFILE || "balanced") as RiskProfileName;
const profile = RISK_PROFILES[profileName] || RISK_PROFILES.balanced;

const num = (envVar: string | undefined, fallback: number) =>
  envVar !== undefined ? parseFloat(envVar) : fallback;
const int = (envVar: string | undefined, fallback: number) =>
  envVar !== undefined ? parseInt(envVar) : fallback;

// Resolve capital and the per-position cap first so the min-position floor can
// be clamped against them. On a small account the fixed ₹10k floor can exceed
// what one position is even allowed to hold (maxPositionPct × capital), which
// would reject every signal. The floor only exists to keep the flat ₹15 DP
// charge below ~0.15% of the position, so cap it at 90% of the per-position
// budget (and never below ₹3,000, where DP cost is still tolerable).
const resolvedCapital = parseInt(process.env.CAPITAL || "100000");
const resolvedMaxPositionPct = num(
  process.env.MAX_POSITION_PCT,
  profile.maxPositionPct,
);
const positionBudget = resolvedCapital * resolvedMaxPositionPct;
const requestedMinPosition = int(
  process.env.MIN_POSITION_VALUE,
  profile.minPositionValue,
);
const resolvedMinPositionValue = Math.max(
  3000,
  Math.min(requestedMinPosition, Math.floor(positionBudget * 0.9)),
);

export const config = {
  zerodha: {
    apiKey: process.env.ZERODHA_API_KEY || "",
    accessToken: process.env.ZERODHA_ACCESS_TOKEN || "",
  },
  openai: { apiKey: process.env.OPENAI_API_KEY || "" },
  capital: resolvedCapital,
  riskPercent: num(process.env.RISK_PERCENT, profile.riskPerTradePct),
  maxSignals: int(process.env.MAX_SIGNALS, 20),
  runIntervalMinutes: int(process.env.RUN_INTERVAL_MINUTES, 15),

  riskProfile: profileName,

  // ─── Risk management (layered controls) ──────────────────────
  // Defaults come from the active risk profile; any can be overridden by env.
  risk: {
    riskPerTradePct: num(
      process.env.RISK_PER_TRADE_PCT,
      profile.riskPerTradePct,
    ),
    maxPortfolioHeatPct: num(
      process.env.MAX_PORTFOLIO_HEAT_PCT,
      profile.maxPortfolioHeatPct,
    ),
    maxPositionPct: resolvedMaxPositionPct,
    maxSectorPct: num(process.env.MAX_SECTOR_PCT, profile.maxSectorPct),
    maxOpenPositions: int(
      process.env.MAX_OPEN_POSITIONS,
      profile.maxOpenPositions,
    ),
    minPositionValue: resolvedMinPositionValue,
    atrStopMultiple: num(
      process.env.ATR_STOP_MULTIPLE,
      profile.atrStopMultiple,
    ),
  },

  // ─── Signal gating + strategy tuning (scales with appetite) ──
  signals: {
    buyScoreThreshold: num(
      process.env.BUY_SCORE_THRESHOLD,
      profile.buyScoreThreshold,
    ),
    holdScoreThreshold: num(
      process.env.HOLD_SCORE_THRESHOLD,
      profile.holdScoreThreshold,
    ),
    minSentiment: num(process.env.MIN_SENTIMENT, profile.minSentiment),
    minAlignment: num(process.env.MIN_ALIGNMENT, profile.minAlignment),
    momentumMinRsRating: num(
      process.env.MOMENTUM_MIN_RS,
      profile.momentumMinRsRating,
    ),
    swingMinRewardRisk: num(
      process.env.SWING_MIN_RR,
      profile.swingMinRewardRisk,
    ),
    targetMultipliers: profile.targetMultipliers,
  },
};

/**
 * Score weights by suggested holding timeframe: [technical, fundamental, sentiment].
 *
 * Fundamentals only matter for long holds — a 1-2 week swing is driven by price
 * action and catalysts, not by P/E or 5-year growth. So fundamentals are nearly
 * skipped for SHORT, reduced for MEDIUM (<4 months), and dominant for LONG
 * (>~5 months). Each row must sum to 1.0.
 */
export type ScoreWeights = { tech: number; fund: number; sent: number };

export const TIMEFRAME_WEIGHTS: Record<
  "SHORT" | "MEDIUM" | "LONG",
  ScoreWeights
> = {
  SHORT: { tech: 0.6, fund: 0.05, sent: 0.35 }, // 1-2 weeks: fundamentals ~ignored
  MEDIUM: { tech: 0.5, fund: 0.2, sent: 0.3 }, // 1-3 months: fundamentals reduced
  LONG: { tech: 0.3, fund: 0.5, sent: 0.2 }, // 6+ months: fundamentals dominate
};

/**
 * Typical holding period (in calendar days) per timeframe — used to ANNUALIZE
 * expected return so trades are compared on profit-per-unit-time, not raw %.
 * A 20% gain in ~14 days annualizes far higher than 20% over ~180 days.
 */
export const TIMEFRAME_HOLDING_DAYS: Record<
  "SHORT" | "MEDIUM" | "LONG",
  number
> = {
  SHORT: 14, // ~2 weeks
  MEDIUM: 60, // ~2 months
  LONG: 180, // ~6 months
};

/**
 * Position-sizing mode (SIZING_MODE env):
 *  - "risk"      : classic fixed-fractional off stop distance (default, capped).
 *  - "conviction": NO position caps — size purely by duration-adjusted return
 *                  (annualized) × score, so the best profit-per-time trades get
 *                  the most capital. Sizing is ADVISORY; the user allocates
 *                  manually, so suggested notionals may exceed cash.
 * Deployment ceiling (maxTotalDeploymentPct): how many ×capital the suggested
 * notionals may sum to. 1 = within cash; >1 = margin; 0/unset in conviction
 * mode = uncapped (signals may sum past capital, you allocate by hand).
 */
export const sizing = {
  mode: (process.env.SIZING_MODE || "risk") as "risk" | "conviction",
  // In conviction mode default to UNCAPPED (Infinity) per user preference; in
  // risk mode keep the cash ceiling. Override with MAX_TOTAL_DEPLOYMENT_PCT.
  maxTotalDeploymentPct: process.env.MAX_TOTAL_DEPLOYMENT_PCT
    ? parseFloat(process.env.MAX_TOTAL_DEPLOYMENT_PCT)
    : (process.env.SIZING_MODE || "risk") === "conviction"
      ? Infinity
      : 1.0,
};

export const SECTOR_SYMBOLS: Record<string, string[]> = {
  // ─── Banking & Finance ─────────────────────────────────────────────────────
  "Banking & Finance": [
    // Large-cap private banks
    "HDFCBANK",
    "ICICIBANK",
    "AXISBANK",
    "KOTAKBANK",
    "INDUSINDBK",
    "FEDERALBNK",
    "KARNATAKBANK",
    "CSBBANK",
    "DCBBANK",
    "RBLBANK",
    "YESBANK",
    "IDFCFIRSTB",
    "BANDHANBNK",
    "UJJIVANSFB",
    "EQUITASBNK",
    "AUBANK", // ★ AU Small Finance Bank – Nifty 500, high-growth SFB
    "KARURVYSYA", // ★ Karur Vysya Bank
    "CUB", // ★ City Union Bank
    "CENTRALBK", // ★ Central Bank of India
    "BANKINDIA", // ★ Bank of India – Nifty 500 PSU bank
    "IDBI", // ★ IDBI Bank
    // PSU banks
    "SBIN",
    "BANKBARODA",
    "PNB",
    "CANBK",
    "UNIONBANK",
    "INDIANB",
    "IOB",
    "UCOBANK",
    "MAHABANK",
    "J&KBANK",
    // NBFCs & Housing Finance
    "BAJFINANCE",
    "BAJAJFINSV",
    "CHOLAFIN",
    "CHOLAHLDNG", // ★ Cholamandalam Financial Holdings
    "MUTHOOTFIN",
    "MANAPPURAM",
    "M&MFIN",
    "LTFH",
    "LTF", // ★ L&T Finance (correct NSE symbol)
    "HDFCAMC",
    "IIFL",
    "MOTILALOFS",
    "ANGELONE",
    "5PAISA",
    "ICICIPRULI",
    "HDFCLIFE",
    "SBILIFE",
    "LICI",
    "STARHEALTH",
    "ABCAPITAL",
    "POONAWALLA",
    "SBICARD",
    "JIOFIN", // ★ Jio Financial Services – Nifty 50 entrant, high buzz
    "SHRIRAMFIN", // ★ Shriram Finance – Nifty 50, major NBFC
    "CANFINHOME", // ★ Can Fin Homes
    "LICHSGFIN", // ★ LIC Housing Finance
    "HUDCO", // ★ Housing & Urban Dev Corporation – very active
    "ICICIGI", // ★ ICICI Lombard General Insurance
    "MFSL", // ★ Max Financial Services
    "GICRE", // ★ General Insurance Corporation
    "NUVAMA",
    "EDELWEISS",
    "GEOJITFSL",
    "ISEC", // ★ ICICI Securities
    "CAMS",
    "CDSL",
    "BSE",
    "MCX",
    "ANANDRATHI", // ★ Anand Rathi Wealth
    "KFINTECH", // ★ KFin Technologies
    "NAM-INDIA", // ★ Nippon Life India AMC
    "360ONE", // ★ 360 ONE WAM (IIFL Wealth)
    "BAJAJHLDNG", // ★ Bajaj Holdings & Investment
    "JMFINANCIL", // ★ JM Financial
    "IEX", // ★ Indian Energy Exchange
    "IFCI", // ★ IFCI
    "UGROCAP",
    "HOMEFIRST",
    "APTUS",
    "FIVESTAR",
    "CREDITACC",
    "ARMANFIN",
    "SPANDANA",
    "CGCL", // ★ Capri Global Capital
  ],

  // ─── IT & Technology ───────────────────────────────────────────────────────
  "IT & Technology": [
    // Large-cap IT
    "TCS",
    "INFY",
    "WIPRO",
    "HCLTECH",
    "TECHM",
    "LTI",
    "LTIM",
    "PERSISTENT",
    "COFORGE",
    "MPHASIS",
    "LTTS",
    "TATAELXSI",
    "NIIT",
    "MASTEK",
    "HEXAWARE",
    "KPITTECH",
    "RATEGAIN",
    "ROUTE",
    "TANLA",
    "INTELLECT",
    // Internet / SaaS / Fintech
    "NETWEB",
    "BBOX",
    "NAUKRI",
    "INDIAMART",
    "ZOMATO",
    "POLICYBZR",
    "DELHIVERY",
    "PAYTM",
    "CARTRADE",
    "MAPMYINDIA",
    "NAZARA",
    "HAPPSTMNDS", // ★ Happiest Minds (corrected symbol)
    "NEWGEN",
    "SAKSOFT",
    "DATAMATICS",
    "SONATSOFTW",
    "CYIENT",
    "BIRLASOFT", // (also listed as BSOFT on NSE)
    "ECLERCX",
    "ZENSAR",
    "FSL",
    "INFIBEAM",
    "AFFLE", // ★ Affle India – high-growth adtech
    "LATENTVIEW", // ★ Latent View Analytics – data analytics
    "HAPPYFORGE", // ★ Happy Forgings (moved; kept under IT was wrong – see Capital Goods)
    "JUSTDIAL", // ★ Just Dial
    "CAMPUS", // moved to Retail; kept reference
    "HFCL", // ★ HFCL – fibre/telecom infra tech
    "ITI", // ★ ITI Ltd – govt telecom tech
    "INDUSTOWER", // ★ Indus Towers – tower infra
  ],

  // ─── Pharma & Healthcare ───────────────────────────────────────────────────
  "Pharma & Healthcare": [
    // Large-cap pharma
    "SUNPHARMA",
    "DRREDDY",
    "CIPLA",
    "DIVISLAB",
    "LUPIN",
    "AUROPHARMA",
    "TORNTPHARM",
    "ALKEM",
    "NATCOPHARM",
    "IPCALAB",
    "GLENMARK",
    "GRANULES",
    "JBCHEPHARM",
    "PFIZER",
    "ABBOTINDIA",
    "GLAXO",
    "SANOFI",
    "BIOCON",
    "LAURUS",
    "LAURUSLABS", // ★ Laurus Labs (correct NSE symbol)
    "ERIS",
    "MANKIND", // ★ Mankind Pharma – major Nifty 500 pharma
    "GLAND", // ★ Gland Pharma – injectables leader
    "AJANTPHARM", // ★ Ajanta Pharmaceuticals
    "APLLTD", // ★ Alembic Pharmaceuticals
    "FDC", // ★ FDC Ltd
    "CONCORDBIO", // ★ Concord Biotech – fermentation APIs
    "JUBLPHARMA", // ★ Jubilant Pharmova
    "ALIVUS", // ★ Alivus (formerly Glenmark Life Sciences)
    "CAPLIPOINT",
    // Hospitals & diagnostics
    "APOLLOHOSP",
    "FORTIS",
    "MAXHEALTH",
    "MEDANTA",
    "ASTER",
    "ASTERDM", // ★ Aster DM Healthcare (correct NSE symbol)
    "THYROCARE",
    "METROPOLIS",
    "POLYMED",
    "VIJAYA",
    "MEDPLUS",
    "KRSNAA",
    "SUVENPHAR",
    "STRIDES",
    "BLISSGVS",
    "NH", // ★ Narayana Hrudayalaya
    "LALPATHLAB", // ★ Dr. Lal PathLabs – diagnostics major
    "KIMS", // ★ Krishna Institute of Medical Sciences
    "YATHARTH",
  ],

  // ─── Auto & EV ─────────────────────────────────────────────────────────────
  "Auto & EV": [
    // OEMs
    "MARUTI",
    "TATAMOTORS", // ★ Tata Motors – Nifty 50, EV leader (corrected from TMCV/TMPV)
    "M&M",
    "BAJAJ-AUTO",
    "HEROMOTOCO",
    "TVSMOTORS",
    "EICHERMOT",
    "ASHOKLEY",
    "FORCEMOT",
    "ESCORTS",
    "OLECTRA",
    "TIINDIA",
    "CRAFTSMAN",
    "SUPRAJIT",
    "MRF", // ★ MRF – India's biggest tyre company
    "APOLLOTYRE", // ★ Apollo Tyres
    "CEATLTD", // ★ CEAT Ltd
    "JBMA", // ★ JBM Auto – EV bus maker
    // Auto ancillaries
    "MOTHERSON",
    "BALKRISIND",
    "BOSCHLTD",
    "BHARATFORG",
    "EXIDEIND",
    "AMARAJABAT",
    "ARE&M", // ★ Amara Raja Energy & Mobility (correct NSE symbol)
    "SUNDRMFAST",
    "GABRIEL",
    "SUBROS",
    "ENDURANCE",
    "MINDARIND",
    "MINDACORP", // ★ Minda Corporation
    "LUMAX",
    "FIEM",
    "MINDA",
    "SSWL",
    "CIEINDIA", // ★ CIE Automotive India
    "HBLENGINE", // ★ HBL Power Systems – EV/defence batteries
    "SANSERA",
    "JTEKTINDIA",
    // EV / charging
    "TATAPOWER",
    "GREENZO",
  ],

  // ─── Energy & Power ────────────────────────────────────────────────────────
  "Energy & Power": [
    // Oil & gas
    "RELIANCE",
    "ONGC",
    "BPCL",
    "IOC",
    "HINDPETRO",
    "CASTROLIND",
    "MRPL",
    "CHENNPETRO",
    "GAIL",
    "PETRONET",
    "IGL",
    "MGL",
    "GSPL",
    "GUJGASLTD",
    "ATGL",
    "OILINDIA", // ★ Oil India – Nifty 500, active PSU
    // Power generation & T&D
    "NTPC",
    "POWERGRID",
    "ADANIGREEN",
    "ADANIENSOL", // ★ Adani Energy Solutions (T&D) – Nifty 500
    "ADANIPOWER", // ★ Adani Power – major thermal power
    "ADANITRANS",
    "TATAPOWER",
    "CESC",
    "TORNTPOWER",
    "JSPL",
    "NHPC",
    "SJVN",
    "RPOWER",
    "JSWENERGY",
    "NLCINDIA", // ★ NLC India – thermal + solar PSU
    "GPIL", // ★ Godawari Power & Ispat
    "INOXWIND",
    "SUZLON",
    "ORIENTGREEN",
    "WEBSOL",
    "WAAREEENER",
    "PREMIER",
    "KPI",
    "BORORENEW", // ★ Borosil Renewables – solar glass
    "ADANIPORTS", // ★ Adani Ports – also energy/infra nexus
  ],

  // ─── Capital Goods & Defence ───────────────────────────────────────────────
  "Capital Goods & Defence": [
    "LT",
    "BHEL",
    "HAL",
    "BEL",
    "COCHINSHIP",
    "MAZAGON",
    "MAZDOCK", // ★ Mazagon Dock (correct NSE symbol)
    "GRSE", // ★ Garden Reach Shipbuilders – defence shipyard
    "GRINDWELL",
    "THERMAX",
    "CUMMINSIND",
    "ABB",
    "SIEMENS",
    "HONAUT",
    "VOLTAMP",
    "ELGIEQUIP",
    "KIRLOSENG",
    "KNRCON",
    "PNCINFRA",
    "GMRINFRA",
    "IRB",
    "KEC",
    "KEI", // ★ KEI Industries – cables & wires
    "KALPATPOWR",
    "KPIL", // ★ Kalpataru Projects International
    "SGEL",
    "TRITURBINE",
    "DYNAMATECH",
    "DATPATTERN",
    "DATAPATTNS",
    "ASTRAZEN",
    "PARAS",
    "ZENTEC",
    "MTAR",
    "MTARTECH", // ★ MTAR Technologies (correct NSE symbol)
    "IDEAFORGE",
    "BDL",
    "SOLARINDS",
    "CGPOWER", // ★ CG Power – transformers/motors, Nifty 500
    "POWERINDIA", // ★ Hitachi Energy India (transformers)
    "APARINDS", // ★ Apar Industries – conductors/cables
    "FINCABLES", // ★ Finolex Cables
    "FINPIPE", // ★ Finolex Industries
    "ELECON", // ★ Elecon Engineering
    "CARBORUNIV", // ★ Carborundum Universal
    "AIAENG", // ★ AIA Engineering – high-chrome mill internals
    "ACE", // ★ Action Construction Equipment – cranes
    "BEML", // ★ BEML – defence/metro/mining equipment
    "ENGINERSIN", // ★ Engineers India Ltd
    "KSB", // ★ KSB Ltd – pumps & valves
    "HEG", // ★ HEG – graphite electrodes (defence/EAF)
    "GRAPHITE", // ★ Graphite India
    "HAPPYFORGE", // ★ Happy Forgings
    "JWL", // ★ Jupiter Wagons – railway wagons
    "EPL", // ★ EPL Ltd – packaging tubes
    "IRCON", // ★ IRCON International – railway construction
    "NBCC", // ★ NBCC – govt construction PSU
    "KAYNES",
    "AVALON",
    "SYRMA",
    "JYOTICNC",
    "ANUPAM",
  ],

  // ─── Consumer & FMCG ──────────────────────────────────────────────────────
  "Consumer & FMCG": [
    "HINDUNILVR",
    "ITC",
    "NESTLEIND",
    "BRITANNIA",
    "DABUR",
    "MARICO",
    "TATACONSUM",
    "COLPAL",
    "GODREJCP",
    "EMAMILTD",
    "PGHH",
    "VBLLTD",
    "RADICO",
    "UNITEDBREWS",
    "UNITEDSPIRITS",
    "MCDOWELL-N",
    "JYOTHYLAB",
    "BAJAJCON",
    "ZYDUSWELL",
    "BIKAJI",
    "DOMS",
    "WONDERLA",
    "GILLETTE", // ★ Gillette India
    "GODFRYPHLP", // ★ Godfrey Phillips India (cigarettes)
    "AWL", // ★ Adani Wilmar – Fortune oil (Nifty 500)
    "HONASA", // ★ Honasa Consumer (Mamaearth) – D2C FMCG
    "CCL", // ★ CCL Products – instant coffee exporter
    "GAEL", // ★ Gujarat Ambuja Exports
    "BBTC", // ★ Bombay Burmah Trading Corp
    "AVANTIFEED",
    "APEX",
  ],

  // ─── Real Estate ───────────────────────────────────────────────────────────
  "Real Estate": [
    "DLF",
    "GODREJPROP",
    "OBEROIRLTY",
    "PRESTIGE",
    "BRIGADE",
    "SOBHA",
    "PHOENIXLTD",
    "MAHINDCIE",
    "INDHOUSING",
    "SUNTECK",
    "KOLTEPATIL",
    "PURVA",
    "RUSTOMJEE",
    "ANANTRAJ",
    "GANESHHOUC",
    "LODHA",
    "MACROTECH", // ★ Macrotech Developers (Lodha Group NSE symbol)
    "SIGNATURE",
    "AARTECH",
    "NSLNISP",
    "MAHLIFE", // ★ Mahindra Lifespace Developers
    "CHALET", // ★ Chalet Hotels – hospitality real estate
    "LEMONTREE", // ★ Lemon Tree Hotels
    "EIHOTEL", // ★ EIH Ltd (Oberoi Hotels)
    "INDHOTEL", // ★ Indian Hotels (Taj) – hospitality
    "MHRIL", // ★ Mahindra Holidays
    "HUDCO", // ★ Housing & Urban Dev Corp (also Finance)
  ],

  // ─── Metals & Mining ──────────────────────────────────────────────────────
  "Metals & Mining": [
    // Steel
    "TATASTEEL",
    "JSWSTEEL",
    "SAIL",
    "JINDALSAW",
    "RATNAMANI",
    "APLAPOLLO",
    "MSTEEL",
    "KALYANKJIL",
    "GALLISPAT",
    "WELCORP",
    "JSL", // ★ Jindal Stainless – Nifty 500, SS leader
    "JINDALSTEL", // ★ Jindal Steel & Power (correct NSE symbol for JSPL)
    "JAIBALAJI", // ★ Jai Balaji Industries – hot SME steel play
    "LLOYDSME", // ★ Lloyds Metals & Energy
    // Aluminium / zinc / copper
    "HINDALCO",
    "VEDL",
    "NALCO",
    "NATIONALUM", // ★ National Aluminium (correct NSE symbol)
    "HINDZINC",
    "HINDCOPPER", // ★ Hindustan Copper
    "NMDC",
    "COALINDIA",
    "MOIL",
    "GMDC",
    "GMDCLTD", // ★ GMDC (correct NSE symbol)
    "KIOCL",
    // Specialty metals
    "MIDHANI",
    "TINPLATE",
    "STEELHCL",
    "SHYAMMETL",
    "ADANIENT", // ★ Adani Enterprises (metals/mining classification in Nifty)
    "OILINDIA", // also Energy
  ],

  // ─── Chemicals & Specialty ─────────────────────────────────────────────────
  "Chemicals & Specialty": [
    "PIDILITIND",
    "SRF",
    "DEEPAKNTR", // ★ Deepak Nitrite (correct NSE symbol)
    "NAVINFLUOR",
    "ATUL",
    "VINATI",
    "NOCIL",
    "CLEAN",
    "FINEORG",
    "SUDARSCHEM",
    "TATACHEM",
    "GNFC",
    "COROMANDEL",
    "CHAMBAL",
    "CHAMBLFERT", // ★ Chambal Fertilizers (correct NSE symbol)
    "GSFC",
    "AAVAS",
    "ASTRAL",
    "GALAXYSURF",
    "ARCHCHEM",
    "ROSSELLIND",
    "LXCHEM",
    "DMCC",
    "IGPL",
    "BALCHEM",
    "PCBL",
    "INOXAP",
    "KIRI",
    "BORAXMORAR",
    "EPIGRAL",
    "AARTIIND", // ★ Aarti Industries – Nifty 500 specialty chem
    "ALKYLAMINE", // ★ Alkyl Amines Chemicals
    "BALAMINES", // ★ Balaji Amines
    "DEEPAKFERT", // ★ Deepak Fertilisers & Petrochemicals
    "FLUOROCHEM", // ★ Gujarat Fluorochemicals – fluoro-specialty
    "CHEMPLASTS", // ★ Chemplast Sanmar – PVC/specialty
    "JUBLINGREA", // ★ Jubilant Ingrevia – specialty ingredients
    "AETHER", // ★ Aether Industries – CRAMS/specialty
    "HSCL", // ★ Himadri Speciality Chemical
    "LINDEINDIA", // ★ Linde India – industrial gases
    "FACT", // ★ Fertilisers & Chemicals Travancore
    "EIDPARRY", // ★ EID Parry – sugar + chemicals
    "ANURAS", // ★ Anupam Rasayan – CRAMS
    "ACI", // ★ Archean Chemical Industries
  ],

  // ─── Infrastructure & Cement ───────────────────────────────────────────────
  "Infrastructure & Cement": [
    // Cement
    "ULTRACEMCO",
    "GRASIM",
    "AMBUJACEM",
    "ACC",
    "JKCEMENT",
    "SHREECEM",
    "RAMCOCEM",
    "HEIDELBERG",
    "BIRLACORPN",
    "DALMIA",
    "DALBHARAT", // ★ Dalmia Bharat (correct NSE symbol)
    "NUVOCO",
    "PRISMJOINTS",
    "ORIENTCEM",
    "STARCEMENT",
    "JKLAKSHMI",
    "INDIACEM", // ★ India Cements – major south India cement
    // Infrastructure / construction
    "KNRCON",
    "PNCINFRA",
    "GPPL",
    "IRFC",
    "NCC",
    "HGINFRA",
    "DBCORP",
    "GMRINFRA",
    "IRB",
    "ASHOKA",
    "WELSPUNIND",
    "CAPACITE",
    "PSP",
    "PDSL",
    "AHLUCONT",
    "JSWINFRA", // ★ JSW Infrastructure – ports, Nifty 500
    "ADANIPORTS", // ★ Adani Ports – India's largest port operator
    "NBCC", // ★ NBCC – govt construction
    "IRCON", // ★ IRCON International
    "ENGINERSIN", // ★ Engineers India
    "KPIL", // ★ Kalpataru Projects
  ],

  // ─── Retail & Consumption ─────────────────────────────────────────────────
  "Retail & Consumption": [
    "DMART",
    "TRENT",
    "TITAN",
    "NYKAA",
    "ZOMATO",
    "JUBLFOOD",
    "DEVYANI",
    "WESTLIFE",
    "BATA",
    "BATAINDIA", // ★ Bata India (correct NSE symbol)
    "RAYMOND",
    "VMART",
    "SHOPERSTOP",
    "ABFRL",
    "PAGEIND",
    "MANYAVAR",
    "CAMPUS",
    "METRO",
    "METROBRAND", // ★ Metro Brands (correct NSE symbol)
    "SAPPHIRE",
    "BARBEQUE",
    "EASEMYTRIP",
    "IRCTC",
    "INDIGOPNTS",
    "IXIGO",
    "YATHARTH",
    "SENCO",
    "INDIGO", // ★ InterGlobe Aviation (IndiGo) – aviation/travel
    "LEMONTREE", // ★ Lemon Tree Hotels
    "CHALET", // ★ Chalet Hotels
    "MHRIL", // ★ Mahindra Holidays
    "JUSTDIAL", // ★ Just Dial – local commerce
    "BLS", // ★ BLS International Services – travel/visa
    "CELLO", // ★ Cello World – consumer durables/stationery
    "EIHOTEL", // ★ EIH (Oberoi Hotels)
    "INDHOTEL", // ★ Indian Hotels (Taj)
    "WONDERLA",
    "KALYANKJIL", // ★ Kalyan Jewellers (also in Metals)
  ],

  // ─── Telecom & Media ──────────────────────────────────────────────────────
  "Telecom & Media": [
    "BHARTIARTL",
    "IDEA",
    "TATACOMM",
    "HATHWAY",
    "GTPL",
    "SUNTV",
    "ZEEL",
    "PVRINOX",
    "SAREGAMA",
    "TIPS",
    "TIPSINDLTD",
    "INOXLEISURE",
    "NETWORK18", // ★ Network18 (correct NSE symbol)
    "TVTODAY",
    "DBCORP",
    "JAGRAN",
    "DISH",
    "APTUS",
    "DEN",
    "HINDMEDIA",
    "INDUSTOWER", // ★ Indus Towers – critical telecom infrastructure
    "HFCL", // ★ HFCL – optical fibre & telecom infra
    "ITI", // ★ ITI Ltd – govt telecom equipment
  ],

  // ─── Insurance & Asset Management ─────────────────────────────────────────
  "Insurance & Asset Mgmt": [
    "HDFCLIFE",
    "SBILIFE",
    "ICICIPRULI",
    "LICI",
    "STARHEALTH",
    "ABCAPITAL",
    "ICICIGI", // ★ ICICI Lombard General Insurance
    "MFSL", // ★ Max Financial Services
    "GICRE", // ★ General Insurance Corporation
    "MUTHOOTFIN",
    "MANAPPURAM",
    "IIFL",
    "MOTILALOFS",
    "ANGELONE",
    "NUVAMA",
    "EDELWEISS",
    "GEOJITFSL",
    "ISEC",
    "CAMS",
    "CDSL",
    "BSE",
    "MCX",
    "NSEINDIA",
    "ANANDRATHI", // ★ Anand Rathi Wealth
    "KFINTECH", // ★ KFin Technologies
    "NAM-INDIA", // ★ Nippon Life India AMC
    "360ONE", // ★ 360 ONE WAM
    "BAJAJHLDNG", // ★ Bajaj Holdings
    "JMFINANCIL", // ★ JM Financial
    "IEX", // ★ Indian Energy Exchange
  ],

  // ─── Logistics & Supply Chain ─────────────────────────────────────────────
  "Logistics & Supply Chain": [
    "DELHIVERY",
    "BLUEDART",
    "GATI",
    "TCI",
    "MAHINDLOG",
    "CONCOR",
    "VRL",
    "ALLCARGO",
    "AEGISLOG",
    "WABCOINDIA",
    "SICAL",
    "SNOWMAN",
    "GATEWAY",
    "ESAB",
    "OCCL",
    "ADANIPORTS", // ★ Adani Ports – largest port/logistics operator
    "JSWINFRA", // ★ JSW Infrastructure – ports & terminals
    "GPPL", // ★ Gujarat Pipavav Port
    "MMTC", // ★ MMTC – state trading / logistics
    "BLS", // ★ BLS International – travel/logistics services
  ],

  // ─── Agri & Food Processing ────────────────────────────────────────────────
  "Agri & Food Processing": [
    "UPL",
    "PIIND",
    "BAYER",
    "BAYERCROP", // ★ Bayer Cropscience (correct NSE symbol)
    "RALLIS",
    "DHANUKA",
    "INSECTICID",
    "HERANBA",
    "GODREJAGRO",
    "KSBL",
    "SUMITCHEM",
    "KRBL",
    "PATANJALI",
    "AVANTIFEED",
    "APEX",
    "BIKAJI",
    "AGROPHOS",
    "GLOBUS",
    "USHAMART",
    "ZYDUSLIFE",
    "COROMANDEL", // ★ Coromandel International – fertilisers, Nifty 500
    "CHAMBLFERT", // ★ Chambal Fertilizers
    "GSFC", // ★ Gujarat State Fertilizers
    "GNFC", // ★ GNFC – fertilizers + chemicals
    "DEEPAKFERT", // ★ Deepak Fertilisers
    "EIDPARRY", // ★ EID Parry – sugar + agri-inputs
    "BALRAMCHIN", // ★ Balrampur Chini Mills – sugar
    "AWL", // ★ Adani Wilmar – edible oils
    "CCL", // ★ CCL Products – instant coffee
    "GAEL", // ★ Gujarat Ambuja Exports – soya/maize
    "FACT", // ★ FACT – fertilizer major
    "KSCL", // ★ Kaveri Seed Company
  ],

  // ─── Textiles & Apparel ────────────────────────────────────────────────────
  "Textiles & Apparel": [
    "RAYMOND",
    "WELSPUNIND",
    "VARDHMAN",
    "TRIDENT",
    "GRASIM",
    "PAGEIND",
    "ABFRL",
    "MANYAVAR",
    "TRENTLTD",
    "NITIN",
    "KITEX",
    "FILATEX",
    "NAHARSPG",
    "SPANDANA",
    "RUPA",
    "LAXMIMACH",
    "NILAINFO",
    "SHIVALIK",
    "SPORTKING",
    "SUTLEJ",
    "KPRMILL", // ★ K.P.R. Mill – large integrated textiles, Nifty 500
    "ALOKINDS", // ★ Alok Industries – polyester/textiles
    "ARVIND", // ★ Arvind Ltd – denim & brands
    "MAFANG", // ★ Mafia textiles (placeholder – verify symbol)
  ],

  // ─── Paints & Building Materials ──────────────────────────────────────────
  "Paints & Building Materials": [
    "ASIANPAINT",
    "BERGER",
    "BERGEPAINT", // ★ Berger Paints (correct NSE symbol)
    "KANSAINER",
    "AKZOINDIA",
    "SHALPAINTS",
    "INDIGO",
    "SUPREMEIND",
    "ASTRAL",
    "CERA",
    "SOMANY",
    "KAJARIA",
    "KAJARIACER", // ★ Kajaria Ceramics (correct NSE symbol)
    "ORIFLAME",
    "GRINDWELL",
    "GREENPANEL",
    "GREENPLY",
    "CENTURYPLY",
    "HSIL",
    "VINYLINDIA",
    "RUSHIL",
    "STYLAM",
    "APLAPOLLO", // ★ APL Apollo Tubes – steel tubes for construction
    "HAVELLS", // ★ Havells India – electricals/consumer durables
    "CROMPTON", // ★ Crompton Greaves Consumer Electricals
    "BLUESTARCO", // ★ Blue Star – AC/cooling/building solutions
    "AMBER", // ★ Amber Enterprises – AC/electronics OEM
    "DIXON", // ★ Dixon Technologies – electronics OEM
  ],

  // ─── Consumer Durables & Electronics ──────────────────────────────────────
  "Consumer Durables & Electronics": [
    "HAVELLS", // ★ Havells – Nifty 50, electricals giant
    "CROMPTON", // ★ Crompton Greaves Consumer Electricals
    "BLUESTARCO", // ★ Blue Star – AC market leader
    "AMBER", // ★ Amber Enterprises – RAC components
    "DIXON", // ★ Dixon Technologies – contract electronics
    "VOLTAS", // ★ Voltas – Tata AC brand
    "WHIRLPOOL", // ★ Whirlpool India
    "VGUARD", // ★ V-Guard Industries – South India electricals
    "ORIENTELEC", // ★ Orient Electric – fans & lighting
    "KAJARIACER",
    "CERA",
    "SOMANY",
    "CENTURYPLY",
    "GREENPLY",
    "GREENPANEL",
    "CELLO", // ★ Cello World – consumer houseware
    "CAMPUS",
    "BATAINDIA",
    "METROBRAND",
  ],

  // ─── Diversified Conglomerates ─────────────────────────────────────────────
  "Diversified Conglomerates": [
    "RELIANCE",
    "TATAMOTORS",
    "M&M",
    "ADANIENT",
    "ADANITRANS",
    "LT",
    "ITC",
    "BAJAJHIND",
    "GRASIM",
    "HINDALCO",
    "MCDOWELL-N",
    "GODREJCP",
    "GODREJIND", // ★ Godrej Industries – diversified holding co.
    "TATACONSUM",
    "TATACOMM",
    "BIRLASOFT",
    "3MINDIA", // ★ 3M India – diversified industrial/consumer
    "DCMSHRIRAM", // ★ DCM Shriram – chemicals, cement, sugar
    "JIOFIN", // ★ Jio Financial Services – new major conglomerate arm
  ],

  // ─── Railways & Defence (NEW SECTOR) ──────────────────────────────────────
  "Railways & Defence": [
    "HAL", // ★ Hindustan Aeronautics
    "BEL", // ★ Bharat Electronics
    "BDL", // ★ Bharat Dynamics
    "COCHINSHIP", // ★ Cochin Shipyard
    "MAZDOCK", // ★ Mazagon Dock
    "GRSE", // ★ Garden Reach Shipbuilders
    "DATAPATTNS", // ★ Data Patterns – defence electronics
    "SOLARINDS", // ★ Solar Industries – explosives & defence
    "MTAR",
    "MTARTECH", // ★ MTAR Technologies
    "IDEAFORGE", // ★ ideaForge – drones
    "IRFC", // ★ Indian Railway Finance Corp
    "IRCON", // ★ IRCON International – railway construction
    "NBCC", // ★ NBCC – govt construction
    "RVNL", // ★ Rail Vikas Nigam – hot railway PSU
    "RAILTEL", // ★ RailTel Corporation – telecom infra
    "TITAGARH", // ★ Titagarh Wagons – wagons & defence
    "JWL", // ★ Jupiter Wagons
    "BEML", // ★ BEML – defence/metro vehicles
    "ENGINERSIN", // ★ Engineers India
    "ZENTEC",
  ],

  // ─── Small & Micro Cap Multibaggers ────────────────────────────────────────
  "Small & Micro Cap": [
    "DATPATTERN",
    "MTAR",
    "IDEAFORGE",
    "SBFC",
    "GANDHAR",
    "SENCO",
    "YATHARTH",
    "IXIGO",
    "APTUS",
    "FIVESTAR",
    "HOMEFIRST",
    "CREDITACC",
    "SPANDANA",
    "ARMANFIN",
    "UGROCAP",
    "SANSERA",
    "CRAFTSMAN",
    "KAYNES",
    "AVALON",
    "ELIN",
    "SYRMA",
    "UTKARSH",
    "SURYODAY",
    "JANA",
    "NSLNISP",
    "SIGACHI",
    "DIVGI",
    "BIRLACABLE",
    "ASAHIINDIA",
    "SBCL",
    "JYOTICNC",
    "ANUPAM",
    "TATAINVEST",
    "TIPSINDLTD",
    "GALLANTT",
    "URJA",
    "TATVA",
    "VAIBHAVGBL",
    "ORIENTBELL",
    "GESHIP",
    "BALRAMCHIN",
    "KSCL",
    "JTEKTINDIA",
    "EPIGRAL",
    "RATEGAIN",
    // ── Newly added hot small/mid caps ──
    "RVNL", // ★ Rail Vikas Nigam – railways infra PSU
    "RAILTEL", // ★ RailTel – railway telecom
    "TITAGARH", // ★ Titagarh Wagons
    "LLOYDSME", // ★ Lloyds Metals & Energy
    "JAIBALAJI", // ★ Jai Balaji Industries
    "JBMA", // ★ JBM Auto – EV buses
    "ACE", // ★ Action Construction Equipment
    "HAPPYFORGE", // ★ Happy Forgings
    "JWL", // ★ Jupiter Wagons
    "FLUOROCHEM", // ★ Gujarat Fluorochemicals
    "AETHER", // ★ Aether Industries
    "HSCL", // ★ Himadri Speciality Chemical
    "CONCORDBIO", // ★ Concord Biotech
    "MANKIND", // ★ Mankind Pharma
    "GLAND", // ★ Gland Pharma
    "LATENTVIEW", // ★ Latent View Analytics
    "AFFLE", // ★ Affle India
    "KFINTECH", // ★ KFin Technologies
    "ANANDRATHI", // ★ Anand Rathi Wealth
    "360ONE", // ★ 360 ONE WAM
    "JUSTDIAL", // ★ Just Dial
    "BLS", // ★ BLS International
    "CELLO", // ★ Cello World
    "HONASA", // ★ Honasa Consumer (Mamaearth)
    "GPIL", // ★ Godawari Power & Ispat
    "NLCINDIA", // ★ NLC India
    "OILINDIA", // ★ Oil India
    "HUDCO", // ★ HUDCO
    "CGCL", // ★ Capri Global Capital
    "KARURVYSYA", // ★ Karur Vysya Bank
    "CUB", // ★ City Union Bank
    "AUBANK", // ★ AU Small Finance Bank
    "KIMS", // ★ Krishna Institute of Medical Sciences
    "NH", // ★ Narayana Hrudayalaya
    "LALPATHLAB", // ★ Dr. Lal PathLabs
    "AJANTPHARM", // ★ Ajanta Pharma
    "APLLTD", // ★ Alembic Pharma
    "ALOKINDS", // ★ Alok Industries
    "KPRMILL", // ★ K.P.R. Mill
  ],
};
