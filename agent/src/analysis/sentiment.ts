import OpenAI from "openai";
import type { NewsScraperAgent } from "../data/news-scraper.js";

export class SentimentAnalyzer {
  private openai: OpenAI;
  private newsScraper: NewsScraperAgent;
  private memory?: any;

  constructor(openaiApiKey: string, newsScraper: NewsScraperAgent, memory?: any) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.newsScraper = newsScraper;
    this.memory = memory;
  }

  async runNewsSentiment(
    symbols: string[],
  ): Promise<Record<string, { score: number | null; summary: string; headlines: string[] }>> {
    const results: Record<
      string,
      { score: number | null; summary: string; headlines: string[] }
    > = {};

    for (const symbol of symbols) {
      try {
        console.log(`   Fetching news for ${symbol}...`);
        const newsItems = await this.newsScraper.scrapeNews(symbol);

        if (newsItems.length === 0) {
          results[symbol] = {
            score: null,
            summary: "No recent news found",
            headlines: [],
          };
          continue;
        }

        const headlines = newsItems.slice(0, 8).map((n) => `- ${n.title}`);

        const sentiment = await this.aiScoreSentiment(symbol, headlines);
        results[symbol] = {
          score: sentiment.score,
          summary: sentiment.summary,
          headlines,
        };
        console.log(
          `   ${symbol}: sentiment ${sentiment.score}/100 — ${sentiment.summary.slice(0, 60)}...`,
        );
      } catch {
        results[symbol] = {
          score: null,
          summary: "Sentiment analysis failed",
          headlines: [],
        };
      }
    }

    return results;
  }

  async aiScoreSentiment(
    symbol: string,
    headlines: string[],
  ): Promise<{ score: number; summary: string }> {
    const symbolPref = this.memory?.symbolPreferences?.[symbol];
    const memoryNote = symbolPref
      ? `\nNote: Past user feedback for ${symbol}: ${symbolPref.toFixed(0)}/10 average rating.`
      : "";

    const prompt = `Analyze the investment sentiment for ${symbol} based on these recent headlines:
${headlines.join("\n")}
${memoryNote}

Return JSON:
{
  "score": <0-100, where 0=very bearish, 50=neutral, 100=very bullish>,
  "summary": "<1-2 sentence summary of the news sentiment and key catalyst>"
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert financial news analyst for Indian stocks. Score sentiment based on business impact, not just tone.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 200,
    });

    return JSON.parse(
      response.choices[0].message.content || '{"score":50,"summary":"Neutral"}',
    );
  }
}
