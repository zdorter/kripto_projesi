import type {
  LiquidityPoolKind,
  LiquidityPriceBand,
} from "./market-structure-liquidity-types";
import type { LiquidityInteractionSide } from "./market-structure-liquidity-interaction-types";
import type { MarketStructureScope } from "./market-structure-types";
import type { LiquidityPoolLifecycleProjection } from "./market-structure-liquidity-lifecycle-derivation";

export const MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_SWEEP_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_TAKEN_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_RECLAIM_V1" as const;

export type AdvancedLiquidityInteractionEventType =
  | "LIQUIDITY_SWEEP"
  | "LIQUIDITY_TAKEN"
  | "LIQUIDITY_RECLAIM";

export type AdvancedLiquidityInteractionEvidenceTag = "DIRECT_OBSERVATION";

export interface AdvancedLiquidityInteractionEventBase {
  eventId: string;
  poolId: string;
  poolKind: LiquidityPoolKind;
  side: LiquidityInteractionSide;
  referencePrice: number;
  referenceScope: MarketStructureScope;
  sourcePivotIndices: readonly number[];
  triggerBarIndex: number;
  triggerTimestamp: number;
  knownAtBarIndex: number;
  evidenceTag: AdvancedLiquidityInteractionEvidenceTag;
  priceBand?: LiquidityPriceBand;
}

export interface LiquiditySweepEvent extends AdvancedLiquidityInteractionEventBase {
  eventType: "LIQUIDITY_SWEEP";
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID;
}

export interface LiquidityTakenEvent extends AdvancedLiquidityInteractionEventBase {
  eventType: "LIQUIDITY_TAKEN";
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID;
}

export interface LiquidityReclaimEvent extends AdvancedLiquidityInteractionEventBase {
  eventType: "LIQUIDITY_RECLAIM";
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID;
  precedingSweepEventId: string;
  precedingSweepTriggerBarIndex: number;
}

export type AdvancedLiquidityInteractionEvent =
  | LiquiditySweepEvent
  | LiquidityTakenEvent
  | LiquidityReclaimEvent;

export interface AdvancedLiquidityInteractionUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureLiquidityAdvancedInteractionContext {
  schemaVersion: typeof MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  horizonBars: number;
  foundationRuleId: "FROZEN_LIQUIDITY_FOUNDATION_V1";
  ruleIds: {
    research: typeof MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID;
    sweep: typeof MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID;
    taken: typeof MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID;
    reclaim: typeof MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID;
    lifecycle: "MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_V1";
  };
  events: readonly AdvancedLiquidityInteractionEvent[];
  lifecycle: readonly LiquidityPoolLifecycleProjection[];
  limitations: readonly string[];
  unresolved: readonly AdvancedLiquidityInteractionUnresolvedReason[];
}
