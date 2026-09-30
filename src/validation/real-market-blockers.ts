import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import type { ObjectiveTargetCandidateReport } from "../wave/setup/objective-target-candidate-types";
import type { ObjectiveTargetSelectionResult } from "../wave/setup/objective-target-selection-types";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationSnapshot } from "../wave/setup/trade-setup-evaluation-types";
import type { RealMarketBlockerReason } from "./real-market-validation-types";

export function blockersForTradeSetupDetail(input: {
  setup: SetupCandidate;
  plan: EntryPlanCandidate | null;
  snapshot: TradeSetupEvaluationSnapshot | null;
  candidateReport: ObjectiveTargetCandidateReport | null;
  selection: ObjectiveTargetSelectionResult | null;
  scanError?: boolean;
  scanInvalidationAvailable?: boolean;
}): RealMarketBlockerReason[] {
  const blockers: RealMarketBlockerReason[] = [];
  const { setup, plan, snapshot, candidateReport, selection } = input;

  if (input.scanError) {
    blockers.push("SCAN_SYMBOL_ERROR");
    return blockers;
  }

  if (setup.status === "CANDIDATE") {
    blockers.push("SETUP_NOT_CONFIRMED");
  }
  if (setup.status === "INVALID") {
    blockers.push("SETUP_INVALID");
  }
  if (setup.status === "INSUFFICIENT_CONTEXT") {
    blockers.push("SETUP_INSUFFICIENT_CONTEXT");
  }

  if (!plan) {
    if (setup.isTradeSetup && setup.status === "CONFIRMED") {
      blockers.push("ENTRY_PLAN_NOT_CREATED");
      blockers.push("CLOSED_BAR_NOT_ESTABLISHED");
    } else if (setup.isTradeSetup) {
      blockers.push("ENTRY_PLAN_NOT_CREATED");
    }
  } else if (!plan.eligibility.eligible) {
    blockers.push("ENTRY_PLAN_NOT_CREATED");
    if (plan.eligibility.reason === "CLOSED_BAR_NOT_ESTABLISHED") {
      blockers.push("CLOSED_BAR_NOT_ESTABLISHED");
    }
  }

  const inv = setup.referenceLevels.some(
    (l) => l.kind === "SCENARIO_INVALIDATION"
  );
  if (setup.isTradeSetup && !inv) {
    blockers.push("INVALIDATION_MISSING");
    if (input.scanInvalidationAvailable === true) {
      blockers.push("SETUP_INVALIDATION_MAPPING_MISSING");
    } else if (input.scanInvalidationAvailable === false) {
      blockers.push("UPSTREAM_INVALIDATION_UNAVAILABLE");
    }
  }

  for (const c of setup.confirmation.conditions) {
    if (c.conditionId === "fib-abc-conformance-met" && c.outcome === "INSUFFICIENT_DATA") {
      blockers.push("ABC_CONTEXT_MISSING");
    }
    if (c.conditionId === "fib-w12-conformance-met" && c.outcome === "INSUFFICIENT_DATA") {
      blockers.push("FIB_CONTEXT_MISSING");
    }
    if (c.outcome === "INSUFFICIENT_DATA") {
      blockers.push("CONFIRMATION_DATA_MISSING");
    }
  }
  for (const c of setup.trigger.conditions) {
    if (c.outcome === "INSUFFICIENT_DATA") {
      blockers.push("CONFIRMATION_DATA_MISSING");
    }
  }

  if (snapshot) {
    if (!snapshot.selectedEntryReference) {
      blockers.push("ENTRY_REFERENCE_MISSING");
    }
    if (!snapshot.selectedStopLossReference) {
      blockers.push("STOP_REFERENCE_MISSING");
    }
  } else if (plan?.eligibility.eligible) {
    blockers.push("ENTRY_REFERENCE_MISSING");
    blockers.push("STOP_REFERENCE_MISSING");
  }

  if (candidateReport) {
    const anyAvailable = candidateReport.candidates.some(
      (c) => c.outcome === "AVAILABLE"
    );
    if (!anyAvailable) {
      blockers.push("OBJECTIVE_TARGET_CONTEXT_MISSING");
    }
  } else if (plan?.eligibility.eligible) {
    blockers.push("OBJECTIVE_TARGET_CONTEXT_MISSING");
  }

  if (selection) {
    if (selection.outcome === "NO_SELECTION") {
      blockers.push("TARGET_SELECTION_NONE");
    }
    if (selection.outcome === "INSUFFICIENT_CONTEXT") {
      blockers.push("TARGET_SELECTION_INSUFFICIENT");
    }
  }

  if (snapshot && !snapshot.selectedTargetReference) {
    blockers.push("TARGET_REFERENCE_MISSING");
  }
  if (snapshot && !snapshot.selectedRiskRewardReference) {
    blockers.push("RR_REFERENCE_MISSING");
  }

  return [...new Set(blockers)];
}

export function incrementBlockerCounts(
  counts: Record<string, number>,
  blockers: RealMarketBlockerReason[]
): void {
  for (const b of blockers) {
    counts[b] = (counts[b] ?? 0) + 1;
  }
}
