import type { ObjectiveEligibility } from "./trade-setup-temporal-types";
import type {
  ObjectiveTargetEligibilityGateReasonCode,
  ObjectiveTargetEligibilityGateResult,
  ProspectiveSetupContractResult,
} from "./prospective-setup-contract-types";

/**
 * Preparation contract for future target pipeline wiring (14N-E — not production).
 */
export function evaluateObjectiveTargetEligibilityGate(
  prospective: ProspectiveSetupContractResult | null | undefined
): ObjectiveTargetEligibilityGateResult {
  if (!prospective) {
    return {
      outcome: "INSUFFICIENT_CONTEXT",
      objectiveEligibility: "INSUFFICIENT_CONTEXT",
      reasonCodes: ["GATE_INPUT_MISSING"],
      detail: "No prospective setup contract result supplied.",
    };
  }
  const reasonCodes: ObjectiveTargetEligibilityGateReasonCode[] = [];
  if (prospective.supportVerdict !== "SUPPORTED_BY_CONTRACT") {
    reasonCodes.push("PROSPECTIVE_CONTRACT_UNSUPPORTED");
  }
  if (prospective.objectiveEligibility !== "ELIGIBLE") {
    reasonCodes.push("OBJECTIVE_NOT_ELIGIBLE");
  }
  if (prospective.phaseStatus !== "PHASE_IN_PROGRESS") {
    reasonCodes.push("PHASE_NOT_IN_PROGRESS");
  }
  if (!prospective.transitionEvidence.futureSafe) {
    reasonCodes.push("NOT_FUTURE_SAFE");
  }
  if (!prospective.invalidationAvailable) {
    reasonCodes.push("INVALIDATION_UNAVAILABLE");
  }

  if (reasonCodes.length === 0) {
    return {
      outcome: "PASS",
      objectiveEligibility: prospective.objectiveEligibility,
      reasonCodes: [],
      detail: "Prospective phase in progress with future-safe evidence and invalidation (gate prep only).",
    };
  }
  if (reasonCodes.includes("GATE_INPUT_MISSING")) {
    return {
      outcome: "INSUFFICIENT_CONTEXT",
      objectiveEligibility: prospective.objectiveEligibility,
      reasonCodes,
      detail: "Insufficient context for objective target eligibility gate.",
    };
  }
  return {
    outcome: "FAIL",
    objectiveEligibility: prospective.objectiveEligibility,
    reasonCodes,
    detail: "Objective target eligibility gate would fail (no target price computed).",
  };
}

export function objectiveEligibilityFromProspectivePhase(
  phaseStatus: ProspectiveSetupContractResult["phaseStatus"],
  futureSafe: boolean,
  invalidationAvailable: boolean
): ObjectiveEligibility {
  if (phaseStatus === "PHASE_IN_PROGRESS" && futureSafe && invalidationAvailable) {
    return "ELIGIBLE";
  }
  if (phaseStatus === "PHASE_ALREADY_COMPLETED") {
    return "OBJECTIVE_ALREADY_COMPLETED";
  }
  if (phaseStatus === "PHASE_IN_PROGRESS") {
    return "OBJECTIVE_UNRESOLVED";
  }
  return "NOT_PROSPECTIVE";
}
