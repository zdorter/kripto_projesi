import type { TrendDirection } from "../types";

export const MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID =
  "MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_V1" as const;

export type MtfStructureStateAlignment =
  | "ALIGNED"
  | "COUNTER_ALIGNED"
  | "NEUTRAL"
  | "UNRESOLVED";

export type MtfStructureAlignmentEvidenceTag = "DESCRIPTIVE_MTF_STRUCTURE_STATE";

export type MtfStructureAlignmentHtfSourceTrack =
  | "DERIVED_1H_4H"
  | "NATIVE_HTF"
  | "UNSPECIFIED";

export interface MtfStructureAlignmentUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureMtfStructureAlignmentContext {
  schemaVersion: typeof MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID;
  ruleIds: {
    alignment: typeof MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID;
    comparison: typeof MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID;
  };
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  ltfTrendContext: TrendDirection | null;
  htfTrendContext: TrendDirection | null;
  alignment: MtfStructureStateAlignment;
  ltfKnownAtTimestamp: number | null;
  htfKnownAtTimestamp: number | null;
  htfSourceTrack: MtfStructureAlignmentHtfSourceTrack;
  causalStatus: {
    htfBarClosedAtLtfEvaluation: boolean;
    htfKnownAtVisibleAtLtfEvaluation: boolean;
  };
  evidenceTag: MtfStructureAlignmentEvidenceTag;
  unresolved: readonly MtfStructureAlignmentUnresolvedReason[];
  limitations: readonly string[];
}
