import type { EntryModelPriceContext, EntryModelReport, EntryPriceReference } from "./entry-model-types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { ObjectiveTargetCandidateReport } from "./objective-target-candidate-types";
import type { ObjectiveTargetSourceContext } from "./objective-target-candidate-types";
import type { ObjectiveTargetSelectionResult } from "./objective-target-selection-types";
import type { RiskRewardModelReport, RiskRewardReference } from "./risk-reward-model-types";
import type { StopLossModelReport, StopLossReference } from "./stop-loss-model-types";
import type { TargetModelReport, TargetReference } from "./target-model-types";

export const TRADE_SETUP_EVALUATION_SCHEMA_VERSION = "1.0" as const;

/**
 * Aggregate composition state — not a trade signal or enter/exit directive.
 */
export type TradeSetupEvaluationAggregateState =
  | "READY_FOR_FURTHER_EVALUATION"
  | "INSUFFICIENT_CONTEXT"
  | "INVALID";

export interface TradeSetupEvaluationComposeInput {
  plan: EntryPlanCandidate;
  priceContext?: EntryModelPriceContext;
  /**
   * When provided, runs 14D.8 candidates + 14D.9 selection and bridges
   * EXPLICIT_OBJECTIVE_TARGET for Target Model only. Omitted → prior behavior.
   */
  objectiveTargetSourceContext?: ObjectiveTargetSourceContext;
}

/**
 * Unified snapshot of reference-model outputs for one Entry Plan evaluation.
 */
export interface TradeSetupEvaluationSnapshot {
  schemaVersion: typeof TRADE_SETUP_EVALUATION_SCHEMA_VERSION;
  entryPlan: EntryPlanCandidate;
  entryModel: EntryModelReport;
  stopLossModel: StopLossModelReport;
  targetModel: TargetModelReport;
  riskRewardModel: RiskRewardModelReport;
  /** First AVAILABLE entry reference (catalog sort order); used for RR triplet only. */
  selectedEntryReference: EntryPriceReference | null;
  selectedStopLossReference: StopLossReference | null;
  selectedTargetReference: TargetReference | null;
  selectedRiskRewardReference: RiskRewardReference | null;
  evaluationState: TradeSetupEvaluationAggregateState;
  /** Present when objectiveTargetSourceContext was supplied to composition. */
  objectiveTargetCandidates?: ObjectiveTargetCandidateReport;
  objectiveTargetSelection?: ObjectiveTargetSelectionResult;
  limitations: string[];
}
