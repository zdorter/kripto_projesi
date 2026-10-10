/**
 * Phase B-12p — counterfactual RR threshold × frozen theoretical R (observational).
 */
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { resolveCounterfactualEvaluationStatus } from "./historical-evaluator-rr-threshold-counterfactual";
import { HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS } from "./historical-evaluator-rr-threshold-counterfactual-types";
import {
  HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION,
  RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD,
  type BuildHistoricalEvaluatorRrThresholdTheoreticalRAnalysisInput,
  type HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport,
  type RrThresholdProspectiveBandComparisonRow,
  type RrThresholdTheoreticalRGroupMetrics,
  type RrThresholdTheoreticalRProspectiveBandId,
} from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import {
  classifyHistoricalMeasurementRrBucketRow,
  isValidHistoricalMeasurementRrRatio,
} from "./historical-measurement-rr-statistics";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import { computeIndependentTradeWinRateDecisive } from "./historical-independent-trade-statistics";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";

const WARNINGS: readonly string[] = [
  "counterfactual_classification",
  "historical_association",
  "theoretical_r_from_frozen_b12h",
  "prospective_rr_not_theoretical_r",
  "no_causal_inference",
  "evaluator_rules_not_changed",
  "sample_size_caution",
  "no_pnl",
  "no_execution_simulation",
  "no_strategy_optimization",
];

const PROSPECTIVE_BUCKETS: readonly HistoricalMeasurementRRBucketRow[] = [
  "LT_1_0",
  "FROM_1_0_TO_1_5",
  "FROM_1_5_TO_2_0",
  "FROM_2_0_TO_3_0",
  "GTE_3_0",
];

type FrozenR = { theoreticalR: number };

type Acc = {
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
  notClassifiable: number;
};

function emptyAcc(): Acc {
  return {
    trades: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    unmeasured: 0,
    notClassifiable: 0,
  };
}

function accumulatePolicy(acc: Acc, c: HistoricalPositionPolicyClassification): void {
  acc.trades += 1;
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

function buildFrozenRMap(
  input: BuildHistoricalEvaluatorRrThresholdTheoreticalRAnalysisInput
): Map<string, FrozenR> {
  const map = new Map<string, FrozenR>();
  for (const row of input.eligibilityAuditReport.decisiveRows) {
    if (row.theoreticalREligible && row.theoreticalR !== null && Number.isFinite(row.theoreticalR)) {
      map.set(row.tradeId, { theoreticalR: row.theoreticalR });
    }
  }
  return map;
}

function analyzeGroup(
  trades: readonly IndependentTradeUnit[],
  frozenR: Map<string, FrozenR>,
  notClassifiableCount: number
): RrThresholdTheoreticalRGroupMetrics {
  const acc = emptyAcc();
  acc.notClassifiable = notClassifiableCount;

  let rEligible = 0;
  let rUnavailableDecisive = 0;
  let sumR = 0;
  const winRs: number[] = [];
  const lossRs: number[] = [];

  for (const t of trades) {
    accumulatePolicy(acc, t.policyClassification);
    const isDecisive =
      t.policyClassification === "FAVORABLE_RESOLUTION" ||
      t.policyClassification === "ADVERSE_RESOLUTION";
    if (!isDecisive) {
      continue;
    }
    const fr = frozenR.get(t.tradeId);
    if (!fr) {
      rUnavailableDecisive += 1;
      continue;
    }
    rEligible += 1;
    const r = fr.theoreticalR;
    sumR += r;
    if (t.policyClassification === "FAVORABLE_RESOLUTION") {
      winRs.push(r);
    } else {
      lossRs.push(r);
    }
  }

  const winRate = computeIndependentTradeWinRateDecisive(acc.wins, acc.losses);
  const averageWinR =
    winRs.length === 0 ? null : winRs.reduce((a, b) => a + b, 0) / winRs.length;
  const averageLossR =
    lossRs.length === 0 ? null : lossRs.reduce((a, b) => a + b, 0) / lossRs.length;
  const grossPositiveR = winRs.reduce((a, b) => a + b, 0);
  const grossNegativeR = lossRs.reduce((a, b) => a + b, 0);
  const profitFactorR =
    grossNegativeR === 0 ? null : grossPositiveR / Math.abs(grossNegativeR);

  return {
    trades: acc.trades,
    decisive: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    unmeasured: acc.unmeasured,
    notClassifiableProspectiveRr: notClassifiableCount,
    decisiveWinRate: winRate,
    wilson95: computeIndependentTradeWinRateConfidenceInterval(acc.wins, acc.losses, 0.95),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
    theoreticalREligibleDecisive: rEligible,
    theoreticalRUnavailableDecisive: rUnavailableDecisive,
    expectancyDenominatorId: "THEORETICAL_R_ELIGIBLE_DECISIVE",
    sumR,
    expectancyR: rEligible === 0 ? null : sumR / rEligible,
    averageWinR,
    averageLossR,
    profitFactorR,
    frozenTheoreticalRNote:
      "sumR/expectancyR use frozen B-12h theoreticalR; decisive trades without frozen R are excluded from R denominators.",
  };
}

function resolveProspectiveBand(
  ratio: number | null
): RrThresholdTheoreticalRProspectiveBandId | null {
  if (!isValidHistoricalMeasurementRrRatio(ratio)) {
    return null;
  }
  if (ratio < 1.0) {
    return "RR_LT_1_0";
  }
  if (ratio < 1.5) {
    return "RR_1_0_TO_1_5";
  }
  return "RR_GTE_1_5";
}

function buildDiagnosticSummary(
  passTable: HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport["passComparisonTable"],
  baseline: number
): readonly string[] {
  const low = passTable.find((r) => r.threshold === 0.5);
  const base = passTable.find((r) => r.threshold === baseline);
  const lines: string[] = [];
  if (!low || !base) {
    return ["Insufficient counterfactual PASS rows for diagnostic summary."];
  }
  const deltaPop = low.passTrades - base.passTrades;
  const deltaExp =
    low.passExpectancyR != null && base.passExpectancyR != null
      ? low.passExpectancyR - base.passExpectancyR
      : null;
  lines.push(
    `Counterfactual threshold 0.50 vs ${baseline}: PASS population changes by ${deltaPop} trades (descriptive counterfactual classification).`
  );
  if (deltaExp !== null) {
    const direction =
      Math.abs(deltaExp) < 1e-6
        ? "does not materially change observed PASS-group frozen theoretical expectancyR"
        : deltaExp > 0
          ? "is historically associated with higher observed PASS-group frozen theoretical expectancyR"
          : "is historically associated with lower observed PASS-group frozen theoretical expectancyR";
    lines.push(
      `Lower threshold adding trades to counterfactual PASS ${direction} (requires further validation; not causal).`
    );
  }
  lines.push(
    "Prospective RR (canonicalRrRatio) governs counterfactual labels only; theoretical R values are frozen path-derived references."
  );
  return lines;
}

export function buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis(
  input: BuildHistoricalEvaluatorRrThresholdTheoreticalRAnalysisInput
): HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport {
  const trades = input.lifecycleReport.trades;
  const frozenR = buildFrozenRMap(input);

  const thresholdSlices = HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS.map(
    (threshold) => {
      const pass: IndependentTradeUnit[] = [];
      const fail: IndependentTradeUnit[] = [];
      const unknown: IndependentTradeUnit[] = [];
      for (const t of trades) {
        const cf = resolveCounterfactualEvaluationStatus(t.canonicalRrRatio, threshold);
        if (cf === "NOT_CLASSIFIABLE") {
          unknown.push(t);
        } else if (cf === "PASSED") {
          pass.push(t);
        } else {
          fail.push(t);
        }
      }
      return {
        threshold,
        counterfactualPassed: analyzeGroup(pass, frozenR, 0),
        counterfactualFailed: analyzeGroup(fail, frozenR, 0),
        notClassifiable: {
          ...analyzeGroup(unknown, frozenR, unknown.length),
          notClassifiableProspectiveRr: unknown.length,
        },
      };
    }
  );

  const passComparisonTable = thresholdSlices.map((s) => ({
    threshold: s.threshold,
    passTrades: s.counterfactualPassed.trades,
    passDecisive: s.counterfactualPassed.decisive,
    passWins: s.counterfactualPassed.wins,
    passLosses: s.counterfactualPassed.losses,
    passWinRate: s.counterfactualPassed.decisiveWinRate.value,
    passSumR: s.counterfactualPassed.sumR,
    passExpectancyR: s.counterfactualPassed.expectancyR,
    passProfitFactorR: s.counterfactualPassed.profitFactorR,
  }));

  const failComparisonTable = thresholdSlices.map((s) => ({
    threshold: s.threshold,
    failTrades: s.counterfactualFailed.trades,
    failDecisive: s.counterfactualFailed.decisive,
    failWins: s.counterfactualFailed.wins,
    failLosses: s.counterfactualFailed.losses,
    failWinRate: s.counterfactualFailed.decisiveWinRate.value,
    failSumR: s.counterfactualFailed.sumR,
    failExpectancyR: s.counterfactualFailed.expectancyR,
    failProfitFactorR: s.counterfactualFailed.profitFactorR,
  }));

  const currentFailedTargetTouched = HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS.map(
    (threshold) => {
      const cohort = trades.filter(
        (t) =>
          t.tradeEvaluationStatus === "FAILED" && t.pathOutcome === "TARGET_TOUCHED"
      );
      let cfPass = 0;
      let cfFail = 0;
      let cfUnknown = 0;
      for (const t of cohort) {
        const cf = resolveCounterfactualEvaluationStatus(t.canonicalRrRatio, threshold);
        if (cf === "PASSED") {
          cfPass += 1;
        } else if (cf === "FAILED") {
          cfFail += 1;
        } else {
          cfUnknown += 1;
        }
      }
      return {
        threshold,
        currentFailedTargetTouchedTrades: cohort.length,
        counterfactualPassed: cfPass,
        counterfactualFailed: cfFail,
        counterfactualNotClassifiable: cfUnknown,
      };
    }
  );

  const bucketTrades = new Map<HistoricalMeasurementRRBucketRow, IndependentTradeUnit[]>();
  for (const b of PROSPECTIVE_BUCKETS) {
    bucketTrades.set(b, []);
  }
  for (const t of trades) {
    const b = classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio);
    if (PROSPECTIVE_BUCKETS.includes(b)) {
      bucketTrades.get(b)!.push(t);
    }
  }
  const prospectiveRrBucketAnalysis = PROSPECTIVE_BUCKETS.map((bucket) => ({
    prospectiveRrBucket: bucket,
    metrics: analyzeGroup(bucketTrades.get(bucket) ?? [], frozenR, 0),
  }));

  const bandTrades = new Map<RrThresholdTheoreticalRProspectiveBandId, IndependentTradeUnit[]>([
    ["RR_LT_1_0", []],
    ["RR_1_0_TO_1_5", []],
    ["RR_GTE_1_5", []],
  ]);
  for (const t of trades) {
    const band = resolveProspectiveBand(t.canonicalRrRatio);
    if (band) {
      bandTrades.get(band)!.push(t);
    }
  }
  const bandLabels: Record<RrThresholdTheoreticalRProspectiveBandId, string> = {
    RR_LT_1_0: "prospective RR < 1.0",
    RR_1_0_TO_1_5: "prospective RR 1.0–1.5",
    RR_GTE_1_5: "prospective RR >= 1.5",
  };
  const prospectiveBandComparison: RrThresholdProspectiveBandComparisonRow[] = (
    ["RR_LT_1_0", "RR_1_0_TO_1_5", "RR_GTE_1_5"] as const
  ).map((bandId) => ({
    bandId,
    label: bandLabels[bandId],
    metrics: analyzeGroup(bandTrades.get(bandId) ?? [], frozenR, 0),
  }));

  const refPass = passComparisonTable.find(
    (r) => r.threshold === RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD
  )!;
  const refFail = failComparisonTable.find(
    (r) => r.threshold === RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD
  )!;

  const baselineDeltas = thresholdSlices.map((s) => {
    const passRow = passComparisonTable.find((r) => r.threshold === s.threshold)!;
    const failRow = failComparisonTable.find((r) => r.threshold === s.threshold)!;
    return {
      threshold: s.threshold,
      deltaPassPopulation: passRow.passTrades - refPass.passTrades,
      deltaPassWinRatePercentagePoints:
        passRow.passWinRate != null && refPass.passWinRate != null
          ? (passRow.passWinRate - refPass.passWinRate) * 100
          : null,
      deltaPassExpectancyR:
        passRow.passExpectancyR != null && refPass.passExpectancyR != null
          ? passRow.passExpectancyR - refPass.passExpectancyR
          : null,
      deltaPassProfitFactorR:
        passRow.passProfitFactorR != null && refPass.passProfitFactorR != null
          ? passRow.passProfitFactorR - refPass.passProfitFactorR
          : null,
      deltaFailWinRatePercentagePoints:
        failRow.failWinRate != null && refFail.failWinRate != null
          ? (failRow.failWinRate - refFail.failWinRate) * 100
          : null,
      deltaFailExpectancyR:
        failRow.failExpectancyR != null && refFail.failExpectancyR != null
          ? failRow.failExpectancyR - refFail.failExpectancyR
          : null,
      deltaFailProfitFactorR:
        failRow.failProfitFactorR != null && refFail.failProfitFactorR != null
          ? failRow.failProfitFactorR - refFail.failProfitFactorR
          : null,
    };
  });

  return {
    schemaVersion: HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_RR_THRESHOLD_THEORETICAL_R",
    terminology: {
      prospectiveRr: "IndependentTradeUnit.canonicalRrRatio (counterfactual classification)",
      theoreticalR: "B-12h eligibilityAudit.decisiveRows[].theoreticalR (frozen)",
      counterfactualClassification: "canonicalRrRatio >= threshold => PASS (observational)",
    },
    baselineThreshold: RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD,
    population: {
      independentTrades: trades.length,
      frozenTheoreticalRRows: frozenR.size,
    },
    thresholdSlices,
    passComparisonTable,
    failComparisonTable,
    currentFailedTargetTouched,
    prospectiveRrBucketAnalysis,
    prospectiveBandComparison,
    baselineDeltas,
    diagnosticSummary: buildDiagnosticSummary(
      passComparisonTable,
      RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD
    ),
    warnings: WARNINGS,
  };
}
