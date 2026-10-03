import type { Candle } from "./types";
import { resolveHistoricalAsOfEvalLiveMarketPrice } from "./historical-production-compose-policy";
import type { HistoricalProductionWalkForwardInput } from "./historical-production-walk-forward";
import { runHistoricalProductionWalkForward } from "./historical-production-walk-forward";
import type { ProductionWaveScannerComposedRow } from "./wave-scanner-presentation";
import {
  HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
  buildHistoricalMeasurementSnapshotId,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementRecord } from "./setup/historical-measurement-types";
import { buildProspectiveSetupOutcomeReplayInput } from "./setup/prospective-setup-outcome-replay-input";
import { replayProspectiveSetupOutcome } from "./setup/prospective-setup-outcome-replay";
import { resolveProspectiveStructuralInvalidation } from "./setup/prospective-structural-invalidation";
import { evaluateTradeEvaluation } from "./setup/trade-evaluation";

export function futureBarsAvailableAfterEvaluationBar(
  evaluationBarIndex: number,
  candleCount: number
): number {
  if (candleCount <= 0 || evaluationBarIndex < 0) {
    return 0;
  }
  return Math.max(0, candleCount - 1 - evaluationBarIndex);
}

function buildTradeEvaluationFromComposedRow(
  composed: ProductionWaveScannerComposedRow
) {
  const setup = composed.historicalSetup;
  const production = composed.production;
  const entryReference = composed.references.entry.referencePrice;
  const liveMarketPrice = resolveHistoricalAsOfEvalLiveMarketPrice(entryReference);
  const structuralInv = setup
    ? resolveProspectiveStructuralInvalidation(setup)
    : { triggered: false, invalidationPrice: null as number | null };
  const observedDir = production?.observedDirection;
  return evaluateTradeEvaluation({
    direction:
      observedDir === "BULLISH" ||
      observedDir === "BEARISH" ||
      observedDir === "UNRESOLVED"
        ? observedDir
        : null,
    entryReferencePrice: entryReference,
    liveMarketPrice,
    stopReferencePrice: composed.references.stop.referencePrice,
    targetReferencePrice: composed.references.target.referencePrice,
    structuralInvalidationReferencePrice: structuralInv.invalidationPrice,
    setupLifecycleStatus: setup?.status ?? null,
    structuralInvalidationTriggered:
      structuralInv.triggered || setup?.status === "INVALID",
    evaluationBarIndex: composed.evaluationBarIndex,
    evaluationPrice: entryReference,
    futureSafe: production?.futureSafe ?? false,
  });
}

export interface BuildHistoricalMeasurementRecordInput {
  composed: ProductionWaveScannerComposedRow;
  candles: Candle[];
  horizonBars?: number;
  /** Cohort is assigned by the caller (B-8e); not inferred in assembly. */
  cohort: HistoricalMeasurementCohort;
}

/**
 * Assembles evaluation (from B-8b composed row) and outcome (B-7a mapper + B-6 replay).
 */
export function buildHistoricalMeasurementRecord(
  input: BuildHistoricalMeasurementRecordInput
): HistoricalMeasurementRecord | null {
  const { composed, candles, cohort } = input;
  const horizonBars =
    input.horizonBars ?? HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS;

  if (
    composed.evaluationBarIndex === null ||
    composed.evaluationBarIndex < 0 ||
    !composed.production
  ) {
    return null;
  }

  const evaluationBarIndex = composed.evaluationBarIndex;
  const prospectiveSetupId = composed.production.id;
  const tradeEvaluation = buildTradeEvaluationFromComposedRow(composed);

  const replayInput = buildProspectiveSetupOutcomeReplayInput(
    composed,
    candles,
    { horizonBars }
  );

  let outcome: HistoricalMeasurementRecord["outcome"] = null;
  if (replayInput) {
    const futureBarsAvailable = futureBarsAvailableAfterEvaluationBar(
      evaluationBarIndex,
      candles.length
    );
    const replay = replayProspectiveSetupOutcome(replayInput);
    outcome = { replay, futureBarsAvailable };
  }

  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    snapshotId: buildHistoricalMeasurementSnapshotId({
      symbol: composed.symbol,
      timeframe: composed.timeframe,
      evaluationBarIndex,
      prospectiveSetupId,
    }),
    symbol: composed.symbol,
    timeframe: composed.timeframe,
    evaluationBarIndex,
    evaluationBarTime: composed.evaluationBarTime,
    prospectiveSetupId,
    cohort,
    horizonBars,
    evaluation: {
      historicalSetup: composed.historicalSetup,
      production: composed.production,
      references: composed.references,
      tradeEvaluation,
    },
    outcome,
  };
}

export interface HistoricalMeasurementWalkForwardInput
  extends HistoricalProductionWalkForwardInput {
  horizonBars?: number;
  cohort: HistoricalMeasurementCohort;
}

export interface HistoricalMeasurementWalkForwardResult {
  schemaVersion: typeof HISTORICAL_MEASUREMENT_SCHEMA_VERSION;
  symbol: string;
  timeframeId: string;
  candleCount: number;
  startEvaluationBar: number | null;
  endEvaluationBar: number | null;
  rangeError: ReturnType<
    typeof runHistoricalProductionWalkForward
  >["rangeError"];
  records: HistoricalMeasurementRecord[];
}

/**
 * B-8c walk-forward + B-8d assembly per row. No statistics or persistence.
 */
export function runHistoricalMeasurementWalkForward(
  input: HistoricalMeasurementWalkForwardInput
): HistoricalMeasurementWalkForwardResult {
  const walk = runHistoricalProductionWalkForward(input);
  const records: HistoricalMeasurementRecord[] = [];
  for (const row of walk.rows) {
    const record = buildHistoricalMeasurementRecord({
      composed: row.composed,
      candles: input.candles,
      horizonBars: input.horizonBars,
      cohort: input.cohort,
    });
    if (record) {
      records.push(record);
    }
  }
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    symbol: walk.symbol,
    timeframeId: walk.timeframeId,
    candleCount: walk.candleCount,
    startEvaluationBar: walk.startEvaluationBar,
    endEvaluationBar: walk.endEvaluationBar,
    rangeError: walk.rangeError,
    records,
  };
}
