import type { CrossTfOrderingRelationKind } from "./market-structure-mtf-event-ordering-types";
import type { MtfOrderingEventFamily } from "./market-structure-mtf-event-ordering-types";
import type { MtfEventOrderingHtfSourceTrack } from "./market-structure-mtf-event-ordering-types";

export const MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID =
  "MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_V1" as const;

export type HtfLiquidityLtfStructureAssociationType =
  | "LIQUIDITY_TO_BOS"
  | "LIQUIDITY_TO_CHoCH"
  | "LIQUIDITY_TO_MSS";

export type HtfLiquidityLtfStructureAssociationEvidenceTag =
  "DIRECT_OBSERVATION";

export interface HtfLiquidityLtfStructureAssociation {
  associationId: string;
  associationType: HtfLiquidityLtfStructureAssociationType;
  ruleId: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
  orderingRuleId: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID;
  comparisonRuleId: string;
  sourceLiquidityEventId: string;
  targetStructureEventId: string;
  htfLiquidityEventFamily: MtfOrderingEventFamily;
  ltfStructureEventFamily: MtfOrderingEventFamily;
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfOrderingTimestamp: number;
  ltfOrderingTimestamp: number;
  htfKnowabilityTimestamp: number;
  ltfKnowabilityTimestamp: number;
  knownAtTimestamp: number;
  orderingRelation: CrossTfOrderingRelationKind;
  htfPoolId: string | null;
  crossTfRelationId: string;
  visibleAtEvaluation: boolean;
  evidenceTag: HtfLiquidityLtfStructureAssociationEvidenceTag;
}

export interface HtfLiquidityLtfStructureAssociationUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureHtfLiquidityLtfStructureAssociationContext {
  schemaVersion: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
  ruleIds: {
    association: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
    ordering: typeof MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID;
  };
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  horizonBars: number;
  htfSourceTrack: MtfEventOrderingHtfSourceTrack;
  associations: readonly HtfLiquidityLtfStructureAssociation[];
  replayAssociations: readonly HtfLiquidityLtfStructureAssociation[];
  evaluationAssociations: readonly HtfLiquidityLtfStructureAssociation[];
  unresolved: readonly HtfLiquidityLtfStructureAssociationUnresolvedReason[];
  limitations: readonly string[];
}
