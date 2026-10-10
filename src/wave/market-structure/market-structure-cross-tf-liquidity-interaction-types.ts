import type { LiquidityPoolKind, LiquidityPriceBand } from "./market-structure-liquidity-types";
import type { MarketStructureScope } from "./market-structure-types";
import type { LiquidityInteractionSide } from "./market-structure-liquidity-interaction-types";

export const MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID =
  "MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_V1" as const;

export type CrossTfLiquidityInteractionEvidenceTag = "DIRECT_OBSERVATION";

export type CrossTfLiquidityInteractionEventType = "LIQUIDITY_WICK_TOUCH";

export interface CrossTfLiquidityInteractionEvent {
  eventId: string;
  eventType: CrossTfLiquidityInteractionEventType;
  ruleId: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID;
  sourceRuleId: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID;
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfPoolId: string;
  htfPoolKind: LiquidityPoolKind;
  htfPoolPrice: number;
  htfPoolKnownAtTimestamp: number;
  ltfTriggerBarIndex: number;
  ltfTriggerTimestamp: number;
  knownAtTimestamp: number;
  side: LiquidityInteractionSide;
  referenceScope: MarketStructureScope;
  evidenceTag: CrossTfLiquidityInteractionEvidenceTag;
  priceBand?: LiquidityPriceBand;
}

export interface CrossTfLiquidityInteractionUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureCrossTfLiquidityInteractionContext {
  schemaVersion: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID;
  ruleIds: {
    interaction: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID;
    touch: typeof MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID;
  };
  ltfEvaluationBarIndex: number;
  ltfEvaluationTimestamp: number;
  htfEvaluationBarIndex: number | null;
  htfEvaluationTimestamp: number | null;
  horizonBars: number;
  events: readonly CrossTfLiquidityInteractionEvent[];
  unresolved: readonly CrossTfLiquidityInteractionUnresolvedReason[];
  limitations: readonly string[];
}
