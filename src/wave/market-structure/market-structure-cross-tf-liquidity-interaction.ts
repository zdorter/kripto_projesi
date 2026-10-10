import type { Candle } from "../types";
import type { LiquidityPoolCandidate } from "./market-structure-liquidity-types";
import { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
import type { LiquidityInteractionSide } from "./market-structure-liquidity-interaction-types";
import { MarketStructureInvalidEvaluationBarIndexError } from "./market-structure-types";
import {
  buildMarketStructureMtfAlignmentContext,
  getTimeframeDurationMs,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-mtf-alignment";
import {
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
  type CrossTfLiquidityInteractionEvent,
  type CrossTfLiquidityInteractionUnresolvedReason,
  type MarketStructureCrossTfLiquidityInteractionContext,
} from "./market-structure-cross-tf-liquidity-interaction-types";

export { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
export {
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "./market-structure-cross-tf-liquidity-interaction-types";

export type {
  CrossTfLiquidityInteractionEvent,
  CrossTfLiquidityInteractionUnresolvedReason,
  MarketStructureCrossTfLiquidityInteractionContext,
} from "./market-structure-cross-tf-liquidity-interaction-types";

export interface BuildMarketStructureCrossTfLiquidityInteractionContextInput {
  ltfCandles: readonly Candle[];
  htfCandles: readonly Candle[];
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  horizonBars?: number;
  swingConfig?: Parameters<typeof buildMarketStructureMtfAlignmentContext>[0]["swingConfig"];
}

const STANDARD_LIMITATIONS = [
  "cross_tf_liquidity_interaction_research_only",
  "no_sweep",
  "no_taken",
  "no_grab",
  "no_reclaim",
  "no_mss",
  "no_bos_choch_coupling",
  "protected_not_liquidity",
  "no_production_signal",
  "causal_htf_visibility",
  "derived_or_native_htf_input",
  "observation_window_e_plus_1_to_horizon",
  "no_future_pool_rebuild",
  "no_silent_timeframe_fallback",
  `cross_tf_rule_id=${MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID}`,
] as const;

const HIGH_SIDE_POOL_KINDS = new Set<LiquidityPoolCandidate["poolKind"]>([
  "SINGLE_HIGH",
  "EQH_CLUSTER",
]);

const LOW_SIDE_POOL_KINDS = new Set<LiquidityPoolCandidate["poolKind"]>([
  "SINGLE_LOW",
  "EQL_CLUSTER",
]);

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

function isPositiveFinitePrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

function buildCrossTfEventId(
  htfTimeframeId: string,
  poolId: string,
  ltfTriggerBarIndex: number
): string {
  return `ctf:${htfTimeframeId}:${poolId}:LIQUIDITY_WICK_TOUCH:${ltfTriggerBarIndex}`;
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

function emptyResult(
  input: BuildMarketStructureCrossTfLiquidityInteractionContextInput,
  horizon: number,
  unresolved: CrossTfLiquidityInteractionUnresolvedReason[],
  extraLimitations: string[] = []
): MarketStructureCrossTfLiquidityInteractionContext {
  const E = input.ltfEvaluationBarIndex;
  const T_LTF =
    input.ltfCandles.length > 0 && E >= 0 && E < input.ltfCandles.length
      ? input.ltfCandles[E].time
      : NaN;
  return {
    schemaVersion: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
    ruleIds: {
      interaction: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      touch: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
    },
    ltfEvaluationBarIndex: E,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    horizonBars: horizon,
    events: [],
    unresolved,
    limitations: [...STANDARD_LIMITATIONS, ...extraLimitations],
  };
}

/**
 * MSL-7C: cross-timeframe HTF liquidity pool → LTF wick touch (research-only).
 */
export function buildMarketStructureCrossTfLiquidityInteractionContext(
  input: BuildMarketStructureCrossTfLiquidityInteractionContextInput
): MarketStructureCrossTfLiquidityInteractionContext {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  const { horizon, invalid: invalidHorizon } = resolveHorizonBars(input.horizonBars);
  const unresolved: CrossTfLiquidityInteractionUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  const ltfCandles = input.ltfCandles;
  const E_LTF = input.ltfEvaluationBarIndex;
  const ltfCount = ltfCandles.length;

  if (
    ltfCount === 0 ||
    !Number.isInteger(E_LTF) ||
    E_LTF < 0 ||
    E_LTF >= ltfCount
  ) {
    throw new MarketStructureInvalidEvaluationBarIndexError(E_LTF, ltfCount);
  }

  const T_LTF = ltfCandles[E_LTF].time;

  if (invalidHorizon) {
    unresolved.push({
      code: "INVALID_HORIZON_BARS",
      message: `horizonBars must be a positive integer; received ${String(input.horizonBars)}.`,
    });
    return emptyResult(input, horizon, unresolved);
  }

  if (getTimeframeDurationMs(ltfTf) === null || getTimeframeDurationMs(htfTf) === null) {
    unresolved.push({
      code: "MISSING_TIMEFRAME_DATA",
      message: `Unsupported timeframe id: ${input.ltfTimeframeId} / ${input.htfTimeframeId}.`,
    });
    return emptyResult(input, horizon, unresolved);
  }

  const mtf = buildMarketStructureMtfAlignmentContext({
    ltfCandles: input.ltfCandles,
    ltfEvaluationBarIndex: E_LTF,
    ltfTimeframeId: ltfTf,
    htfCandles: input.htfCandles,
    htfTimeframeId: htfTf,
    swingConfig: input.swingConfig,
  });

  for (const u of mtf.unresolved) {
    unresolved.push(u);
  }

  if (!mtf.htf || !mtf.visibility) {
    return {
      schemaVersion: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      ruleIds: {
        interaction: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
        touch: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
      },
      ltfEvaluationBarIndex: E_LTF,
      ltfEvaluationTimestamp: T_LTF,
      htfEvaluationBarIndex: null,
      htfEvaluationTimestamp: null,
      horizonBars: horizon,
      events: [],
      unresolved,
      limitations,
    };
  }

  const E_HTF = mtf.htf.evaluationBarIndex;
  const htfPrefix = input.htfCandles.slice(0, E_HTF + 1);
  const visiblePoolIds = new Set(mtf.visibility.liquidityPoolIds);
  const pools = mtf.htf.snapshot.liquidity.liquidityPools.filter((p) =>
    visiblePoolIds.has(p.poolId)
  );

  const start = E_LTF + 1;
  const lastIndex = ltfCount - 1;
  const end = Math.min(E_LTF + horizon, lastIndex);

  if (start > lastIndex) {
    unresolved.push({
      code: "NO_FUTURE_DATA",
      message: "No bars after evaluation index; LTF observation window empty.",
    });
    limitations.push("INSUFFICIENT_FUTURE_BARS");
    return {
      schemaVersion: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      ruleIds: {
        interaction: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
        touch: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
      },
      ltfEvaluationBarIndex: E_LTF,
      ltfEvaluationTimestamp: T_LTF,
      htfEvaluationBarIndex: E_HTF,
      htfEvaluationTimestamp: mtf.htf.evaluationTimestamp,
      horizonBars: horizon,
      events: [],
      unresolved,
      limitations,
    };
  }

  const seen = new Set<string>();
  const events: CrossTfLiquidityInteractionEvent[] = [];

  for (const pool of pools) {
    const side = sideForPoolKind(pool.poolKind);
    if (!side || !isPositiveFinitePrice(pool.price)) {
      continue;
    }

    const poolKnownAt = knownAtTimestampFromBarIndex(
      htfPrefix,
      pool.knownAtBarIndex,
      htfTf
    );
    if (poolKnownAt === null || !isKnownAtOrBefore(poolKnownAt, T_LTF)) {
      continue;
    }

    for (let barIndex = start; barIndex <= end; barIndex++) {
      const candle = ltfCandles[barIndex];
      if (candle.time < poolKnownAt) {
        continue;
      }
      if (!wickTouchesPool(side, candle, pool.price)) {
        continue;
      }
      const dedupeKey = `${pool.poolId}:${barIndex}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const knownAtTs =
        knownAtTimestampFromBarIndex(ltfCandles, barIndex, ltfTf) ?? candle.time;

      events.push({
        eventId: buildCrossTfEventId(htfTf, pool.poolId, barIndex),
        eventType: "LIQUIDITY_WICK_TOUCH",
        ruleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
        sourceRuleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
        htfTimeframeId: htfTf,
        ltfTimeframeId: ltfTf,
        htfPoolId: pool.poolId,
        htfPoolKind: pool.poolKind,
        htfPoolPrice: pool.price,
        htfPoolKnownAtTimestamp: poolKnownAt,
        ltfTriggerBarIndex: barIndex,
        ltfTriggerTimestamp: candle.time,
        knownAtTimestamp: knownAtTs,
        side,
        referenceScope: pool.scope,
        evidenceTag: "DIRECT_OBSERVATION",
        priceBand: { ...pool.priceBand },
      });
    }
  }

  events.sort((a, b) => {
    if (a.ltfTriggerBarIndex !== b.ltfTriggerBarIndex) {
      return a.ltfTriggerBarIndex - b.ltfTriggerBarIndex;
    }
    return a.htfPoolId.localeCompare(b.htfPoolId);
  });

  return {
    schemaVersion: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
    ruleIds: {
      interaction: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
      touch: MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
    },
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: E_HTF,
    htfEvaluationTimestamp: mtf.htf.evaluationTimestamp,
    horizonBars: horizon,
    events,
    unresolved,
    limitations,
  };
}
