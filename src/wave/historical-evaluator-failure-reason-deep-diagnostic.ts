/**
 * Phase B-12n — observational failure-reason deep diagnostic (frozen lifecycle only).
 * Consumes B-12l failure-reason analysis; does not call evaluateTradeEvaluation or rebuild path/backtest.
 */
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import { mapAuditGeometryToEntryReferenceQuality } from "./historical-entry-reference-quality-analysis";
import { classifyTheoreticalRGeometryForAudit } from "./historical-independent-trade-r-eligibility-audit";
import {
  EVALUATOR_FAILURE_REASON_CONTRACT_NOTES,
  EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
  EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
  type EvaluatorFailureReasonAnalysisBucket,
} from "./historical-evaluator-failure-reason-contract";
import {
  buildHistoricalEvaluatorFailureReasonAnalysis,
  resolveEvaluatorFailureReasonBucket,
} from "./historical-evaluator-failure-reason-analysis";
import { EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS } from "./historical-evaluator-failure-reason-analysis-types";
import { computeTheoreticalTradeRMultiple } from "./historical-independent-trade-r-multiple-statistics";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  FAILURE_REASON_DEEP_DIAGNOSTIC_POLICY_CLASSIFICATIONS,
  HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION,
  type BuildHistoricalEvaluatorFailureReasonDeepDiagnosticInput,
  type FailureReasonDeepDiagnosticConditionalDimension,
  type FailureReasonDeepDiagnosticConditionalSlice,
  type FailureReasonDeepDiagnosticConcentrationRow,
  type FailureReasonDeepDiagnosticExitPresentationId,
  type FailureReasonDeepDiagnosticMasterRow,
  type FailureReasonDeepDiagnosticRankingEntry,
  type HistoricalEvaluatorFailureReasonDeepDiagnosticReport,
} from "./historical-evaluator-failure-reason-deep-diagnostic-types";

const WARNINGS: readonly string[] = [
  "observational_analysis",
  "no_causal_inference",
  "failure_reason_is_frozen",
  "evaluator_rules_not_changed",
  "no_execution_simulation",
  "no_pnl",
  "no_fees",
  "no_slippage",
  "temporal_dependence",
  "overlapping_observations",
  "sample_size_caution",
  "no_strategy_optimization",
];

const CONDITIONAL_MIN_TRADES = 10;
const CONDITIONAL_MIN_DECISIVE = 10;

const REFERENCE_FIXTURE = {
  overall: { wins: 131, losses: 154, decisive: 285 },
  passed: { wins: 33, losses: 89, decisive: 122 },
  failed: { wins: 98, losses: 65, decisive: 163 },
};

type Acc = {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
};

function emptyAcc(): Acc {
  return {
    total: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    unmeasured: 0,
  };
}

function accumulate(acc: Acc, c: HistoricalPositionPolicyClassification): void {
  acc.total += 1;
  switch (c) {
    case "FAVORABLE_RESOLUTION":
      acc.wins += 1;
      acc.decisive += 1;
      break;
    case "ADVERSE_RESOLUTION":
      acc.losses += 1;
      acc.decisive += 1;
      break;
    case "INCONCLUSIVE_SAME_BAR":
      acc.inconclusive += 1;
      break;
    case "UNRESOLVED_AT_HORIZON":
      acc.unresolved += 1;
      break;
    case "UNMEASURED_NO_FUTURE":
    case "UNMEASURED_INSUFFICIENT":
      acc.unmeasured += 1;
      break;
    default:
      break;
  }
}

function geometryForTrade(trade: IndependentTradeUnit): EntryReferenceGeometryQuality {
  const computed = computeTheoreticalTradeRMultiple(trade);
  return mapAuditGeometryToEntryReferenceQuality(
    classifyTheoreticalRGeometryForAudit(trade, computed)
  );
}

function resolveDurationBucket(
  durationBars: number | null
): IndependentTradeDurationBucketId | null {
  if (durationBars === null || !Number.isFinite(durationBars)) {
    return null;
  }
  const d = Math.floor(durationBars);
  if (d >= 1 && d <= 3) {
    return "DURATION_1_3";
  }
  if (d >= 4 && d <= 6) {
    return "DURATION_4_6";
  }
  if (d >= 7 && d <= 12) {
    return "DURATION_7_12";
  }
  if (d >= 13 && d <= 24) {
    return "DURATION_13_24";
  }
  return null;
}

export function mapPathOutcomeToFailureReasonExitPresentation(
  pathOutcome: ProspectiveSetupOutcomeReplayStatus
): FailureReasonDeepDiagnosticExitPresentationId | null {
  switch (pathOutcome) {
    case "TARGET_TOUCHED":
      return "TARGET";
    case "INVALIDATION_TOUCHED":
      return "INVALIDATION";
    case "AMBIGUOUS":
      return "AMBIGUOUS";
    case "NO_TOUCH":
      return "NO_TOUCH";
    default:
      return null;
  }
}

function winRateValue(
  rate: ReturnType<typeof computeIndependentTradeWinRateDecisive>
): number | null {
  return rate.value;
}

function deltaPercentagePoints(
  a: number | null,
  b: number | null
): number | null {
  if (a === null || b === null) {
    return null;
  }
  return (a - b) * 100;
}

function rankingEligible(quality: ReturnType<typeof classifyHistoricalIndependentTradeSampleSize>): boolean {
  return quality !== "VERY_SMALL_SAMPLE";
}

function buildRankings(
  master: readonly FailureReasonDeepDiagnosticMasterRow[]
): HistoricalEvaluatorFailureReasonDeepDiagnosticReport["rankings"] {
  const eligible = master.filter((r) => rankingEligible(r.sampleSizeQuality));

  const byWinRate = [...eligible].sort(
    (a, b) =>
      (winRateValue(b.failedWinRateDecisive) ?? -1) -
        (winRateValue(a.failedWinRateDecisive) ?? -1) ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );

  const byFailedWins = [...master].sort(
    (a, b) =>
      b.failedWins - a.failedWins ||
      (winRateValue(b.failedWinRateDecisive) ?? -1) -
        (winRateValue(a.failedWinRateDecisive) ?? -1) ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );

  const byFailedWinContribution = [...master].sort(
    (a, b) =>
      (b.contributionToAllFailedWins ?? -1) -
        (a.contributionToAllFailedWins ?? -1) ||
      b.failedWins - a.failedWins ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );

  const byDecisiveWinContribution = [...master].sort(
    (a, b) =>
      (b.contributionToAllDecisiveWins ?? -1) -
        (a.contributionToAllDecisiveWins ?? -1) ||
      b.failedWins - a.failedWins ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );

  const toEntries = (
    rows: readonly FailureReasonDeepDiagnosticMasterRow[],
    metric: (r: FailureReasonDeepDiagnosticMasterRow) => number | null,
    label: string
  ): FailureReasonDeepDiagnosticRankingEntry[] =>
    rows.map((r, i) => ({
      failureReason: r.failureReason,
      rank: i + 1,
      metricValue: metric(r) ?? 0,
      sampleSizeQuality: r.sampleSizeQuality,
      rankingEligible: rankingEligible(r.sampleSizeQuality),
      descriptiveLabel: label,
    }));

  return {
    highestObservedFailedDecisiveWinRate: toEntries(
      byWinRate,
      (r) => winRateValue(r.failedWinRateDecisive),
      "highest observed historical favorable-path association (failed decisive win rate)"
    ),
    highestObservedFailedWinCount: toEntries(
      byFailedWins,
      (r) => r.failedWins,
      "highest observed FAILED + favorable path count"
    ),
    highestObservedContributionToFailedWins: toEntries(
      byFailedWinContribution,
      (r) => r.contributionToAllFailedWins,
      "highest observed contribution to all FAILED + favorable path observations"
    ),
    highestObservedContributionToDecisiveWins: toEntries(
      byDecisiveWinContribution,
      (r) => r.contributionToAllDecisiveWins,
      "highest observed contribution to all decisive favorable paths"
    ),
    notes:
      "Rankings are descriptive only; VERY_SMALL_SAMPLE rows are excluded from decisive win-rate ranking. Not causal and not strategy selection.",
  };
}

function buildFindings(
  master: readonly FailureReasonDeepDiagnosticMasterRow[],
  totalFailedWins: number,
  failedBaselineRate: number | null
): readonly string[] {
  const findings: string[] = [];
  if (totalFailedWins === 0) {
    findings.push(
      "No FAILED trades with favorable path outcomes in this population; concentration analysis is empty."
    );
    return findings;
  }

  const sorted = [...master].sort(
    (a, b) =>
      b.failedWins - a.failedWins ||
      (winRateValue(b.failedWinRateDecisive) ?? -1) -
        (winRateValue(a.failedWinRateDecisive) ?? -1) ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );
  const top = sorted[0];
  if (top && top.failedWins > 0) {
    const share = top.failedWins / totalFailedWins;
    findings.push(
      `Failure reason ${top.failureReason} accounts for ${(share * 100).toFixed(1)}% of historically FAILED + favorable path observations in this population (descriptive; requires further validation).`
    );
  }

  for (const row of master) {
    const rate = winRateValue(row.failedWinRateDecisive);
    if (
      rate !== null &&
      failedBaselineRate !== null &&
      row.failedDecisive >= 10 &&
      rate > failedBaselineRate
    ) {
      findings.push(
        `Failure reason ${row.failureReason} has a higher observed decisive win rate than the overall FAILED population in this sample (observational association only).`
      );
      break;
    }
  }

  findings.push(
    "Frozen evaluator failure reasons do not alter path outcome or B-10d policy classification; evaluator rules were not changed in B-12n."
  );
  return findings;
}

function buildPolicyOutcomeMatrix(
  trades: readonly IndependentTradeUnit[]
): HistoricalEvaluatorFailureReasonDeepDiagnosticReport["failureReasonByPolicyOutcome"] {
  const byReason = new Map<
    EvaluatorFailureReasonAnalysisBucket,
    Map<HistoricalPositionPolicyClassification, number>
  >();

  for (const t of trades) {
    if (t.tradeEvaluationStatus !== "FAILED") {
      continue;
    }
    const reason = resolveEvaluatorFailureReasonBucket(t);
    if (!reason) {
      continue;
    }
    let cells = byReason.get(reason);
    if (!cells) {
      cells = new Map();
      byReason.set(reason, cells);
    }
    cells.set(t.policyClassification, (cells.get(t.policyClassification) ?? 0) + 1);
  }

  return [...byReason.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([failureReason, cellMap]) => ({
      failureReason,
      cells: FAILURE_REASON_DEEP_DIAGNOSTIC_POLICY_CLASSIFICATIONS.map(
        (policyClassification) => ({
          policyClassification,
          count: cellMap.get(policyClassification) ?? 0,
        })
      ),
    }));
}

function buildConditionalSlices(
  trades: readonly IndependentTradeUnit[],
  overallWinRate: number | null
): readonly FailureReasonDeepDiagnosticConditionalSlice[] {
  type Key = string;
  const store = new Map<Key, Acc & { reason: EvaluatorFailureReasonAnalysisBucket; dimension: FailureReasonDeepDiagnosticConditionalDimension; dimensionValue: string }>();

  const bump = (
    reason: EvaluatorFailureReasonAnalysisBucket,
    dimension: FailureReasonDeepDiagnosticConditionalDimension,
    dimensionValue: string,
    c: HistoricalPositionPolicyClassification
  ) => {
    const key = `${reason}\0${dimension}\0${dimensionValue}`;
    let row = store.get(key);
    if (!row) {
      row = {
        ...emptyAcc(),
        reason,
        dimension,
        dimensionValue,
      };
      store.set(key, row);
    }
    accumulate(row, c);
  };

  for (const t of trades) {
    if (t.tradeEvaluationStatus !== "FAILED") {
      continue;
    }
    const reason = resolveEvaluatorFailureReasonBucket(t);
    if (!reason) {
      continue;
    }
    bump(reason, "DIRECTION", resolveIndependentTradeDirectionSliceKey(t), t.policyClassification);
    bump(
      reason,
      "PROSPECTIVE_RR",
      classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio),
      t.policyClassification
    );
    bump(reason, "GEOMETRY", geometryForTrade(t), t.policyClassification);
    bump(reason, "SETUP_FAMILY", t.setupFamilyId || "UNKNOWN", t.policyClassification);
    const exit = mapPathOutcomeToFailureReasonExitPresentation(t.pathOutcome);
    if (exit) {
      bump(reason, "EXIT_PRESENTATION", exit, t.policyClassification);
    }
    const dur = resolveDurationBucket(t.lifecycleDurationBars);
    if (dur) {
      bump(reason, "DURATION", dur, t.policyClassification);
    }
  }

  const slices: FailureReasonDeepDiagnosticConditionalSlice[] = [];
  for (const row of store.values()) {
    if (row.total < CONDITIONAL_MIN_TRADES || row.decisive < CONDITIONAL_MIN_DECISIVE) {
      continue;
    }
    const winRate = computeIndependentTradeWinRateDecisive(row.wins, row.losses);
    slices.push({
      failureReason: row.reason,
      dimension: row.dimension,
      dimensionValue: row.dimensionValue,
      trades: row.total,
      decisive: row.decisive,
      wins: row.wins,
      losses: row.losses,
      winRateDecisive: winRate,
      deltaVsOverallDecisiveWinRatePercentagePoints: deltaPercentagePoints(
        winRate.value,
        overallWinRate
      ),
      sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(row.decisive),
    });
  }

  return slices.sort(
    (a, b) =>
      String(a.failureReason).localeCompare(String(b.failureReason)) ||
      a.dimension.localeCompare(b.dimension) ||
      a.dimensionValue.localeCompare(b.dimensionValue)
  );
}

function mapDimensionSlice(
  r: {
    failureReason: EvaluatorFailureReasonAnalysisBucket;
    total: number;
    decisive: number;
    wins: number;
    losses: number;
    winRate_decisive: ReturnType<typeof computeIndependentTradeWinRateDecisive>;
  }
) {
  return {
    failureReason: r.failureReason,
    total: r.total,
    decisive: r.decisive,
    wins: r.wins,
    losses: r.losses,
    winRateDecisive: r.winRate_decisive,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(r.decisive),
  };
}

function aggregateExitPresentation(
  trades: readonly IndependentTradeUnit[]
): HistoricalEvaluatorFailureReasonDeepDiagnosticReport["byExitPresentation"] {
  const store = new Map<
    string,
    Map<EvaluatorFailureReasonAnalysisBucket, Acc>
  >();
  for (const t of trades) {
    if (t.tradeEvaluationStatus !== "FAILED") {
      continue;
    }
    const reason = resolveEvaluatorFailureReasonBucket(t);
    if (!reason) {
      continue;
    }
    const exit = mapPathOutcomeToFailureReasonExitPresentation(t.pathOutcome);
    if (!exit) {
      continue;
    }
    let byR = store.get(exit);
    if (!byR) {
      byR = new Map();
      store.set(exit, byR);
    }
    const acc = byR.get(reason) ?? emptyAcc();
    accumulate(acc, t.policyClassification);
    byR.set(reason, acc);
  }
  const rows: Array<
    HistoricalEvaluatorFailureReasonDeepDiagnosticReport["byExitPresentation"][number]
  > = [];
  for (const exit of ["TARGET", "INVALIDATION", "AMBIGUOUS", "NO_TOUCH"] as const) {
    const byR = store.get(exit);
    if (!byR) {
      continue;
    }
    for (const [failureReason, acc] of byR) {
      rows.push({
        failureReason,
        exitPresentation: exit,
        total: acc.total,
        decisive: acc.decisive,
        wins: acc.wins,
        losses: acc.losses,
        winRateDecisive: computeIndependentTradeWinRateDecisive(acc.wins, acc.losses),
        sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      String(a.failureReason).localeCompare(String(b.failureReason)) ||
      a.exitPresentation.localeCompare(b.exitPresentation)
  );
}

/**
 * B-12n deep diagnostic: where FAILED vs favorable-path mismatch concentrates (observational).
 */
export function buildHistoricalEvaluatorFailureReasonDeepDiagnostic(
  input: BuildHistoricalEvaluatorFailureReasonDeepDiagnosticInput
): HistoricalEvaluatorFailureReasonDeepDiagnosticReport {
  const {
    lifecycleReport,
    statisticsReport,
    evaluatorDiagnosticReport,
    failureReasonAnalysisReport,
    rMultipleStatisticsReport,
    entryReferenceQualityReport,
  } = input;

  const b12l =
    failureReasonAnalysisReport ??
    buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport,
      statisticsReport,
      evaluatorDiagnosticReport,
    });

  const trades = lifecycleReport.trades;
  const overallWinRate = winRateValue(
    computeIndependentTradeWinRateDecisive(
      b12l.parity.lifecycleWins,
      b12l.parity.lifecycleLosses
    )
  );
  const failedWins = b12l.failedTradeOutcomeAnalysis.reduce(
    (s, r) => s + r.failedWins,
    0
  );
  const failedLosses = b12l.failedTradeOutcomeAnalysis.reduce(
    (s, r) => s + r.failedLosses,
    0
  );
  const failedDecisive = failedWins + failedLosses;
  const failedWinRate = winRateValue(
    computeIndependentTradeWinRateDecisive(failedWins, failedLosses)
  );

  const masterTable: FailureReasonDeepDiagnosticMasterRow[] =
    b12l.overallByFailureReason.map((row) => {
      const contrib = b12l.failedTradeOutcomeAnalysis.find(
        (f) => f.failureReason === row.failureReason
      );
      return {
        failureReason: row.failureReason,
        failedTrades: row.totalTrades,
        failedDecisive: row.decisiveTrades,
        failedWins: row.wins,
        failedLosses: row.losses,
        failedInconclusive: row.inconclusive,
        failedUnresolved: row.unresolved,
        failedUnmeasured: row.unmeasuredTrades,
        failedWinRateDecisive: row.decisiveWinRate,
        failedWinRateDenominatorId:
          EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS.FAILED_DECISIVE_RESOLUTIONS,
        contributionToAllFailedWins:
          contrib?.failedWinsContributionToAllFailedWins ?? null,
        contributionToAllDecisiveWins:
          contrib?.failedWinsContributionToAllDecisiveWins ?? null,
        sampleSizeQuality: row.sampleSizeQuality,
        winRateDeltaFromOverallDecisivePercentagePoints: deltaPercentagePoints(
          winRateValue(row.decisiveWinRate),
          overallWinRate
        ),
        winRateDeltaFromFailedDecisivePercentagePoints: deltaPercentagePoints(
          winRateValue(row.decisiveWinRate),
          failedWinRate
        ),
      };
    });

  const failedWinProfiles = masterTable
    .filter((r) => r.failedWins > 0)
    .map((r) => ({
      failureReason: r.failureReason,
      failedWins: r.failedWins,
      failedLosses: r.failedLosses,
      decisive: r.failedDecisive,
      winRateDecisive: r.failedWinRateDecisive,
      contributionToFailedWins: r.contributionToAllFailedWins,
      contributionToOverallDecisiveWins: r.contributionToAllDecisiveWins,
      sampleSizeQuality: r.sampleSizeQuality,
    }))
    .sort(
      (a, b) =>
        b.failedWins - a.failedWins ||
        (winRateValue(b.winRateDecisive) ?? -1) -
          (winRateValue(a.winRateDecisive) ?? -1) ||
        String(a.failureReason).localeCompare(String(b.failureReason))
    );

  const concentrationRows: FailureReasonDeepDiagnosticConcentrationRow[] =
    masterTable.map((r) => ({
      failureReason: r.failureReason,
      failedWins: r.failedWins,
      failedWinShare:
        failedWins === 0 ? null : r.failedWins / failedWins,
      decisiveWinShare: r.contributionToAllDecisiveWins,
    }));

  const topFailureReasonsByFailedWinContribution = [...concentrationRows].sort(
    (a, b) =>
      b.failedWins - a.failedWins ||
      (winRateValue(
        masterTable.find((m) => m.failureReason === b.failureReason)!
          .failedWinRateDecisive
      ) ?? -1) -
        (winRateValue(
          masterTable.find((m) => m.failureReason === a.failureReason)!
            .failedWinRateDecisive
        ) ?? -1) ||
      String(a.failureReason).localeCompare(String(b.failureReason))
  );

  const passedWins =
    evaluatorDiagnosticReport?.evaluation.passed.counts.favorableWins ??
    statisticsReport?.evaluationCross?.PASSED?.FAVORABLE_RESOLUTION ??
    null;
  const passedLosses =
    evaluatorDiagnosticReport?.evaluation.passed.counts.adverseLosses ??
    statisticsReport?.evaluationCross?.PASSED?.ADVERSE_RESOLUTION ??
    null;
  const failedWinsObs =
    evaluatorDiagnosticReport?.evaluation.failed.counts.favorableWins ??
    statisticsReport?.evaluationCross?.FAILED?.FAVORABLE_RESOLUTION ??
    null;
  const failedLossesObs =
    evaluatorDiagnosticReport?.evaluation.failed.counts.adverseLosses ??
    statisticsReport?.evaluationCross?.FAILED?.ADVERSE_RESOLUTION ??
    null;

  return {
    schemaVersion: HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC",
    canonicalSource: {
      artifactPath: EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
      lifecycleField: EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
      freezeNote: EVALUATOR_FAILURE_REASON_CONTRACT_NOTES.frozenAtEvaluationBarE,
    },
    population: {
      independentTrades: trades.length,
      snapshotReference: statisticsReport?.snapshotReference ?? null,
      primaryPopulationNote:
        "Primary population: lifecycleReport.trades[] with FAILED-only failure-reason buckets; frozen evaluatorFirstFailure (B-12l).",
    },
    baselines: {
      overallDecisiveWins: b12l.parity.lifecycleWins,
      overallDecisiveLosses: b12l.parity.lifecycleLosses,
      overallDecisiveTrades: b12l.parity.lifecycleDecisive,
      overallDecisiveWinRate: computeIndependentTradeWinRateDecisive(
        b12l.parity.lifecycleWins,
        b12l.parity.lifecycleLosses
      ),
      failedDecisiveWins: failedWins,
      failedDecisiveLosses: failedLosses,
      failedDecisiveTrades: failedDecisive,
      failedDecisiveWinRate: computeIndependentTradeWinRateDecisive(
        failedWins,
        failedLosses
      ),
      referenceExpectationNote:
        `Reference fixture (may drift on live data): overall ${REFERENCE_FIXTURE.overall.wins}/${REFERENCE_FIXTURE.overall.decisive} decisive wins; FAILED ${REFERENCE_FIXTURE.failed.wins}/${REFERENCE_FIXTURE.failed.decisive} decisive wins.`,
    },
    masterTable,
    rankings: buildRankings(masterTable),
    failedWinProfiles,
    failureReasonByPolicyOutcome: buildPolicyOutcomeMatrix(trades),
    byDirection: b12l.byDirection.map((r) => ({
      ...mapDimensionSlice(r),
      direction: r.dimensionKey,
    })),
    byProspectiveRr: b12l.byRrBucket.map((r) => ({
      ...mapDimensionSlice(r),
      prospectiveRrBucket: r.dimensionKey,
    })),
    byGeometry: b12l.byGeometry.map((r) => ({
      ...mapDimensionSlice(r),
      geometry: r.dimensionKey,
    })),
    bySetupFamily: b12l.bySetupFamily.map((r) => ({
      ...mapDimensionSlice(r),
      setupFamilyId: r.dimensionKey,
    })),
    byExitPresentation: aggregateExitPresentation(trades),
    byDuration: b12l.byDuration.map((r) => ({
      ...mapDimensionSlice(r),
      durationBucket: r.dimensionKey,
    })),
    conditionalSlices: buildConditionalSlices(trades, overallWinRate),
    concentration: {
      byFailureReason: concentrationRows,
      topFailureReasonsByFailedWinContribution,
    },
    unknownPopulation: {
      failedWithMissingFailureReason:
        b12l.unknownPopulation.failedWithMissingFailureReason,
      insufficientContextNoFailureReason:
        b12l.unknownPopulation.insufficientContextNoFailureReason,
      notes: b12l.unknownPopulation.notes,
    },
    consumedReports: {
      failureReasonSchemaVersion: b12l.schemaVersion,
      statisticsSchemaVersion:
        statisticsReport?.statisticsSchemaVersion ?? null,
      evaluatorDiagnosticSchemaVersion:
        evaluatorDiagnosticReport?.schemaVersion ?? null,
      rMultipleSchemaVersion: rMultipleStatisticsReport?.schemaVersion ?? null,
      entryReferenceQualitySchemaVersion:
        entryReferenceQualityReport?.schemaVersion ?? null,
    },
    parity: {
      observedOverallWins: b12l.parity.lifecycleWins,
      observedOverallLosses: b12l.parity.lifecycleLosses,
      observedOverallDecisive: b12l.parity.lifecycleDecisive,
      observedPassedWins: passedWins,
      observedPassedLosses: passedLosses,
      observedPassedDecisive:
        passedWins !== null && passedLosses !== null
          ? passedWins + passedLosses
          : null,
      observedFailedWins: failedWinsObs,
      observedFailedLosses: failedLossesObs,
      observedFailedDecisive:
        failedWinsObs !== null && failedLossesObs !== null
          ? failedWinsObs + failedLossesObs
          : null,
      statisticsParityHolds: b12l.parity.parityHolds,
      b12lParityHolds: b12l.parity.parityHolds,
      referenceFixtureNote:
        "B-12c reference when dataset matches: 131/154/285 overall; PASSED 33/89/122; FAILED 98/65/163.",
    },
    rMultipleReference: {
      available: rMultipleStatisticsReport !== undefined,
      sumR: rMultipleStatisticsReport?.overall.sumR ?? null,
      expectancyR: rMultipleStatisticsReport?.overall.expectancyR ?? null,
      note: "B-12g theoretical R reference only; not recomputed in B-12n.",
    },
    geometryReference: {
      available: entryReferenceQualityReport !== undefined,
      note: "B-12j geometry reference only; cross-tabs reuse B-12j classification via B-12l dimension rows.",
    },
    findings: buildFindings(masterTable, failedWins, failedWinRate),
    warnings: WARNINGS,
  };
}
