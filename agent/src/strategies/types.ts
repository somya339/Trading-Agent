/**
 * Shared Strategy contract.
 *
 * The SAME Strategy object is used by both the live pipeline and the
 * backtester — this is "research/live parity", the property that makes a
 * backtest trustworthy. A strategy must therefore be a PURE function of the
 * price/volume history up to and including the decision bar; it must never
 * peek at future bars.
 *
 * Bars passed to `evaluate` are the history *up to and including* the decision
 * bar. The backtester fills any resulting entry at the NEXT bar's open, so a
 * close-based signal cannot benefit from same-bar hindsight.
 */

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategySignal {
  /** true if the setup triggers on the decision bar */
  enter: boolean;
  /** protective stop price (absolute) */
  stopLoss: number;
  /** profit targets (absolute), ordered nearest-first */
  targets: number[];
  /** 0-100 conviction; used to rank candidates when capital is the constraint */
  score: number;
  /** time stop: force exit after this many bars if neither stop nor target hit */
  maxHoldBars: number;
  /** human-readable reasons (shown to the user) */
  reasons: string[];
  /** risks/cautions (shown to the user) */
  risks: string[];
  suggestedTimeframe: "SHORT" | "MEDIUM" | "LONG";
}

export interface StrategyContext {
  /** broad-market regime gate (CAN SLIM "M"): only go long in an uptrend */
  marketUptrend?: boolean;
  /** stock's relative-strength rank 1-99 vs the universe (IBD-style) */
  rsRating?: number;
  /** liquidity bucket for slippage modelling */
  liquidity?: "HIGH" | "MEDIUM" | "LOW";
}

export interface Strategy {
  readonly name: string;
  readonly kind: "MOMENTUM" | "SWING" | "MULTIBAGGER";
  /** minimum bars of history required before this strategy can evaluate */
  readonly minBars: number;
  /**
   * Decide whether to enter at the decision bar (the LAST bar in `bars`).
   * Must be pure: no I/O, no future bars.
   */
  evaluate(bars: Bar[], ctx?: StrategyContext): StrategySignal;
}

/** Convenience: a no-entry signal. */
export function noEntry(reason: string): StrategySignal {
  return {
    enter: false,
    stopLoss: 0,
    targets: [],
    score: 0,
    maxHoldBars: 0,
    reasons: [],
    risks: [reason],
    suggestedTimeframe: "MEDIUM",
  };
}

/** Build aligned OHLCV arrays from Bars (strategies often want columnar data). */
export function toColumns(bars: Bar[]) {
  return {
    dates: bars.map((b) => b.date),
    opens: bars.map((b) => b.open),
    highs: bars.map((b) => b.high),
    lows: bars.map((b) => b.low),
    closes: bars.map((b) => b.close),
    volumes: bars.map((b) => b.volume),
  };
}
