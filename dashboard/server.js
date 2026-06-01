import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// API endpoint to save feedback
app.post("/save-history", async (req, res) => {
  try {
    const history = req.body;
    await fs.writeFile(
      path.join(__dirname, "history.json"),
      JSON.stringify(history, null, 2),
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving history:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log("🚀 Trading Dashboard Server Started");
  console.log(`${"=".repeat(60)}\n`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log(`\n📝 Ready to receive trade feedback!`);
  console.log(`⏰ Dashboard will auto-refresh every minute\n`);
  console.log(`Press Ctrl+C to stop\n`);
});
