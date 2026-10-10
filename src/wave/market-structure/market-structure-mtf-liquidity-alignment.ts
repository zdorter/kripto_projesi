import type { Candle } from "../types";
import {
  buildMarketStructureMtfAlignmentContext,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-mtf-alignment";
import type { BuildMarketStructureMtfAlignmentContextInput } from "./market-structure-mtf-alignment";
import {
  deriveMarketStructureLiquidityLifecycle,
  type LiquidityLifecyclePhase,
  type LiquidityPoolLifecycleProjection,
} from "./market-structure-liquidity-lifecycle-derivation";
import type {
  LiquidityPoolCandidate,
  LiquidityPoolKind,
} from "./market-structure-liquidity-types";
import {
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID,
  type LiquidityFoundationState,
  type LiquiditySideProfile,
  type MarketStructureMtfLiquidityAlignmentContext,
  type MtfLiquidityAlignmentHtfSourceTrack,
  type MtfLiquidityAlignmentUnresolvedReason,
  type MtfLiquidityLegFoundation,
  type MtfLiquidityLifecycleAlignment,
  type MtfLiquiditySideAlignment,
} from "./market-structure-mtf-liquidity-alignment-types";

export {
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID,
} from "./market-structure-mtf-liquidity-alignment-types";

export type {
  LiquidityFoundationState,
  LiquiditySideProfile,
  MarketStructureMtfLiquidityAlignmentContext,
  MtfLiquidityAlignmentHtfSourceTrack,
  MtfLiquidityAlignmentUnresolvedReason,
  MtfLiquidityLegFoundation,
  MtfLiquidityLifecycleAlignment,
  MtfLiquiditySideAlignment,
} from "./market-structure-mtf-liquidity-alignment-types";

const HIGH_SIDE_KINDS = new Set<LiquidityPoolKind>([
  "SINGLE_HIGH",
  "EQH_CLUSTER",
]);

const LOW_SIDE_KINDS = new Set<LiquidityPoolKind>([
  "SINGLE_LOW",
  "EQL_CLUSTER",
]);

const STANDARD_LIMITATIONS = [
  "research_only",
  "descriptive_liquidity_alignment_only",
  "not_production_signal",
  "no_structure_alignment",
  "no_bos_choch_mss",
  "no_liquidity_structure_causality",
  "no_cross_tf_event_ordering",
  "no_confluence_score",
  "no_prediction",
  "no_optimization",
  "foundation_at_E_only",
  "no_msl6_rebuild",
  "no_msl7c_rebuild",
  "no_msl7e_rebuild",
  "derived_htf_research_track",
  "native_htf_parity_not_established",
  `liquidity_alignment_rule_id=${MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID}`,
] as const;

export interface BuildMarketStructureMtfLiquidityAlignmentContextInput
  extends BuildMarketStructureMtfAlignmentContextInput {
  htfSourceTrack?: MtfLiquidityAlignmentHtfSourceTrack;
}

export function isHighSidePoolKind(kind: LiquidityPoolKind): boolean {
  return HIGH_SIDE_KINDS.has(kind);
}

export function isLowSidePoolKind(kind: LiquidityPoolKind): boolean {
  return LOW_SIDE_KINDS.has(kind);
}

export function resolveLiquiditySideProfile(
  pools: readonly LiquidityPoolCandidate[]
): LiquiditySideProfile {
  let hasHigh = false;
  let hasLow = false;
  for (const pool of pools) {
    if (isHighSidePoolKind(pool.poolKind)) {
      hasHigh = true;
    }
    if (isLowSidePoolKind(pool.poolKind)) {
      hasLow = true;
    }
  }
  if (!hasHigh && !hasLow) {
    return "NONE";
  }
  if (hasHigh && hasLow) {
    return "BOTH_SIDES";
  }
  if (hasHigh) {
    return "HIGH_SIDE_ONLY";
  }
  return "LOW_SIDE_ONLY";
}

function countSides(pools: readonly LiquidityPoolCandidate[]): {
  high: number;
  low: number;
} {
  let high = 0;
  let low = 0;
  for (const pool of pools) {
    if (isHighSidePoolKind(pool.poolKind)) {
      high++;
    }
    if (isLowSidePoolKind(pool.poolKind)) {
      low++;
    }
  }
  return { high, low };
}

function dominantLifecycle(
  projections: readonly LiquidityPoolLifecycleProjection[]
): LiquidityLifecyclePhase | "MIXED_LIFECYCLE" {
  if (projections.length === 0) {
    return "UNTOUCHED";
  }
  const phases = new Set(projections.map((p) => p.phase));
  if (phases.size === 1) {
    return projections[0]!.phase;
  }
  return "MIXED_LIFECYCLE";
}

function lifecyclePhasesPresent(
  projections: readonly LiquidityPoolLifecycleProjection[]
): LiquidityLifecyclePhase[] {
  const phases = new Set(projections.map((p) => p.phase));
  return [...phases].sort();
}

export function buildLiquidityLegFoundation(
  pools: readonly LiquidityPoolCandidate[]
): MtfLiquidityLegFoundation {
  const sideProfile = resolveLiquiditySideProfile(pools);
  const { high, low } = countSides(pools);
  const lifecycle = deriveMarketStructureLiquidityLifecycle({
    pools,
    events: [],
  });
  const foundationState: LiquidityFoundationState =
    pools.length === 0 ? "NO_LIQUIDITY" : "LIQUIDITY_PRESENT";
  const dominant = dominantLifecycle(lifecycle);
  return {
    foundationState,
    sideProfile,
    visiblePoolCount: pools.length,
    highSidePoolCount: high,
    lowSidePoolCount: low,
    dominantLifecyclePhase: dominant,
    lifecyclePhasesPresent: lifecyclePhasesPresent(lifecycle),
  };
}

/**
 * Side-profile alignment (descriptive; not BSL/SSL = bullish/bearish).
 */
export function resolveMtfLiquiditySideAlignment(
  htf: LiquiditySideProfile,
  ltf: LiquiditySideProfile
): Exclude<MtfLiquiditySideAlignment, "UNRESOLVED"> {
  if (htf === "NONE" && ltf === "NONE") {
    return "NONE";
  }
  if (htf === ltf) {
    return "MATCHING";
  }
  if (
    (htf === "HIGH_SIDE_ONLY" && ltf === "LOW_SIDE_ONLY") ||
    (htf === "LOW_SIDE_ONLY" && ltf === "HIGH_SIDE_ONLY")
  ) {
    return "DIVERGENT";
  }
  if (htf === "BOTH_SIDES" || ltf === "BOTH_SIDES") {
    return "MIXED";
  }
  if (htf === "NONE" || ltf === "NONE") {
    return "DIVERGENT";
  }
  return "MIXED";
}

export function resolveMtfLiquidityLifecycleAlignment(
  htf: MtfLiquidityLegFoundation | null,
  ltf: MtfLiquidityLegFoundation
): Exclude<MtfLiquidityLifecycleAlignment, "UNRESOLVED"> {
  if (!htf) {
    return "NONE";
  }
  if (
    htf.foundationState === "NO_LIQUIDITY" &&
    ltf.foundationState === "NO_LIQUIDITY"
  ) {
    return "NONE";
  }
  const hPhase = htf.dominantLifecyclePhase;
  const lPhase = ltf.dominantLifecyclePhase;
  if (hPhase === "MIXED_LIFECYCLE" || lPhase === "MIXED_LIFECYCLE") {
    return "MIXED";
  }
  if (hPhase === lPhase) {
    return "MATCHING";
  }
  return "DIVERGENT";
}

function resolveHtfSourceTrack(
  input: BuildMarketStructureMtfLiquidityAlignmentContextInput
): MtfLiquidityAlignmentHtfSourceTrack {
  if (input.htfSourceTrack) {
    return input.htfSourceTrack;
  }
  const ltf = normalizeTimeframeId(input.ltfTimeframeId);
  const htf = normalizeTimeframeId(input.htfTimeframeId);
  if (ltf === "1H" && htf === "4H") {
    return "DERIVED_1H_4H";
  }
  return "UNSPECIFIED";
}

function filterLtfPoolsAtEvaluation(
  pools: readonly LiquidityPoolCandidate[],
  candles: readonly Candle[],
  evaluationBarIndex: number,
  timeframeId: string,
  evaluationTimestamp: number
): LiquidityPoolCandidate[] {
  const tf = normalizeTimeframeId(timeframeId);
  return pools.filter((pool) => {
    if (pool.knownAtBarIndex > evaluationBarIndex) {
      return false;
    }
    const knownTs = knownAtTimestampFromBarIndex(
      candles,
      pool.knownAtBarIndex,
      tf
    );
    if (knownTs === null) {
      return false;
    }
    return isKnownAtOrBefore(knownTs, evaluationTimestamp);
  });
}

function filterHtfVisiblePools(
  pools: readonly LiquidityPoolCandidate[],
  visiblePoolIds: ReadonlySet<string>
): LiquidityPoolCandidate[] {
  return pools.filter((p) => visiblePoolIds.has(p.poolId));
}

function emptyContext(
  input: BuildMarketStructureMtfLiquidityAlignmentContextInput,
  unresolved: MtfLiquidityAlignmentUnresolvedReason[],
  ltfFoundation: MtfLiquidityLegFoundation,
  T_LTF: number,
  E_LTF: number
): MarketStructureMtfLiquidityAlignmentContext {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  return {
    schemaVersion: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
    ruleIds: {
      alignment: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    ltfFoundation,
    htfFoundation: null,
    sideAlignment: "UNRESOLVED",
    lifecycleAlignment: "UNRESOLVED",
    htfSourceTrack: resolveHtfSourceTrack(input),
    causalStatus: {
      htfBarClosedAtLtfEvaluation: false,
      htfLiquidityVisibilityApplied: false,
    },
    evidenceTag: "DESCRIPTIVE_MTF_LIQUIDITY_STATE",
    unresolved,
    limitations: [...STANDARD_LIMITATIONS],
  };
}

/**
 * MSL-9B: descriptive MTF liquidity state alignment (MSL-7A snapshots + pool foundation @ E).
 */
export function buildMarketStructureMtfLiquidityAlignmentContext(
  input: BuildMarketStructureMtfLiquidityAlignmentContextInput
): MarketStructureMtfLiquidityAlignmentContext {
  const mtf = buildMarketStructureMtfAlignmentContext(input);
  const E_LTF = mtf.ltf.evaluationBarIndex;
  const T_LTF = mtf.ltf.evaluationTimestamp;
  const unresolved: MtfLiquidityAlignmentUnresolvedReason[] = [];

  for (const u of mtf.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const ltfPools = filterLtfPoolsAtEvaluation(
    mtf.ltf.snapshot.liquidity.liquidityPools,
    input.ltfCandles,
    E_LTF,
    mtf.ltf.timeframeId,
    T_LTF
  );
  const ltfFoundation = buildLiquidityLegFoundation(ltfPools);

  if (!mtf.htf || !mtf.visibility || !mtf.alignment.causal) {
    unresolved.push({
      code: "HTF_LIQUIDITY_CONTEXT_UNAVAILABLE",
      message:
        "HTF causal liquidity context unavailable; MTF liquidity alignment UNRESOLVED.",
    });
    return emptyContext(input, unresolved, ltfFoundation, T_LTF, E_LTF);
  }

  const htfKnownAt = mtf.alignment.htfBarCloseTimestamp;
  if (htfKnownAt === null || !isKnownAtOrBefore(htfKnownAt, T_LTF)) {
    unresolved.push({
      code: "HTF_LIQUIDITY_NOT_VISIBLE_AT_LTF_EVALUATION",
      message:
        "HTF liquidity visibility fails at LTF evaluation timestamp.",
    });
    return emptyContext(input, unresolved, ltfFoundation, T_LTF, E_LTF);
  }

  const visibleIds = new Set(mtf.visibility.liquidityPoolIds);
  const htfPools = filterHtfVisiblePools(
    mtf.htf.snapshot.liquidity.liquidityPools,
    visibleIds
  );
  const htfFoundation = buildLiquidityLegFoundation(htfPools);

  const sideAlignment = resolveMtfLiquiditySideAlignment(
    htfFoundation.sideProfile,
    ltfFoundation.sideProfile
  );
  const lifecycleAlignment = resolveMtfLiquidityLifecycleAlignment(
    htfFoundation,
    ltfFoundation
  );

  const limitations: string[] = [...STANDARD_LIMITATIONS];
  if (resolveHtfSourceTrack(input) === "NATIVE_HTF") {
    limitations.push("native_htf_input_declared_not_parity_validated");
  }

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
    ruleIds: {
      alignment: MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: mtf.ltf.timeframeId,
    htfTimeframeId: mtf.htf.timeframeId,
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: mtf.htf.evaluationBarIndex,
    htfEvaluationTimestamp: mtf.htf.evaluationTimestamp,
    ltfFoundation,
    htfFoundation,
    sideAlignment,
    lifecycleAlignment,
    htfSourceTrack: resolveHtfSourceTrack(input),
    causalStatus: {
      htfBarClosedAtLtfEvaluation: mtf.alignment.htfBarClosedAtLtfEvaluation,
      htfLiquidityVisibilityApplied: true,
    },
    evidenceTag: "DESCRIPTIVE_MTF_LIQUIDITY_STATE",
    unresolved,
    limitations,
  };
}
