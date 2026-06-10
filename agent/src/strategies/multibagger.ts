/**
 * Multibagger screen — long-horizon compounders (2-10x over years).
 *
 * This is FUNDAMENTAL, not price-based, so it deliberately does NOT implement
 * the price-bar `Strategy` interface and is NOT run through the backtester.
 *
 * ⚠️  Why no backtest: honest multibagger backtesting needs point-in-time
 *    fundamentals (what ROCE/growth were KNOWN on each past date). We only have
 *    *current* fundamentals from Screener. Backtesting today's fundamentals
 *    against past prices is textbook look-ahead bias and would produce
 *    fantasy returns. So this engine screens live, and its picks should be
 *    validated by the paper-trading tracker over time — not by a backtest.
 *
 * Filters synthesize Coffee Can (Marcellus) + CAN SLIM (O'Neil) + Lynch:
 *   - ROCE ≥ 15% (ROE for lenders), consistent
 *   - Revenue growth ≥ 15% CAGR, profit growth ≥ 20%
 *   - Debt/Equity < 0.5 (strict) — falling is better
 *   - OPM ≥ 15%, ideally expanding
 *   - Promoter holding > 50%, low/zero pledging
 *   - PEG < 1 (growth at reasonable price)
 */

import type { FundamentalData } from "../types/index.js";

export interface MultibaggerVerdict {
  symbol: string;
  qualifies: boolean;
  score: number; // 0-100
  passed: string[];
  failed: string[];
  /** hard exclusions that immediately disqualify regardless of score */
  redFlags: string[];
}

export interface MultibaggerOptions {
  /** treat as a lender (use ROE instead of ROCE) */
  isLender?: boolean;
  /** the stock's P/E ÷ EPS growth, if computable upstream */
  peg?: number | null;
}

const LENDING_SECTORS = ["Banking & Finance", "Insurance & Asset Mgmt"];

export function isLendingSector(sector: string): boolean {
  return LENDING_SECTORS.some((s) => sector.includes(s.split(" ")[0]));
}

export function screenMultibagger(
  data: FundamentalData,
  sector: string,
  opts: MultibaggerOptions = {},
): MultibaggerVerdict {
  const passed: string[] = [];
  const failed: string[] = [];
  const redFlags: string[] = [];
  let score = 0;

  const isLender = opts.isLender ?? isLendingSector(sector);

  // ── Capital efficiency: ROCE (or ROE for lenders) ≥ 15% ──
  // We approximate ROCE with ROA-derived data not being ideal; use ROE as the
  // available proxy from our FundamentalData, and roa (which the provider fills
  // from ROCE) for non-lenders.
  const efficiency = isLender ? data.roe : (data.roa ?? data.roe);
  if (efficiency !== null) {
    if (efficiency >= 20) {
      score += 25;
      passed.push(`${isLender ? "ROE" : "ROCE"} ${efficiency.toFixed(0)}% (excellent)`);
    } else if (efficiency >= 15) {
      score += 18;
      passed.push(`${isLender ? "ROE" : "ROCE"} ${efficiency.toFixed(0)}%`);
    } else {
      failed.push(`${isLender ? "ROE" : "ROCE"} ${efficiency.toFixed(0)}% < 15%`);
    }
  } else {
    failed.push("Capital-efficiency data missing");
  }

  // ── Growth: revenue ≥ 15%, profit ≥ 20% ──
  if (data.revenueGrowth !== null) {
    if (data.revenueGrowth >= 15) {
      score += 15;
      passed.push(`Revenue growth ${data.revenueGrowth.toFixed(0)}%`);
    } else if (data.revenueGrowth < 0) {
      redFlags.push(`Revenue shrinking (${data.revenueGrowth.toFixed(0)}%)`);
    } else {
      failed.push(`Revenue growth ${data.revenueGrowth.toFixed(0)}% < 15%`);
    }
  }
  if (data.profitGrowth !== null) {
    if (data.profitGrowth >= 20) {
      score += 20;
      passed.push(`Profit growth ${data.profitGrowth.toFixed(0)}%`);
    } else if (data.profitGrowth < 0) {
      redFlags.push(`Profit shrinking (${data.profitGrowth.toFixed(0)}%)`);
    } else {
      failed.push(`Profit growth ${data.profitGrowth.toFixed(0)}% < 20%`);
    }
  }

  // ── Balance sheet: D/E < 0.5 (lenders exempt — leverage is their model) ──
  if (!isLender && data.debtToEquity !== null) {
    if (data.debtToEquity < 0.5) {
      score += 15;
      passed.push(`Low debt (D/E ${data.debtToEquity.toFixed(2)})`);
    } else if (data.debtToEquity > 1.5) {
      redFlags.push(`High debt (D/E ${data.debtToEquity.toFixed(2)})`);
    } else {
      failed.push(`D/E ${data.debtToEquity.toFixed(2)} ≥ 0.5`);
    }
  }

  // ── Margins: net margin as OPM proxy ≥ 15% ──
  if (data.netMargin !== null) {
    if (data.netMargin >= 15) {
      score += 10;
      passed.push(`Healthy margin (${data.netMargin.toFixed(0)}%)`);
    } else if (data.netMargin < 0) {
      redFlags.push("Loss-making (negative margin)");
    } else {
      failed.push(`Margin ${data.netMargin.toFixed(0)}% < 15%`);
    }
  }

  // ── Ownership: promoter holding > 50%, pledging is a red flag ──
  if (data.promoterHolding !== null) {
    if (data.promoterHolding > 50) {
      score += 10;
      passed.push(`Promoter holding ${data.promoterHolding.toFixed(0)}%`);
    } else if (data.promoterHolding < 30) {
      failed.push(`Low promoter holding ${data.promoterHolding.toFixed(0)}%`);
    }
  }
  if (data.promoterChange !== null && data.promoterChange < -1) {
    redFlags.push(`Promoter reducing stake (${data.promoterChange.toFixed(1)}%)`);
  }

  // ── Valuation: PEG < 1 (Lynch) ──
  if (opts.peg !== null && opts.peg !== undefined) {
    if (opts.peg > 0 && opts.peg < 1) {
      score += 5;
      passed.push(`PEG ${opts.peg.toFixed(2)} < 1`);
    } else if (opts.peg > 2) {
      failed.push(`Expensive (PEG ${opts.peg.toFixed(2)})`);
    }
  }

  // Qualifies only with a strong score AND no hard red flags.
  const qualifies = score >= 65 && redFlags.length === 0;

  return { symbol: data.symbol, qualifies, score: Math.min(100, score), passed, failed, redFlags };
}
