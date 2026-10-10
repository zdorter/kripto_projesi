import type {
  LiquidityPoolKind,
  LiquidityPriceBand,
} from "./market-structure-liquidity-types";
import type { MarketStructureScope } from "./market-structure-types";

export const MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_V1" as const;

export const FROZEN_LIQUIDITY_FOUNDATION_RULE_ID =
  "FROZEN_LIQUIDITY_FOUNDATION_V1" as const;

export const DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS = 24;

export type LiquidityInteractionSide = "HIGH_SIDE" | "LOW_SIDE";

export type LiquidityInteractionEventType = "LIQUIDITY_WICK_TOUCH";

export type LiquidityInteractionEvidenceTag = "DIRECT_OBSERVATION";

export interface LiquidityInteractionEvent {
  eventId: string;
  eventType: LiquidityInteractionEventType;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID;
  poolId: string;
  poolKind: LiquidityPoolKind;
  side: LiquidityInteractionSide;
  referencePrice: number;
  referenceScope: MarketStructureScope;
  sourcePivotIndices: readonly number[];
  triggerBarIndex: number;
  triggerTimestamp: number;
  knownAtBarIndex: number;
  evidenceTag: LiquidityInteractionEvidenceTag;
  priceBand?: LiquidityPriceBand;
}

export interface LiquidityInteractionUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureLiquidityInteractionContext {
  schemaVersion: typeof MARKET_STRUCTURE_LIQUIDITY_INTERACTION_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  horizonBars: number;
  foundationRuleId: typeof FROZEN_LIQUIDITY_FOUNDATION_RULE_ID;
  ruleIds: {
    touch: typeof MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID;
  };
  events: readonly LiquidityInteractionEvent[];
  limitations: readonly string[];
  unresolved: readonly LiquidityInteractionUnresolvedReason[];
}
