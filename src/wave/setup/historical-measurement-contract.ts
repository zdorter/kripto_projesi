import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS } from "./prospective-setup-outcome-replay-contract";

/**
 * Historical outcome measurement (Phase B-8) — versioned offline analytical records.
 * Artifact envelope (B-8f) uses this schema version.
 */
export const HISTORICAL_MEASUREMENT_SCHEMA_VERSION = "1.0" as const;

/** Default forward outcome window; same source as B-6 replay. */
export const HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS =
  PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS;

/**
 * Lookahead contract (documentation constant for artifact consumers).
 *
 * - Evaluation snapshot fields are derived only from candles[0..E] (E = evaluationBarIndex).
 * - Outcome fields may inspect only candles[E+1 .. E+horizonBars] (inclusive, capped by series end).
 * - Outcome never mutates entry, stop, target, RR, tradeEvaluation, or setup validity.
 */
export const HISTORICAL_MEASUREMENT_LOOKAHEAD_CONTRACT = {
  evaluationCandleRange: "candles[0..evaluationBarIndex]",
  outcomeCandleRange: "candles[evaluationBarIndex+1 .. evaluationBarIndex+horizonBars]",
} as const;

/**
 * Cohort labels how a snapshot entered the historical dataset (denominator semantics).
 *
 * - ALL_PRODUCTION_CANDIDATES: every `detectProspectiveSetupProduction` candidate at E.
 * - READY_REFERENCES: candidates with `readyForFurtherEvaluation` at E.
 * - TRADE_EVAL_PASSED: candidates whose frozen `tradeEvaluation.status` is PASSED at E.
 * - DISPLAY_PICK: the single `selectDisplayProspectiveCandidate` row at E (UI-shaped stream).
 */
export const HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS = {
  ALL_PRODUCTION_CANDIDATES:
    "All prospective production candidates at evaluation bar E.",
  READY_REFERENCES:
    "Candidates with prospective reference bundle readyForFurtherEvaluation at E.",
  TRADE_EVAL_PASSED:
    "Candidates with tradeEvaluation.status PASSED at snapshot time (conditional performance).",
  DISPLAY_PICK:
    "Single display-ranked prospective candidate per symbol at E (scanner-shaped).",
} as const;

export type HistoricalMeasurementCohort =
  keyof typeof HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS;

export const HISTORICAL_MEASUREMENT_COHORTS: readonly HistoricalMeasurementCohort[] =
  Object.keys(HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS) as HistoricalMeasurementCohort[];

export interface HistoricalMeasurementSnapshotIdInput {
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  prospectiveSetupId: string;
}

/**
 * Deterministic snapshot identity: same inputs → same id (no clock, random, or network).
 */
export function buildHistoricalMeasurementSnapshotId(
  input: HistoricalMeasurementSnapshotIdInput
): string {
  const evaluationBarIndex = Math.floor(input.evaluationBarIndex);
  return `${input.symbol}:${input.timeframe}:${evaluationBarIndex}:${input.prospectiveSetupId}`;
}

export function isHistoricalMeasurementCohort(
  value: unknown
): value is HistoricalMeasurementCohort {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      HISTORICAL_MEASUREMENT_COHORT_DEFINITIONS,
      value
    )
  );
}
