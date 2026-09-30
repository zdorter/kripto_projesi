import type { WaveLabel } from "../types";
import type { ObjectiveEligibility } from "./trade-setup-temporal-types";

/**
 * Semantic category for Option A prospective families (not production setupTypeId).
 * Existing TRADE_SETUP category retained; distinguished via temporal semantics.
 */
export const PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY =
  "PROSPECTIVE_TRADE_SETUP" as const;

export type ProspectiveTradeSetupSemanticCategory =
  typeof PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY;

export const PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT =
  "STRUCTURAL_RESUMPTION_CONTEXT" as const;

export type ProspectiveSetupFamilyId =
  typeof PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT;

export type ProspectivePhaseStatus =
  | "NOT_ESTABLISHED"
  | "TRANSITION_OBSERVED"
  | "OPEN_MOVEMENT_OBSERVED"
  | "PHASE_IN_PROGRESS"
  | "PHASE_ALREADY_COMPLETED"
  | "INSUFFICIENT_CONTEXT";

export type ProspectiveSetupSupportVerdict =
  | "SUPPORTED_BY_CONTRACT"
  | "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY"
  | "ENGINE_CANNOT_REPRESENT_OPEN_OBJECTIVE_LEG"
  | "INSUFFICIENT_CONTEXT";

export type ProspectiveLabelFreeVerdict = "SUPPORTED" | "REQUIRES_WAVE_LABEL" | "UNRESOLVED";

export type ProspectiveProductionSupportVerdict =
  | "EXISTING_ENGINE_SUPPORTS_PROSPECTIVE_SETUP"
  | "NEEDS_OPEN_LEG_ABSTRACTION"
  | "NEEDS_EVALUATION_SCOPED_ENGINE"
  | "NEEDS_NEW_WAVE_TRANSITION_POLICY";

export type OpenStructuralLegDirection = "BULLISH" | "BEARISH" | "UNRESOLVED";

export type {
  OpenLegComparisonVerdict,
  OpenLegPathComparison,
  OpenMovementVerdict,
  OpenStructuralLeg,
  OpenStructuralLegResolution,
  StructuralTransitionVerdict,
} from "./open-structural-leg-types";

export interface ProspectiveTransitionEvidence {
  sourceSetupId: string;
  sourceSetupType: string;
  completedStructure: WaveLabel | null;
  completedAtIndex: number | null;
  subsequentSwingIndex: number | null;
  subsequentSwingDirection: "HIGH" | "LOW" | null;
  candidateLegLabel: WaveLabel | null;
  candidateLegStartIndex: number | null;
  candidateLegEndIndex: number | null;
  candidateLegState: string | null;
  evaluationBarIndex: number;
  futureSafe: boolean;
  notes: string[];
}

export interface ProspectiveSetupContractResult {
  semanticCategory: ProspectiveTradeSetupSemanticCategory;
  familyId: ProspectiveSetupFamilyId;
  sourceSetupId: string;
  sourceSetupType: string;
  transitionEvidence: ProspectiveTransitionEvidence;
  /** First-class open leg when AVAILABLE (14N-G). */
  openLeg: import("./open-structural-leg-types").OpenStructuralLeg | null;
  openLegResolution: import("./open-structural-leg-types").OpenStructuralLegResolution | null;
  legacyPotentialOpenLeg: import("./open-structural-leg-types").OpenStructuralLeg | null;
  openLegPathComparison: import("./open-structural-leg-types").OpenLegPathComparison | null;
  openMovementVerdict: import("./open-structural-leg-types").OpenMovementVerdict;
  structuralTransitionVerdict: import("./open-structural-leg-types").StructuralTransitionVerdict;
  legacyPhaseStatus: ProspectivePhaseStatus;
  phaseStatus: ProspectivePhaseStatus;
  objectiveEligibilityReasons: string[];
  prospectiveWaveLabel: WaveLabel | null;
  objectiveEligibility: ObjectiveEligibility;
  invalidationAvailable: boolean;
  labelFreeVerdict: ProspectiveLabelFreeVerdict;
  supportVerdict: ProspectiveSetupSupportVerdict;
  productionSupportVerdicts: ProspectiveProductionSupportVerdict[];
  potentialLookaheadRisk: boolean;
  reasons: string[];
}

export type ObjectiveTargetEligibilityGateOutcome =
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_CONTEXT";

export type ObjectiveTargetEligibilityGateReasonCode =
  | "PHASE_NOT_IN_PROGRESS"
  | "NOT_FUTURE_SAFE"
  | "INVALIDATION_UNAVAILABLE"
  | "OBJECTIVE_NOT_ELIGIBLE"
  | "PROSPECTIVE_CONTRACT_UNSUPPORTED"
  | "OPEN_LEG_AVAILABLE_BUT_TRANSITION_UNRESOLVED"
  | "GATE_INPUT_MISSING";

export interface ObjectiveTargetEligibilityGateResult {
  outcome: ObjectiveTargetEligibilityGateOutcome;
  objectiveEligibility: ObjectiveEligibility;
  reasonCodes: ObjectiveTargetEligibilityGateReasonCode[];
  detail: string;
}
