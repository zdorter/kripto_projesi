import type { Candle, WaveEngineOptions } from "./types";
import {
  buildHistoricalMeasurementRecord,
  type BuildHistoricalMeasurementRecordInput,
} from "./historical-measurement-assembly";
import {
  composeProductionCandidateRowsForSymbol,
  composeProductionWaveScannerForSymbol,
  resolveProductionCompositionAtEvaluationBar,
  selectDisplayProspectiveCandidate,
  type ProductionWaveScannerSymbolInput,
} from "./production-wave-scanner";
import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalCandidateMeasurementBundle } from "./setup/historical-measurement-types";
import type { ProspectiveReferenceEvaluation } from "./setup/prospective-reference-evaluation";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

const COHORT_ORDER: HistoricalMeasurementCohort[] = [
  "ALL_PRODUCTION_CANDIDATES",
  "READY_REFERENCES",
  "TRADE_EVAL_PASSED",
  "DISPLAY_PICK",
];

function sortCohorts(
  cohorts: HistoricalMeasurementCohort[]
): HistoricalMeasurementCohort[] {
  const set = new Set(cohorts);
  return COHORT_ORDER.filter((c) => set.has(c));
}

/**
 * Derives applicable B-8a cohort tags for one production candidate at E.
 * Cohorts may overlap; not mutually exclusive.
 */
export function resolveHistoricalMeasurementCohorts(input: {
  references: ProspectiveReferenceEvaluation;
  tradeEvaluationStatus: TradeEvaluationStatus;
  isDisplayPick: boolean;
}): HistoricalMeasurementCohort[] {
  const cohorts: HistoricalMeasurementCohort[] = [
    "ALL_PRODUCTION_CANDIDATES",
  ];
  if (input.references.readyForFurtherEvaluation) {
    cohorts.push("READY_REFERENCES");
  }
  if (input.tradeEvaluationStatus === "PASSED") {
    cohorts.push("TRADE_EVAL_PASSED");
  }
  if (input.isDisplayPick) {
    cohorts.push("DISPLAY_PICK");
  }
  return sortCohorts(cohorts);
}

export function cohortsMatchingFilter(
  cohorts: readonly HistoricalMeasurementCohort[],
  filter: HistoricalMeasurementCohort
): boolean {
  return cohorts.includes(filter);
}

export interface BuildHistoricalCandidateMeasurementsInput {
  symbol: string;
  timeframeId: string;
  candles: Candle[];
  evaluationBarIndex: number;
  engineOptions?: WaveEngineOptions;
  horizonBars?: number;
}

/**
 * Expands production candidates at E into measurement bundles (one snapshotId per candidate).
 */
export function buildHistoricalCandidateMeasurementsAtEvaluationBar(
  input: BuildHistoricalCandidateMeasurementsInput
): HistoricalCandidateMeasurementBundle[] {
  const symbolInput: ProductionWaveScannerSymbolInput = {
    symbol: input.symbol,
    candles: input.candles,
    timeframeId: input.timeframeId,
    engineOptions: input.engineOptions,
    composeOptions: { evaluationBarIndex: input.evaluationBarIndex },
  };

  const resolved = resolveProductionCompositionAtEvaluationBar(symbolInput);
  if (resolved.kind === "failure" || resolved.candidates.length === 0) {
    return [];
  }

  const displayPick = selectDisplayProspectiveCandidate(resolved.candidates);
  const displayPickId = displayPick?.production.id ?? null;

  const bundles: HistoricalCandidateMeasurementBundle[] = [];
  for (const candidate of resolved.candidates) {
    const composed = {
      symbol: resolved.symbol,
      timeframe: resolved.timeframeId,
      loadError: null,
      historicalSetup: candidate.historicalSetup,
      production: candidate.production,
      references: candidate.references,
      evaluationBarTime: resolved.evaluationBarTime,
      evaluationBarIndex: resolved.evaluationBarIndex,
      candleCount: resolved.candleCount,
    };

    const buildInput: BuildHistoricalMeasurementRecordInput = {
      composed,
      candles: input.candles,
      horizonBars: input.horizonBars,
      cohort: "ALL_PRODUCTION_CANDIDATES",
    };
    const measurement = buildHistoricalMeasurementRecord(buildInput);
    if (!measurement) {
      continue;
    }

    const cohorts = resolveHistoricalMeasurementCohorts({
      references: candidate.references,
      tradeEvaluationStatus: measurement.evaluation.tradeEvaluation.status,
      isDisplayPick: candidate.production.id === displayPickId,
    });

    bundles.push({ measurement, cohorts });
  }

  return bundles;
}

/** DISPLAY_PICK composed row matches legacy composeProductionWaveScannerForSymbol. */
export function buildDisplayPickHistoricalCandidateMeasurement(
  input: BuildHistoricalCandidateMeasurementsInput
): HistoricalCandidateMeasurementBundle | null {
  const symbolInput: ProductionWaveScannerSymbolInput = {
    symbol: input.symbol,
    candles: input.candles,
    timeframeId: input.timeframeId,
    engineOptions: input.engineOptions,
    composeOptions: { evaluationBarIndex: input.evaluationBarIndex },
  };
  const composed = composeProductionWaveScannerForSymbol(symbolInput);
  const measurement = buildHistoricalMeasurementRecord({
    composed,
    candles: input.candles,
    horizonBars: input.horizonBars,
    cohort: "DISPLAY_PICK",
  });
  if (!measurement) {
    return null;
  }
  const cohorts = resolveHistoricalMeasurementCohorts({
    references: composed.references,
    tradeEvaluationStatus: measurement.evaluation.tradeEvaluation.status,
    isDisplayPick: true,
  });
  return { measurement, cohorts };
}

/** Candidate count at E from existing production pipeline (no new detection). */
export function countProductionCandidatesAtEvaluationBar(
  input: BuildHistoricalCandidateMeasurementsInput
): number {
  return composeProductionCandidateRowsForSymbol({
    symbol: input.symbol,
    candles: input.candles,
    timeframeId: input.timeframeId,
    engineOptions: input.engineOptions,
    composeOptions: { evaluationBarIndex: input.evaluationBarIndex },
  }).length;
}
