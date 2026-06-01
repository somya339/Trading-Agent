#!/usr/bin/env node

/**
 * Test Real News Scraper
 *
 * Run: npm run test-news
 */

import { COMPANY_MAPPING, NewsScraperAgent } from "./agent/src/data/news-scraper.ts";

async function testScraper() {
  console.log("🧪 Testing Real News Scraper\n");
  console.log("=".repeat(60));

  const scraper = new NewsScraperAgent();
  const testSymbols = Object.keys(COMPANY_MAPPING);

  for (const symbol of testSymbols) {
    console.log(`\n📰 Testing: ${symbol}`);
    console.log("-".repeat(60));

    const companyName = scraper.getCompanyName(symbol);
    console.log(`   Company: ${companyName}`);

    try {
      const news = await scraper.scrapeNews(symbol, companyName);

      if (news.length === 0) {
        console.log(
          "   ⚠️  No news found (websites may have blocked or structure changed)",
        );
        continue;
      }

      console.log(`\n   ✅ Found ${news} news items\n`);

      // Show top 5
      news.forEach((item, i) => {
        console.log(
          `   ${i + 1}. [${item.importance}] [${item.sentiment}] ${item.title}`,
        );
        console.log(
          `      Source: ${item.source} | Date: ${item.publishedAt.toLocaleDateString()}`,
        );
        console.log(`      Category: ${item.category}`);
        console.log(`      URL: ${item.url.substring(0, 60)}...\n`);
      });

      // Show sentiment breakdown
      const positive = news.filter((n) => n.sentiment === "POSITIVE").length;
      const negative = news.filter((n) => n.sentiment === "NEGATIVE").length;
      const neutral = news.filter((n) => n.sentiment === "NEUTRAL").length;

      console.log(
        `   Sentiment: ${positive} positive, ${negative} negative, ${neutral} neutral`,
      );
    } catch (error) {
      console.error(`   ❌ Error scraping ${symbol}:`, error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ News scraper test complete!\n");
  console.log("Note: If some sources failed, it's normal - websites may have:");
  console.log("  - Changed their HTML structure");
  console.log("  - Blocked automated requests");
  console.log("  - Require authentication");
  console.log("\nThe scraper tries 4 sources and uses whatever works.\n");
}

testScraper().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
