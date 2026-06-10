/**
 * NSE Cookie Refresh Script
 *
 * This script attempts to get fresh cookies from NSE using multiple strategies:
 * 1. Direct HTTP request with enhanced headers
 * 2. Multiple user agents rotation
 * 3. Browser automation with Puppeteer (if available)
 *
 * Usage:
 *   node refresh-nse-cookies.js
 *   node refresh-nse-cookies.js --method=puppeteer
 *   node refresh-nse-cookies.js --save
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NSE_BASE = "https://www.nseindia.com";
const COOKIE_FILE = path.join(__dirname, ".nse-cookies.json");

// Rotate through different user agents
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

// Different NSE pages to try
const NSE_PAGES = [
  "/",
  "/market-data/live-equity-market",
  "/companies-listing/corporate-filings-announcements",
];

/**
 * Method 1: Direct HTTP request with enhanced headers
 */
async function refreshWithAxios(userAgentIndex = 0, pageIndex = 0) {
  const userAgent = USER_AGENTS[userAgentIndex % USER_AGENTS.length];
  const page = NSE_PAGES[pageIndex % NSE_PAGES.length];

  console.log(`\n🔄 Trying: ${userAgent.slice(0, 50)}... on ${page}`);

  try {
    const response = await axios.get(`${NSE_BASE}${page}`, {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
      timeout: 3000,
      maxRedirects: 5,
      validateStatus: (status) => status === 200,
    });

    const setCookieHeader = response.headers["set-cookie"];

    if (setCookieHeader && setCookieHeader.length > 0) {
      const cookies = setCookieHeader.map((cookie) => cookie.split(";")[0]).join("; ");

      const cookieData = {
        cookies,
        userAgent,
        timestamp: new Date().toISOString(),
        expiresIn: "30 minutes (estimated)",
        raw: setCookieHeader,
      };

      console.log("\n✅ SUCCESS! Got fresh cookies from NSE");
      console.log(`   Cookies: ${cookies.slice(0, 100)}...`);
      console.log(`   User-Agent: ${userAgent.slice(0, 60)}...`);

      return cookieData;
    } else {
      console.log("❌ No cookies in response");
      return null;
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${error.response.statusText}`);
    } else if (error.code === "ECONNABORTED") {
      console.log("❌ Request timeout");
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Method 2: Try with Puppeteer (headless browser)
 */
async function refreshWithPuppeteer() {
  console.log("\n🚀 Trying with Puppeteer (headless browser)...");

  try {
    // Dynamic import to avoid error if puppeteer not installed
    const puppeteer = await import("puppeteer").catch(() => null);

    if (!puppeteer) {
      console.log("⚠️  Puppeteer not installed. Install with: npm install puppeteer");
      return null;
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Override user agent
    await page.setUserAgent(USER_AGENTS[0]);

    // Set extra headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    console.log("   Opening NSE website...");
    await page.goto(NSE_BASE, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Get cookies
    const cookies = await page.cookies();

    await browser.close();

    if (cookies.length > 0) {
      const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

      const cookieData = {
        cookies: cookieString,
        userAgent: USER_AGENTS[0],
        timestamp: new Date().toISOString(),
        expiresIn: "30 minutes (estimated)",
        raw: cookies,
      };

      console.log("\n✅ SUCCESS! Got cookies with Puppeteer");
      console.log(`   Cookies: ${cookieString.slice(0, 100)}...`);
      console.log(`   Found ${cookies.length} cookie(s)`);

      return cookieData;
    } else {
      console.log("❌ No cookies found");
      return null;
    }
  } catch (error) {
    console.log(`❌ Puppeteer error: ${error.message}`);
    return null;
  }
}

/**
 * Method 3: Try all combinations
 */
async function refreshWithRetries() {
  console.log("🔍 Trying multiple strategies to get NSE cookies...\n");

  // Try different user agents and pages
  for (let ua = 0; ua < USER_AGENTS.length; ua++) {
    for (let pg = 0; pg < NSE_PAGES.length; pg++) {
      const result = await refreshWithAxios(ua, pg);
      if (result) return result;

      // Small delay between attempts
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return null;
}

/**
 * Save cookies to file
 */
function saveCookies(cookieData) {
  try {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookieData, null, 2));
    console.log(`\n💾 Cookies saved to: ${COOKIE_FILE}`);
  } catch (error) {
    console.error(`❌ Failed to save cookies: ${error.message}`);
  }
}

/**
 * Load cookies from file
 */
function loadCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const data = fs.readFileSync(COOKIE_FILE, "utf8");
      const cookieData = JSON.parse(data);

      const age = Date.now() - new Date(cookieData.timestamp).getTime();
      const ageMinutes = Math.floor(age / 60000);

      console.log(`\n📁 Found saved cookies from ${ageMinutes} minutes ago`);
      console.log(`   Cookies: ${cookieData.cookies.slice(0, 100)}...`);

      if (ageMinutes > 30) {
        console.log("⚠️  Cookies may be expired (>30 minutes old)");
      }

      return cookieData;
    }
  } catch (error) {
    console.error(`❌ Failed to load cookies: ${error.message}`);
  }
  return null;
}

/**
 * Test if cookies work
 */
async function testCookies(cookieData) {
  console.log("\n🧪 Testing cookies with NSE API...");

  try {
    const response = await axios.get(
      "https://www.nseindia.com/api/corporate-announcements?index=equities",
      {
        headers: {
          "User-Agent": cookieData.userAgent,
          Cookie: cookieData.cookies,
          Referer: "https://www.nseindia.com/",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.data) {
      console.log(`✅ Cookies work! Got ${response.data.data.length} announcements`);
      return true;
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ Cookies don't work: HTTP ${error.response.status}`);
    } else {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }

  return false;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const method = args.find((arg) => arg.startsWith("--method="))?.split("=")[1];
  const shouldSave = args.includes("--save");
  const shouldTest = args.includes("--test");
  const shouldLoad = args.includes("--load");

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          NSE Cookie Refresh Script                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Load existing cookies
  if (shouldLoad) {
    const existing = loadCookies();
    if (existing && shouldTest) {
      await testCookies(existing);
    }
    return;
  }

  let cookieData = null;

  // Choose method
  if (method === "puppeteer") {
    cookieData = await refreshWithPuppeteer();
  } else if (method === "axios") {
    cookieData = await refreshWithRetries();
  } else {
    // Try axios first (faster), then puppeteer
    console.log("Strategy: Try Axios first, then Puppeteer if needed\n");

    cookieData = await refreshWithRetries();

    if (!cookieData) {
      console.log("\n⚠️  Axios methods failed, trying Puppeteer...");
      cookieData = await refreshWithPuppeteer();
    }
  }

  if (cookieData) {
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Successfully obtained NSE cookies!");
    console.log("=".repeat(60));

    if (shouldSave) {
      saveCookies(cookieData);
    }

    if (shouldTest) {
      await testCookies(cookieData);
    }

    // Output for programmatic use
    console.log("\n📋 Cookie String (for copy-paste):");
    console.log(cookieData.cookies);

    console.log("\n📋 User-Agent (use with cookies):");
    console.log(cookieData.userAgent);

    console.log("\n💡 To use in your code:");
    console.log(`
    axios.get('https://www.nseindia.com/api/...', {
      headers: {
        'Cookie': '${cookieData.cookies.slice(0, 50)}...',
        'User-Agent': '${cookieData.userAgent.slice(0, 50)}...',
      }
    });
    `);
  } else {
    console.log("\n" + "=".repeat(60));
    console.log("❌ Failed to get NSE cookies");
    console.log("=".repeat(60));
    console.log("\n💡 Possible solutions:");
    console.log("   1. Install Puppeteer: npm install puppeteer");
    console.log("   2. Try with VPN or different network");
    console.log("   3. Use proxy: node refresh-nse-cookies.js --proxy=http://...");
    console.log("   4. Extract manually from browser (see NSE_SCRAPING_GUIDE.md)");
    process.exit(1);
  }
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("\n❌ Unhandled error:", error.message);
  process.exit(1);
});

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { refreshWithAxios, refreshWithPuppeteer, loadCookies, saveCookies, testCookies };
