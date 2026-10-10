import { buildHistoricalCandidateMeasurementsAtEvaluationBar } from "./historical-candidate-cohort";
import type { HistoricalBacktestReport } from "./historical-backtest-types";
import {
  aggregateHistoricalMeasurementRRStatistics,
} from "./historical-measurement-rr-statistics";
import {
  resolveHistoricalMeasurementRrBucketRow,
} from "./historical-measurement-rr-statistics";
import {
  resolveHistoricalPositionOutcomeDirectionSliceKey,
} from "./historical-position-outcome-statistics";
import {
  classifyHistoricalPositionOutcomePolicy,
} from "./historical-position-outcome-policy";
import {
  pairHistoricalPositionOutcomeObservationsWithBatch,
} from "./historical-position-outcome-statistics";
import { runHistoricalBacktest } from "./historical-backtest";
import { selectDisplayProspectiveCandidate } from "./production-wave-scanner";
import { composeProductionCandidateRowsForSymbol } from "./production-wave-scanner";
import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import { resolveHistoricalMeasurementSetupFamily } from "./historical-measurement-dimension-statistics";
import type { HistoricalPositionOutcomeStatisticsObservation } from "./historical-position-outcome-statistics-types";
import type { Candle, WaveEngineOptions } from "./types";
import {
  HISTORICAL_BACKTEST_ROBUSTNESS_AUDIT_SCHEMA_VERSION,
  type CandidateMultiplicityAudit,
  type CohortDecisiveComparison,
  type DisplayPickComparisonAudit,
  type HistoricalBacktestRobustnessAuditReport,
  type HorizonRobustnessRow,
  type LookaheadSelectionAuditResult,
  type PeriodStabilityRow,
  type RobustnessDecisiveSummary,
  type TemporalCorrelationAudit,
} from "./historical-backtest-robustness-audit-types";

const POPULATION_MODEL =
  "Each artifact row is one (evaluationBarIndex E, prospectiveSetupId) snapshot with frozen evaluation at E and path outcome over candles[E+1..E+H]. Cohorts overlap on the same snapshotId; they are not mutually exclusive populations.";

const SNAPSHOT_INDEPENDENCE =
  "Snapshots are not statistically independent trades: multiple candidates at the same E share identical future windows; the same source setup can persist across consecutive E; path outcomes are correlated across overlapping horizons.";

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

function summarizeObservations(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalBacktestReport["configuration"]["policyId"]
): RobustnessDecisiveSummary {
  const counts = {
    total: 0,
    measured: 0,
    unmeasured: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    unmeasuredNoFuture: 0,
    unmeasuredInsufficient: 0,
  };
  for (const { pathResult } of observations) {
    counts.total += 1;
    const { classification } = classifyHistoricalPositionOutcomePolicy(
      pathResult,
      policyId
    );
    switch (classification) {
      case "FAVORABLE_RESOLUTION":
        counts.wins += 1;
        counts.measured += 1;
        break;
      case "ADVERSE_RESOLUTION":
        counts.losses += 1;
        counts.measured += 1;
        break;
      case "INCONCLUSIVE_SAME_BAR":
        counts.inconclusive += 1;
        counts.measured += 1;
        break;
      case "UNRESOLVED_AT_HORIZON":
        counts.unresolved += 1;
        counts.measured += 1;
        break;
      case "UNMEASURED_NO_FUTURE":
        counts.unmeasuredNoFuture += 1;
        counts.unmeasured += 1;
        break;
      case "UNMEASURED_INSUFFICIENT":
        counts.unmeasuredInsufficient += 1;
        counts.unmeasured += 1;
        break;
      default:
        break;
    }
  }
  const decisive = counts.wins + counts.losses;
  return {
    totalSnapshots: counts.total,
    measuredPaths: counts.measured,
    unmeasuredPaths: counts.unmeasured,
    wins: counts.wins,
    losses: counts.losses,
    decisiveResolutions: decisive,
    winRate_decisive: decisive === 0 ? null : counts.wins / decisive,
    inconclusiveSameBar: counts.inconclusive,
    unresolvedAtHorizon: counts.unresolved,
    unmeasuredInsufficient: counts.unmeasuredInsufficient,
    unmeasuredNoFuture: counts.unmeasuredNoFuture,
  };
}

function auditCandidateMultiplicity(
  measurements: readonly HistoricalMeasurementArtifactEntry[]
): CandidateMultiplicityAudit {
  const perE = new Map<number, number>();
  for (const m of measurements) {
    perE.set(m.evaluationBarIndex, (perE.get(m.evaluationBarIndex) ?? 0) + 1);
  }
  const counts = [...perE.values()].sort((a, b) => a - b);
  const histogram: Record<string, number> = {};
  for (const c of counts) {
    const key = String(c);
    histogram[key] = (histogram[key] ?? 0) + 1;
  }
  const totalBars = counts.length;
  const sum = counts.reduce((a, b) => a + b, 0);
  const median =
    totalBars === 0
      ? 0
      : totalBars % 2 === 1
        ? counts[Math.floor(totalBars / 2)]
        : (counts[totalBars / 2 - 1] + counts[totalBars / 2]) / 2;

  return {
    evaluationBarsWithSnapshots: totalBars,
    totalSnapshots: measurements.length,
    averageCandidatesPerE: totalBars === 0 ? 0 : sum / totalBars,
    medianCandidatesPerE: median,
    minCandidatesPerE: totalBars === 0 ? 0 : counts[0],
    maxCandidatesPerE: totalBars === 0 ? 0 : counts[counts.length - 1],
    barsWithExactlyOneCandidate: counts.filter((c) => c === 1).length,
    barsWithMoreThanOneCandidate: counts.filter((c) => c > 1).length,
    candidateCountHistogram: histogram,
  };
}

function auditTemporalCorrelation(
  measurements: readonly HistoricalMeasurementArtifactEntry[]
): TemporalCorrelationAudit {
  const prospectiveMap = new Map<string, Set<number>>();
  const sourceMap = new Map<string, Set<number>>();

  for (const m of measurements) {
    prospectiveMap.set(
      m.prospectiveSetupId,
      (prospectiveMap.get(m.prospectiveSetupId) ?? new Set()).add(
        m.evaluationBarIndex
      )
    );
    const sourceId = m.evaluation.production?.sourceSetupId;
    if (sourceId) {
      sourceMap.set(
        sourceId,
        (sourceMap.get(sourceId) ?? new Set()).add(m.evaluationBarIndex)
      );
    }
  }

  let maxProspectiveSpan = 0;
  for (const set of prospectiveMap.values()) {
    maxProspectiveSpan = Math.max(maxProspectiveSpan, set.size);
  }
  let maxSourceSpan = 0;
  for (const set of sourceMap.values()) {
    maxSourceSpan = Math.max(maxSourceSpan, set.size);
  }

  const byE = new Map<number, HistoricalMeasurementArtifactEntry[]>();
  for (const m of measurements) {
    const list = byE.get(m.evaluationBarIndex) ?? [];
    list.push(m);
    byE.set(m.evaluationBarIndex, list);
  }
  const sortedE = [...byE.keys()].sort((a, b) => a - b);
  let maxRun = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const e of sortedE) {
    const rows = byE.get(e)!;
    const keys = new Set(
      rows.map(
        (r) =>
          `${resolveHistoricalMeasurementSetupFamily(r)}:${resolveHistoricalPositionOutcomeDirectionSliceKey(r)}`
      )
    );
    const key = [...keys].sort().join("|");
    if (key === prevKey && key.length > 0) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
      maxRun = Math.max(maxRun, run);
    }
    prevKey = key;
  }

  return {
    uniqueProspectiveSetupIds: prospectiveMap.size,
    prospectiveIdsSeenOnMultipleE: [...prospectiveMap.values()].filter(
      (s) => s.size > 1
    ).length,
    uniqueSourceSetupIds: sourceMap.size,
    sourceIdsSeenOnMultipleE: [...sourceMap.values()].filter((s) => s.size > 1)
      .length,
    maxEvaluationBarsForSingleSourceSetupId: maxSourceSpan,
    maxEvaluationBarsForSingleProspectiveSetupId: maxProspectiveSpan,
    maxConsecutiveEBarsSameFamilyDirection: maxRun,
  };
}

function auditDisplayPickComparison(
  report: HistoricalBacktestReport,
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[]
): DisplayPickComparisonAudit {
  const policyId = report.configuration.policyId;
  const display = observations.filter((o) =>
    o.entry.cohorts.includes("DISPLAY_PICK")
  );
  const nonDisplay = observations.filter(
    (o) => !o.entry.cohorts.includes("DISPLAY_PICK")
  );

  const byE = new Map<number, HistoricalPositionOutcomeStatisticsObservation[]>();
  for (const o of observations) {
    const list = byE.get(o.entry.evaluationBarIndex) ?? [];
    list.push(o);
    byE.set(o.entry.evaluationBarIndex, list);
  }

  let displayWinsAtBar = 0;
  let displayDecisiveAtBar = 0;
  let nonDisplayWinsAtBar = 0;
  let nonDisplayDecisiveAtBar = 0;
  let barsWithDisplay = 0;

  for (const [, rows] of byE) {
    const hasDisplay = rows.some((r) =>
      r.entry.cohorts.includes("DISPLAY_PICK")
    );
    if (!hasDisplay) {
      continue;
    }
    barsWithDisplay += 1;
    for (const row of rows) {
      const { classification } = classifyHistoricalPositionOutcomePolicy(
        row.pathResult,
        policyId
      );
      const isDisplay = row.entry.cohorts.includes("DISPLAY_PICK");
      if (
        classification === "FAVORABLE_RESOLUTION" ||
        classification === "ADVERSE_RESOLUTION"
      ) {
        if (isDisplay) {
          displayDecisiveAtBar += 1;
          if (classification === "FAVORABLE_RESOLUTION") {
            displayWinsAtBar += 1;
          }
        } else {
          nonDisplayDecisiveAtBar += 1;
          if (classification === "FAVORABLE_RESOLUTION") {
            nonDisplayWinsAtBar += 1;
          }
        }
      }
    }
  }

  return {
    displayPickDecisive: summarizeObservations(display, policyId),
    nonDisplayPickDecisive: summarizeObservations(nonDisplay, policyId),
    evaluationBarsWithDisplayPick: barsWithDisplay,
    atDisplayBarsDisplayWinRate:
      displayDecisiveAtBar === 0
        ? null
        : displayWinsAtBar / displayDecisiveAtBar,
    atDisplayBarsNonDisplayWinRate:
      nonDisplayDecisiveAtBar === 0
        ? null
        : nonDisplayWinsAtBar / nonDisplayDecisiveAtBar,
    selectionUsesFutureCandles: false,
    selectionRankSummary:
      "readyForFurtherEvaluation (rank 0) > CONFIRMED > CANDIDATE > INVALIDATED; tie-break production.id lexicographic. No outcome fields.",
  };
}

function cohortSummaries(
  report: HistoricalBacktestReport,
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[]
): CohortDecisiveComparison[] {
  const cohorts: HistoricalMeasurementCohort[] = [
    "ALL_PRODUCTION_CANDIDATES",
    "READY_REFERENCES",
    "TRADE_EVAL_PASSED",
    "DISPLAY_PICK",
  ];
  const policyId = report.configuration.policyId;
  return cohorts.map((cohort) => ({
    cohort,
    summary: summarizeObservations(
      observations.filter((o) => o.entry.cohorts.includes(cohort)),
      policyId
    ),
  }));
}

function buildRrCohortBucketCounts(
  report: HistoricalBacktestReport
): Record<string, Record<string, number>> {
  const rrReport = aggregateHistoricalMeasurementRRStatistics(report.artifact, {});
  const out: Record<string, Record<string, number>> = {};
  for (const cohort of [
    "ALL_PRODUCTION_CANDIDATES",
    "READY_REFERENCES",
    "DISPLAY_PICK",
    "TRADE_EVAL_PASSED",
  ] as const) {
    out[cohort] = { ...rrReport.cohorts[cohort].bucketCounts };
  }
  return out;
}

function pathOutcomeCounts(report: HistoricalBacktestReport): {
  ambiguous: number;
  noTouch: number;
  insufficient: number;
} {
  let ambiguous = 0;
  let noTouch = 0;
  let insufficient = 0;
  for (const r of report.pathBatch.results) {
    if (r.outcome === "AMBIGUOUS") {
      ambiguous += 1;
    } else if (r.outcome === "NO_TOUCH") {
      noTouch += 1;
    } else if (r.outcome === "INSUFFICIENT_CONTEXT") {
      insufficient += 1;
    }
  }
  return { ambiguous, noTouch, insufficient };
}

export function compareHistoricalBacktestHorizons(input: {
  symbol: string;
  timeframeId: string;
  candles: readonly Candle[];
  startEvaluationBar: number;
  endEvaluationBar: number;
  horizons: readonly number[];
  engineOptions?: WaveEngineOptions;
}): HorizonRobustnessRow[] {
  const rows: HorizonRobustnessRow[] = [];
  for (const horizonBars of input.horizons) {
    const report = runHistoricalBacktest({
      symbol: input.symbol,
      timeframeId: input.timeframeId,
      candles: input.candles,
      startEvaluationBar: input.startEvaluationBar,
      endEvaluationBar: input.endEvaluationBar,
      horizonBars,
      engineOptions: input.engineOptions,
    });
    const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
      report.artifact,
      report.pathBatch
    );
    const path = pathOutcomeCounts(report);
    rows.push({
      horizonBars,
      summary: summarizeObservations(observations, report.configuration.policyId),
      pathAmbiguous: path.ambiguous,
      pathNoTouch: path.noTouch,
      pathInsufficientContext: path.insufficient,
    });
  }
  return rows;
}

function buildPeriodStability(
  report: HistoricalBacktestReport,
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[]
): PeriodStabilityRow[] {
  const start = report.configuration.startEvaluationBar ?? 0;
  const end = report.configuration.endEvaluationBar ?? start;
  const span = end - start + 1;
  const third = Math.floor(span / 3);
  const ranges: Array<{
    periodId: PeriodStabilityRow["periodId"];
    startEvaluationBar: number;
    endEvaluationBar: number;
  }> = [
    {
      periodId: "EARLY",
      startEvaluationBar: start,
      endEvaluationBar: start + third - 1,
    },
    {
      periodId: "MIDDLE",
      startEvaluationBar: start + third,
      endEvaluationBar: start + 2 * third - 1,
    },
    {
      periodId: "LATE",
      startEvaluationBar: start + 2 * third,
      endEvaluationBar: end,
    },
  ];

  const policyId = report.configuration.policyId;
  return ranges.map((range) => {
    const filtered = observations.filter(
      (o) =>
        o.entry.evaluationBarIndex >= range.startEvaluationBar &&
        o.entry.evaluationBarIndex <= range.endEvaluationBar
    );
    const display = filtered.filter((o) =>
      o.entry.cohorts.includes("DISPLAY_PICK")
    );
    const displaySummary = summarizeObservations(display, policyId);
    return {
      ...range,
      summary: summarizeObservations(filtered, policyId),
      displayPickWinRate_decisive: displaySummary.winRate_decisive,
    };
  });
}

/**
 * B-11A: audit-only robustness analysis on an existing B-10f report (no network).
 */
export function auditHistoricalBacktestRobustness(input: {
  report: HistoricalBacktestReport;
  horizonComparison?: HorizonRobustnessRow[];
  lookahead?: LookaheadSelectionAuditResult | null;
}): HistoricalBacktestRobustnessAuditReport {
  const { report } = input;
  const measurements = report.artifact.measurements;
  const observations =
    report.configuration.rangeError === null
      ? pairHistoricalPositionOutcomeObservationsWithBatch(
          report.artifact,
          report.pathBatch
        )
      : [];

  const sampleSizeNotes = [
    `TRADE_EVAL_PASSED decisive n=${report.outcomeStatistics.cohorts.TRADE_EVAL_PASSED.counts.decisiveResolutions}`,
    `DISPLAY_PICK decisive n=${report.outcomeStatistics.cohorts.DISPLAY_PICK.counts.decisiveResolutions}`,
    `UNKNOWN direction snapshots=${report.outcomeStatistics.byDirection.UNKNOWN.counts.totalSnapshots}`,
  ];

  return {
    schemaVersion: HISTORICAL_BACKTEST_ROBUSTNESS_AUDIT_SCHEMA_VERSION,
    symbol: report.configuration.symbol,
    timeframeId: report.configuration.timeframeId,
    horizonBars: report.configuration.horizonBars,
    evaluationRange: {
      start: report.configuration.startEvaluationBar ?? 0,
      end: report.configuration.endEvaluationBar ?? 0,
    },
    populationModelSummary: POPULATION_MODEL,
    snapshotIndependenceSummary: SNAPSHOT_INDEPENDENCE,
    candidateMultiplicity: auditCandidateMultiplicity(measurements),
    temporalCorrelation: auditTemporalCorrelation(measurements),
    displayPick: auditDisplayPickComparison(report, observations),
    cohortComparisons: cohortSummaries(report, observations),
    tradeEvaluationPolicyCross: report.outcomeStatistics.evaluationCross,
    directionByRrFromExistingStats: {
      note:
        "Use report.outcomeStatistics.byDirection and byRrBucket from B-10e; direction×RR cross cells are not a separate B-9 engine — audit recomputes RR bucket per entry only for cohort distribution tables.",
    },
    rrCohortBucketCounts: buildRrCohortBucketCounts(report),
    horizonComparison: input.horizonComparison ?? [],
    periodStability: buildPeriodStability(report, observations),
    sampleSizeNotes,
    lookahead: input.lookahead ?? null,
  };
}

export function auditHistoricalBacktestSelectionLookahead(input: {
  report: HistoricalBacktestReport;
  candles: readonly Candle[];
  evaluationBarIndices: readonly number[];
  engineOptions?: WaveEngineOptions;
}): LookaheadSelectionAuditResult {
  const issues: string[] = [];
  let displayPickIdMismatches = 0;
  let readyFlagMismatches = 0;
  let tradeEvaluationStatusMismatches = 0;

  const symbol = input.report.configuration.symbol;
  const timeframeId = input.report.configuration.timeframeId;
  const horizonBars = input.report.configuration.horizonBars;

  for (const e of input.evaluationBarIndices) {
    const entriesAtE = input.report.artifact.measurements.filter(
      (m) => m.evaluationBarIndex === e
    );
    const displayEntry = entriesAtE.find((m) =>
      m.cohorts.includes("DISPLAY_PICK")
    );
    if (!displayEntry) {
      continue;
    }

    const mutated = cloneCandles(input.candles);
    mutateCandlesAfterEvaluation(mutated, e);

    const rebuilt = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      symbol,
      timeframeId,
      candles: mutated,
      evaluationBarIndex: e,
      engineOptions: input.engineOptions,
      horizonBars,
    });

    const match = rebuilt.find(
      (b) => b.measurement.prospectiveSetupId === displayEntry.prospectiveSetupId
    );
    if (!match) {
      displayPickIdMismatches += 1;
      issues.push(`E=${e} display candidate missing after future mutation`);
      continue;
    }
    if (!match.cohorts.includes("DISPLAY_PICK")) {
      displayPickIdMismatches += 1;
      issues.push(`E=${e} DISPLAY_PICK cohort lost after mutation`);
    }

    const rows = composeProductionCandidateRowsForSymbol({
      symbol,
      candles: mutated,
      timeframeId,
      engineOptions: input.engineOptions,
      composeOptions: { evaluationBarIndex: e },
    });
    const eligible = rows.filter((r) => r.production && r.historicalSetup);
    const picked = selectDisplayProspectiveCandidate(
      eligible.map((r) => ({
        production: r.production!,
        references: r.references,
        historicalSetup: r.historicalSetup!,
      }))
    );
    if (picked && picked.production.id !== displayEntry.prospectiveSetupId) {
      displayPickIdMismatches += 1;
      issues.push(
        `E=${e} selectDisplayProspectiveCandidate id ${picked.production.id} != artifact ${displayEntry.prospectiveSetupId}`
      );
    }

    for (const entry of entriesAtE) {
      const reb = rebuilt.find(
        (b) => b.measurement.prospectiveSetupId === entry.prospectiveSetupId
      );
      if (!reb) {
        continue;
      }
      if (
        reb.measurement.evaluation.references.readyForFurtherEvaluation !==
        entry.evaluation.references.readyForFurtherEvaluation
      ) {
        readyFlagMismatches += 1;
      }
      if (
        reb.measurement.evaluation.tradeEvaluation.status !==
        entry.evaluation.tradeEvaluation.status
      ) {
        tradeEvaluationStatusMismatches += 1;
      }
    }
  }

  return {
    evaluationBarsChecked: input.evaluationBarIndices.length,
    displayPickIdMismatches,
    readyFlagMismatches,
    tradeEvaluationStatusMismatches,
    issues,
  };
}

/** Audit helper: direction × RR decisive win rate table (report-only). */
export function buildDirectionRrDecisiveCrossTable(
  observations: readonly HistoricalPositionOutcomeStatisticsObservation[],
  policyId: HistoricalBacktestReport["configuration"]["policyId"]
): Record<string, Record<string, { decisive: number; wins: number }>> {
  const table: Record<
    string,
    Record<string, { decisive: number; wins: number }>
  > = {};
  for (const { entry, pathResult } of observations) {
    const dir = resolveHistoricalPositionOutcomeDirectionSliceKey(entry);
    const rr = resolveHistoricalMeasurementRrBucketRow(entry);
    const { classification } = classifyHistoricalPositionOutcomePolicy(
      pathResult,
      policyId
    );
    table[dir] = table[dir] ?? {};
    const cell = table[dir][rr] ?? { decisive: 0, wins: 0 };
    if (
      classification === "FAVORABLE_RESOLUTION" ||
      classification === "ADVERSE_RESOLUTION"
    ) {
      cell.decisive += 1;
      if (classification === "FAVORABLE_RESOLUTION") {
        cell.wins += 1;
      }
    }
    table[dir][rr] = cell;
  }
  return table;
}

export function formatHistoricalBacktestRobustnessAudit(
  audit: HistoricalBacktestRobustnessAuditReport
): string {
  const lines: string[] = [
    `B-11A Robustness Audit — ${audit.symbol} ${audit.timeframeId} H=${audit.horizonBars}`,
    `E=${audit.evaluationRange.start}..${audit.evaluationRange.end}`,
    "",
    "Population model:",
    audit.populationModelSummary,
    "",
    "Snapshot independence:",
    audit.snapshotIndependenceSummary,
    "",
    "Candidate multiplicity:",
    JSON.stringify(audit.candidateMultiplicity, null, 2),
    "",
    "Temporal correlation:",
    JSON.stringify(audit.temporalCorrelation, null, 2),
    "",
    "DISPLAY_PICK vs non-DISPLAY (decisive):",
    `  display winRate=${audit.displayPick.displayPickDecisive.winRate_decisive}`,
    `  non-display winRate=${audit.displayPick.nonDisplayPickDecisive.winRate_decisive}`,
    `  at display bars — display=${audit.displayPick.atDisplayBarsDisplayWinRate} siblings=${audit.displayPick.atDisplayBarsNonDisplayWinRate}`,
    "",
    "Cohort decisive summaries:",
  ];
  for (const c of audit.cohortComparisons) {
    lines.push(
      `  ${c.cohort}: decisive=${c.summary.decisiveResolutions} winRate=${c.summary.winRate_decisive}`
    );
  }
  if (audit.horizonComparison.length) {
    lines.push("", "Horizon comparison:");
    for (const h of audit.horizonComparison) {
      lines.push(
        `  H=${h.horizonBars}: decisive=${h.summary.decisiveResolutions} winRate=${h.summary.winRate_decisive} ambiguous=${h.pathAmbiguous} noTouch=${h.pathNoTouch}`
      );
    }
  }
  lines.push("", "Period stability:");
  for (const p of audit.periodStability) {
    lines.push(
      `  ${p.periodId} E=${p.startEvaluationBar}..${p.endEvaluationBar}: all winRate=${p.summary.winRate_decisive} display=${p.displayPickWinRate_decisive}`
    );
  }
  if (audit.lookahead) {
    lines.push(
      "",
      `Lookahead selection: display mismatches=${audit.lookahead.displayPickIdMismatches} ready=${audit.lookahead.readyFlagMismatches} tradeEval=${audit.lookahead.tradeEvaluationStatusMismatches}`
    );
  }
  return lines.join("\n");
}
