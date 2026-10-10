import type { HISTORICAL_POSITION_PATH_SCHEMA_VERSION } from "./historical-position-path-contract";
import type { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "./historical-position-path-contract";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { Candle } from "./types";

export interface ResolveHistoricalPositionPathV1Input {
  entry: HistoricalMeasurementArtifactEntry;
  candles: readonly Candle[];
  horizonBars?: number;
}

export interface HistoricalPositionPathResult {
  schemaVersion: typeof HISTORICAL_POSITION_PATH_SCHEMA_VERSION;
  positionModelId: typeof HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1;
  snapshotId: string;
  outcome: ProspectiveSetupOutcomeReplayStatus;
  /** Parity trace against B-6 replay for the wired input. */
  b6ReplayOutcome: ProspectiveSetupOutcomeReplayStatus;
  evaluationBarIndex: number | null;
  horizonBars: number;
  futureBarsAvailable: number;
  resolutionBarIndex: number | null;
  barsAfterEvaluation: number | null;
  targetTouched: boolean;
  invalidationTouched: boolean;
  direction: "BULLISH" | "BEARISH" | null;
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  limitations: readonly string[];
}
