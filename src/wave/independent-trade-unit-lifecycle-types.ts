import type { HistoricalBacktestReport } from "./historical-backtest-types";
import type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
import type { HistoricalPositionOutcomePolicyId } from "./historical-position-outcome-policy-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";

export const INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION = "1.0" as const;

export const SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID =
  "SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID" as const;

export type IndependentTradeSiblingCandidatePolicyId =
  typeof SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID;

export const INDEPENDENT_TRADE_SIBLING_CANDIDATE_POLICY_DEFAULT: IndependentTradeSiblingCandidatePolicyId =
  SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID;

export const RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT =
  "RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT" as const;

export type IndependentTradeReEntryPolicyId =
  typeof RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT;

export const INDEPENDENT_TRADE_RE_ENTRY_POLICY_DEFAULT: IndependentTradeReEntryPolicyId =
  RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT;

export const POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL =
  "POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL" as const;

export type IndependentTradePositionMutexPolicyId =
  typeof POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL;

export const INDEPENDENT_TRADE_POSITION_MUTEX_POLICY_DEFAULT: IndependentTradePositionMutexPolicyId =
  POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL;

export type IndependentTradeLifecycleStatus =
  | "OPEN_RESOLVED"
  | "AMBIGUOUS_EXIT"
  | "UNRESOLVED_AT_HORIZON_EXIT"
  | "PATH_UNMEASURED";

export type IndependentTradeEntryRejectionReason =
  | "NOT_ENTRY_ELIGIBLE"
  | "SIBLING_NOT_SELECTED"
  | "MUTEX_POSITION_OPEN"
  | "PATH_UNMEASURED"
  | "MISSING_EVALUATION_BAR";

export interface IndependentTradeUnitConfiguration {
  lifecycleSchemaVersion: typeof INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION;
  entryEventPolicyId: IndependentTradeEntryEventPolicyId;
  entryEventPolicySchemaVersion: "1.0";
  siblingCandidatePolicyId: IndependentTradeSiblingCandidatePolicyId;
  reEntryPolicyId: IndependentTradeReEntryPolicyId;
  positionMutexPolicyId: IndependentTradePositionMutexPolicyId;
  outcomePolicyId: HistoricalPositionOutcomePolicyId;
  horizonBars: number;
}

export interface IndependentTradeUnit {
  tradeId: string;
  lifecycleSequence: number;
  snapshotId: string;
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  evaluationBarTime: number | null;
  prospectiveSetupId: string;
  sourceSetupId: string | null;
  direction: "BULLISH" | "BEARISH" | null;
  /** Frozen B-8 entry reference (not execution fill). */
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  canonicalRrRatio: number | null;
  /** Frozen B-8e cohort membership at entry (overlap allowed). */
  snapshotCohorts: readonly HistoricalMeasurementCohort[];
  /** Frozen B-9e setup family at entry. */
  setupFamilyId: string;
  tradeEvaluationStatus: string;
  /**
   * B-12l: frozen copy of evaluation.tradeEvaluation.firstFailure at bar E (diagnostic only).
   */
  evaluatorFirstFailure: TradeEvaluationFirstFailureCode | null;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: HistoricalPositionPolicyClassification;
  lifecycleStatus: IndependentTradeLifecycleStatus;
  exitBarIndex: number | null;
  resolutionBarIndex: number | null;
  barsAfterEvaluation: number | null;
  lifecycleDurationBars: number | null;
}

export interface IndependentTradeLifecycleSummary {
  totalSnapshots: number;
  eligibleEntrySnapshots: number;
  rejectedByMutex: number;
  rejectedSiblingNotSelected: number;
  rejectedPathUnmeasured: number;
  independentTrades: number;
  measuredTrades: number;
  unmeasuredSnapshots: number;
  overlappingSnapshotsEliminated: number;
  firstEvaluationBar: number | null;
  lastEvaluationBar: number | null;
  minLifecycleDurationBars: number | null;
  maxLifecycleDurationBars: number | null;
}

export interface IndependentTradeLifecycleReport {
  schemaVersion: typeof INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION;
  configuration: IndependentTradeUnitConfiguration;
  summary: IndependentTradeLifecycleSummary;
  trades: readonly IndependentTradeUnit[];
  entryRejections: readonly {
    snapshotId: string;
    evaluationBarIndex: number;
    reason: IndependentTradeEntryRejectionReason;
  }[];
}

export interface BuildIndependentTradeLifecycleInput {
  report: HistoricalBacktestReport;
  entryEventPolicyId?: IndependentTradeEntryEventPolicyId;
  siblingCandidatePolicyId?: IndependentTradeSiblingCandidatePolicyId;
  reEntryPolicyId?: IndependentTradeReEntryPolicyId;
  positionMutexPolicyId?: IndependentTradePositionMutexPolicyId;
}
