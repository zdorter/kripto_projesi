import { buildHistoricalCandidateMeasurementsAtEvaluationBar } from "./historical-candidate-cohort";
import { composeProductionCandidateRowsForSymbol } from "./production-wave-scanner";
import type { HistoricalBacktestReport } from "./historical-backtest-types";
import { classifyHistoricalPositionOutcomePolicy } from "./historical-position-outcome-policy";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP } from "./historical-position-outcome-policy-contract";
import {
  buildHistoricalPositionPathReplayInputFromArtifactEntry,
} from "./historical-position-path";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "./historical-position-outcome-statistics";
import {
  candleTouchesInvalidation,
  candleTouchesTarget,
  replayProspectiveSetupOutcome,
} from "./setup/prospective-setup-outcome-replay";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { measurementMatchesCohortFilter } from "./historical-measurement-statistics-filter";
import {
  HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION,
  type HistoricalBacktestAuditInput,
  type HistoricalBacktestAuditResult,
  type HistoricalBacktestDecisiveSample,
  type HistoricalBacktestValidationIssue,
  summarizeHistoricalBacktestCounts,
} from "./historical-backtest-validation-types";
import type { Candle } from "./types";

const MAX_DECISIVE_SAMPLES = 5;

function verifyDecisiveCandleSemantics(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  direction: "BULLISH" | "BEARISH" | null,
  targetPrice: number | null,
  invalidationPrice: number | null,
  resolutionBarIndex: number | null,
  candles: readonly Candle[]
): string | null {
  if (direction !== "BULLISH" && direction !== "BEARISH") {
    return outcome === "INSUFFICIENT_CONTEXT" ? null : "missing direction";
  }
  if (targetPrice === null || invalidationPrice === null) {
    return outcome === "INSUFFICIENT_CONTEXT" ? null : "missing references";
  }
  if (resolutionBarIndex === null) {
    if (outcome === "NO_TOUCH" || outcome === "NO_FUTURE_DATA") {
      return null;
    }
    return "missing resolution bar";
  }
  const candle = candles[resolutionBarIndex];
  if (!candle) {
    return "resolution candle missing";
  }
  const targetHit = candleTouchesTarget(direction, candle, targetPrice);
  const invHit = candleTouchesInvalidation(direction, candle, invalidationPrice);
  switch (outcome) {
    case "TARGET_TOUCHED":
      return targetHit && !invHit ? null : "TARGET_TOUCHED candle semantics failed";
    case "INVALIDATION_TOUCHED":
      return invHit && !targetHit ? null : "INVALIDATION_TOUCHED candle semantics failed";
    case "AMBIGUOUS":
      return targetHit && invHit ? null : "AMBIGUOUS requires dual touch";
    case "NO_TOUCH":
      return !targetHit && !invHit ? null : "NO_TOUCH should have no touch on scan end";
    default:
      return null;
  }
}

function buildSample(
  snapshotId: string,
  evaluationBarIndex: number,
  prospectiveSetupId: string,
  pathResult: ReturnType<
    typeof pairHistoricalPositionOutcomeObservationsWithBatch
  >[0]["pathResult"],
  policyClassification: string,
  candles: readonly Candle[]
): HistoricalBacktestDecisiveSample {
  const idx = pathResult.resolutionBarIndex;
  const candle = idx === null ? null : candles[idx];
  return {
    snapshotId,
    evaluationBarIndex,
    prospectiveSetupId,
    direction: pathResult.direction,
    pathOutcome: pathResult.outcome,
    policyClassification,
    resolutionBarIndex: pathResult.resolutionBarIndex,
    barsAfterEvaluation: pathResult.barsAfterEvaluation,
    targetReferencePrice: pathResult.targetReferencePrice,
    invalidationReferencePrice: pathResult.invalidationReferencePrice,
    decisiveCandleHigh: candle?.high ?? null,
    decisiveCandleLow: candle?.low ?? null,
  };
}

/**
 * B-10g: audit B-10f report against B-6 candle semantics and B-10d/10e invariants.
 * Does not rerun compose or mutate inputs.
 */
export function auditHistoricalBacktestReport(
  input: HistoricalBacktestAuditInput
): HistoricalBacktestAuditResult {
  const { report, candles } = input;
  const issues: HistoricalBacktestValidationIssue[] = [];
  const winSamples: HistoricalBacktestDecisiveSample[] = [];
  const lossSamples: HistoricalBacktestDecisiveSample[] = [];
  const ambiguousSamples: HistoricalBacktestDecisiveSample[] = [];

  const counts = report.outcomeStatistics.overall.counts;
  const rate = report.outcomeStatistics.overall.rates.winRate_decisive;

  if (counts.wins !== counts.favorableResolutions) {
    issues.push({
      code: "WIN_RATE_ARITHMETIC",
      snapshotId: "*",
      message: "wins must equal favorableResolutions",
    });
  }
  if (counts.losses !== counts.adverseResolutions) {
    issues.push({
      code: "WIN_RATE_ARITHMETIC",
      snapshotId: "*",
      message: "losses must equal adverseResolutions",
    });
  }
  if (
    counts.decisiveResolutions !==
    counts.favorableResolutions + counts.adverseResolutions
  ) {
    issues.push({
      code: "DENOMINATOR_INVARIANT",
      snapshotId: "*",
      message: "decisiveResolutions invariant failed",
    });
  }
  if (counts.measuredPaths + counts.unmeasuredPaths !== counts.totalSnapshots) {
    issues.push({
      code: "DENOMINATOR_INVARIANT",
      snapshotId: "*",
      message: "filteredSnapshots partition failed",
    });
  }
  const expectedRate =
    counts.decisiveResolutions === 0
      ? null
      : counts.wins / counts.decisiveResolutions;
  if (rate.value !== expectedRate || rate.numerator !== counts.wins) {
    issues.push({
      code: "WIN_RATE_ARITHMETIC",
      snapshotId: "*",
      message: "winRate_decisive mismatch",
    });
  }

  const observations = report.configuration.rangeError === null
    ? pairHistoricalPositionOutcomeObservationsWithBatch(
        report.artifact,
        report.pathBatch
      )
    : [];

  let ambiguousCount = 0;
  let noFutureCount = 0;
  let insufficientCount = 0;

  for (const observation of observations) {
    const { entry, pathResult } = observation;
    const { classification } = classifyHistoricalPositionOutcomePolicy(
      pathResult,
      report.configuration.policyId
    );
    const expectedPolicy =
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP[
        pathResult.outcome
      ];
    if (classification !== expectedPolicy) {
      issues.push({
        code: "POLICY_CLASSIFICATION_MISMATCH",
        snapshotId: entry.snapshotId,
        message: `policy ${classification} != expected ${expectedPolicy}`,
      });
    }

    const replayInput = buildHistoricalPositionPathReplayInputFromArtifactEntry(
      entry,
      candles,
      report.configuration.horizonBars
    );
    if (replayInput) {
      const replay = replayProspectiveSetupOutcome(replayInput);
      if (replay.outcome !== pathResult.outcome) {
        issues.push({
          code: "B6_REPLAY_PATH_MISMATCH",
          snapshotId: entry.snapshotId,
          message: `replay ${replay.outcome} != path ${pathResult.outcome}`,
        });
      }
    }

    const candleIssue = verifyDecisiveCandleSemantics(
      pathResult.outcome,
      pathResult.direction,
      pathResult.targetReferencePrice,
      pathResult.invalidationReferencePrice,
      pathResult.resolutionBarIndex,
      candles
    );
    if (candleIssue) {
      issues.push({
        code: "DECISIVE_CANDLE_SEMANTICS",
        snapshotId: entry.snapshotId,
        message: candleIssue,
      });
    }

    if (pathResult.outcome === "AMBIGUOUS") {
      ambiguousCount += 1;
      if (ambiguousSamples.length < MAX_DECISIVE_SAMPLES) {
        ambiguousSamples.push(
          buildSample(
            entry.snapshotId,
            entry.evaluationBarIndex,
            entry.prospectiveSetupId,
            pathResult,
            classification,
            candles
          )
        );
      }
    }
    if (pathResult.outcome === "NO_FUTURE_DATA") {
      noFutureCount += 1;
    }
    if (pathResult.outcome === "INSUFFICIENT_CONTEXT") {
      insufficientCount += 1;
    }
    if (
      pathResult.outcome === "TARGET_TOUCHED" &&
      winSamples.length < MAX_DECISIVE_SAMPLES
    ) {
      winSamples.push(
        buildSample(
          entry.snapshotId,
          entry.evaluationBarIndex,
          entry.prospectiveSetupId,
          pathResult,
          classification,
          candles
        )
      );
    }
    if (
      pathResult.outcome === "INVALIDATION_TOUCHED" &&
      lossSamples.length < MAX_DECISIVE_SAMPLES
    ) {
      lossSamples.push(
        buildSample(
          entry.snapshotId,
          entry.evaluationBarIndex,
          entry.prospectiveSetupId,
          pathResult,
          classification,
          candles
        )
      );
    }
  }

  const summary = summarizeHistoricalBacktestCounts(counts, rate.value);
  summary.ambiguousSamplesFound = ambiguousCount;
  summary.noFutureDataSamplesFound = noFutureCount;
  summary.insufficientContextSamplesFound = insufficientCount;

  return {
    validationSchemaVersion: HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION,
    summary,
    issues,
    winSamples,
    lossSamples,
    ambiguousSamples,
    naturalAmbiguousFixtureFound: ambiguousCount > 0,
  };
}

/** Candidate count at E vs artifact entries (B-8e expansion audit). */
export function auditHistoricalBacktestCandidateExpansionAtBar(input: {
  report: HistoricalBacktestReport;
  candles: readonly Candle[];
  evaluationBarIndex: number;
  engineOptions?: import("./types").WaveEngineOptions;
}): { productionCandidates: number; artifactEntriesAtE: number } {
  const { report, candles, evaluationBarIndex } = input;
  const rows = composeProductionCandidateRowsForSymbol({
    symbol: report.configuration.symbol,
    candles: [...candles],
    timeframeId: report.configuration.timeframeId,
    engineOptions: input.engineOptions,
    composeOptions: { evaluationBarIndex },
  });
  const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar({
    symbol: report.configuration.symbol,
    timeframeId: report.configuration.timeframeId,
    candles: [...candles],
    evaluationBarIndex,
    engineOptions: input.engineOptions,
    horizonBars: report.configuration.horizonBars,
  });
  const artifactEntriesAtE = report.artifact.measurements.filter(
    (m) => m.evaluationBarIndex === evaluationBarIndex
  ).length;
  return {
    productionCandidates: rows.length,
    artifactEntriesAtE,
  };
}

export function auditHistoricalBacktestCohortFilterOrSemantics(
  report: HistoricalBacktestReport,
  candles: readonly Candle[]
): boolean {
  const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
    report.artifact,
    report.pathBatch
  );
  const filter = { cohorts: ["DISPLAY_PICK", "READY_REFERENCES"] as const };
  const filtered = observations.filter((o) =>
    measurementMatchesCohortFilter(o.entry, {
      cohorts: [...filter.cohorts],
    })
  );
  return (
    filtered.length <= observations.length &&
    report.outcomeStatistics.overall.counts.totalSnapshots === observations.length
  );
}

export function auditHistoricalMeasurementRrBucketBoundaries(): Record<
  string,
  string
> {
  return {
    "0.9": classifyHistoricalMeasurementRrBucketRow(0.9),
    "1.0": classifyHistoricalMeasurementRrBucketRow(1.0),
    "1.49": classifyHistoricalMeasurementRrBucketRow(1.49),
    "1.5": classifyHistoricalMeasurementRrBucketRow(1.5),
    "1.99": classifyHistoricalMeasurementRrBucketRow(1.99),
    "2.0": classifyHistoricalMeasurementRrBucketRow(2.0),
    "2.99": classifyHistoricalMeasurementRrBucketRow(2.99),
    "3.0": classifyHistoricalMeasurementRrBucketRow(3.0),
    null: classifyHistoricalMeasurementRrBucketRow(null),
  };
}
