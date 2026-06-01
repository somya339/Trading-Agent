// Quick test for KiteConnect integration
const { KiteConnect } = require("kiteconnect");
require("dotenv").config();

console.log("🔍 Testing Zerodha KiteConnect Integration\n");

const apiKey = process.env.ZERODHA_API_KEY;
const apiSecret = process.env.ZERODHA_API_SECRET;
const accessToken = process.env.ZERODHA_ACCESS_TOKEN;

console.log("Configuration:");
console.log("  API Key:", apiKey ? "✅ Set" : "❌ Not set");
console.log("  API Secret:", apiSecret ? "✅ Set" : "❌ Not set");
console.log("  Access Token:", accessToken ? "✅ Set" : "❌ Not set");
console.log("");

if (!apiKey || !apiSecret) {
  console.log("❌ Missing API credentials in .env file");
  console.log("");
  console.log("Please add:");
  console.log("  ZERODHA_API_KEY=your_key");
  console.log("  ZERODHA_API_SECRET=your_secret");
  console.log("");
  console.log("Get them from: https://developers.kite.trade/");
  process.exit(1);
}

// Test KiteConnect initialization
try {
  const kc = new KiteConnect({ api_key: apiKey });
  console.log("✅ KiteConnect initialized successfully");
  console.log("");

  if (accessToken) {
    kc.setAccessToken(accessToken);
    console.log("✅ Access token set");
    console.log("");
    console.log("🚀 Ready to use! Run: npm start");
  } else {
    console.log("⚠️  Access token not set yet");
    console.log("");
    console.log("Next step:");
    console.log("  1. Run: npm run auth");
    console.log("  2. Follow instructions to get access token");
    console.log("  3. Add ZERODHA_ACCESS_TOKEN to .env");
  }

  console.log("");
  console.log("📚 Documentation:");
  console.log("  Official: https://kite.trade/docs/connect/v3/");
  console.log("  GitHub: https://github.com/zerodha/kiteconnectjs");
  console.log("");
} catch (error) {
  console.log("❌ Error:", error.message);
  process.exit(1);
}
