import { buildEntryModelReport, entryReferencesAvailable } from "./entry-model";
import { buildObjectiveTargetCandidateReport } from "./objective-target-candidate-sources";
import { applyObjectiveTargetSelectionPolicy } from "./objective-target-selection";
import { entryPlanWithSelectedObjectiveTarget } from "./objective-target-selection-bridge";
import { buildRiskRewardReport, riskRewardReferencesAvailable } from "./risk-reward-model";
import { buildStopLossReport, stopReferencesAvailable } from "./stop-loss-model";
import { buildTargetModelReport, targetReferencesAvailable } from "./target-model";
import type {
  TradeSetupEvaluationAggregateState,
  TradeSetupEvaluationComposeInput,
  TradeSetupEvaluationSnapshot,
} from "./trade-setup-evaluation-types";
import { TRADE_SETUP_EVALUATION_SCHEMA_VERSION } from "./trade-setup-evaluation-types";
import type { EntryPlanCandidate } from "./entry-plan-types";

const SNAPSHOT_LIMITATIONS = [
  "Evaluation snapshot composes reference models only; it is not a trade signal.",
  "READY_FOR_FURTHER_EVALUATION means entry, stop, target, and RR references are all available — not profitability or recommendation.",
  "Missing target reference in production pipeline is expected until objective target source exists.",
  "No fallback entry, stop, target, or RR calculation is performed in the composition layer.",
  "Objective target selection is policy precedence only; it is not a trade signal or quality ranking.",
];

function planInvalid(plan: EntryPlanCandidate): boolean {
  if (plan.setupRef.sourceSetupStatus === "INVALID") {
    return true;
  }
  return plan.invalidation.conditions.some(
    (c) =>
      c.conditionId === "setup-invalidation-triggered" && c.outcome === "MET"
  );
}

export function resolveTradeSetupEvaluationState(
  plan: EntryPlanCandidate,
  hasRrAvailable: boolean
): TradeSetupEvaluationAggregateState {
  if (planInvalid(plan)) {
    return "INVALID";
  }
  if (!plan.eligibility.eligible) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (hasRrAvailable) {
    return "READY_FOR_FURTHER_EVALUATION";
  }
  return "INSUFFICIENT_CONTEXT";
}

/**
 * Composes entry, stop, target, and risk/reward reference reports for an Entry Plan.
 * Does not run wave engine, scanner, or reimplement model logic.
 */
export function buildTradeSetupEvaluationSnapshot(
  input: TradeSetupEvaluationComposeInput
): TradeSetupEvaluationSnapshot {
  const plan = input.plan;

  let objectiveTargetCandidates: ReturnType<
    typeof buildObjectiveTargetCandidateReport
  > | undefined;
  let objectiveTargetSelection: ReturnType<
    typeof applyObjectiveTargetSelectionPolicy
  > | undefined;
  let targetPlan = plan;

  if (input.objectiveTargetSourceContext !== undefined) {
    objectiveTargetCandidates = buildObjectiveTargetCandidateReport({
      plan,
      sourceContext: input.objectiveTargetSourceContext,
    });
    objectiveTargetSelection = applyObjectiveTargetSelectionPolicy({
      report: objectiveTargetCandidates,
    });
    if (objectiveTargetSelection.outcome === "SELECTED") {
      const bridged = entryPlanWithSelectedObjectiveTarget(
        plan,
        objectiveTargetSelection
      );
      if (bridged) {
        targetPlan = bridged;
      }
    }
  }

  const entryModel = buildEntryModelReport({
    plan,
    priceContext: input.priceContext,
  }).report;
  const selectedEntryReference =
    entryReferencesAvailable(entryModel)[0] ?? null;
  const stopLossModel = buildStopLossReport({
    plan,
    selectedEntryReference,
  }).report;
  const targetModel = buildTargetModelReport({ plan: targetPlan }).report;

  const selectedStopLossReference =
    stopReferencesAvailable(stopLossModel)[0] ?? null;
  const selectedTargetReference =
    targetReferencesAvailable(targetModel)[0] ?? null;

  const riskRewardModel = buildRiskRewardReport({
    entry: selectedEntryReference ?? undefined,
    stop: selectedStopLossReference ?? undefined,
    target: selectedTargetReference ?? undefined,
  }).report;

  const selectedRiskRewardReference =
    riskRewardReferencesAvailable(riskRewardModel)[0] ?? null;

  const evaluationState = resolveTradeSetupEvaluationState(
    plan,
    selectedRiskRewardReference?.outcome === "RR_REFERENCE_AVAILABLE"
  );

  return {
    schemaVersion: TRADE_SETUP_EVALUATION_SCHEMA_VERSION,
    entryPlan: plan,
    entryModel,
    stopLossModel,
    targetModel,
    riskRewardModel,
    selectedEntryReference,
    selectedStopLossReference,
    selectedTargetReference,
    selectedRiskRewardReference,
    evaluationState,
    objectiveTargetCandidates,
    objectiveTargetSelection,
    limitations: SNAPSHOT_LIMITATIONS,
  };
}
