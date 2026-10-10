import type {
  MarketStructureScope,
  MarketStructureSwingLabel,
  ProtectedLevelSelectionReasonCode,
} from "./market-structure-types";
import type { SwingType, TrendDirection } from "../types";

export const MARKET_STRUCTURE_BREAK_CONTEXT_SCHEMA_VERSION = "1.0" as const;

export const MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_BREAK_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID =
  "MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_V1" as const;

export const MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID =
  "MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_V1" as const;

export const MARKET_STRUCTURE_BREAK_OBSERVATION_RULE_ID =
  "MARKET_STRUCTURE_BREAK_OBSERVATION_V1" as const;

export const MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID =
  "MARKET_STRUCTURE_BOS_CONTINUATION_V1" as const;

export const MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID =
  "MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_V1" as const;

export const MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_RULE_ID =
  "MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_V1" as const;

export const MARKET_STRUCTURE_BREAK_PRICE_EPS = 1e-9;

export type BreakTriggerKind = "WICK_INCLUSIVE_V1";

export type BreakDirection = "UP" | "DOWN";

export type BreakReferenceSourceKind =
  | "SWING"
  | "PROTECTED"
  | "PAIR_ENDPOINT"
  | "EQUAL_DIAGNOSTIC";

export type BreakEvidenceTag = "DIRECT_OBSERVATION" | "RULE_CLASSIFICATION";

export type ClassifiedStructureEventType = "BOS" | "CHoCH";

export interface BreakReferenceRegistryEntry {
  referencePivotIndex: number;
  referencePrice: number;
  referenceType: SwingType;
  referenceKnownAtBarIndex: number;
  referenceScope: MarketStructureScope;
  referenceStructureLabel: MarketStructureSwingLabel;
  referenceSources: readonly BreakReferenceSourceKind[];
  sourceProtectedReasonCodes?: readonly ProtectedLevelSelectionReasonCode[];
}

export interface BreakObservation {
  observationId: string;
  ruleId: typeof MARKET_STRUCTURE_BREAK_OBSERVATION_RULE_ID;
  referencePivotIndex: number;
  referencePrice: number;
  referenceType: SwingType;
  referenceKnownAtBarIndex: number;
  referenceScope: MarketStructureScope;
  referenceStructureLabel: MarketStructureSwingLabel;
  referenceSources: readonly BreakReferenceSourceKind[];
  sourceProtectedReasonCodes?: readonly ProtectedLevelSelectionReasonCode[];
  direction: BreakDirection;
  triggerBarIndex: number;
  triggerKind: BreakTriggerKind;
  knownAtBarIndex: number;
  confirmationBarIndex: null;
  evidenceTag: "DIRECT_OBSERVATION";
}

export interface ClassifiedStructureEvent {
  eventId: string;
  eventType: ClassifiedStructureEventType;
  classificationRuleId:
    | typeof MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID
    | typeof MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID;
  derivedFromObservationId: string;
  evidenceTag: "RULE_CLASSIFICATION";
  direction: BreakDirection;
  referencePivotIndex: number;
  referencePrice: number;
  referenceType: SwingType;
  referenceScope: MarketStructureScope;
  triggerBarIndex: number;
  knownAtBarIndex: number;
  trendContextAtClassification: TrendDirection;
}

export interface BreakUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureBreakContext {
  schemaVersion: typeof MARKET_STRUCTURE_BREAK_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  trendContext: TrendDirection;
  ruleIds: {
    trigger: typeof MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID;
    reference: typeof MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID;
    bos: typeof MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID;
    choch: typeof MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID;
    protectedConsume: typeof MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_RULE_ID;
  };
  referenceRegistry: readonly BreakReferenceRegistryEntry[];
  breakObservations: readonly BreakObservation[];
  classifiedEvents: readonly ClassifiedStructureEvent[];
  unresolved: readonly BreakUnresolvedReason[];
  limitations: readonly string[];
}
