import { buildHistoricalCandidateMeasurementsAtEvaluationBar } from "./historical-candidate-cohort";
import type { HistoricalBacktestReport } from "./historical-backtest-types";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "./historical-position-outcome-statistics";
import {
  candleTouchesInvalidation,
  candleTouchesTarget,
} from "./setup/prospective-setup-outcome-replay";
import type { Candle, WaveEngineOptions } from "./types";

export interface RealHistoricalFirstDecisiveAuditIssue {
  snapshotId: string;
  message: string;
}

export interface RealHistoricalLookaheadAuditIssue {
  evaluationBarIndex: number;
  snapshotId: string;
  field: string;
  message: string;
}

function cloneCandles(candles: readonly Candle[]): Candle[] {
  return candles.map((c) => ({ ...c }));
}

function mutateCandlesAfterEvaluation(
  candles: Candle[],
  evaluationBarIndex: number
): void {
  for (let i = evaluationBarIndex + 1; i < candles.length; i++) {
    candles[i] = {
      time: candles[i].time,
      open: 9_999_999,
      high: 9_999_999,
      low: 0.000_001,
      close: 9_999_999,
      volume: candles[i].volume,
    };
  }
}

/**
 * Ensures resolution bar is the first post-E bar with target/invalidation touch semantics.
 */
export function auditRealHistoricalFirstDecisiveEvents(input: {
  report: HistoricalBacktestReport;
  candles: readonly Candle[];
}): RealHistoricalFirstDecisiveAuditIssue[] {
  const issues: RealHistoricalFirstDecisiveAuditIssue[] = [];
  const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
    input.report.artifact,
    input.report.pathBatch
  );

  for (const { entry, pathResult } of observations) {
    const direction = pathResult.direction;
    const target = pathResult.targetReferencePrice;
    const invalidation = pathResult.invalidationReferencePrice;
    const e = pathResult.evaluationBarIndex;
    if (
      e === null ||
      (direction !== "BULLISH" && direction !== "BEARISH") ||
      target === null ||
      invalidation === null
    ) {
      continue;
    }
    const horizon = pathResult.horizonBars;
    const end = Math.min(input.candles.length - 1, e + horizon);
    let firstTarget: number | null = null;
    let firstInv: number | null = null;
    for (let i = e + 1; i <= end; i++) {
      const candle = input.candles[i];
      if (candleTouchesTarget(direction, candle, target) && firstTarget === null) {
        firstTarget = i;
      }
      if (
        candleTouchesInvalidation(direction, candle, invalidation) &&
        firstInv === null
      ) {
        firstInv = i;
      }
    }

    const resolution = pathResult.resolutionBarIndex;
    switch (pathResult.outcome) {
      case "TARGET_TOUCHED":
        if (firstTarget !== resolution) {
          issues.push({
            snapshotId: entry.snapshotId,
            message: `TARGET_TOUCHED resolution ${resolution} != first target ${firstTarget}`,
          });
        }
        break;
      case "INVALIDATION_TOUCHED":
        if (firstInv !== resolution) {
          issues.push({
            snapshotId: entry.snapshotId,
            message: `INVALIDATION_TOUCHED resolution ${resolution} != first inv ${firstInv}`,
          });
        }
        break;
      case "AMBIGUOUS":
        if (firstTarget === null || firstInv === null || firstTarget !== firstInv) {
          issues.push({
            snapshotId: entry.snapshotId,
            message: "AMBIGUOUS requires same-bar dual touch as first event",
          });
        } else if (resolution !== firstTarget) {
          issues.push({
            snapshotId: entry.snapshotId,
            message: `AMBIGUOUS resolution ${resolution} != dual-touch bar ${firstTarget}`,
          });
        }
        break;
      case "NO_TOUCH":
        if (firstTarget !== null || firstInv !== null) {
          issues.push({
            snapshotId: entry.snapshotId,
            message: "NO_TOUCH but touch found inside horizon",
          });
        }
        break;
      default:
        break;
    }
  }
  return issues;
}

/**
 * Mutates only candles after E; evaluation snapshot fields on artifact entries must match.
 */
export function auditRealHistoricalEvaluationLookahead(input: {
  report: HistoricalBacktestReport;
  candles: readonly Candle[];
  evaluationBarIndices: readonly number[];
  engineOptions?: WaveEngineOptions;
}): RealHistoricalLookaheadAuditIssue[] {
  const issues: RealHistoricalLookaheadAuditIssue[] = [];
  const { report, candles, evaluationBarIndices, engineOptions } = input;
  const symbol = report.configuration.symbol;
  const timeframeId = report.configuration.timeframeId;

  for (const e of evaluationBarIndices) {
    const entriesAtE = report.artifact.measurements.filter(
      (m) => m.evaluationBarIndex === e
    );
    if (!entriesAtE.length) {
      continue;
    }
    const mutated = cloneCandles(candles);
    mutateCandlesAfterEvaluation(mutated, e);
    const rebuilt = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      symbol,
      timeframeId,
      candles: mutated,
      evaluationBarIndex: e,
      engineOptions,
      horizonBars: report.configuration.horizonBars,
    });

    for (const entry of entriesAtE) {
      const match = rebuilt.find(
        (b) => b.measurement.prospectiveSetupId === entry.prospectiveSetupId
      );
      if (!match) {
        issues.push({
          evaluationBarIndex: e,
          snapshotId: entry.snapshotId,
          field: "prospectiveSetupId",
          message: "candidate missing after future mutation",
        });
        continue;
      }
      const expectedEval = entry.evaluation;
      const actualEval = match.measurement.evaluation;
      const checks: Array<[string, unknown, unknown]> = [
        [
          "references.entry.referencePrice",
          expectedEval.references.entry.referencePrice,
          actualEval.references.entry.referencePrice,
        ],
        [
          "references.target.referencePrice",
          expectedEval.references.target.referencePrice,
          actualEval.references.target.referencePrice,
        ],
        [
          "references.stop.referencePrice",
          expectedEval.references.stop.referencePrice,
          actualEval.references.stop.referencePrice,
        ],
        [
          "tradeEvaluation.status",
          expectedEval.tradeEvaluation.status,
          actualEval.tradeEvaluation.status,
        ],
        [
          "production.observedDirection",
          expectedEval.production?.observedDirection,
          actualEval.production?.observedDirection,
        ],
      ];
      for (const [field, expected, actual] of checks) {
        if (expected !== actual) {
          issues.push({
            evaluationBarIndex: e,
            snapshotId: entry.snapshotId,
            field,
            message: `expected ${String(expected)} got ${String(actual)}`,
          });
        }
      }
    }
  }

  return issues;
}
