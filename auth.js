#!/usr/bin/env node

// Zerodha OAuth Token Generator
// Simple script to generate access token

import { KiteConnect } from "kiteconnect";
import * as dotenv from "dotenv";

dotenv.config();

console.log("\n🔐 Zerodha OAuth Token Generator\n");
console.log("=".repeat(60));

const apiKey = process.env.ZERODHA_API_KEY;
const apiSecret = process.env.ZERODHA_API_SECRET;
const requestToken = process.env.ZERODHA_REQUEST_TOKEN;

// Validate credentials
if (!apiKey || !apiSecret) {
  console.error("\n❌ Error: Missing API credentials\n");
  console.log("Please add to .env file:");
  console.log("  ZERODHA_API_KEY=your_api_key");
  console.log("  ZERODHA_API_SECRET=your_api_secret\n");
  console.log("Get them from: https://developers.kite.trade/\n");
  process.exit(1);
}

// Check if request token is provided
if (!requestToken) {
  console.log("\n📝 Steps to Generate Access Token:\n");
  console.log("Step 1: Visit this URL in your browser:");
  console.log(`\n  https://kite.trade/connect/login?api_key=${apiKey}\n`);
  console.log("Step 2: Login with your Zerodha credentials");
  console.log("Step 3: After authorization, you will be redirected to:");
  console.log(
    "  http://localhost:3000/callback?request_token=XXXX&action=login&status=success\n",
  );
  console.log("Step 4: Copy the request_token value (the XXXX part)");
  console.log("Step 5: Add it to your .env file:");
  console.log("  ZERODHA_REQUEST_TOKEN=your_request_token\n");
  console.log("Step 6: Run this command again: npm run auth\n");
  console.log("=".repeat(60));
  console.log("\n💡 Tip: Request token is valid for only 2 minutes!\n");
  process.exit(0);
}

// Generate session with request token
console.log("\n⏳ Generating access token...\n");

try {
  const kc = new KiteConnect({ api_key: apiKey });
  const session = await kc.generateSession(requestToken, apiSecret);

  console.log("✅ Success! Access token generated.\n");
  console.log("=".repeat(60));
  console.log("\nAdd this to your .env file:\n");
  console.log(`ZERODHA_ACCESS_TOKEN=${session.access_token}\n`);
  console.log("=".repeat(60));
  console.log("\n⚠️  Important Notes:\n");
  console.log("  1. Access token expires daily at midnight");
  console.log("  2. You need to regenerate it every morning");
  console.log("  3. Clear ZERODHA_REQUEST_TOKEN from .env after use\n");
  console.log("🚀 Next step: npm start\n");
} catch (error) {
  console.error("\n❌ Error generating access token:\n");
  console.error(`  ${error.message}\n`);
  console.log("💡 Troubleshooting:\n");
  console.log("  1. Request token is valid for only 2 minutes");
  console.log("  2. Make sure you copied the complete token");
  console.log("  3. Check API key and secret are correct");
  console.log("  4. Try generating a new request token\n");
  console.log(
    "  Start over: Remove ZERODHA_REQUEST_TOKEN from .env and run npm run auth again\n",
  );
  process.exit(1);
}
