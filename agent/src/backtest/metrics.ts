/**
 * Performance metrics for backtests and the paper-trading tracker.
 *
 * These are the numbers that separate "looks good on a chart" from "has a real,
 * cost-survivable edge". A 15-year trader looks at risk-adjusted return and
 * drawdown FIRST, raw return last.
 *
 * Caveat worth remembering: a high backtest Sharpe across many tried variants
 * is often selection bias. Treat anything > ~2.5 with suspicion and validate
 * out-of-sample / walk-forward.
 */

export interface ClosedTrade {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  /** net P&L in ₹ after costs+slippage */
  netPnl: number;
  /** net return on this position as a fraction (0.1 = +10%) */
  returnPct: number;
  exitReason: string;
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // %
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number; // gross profit / gross loss
  expectancyPct: number; // per-trade expected return %
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number; // annualized
  sortino: number; // annualized
  calmar: number;
  avgHoldingDays: number;
  bestTradePct: number;
  worstTradePct: number;
}

const TRADING_DAYS = 252;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

/**
 * Max peak-to-trough drawdown of an equity curve, as a positive %.
 */
export function maxDrawdown(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/**
 * Sharpe from a series of PERIODIC returns (e.g. daily equity returns),
 * annualized. riskFreeAnnual default 6% reflects Indian rates.
 */
export function sharpeRatio(
  periodReturns: number[],
  periodsPerYear = TRADING_DAYS,
  riskFreeAnnual = 0.06,
): number {
  if (periodReturns.length < 2) return 0;
  const rfPerPeriod = riskFreeAnnual / periodsPerYear;
  const excess = periodReturns.map((r) => r - rfPerPeriod);
  const sd = stddev(excess);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(periodsPerYear);
}

/** Sortino — like Sharpe but only penalizes downside deviation. */
export function sortinoRatio(
  periodReturns: number[],
  periodsPerYear = TRADING_DAYS,
  riskFreeAnnual = 0.06,
): number {
  if (periodReturns.length < 2) return 0;
  const rfPerPeriod = riskFreeAnnual / periodsPerYear;
  const excess = periodReturns.map((r) => r - rfPerPeriod);
  const downside = excess.filter((r) => r < 0);
  if (downside.length === 0) return excess.some((r) => r > 0) ? Infinity : 0;
  const downsideDev = Math.sqrt(mean(downside.map((r) => r * r)));
  if (downsideDev === 0) return 0;
  return (mean(excess) / downsideDev) * Math.sqrt(periodsPerYear);
}

/** Daily equity returns from an equity curve. */
export function equityReturns(equity: EquityPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].equity;
    if (prev > 0) out.push((equity[i].equity - prev) / prev);
  }
  return out;
}

export function computeMetrics(
  trades: ClosedTrade[],
  equity: EquityPoint[],
  startingCapital: number,
): PerformanceMetrics {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);

  const grossProfit = wins.reduce((a, t) => a + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0));

  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWinPct = wins.length ? mean(wins.map((t) => t.returnPct * 100)) : 0;
  const avgLossPct = losses.length ? mean(losses.map((t) => t.returnPct * 100)) : 0;

  // Expectancy: probability-weighted per-trade return.
  const p = trades.length ? wins.length / trades.length : 0;
  const expectancyPct = p * avgWinPct + (1 - p) * avgLossPct;

  const endEquity = equity.length ? equity[equity.length - 1].equity : startingCapital;
  const totalReturnPct = ((endEquity - startingCapital) / startingCapital) * 100;

  const years =
    equity.length >= 2
      ? Math.max(daysBetween(equity[0].date, equity[equity.length - 1].date) / 365, 1 / 365)
      : 1;
  const cagrPct =
    startingCapital > 0 ? ((endEquity / startingCapital) ** (1 / years) - 1) * 100 : 0;

  const dd = maxDrawdown(equity);
  const rets = equityReturns(equity);
  const sharpe = sharpeRatio(rets);
  const sortino = sortinoRatio(rets);
  const calmar = dd > 0 ? cagrPct / dd : 0;

  const holdingDays = trades.map((t) => daysBetween(t.entryDate, t.exitDate));
  const returnPcts = trades.map((t) => t.returnPct * 100);

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWinPct,
    avgLossPct,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancyPct,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: dd,
    sharpe,
    sortino,
    calmar,
    avgHoldingDays: holdingDays.length ? mean(holdingDays) : 0,
    bestTradePct: returnPcts.length ? Math.max(...returnPcts) : 0,
    worstTradePct: returnPcts.length ? Math.min(...returnPcts) : 0,
  };
}

/** One-line summary for console/log output. */
export function formatMetrics(m: PerformanceMetrics): string {
  const pf = m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);
  return [
    `Trades: ${m.totalTrades} (${m.wins}W/${m.losses}L, ${m.winRate.toFixed(0)}% win)`,
    `Return: ${m.totalReturnPct.toFixed(1)}% | CAGR: ${m.cagrPct.toFixed(1)}%`,
    `MaxDD: ${m.maxDrawdownPct.toFixed(1)}%`,
    `Sharpe: ${m.sharpe.toFixed(2)} | Sortino: ${m.sortino.toFixed(2)} | Calmar: ${m.calmar.toFixed(2)}`,
    `PF: ${pf} | Expectancy: ${m.expectancyPct.toFixed(2)}%/trade`,
    `Avg hold: ${m.avgHoldingDays.toFixed(0)}d`,
  ].join("\n  ");
}
