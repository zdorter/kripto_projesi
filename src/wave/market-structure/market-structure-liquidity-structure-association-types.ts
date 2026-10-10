import type { ClassifiedStructureEventType } from "./market-structure-break-types";

export const MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_V1" as const;

export type LiquidityStructureAssociationType =
  | "LIQUIDITY_TO_BOS"
  | "LIQUIDITY_TO_CHOCH";

export type LiquidityStructureAssociationEvidenceTag = "DIRECT_OBSERVATION";

export interface LiquidityStructureAssociation {
  associationId: string;
  associationType: LiquidityStructureAssociationType;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
  orderingRuleId: typeof MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID;
  sourceLiquidityEventId: string;
  targetStructureEventId: string;
  structureEventType: ClassifiedStructureEventType;
  timeframeId: string;
  liquidityTriggerBarIndex: number;
  structureTriggerBarIndex: number;
  barsBetween: number;
  liquidityTriggerTimestamp: number;
  structureTriggerTimestamp: number;
  knownAtTimestamp: number;
  evidenceTag: LiquidityStructureAssociationEvidenceTag;
}

export interface LiquidityStructureAssociationUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureLiquidityStructureAssociationContext {
  schemaVersion: typeof MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
  ruleIds: {
    association: typeof MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID;
    ordering: typeof MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID;
  };
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  horizonBars: number;
  structureEvaluationBarIndex: number;
  structureEvaluationTimestamp: number;
  associations: readonly LiquidityStructureAssociation[];
  unresolved: readonly LiquidityStructureAssociationUnresolvedReason[];
  limitations: readonly string[];
}
