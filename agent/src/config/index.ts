import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  zerodha: {
    apiKey: process.env.ZERODHA_API_KEY || "",
    accessToken: process.env.ZERODHA_ACCESS_TOKEN || "",
  },
  openai: { apiKey: process.env.OPENAI_API_KEY || "" },
  capital: parseInt(process.env.CAPITAL || "100000"),
  riskPercent: parseFloat(process.env.RISK_PERCENT || "0.02"),
  maxSignals: parseInt(process.env.MAX_SIGNALS || "20"),
  runIntervalMinutes: parseInt(process.env.RUN_INTERVAL_MINUTES || "15"),
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
