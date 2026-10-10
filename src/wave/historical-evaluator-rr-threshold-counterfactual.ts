/**
 * Phase B-12o — RR minimum threshold counterfactual classification (observational).
 * Uses frozen lifecycle prospective RR only; does not call evaluateTradeEvaluation or rebuild path/R pipelines.
 */
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import { mapAuditGeometryToEntryReferenceQuality } from "./historical-entry-reference-quality-analysis";
import type { TheoreticalRGeometryClassification } from "./historical-independent-trade-r-eligibility-audit-types";
import {
  classifyHistoricalMeasurementRrBucketRow,
  isValidHistoricalMeasurementRrRatio,
} from "./historical-measurement-rr-statistics";
import { computeIndependentTradeWinRateDecisive } from "./historical-independent-trade-statistics";
import { resolveIndependentTradeDirectionSliceKey } from "./historical-independent-trade-statistics";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD,
  HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS,
  HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION,
  type BuildHistoricalEvaluatorRrThresholdCounterfactualInput,
  type CounterfactualEvaluationStatus,
  type CurrentEvaluationStatus,
  type HistoricalEvaluatorRrThresholdCounterfactualReport,
  type RrCounterfactualFrozenTheoreticalRSlice,
  type RrCounterfactualOutcomeSnapshot,
  type RrCounterfactualThresholdRow,
} from "./historical-evaluator-rr-threshold-counterfactual-types";

const WARNINGS: readonly string[] = [
  "counterfactual_classification",
  "observational_only",
  "no_causal_inference",
  "evaluator_rules_not_changed",
  "prospective_rr_not_theoretical_r",
  "theoretical_r_from_frozen_b12h_only",
  "no_execution_simulation",
  "no_pnl",
  "no_strategy_optimization",
  "sample_size_caution",
];

type OutcomeAcc = {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
};

function emptyAcc(): OutcomeAcc {
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

function accumulateOutcome(acc: OutcomeAcc, c: HistoricalPositionPolicyClassification): void {
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

export function resolveCounterfactualEvaluationStatus(
  canonicalRrRatio: number | null,
  threshold: number
): CounterfactualEvaluationStatus {
  if (!isValidHistoricalMeasurementRrRatio(canonicalRrRatio)) {
    return "NOT_CLASSIFIABLE";
  }
  return canonicalRrRatio >= threshold ? "PASSED" : "FAILED";
}

function resolveCurrentEvaluationStatus(
  trade: IndependentTradeUnit
): CurrentEvaluationStatus | "OTHER" {
  const s = trade.tradeEvaluationStatus;
  if (s === "PASSED" || s === "FAILED" || s === "INSUFFICIENT_CONTEXT") {
    return s;
  }
  return "OTHER";
}

function accToSnapshot(acc: OutcomeAcc): RrCounterfactualOutcomeSnapshot {
  const winRate = computeIndependentTradeWinRateDecisive(acc.wins, acc.losses);
  return {
    totalTrades: acc.total,
    decisiveTrades: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    unmeasured: acc.unmeasured,
    winRateDecisive: winRate,
    wilson95: computeIndependentTradeWinRateConfidenceInterval(acc.wins, acc.losses, 0.95),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
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

function geometryFromAudit(
  classification: TheoreticalRGeometryClassification
): EntryReferenceGeometryQuality {
  return mapAuditGeometryToEntryReferenceQuality(classification);
}

type FrozenR = { theoreticalR: number; theoreticalREligible: true };

function buildFrozenRMap(
  input: BuildHistoricalEvaluatorRrThresholdCounterfactualInput
): Map<string, FrozenR> {
  const map = new Map<string, FrozenR>();
  const rows = input.eligibilityAuditReport?.decisiveRows ?? [];
  for (const row of rows) {
    if (row.theoreticalREligible && row.theoreticalR !== null && Number.isFinite(row.theoreticalR)) {
      map.set(row.tradeId, {
        theoreticalR: row.theoreticalR,
        theoreticalREligible: true,
      });
    }
  }
  return map;
}

function aggregateFrozenTheoreticalR(
  trades: readonly IndependentTradeUnit[],
  frozenR: Map<string, FrozenR>
): RrCounterfactualFrozenTheoreticalRSlice {
  const available = frozenR.size > 0;
  if (!available) {
    return {
      available: false,
      rEligibleDecisiveTrades: 0,
      decisiveWithoutTheoreticalR: 0,
      sumR: 0,
      expectancyR: null,
      averageWinR: null,
      averageLossR: null,
      profitFactorR: null,
      note: "Supply B-12h eligibilityAuditReport.decisiveRows for frozen theoretical R reference.",
    };
  }

  let decisive = 0;
  let withoutR = 0;
  let sumR = 0;
  const winRs: number[] = [];
  const lossRs: number[] = [];

  for (const t of trades) {
    const isDecisive =
      t.policyClassification === "FAVORABLE_RESOLUTION" ||
      t.policyClassification === "ADVERSE_RESOLUTION";
    if (!isDecisive) {
      continue;
    }
    decisive += 1;
    const fr = frozenR.get(t.tradeId);
    if (!fr) {
      withoutR += 1;
      continue;
    }
    const r = fr.theoreticalR;
    sumR += r;
    if (t.policyClassification === "FAVORABLE_RESOLUTION") {
      winRs.push(r);
    } else {
      lossRs.push(r);
    }
  }

  const rEligible = decisive - withoutR;
  const averageWinR =
    winRs.length === 0 ? null : winRs.reduce((a, b) => a + b, 0) / winRs.length;
  const averageLossR =
    lossRs.length === 0 ? null : lossRs.reduce((a, b) => a + b, 0) / lossRs.length;
  const grossPositiveR = winRs.reduce((a, b) => a + b, 0);
  const grossNegativeR = lossRs.reduce((a, b) => a + b, 0);
  const profitFactorR =
    grossNegativeR === 0 ? null : grossPositiveR / Math.abs(grossNegativeR);

  return {
    available: true,
    rEligibleDecisiveTrades: rEligible,
    decisiveWithoutTheoreticalR: withoutR,
    sumR,
    expectancyR: rEligible === 0 ? null : sumR / rEligible,
    averageWinR,
    averageLossR,
    profitFactorR,
    note: "Summed from frozen B-12h theoreticalR per trade; B-12g aggregate functions not invoked.",
  };
}

function buildThresholdRow(
  threshold: number,
  trades: readonly IndependentTradeUnit[],
  frozenR: Map<string, FrozenR>,
  geometryByTradeId: Map<string, EntryReferenceGeometryQuality>
): RrCounterfactualThresholdRow {
  const passAcc = emptyAcc();
  const failAcc = emptyAcc();
  const unknownAcc = emptyAcc();

  const passTrades: IndependentTradeUnit[] = [];
  const failTrades: IndependentTradeUnit[] = [];

  let newlyPassed = 0;
  let newlyFailed = 0;
  let unchangedPassed = 0;
  let unchangedFailed = 0;
  let insufficientExcluded = 0;

  const transitionMap = new Map<
    string,
    {
      currentEvaluationStatus: CurrentEvaluationStatus;
      policyOutcome: "FAVORABLE_RESOLUTION" | "ADVERSE_RESOLUTION";
      tradeCount: number;
      counterfactualPassed: number;
      counterfactualFailed: number;
      counterfactualNotClassifiable: number;
    }
  >();

  let currentFailedWin = 0;
  let cfPassedForFailedWin = 0;
  let cfFailedForFailedWin = 0;
  let cfUnknownForFailedWin = 0;

  type DimKey = string;
  const dimStore = new Map<
    DimKey,
    { pass: OutcomeAcc; fail: OutcomeAcc; dimension: RrCounterfactualThresholdRow["dimensionSlices"][number]["dimension"]; value: string }
  >();

  const bumpDim = (
    dimension: RrCounterfactualThresholdRow["dimensionSlices"][number]["dimension"],
    value: string,
    cf: CounterfactualEvaluationStatus,
    c: HistoricalPositionPolicyClassification
  ) => {
    const key = `${dimension}\0${value}`;
    let row = dimStore.get(key);
    if (!row) {
      row = { pass: emptyAcc(), fail: emptyAcc(), dimension, value };
      dimStore.set(key, row);
    }
    if (cf === "PASSED") {
      accumulateOutcome(row.pass, c);
    } else if (cf === "FAILED") {
      accumulateOutcome(row.fail, c);
    }
  };

  for (const t of trades) {
    const cf = resolveCounterfactualEvaluationStatus(t.canonicalRrRatio, threshold);
    const current = resolveCurrentEvaluationStatus(t);

    if (cf === "NOT_CLASSIFIABLE") {
      accumulateOutcome(unknownAcc, t.policyClassification);
    } else if (cf === "PASSED") {
      accumulateOutcome(passAcc, t.policyClassification);
      passTrades.push(t);
    } else {
      accumulateOutcome(failAcc, t.policyClassification);
      failTrades.push(t);
    }

    if (current === "INSUFFICIENT_CONTEXT") {
      insufficientExcluded += 1;
    } else if (current === "PASSED" || current === "FAILED") {
      if (cf === "NOT_CLASSIFIABLE") {
        // no pass/fail transition vs current
      } else if (current === "PASSED" && cf === "PASSED") {
        unchangedPassed += 1;
      } else if (current === "FAILED" && cf === "FAILED") {
        unchangedFailed += 1;
      } else if (current === "FAILED" && cf === "PASSED") {
        newlyPassed += 1;
      } else if (current === "PASSED" && cf === "FAILED") {
        newlyFailed += 1;
      }
    }

    if (
      t.policyClassification === "FAVORABLE_RESOLUTION" ||
      t.policyClassification === "ADVERSE_RESOLUTION"
    ) {
      const cur =
        current === "PASSED" || current === "FAILED" || current === "INSUFFICIENT_CONTEXT"
          ? current
          : null;
      if (cur) {
        const tKey = `${cur}\0${t.policyClassification}`;
        let cell = transitionMap.get(tKey);
        if (!cell) {
          cell = {
            currentEvaluationStatus: cur,
            policyOutcome: t.policyClassification,
            tradeCount: 0,
            counterfactualPassed: 0,
            counterfactualFailed: 0,
            counterfactualNotClassifiable: 0,
          };
          transitionMap.set(tKey, cell);
        }
        cell.tradeCount += 1;
        if (cf === "PASSED") {
          cell.counterfactualPassed += 1;
        } else if (cf === "FAILED") {
          cell.counterfactualFailed += 1;
        } else {
          cell.counterfactualNotClassifiable += 1;
        }
      }
    }

    if (
      current === "FAILED" &&
      t.policyClassification === "FAVORABLE_RESOLUTION"
    ) {
      currentFailedWin += 1;
      if (cf === "PASSED") {
        cfPassedForFailedWin += 1;
      } else if (cf === "FAILED") {
        cfFailedForFailedWin += 1;
      } else {
        cfUnknownForFailedWin += 1;
      }
    }

    const dir = resolveIndependentTradeDirectionSliceKey(t);
    const rr = classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio);
    const fam = t.setupFamilyId || "UNKNOWN";
    const dur = resolveDurationBucket(t.lifecycleDurationBars);
    const geom = geometryByTradeId.get(t.tradeId) ?? "INSUFFICIENT_GEOMETRY";
    bumpDim("DIRECTION", dir, cf, t.policyClassification);
    bumpDim("PROSPECTIVE_RR", rr, cf, t.policyClassification);
    bumpDim("SETUP_FAMILY", fam, cf, t.policyClassification);
    bumpDim("GEOMETRY", geom, cf, t.policyClassification);
    if (dur) {
      bumpDim("DURATION", dur, cf, t.policyClassification);
    }
  }

  const dimensionSlices = [...dimStore.values()]
    .map((row) => {
      const decisive = row.pass.decisive + row.fail.decisive;
      const quality = classifyHistoricalIndependentTradeSampleSize(decisive);
      return {
        dimension: row.dimension,
        dimensionValue: row.value,
        counterfactualPassed: accToSnapshot(row.pass),
        counterfactualFailed: accToSnapshot(row.fail),
        sampleSizeQuality: quality,
        interpretWithCaution:
          quality === "VERY_SMALL_SAMPLE" || quality === "SMALL_SAMPLE",
      };
    })
    .sort(
      (a, b) =>
        a.dimension.localeCompare(b.dimension) ||
        a.dimensionValue.localeCompare(b.dimensionValue)
    );

  const outcomeTransitions = [...transitionMap.values()].sort(
    (a, b) =>
      a.currentEvaluationStatus.localeCompare(b.currentEvaluationStatus) ||
      a.policyOutcome.localeCompare(b.policyOutcome)
  );

  return {
    threshold,
    counterfactualPassed: accToSnapshot(passAcc),
    counterfactualFailed: accToSnapshot(failAcc),
    notClassifiable: accToSnapshot(unknownAcc),
    theoreticalR: {
      passed: aggregateFrozenTheoreticalR(passTrades, frozenR),
      failed: aggregateFrozenTheoreticalR(failTrades, frozenR),
      combined: aggregateFrozenTheoreticalR([...passTrades, ...failTrades], frozenR),
    },
    populationChanges: {
      newlyPassedComparedWithCurrent: newlyPassed,
      newlyFailedComparedWithCurrent: newlyFailed,
      unchangedPassed,
      unchangedFailed,
      notClassifiableRr: unknownAcc.total,
      insufficientContextExcludedFromTransition: insufficientExcluded,
    },
    outcomeTransitions,
    currentFailedHistoricalWin: {
      currentFailedHistoricalWinTrades: currentFailedWin,
      counterfactualPassedAtThreshold: cfPassedForFailedWin,
      counterfactualFailedAtThreshold: cfFailedForFailedWin,
      counterfactualNotClassifiableAtThreshold: cfUnknownForFailedWin,
      descriptiveNote:
        "CURRENT evaluator FAILED with frozen FAVORABLE_RESOLUTION; counterfactual RR-only status at this threshold (observational).",
    },
    dimensionSlices,
    comparisonToReferenceThreshold: {
      referenceThreshold: CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD,
      decisiveWinRateDeltaVsReferenceThresholdPercentagePoints: null,
      expectancyRDeltaVsReferenceThreshold: null,
    },
  };
}

/**
 * B-12o: counterfactual PASS/FAIL if prospective RR minimum were different (frozen population).
 */
export function buildHistoricalEvaluatorRrThresholdCounterfactual(
  input: BuildHistoricalEvaluatorRrThresholdCounterfactualInput
): HistoricalEvaluatorRrThresholdCounterfactualReport {
  const trades = input.lifecycleReport.trades;
  const frozenR = buildFrozenRMap(input);

  const geometryByTradeId = new Map<string, EntryReferenceGeometryQuality>();
  for (const row of input.eligibilityAuditReport?.decisiveRows ?? []) {
    geometryByTradeId.set(row.tradeId, geometryFromAudit(row.geometryClassification));
  }

  const thresholds = HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS.map((t) =>
    buildThresholdRow(t, trades, frozenR, geometryByTradeId)
  );

  const refRow = thresholds.find((r) => r.threshold === CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD);
  for (const row of thresholds) {
    const refWin =
      refRow?.counterfactualPassed.winRateDecisive.value != null &&
      refRow?.counterfactualFailed.winRateDecisive.value != null
        ? (refRow.counterfactualPassed.winRateDecisive.value! +
            refRow.counterfactualFailed.winRateDecisive.value!) /
          2
        : null;
    const rowCombinedDecisive = row.counterfactualPassed.decisiveTrades + row.counterfactualFailed.decisiveTrades;
    const rowCombinedWins = row.counterfactualPassed.wins + row.counterfactualFailed.wins;
    const rowWinRate = rowCombinedDecisive === 0 ? null : rowCombinedWins / rowCombinedDecisive;
    row.comparisonToReferenceThreshold.decisiveWinRateDeltaVsReferenceThresholdPercentagePoints =
      rowWinRate !== null && refWin !== null ? (rowWinRate - refWin) * 100 : null;
    row.comparisonToReferenceThreshold.expectancyRDeltaVsReferenceThreshold =
      row.theoreticalR.combined.expectancyR !== null &&
      refRow?.theoreticalR.combined.expectancyR != null
        ? row.theoreticalR.combined.expectancyR - refRow.theoreticalR.combined.expectancyR
        : null;
  }

  const summaryTable = thresholds.map((row) => ({
    threshold: row.threshold,
    passTrades: row.counterfactualPassed.totalTrades,
    failTrades: row.counterfactualFailed.totalTrades,
    passWinRateDecisive: row.counterfactualPassed.winRateDecisive.value,
    failWinRateDecisive: row.counterfactualFailed.winRateDecisive.value,
    decisiveTrades:
      row.counterfactualPassed.decisiveTrades + row.counterfactualFailed.decisiveTrades,
    expectancyR: row.theoreticalR.combined.expectancyR,
    profitFactorR: row.theoreticalR.combined.profitFactorR,
  }));

  const measurable = trades.filter(
    (t) => resolveCounterfactualEvaluationStatus(t.canonicalRrRatio, 0.5) !== "NOT_CLASSIFIABLE"
  ).length;

  return {
    schemaVersion: HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_RR_THRESHOLD_COUNTERFACTUAL",
    canonicalFields: {
      prospectiveRr: "IndependentTradeUnit.canonicalRrRatio",
      currentEvaluationStatus: "IndependentTradeUnit.tradeEvaluationStatus",
      theoreticalR: "B-12h eligibilityAudit.decisiveRows[].theoreticalR (frozen)",
    },
    semantics: {
      counterfactualRule:
        "canonicalRrRatio >= threshold => counterfactual PASSED; else FAILED when RR is classifiable",
      notClassifiable: "Invalid/null prospective RR => NOT_CLASSIFIABLE",
      evaluatorUnchanged: "Production evaluator thresholds and rules are not modified in B-12o",
    },
    referenceEvaluatorThreshold: CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD,
    population: {
      independentTrades: trades.length,
      measurableForCounterfactual: measurable,
    },
    thresholds,
    summaryTable,
    warnings: WARNINGS,
  };
}
