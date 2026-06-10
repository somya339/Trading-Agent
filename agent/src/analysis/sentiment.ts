import OpenAI from "openai";
import type { NewsScraperAgent } from "../data/news-scraper.js";

export class SentimentAnalyzer {
  private openai: OpenAI;
  private newsScraper: NewsScraperAgent;

  // Note: memory is intentionally NOT used for sentiment. Injecting a past
  // user rating into the prompt anchors the model and defeats the point of an
  // independent news read. Sentiment must stay objective.
  constructor(openaiApiKey: string, newsScraper: NewsScraperAgent) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.newsScraper = newsScraper;
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
    const today = new Date().toISOString().split("T")[0];

    const prompt = `Today is ${today}. Score the investment sentiment for the NSE stock ${symbol} based ONLY on these headlines:
${headlines.join("\n")}

Scoring method (forward-looking price impact over the next 1-4 weeks, NOT tone):
- Weight RECENT, specific, material news far more than old or generic items.
- Judge BUSINESS IMPACT: earnings beats/misses, order wins, guidance, margins, regulatory/policy, management/promoter actions, capex, M&A, debt events.
- Discount vague PR, listicles, "stocks to watch" filler, and already-priced-in news.
- If headlines are stale, generic, or irrelevant to the stock's prospects, return ~50.
- Resolve conflicting items by net materiality, not count.

Calibration anchors:
  0-20 very bearish (serious negative catalyst) · 20-40 bearish · 40-60 neutral/mixed
  60-80 bullish (clear positive catalyst) · 80-100 very bullish (strong, fresh, material catalyst)

Think through the catalysts internally, then return ONLY this JSON:
{
  "score": <integer 0-100>,
  "catalyst": "<the single most price-relevant catalyst, or 'none'>",
  "confidence": "<HIGH|MEDIUM|LOW based on how material/specific the news is>",
  "summary": "<1-2 sentences: the news sentiment and why it moves the stock>"
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content:
            "You are a senior sell-side equity analyst covering Indian (NSE) stocks. You score how news is likely to affect a stock's price over the coming weeks, based on business fundamentals and catalysts — never on headline tone alone. You are skeptical of hype and ignore already-priced-in or generic news. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      // Keep well under the model's 128000 ceiling (an oversized value throws a
      // 400). ~2000 is plenty for reasoning + a short JSON verdict.
      max_completion_tokens: 5000,
    });

    const parsed = JSON.parse(
      response.choices[0].message.content ||
        '{"score":50,"summary":"Neutral","catalyst":"none","confidence":"LOW"}',
    );
    // Fold catalyst into the summary so the rest of the pipeline (which only
    // consumes score + summary) surfaces it without a schema change.
    const summary =
      parsed.catalyst && parsed.catalyst !== "none"
        ? `${parsed.summary} [Catalyst: ${parsed.catalyst}, ${parsed.confidence} confidence]`
        : parsed.summary;
    return { score: parsed.score, summary };
  }
}
