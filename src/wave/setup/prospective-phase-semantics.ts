import type { ProspectivePhaseStatus } from "./prospective-setup-contract-types";

export interface ProspectivePhaseTruthRow {
  sourceAccepted: boolean;
  anchorMatchesCompletedEndpoint: boolean;
  openLegAvailable: boolean;
  transitionObserved: boolean;
  invalidationAvailable: boolean;
  futureSafe: boolean;
  phaseStatus: ProspectivePhaseStatus;
  productionConfirmed: boolean;
  blockingReasons: string[];
}

export function evaluateProspectivePhaseTruth(input: {
  sourceAccepted: boolean;
  anchorMatchesCompletedEndpoint: boolean;
  openLegAvailable: boolean;
  anchorSelected: boolean;
  transitionObserved: boolean;
  invalidationAvailable: boolean;
  invalidationTriggered: boolean;
  futureSafe: boolean;
  phaseStatus: ProspectivePhaseStatus;
}): ProspectivePhaseTruthRow {
  const blockingReasons: string[] = [];
  if (!input.sourceAccepted) {
    blockingReasons.push("SOURCE_NOT_ACCEPTED");
  }
  if (!input.anchorSelected || !input.anchorMatchesCompletedEndpoint) {
    blockingReasons.push("ANCHOR_NOT_AT_COMPLETED_ENDPOINT");
  }
  if (!input.openLegAvailable) {
    blockingReasons.push("OPEN_LEG_UNAVAILABLE");
  }
  if (!input.transitionObserved) {
    blockingReasons.push("TRANSITION_NOT_OBSERVED");
  }
  if (input.invalidationTriggered) {
    blockingReasons.push("INVALIDATION_TRIGGERED");
  }
  if (!input.invalidationAvailable) {
    blockingReasons.push("INVALIDATION_UNAVAILABLE");
  }
  if (!input.futureSafe) {
    blockingReasons.push("NOT_FUTURE_SAFE");
  }
  if (input.phaseStatus !== "PHASE_IN_PROGRESS") {
    blockingReasons.push(`PHASE_STATUS_${input.phaseStatus}`);
  }

  const productionConfirmed =
    input.sourceAccepted &&
    input.anchorSelected &&
    input.anchorMatchesCompletedEndpoint &&
    input.openLegAvailable &&
    input.transitionObserved &&
    input.invalidationAvailable &&
    !input.invalidationTriggered &&
    input.futureSafe &&
    input.phaseStatus === "PHASE_IN_PROGRESS";

  return {
    sourceAccepted: input.sourceAccepted,
    anchorMatchesCompletedEndpoint: input.anchorMatchesCompletedEndpoint,
    openLegAvailable: input.openLegAvailable,
    transitionObserved: input.transitionObserved,
    invalidationAvailable: input.invalidationAvailable,
    futureSafe: input.futureSafe,
    phaseStatus: input.phaseStatus,
    productionConfirmed,
    blockingReasons,
  };
}
