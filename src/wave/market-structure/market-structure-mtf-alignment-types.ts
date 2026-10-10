import type { MarketStructureSnapshot } from "./market-structure-types";

export const MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID =
  "MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_V1" as const;

export const MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID =
  "MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_V1" as const;

export interface MtfAlignmentUnresolvedReason {
  code: string;
  message: string;
}

export interface HtfEvaluationBarResolutionSuccess {
  ok: true;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  closeTimestamp: number;
  closed: true;
  causal: true;
}

export interface HtfEvaluationBarResolutionFailure {
  ok: false;
  code: "MISSING_TIMEFRAME_DATA" | "INSUFFICIENT_HTF_CONTEXT";
  message: string;
}

export type HtfEvaluationBarResolution =
  | HtfEvaluationBarResolutionSuccess
  | HtfEvaluationBarResolutionFailure;

export interface MarketStructureMtfTimeframeLeg {
  timeframeId: string;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  snapshot: MarketStructureSnapshot;
}

export interface MarketStructureMtfHtfLeg extends MarketStructureMtfTimeframeLeg {
  htfBarCloseTimestamp: number;
}

export interface MarketStructureMtfAlignmentMetadata {
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  htfBarCloseTimestamp: number | null;
  htfBarClosedAtLtfEvaluation: boolean;
  causal: boolean;
}

export interface MarketStructureMtfHtfVisibilityView {
  ruleId: typeof MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID;
  ltfEvaluationTimestamp: number;
  confirmedSwingIndices: readonly number[];
  structurePairIndices: readonly number[];
  zigzagSpinePivotIndices: readonly number[];
  internalStructurePivotIndices: readonly number[];
  protectedHighPivotIndices: readonly number[];
  protectedLowPivotIndices: readonly number[];
  breakClassifiedEventIds: readonly string[];
  breakObservationIds: readonly string[];
  bslCandidateIds: readonly string[];
  sslCandidateIds: readonly string[];
  equalHighObservationIds: readonly string[];
  equalLowObservationIds: readonly string[];
  liquidityPoolIds: readonly string[];
}

export interface MarketStructureMtfAlignmentContext {
  schemaVersion: typeof MARKET_STRUCTURE_MTF_ALIGNMENT_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID;
  ruleIds: {
    htfSelection: typeof MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID;
    visibility: typeof MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID;
  };
  ltf: MarketStructureMtfTimeframeLeg;
  htf: MarketStructureMtfHtfLeg | null;
  alignment: MarketStructureMtfAlignmentMetadata;
  visibility: MarketStructureMtfHtfVisibilityView | null;
  unresolved: readonly MtfAlignmentUnresolvedReason[];
  limitations: readonly string[];
}
