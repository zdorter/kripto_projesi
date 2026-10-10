import type { LiquidityLifecyclePhase } from "./market-structure-liquidity-lifecycle-derivation";
export const MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID =
  "MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_V1" as const;

export type LiquiditySideProfile =
  | "NONE"
  | "HIGH_SIDE_ONLY"
  | "LOW_SIDE_ONLY"
  | "BOTH_SIDES";

export type LiquidityFoundationState =
  | "NO_LIQUIDITY"
  | "LIQUIDITY_PRESENT";

export type MtfLiquiditySideAlignment =
  | "MATCHING"
  | "DIVERGENT"
  | "MIXED"
  | "NONE"
  | "UNRESOLVED";

export type MtfLiquidityLifecycleAlignment =
  | "MATCHING"
  | "DIVERGENT"
  | "MIXED"
  | "NONE"
  | "UNRESOLVED";

export type MtfLiquidityAlignmentEvidenceTag =
  "DESCRIPTIVE_MTF_LIQUIDITY_STATE";

export type MtfLiquidityAlignmentHtfSourceTrack =
  | "DERIVED_1H_4H"
  | "NATIVE_HTF"
  | "UNSPECIFIED";

export interface MtfLiquidityLegFoundation {
  foundationState: LiquidityFoundationState;
  sideProfile: LiquiditySideProfile;
  visiblePoolCount: number;
  highSidePoolCount: number;
  lowSidePoolCount: number;
  dominantLifecyclePhase: LiquidityLifecyclePhase | "MIXED_LIFECYCLE";
  lifecyclePhasesPresent: readonly LiquidityLifecyclePhase[];
}

export interface MtfLiquidityAlignmentUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureMtfLiquidityAlignmentContext {
  schemaVersion: typeof MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID;
  ruleIds: {
    alignment: typeof MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID;
    comparison: typeof MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID;
  };
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  ltfFoundation: MtfLiquidityLegFoundation;
  htfFoundation: MtfLiquidityLegFoundation | null;
  sideAlignment: MtfLiquiditySideAlignment;
  lifecycleAlignment: MtfLiquidityLifecycleAlignment;
  htfSourceTrack: MtfLiquidityAlignmentHtfSourceTrack;
  causalStatus: {
    htfBarClosedAtLtfEvaluation: boolean;
    htfLiquidityVisibilityApplied: boolean;
  };
  evidenceTag: MtfLiquidityAlignmentEvidenceTag;
  unresolved: readonly MtfLiquidityAlignmentUnresolvedReason[];
  limitations: readonly string[];
}
