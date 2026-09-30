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

export interface OpenStructuralLeg {
  startIndex: number;
  startPrice: number | null;
  evaluationBarIndex: number;
  /** Bar close at evaluation index — not an objective target or signal. */
  evaluationPrice: number | null;
  direction: OpenStructuralLegDirection;
  state: "IN_PROGRESS";
  evidence: string[];
}

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
  openLeg: OpenStructuralLeg | null;
  phaseStatus: ProspectivePhaseStatus;
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
  | "GATE_INPUT_MISSING";

export interface ObjectiveTargetEligibilityGateResult {
  outcome: ObjectiveTargetEligibilityGateOutcome;
  objectiveEligibility: ObjectiveEligibility;
  reasonCodes: ObjectiveTargetEligibilityGateReasonCode[];
  detail: string;
}
