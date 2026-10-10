import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import {
  ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS,
  type EntryReferenceGeometryQuality,
} from "./historical-entry-reference-quality-analysis-types";
import {
  mapAuditGeometryToEntryReferenceQuality,
} from "./historical-entry-reference-quality-analysis";
import { classifyTheoreticalRGeometryForAudit } from "./historical-independent-trade-r-eligibility-audit";
import { analyzeIndependentTradeEvaluatorDiagnostic } from "./historical-independent-trade-evaluator-diagnostic";
import {
  failedWinFailureReasonAnalysisUnavailable,
  failureReasonAnalysisUnavailableWhenNoLifecycle,
  integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic,
} from "./historical-evaluator-rule-diagnostic-b12m-integration";
import type { EvaluatorDiagnosticMismatchSummary } from "./historical-independent-trade-evaluator-diagnostic-types";
import { computeTheoreticalTradeRMultiple } from "./historical-independent-trade-r-multiple-statistics";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import {
  EVALUATOR_RULE_DIAGNOSTIC_STATUSES,
  HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION,
  type BuildHistoricalEvaluatorRuleDiagnosticInput,
  type EvaluatorMismatchQuadrantId,
  type EvaluatorRuleDiagnosticConditionalAnalysis,
  type EvaluatorRuleDiagnosticEvalCell,
  type EvaluatorRuleDiagnosticFieldAuditEntry,
  type EvaluatorRuleDiagnosticOutcomeCrossCell,
  type EvaluatorRuleDiagnosticQuadrantProfile,
  type EvaluatorRuleDiagnosticStatus,
  type EvaluatorRuleDiagnosticStatusRow,
  type HistoricalEvaluatorRuleDiagnosticReport,
} from "./historical-evaluator-rule-diagnostic-types";

const PATH_OUTCOMES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

const WARNINGS: readonly string[] = [
  "observational",
  "descriptive",
  "no_causal_inference",
  "temporal_dependence",
  "multiple_comparisons",
  "sample_size_caution",
  "evaluator_mismatch_not_evaluator_error",
  "no_pnl",
  "no_execution_simulation",
  "no_fees",
  "no_slippage",
  "no_funding",
  "no_position_sizing",
  "prospective_rr_not_theoretical_r",
  "failure_reason_not_frozen_in_lifecycle",
];

function resolveEvalStatus(
  trade: IndependentTradeUnit
): EvaluatorRuleDiagnosticStatus | null {
  const s = trade.tradeEvaluationStatus;
  if (s === "PASSED" || s === "FAILED" || s === "INSUFFICIENT_CONTEXT") {
    return s;
  }
  return null;
}

type OutcomeAcc = {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
};

function emptyOutcomeAcc(): OutcomeAcc {
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

function accumulateOutcome(
  acc: OutcomeAcc,
  classification: HistoricalPositionPolicyClassification
): void {
  acc.total += 1;
  switch (classification) {
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

function accToEvalCell(acc: OutcomeAcc): EvaluatorRuleDiagnosticEvalCell {
  return {
    total: acc.total,
    decisive: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    winRate_decisive: computeIndependentTradeWinRateDecisive(
      acc.wins,
      acc.losses
    ),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(
      acc.decisive
    ),
  };
}

function accToCrossCell(acc: OutcomeAcc): EvaluatorRuleDiagnosticOutcomeCrossCell {
  return {
    wins: acc.wins,
    losses: acc.losses,
    decisive: acc.decisive,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    unmeasured: acc.unmeasured,
  };
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

function geometryForTrade(trade: IndependentTradeUnit): EntryReferenceGeometryQuality {
  const computed = computeTheoreticalTradeRMultiple(trade);
  const auditGeo = classifyTheoreticalRGeometryForAudit(trade, computed);
  return mapAuditGeometryToEntryReferenceQuality(auditGeo);
}

function buildFieldAudit(): readonly EvaluatorRuleDiagnosticFieldAuditEntry[] {
  return [
    {
      field: "tradeEvaluationStatus",
      source: "B-12b IndependentTradeUnit ← frozen at lifecycle build from historical backtest evaluation",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "Primary PASSED/FAILED/INSUFFICIENT_CONTEXT split.",
    },
    {
      field: "canonicalRrRatio",
      source: "B-12b ← B-9d evaluation.references.rr.ratio (prospective RR)",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "Not evaluator diagnostics.rrRatio; prospective RR only.",
    },
    {
      field: "evaluation.references.rr.ratio",
      source: "B-9d prospective reference (via canonicalRrRatio on trade unit)",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "Separated from B-12g theoretical R in theoreticalRAnalysis.",
    },
    {
      field: "evaluatorFirstFailure",
      source:
        "HistoricalMeasurementArtifactEntry.evaluation.tradeEvaluation.firstFailure → IndependentTradeUnit.evaluatorFirstFailure",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "Frozen in B-12l; exposed in B-12k failureReasonAnalysis via B-12m (no evaluateTradeEvaluation).",
    },
    {
      field: "diagnostics.rrRatio",
      source: "evaluateTradeEvaluation → TradeEvaluationDiagnostics.rrRatio",
      frozenInIndependentTradeUnit: false,
      usedInB12k: false,
      notes: "Live evaluator diagnostic; not frozen in B-12b historical snapshot.",
    },
    {
      field: "diagnostics.risk / reward",
      source: "evaluateTradeEvaluation",
      frozenInIndependentTradeUnit: false,
      usedInB12k: false,
      notes: "Use entry/target/invalidation frozen prices for geometry (B-12j semantics) only when needed.",
    },
    {
      field: "setupFamilyId",
      source: "B-12b ← B-9e setup family at entry",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "",
    },
    {
      field: "direction",
      source: "B-12b ← path replay direction at lifecycle freeze",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "",
    },
    {
      field: "pathOutcome / policyClassification",
      source: "B-10a path + B-10d policy (frozen)",
      frozenInIndependentTradeUnit: true,
      usedInB12k: true,
      notes: "Outcome labels; WIN/LOSS mapping unchanged.",
    },
  ];
}

function buildStatusRows(
  b12f: ReturnType<typeof analyzeIndependentTradeEvaluatorDiagnostic>,
  overallDecisive: number,
  overallWins: number
): Record<EvaluatorRuleDiagnosticStatus, EvaluatorRuleDiagnosticStatusRow> {
  const groups = {
    PASSED: b12f.evaluation.passed,
    FAILED: b12f.evaluation.failed,
    INSUFFICIENT_CONTEXT: b12f.evaluation.insufficientContext,
  };
  const rows = {} as Record<
    EvaluatorRuleDiagnosticStatus,
    EvaluatorRuleDiagnosticStatusRow
  >;
  for (const status of EVALUATOR_RULE_DIAGNOSTIC_STATUSES) {
    const g = groups[status];
    const c = g.counts;
    rows[status] = {
      evaluationStatus: status,
      totalTrades: c.totalTrades,
      decisiveTrades: c.decisiveTrades,
      wins: c.favorableWins,
      losses: c.adverseLosses,
      inconclusive: c.inconclusiveSameBar,
      unresolved: c.unresolvedAtHorizon,
      unmeasuredTrades: c.unmeasuredNoFuture + c.unmeasuredInsufficient,
      winRate_decisive: computeIndependentTradeWinRateDecisive(
        c.favorableWins,
        c.adverseLosses
      ),
      decisiveShare:
        overallDecisive === 0 ? null : c.decisiveTrades / overallDecisive,
      contributionToDecisiveWins:
        overallWins === 0 ? null : c.favorableWins / overallWins,
      sampleSizeQuality: g.sampleSizeQuality,
    };
  }
  return rows;
}

function buildEvalPairCells(
  trades: readonly IndependentTradeUnit[],
  keyFn: (t: IndependentTradeUnit) => string | null
): Map<string, { passed: OutcomeAcc; failed: OutcomeAcc }> {
  const map = new Map<string, { passed: OutcomeAcc; failed: OutcomeAcc }>();
  for (const t of trades) {
    const evalStatus = resolveEvalStatus(t);
    if (evalStatus !== "PASSED" && evalStatus !== "FAILED") {
      continue;
    }
    const key = keyFn(t);
    if (key === null) {
      continue;
    }
    let row = map.get(key);
    if (!row) {
      row = { passed: emptyOutcomeAcc(), failed: emptyOutcomeAcc() };
      map.set(key, row);
    }
    const acc = evalStatus === "PASSED" ? row.passed : row.failed;
    accumulateOutcome(acc, t.policyClassification);
  }
  return map;
}

function buildConditionalPair(
  trades: readonly IndependentTradeUnit[],
  keyFn: (t: IndependentTradeUnit) => string | null
): {
  passed: Record<string, EvaluatorRuleDiagnosticOutcomeCrossCell>;
  failed: Record<string, EvaluatorRuleDiagnosticOutcomeCrossCell>;
} {
  const passed: Record<string, OutcomeAcc> = {};
  const failed: Record<string, OutcomeAcc> = {};
  for (const t of trades) {
    const evalStatus = resolveEvalStatus(t);
    if (evalStatus !== "PASSED" && evalStatus !== "FAILED") {
      continue;
    }
    const key = keyFn(t);
    if (key === null) {
      continue;
    }
    const bucket =
      evalStatus === "PASSED"
        ? (passed[key] ??= emptyOutcomeAcc())
        : (failed[key] ??= emptyOutcomeAcc());
    accumulateOutcome(bucket, t.policyClassification);
  }
  const toCross = (rec: Record<string, OutcomeAcc>) =>
    Object.fromEntries(
      Object.entries(rec).map(([k, v]) => [k, accToCrossCell(v)])
    );
  return { passed: toCross(passed), failed: toCross(failed) };
}

function quadrantId(
  evalStatus: Extract<TradeEvaluationStatus, "PASSED" | "FAILED">,
  classification: HistoricalPositionPolicyClassification
): EvaluatorMismatchQuadrantId | null {
  if (classification === "FAVORABLE_RESOLUTION") {
    return evalStatus === "PASSED" ? "PASSED_WIN" : "FAILED_WIN";
  }
  if (classification === "ADVERSE_RESOLUTION") {
    return evalStatus === "PASSED" ? "PASSED_LOSS" : "FAILED_LOSS";
  }
  return null;
}

/**
 * B-12k: evaluator rule diagnostic (teşhis) — mevcut frozen çıktılar; evaluator çağrılmaz.
 */
export function buildHistoricalEvaluatorRuleDiagnostic(
  input: BuildHistoricalEvaluatorRuleDiagnosticInput
): HistoricalEvaluatorRuleDiagnosticReport {
  const {
    lifecycleReport,
    statisticsReport,
    evaluatorDiagnosticReport,
    failureReasonAnalysisReport,
    rMultipleStatisticsReport,
    entryReferenceQualityReport,
    validationReport,
  } = input;

  const b12f =
    evaluatorDiagnosticReport ??
    analyzeIndependentTradeEvaluatorDiagnostic({
      statisticsReport,
      lifecycleReport,
      validationReport,
    });

  const trades = lifecycleReport?.trades ?? [];

  const b12mIntegration = lifecycleReport
    ? integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic({
        lifecycleReport,
        statisticsReport,
        evaluatorDiagnosticReport: b12f,
        failureReasonAnalysisReport,
      })
    : null;
  const overallDecisive = statisticsReport.overall.counts.decisiveResolutions;
  const overallWins = statisticsReport.overall.counts.wins;

  const statusAnalysis = buildStatusRows(b12f, overallDecisive, overallWins);

  const rrMap = buildEvalPairCells(trades, (t) =>
    classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio)
  );
  const rrAnalysis = HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((bucket) => {
    const row = rrMap.get(bucket) ?? {
      passed: emptyOutcomeAcc(),
      failed: emptyOutcomeAcc(),
    };
    return {
      prospectiveRrBucket: bucket,
      passed: accToEvalCell(row.passed),
      failed: accToEvalCell(row.failed),
    };
  });

  const dirMap = buildEvalPairCells(trades, (t) =>
    resolveIndependentTradeDirectionSliceKey(t)
  );
  const directionAnalysis = HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map(
    (direction) => {
      const row = dirMap.get(direction) ?? {
        passed: emptyOutcomeAcc(),
        failed: emptyOutcomeAcc(),
      };
      return {
        direction,
        passed: accToEvalCell(row.passed),
        failed: accToEvalCell(row.failed),
      };
    }
  );

  const famMap = buildEvalPairCells(trades, (t) => t.setupFamilyId || "UNKNOWN");
  const setupFamilyAnalysis = [...famMap.keys()]
    .sort()
    .map((setupFamilyId) => {
      const row = famMap.get(setupFamilyId)!;
      return {
        setupFamilyId,
        passed: accToEvalCell(row.passed),
        failed: accToEvalCell(row.failed),
      };
    });

  const geomMap = buildEvalPairCells(trades, (t) => geometryForTrade(t));
  const geometryAnalysis = ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((geometry) => {
    const row = geomMap.get(geometry) ?? {
      passed: emptyOutcomeAcc(),
      failed: emptyOutcomeAcc(),
    };
    return {
      geometry,
      passed: accToEvalCell(row.passed),
      failed: accToEvalCell(row.failed),
    };
  });

  const exitPassed = new Map<ProspectiveSetupOutcomeReplayStatus, number>();
  const exitFailed = new Map<ProspectiveSetupOutcomeReplayStatus, number>();
  let passedTotal = 0;
  let failedTotal = 0;
  for (const t of trades) {
    const es = resolveEvalStatus(t);
    if (es === "PASSED") {
      passedTotal += 1;
      exitPassed.set(t.pathOutcome, (exitPassed.get(t.pathOutcome) ?? 0) + 1);
    } else if (es === "FAILED") {
      failedTotal += 1;
      exitFailed.set(t.pathOutcome, (exitFailed.get(t.pathOutcome) ?? 0) + 1);
    }
  }
  const exitReasonAnalysis = PATH_OUTCOMES.map((pathOutcome) => ({
    pathOutcome,
    passed: {
      count: exitPassed.get(pathOutcome) ?? 0,
      shareWithinPassed:
        passedTotal === 0
          ? null
          : (exitPassed.get(pathOutcome) ?? 0) / passedTotal,
    },
    failed: {
      count: exitFailed.get(pathOutcome) ?? 0,
      shareWithinFailed:
        failedTotal === 0
          ? null
          : (exitFailed.get(pathOutcome) ?? 0) / failedTotal,
    },
  }));

  const durMap = buildEvalPairCells(trades, (t) => {
    const b = resolveDurationBucket(t.lifecycleDurationBars);
    return b ?? null;
  });
  const durationAnalysis = INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map(
    (durationBucket) => {
      const row = durMap.get(durationBucket) ?? {
        passed: emptyOutcomeAcc(),
        failed: emptyOutcomeAcc(),
      };
      return {
        durationBucket,
        passed: accToEvalCell(row.passed),
        failed: accToEvalCell(row.failed),
      };
    }
  );

  const theoreticalRAnalysis = rMultipleStatisticsReport
    ? {
        available: true,
        source: "B-12g HistoricalIndependentTradeRMultipleStatisticsReport.byEvaluation",
        passed: rMultipleStatisticsReport.byEvaluation.PASSED,
        failed: rMultipleStatisticsReport.byEvaluation.FAILED,
        insufficientContext:
          rMultipleStatisticsReport.byEvaluation.INSUFFICIENT_CONTEXT,
        note: "B-12k does not recompute R; consumes B-12g slices only.",
      }
    : {
        available: false,
        source: "not available from canonical input",
        passed: null,
        failed: null,
        insufficientContext: null,
        note: "Pass rMultipleStatisticsReport to enable theoretical R × evaluator view.",
      };

  const mismatch = b12f.mismatch;
  const passedLossRate =
    mismatch.passedDecisive === 0
      ? null
      : mismatch.passedLosses / mismatch.passedDecisive;
  const failedLossRate =
    mismatch.failedDecisive === 0
      ? null
      : mismatch.failedLosses / mismatch.failedDecisive;

  const mismatchAnalysis = {
    ...mismatch,
    passedLossRate,
    failedLossRate,
    winRateDifferencePercentagePoints:
      mismatch.decisiveWinRateDifferencePercentagePoints,
    b12fParityNote:
      "mismatch counts and win-rate gap are canonical with B-12f EvaluatorDiagnosticMismatchSummary.",
  };

  const quadrants: Record<EvaluatorMismatchQuadrantId, IndependentTradeUnit[]> =
    {
      PASSED_WIN: [],
      PASSED_LOSS: [],
      FAILED_WIN: [],
      FAILED_LOSS: [],
    };
  for (const t of trades) {
    const es = resolveEvalStatus(t);
    if (es !== "PASSED" && es !== "FAILED") {
      continue;
    }
    const q = quadrantId(es, t.policyClassification);
    if (q) {
      quadrants[q].push(t);
    }
  }

  const quadrantProfiles: EvaluatorRuleDiagnosticQuadrantProfile[] = (
    [
      "PASSED_WIN",
      "PASSED_LOSS",
      "FAILED_WIN",
      "FAILED_LOSS",
    ] as const
  ).map((quadrant) => {
    const group = quadrants[quadrant];
    const evalStatus = quadrant.startsWith("PASSED") ? "PASSED" : "FAILED";
    const evalDecisive =
      evalStatus === "PASSED"
        ? mismatch.passedDecisive
        : mismatch.failedDecisive;
    const dirDist = Object.fromEntries(
      HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [k, 0])
    ) as Record<HistoricalPositionOutcomeDirectionSliceKey, number>;
    const rrDist = Object.fromEntries(
      HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((k) => [k, 0])
    ) as Record<(typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number], number>;
    const famDist: Record<string, number> = {};
    const geomDist = Object.fromEntries(
      ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, 0])
    ) as Record<EntryReferenceGeometryQuality, number>;
    const exitDist = Object.fromEntries(
      PATH_OUTCOMES.map((p) => [p, 0])
    ) as Record<ProspectiveSetupOutcomeReplayStatus, number>;
    const durDist = Object.fromEntries(
      INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((d) => [d, 0])
    ) as Record<IndependentTradeDurationBucketId, number>;

    for (const t of group) {
      dirDist[resolveIndependentTradeDirectionSliceKey(t)] += 1;
      rrDist[classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio)] += 1;
      const fam = t.setupFamilyId || "UNKNOWN";
      famDist[fam] = (famDist[fam] ?? 0) + 1;
      geomDist[geometryForTrade(t)] += 1;
      exitDist[t.pathOutcome] += 1;
      const db = resolveDurationBucket(t.lifecycleDurationBars);
      if (db) {
        durDist[db] += 1;
      }
    }

    return {
      quadrant,
      count: group.length,
      percentageOfEvaluatorGroup:
        evalDecisive === 0 ? null : group.length / evalDecisive,
      percentageOfAllDecisive:
        overallDecisive === 0 ? null : group.length / overallDecisive,
      directionDistribution: dirDist,
      rrBucketDistribution: rrDist,
      setupFamilyDistribution: famDist,
      geometryDistribution: geomDist,
      exitReasonDistribution: exitDist,
      durationBucketDistribution: durDist,
    };
  });

  const condDir = buildConditionalPair(trades, (t) =>
    resolveIndependentTradeDirectionSliceKey(t)
  );
  const condRr = buildConditionalPair(trades, (t) =>
    classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio)
  );
  const condFam = buildConditionalPair(
    trades,
    (t) => t.setupFamilyId || "UNKNOWN"
  );
  const condGeom = buildConditionalPair(trades, (t) => geometryForTrade(t));
  const condDur = buildConditionalPair(trades, (t) => {
    const b = resolveDurationBucket(t.lifecycleDurationBars);
    return b ?? null;
  });

  const emptyDir = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
      k,
      {
        wins: 0,
        losses: 0,
        decisive: 0,
        inconclusive: 0,
        unresolved: 0,
        unmeasured: 0,
      },
    ])
  ) as EvaluatorRuleDiagnosticConditionalAnalysis["passedDirectionOutcome"];

  const conditionalAnalysis: EvaluatorRuleDiagnosticConditionalAnalysis = {
    passedDirectionOutcome: {
      ...emptyDir,
      ...condDir.passed,
    } as EvaluatorRuleDiagnosticConditionalAnalysis["passedDirectionOutcome"],
    failedDirectionOutcome: {
      ...emptyDir,
      ...condDir.failed,
    } as EvaluatorRuleDiagnosticConditionalAnalysis["failedDirectionOutcome"],
    passedRrOutcome: condRr.passed as EvaluatorRuleDiagnosticConditionalAnalysis["passedRrOutcome"],
    failedRrOutcome: condRr.failed as EvaluatorRuleDiagnosticConditionalAnalysis["failedRrOutcome"],
    passedFamilyOutcome: condFam.passed,
    failedFamilyOutcome: condFam.failed,
    passedGeometryOutcome: condGeom.passed as EvaluatorRuleDiagnosticConditionalAnalysis["passedGeometryOutcome"],
    failedGeometryOutcome: condGeom.failed as EvaluatorRuleDiagnosticConditionalAnalysis["failedGeometryOutcome"],
    passedDurationOutcome: condDur.passed as EvaluatorRuleDiagnosticConditionalAnalysis["passedDurationOutcome"],
    failedDurationOutcome: condDur.failed as EvaluatorRuleDiagnosticConditionalAnalysis["failedDurationOutcome"],
  };

  return {
    schemaVersion: HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_EVALUATOR_RULE_DIAGNOSTIC",
    consumedReports: {
      statisticsSchemaVersion: statisticsReport.statisticsSchemaVersion,
      evaluatorDiagnosticSchemaVersion: b12f.schemaVersion,
      failureReasonSchemaVersion:
        b12mIntegration?.failureReasonSchemaVersion ?? null,
      rMultipleSchemaVersion: rMultipleStatisticsReport?.schemaVersion ?? null,
      entryReferenceQualitySchemaVersion:
        entryReferenceQualityReport?.schemaVersion ?? null,
      validationSchemaVersion:
        validationReport?.configuration.validationSchemaVersion ?? null,
    },
    population: {
      independentTrades: statisticsReport.overall.counts.totalTrades,
      decisiveResolutions: overallDecisive,
      snapshotReference: statisticsReport.snapshotReference,
      primaryPopulationNote:
        "Primary: IndependentTradeLifecycleReport.trades[]; evaluator status frozen as tradeEvaluationStatus only.",
    },
    overall: {
      decisiveWinRate: statisticsReport.overall.rates.winRate_decisive.value,
      researchQuestion:
        "Under which frozen evaluator statuses are historical decisive outcomes historically associated with PASSED versus FAILED?",
    },
    statusAnalysis,
    failureReasonAnalysis:
      b12mIntegration?.failureReasonAnalysis ??
      failureReasonAnalysisUnavailableWhenNoLifecycle(),
    failedWinFailureReasonAnalysis:
      b12mIntegration?.failedWinFailureReasonAnalysis ??
      failedWinFailureReasonAnalysisUnavailable(),
    rrAnalysis,
    directionAnalysis,
    setupFamilyAnalysis,
    geometryAnalysis,
    exitReasonAnalysis,
    durationAnalysis,
    theoreticalRAnalysis,
    prospectiveVsTheoreticalR: {
      prospectiveRrSource:
        "IndependentTradeUnit.canonicalRrRatio ← B-9d evaluation.references.rr.ratio",
      theoreticalRSource: "B-12g byEvaluation slice (when report provided)",
      evaluatorDiagnosticsRrNote:
        "TradeEvaluationDiagnostics.rrRatio is not frozen in B-12b; do not mix with prospective RR.",
    },
    mismatchAnalysis,
    quadrantProfiles,
    conditionalAnalysis,
    fieldAudit: buildFieldAudit(),
    b12fReference: {
      mismatch: b12f.mismatch as EvaluatorDiagnosticMismatchSummary,
      passedWinRate: b12f.evaluation.passed.decisiveWinRate,
      failedWinRate: b12f.evaluation.failed.decisiveWinRate,
    },
    warnings: WARNINGS,
  };
}
