export const MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID =
  "MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_V1" as const;

export type MtfOrderingEventFamily =
  | "BOS"
  | "CHoCH"
  | "MSS"
  | "LIQUIDITY_WICK_TOUCH"
  | "CROSS_TF_LIQUIDITY_WICK_TOUCH"
  | "LIQUIDITY_SWEEP"
  | "LIQUIDITY_TAKEN"
  | "LIQUIDITY_RECLAIM";

export type MtfOrderingEventSourceContext =
  | "MSL-4"
  | "MSL-6"
  | "MSL-7C"
  | "MSL-7E"
  | "MSL-8";

export type CrossTfOrderingRelationKind =
  | "BEFORE"
  | "AFTER"
  | "SAME_TIME"
  | "UNRESOLVED"
  | "NOT_COMPARABLE";

export type MtfEventOrderingHtfSourceTrack =
  | "DERIVED_1H_4H"
  | "NATIVE_HTF"
  | "UNSPECIFIED";

export interface NormalizedMtfOrderingEvent {
  eventId: string;
  eventFamily: MtfOrderingEventFamily;
  timeframeId: string;
  orderingTimestamp: number;
  knowabilityTimestamp: number;
  triggerBarIndex: number;
  sourceContext: MtfOrderingEventSourceContext;
  leg: "HTF" | "LTF";
  inReplayWindow: boolean;
  visibleAtEvaluation: boolean;
}

export interface CrossTfEventOrderingRelation {
  relationId: string;
  ruleId: typeof MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID;
  comparisonRuleId: typeof MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID;
  htfEventId: string;
  ltfEventId: string;
  htfEventFamily: MtfOrderingEventFamily;
  ltfEventFamily: MtfOrderingEventFamily;
  ordering: CrossTfOrderingRelationKind;
  htfOrderingTimestamp: number | null;
  ltfOrderingTimestamp: number | null;
  visibleAtEvaluation: boolean;
  evidenceTag: "DESCRIPTIVE_TEMPORAL_ORDER";
}

export interface MtfEventOrderingUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureMtfEventOrderingContext {
  schemaVersion: typeof MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID;
  ruleIds: {
    ordering: typeof MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID;
    comparison: typeof MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID;
  };
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  horizonBars: number;
  htfSourceTrack: MtfEventOrderingHtfSourceTrack;
  htfEvents: readonly NormalizedMtfOrderingEvent[];
  ltfEvents: readonly NormalizedMtfOrderingEvent[];
  relations: readonly CrossTfEventOrderingRelation[];
  evaluationRelations: readonly CrossTfEventOrderingRelation[];
  unresolved: readonly MtfEventOrderingUnresolvedReason[];
  limitations: readonly string[];
}
