import type { Candle } from "../types";
import type { LiquidityPoolCandidate, LiquidityPriceBand } from "./market-structure-liquidity-types";
import type { MarketStructureSnapshot } from "./market-structure-types";
import { MarketStructureInvalidEvaluationBarIndexError } from "./market-structure-types";
import {
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
  type LiquidityInteractionEvent,
  type LiquidityInteractionSide,
  type LiquidityInteractionUnresolvedReason,
  type MarketStructureLiquidityInteractionContext,
} from "./market-structure-liquidity-interaction-types";

export {
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "./market-structure-liquidity-interaction-types";

export type {
  LiquidityInteractionEvent,
  LiquidityInteractionSide,
  LiquidityInteractionUnresolvedReason,
  MarketStructureLiquidityInteractionContext,
} from "./market-structure-liquidity-interaction-types";

export interface BuildMarketStructureLiquidityInteractionContextInput {
  snapshot: MarketStructureSnapshot;
  candles: readonly Candle[];
  horizonBars?: number;
}

const STANDARD_LIMITATIONS = [
  "liquidity_wick_touch_only",
  "not_sweep_not_taken_not_grab_not_reclaim",
  "not_production_signal",
  "not_mss",
  "no_bos_choch_correlation",
  "close_blind_wick_touch",
  "exact_price_comparison_no_epsilon",
  "cluster_price_band_metadata_only",
  "frozen_liquidity_pools_at_evaluation_only",
  "does_not_read_msl4_break",
  "does_not_rebuild_msl5",
  `interaction_rule_id=${MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID}`,
] as const;

const HIGH_SIDE_POOL_KINDS = new Set<LiquidityPoolCandidate["poolKind"]>([
  "SINGLE_HIGH",
  "EQH_CLUSTER",
]);

const LOW_SIDE_POOL_KINDS = new Set<LiquidityPoolCandidate["poolKind"]>([
  "SINGLE_LOW",
  "EQL_CLUSTER",
]);

function isPositiveFinitePrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

function isValidPriceBand(band: LiquidityPriceBand): boolean {
  return (
    isPositiveFinitePrice(band.lowerBound) &&
    isPositiveFinitePrice(band.upperBound) &&
    band.lowerBound <= band.upperBound
  );
}

function sideForPoolKind(
  poolKind: LiquidityPoolCandidate["poolKind"]
): LiquidityInteractionSide | null {
  if (HIGH_SIDE_POOL_KINDS.has(poolKind)) return "HIGH_SIDE";
  if (LOW_SIDE_POOL_KINDS.has(poolKind)) return "LOW_SIDE";
  return null;
}

function wickTouchesPool(
  side: LiquidityInteractionSide,
  candle: Candle,
  referencePrice: number
): boolean {
  if (side === "HIGH_SIDE") {
    return candle.high >= referencePrice;
  }
  return candle.low <= referencePrice;
}

function buildEventId(poolId: string, triggerBarIndex: number): string {
  return `li:${poolId}:LIQUIDITY_WICK_TOUCH:${triggerBarIndex}`;
}

function resolveHorizonBars(
  horizonBars: number | undefined
): { horizon: number; invalid: boolean } {
  const raw = horizonBars ?? DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
  if (!Number.isInteger(raw) || raw <= 0) {
    return { horizon: raw, invalid: true };
  }
  return { horizon: raw, invalid: false };
}

/**
 * MSL-6 research liquidity interaction: post-E wick touches against frozen MSL-5 pools only.
 */
export function buildMarketStructureLiquidityInteractionContext(
  input: BuildMarketStructureLiquidityInteractionContextInput
): MarketStructureLiquidityInteractionContext {
  const { snapshot, candles } = input;
  const E = snapshot.evaluationBarIndex;
  const candleCount = candles.length;

  if (
    candleCount === 0 ||
    !Number.isInteger(E) ||
    E < 0 ||
    E >= candleCount
  ) {
    throw new MarketStructureInvalidEvaluationBarIndexError(E, candleCount);
  }

  const { horizon, invalid: invalidHorizon } = resolveHorizonBars(input.horizonBars);
  const unresolved: LiquidityInteractionUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  if (invalidHorizon) {
    unresolved.push({
      code: "INVALID_HORIZON_BARS",
      message: `horizonBars must be a positive integer; received ${String(input.horizonBars)}.`,
    });
    return {
      schemaVersion: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      evaluationBarIndex: E,
      horizonBars: horizon,
      foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
      ruleIds: { touch: MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID },
      events: [],
      limitations,
      unresolved,
    };
  }

  const liquidity = snapshot.liquidity;
  if (!liquidity?.liquidityPools) {
    unresolved.push({
      code: "MISSING_LIQUIDITY_FOUNDATION",
      message: "snapshot.liquidity.liquidityPools is required for MSL-6 interaction.",
    });
    return {
      schemaVersion: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      evaluationBarIndex: E,
      horizonBars: horizon,
      foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
      ruleIds: { touch: MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID },
      events: [],
      limitations,
      unresolved,
    };
  }

  const start = E + 1;
  const lastIndex = candleCount - 1;
  const end = Math.min(E + horizon, lastIndex);

  if (start > lastIndex) {
    unresolved.push({
      code: "NO_FUTURE_DATA",
      message: "No bars after evaluation index; interaction window empty.",
    });
    limitations.push("INSUFFICIENT_FUTURE_BARS");
    return {
      schemaVersion: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      evaluationBarIndex: E,
      horizonBars: horizon,
      foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
      ruleIds: { touch: MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID },
      events: [],
      limitations,
      unresolved,
    };
  }

  type ScannablePool = {
    pool: LiquidityPoolCandidate;
    side: LiquidityInteractionSide;
  };

  const scannable: ScannablePool[] = [];

  for (const pool of liquidity.liquidityPools) {
    const side = sideForPoolKind(pool.poolKind);
    if (!side) {
      continue;
    }
    const priceInvalid = !isPositiveFinitePrice(pool.price);
    const bandInvalid = !isValidPriceBand(pool.priceBand);
    if (priceInvalid || bandInvalid) {
      unresolved.push({
        code: "INVALID_LIQUIDITY_PRICE",
        message: `poolId=${pool.poolId}; non-finite, non-positive, or invalid price band.`,
      });
      continue;
    }
    scannable.push({ pool, side });
  }

  const seen = new Set<string>();
  const events: LiquidityInteractionEvent[] = [];

  for (let barIndex = start; barIndex <= end; barIndex++) {
    const candle = candles[barIndex];
    for (const { pool, side } of scannable) {
      const ref = pool.price;
      if (!wickTouchesPool(side, candle, ref)) {
        continue;
      }
      const dedupeKey = `${pool.poolId}:${barIndex}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      events.push({
        eventId: buildEventId(pool.poolId, barIndex),
        eventType: "LIQUIDITY_WICK_TOUCH",
        ruleId: MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
        poolId: pool.poolId,
        poolKind: pool.poolKind,
        side,
        referencePrice: ref,
        referenceScope: pool.scope,
        sourcePivotIndices: [...pool.sourcePivotIndices],
        triggerBarIndex: barIndex,
        triggerTimestamp: candle.time,
        knownAtBarIndex: barIndex,
        evidenceTag: "DIRECT_OBSERVATION",
        priceBand: { ...pool.priceBand },
      });
    }
  }

  events.sort((a, b) => {
    if (a.triggerBarIndex !== b.triggerBarIndex) {
      return a.triggerBarIndex - b.triggerBarIndex;
    }
    return a.poolId.localeCompare(b.poolId);
  });

  return {
    schemaVersion: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    horizonBars: horizon,
    foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
    ruleIds: { touch: MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID },
    events,
    limitations,
    unresolved,
  };
}
