/**
 * Position sizing & portfolio risk engine.
 *
 * Replaces the old `min(capital*risk, risk*100)` heuristic (which had no
 * financial meaning and allowed ~40% of capital at risk at once) with a
 * layered model that mirrors how professional systematic books are run:
 *
 *   1. Per-trade sizing: ATR / stop-distance fixed-fractional
 *        qty = floor( (capital * riskPerTrade) / (entry - stop) )
 *   2. Per-position cap: notional ≤ maxPositionPct * capital
 *   3. Per-sector cap:   Σ notional in a sector ≤ maxSectorPct * capital
 *   4. Portfolio heat:   Σ (per-trade risk) ≤ maxPortfolioHeatPct * capital
 *   5. Position count:    ≤ maxOpenPositions
 *   6. Min notional:     skip sub-economic positions (flat DP charge)
 *
 * Candidates are processed in priority order (caller sorts best-first), so when
 * a limit binds, the BEST trades get the capital. Rejections are reported with
 * a reason, not silently dropped — important for trust.
 */

export interface RiskParams {
  capital: number;
  riskPerTradePct: number;
  maxPortfolioHeatPct: number;
  maxPositionPct: number;
  maxSectorPct: number;
  maxOpenPositions: number;
  minPositionValue: number;
  /**
   * Max fraction of capital deployed across ALL positions (notional, not risk).
   * Without this, wide stops let many positions each pass the risk/heat checks
   * while their notionals sum past 100% of cash. Cash accounts can't exceed
   * 1.0; allow >1.0 only if intentionally using margin. Defaults to 1.0.
   */
  maxTotalDeploymentPct?: number;
}

export interface SizingCandidate {
  symbol: string;
  sector: string;
  entry: number;
  stopLoss: number;
  /** higher = better; engine processes in this order (caller pre-sorts) */
  priority: number;
}

export interface SizedPosition {
  symbol: string;
  sector: string;
  entry: number;
  stopLoss: number;
  quantity: number;
  notional: number; // entry * quantity
  riskAmount: number; // (entry - stop) * quantity
  riskPctOfCapital: number;
}

export interface RiskRejection {
  symbol: string;
  reason: string;
}

export interface AllocationResult {
  accepted: SizedPosition[];
  rejected: RiskRejection[];
  totalRiskAmount: number;
  totalNotional: number;
  portfolioHeatPct: number;
  capitalDeployedPct: number;
}

export function allocate(
  candidates: SizingCandidate[],
  params: RiskParams,
): AllocationResult {
  const {
    capital,
    riskPerTradePct,
    maxPortfolioHeatPct,
    maxPositionPct,
    maxSectorPct,
    maxOpenPositions,
    minPositionValue,
    maxTotalDeploymentPct = 1.0,
  } = params;

  const accepted: SizedPosition[] = [];
  const rejected: RiskRejection[] = [];

  const riskBudget = capital * riskPerTradePct;
  const heatBudget = capital * maxPortfolioHeatPct;
  const positionCap = capital * maxPositionPct;
  const sectorCap = capital * maxSectorPct;
  const deploymentBudget = capital * maxTotalDeploymentPct;

  let usedRisk = 0;
  let usedNotional = 0;
  const sectorNotional: Record<string, number> = {};

  const ordered = [...candidates].sort((a, b) => b.priority - a.priority);

  for (const c of ordered) {
    const perShareRisk = c.entry - c.stopLoss;

    // Guard: a stop at/above entry is invalid (no defined risk).
    if (perShareRisk <= 0) {
      rejected.push({ symbol: c.symbol, reason: "Invalid stop (>= entry)" });
      continue;
    }
    if (accepted.length >= maxOpenPositions) {
      rejected.push({ symbol: c.symbol, reason: `Max ${maxOpenPositions} positions reached` });
      continue;
    }

    // 1. Per-position notional cap. If even ONE share won't fit, the stock is
    //    simply too expensive for this account's concentration limit — reject
    //    with an honest reason rather than the misleading "stop too wide".
    const maxQtyByPosition = Math.floor(positionCap / c.entry);
    if (maxQtyByPosition < 1) {
      rejected.push({
        symbol: c.symbol,
        reason: `Share ₹${Math.round(c.entry)} exceeds per-position budget ₹${Math.round(positionCap)}`,
      });
      continue;
    }

    // 2. Fixed-fractional sizing off stop distance. When the stop is wide
    //    enough that the risk budget rounds to 0 shares, still allow a minimum
    //    of 1 share IF it fits the position cap — the per-position and
    //    portfolio-heat caps remain the binding guardrails. (This single share
    //    may risk slightly more than riskPerTradePct; the heat cap bounds the
    //    aggregate.)
    const qtyByRisk = Math.floor(riskBudget / perShareRisk);
    let qty = Math.min(Math.max(qtyByRisk, 1), maxQtyByPosition);

    // 3. Per-sector notional cap (on remaining sector headroom).
    const sectorUsed = sectorNotional[c.sector] || 0;
    const sectorHeadroom = sectorCap - sectorUsed;
    if (sectorHeadroom <= 0) {
      rejected.push({ symbol: c.symbol, reason: `Sector cap reached (${c.sector})` });
      continue;
    }
    qty = Math.min(qty, Math.floor(sectorHeadroom / c.entry));

    // 4. Portfolio-heat cap — clamp qty so total open risk stays within budget.
    const heatHeadroom = heatBudget - usedRisk;
    if (heatHeadroom <= 0) {
      rejected.push({ symbol: c.symbol, reason: "Portfolio heat budget exhausted" });
      continue;
    }
    qty = Math.min(qty, Math.floor(heatHeadroom / perShareRisk));

    // 5. Total-deployment cap — keep the SUM of position notionals within the
    //    cash (or margin) budget. Without this, wide stops let many positions
    //    each pass risk/heat while their notionals sum past 100% of capital.
    const deploymentHeadroom = deploymentBudget - usedNotional;
    if (deploymentHeadroom <= 0) {
      rejected.push({ symbol: c.symbol, reason: "Capital fully deployed" });
      continue;
    }
    qty = Math.min(qty, Math.floor(deploymentHeadroom / c.entry));

    if (qty < 1) {
      rejected.push({ symbol: c.symbol, reason: "Clamped to 0 by caps" });
      continue;
    }

    // 6. Min-notional gate (flat DP charge makes tiny positions uneconomic).
    const notional = qty * c.entry;
    if (notional < minPositionValue) {
      rejected.push({
        symbol: c.symbol,
        reason: `Below min position value (₹${Math.round(notional)} < ₹${minPositionValue})`,
      });
      continue;
    }

    const riskAmount = qty * perShareRisk;
    accepted.push({
      symbol: c.symbol,
      sector: c.sector,
      entry: c.entry,
      stopLoss: c.stopLoss,
      quantity: qty,
      notional,
      riskAmount,
      riskPctOfCapital: (riskAmount / capital) * 100,
    });

    usedRisk += riskAmount;
    usedNotional += notional;
    sectorNotional[c.sector] = sectorUsed + notional;
  }

  return {
    accepted,
    rejected,
    totalRiskAmount: usedRisk,
    totalNotional: usedNotional,
    portfolioHeatPct: (usedRisk / capital) * 100,
    capitalDeployedPct: (usedNotional / capital) * 100,
  };
}
