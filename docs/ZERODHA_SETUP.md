# Zerodha Kite Connect Setup Guide

This guide will help you set up Zerodha Kite Connect API access for the trading agent.

## Prerequisites

- Active Zerodha trading account
- ₹2000 for Kite Connect subscription (one-time, or free if you have an account)

## Step 1: Create Kite Connect App

1. **Login to Kite Developer Console:**
   - Visit: https://developers.kite.trade/
   - Login with your Zerodha credentials

2. **Create New App:**
   - Click "Create New App"
   - Fill in details:
     - **App name:** Trading Agent (or any name)
     - **Redirect URL:** `http://localhost:3000/callback` (we won't use this, but it's required)
     - **Description:** AI Trading Signal Generator
   - Click "Create"

3. **Get API Credentials:**
   - After creation, you'll see:
     - **API Key** (public)
     - **API Secret** (keep this private!)
   - Copy both and keep them safe

## Step 2: Configure Environment Variables

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   ```bash
   ZERODHA_API_KEY=your_api_key_here
   ZERODHA_API_SECRET=your_api_secret_here
   ```

## Step 3: Generate Access Token

The access token expires **daily** and needs to be regenerated each day through OAuth flow.

### Method 1: Using the CLI Helper (Recommended)

1. **Start the OAuth flow:**
   ```bash
   npm run auth
   ```

2. **You'll see instructions like:**
   ```
   📝 Steps to get access token:
   1. Visit: https://kite.trade/connect/login?api_key=YOUR_API_KEY
   2. Login and authorize the app
   3. Copy the request_token from the redirect URL
   4. Set ZERODHA_REQUEST_TOKEN in .env file
   5. Run this script again
   ```

3. **Follow the URL:**
   - Open the URL in your browser
   - Login with your Zerodha credentials
   - Authorize the app
   - You'll be redirected to: `http://localhost:3000/callback?request_token=XXXX&action=login&status=success`

4. **Copy the request token:**
   - From the URL above, copy the `request_token` value (the XXXX part)
   - Add it to your `.env` file:
     ```bash
     ZERODHA_REQUEST_TOKEN=XXXX
     ```

5. **Run the auth script again:**
   ```bash
   npm run auth
   ```

6. **You'll get the access token:**
   ```
   ✅ Access Token generated successfully!

   Add this to your .env file:
   ZERODHA_ACCESS_TOKEN=your_access_token_here

   ⚠️  Note: Access token expires daily. You need to regenerate it every day.
   ```

7. **Update `.env` with the access token:**
   ```bash
   ZERODHA_ACCESS_TOKEN=your_access_token_here
   ```

### Method 2: Using Postman (Alternative)

If you prefer using Postman or curl:

1. **Get Request Token:**
   - Visit: `https://kite.trade/connect/login?api_key=YOUR_API_KEY`
   - Authorize and copy `request_token` from redirect URL

2. **Exchange for Access Token:**
   ```bash
   curl -X POST https://api.kite.trade/session/token \
     -d "api_key=YOUR_API_KEY" \
     -d "request_token=YOUR_REQUEST_TOKEN" \
     -d "checksum=SHA256(api_key + request_token + api_secret)"
   ```

   Note: Checksum is SHA-256 hash of concatenated string

3. **Response will contain:**
   ```json
   {
     "access_token": "your_access_token",
     "user_id": "XX1234"
   }
   ```

## Step 4: Test Connection

Run a test to verify everything works:

```bash
npm start
```

You should see:
```
🤖 Initializing Trading Agent...
📥 Fetching NSE instruments...
✅ Loaded 1500+ NSE instruments
📚 Loaded memory: 0 signals, avg score 0.0/10
🚀 Starting trading scan...
```

## Daily Access Token Refresh

**Important:** The access token expires every day at midnight. You need to regenerate it daily.

### Automated Refresh (Optional)

You can create a cron job or script to automate this:

```bash
# Add to crontab (edit with: crontab -e)
0 9 * * 1-5 cd /path/to/trading-agent && npm run auth:auto
```

Create `scripts/auto-auth.sh`:
```bash
#!/bin/bash
# Open Zerodha login URL
open "https://kite.trade/connect/login?api_key=$ZERODHA_API_KEY"

# Wait for user to authorize and enter request token
echo "Paste request token:"
read REQUEST_TOKEN

# Generate access token
ZERODHA_REQUEST_TOKEN=$REQUEST_TOKEN npm run auth

# Restart agent
pm2 restart trading-agent
```

## Troubleshooting

### Error: "Invalid API credentials"
- Double-check API key and secret in `.env`
- Make sure there are no extra spaces or quotes

### Error: "Token is invalid or has expired"
- Access token expires daily - regenerate it
- Request token is valid for only 2 minutes - generate and use quickly

### Error: "Insufficient permissions"
- Make sure your Kite Connect app is approved
- Check if your Zerodha account has API access enabled

### Error: "Too many requests"
- Zerodha has rate limits (3 requests/second for market data)
- Agent has built-in delays, but if you're testing heavily, you might hit limits

## API Costs

- **Kite Connect:** ₹2000/month (or free with Zerodha account)
- **Historical Data:** Included
- **Real-time Data:** Included
- **WebSocket:** Included (not used in this simple version)

## Security Best Practices

1. **Never commit `.env` file** - it's in `.gitignore`
2. **Keep API secret private** - treat it like a password
3. **Regenerate credentials if exposed**
4. **Use read-only access when possible** - this agent only reads market data
5. **Monitor API usage** - check Kite Developer Console regularly

## Next Steps

Once setup is complete:
1. Test the agent: `npm start`
2. Start the dashboard: `npm run dashboard`
3. Open http://localhost:3000
4. Start rating signals to train the agent!

## Resources

- [Kite Connect Documentation](https://kite.trade/docs/connect/v3/)
- [API Console](https://developers.kite.trade/)
- [Zerodha Support](https://support.zerodha.com/)
