import type { Candle } from "../types";
import { MarketStructureInvalidEvaluationBarIndexError } from "./market-structure-types";
import { buildMarketStructureSnapshotAtBar } from "./market-structure-snapshot";
import {
  barCloseTimestamp,
  getTimeframeDurationMs,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-bar-timestamp";
import {
  MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
  MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID,
  MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID,
  type HtfEvaluationBarResolution,
  type MarketStructureMtfAlignmentContext,
  type MarketStructureMtfHtfVisibilityView,
  type MtfAlignmentUnresolvedReason,
} from "./market-structure-mtf-alignment-types";
import type { MarketStructureSnapshot } from "./market-structure-types";

export {
  MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
  MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID,
  MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID,
} from "./market-structure-mtf-alignment-types";

export type {
  HtfEvaluationBarResolution,
  MarketStructureMtfAlignmentContext,
  MarketStructureMtfHtfVisibilityView,
  MtfAlignmentUnresolvedReason,
} from "./market-structure-mtf-alignment-types";

export {
  barCloseTimestamp,
  barOpenTimestamp,
  getTimeframeDurationMs,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-bar-timestamp";

export interface ResolveHtfEvaluationBarIndexInput {
  candles: readonly Candle[];
  timeframeId: string;
  ltfEvaluationTimestamp: number;
}

export interface BuildMarketStructureMtfAlignmentContextInput {
  ltfCandles: readonly Candle[];
  ltfEvaluationBarIndex: number;
  ltfTimeframeId: string;
  htfCandles: readonly Candle[];
  htfTimeframeId: string;
  swingConfig?: Parameters<typeof buildMarketStructureSnapshotAtBar>[0]["swingConfig"];
}

const STANDARD_LIMITATIONS = [
  "mtf_causal_alignment_only",
  "htf_closed_bar_prefix_only",
  "cross_tf_timestamp_visibility",
  "not_production_signal",
  "not_wave_multi_timeframe_module",
  "no_cross_tf_liquidity_interaction",
  "no_aggregation_in_msl7a",
  `mtf_alignment_rule_id=${MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID}`,
] as const;

export function resolveHtfEvaluationBarIndex(
  input: ResolveHtfEvaluationBarIndexInput
): HtfEvaluationBarResolution {
  const timeframeId = normalizeTimeframeId(input.timeframeId);
  const durationMs = getTimeframeDurationMs(timeframeId);
  const candles = input.candles;

  if (!candles || candles.length === 0) {
    return {
      ok: false,
      code: "MISSING_TIMEFRAME_DATA",
      message: "HTF candle series is empty.",
    };
  }

  if (durationMs === null) {
    return {
      ok: false,
      code: "MISSING_TIMEFRAME_DATA",
      message: `Unsupported HTF timeframeId for duration: ${input.timeframeId}.`,
    };
  }

  if (!Number.isFinite(input.ltfEvaluationTimestamp)) {
    return {
      ok: false,
      code: "MISSING_TIMEFRAME_DATA",
      message: "ltfEvaluationTimestamp must be finite.",
    };
  }

  const T_LTF = input.ltfEvaluationTimestamp;
  let selected: number | null = null;
  let selectedClose: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const closeTs = barCloseTimestamp(candles[i], timeframeId);
    if (closeTs === null) {
      continue;
    }
    if (closeTs <= T_LTF) {
      selected = i;
      selectedClose = closeTs;
    }
  }

  if (selected === null || selectedClose === null) {
    return {
      ok: false,
      code: "INSUFFICIENT_HTF_CONTEXT",
      message:
        "No HTF bar with barCloseTimestamp <= ltfEvaluationTimestamp.",
    };
  }

  return {
    ok: true,
    evaluationBarIndex: selected,
    evaluationTimestamp: candles[selected].time,
    closeTimestamp: selectedClose,
    closed: true,
    causal: true,
  };
}

export function buildHtfVisibilityView(input: {
  snapshot: MarketStructureSnapshot;
  htfCandles: readonly Candle[];
  htfTimeframeId: string;
  ltfEvaluationTimestamp: number;
}): MarketStructureMtfHtfVisibilityView {
  const { snapshot, htfCandles, htfTimeframeId, ltfEvaluationTimestamp } =
    input;
  const tf = normalizeTimeframeId(htfTimeframeId);
  const lag = snapshot.confirmationLagBars;

  const visibleAt = (barIndex: number): boolean => {
    const ts = knownAtTimestampFromBarIndex(htfCandles, barIndex, tf);
    return ts !== null && isKnownAtOrBefore(ts, ltfEvaluationTimestamp);
  };

  const confirmedSwingIndices = snapshot.confirmedSwings
    .filter((s) => visibleAt(s.index + lag))
    .map((s) => s.index);

  const structurePairIndices = snapshot.structurePairs
    .filter((p) => visibleAt(p.knownAtBarIndex))
    .map((p) => p.fromIndex);

  const zigzagSpinePivotIndices = snapshot.zigzag.zigzagSpine
    .filter((a) => visibleAt(a.knownAtBarIndex))
    .map((a) => a.pivotIndex);

  const internalStructurePivotIndices = snapshot.zigzag.internalStructure
    .filter((a) => visibleAt(a.knownAtBarIndex))
    .map((a) => a.pivotIndex);

  const protectedHighPivotIndices = snapshot.protected.protectedHighs
    .filter((c) => visibleAt(c.protectedStatusKnownAtBarIndex))
    .map((c) => c.pivotIndex);

  const protectedLowPivotIndices = snapshot.protected.protectedLows
    .filter((c) => visibleAt(c.protectedStatusKnownAtBarIndex))
    .map((c) => c.pivotIndex);

  const breakClassifiedEventIds = snapshot.break.classifiedEvents
    .filter((e) => visibleAt(e.knownAtBarIndex))
    .map((e) => e.eventId);

  const breakObservationIds = snapshot.break.breakObservations
    .filter((o) => visibleAt(o.knownAtBarIndex))
    .map((o) => o.observationId);

  const bslCandidateIds = snapshot.liquidity.bslCandidates
    .filter((c) => visibleAt(c.knownAtBarIndex))
    .map((c) => c.candidateId);

  const sslCandidateIds = snapshot.liquidity.sslCandidates
    .filter((c) => visibleAt(c.knownAtBarIndex))
    .map((c) => c.candidateId);

  const equalHighObservationIds = snapshot.liquidity.equalHighObservations
    .filter((o) => visibleAt(o.knownAtBarIndex))
    .map((o) => o.observationId);

  const equalLowObservationIds = snapshot.liquidity.equalLowObservations
    .filter((o) => visibleAt(o.knownAtBarIndex))
    .map((o) => o.observationId);

  const liquidityPoolIds = snapshot.liquidity.liquidityPools
    .filter((p) => visibleAt(p.knownAtBarIndex))
    .map((p) => p.poolId);

  return {
    ruleId: MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
    ltfEvaluationTimestamp,
    confirmedSwingIndices,
    structurePairIndices,
    zigzagSpinePivotIndices,
    internalStructurePivotIndices,
    protectedHighPivotIndices,
    protectedLowPivotIndices,
    breakClassifiedEventIds,
    breakObservationIds,
    bslCandidateIds,
    sslCandidateIds,
    equalHighObservationIds,
    equalLowObservationIds,
    liquidityPoolIds,
  };
}

export function buildMarketStructureMtfAlignmentContext(
  input: BuildMarketStructureMtfAlignmentContextInput
): MarketStructureMtfAlignmentContext {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  const unresolved: MtfAlignmentUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  const ltfCount = input.ltfCandles.length;
  const E_LTF = input.ltfEvaluationBarIndex;

  if (
    ltfCount === 0 ||
    !Number.isInteger(E_LTF) ||
    E_LTF < 0 ||
    E_LTF >= ltfCount
  ) {
    throw new MarketStructureInvalidEvaluationBarIndexError(E_LTF, ltfCount);
  }

  if (getTimeframeDurationMs(ltfTf) === null) {
    unresolved.push({
      code: "MISSING_TIMEFRAME_DATA",
      message: `Unsupported LTF timeframeId: ${input.ltfTimeframeId}.`,
    });
  }

  const T_LTF = input.ltfCandles[E_LTF].time;

  const ltfSnapshot = buildMarketStructureSnapshotAtBar({
    candles: input.ltfCandles,
    evaluationBarIndex: E_LTF,
    swingConfig: input.swingConfig,
  });

  const htfResolution = resolveHtfEvaluationBarIndex({
    candles: input.htfCandles,
    timeframeId: htfTf,
    ltfEvaluationTimestamp: T_LTF,
  });

  if (!htfResolution.ok) {
    unresolved.push({
      code: htfResolution.code,
      message: htfResolution.message,
    });
    return {
      schemaVersion: MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID,
      ruleIds: {
        htfSelection: MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID,
        visibility: MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
      },
      ltf: {
        timeframeId: ltfTf,
        evaluationBarIndex: E_LTF,
        evaluationTimestamp: T_LTF,
        snapshot: ltfSnapshot,
      },
      htf: null,
      alignment: {
        ltfEvaluationTimestamp: T_LTF,
        htfEvaluationBarIndex: null,
        htfEvaluationTimestamp: null,
        htfBarCloseTimestamp: null,
        htfBarClosedAtLtfEvaluation: false,
        causal: false,
      },
      visibility: null,
      unresolved,
      limitations,
    };
  }

  const E_HTF = htfResolution.evaluationBarIndex;
  const htfPrefix = input.htfCandles.slice(0, E_HTF + 1);
  const htfSnapshot = buildMarketStructureSnapshotAtBar({
    candles: htfPrefix,
    evaluationBarIndex: E_HTF,
    swingConfig: input.swingConfig,
  });

  const visibility = buildHtfVisibilityView({
    snapshot: htfSnapshot,
    htfCandles: htfPrefix,
    htfTimeframeId: htfTf,
    ltfEvaluationTimestamp: T_LTF,
  });

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID,
    ruleIds: {
      htfSelection: MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID,
      visibility: MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
    },
    ltf: {
      timeframeId: ltfTf,
      evaluationBarIndex: E_LTF,
      evaluationTimestamp: T_LTF,
      snapshot: ltfSnapshot,
    },
    htf: {
      timeframeId: htfTf,
      evaluationBarIndex: E_HTF,
      evaluationTimestamp: htfSnapshot.evaluationTimestamp,
      htfBarCloseTimestamp: htfResolution.closeTimestamp,
      snapshot: htfSnapshot,
    },
    alignment: {
      ltfEvaluationTimestamp: T_LTF,
      htfEvaluationBarIndex: E_HTF,
      htfEvaluationTimestamp: htfSnapshot.evaluationTimestamp,
      htfBarCloseTimestamp: htfResolution.closeTimestamp,
      htfBarClosedAtLtfEvaluation: htfResolution.closeTimestamp <= T_LTF,
      causal: true,
    },
    visibility,
    unresolved,
    limitations,
  };
}
