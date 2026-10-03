import type { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "./historical-measurement-contract";
import type { HistoricalMeasurementCohort } from "./historical-measurement-contract";
import type {
  HistoricalMeasurementEvaluationSnapshot,
  HistoricalMeasurementOutcomeAttachment,
} from "./historical-measurement-types";

/** Deterministic dataset descriptor (no clock or network fields). */
export interface HistoricalMeasurementArtifactDataset {
  symbol: string;
  timeframe: string;
  candleCount: number;
  startEvaluationBar: number | null;
  endEvaluationBar: number | null;
  horizonBars: number;
  rangeError:
    | "EMPTY_CANDLES"
    | "INVALID_EVALUATION_BAR"
    | "START_EVALUATION_BAR_OUT_OF_RANGE"
    | "END_EVALUATION_BAR_OUT_OF_RANGE"
    | "START_AFTER_END"
    | null;
}

/**
 * One historical observation row in the artifact envelope.
 * `cohorts` is authoritative for cohort membership (B-8e overlap allowed).
 * `cohort` mirrors the B-8d assembly storage tag on the source record (non-authoritative).
 */
export interface HistoricalMeasurementArtifactEntry {
  schemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  snapshotId: string;
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  evaluationBarTime: number | null;
  prospectiveSetupId: string;
  horizonBars: number;
  cohorts: readonly HistoricalMeasurementCohort[];
  cohort: HistoricalMeasurementCohort;
  evaluation: HistoricalMeasurementEvaluationSnapshot;
  outcome: HistoricalMeasurementOutcomeAttachment | null;
}

/**
 * Versioned historical measurement JSON artifact (serialization envelope only).
 */
export interface HistoricalMeasurementArtifact {
  schemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  dataset: HistoricalMeasurementArtifactDataset;
  measurements: HistoricalMeasurementArtifactEntry[];
}
