import type { TrendDirection } from "../types";
import {
  buildMarketStructureMtfAlignmentContext,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-mtf-alignment";
import type { BuildMarketStructureMtfAlignmentContextInput } from "./market-structure-mtf-alignment";
import {
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID,
  type MarketStructureMtfStructureAlignmentContext,
  type MtfStructureAlignmentHtfSourceTrack,
  type MtfStructureAlignmentUnresolvedReason,
  type MtfStructureStateAlignment,
} from "./market-structure-mtf-structure-alignment-types";

export {
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID,
} from "./market-structure-mtf-structure-alignment-types";

export type {
  MarketStructureMtfStructureAlignmentContext,
  MtfStructureAlignmentHtfSourceTrack,
  MtfStructureAlignmentUnresolvedReason,
  MtfStructureStateAlignment,
} from "./market-structure-mtf-structure-alignment-types";

const STANDARD_LIMITATIONS = [
  "research_only",
  "descriptive_alignment_only",
  "not_production_signal",
  "no_liquidity_alignment",
  "no_cross_tf_event_ordering",
  "no_mtf_mss",
  "no_bos_choch_alignment",
  "no_confluence_score",
  "no_prediction",
  "no_optimization",
  "derived_htf_research_track",
  "native_htf_parity_not_established",
  "single_alignment_snapshot",
  `alignment_rule_id=${MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID}`,
] as const;

export interface BuildMarketStructureMtfStructureAlignmentContextInput
  extends BuildMarketStructureMtfAlignmentContextInput {
  /** Declares HTF candle provenance for research reporting (does not alter semantics). */
  htfSourceTrack?: MtfStructureAlignmentHtfSourceTrack;
}

/**
 * Pure comparison of read-only trendContext values (MSL-3 protected context).
 */
export function resolveMtfStructureStateAlignment(
  ltfTrend: TrendDirection,
  htfTrend: TrendDirection
): Exclude<MtfStructureStateAlignment, "UNRESOLVED"> {
  if (ltfTrend === "NEUTRAL" || htfTrend === "NEUTRAL") {
    return "NEUTRAL";
  }
  if (ltfTrend === htfTrend) {
    return "ALIGNED";
  }
  return "COUNTER_ALIGNED";
}

function resolveHtfSourceTrack(
  input: BuildMarketStructureMtfStructureAlignmentContextInput
): MtfStructureAlignmentHtfSourceTrack {
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

function emptyAlignmentContext(
  input: BuildMarketStructureMtfStructureAlignmentContextInput,
  unresolved: MtfStructureAlignmentUnresolvedReason[],
  extraLimitations: string[] = []
): MarketStructureMtfStructureAlignmentContext {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  const E = input.ltfEvaluationBarIndex;
  const T_LTF =
    input.ltfCandles.length > 0 && E >= 0 && E < input.ltfCandles.length
      ? input.ltfCandles[E].time
      : NaN;
  const ltfKnownAt =
    input.ltfCandles.length > 0 && E >= 0 && E < input.ltfCandles.length
      ? knownAtTimestampFromBarIndex(input.ltfCandles, E, ltfTf)
      : null;

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
    ruleIds: {
      alignment: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex: E,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    ltfTrendContext: null,
    htfTrendContext: null,
    alignment: "UNRESOLVED",
    ltfKnownAtTimestamp: ltfKnownAt,
    htfKnownAtTimestamp: null,
    htfSourceTrack: resolveHtfSourceTrack(input),
    causalStatus: {
      htfBarClosedAtLtfEvaluation: false,
      htfKnownAtVisibleAtLtfEvaluation: false,
    },
    evidenceTag: "DESCRIPTIVE_MTF_STRUCTURE_STATE",
    unresolved,
    limitations: [...STANDARD_LIMITATIONS, ...extraLimitations],
  };
}

/**
 * MSL-9A: descriptive MTF structure state alignment (consumes MSL-7A; trendContext only).
 */
export function buildMarketStructureMtfStructureAlignmentContext(
  input: BuildMarketStructureMtfStructureAlignmentContextInput
): MarketStructureMtfStructureAlignmentContext {
  const mtf = buildMarketStructureMtfAlignmentContext(input);
  const ltfTf = mtf.ltf.timeframeId;
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  const E_LTF = mtf.ltf.evaluationBarIndex;
  const T_LTF = mtf.ltf.evaluationTimestamp;
  const unresolved: MtfStructureAlignmentUnresolvedReason[] = [];

  for (const u of mtf.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const ltfKnownAt = knownAtTimestampFromBarIndex(
    input.ltfCandles,
    E_LTF,
    ltfTf
  );
  const ltfTrend = mtf.ltf.snapshot.protected.trendContext;

  if (!mtf.htf || !mtf.alignment.causal) {
    unresolved.push({
      code: "HTF_CONTEXT_UNAVAILABLE",
      message:
        "HTF causal snapshot unavailable; MTF structure alignment remains UNRESOLVED.",
    });
    return {
      ...emptyAlignmentContext(input, unresolved),
      ltfTrendContext: ltfTrend,
      ltfKnownAtTimestamp: ltfKnownAt,
    };
  }

  const htfTrend = mtf.htf.snapshot.protected.trendContext;
  const htfKnownAt = mtf.alignment.htfBarCloseTimestamp;

  if (htfKnownAt === null) {
    unresolved.push({
      code: "CAUSAL_VISIBILITY_UNAVAILABLE",
      message: "HTF bar close timestamp missing for causal visibility check.",
    });
    return emptyAlignmentContext(input, unresolved);
  }

  if (!isKnownAtOrBefore(htfKnownAt, T_LTF)) {
    unresolved.push({
      code: "HTF_STATE_KNOWN_AFTER_LTF_EVALUATION",
      message:
        "HTF structure state knownAt is after LTF evaluation timestamp; alignment UNRESOLVED.",
    });
    return emptyAlignmentContext(input, unresolved);
  }

  const alignment = resolveMtfStructureStateAlignment(ltfTrend, htfTrend);

  const limitations: string[] = [...STANDARD_LIMITATIONS];
  if (resolveHtfSourceTrack(input) === "NATIVE_HTF") {
    limitations.push("native_htf_input_declared_not_parity_validated");
  }

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
    ruleIds: {
      alignment: MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: mtf.htf.evaluationBarIndex,
    htfEvaluationTimestamp: mtf.htf.evaluationTimestamp,
    ltfTrendContext: ltfTrend,
    htfTrendContext: htfTrend,
    alignment,
    ltfKnownAtTimestamp: ltfKnownAt,
    htfKnownAtTimestamp: htfKnownAt,
    htfSourceTrack: resolveHtfSourceTrack(input),
    causalStatus: {
      htfBarClosedAtLtfEvaluation: mtf.alignment.htfBarClosedAtLtfEvaluation,
      htfKnownAtVisibleAtLtfEvaluation: isKnownAtOrBefore(htfKnownAt, T_LTF),
    },
    evidenceTag: "DESCRIPTIVE_MTF_STRUCTURE_STATE",
    unresolved,
    limitations,
  };
}
