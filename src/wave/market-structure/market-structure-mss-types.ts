import type { MarketStructureScope } from "./market-structure-types";
import type { SwingType, TrendDirection } from "../types";
import type { BreakDirection } from "./market-structure-break-types";

export const MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION = "1.0" as const;

export const MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_MSS_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID =
  "MARKET_STRUCTURE_MSS_CLASSIFICATION_V1" as const;

export const MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID =
  "MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_V1" as const;

export type MssDirection = "BULLISH" | "BEARISH";

export type MssPrimaryReferenceKind = "PROTECTED_HIGH" | "PROTECTED_LOW";

export type MssEvidenceTag = "DERIVED_STRUCTURE_TRANSITION";

export interface MssUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureMssEvent {
  eventId: string;
  ruleId: typeof MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID;
  classificationRuleId: typeof MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID;
  referenceRuleId: typeof MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID;
  mssDirection: MssDirection;
  preTransitionDirectionalState: Exclude<TrendDirection, "NEUTRAL">;
  primaryReferenceKind: MssPrimaryReferenceKind;
  derivedFromObservationId: string;
  referencePivotIndex: number;
  referencePrice: number;
  referenceType: SwingType;
  referenceKnownAtBarIndex: number;
  referenceScope: MarketStructureScope;
  breakDirection: BreakDirection;
  triggerBarIndex: number;
  knownAtBarIndex: number;
  confirmationBarIndex: null;
  evidenceTag: MssEvidenceTag;
}

export interface MarketStructureMssContext {
  schemaVersion: typeof MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  trendContext: TrendDirection;
  events: readonly MarketStructureMssEvent[];
  unresolved: readonly MssUnresolvedReason[];
  limitations: readonly string[];
}
