import type { Candle } from "../types";
import type { LiquidityPoolCandidate, LiquidityPriceBand } from "./market-structure-liquidity-types";
import type { MarketStructureSnapshot } from "./market-structure-types";
import { MarketStructureInvalidEvaluationBarIndexError } from "./market-structure-types";
import {
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  type LiquidityInteractionSide,
} from "./market-structure-liquidity-interaction-types";
import {
  deriveMarketStructureLiquidityLifecycle,
  MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID,
} from "./market-structure-liquidity-lifecycle-derivation";
import {
  MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
  type AdvancedLiquidityInteractionEvent,
  type AdvancedLiquidityInteractionUnresolvedReason,
  type LiquidityReclaimEvent,
  type LiquiditySweepEvent,
  type LiquidityTakenEvent,
  type MarketStructureLiquidityAdvancedInteractionContext,
} from "./market-structure-liquidity-advanced-interaction-types";

export {
  MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
} from "./market-structure-liquidity-advanced-interaction-types";

export {
  deriveMarketStructureLiquidityLifecycle,
  MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID,
} from "./market-structure-liquidity-lifecycle-derivation";

export type {
  AdvancedLiquidityInteractionEvent,
  LiquidityReclaimEvent,
  LiquiditySweepEvent,
  LiquidityTakenEvent,
  MarketStructureLiquidityAdvancedInteractionContext,
} from "./market-structure-liquidity-advanced-interaction-types";

export type {
  DeriveMarketStructureLiquidityLifecycleInput,
  LiquidityLifecyclePhase,
  LiquidityPoolLifecycleProjection,
} from "./market-structure-liquidity-lifecycle-derivation";

export interface BuildMarketStructureLiquidityAdvancedInteractionContextInput {
  snapshot: MarketStructureSnapshot;
  candles: readonly Candle[];
  horizonBars?: number;
}

const STANDARD_LIMITATIONS = [
  "liquidity_advanced_interaction_research_only",
  "sweep_is_not_taken",
  "taken_is_not_consumed",
  "reclaim_requires_prior_sweep",
  "taken_breaks_reclaim_chain",
  "pool_foundation_frozen_at_E",
  "no_future_pool_rebuild",
  "no_price_band_trigger",
  "no_minimum_penetration",
  "no_grab",
  "no_mss",
  "no_production_signal",
  "immutable_events_derived_lifecycle",
  "consumed_not_established_v1",
  "msl6_touch_unchanged",
  "msl7c_advanced_not_implemented",
  "msl7d_association_unchanged",
  `advanced_interaction_rule_id=${MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID}`,
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

function isSweep(
  side: LiquidityInteractionSide,
  candle: Candle,
  P: number
): boolean {
  if (side === "HIGH_SIDE") {
    return candle.high > P && candle.close <= P;
  }
  return candle.low < P && candle.close >= P;
}

function isTaken(
  side: LiquidityInteractionSide,
  candle: Candle,
  P: number
): boolean {
  if (side === "HIGH_SIDE") {
    return candle.high > P && candle.close > P;
  }
  return candle.low < P && candle.close < P;
}

function isReclaimClose(
  side: LiquidityInteractionSide,
  candle: Candle,
  P: number
): boolean {
  if (side === "HIGH_SIDE") {
    return candle.close <= P;
  }
  return candle.close >= P;
}

function buildSweepEventId(poolId: string, triggerBarIndex: number): string {
  return `li:${poolId}:LIQUIDITY_SWEEP:${triggerBarIndex}`;
}

function buildTakenEventId(poolId: string, triggerBarIndex: number): string {
  return `li:${poolId}:LIQUIDITY_TAKEN:${triggerBarIndex}`;
}

function buildReclaimEventId(poolId: string, triggerBarIndex: number): string {
  return `li:${poolId}:LIQUIDITY_RECLAIM:${triggerBarIndex}`;
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

function eventBaseFields(
  pool: LiquidityPoolCandidate,
  side: LiquidityInteractionSide,
  barIndex: number,
  candle: Candle
): Omit<
  AdvancedLiquidityInteractionEvent,
  "eventId" | "eventType" | "ruleId" | "precedingSweepEventId" | "precedingSweepTriggerBarIndex"
> {
  return {
    poolId: pool.poolId,
    poolKind: pool.poolKind,
    side,
    referencePrice: pool.price,
    referenceScope: pool.scope,
    sourcePivotIndices: [...pool.sourcePivotIndices],
    triggerBarIndex: barIndex,
    triggerTimestamp: candle.time,
    knownAtBarIndex: barIndex,
    evidenceTag: "DIRECT_OBSERVATION",
    priceBand: { ...pool.priceBand },
  };
}

function compareEvents(
  a: AdvancedLiquidityInteractionEvent,
  b: AdvancedLiquidityInteractionEvent
): number {
  if (a.triggerBarIndex !== b.triggerBarIndex) {
    return a.triggerBarIndex - b.triggerBarIndex;
  }
  if (a.poolId !== b.poolId) {
    return a.poolId.localeCompare(b.poolId);
  }
  return a.eventType.localeCompare(b.eventType);
}

function emptyContext(
  E: number,
  horizon: number,
  limitations: string[],
  unresolved: AdvancedLiquidityInteractionUnresolvedReason[]
): MarketStructureLiquidityAdvancedInteractionContext {
  return {
    schemaVersion: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    horizonBars: horizon,
    foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
    ruleIds: {
      research: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
      sweep: MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
      taken: MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
      reclaim: MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
      lifecycle: MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID,
    },
    events: [],
    lifecycle: [],
    limitations,
    unresolved,
  };
}

/**
 * MSL-7E: advanced liquidity sweep/taken/reclaim against frozen MSL-5 pools (research-only).
 */
export function buildMarketStructureLiquidityAdvancedInteractionContext(
  input: BuildMarketStructureLiquidityAdvancedInteractionContextInput
): MarketStructureLiquidityAdvancedInteractionContext {
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
  const unresolved: AdvancedLiquidityInteractionUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  if (invalidHorizon) {
    unresolved.push({
      code: "INVALID_HORIZON_BARS",
      message: `horizonBars must be a positive integer; received ${String(input.horizonBars)}.`,
    });
    return emptyContext(E, horizon, limitations, unresolved);
  }

  const liquidity = snapshot.liquidity;
  if (!liquidity?.liquidityPools) {
    unresolved.push({
      code: "MISSING_LIQUIDITY_FOUNDATION",
      message: "snapshot.liquidity.liquidityPools is required for MSL-7E advanced interaction.",
    });
    return emptyContext(E, horizon, limitations, unresolved);
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
    return emptyContext(E, horizon, limitations, unresolved);
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
  const events: AdvancedLiquidityInteractionEvent[] = [];
  const sweeps: LiquiditySweepEvent[] = [];
  const takens: LiquidityTakenEvent[] = [];

  for (let barIndex = start; barIndex <= end; barIndex++) {
    const candle = candles[barIndex];
    for (const { pool, side } of scannable) {
      const P = pool.price;
      const base = eventBaseFields(pool, side, barIndex, candle);

      if (isSweep(side, candle, P)) {
        const dedupeKey = `${pool.poolId}:LIQUIDITY_SWEEP:${barIndex}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          const ev: LiquiditySweepEvent = {
            ...base,
            eventId: buildSweepEventId(pool.poolId, barIndex),
            eventType: "LIQUIDITY_SWEEP",
            ruleId: MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
          };
          sweeps.push(ev);
          events.push(ev);
        }
      }

      if (isTaken(side, candle, P)) {
        const dedupeKey = `${pool.poolId}:LIQUIDITY_TAKEN:${barIndex}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          const ev: LiquidityTakenEvent = {
            ...base,
            eventId: buildTakenEventId(pool.poolId, barIndex),
            eventType: "LIQUIDITY_TAKEN",
            ruleId: MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
          };
          takens.push(ev);
          events.push(ev);
        }
      }
    }
  }

  const reclaimedSweepIds = new Set<string>();

  for (const preceding of sweeps) {
    if (reclaimedSweepIds.has(preceding.eventId)) {
      continue;
    }
    const poolEntry = scannable.find((s) => s.pool.poolId === preceding.poolId);
    if (!poolEntry) {
      continue;
    }
    const { pool, side } = poolEntry;
    const P = pool.price;
    const S = preceding.triggerBarIndex;

    for (let barIndex = S + 1; barIndex <= end; barIndex++) {
      const blocked = takens.some(
        (t) =>
          t.poolId === pool.poolId &&
          t.triggerBarIndex > S &&
          t.triggerBarIndex < barIndex
      );
      if (blocked) {
        break;
      }

      const candle = candles[barIndex];
      if (!isReclaimClose(side, candle, P)) {
        continue;
      }

      const dedupeKey = `${pool.poolId}:LIQUIDITY_RECLAIM:${barIndex}`;
      if (seen.has(dedupeKey)) {
        break;
      }
      seen.add(dedupeKey);
      reclaimedSweepIds.add(preceding.eventId);

      const base = eventBaseFields(pool, side, barIndex, candle);
      const ev: LiquidityReclaimEvent = {
        ...base,
        eventId: buildReclaimEventId(pool.poolId, barIndex),
        eventType: "LIQUIDITY_RECLAIM",
        ruleId: MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
        precedingSweepEventId: preceding.eventId,
        precedingSweepTriggerBarIndex: preceding.triggerBarIndex,
      };
      events.push(ev);
      break;
    }
  }

  events.sort(compareEvents);

  const lifecycle = deriveMarketStructureLiquidityLifecycle({
    pools: liquidity.liquidityPools,
    events,
  });

  return {
    schemaVersion: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    horizonBars: horizon,
    foundationRuleId: FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
    ruleIds: {
      research: MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
      sweep: MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
      taken: MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
      reclaim: MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
      lifecycle: MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID,
    },
    events,
    lifecycle,
    limitations,
    unresolved,
  };
}
