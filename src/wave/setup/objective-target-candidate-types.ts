import type { FibExtensionLevel } from "../fibonacci";
import type { WaveDiagnostics } from "../wave-diagnostics";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SetupDirectionalBias } from "./setup-types";

export const OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION = "1.0" as const;

export type ObjectiveTargetSourceId =
  | "ABC_PROJECTION"
  | "FIBONACCI_PROJECTION"
  | "PREVIOUS_SWING"
  | "WAVE_STRUCTURE";

export type ObjectiveTargetCandidateOutcome =
  | "AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

/**
 * Upstream attestation and diagnostics snapshots — not recomputed here.
 */
export type ObjectiveTargetSourceProvenance =
  | "ENGINE_DIAGNOSTICS"
  | "CALLER_ATTESTED";

export interface ObjectiveTargetSourceContext {
  /**
   * ENGINE_DIAGNOSTICS: snapshot from wave analysis bundle (no attested price fields).
   * CALLER_ATTESTED: explicit attested* fields supplied by caller/tests.
   */
  sourceProvenance?: ObjectiveTargetSourceProvenance;
  diagnostics?: WaveDiagnostics;
  /**
   * Attested impulse leg anchors for extension math (existing fibExtensionPrice).
   * Not inferred from wave labels in this layer.
   */
  attestedFibonacciProjection?: {
    rangeStartPrice: number;
    rangeEndPrice: number;
    extensionLevel: FibExtensionLevel;
  };
  /**
   * Attested ABC objective target from upstream geometry contract (price not derived here).
   */
  attestedAbcProjection?: {
    targetPrice: number;
    legAStartPrice: number;
    legAEndPrice: number;
    legCStartPrice: number;
    attestationDetail: string;
  };
  /**
   * Attested wave-structure objective price (not inferred from Wave 5 / Wave C labels).
   */
  attestedWaveStructureTarget?: {
    targetPrice: number;
    evidenceRef: string;
  };
}

export interface ObjectiveTargetCandidateEvaluateInput {
  plan: EntryPlanCandidate;
  sourceContext?: ObjectiveTargetSourceContext;
}

/**
 * Producer-level objective target candidate — not a selected target or TP order.
 */
export interface ObjectiveTargetCandidate {
  schemaVersion: typeof OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION;
  sourceId: ObjectiveTargetSourceId;
  sourceLabel: string;
  outcome: ObjectiveTargetCandidateOutcome;
  entryPlanId: string;
  setupId: string;
  setupTypeId: string;
  symbol: string;
  timeframe: string;
  scenarioId: string;
  directionalBias: SetupDirectionalBias | null;
  targetPrice?: number;
  referenceSource: string;
  rationale: string;
  limitations: string[];
}

export interface ObjectiveTargetCandidateReport {
  schemaVersion: typeof OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION;
  entryPlanId: string;
  setupId: string;
  setupTypeId: string;
  symbol: string;
  timeframe: string;
  scenarioId: string;
  candidates: ObjectiveTargetCandidate[];
  limitations: string[];
}
