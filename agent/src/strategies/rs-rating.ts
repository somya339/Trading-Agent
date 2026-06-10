/**
 * IBD-style Relative Strength (RS) Rating.
 *
 * A 1-99 percentile rank of each stock's trailing ~12-month price performance
 * vs. the entire universe, with the most recent quarter weighted most heavily
 * (IBD weights roughly 40% / 20% / 20% / 20% across the four quarters).
 *
 * RS ≥ 80 marks a leader; momentum setups (Minervini) demand RS ≥ 70, ideally
 * ≥ 90. This is CROSS-SECTIONAL — it only has meaning relative to the universe
 * computed at the same time, so we compute it once per run over all candidates.
 */

const Q = 63; // ≈ trading days in a quarter

/** Weighted trailing return score for one close series. Higher = stronger. */
export function rsRawScore(closes: number[]): number | null {
  if (closes.length < 4 * Q + 1) return null;
  const last = closes[closes.length - 1];

  const ret = (barsAgo: number) => {
    const past = closes[closes.length - 1 - barsAgo];
    return past ? (last - past) / past : 0;
  };

  // Returns measured over the most recent quarter, and the trailing 6/9/12 mo.
  const q1 = ret(Q); // most recent quarter
  const q2 = ret(2 * Q);
  const q3 = ret(3 * Q);
  const q4 = ret(4 * Q); // full 12 months

  // IBD-like weighting: emphasize the most recent quarter.
  return 0.4 * q1 + 0.2 * q2 + 0.2 * q3 + 0.2 * q4;
}

/**
 * Assign 1-99 RS ratings to a map of symbol → closes.
 * Stocks without enough history are omitted from the result.
 */
export function computeRsRatings(
  closesBySymbol: Record<string, number[]>,
): Record<string, number> {
  const raw: { symbol: string; score: number }[] = [];
  for (const [symbol, closes] of Object.entries(closesBySymbol)) {
    const s = rsRawScore(closes);
    if (s !== null && Number.isFinite(s)) raw.push({ symbol, score: s });
  }
  if (raw.length === 0) return {};

  raw.sort((a, b) => a.score - b.score); // ascending: worst first
  const n = raw.length;
  const ratings: Record<string, number> = {};
  raw.forEach((r, i) => {
    // percentile rank → 1..99
    const pct = n === 1 ? 99 : Math.round((i / (n - 1)) * 98) + 1;
    ratings[r.symbol] = pct;
  });
  return ratings;
}
