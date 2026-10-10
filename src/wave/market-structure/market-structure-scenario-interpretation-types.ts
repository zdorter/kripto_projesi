import type { TrendDirection } from "../types";
import type { MtfStructureStateAlignment } from "./market-structure-mtf-structure-alignment-types";
import type {
  MtfLiquidityLifecycleAlignment,
  MtfLiquiditySideAlignment,
} from "./market-structure-mtf-liquidity-alignment-types";
import type { MtfEventOrderingHtfSourceTrack } from "./market-structure-mtf-event-ordering-types";

export const MARKET_STRUCTURE_SCENARIO_INTERPRETATION_SCHEMA_VERSION = "1.0" as const;

export const MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID =
  "MARKET_STRUCTURE_SCENARIO_INTERPRETATION_DESCRIPTIVE_V1" as const;

export type ScenarioInterpretationFamily =
  | "BEARISH_CONTINUATION"
  | "BULLISH_CONTINUATION"
  | "BEARISH_REVERSAL"
  | "BULLISH_REVERSAL"
  | "RANGE_OR_UNRESOLVED"
  | "UNRESOLVED";

export type ScenarioInterpretationStatus =
  | "ACTIVE_CONTEXT"
  | "WAITING_FOR_TRANSITION"
  | "INVALIDATED"
  | "UNRESOLVED";

export type ScenarioRequiredTransitionCode =
  | "LTF_BEARISH_STRUCTURE_TRANSITION"
  | "LTF_BULLISH_STRUCTURE_TRANSITION"
  | "NONE";

export type ScenarioStructuralInvalidationStatus =
  | "SINGLE_REFERENCE"
  | "AMBIGUOUS"
  | "NOT_ESTABLISHED"
  | "UNRESOLVED";

export interface ScenarioStructuralInvalidationReference {
  status: ScenarioStructuralInvalidationStatus;
  side: "PROTECTED_HIGH" | "PROTECTED_LOW" | "NONE";
  referencePrice: number | null;
  pivotIndex: number | null;
  candidateCount: number;
  descriptiveNote: string;
}

export interface ScenarioLiquidityContext {
  bslCandidateCount: number;
  sslCandidateCount: number;
  eqhObservationCount: number;
  eqlObservationCount: number;
  wickTouchCount: number;
  sweepCount: number;
  takenCount: number;
  reclaimCount: number;
  observedInteractionFamilies: readonly string[];
  descriptiveNote: string;
}

export interface ScenarioMtfReadModelContext {
  structureAlignment: MtfStructureStateAlignment | null;
  liquiditySideAlignment: MtfLiquiditySideAlignment | null;
  liquidityLifecycleAlignment: MtfLiquidityLifecycleAlignment | null;
  eventOrderingRelationCount: number;
  evaluationOrderingRelationCount: number;
  liquidityToStructureAssociationCount: number;
  structureToMssAssociationCount: number;
  htfSourceTrack: MtfEventOrderingHtfSourceTrack | null;
  evidenceTag: "DESCRIPTIVE_MTF_READ_MODEL_PASSTHROUGH";
}

export interface ScenarioTimeframeContext {
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfTrendContext: TrendDirection | null;
  ltfTrendContext: TrendDirection | null;
  fifteenMStatus: "NOT_ESTABLISHED";
}

export interface MarketStructureScenarioInterpretation {
  scenarioType: ScenarioInterpretationFamily;
  status: ScenarioInterpretationStatus;
  timeframeContext: ScenarioTimeframeContext;
  observedEvidence: readonly string[];
  requiredTransitions: readonly ScenarioRequiredTransitionCode[];
  structuralInvalidation: ScenarioStructuralInvalidationReference;
  liquidityContext: ScenarioLiquidityContext;
  mtfContext: ScenarioMtfReadModelContext | null;
  interpretation: string;
  limitations: readonly string[];
}

export interface MarketStructureScenarioInterpretationContext {
  schemaVersion: typeof MARKET_STRUCTURE_SCENARIO_INTERPRETATION_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID;
  evaluationTimestamp: number | null;
  htfTimeframeId: string;
  ltfTimeframeId: string;
  primaryScenario: MarketStructureScenarioInterpretation | null;
  alternativeScenario: MarketStructureScenarioInterpretation | null;
  observedEvidence: readonly string[];
  unresolved: readonly { code: string; message: string }[];
  limitations: readonly string[];
  researchFlags: readonly string[];
}

export interface BuildMarketStructureScenarioInterpretationContextInput {
  surface: import("./market-structure-descriptive-confluence-surface-types").MarketStructureDescriptiveConfluenceSurfaceContext;
}
