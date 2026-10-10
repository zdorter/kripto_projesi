import type { CrossTfOrderingRelationKind } from "./market-structure-mtf-event-ordering-types";
import type { MtfOrderingEventFamily } from "./market-structure-mtf-event-ordering-types";
import type { MtfEventOrderingHtfSourceTrack } from "./market-structure-mtf-event-ordering-types";

export const MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID =
  "MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_V1" as const;

export type MtfMssAssociationType =
  | "STRUCTURE_TO_MSS"
  | "MSS_TO_STRUCTURE"
  | "MSS_TO_MSS";

export type MtfMssAssociationEvidence = "DIRECT_OBSERVATION";

export interface MarketStructureMtfMssAssociation {
  associationId: string;
  associationType: MtfMssAssociationType;
  ruleId: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID;
  orderingRuleId: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID;
  comparisonRuleId: string;
  htfEventId: string;
  ltfEventId: string;
  htfEventFamily: MtfOrderingEventFamily;
  ltfEventFamily: MtfOrderingEventFamily;
  orderingRelation: CrossTfOrderingRelationKind;
  htfTriggerTimestamp: number;
  ltfTriggerTimestamp: number;
  htfKnowabilityTimestamp: number;
  ltfKnowabilityTimestamp: number;
  knownAtTimestamp: number;
  crossTfRelationId: string;
  visibleAtEvaluation: boolean;
  evidence: MtfMssAssociationEvidence;
  descriptiveOnly: true;
}

export interface MtfMssAssociationUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureMtfMssAssociationContext {
  schemaVersion: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID;
  ruleIds: {
    association: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID;
    ordering: typeof MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID;
  };
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  horizonBars: number;
  htfSourceTrack: MtfEventOrderingHtfSourceTrack;
  associations: readonly MarketStructureMtfMssAssociation[];
  evaluationAssociations: readonly MarketStructureMtfMssAssociation[];
  unresolved: readonly MtfMssAssociationUnresolvedReason[];
  limitations: readonly string[];
}
