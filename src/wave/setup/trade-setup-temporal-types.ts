import type { WaveLabel } from "../types";
import type { SetupLifecycleStatus } from "./setup-types";

/**
 * Semantic classification of what a trade setup type confirms (not production setupTypeId).
 */
export type TradeSetupSemanticKind =
  | "IMPULSE_FOCUS_LEG_ENDPOINT_CONFIRMATION"
  | "CORRECTIVE_C_LEG_ENDPOINT_CONFIRMATION"
  | "STRUCTURAL_CONTEXT_ONLY"
  | "UNKNOWN";

export type TradeSetupTemporalClass =
  | "HISTORICAL_STRUCTURE"
  | "CURRENT_STRUCTURE"
  | "PROSPECTIVE_STRUCTURE"
  | "INSUFFICIENT_CONTEXT";

export type ObjectiveEligibility =
  | "ELIGIBLE"
  | "NOT_PROSPECTIVE"
  | "OBJECTIVE_ALREADY_COMPLETED"
  | "OBJECTIVE_UNRESOLVED"
  | "INSUFFICIENT_CONTEXT";

/**
 * Design verdict for future target wiring (14N-D — not production gate yet).
 */
export type TargetObjectiveEligibilityGateVerdict = "REQUIRED" | "NOT_REQUIRED" | "UNRESOLVED";

export const TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT: TargetObjectiveEligibilityGateVerdict =
  "REQUIRED";

export type ProspectiveSetupSupportVerdict =
  | "NO_PROSPECTIVE_SETUP_SUPPORTED"
  | "EVIDENCE_INSUFFICIENT_FOR_NEW_FAMILY";

export interface StructuralTransitionEvidence {
  nextImpulseLegLabel: WaveLabel | null;
  nextLegStartAtOrBeforeBar: boolean;
  nextLegEndConfirmedAtOrBeforeBar: boolean;
  oppositeSwingAfterFocusEnd: boolean;
  presentationFocusWave: WaveLabel | null;
  canEstablishTransition: boolean;
  canEstablishProspectiveWave: boolean;
  temporalSafeAtBar: boolean;
  notes: string[];
}

export interface ObjectivePhaseContext {
  sourceSetupId: string;
  sourceSetupType: string;
  temporalClass: TradeSetupTemporalClass;
  completedStructuralWave: WaveLabel | null;
  prospectiveWave: WaveLabel | null;
  prospectiveWaveState: string;
  objectiveEligibility: ObjectiveEligibility;
  evidence: string[];
}

export interface TradeSetupTemporalContext {
  setupId: string;
  setupTypeId: string;
  lifecycleStatus: SetupLifecycleStatus;
  semanticKind: TradeSetupSemanticKind;
  temporalClass: TradeSetupTemporalClass;
  focusWave: WaveLabel;
  focusWaveState: string;
  evaluationBarIndex: number;
  objectiveEligibility: ObjectiveEligibility;
  prospectiveWave: WaveLabel | null;
  transitionEvidence: StructuralTransitionEvidence;
  objectivePhase: ObjectivePhaseContext;
  reason: string;
  /** Entry/stop layers are independent of objective eligibility (diagnostic only). */
  entryPlanEligibilityNote: string;
}
