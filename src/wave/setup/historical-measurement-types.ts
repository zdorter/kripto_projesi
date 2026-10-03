import type { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./historical-measurement-contract";
import type { ProspectiveReferenceEvaluation } from "./prospective-reference-evaluation";
import type { ProspectiveSetupProductionCandidate } from "./prospective-setup-production-types";
import type { ProspectiveSetupOutcomeReplayResult } from "./prospective-setup-outcome-replay-types";
import type { SetupCandidate } from "./setup-types";
import type { TradeEvaluationResult } from "./trade-evaluation-types";
import type { HistoricalMeasurementCohort } from "./historical-measurement-contract";

/**
 * Frozen evaluation snapshot at bar E. Canonical domain types only (not scanner UI presentation).
 */
export interface HistoricalMeasurementEvaluationSnapshot {
  historicalSetup: SetupCandidate | null;
  production: ProspectiveSetupProductionCandidate | null;
  references: ProspectiveReferenceEvaluation;
  tradeEvaluation: TradeEvaluationResult;
}

/**
 * Post-evaluation outcome attachment (B-6 domain + forward-window metadata).
 * `futureBarsAvailable` distinguishes truncated tails from full horizon (NO_TOUCH vs NO_FUTURE_DATA).
 */
export interface HistoricalMeasurementOutcomeAttachment {
  replay: ProspectiveSetupOutcomeReplayResult;
  futureBarsAvailable: number;
}

/**
 * Immutable historical measurement row: one (evaluationBarIndex, prospectiveSetupId) at cohort C.
 */
export interface HistoricalMeasurementRecord {
  schemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  snapshotId: string;
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  evaluationBarTime: number | null;
  prospectiveSetupId: string;
  cohort: HistoricalMeasurementCohort;
  horizonBars: number;
  evaluation: HistoricalMeasurementEvaluationSnapshot;
  /** Null when outcome not yet measured; never used to revise evaluation fields. */
  outcome: HistoricalMeasurementOutcomeAttachment | null;
}

/**
 * B-8e: one snapshot identity (B-8a snapshotId) with all applicable cohort tags (overlap allowed).
 */
export interface HistoricalCandidateMeasurementBundle {
  measurement: HistoricalMeasurementRecord;
  cohorts: readonly HistoricalMeasurementCohort[];
}
