/**
 * NSE equity-delivery transaction cost model.
 *
 * Figures verified against Zerodha's official charges page (2026). Costs are
 * dominated by STT (0.1% each side) and — for small positions — the FLAT
 * ₹15.34 DP charge on every sell. That flat charge is exactly why tiny
 * positions are uneconomic, so size accordingly.
 *
 * These are CNC / delivery rates (what a positional/swing equity strategy
 * uses). Intraday (MIS) rates differ and are not modelled here.
 *
 * Everything is computed on a single leg (buy or sell) so the backtester and
 * paper tracker can charge entry and exit independently.
 */

export interface LegCostBreakdown {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  stampDuty: number;
  dpCharge: number;
  gst: number;
  total: number;
}

export interface RoundTripCost {
  buy: LegCostBreakdown;
  sell: LegCostBreakdown;
  total: number;
  /** total as a % of the buy notional — handy for "is this trade worth it?" */
  pctOfNotional: number;
}

// All rates are fractions of turnover unless noted. Sourced from zerodha.com/charges.
const RATES = {
  brokerageDelivery: 0, // ₹0 on CNC delivery at discount brokers
  stt: 0.001, // 0.1% on BOTH buy and sell (delivery)
  exchangeTxnNSE: 0.0000297, // 0.00297% of turnover
  sebi: 0.000001, // ₹10 per crore = 0.0001%
  stampDutyBuy: 0.00015, // 0.015% on buy side only
  gst: 0.18, // 18% on (brokerage + exchangeTxn + sebi)
  dpChargeSell: 15.34, // flat ₹ per scrip on sell (DP + GST inclusive figure)
};

function buyLeg(notional: number): LegCostBreakdown {
  const brokerage = RATES.brokerageDelivery;
  const stt = notional * RATES.stt;
  const exchangeTxn = notional * RATES.exchangeTxnNSE;
  const sebi = notional * RATES.sebi;
  const stampDuty = notional * RATES.stampDutyBuy;
  const gst = (brokerage + exchangeTxn + sebi) * RATES.gst;
  const total = brokerage + stt + exchangeTxn + sebi + stampDuty + gst;
  return { brokerage, stt, exchangeTxn, sebi, stampDuty, dpCharge: 0, gst, total };
}

function sellLeg(notional: number): LegCostBreakdown {
  const brokerage = RATES.brokerageDelivery;
  const stt = notional * RATES.stt;
  const exchangeTxn = notional * RATES.exchangeTxnNSE;
  const sebi = notional * RATES.sebi;
  const gst = (brokerage + exchangeTxn + sebi) * RATES.gst;
  const dpCharge = RATES.dpChargeSell;
  const total = brokerage + stt + exchangeTxn + sebi + gst + dpCharge;
  return { brokerage, stt, exchangeTxn, sebi, stampDuty: 0, dpCharge, gst, total };
}

/** Cost of one leg. `side` selects buy vs sell (DP + stamp differ by side). */
export function legCost(notional: number, side: "BUY" | "SELL"): LegCostBreakdown {
  return side === "BUY" ? buyLeg(notional) : sellLeg(notional);
}

/** Full round-trip cost given entry/exit prices and quantity. */
export function roundTripCost(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
): RoundTripCost {
  const buyNotional = entryPrice * quantity;
  const sellNotional = exitPrice * quantity;
  const buy = buyLeg(buyNotional);
  const sell = sellLeg(sellNotional);
  const total = buy.total + sell.total;
  return {
    buy,
    sell,
    total,
    pctOfNotional: buyNotional > 0 ? (total / buyNotional) * 100 : 0,
  };
}

/**
 * Slippage estimate as a fraction of price. Conservative defaults by liquidity:
 * liquid large-caps ~5bps, mid ~15bps, small/illiquid ~35bps per leg.
 * The backtester adds this to the fill price so results aren't rosy.
 */
export function slippageBps(liquidity: "HIGH" | "MEDIUM" | "LOW"): number {
  return liquidity === "HIGH" ? 5 : liquidity === "MEDIUM" ? 15 : 35;
}

/** Apply slippage to a fill: buys fill higher, sells fill lower. */
export function applySlippage(
  price: number,
  side: "BUY" | "SELL",
  liquidity: "HIGH" | "MEDIUM" | "LOW",
): number {
  const frac = slippageBps(liquidity) / 10000;
  return side === "BUY" ? price * (1 + frac) : price * (1 - frac);
}

/**
 * Net return % of a round-trip after all costs + slippage.
 * This is the number that actually matters for "did this trade make money?".
 */
export function netReturnPct(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  liquidity: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM",
): number {
  const filledEntry = applySlippage(entryPrice, "BUY", liquidity);
  const filledExit = applySlippage(exitPrice, "SELL", liquidity);
  const gross = (filledExit - filledEntry) * quantity;
  const costs = roundTripCost(filledEntry, filledExit, quantity).total;
  const net = gross - costs;
  const invested = filledEntry * quantity;
  return invested > 0 ? (net / invested) * 100 : 0;
}
