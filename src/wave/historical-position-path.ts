import { futureBarsAvailableAfterEvaluationBar } from "./historical-measurement-assembly";
import {
  HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
  HISTORICAL_POSITION_PATH_REFERENCE_V1_LIMITATIONS,
  HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
} from "./historical-position-path-contract";
import type {
  HistoricalPositionPathResult,
  ResolveHistoricalPositionPathV1Input,
} from "./historical-position-path-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS } from "./setup/prospective-setup-outcome-replay-contract";
import { replayProspectiveSetupOutcome } from "./setup/prospective-setup-outcome-replay";
import type { ProspectiveSetupOutcomeReplayInput } from "./setup/prospective-setup-outcome-replay-types";
import type { ProspectiveSetupOutcomeReplayResult } from "./setup/prospective-setup-outcome-replay-types";
import { resolveProspectiveStructuralInvalidation } from "./setup/prospective-structural-invalidation";
import type { Candle } from "./types";

/**
 * Maps a frozen B-8 artifact entry to B-6 replay input (same wiring as
 * `buildProspectiveSetupOutcomeReplayInput`, without re-composing).
 */
export function buildHistoricalPositionPathReplayInputFromArtifactEntry(
  entry: HistoricalMeasurementArtifactEntry,
  candles: readonly Candle[],
  horizonBars?: number
): ProspectiveSetupOutcomeReplayInput | null {
  if (!candles.length) {
    return null;
  }
  const { historicalSetup, production, references } = entry.evaluation;
  if (!production || !historicalSetup) {
    return null;
  }
  if (entry.evaluationBarIndex < 0) {
    return null;
  }

  const structuralInv = resolveProspectiveStructuralInvalidation(
    historicalSetup
  );
  const observed = production.observedDirection;

  return {
    direction:
      observed === "BULLISH" ||
      observed === "BEARISH" ||
      observed === "UNRESOLVED"
        ? observed
        : null,
    entryReferencePrice: references.entry.referencePrice,
    targetReferencePrice: references.target.referencePrice,
    invalidationReferencePrice: structuralInv.invalidationPrice,
    evaluationBarIndex: entry.evaluationBarIndex,
    candles,
    horizonBars:
      horizonBars ??
      entry.horizonBars ??
      PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS,
    prospectiveSetupId: entry.prospectiveSetupId,
  };
}

function insufficientContextResult(
  entry: HistoricalMeasurementArtifactEntry,
  horizonBars: number,
  futureBarsAvailable: number
): HistoricalPositionPathResult {
  return {
    schemaVersion: HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    snapshotId: entry.snapshotId,
    outcome: "INSUFFICIENT_CONTEXT",
    b6ReplayOutcome: "INSUFFICIENT_CONTEXT",
    evaluationBarIndex: entry.evaluationBarIndex,
    horizonBars,
    futureBarsAvailable,
    resolutionBarIndex: null,
    barsAfterEvaluation: null,
    targetTouched: false,
    invalidationTouched: false,
    direction: null,
    entryReferencePrice: entry.evaluation.references.entry.referencePrice,
    targetReferencePrice: entry.evaluation.references.target.referencePrice,
    invalidationReferencePrice: null,
    limitations: HISTORICAL_POSITION_PATH_REFERENCE_V1_LIMITATIONS,
  };
}

function mapReplayToPositionPathResult(
  entry: HistoricalMeasurementArtifactEntry,
  replay: ProspectiveSetupOutcomeReplayResult,
  futureBarsAvailable: number,
  replayInput: ProspectiveSetupOutcomeReplayInput
): HistoricalPositionPathResult {
  return {
    schemaVersion: HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    snapshotId: entry.snapshotId,
    outcome: replay.outcome,
    b6ReplayOutcome: replay.outcome,
    evaluationBarIndex: replay.evaluationBarIndex,
    horizonBars: replay.horizonBars,
    futureBarsAvailable,
    resolutionBarIndex: replay.resolutionBarIndex,
    barsAfterEvaluation: replay.barsAfterEvaluation,
    targetTouched: replay.targetTouched,
    invalidationTouched: replay.invalidationTouched,
    direction: replay.direction,
    entryReferencePrice: replayInput.entryReferencePrice,
    targetReferencePrice: replay.targetPrice,
    invalidationReferencePrice: replay.invalidationPrice,
    limitations: HISTORICAL_POSITION_PATH_REFERENCE_V1_LIMITATIONS,
  };
}

/**
 * B-10a: deterministic reference path from frozen artifact entry + candles (B-6 parity).
 */
export function resolveHistoricalPositionPathV1(
  input: ResolveHistoricalPositionPathV1Input
): HistoricalPositionPathResult {
  const { entry, candles } = input;
  const horizonBars =
    input.horizonBars ??
    entry.horizonBars ??
    PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS;
  const futureBarsAvailable = futureBarsAvailableAfterEvaluationBar(
    entry.evaluationBarIndex,
    candles.length
  );

  const replayInput = buildHistoricalPositionPathReplayInputFromArtifactEntry(
    entry,
    candles,
    horizonBars
  );
  if (!replayInput) {
    return insufficientContextResult(entry, horizonBars, futureBarsAvailable);
  }

  const replay = replayProspectiveSetupOutcome(replayInput);
  return mapReplayToPositionPathResult(
    entry,
    replay,
    futureBarsAvailable,
    replayInput
  );
}
