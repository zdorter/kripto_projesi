import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import { netTargetMarginPercentage } from "./historical-cost-aware-counterfactual-analysis";
import {
  aggregateScenario,
  collectHistoricalDelayedEntrySimulations,
  DELAYED_ENTRY_SCENARIOS,
} from "./historical-delayed-entry-research";
import { PRICE_MOVE_REWARD_BUCKET_IDS } from "./historical-entry-price-move-quality-analysis-types";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";
import type { CounterfactualTargetModelId } from "./historical-delayed-entry-research-types";
import type { HistoricalDelayedEntryTradeSimResult } from "./historical-delayed-entry-research-types";
import type { DelayedEntryScenario } from "./historical-delayed-entry-research";
import {
  DECISION_AUDIT_COST_SCENARIOS_PERCENT,
  HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION,
  type B18ParityCheckRow,
  type BuildHistoricalDelayedEntryDecisionAuditInput,
  type CostMatrixCell,
  type DecisionComparisonRow,
  type HistoricalDelayedEntryDecisionAuditReport,
  type ImprovementDistributionRow,
  type InvalidationModelComparisonRow,
  type MissedEntryDetailRow,
} from "./historical-delayed-entry-decision-audit-types";

const WARNINGS: readonly string[] = [
  "counterfactual_delayed_entry_decision_audit_only",
  "no_production_entry_rule",
  "no_optimal_or_best_retracement_language",
  "i2_not_production_invalidation",
  "t2_not_production_target",
  "profitability_not_established",
  "temporal_split_not_oos",
];

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

function median(nums: number[]): number | null {
  return percentile(nums, 0.5);
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function closeEnough(a: number | null, b: number | null, eps = 1e-6): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= eps;
}

function scenarioKey(scenario: DelayedEntryScenario): string {
  return `${scenario.model}:${scenario.levelLabel}`;
}

function verifyB18Parity(
  b18: BuildHistoricalDelayedEntryDecisionAuditInput["delayedEntryResearchReport"],
  recomputedT1: ReturnType<typeof aggregateScenario>[],
  recomputedT2: ReturnType<typeof aggregateScenario>[]
): { allMatch: boolean; rows: B18ParityCheckRow[] } {
  const rows: B18ParityCheckRow[] = [];
  for (let i = 0; i < DELAYED_ENTRY_SCENARIOS.length; i++) {
    const scenario = DELAYED_ENTRY_SCENARIOS[i]!;
    const b18t1 = b18.comparisonTableT1[i];
    const b18t2 = b18.comparisonTableT2[i];
    const rt1 = recomputedT1[i];
    const rt2 = recomputedT2[i];
    if (!b18t1 || !rt1) continue;
    const checks: { field: string; a: number | null; b: number | null }[] = [
      { field: "fillRate", a: b18t1.fillRate, b: rt1.fillRate },
      { field: "medianImprovement", a: b18t1.medianImprovement, b: rt1.medianImprovement },
      { field: "targetReachRate", a: b18t1.targetReachRate, b: rt1.targetReachRate },
      { field: "missedEntryCount", a: b18t1.missedEntryCount, b: rt1.missedEntryCount },
    ];
    for (const c of checks) {
      rows.push({
        model: scenario.model,
        levelLabel: scenario.levelLabel,
        targetModel: "T1_FROZEN_TARGET",
        field: c.field,
        b18Value: c.a,
        recomputedValue: c.b,
        match:
          c.field === "missedEntryCount"
            ? c.a === c.b
            : closeEnough(c.a, c.b, c.field === "fillRate" ? 1e-9 : 1e-4),
      });
    }
    if (b18t2 && rt2) {
      rows.push({
        model: scenario.model,
        levelLabel: scenario.levelLabel,
        targetModel: "T2_REPROJECTED_TARGET",
        field: "targetReachRate",
        b18Value: b18t2.targetReachRate,
        recomputedValue: rt2.targetReachRate,
        match: closeEnough(b18t2.targetReachRate, rt2.targetReachRate, 1e-9),
      });
    }
  }
  return { allMatch: rows.every((r) => r.match), rows };
}

function aggregateInvalidationRow(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario,
  targetModel: CounterfactualTargetModelId,
  invModel: "I1_FROZEN_INVALIDATION" | "I2_RELATIVE_RISK_REFERENCE"
): InvalidationModelComparisonRow {
  const filled = results.filter((r) => r.status === "ENTRY_FILLED");
  const risks = filled
    .map((r) => (invModel === "I1_FROZEN_INVALIDATION" ? r.riskPctI1 : r.riskPctI2))
    .filter((x): x is number => x !== null);
  const rrs = filled
    .map((r) => {
      if (invModel === "I1_FROZEN_INVALIDATION") {
        return targetModel === "T1_FROZEN_TARGET" ? r.rrT1I1 : r.rrT2I1;
      }
      return targetModel === "T1_FROZEN_TARGET" ? r.rrT1I2 : r.rrT2I2;
    })
    .filter((x): x is number => x !== null);
  const paths = filled.map((r) => {
    const path =
      targetModel === "T1_FROZEN_TARGET"
        ? invModel === "I1_FROZEN_INVALIDATION"
          ? r.pathT1I1
          : r.pathT1I2
        : invModel === "I1_FROZEN_INVALIDATION"
          ? r.pathT2I1
          : r.pathT2I2;
    return path;
  });
  const targetReached = paths.filter((p) => p === "TARGET_REACHED").length;
  const invReached = paths.filter((p) => p === "INVALIDATION_REACHED").length;
  return {
    model: scenario.model,
    levelLabel: scenario.levelLabel,
    targetModel,
    invalidationModel: invModel,
    trades: results.length,
    filled: filled.length,
    medianRiskPct: median(risks),
    medianCounterfactualRr: median(rrs),
    invalidationRate: filled.length > 0 ? invReached / filled.length : null,
    targetReachRate: filled.length > 0 ? targetReached / filled.length : null,
    note:
      invModel === "I2_RELATIVE_RISK_REFERENCE"
        ? "I2 is counterfactual anchor-relative risk reference; not production invalidation."
        : "I1 uses frozen lifecycle invalidationReferencePrice.",
  };
}

function buildCostMatrix(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario,
  targetModel: CounterfactualTargetModelId
): CostMatrixCell[] {
  const filled = results.filter((r) => r.status === "ENTRY_FILLED");
  return DECISION_AUDIT_COST_SCENARIOS_PERCENT.map((costPct) => {
    const grossMargins = filled
      .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2))
      .filter((x): x is number => x !== null);
    const reached = filled.filter((r) => {
      const path =
        targetModel === "T1_FROZEN_TARGET"
          ? r.pathT1I1 === "TARGET_REACHED"
          : r.pathT2I1 === "TARGET_REACHED";
      return path;
    });
    const netMargins = reached
      .map((r) => {
        const gross = targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2;
        return netTargetMarginPercentage(gross, costPct);
      })
      .filter((x): x is number => x !== null);
    const covered = reached.filter((r) => {
      const gross = targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2;
      const net = netTargetMarginPercentage(gross, costPct);
      return net !== null && net >= 0;
    }).length;
    return {
      model: scenario.model,
      levelLabel: scenario.levelLabel,
      targetModel,
      roundTripCostPercent: costPct,
      reached: reached.length,
      costCovered: covered,
      costCoverageRate: reached.length > 0 ? covered / reached.length : null,
      meanGrossMarginPercent: mean(
        reached
          .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2))
          .filter((x): x is number => x !== null)
      ),
      medianGrossMarginPercent: median(
        reached
          .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2))
          .filter((x): x is number => x !== null)
      ),
      meanNetMarginPercent: mean(netMargins),
      medianNetMarginPercent: median(netMargins),
      tag: "COUNTERFACTUAL_ENTRY_MODEL",
    };
  });
}

function missedEntryDetail(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario
): MissedEntryDetailRow {
  const filled = results.filter((r) => r.status === "ENTRY_FILLED").length;
  const notFilledRows = results.filter((r) => r.status === "ENTRY_NOT_FILLED");
  const canonCount = (event: CounterfactualReplayEvent) =>
    notFilledRows.filter((r) => r.canonicalReplayEvent === event).length;
  const mfe = notFilledRows
    .map((r) => r.maxFavorableMovePctBeforeFill)
    .filter((x): x is number => x !== null);
  return {
    model: scenario.model,
    levelLabel: scenario.levelLabel,
    total: results.length,
    filled,
    notFilled: notFilledRows.length,
    canonicalTargetReached: canonCount("TARGET_REACHED"),
    canonicalInvalidationReached: canonCount("INVALIDATION_REACHED"),
    canonicalNoTouch: canonCount("NOT_REACHED_WITHIN_HORIZON"),
    canonicalAmbiguous: canonCount("AMBIGUOUS_SAME_BAR"),
    medianMaxFavorableMovePctBeforeFill: median(mfe),
    counterfactualReferenceNote:
      "Canonical E-close outcomes on missed-fill trades are COUNTERFACTUAL_REFERENCE only.",
  };
}

function improvementRow(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario
): ImprovementDistributionRow {
  const n = results.length;
  const filled = results.filter((r) => r.status === "ENTRY_FILLED");
  const improvements = filled
    .map((r) => r.improvementPct)
    .filter((x): x is number => x !== null);
  const notFilled = results.filter((r) => r.status === "ENTRY_NOT_FILLED").length;
  return {
    model: scenario.model,
    levelLabel: scenario.levelLabel,
    meanImprovement: mean(improvements),
    medianImprovement: median(improvements),
    p25Improvement: percentile(improvements, 0.25),
    p75Improvement: percentile(improvements, 0.75),
    minImprovement: improvements.length ? Math.min(...improvements) : null,
    maxImprovement: improvements.length ? Math.max(...improvements) : null,
    fillRate: n > 0 ? filled.length / n : null,
    missedRate: n > 0 ? notFilled / n : null,
  };
}

function decisionRow(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario,
  t1Agg: ReturnType<typeof aggregateScenario>,
  t2Agg: ReturnType<typeof aggregateScenario>
): DecisionComparisonRow {
  const n = results.length;
  const filled = results.filter((r) => r.status === "ENTRY_FILLED").length;
  const missed = results.filter((r) => r.status === "ENTRY_NOT_FILLED").length;
  const q = classifyHistoricalIndependentTradeSampleSize(n);
  return {
    model: scenario.model,
    levelLabel: scenario.levelLabel,
    fillRate: t1Agg.fillRate,
    missedRate: n > 0 ? missed / n : null,
    medianImprovement: t1Agg.medianImprovement,
    t1TargetReachRate: t1Agg.targetReachRate,
    t2TargetReachRate: t2Agg.targetReachRate,
    medianRrI1: t1Agg.medianCounterfactualRr,
    costCoverageAt020: t1Agg.costCoverageAt020,
    fillRateWilson95: computeIndependentTradeWinRateConfidenceInterval(filled, n - filled, 0.95),
    sampleSizeQuality: q,
    interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE" || n < 10,
    tag: "COUNTERFACTUAL_ENTRY_MODEL",
  };
}

export function buildHistoricalDelayedEntryDecisionAudit(
  input: BuildHistoricalDelayedEntryDecisionAuditInput
): HistoricalDelayedEntryDecisionAuditReport {
  const { lifecycleReport, delayedEntryResearchReport: b18 } = input;
  const simInput = {
    lifecycleReport,
    candles: input.candles,
    reachabilityReplayReport: input.reachabilityReplayReport,
    displacementEqualityTargetMechanicsReport: input.displacementEqualityTargetMechanicsReport,
    structuralExtremeVsDisplacementTargetAnalysisReport:
      input.structuralExtremeVsDisplacementTargetAnalysisReport,
  };
  const sim = collectHistoricalDelayedEntrySimulations(simInput);
  const recomputedT1: ReturnType<typeof aggregateScenario>[] = [];
  const recomputedT2: ReturnType<typeof aggregateScenario>[] = [];
  for (const scenario of DELAYED_ENTRY_SCENARIOS) {
    const results = sim.resultsByScenarioKey[scenarioKey(scenario)] ?? [];
    recomputedT1.push(aggregateScenario(results, scenario, "T1_FROZEN_TARGET"));
    recomputedT2.push(aggregateScenario(results, scenario, "T2_REPROJECTED_TARGET"));
  }
  const parity = verifyB18Parity(b18, recomputedT1, recomputedT2);
  const auditBlocked = !parity.allMatch;

  const failedIds = new Set(
    lifecycleReport.trades
      .filter(
        (t) =>
          t.tradeEvaluationStatus === "FAILED" && t.policyClassification === "FAVORABLE_RESOLUTION"
      )
      .map((t) => t.tradeId)
  );
  const passedAdvIds = new Set(
    lifecycleReport.trades
      .filter(
        (t) => t.tradeEvaluationStatus === "PASSED" && t.policyClassification === "ADVERSE_RESOLUTION"
      )
      .map((t) => t.tradeId)
  );

  const invalidationRows: InvalidationModelComparisonRow[] = [];
  const costCells: CostMatrixCell[] = [];
  const missedRows: MissedEntryDetailRow[] = [];
  const improvementRows: ImprovementDistributionRow[] = [];
  const decisionRows: DecisionComparisonRow[] = [];
  const mfeMaeSummary: HistoricalDelayedEntryDecisionAuditReport["mfeMaeSummary"][number][] = [];
  const timeToFillSummary: HistoricalDelayedEntryDecisionAuditReport["timeToFillSummary"][number][] = [];
  const targetReachDetail: HistoricalDelayedEntryDecisionAuditReport["targetReachDetail"][number][] = [];

  for (const scenario of DELAYED_ENTRY_SCENARIOS) {
    const results = sim.resultsByScenarioKey[scenarioKey(scenario)] ?? [];
    const t1 = recomputedT1.find((r) => r.model === scenario.model && r.levelLabel === scenario.levelLabel)!;
    const t2 = recomputedT2.find((r) => r.model === scenario.model && r.levelLabel === scenario.levelLabel)!;
    for (const targetModel of ["T1_FROZEN_TARGET", "T2_REPROJECTED_TARGET"] as const) {
      invalidationRows.push(aggregateInvalidationRow(results, scenario, targetModel, "I1_FROZEN_INVALIDATION"));
      invalidationRows.push(aggregateInvalidationRow(results, scenario, targetModel, "I2_RELATIVE_RISK_REFERENCE"));
      costCells.push(...buildCostMatrix(results, scenario, targetModel));
    }
    missedRows.push(missedEntryDetail(results, scenario));
    improvementRows.push(improvementRow(results, scenario));
    decisionRows.push(decisionRow(results, scenario, t1, t2));

    const filled = results.filter((r) => r.status === "ENTRY_FILLED");
    mfeMaeSummary.push({
      model: scenario.model,
      levelLabel: scenario.levelLabel,
      medianMfePct: median(filled.map((r) => r.mfePct).filter((x): x is number => x !== null)),
      medianMaePct: median(filled.map((r) => r.maePct).filter((x): x is number => x !== null)),
      medianMfeToTargetRatio: median(
        filled.map((r) => r.mfeToTargetDistanceRatio).filter((x): x is number => x !== null)
      ),
      medianMaeToRiskRatio: median(
        filled.map((r) => r.maeToRiskDistanceRatio).filter((x): x is number => x !== null)
      ),
      outcomeWindowNote: "Post-fill path from ENTRY_FILL_BAR+1; fill bar excluded from outcome touches.",
    });
    const barsFill = filled
      .map((r) => r.fillBarOffset)
      .filter((b): b is number => b !== null);
    timeToFillSummary.push({
      model: scenario.model,
      levelLabel: scenario.levelLabel,
      medianBarsToFill: median(barsFill),
      p25BarsToFill: percentile(barsFill, 0.25),
      p75BarsToFill: percentile(barsFill, 0.75),
      medianBarsToTargetAfterFill: median(
        filled.map((r) => r.barsToTargetT1).filter((b): b is number => b !== null)
      ),
      medianBarsToInvalidationI1: median(
        filled.map((r) => r.barsToInvalidationT1).filter((b): b is number => b !== null)
      ),
    });
    for (const targetModel of ["T1_FROZEN_TARGET", "T2_REPROJECTED_TARGET"] as const) {
      for (const invModel of ["I1_FROZEN_INVALIDATION", "I2_RELATIVE_RISK_REFERENCE"] as const) {
        const paths = filled.map((r) => {
          if (targetModel === "T1_FROZEN_TARGET") {
            return invModel === "I1_FROZEN_INVALIDATION" ? r.pathT1I1 : r.pathT1I2;
          }
          return invModel === "I1_FROZEN_INVALIDATION" ? r.pathT2I1 : r.pathT2I2;
        });
        const barsT = filled
          .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.barsToTargetT1 : r.barsToTargetT2))
          .filter((b): b is number => b !== null);
        targetReachDetail.push({
          model: scenario.model,
          levelLabel: scenario.levelLabel,
          targetModel,
          invalidationModel: invModel,
          targetReachRate:
            filled.length > 0
              ? paths.filter((p) => p === "TARGET_REACHED").length / filled.length
              : null,
          invalidationFirstRate:
            filled.length > 0
              ? paths.filter((p) => p === "INVALIDATION_REACHED").length / filled.length
              : null,
          noTouchRate:
            filled.length > 0
              ? paths.filter((p) => p === "NOT_REACHED_WITHIN_HORIZON").length / filled.length
              : null,
          ambiguousRate:
            filled.length > 0 ? paths.filter((p) => p === "AMBIGUOUS_SAME_BAR").length / filled.length : null,
          medianBarsToTarget: median(barsT),
        });
      }
    }
  }

  const cohortDecision = (ids: Set<string>) =>
    DELAYED_ENTRY_SCENARIOS.map((scenario) => {
      const results = (sim.resultsByScenarioKey[scenarioKey(scenario)] ?? []).filter((r) =>
        ids.has(r.tradeId)
      );
      const t1 = aggregateScenario(results, scenario, "T1_FROZEN_TARGET");
      const t2 = aggregateScenario(results, scenario, "T2_REPROJECTED_TARGET");
      return decisionRow(results, scenario, t1, t2);
    });

  const baselineRows = sim.resultsByScenarioKey[`MODEL_D_NO_DELAY_BASELINE:0%`] ?? [];
  const targetRewardBucketAudit = PRICE_MOVE_REWARD_BUCKET_IDS.filter(
    (id) => id !== "REWARD_NOT_APPLICABLE"
  ).map((bucketLabel) => {
    const ids = new Set(baselineRows.filter((r) => r.rewardBucket === bucketLabel).map((r) => r.tradeId));
    const rows = DELAYED_ENTRY_SCENARIOS.map((scenario) => {
      const results = (sim.resultsByScenarioKey[scenarioKey(scenario)] ?? []).filter((r) =>
        ids.has(r.tradeId)
      );
      const t1 = aggregateScenario(results, scenario, "T1_FROZEN_TARGET");
      const t2 = aggregateScenario(results, scenario, "T2_REPROJECTED_TARGET");
      return decisionRow(results, scenario, t1, t2);
    });
    return { bucketLabel, rows };
  });

  const modelA25 = decisionRows.find(
    (r) => r.model === "MODEL_A_FIXED_RETRACEMENT" && r.levelLabel === "0.25%"
  );
  const modelA100 = decisionRows.find(
    (r) => r.model === "MODEL_A_FIXED_RETRACEMENT" && r.levelLabel === "1.00%"
  );
  const i1a25 = invalidationRows.find(
    (r) =>
      r.model === "MODEL_A_FIXED_RETRACEMENT" &&
      r.levelLabel === "0.25%" &&
      r.invalidationModel === "I1_FROZEN_INVALIDATION" &&
      r.targetModel === "T1_FROZEN_TARGET"
  );
  const i2a25 = invalidationRows.find(
    (r) =>
      r.model === "MODEL_A_FIXED_RETRACEMENT" &&
      r.levelLabel === "0.25%" &&
      r.invalidationModel === "I2_RELATIVE_RISK_REFERENCE" &&
      r.targetModel === "T1_FROZEN_TARGET"
  );
  const blockedAns = "Blocked: B-18 parity mismatch — see b18Parity.rows.";
  const diagnosticSummary: HistoricalDelayedEntryDecisionAuditReport["diagnosticSummary"] = [
    {
      question: "1. E-close entry ne kadar sık gerçekleşiyor?",
      answer: auditBlocked
        ? blockedAns
        : `MODEL_D fill ${((decisionRows.find((r) => r.model === "MODEL_D_NO_DELAY_BASELINE")?.fillRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "2. Delayed entry fill rate retracement ile nasıl değişiyor?",
      answer: auditBlocked
        ? blockedAns
        : `0.25% fill ${((modelA25?.fillRate ?? 0) * 100).toFixed(1)}% vs 1.00% ${((modelA100?.fillRate ?? 0) * 100).toFixed(1)}% (descriptive).`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "3. Fill olduğunda median improvement nedir?",
      answer: auditBlocked ? blockedAns : `MODEL_A 0.50% median ${modelA25?.medianImprovement?.toFixed(3) ?? "n/a"}% (see improvementDistribution).`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "4. Missed entry oranı nedir?",
      answer: auditBlocked ? blockedAns : `MODEL_A 1.00% missed rate ${((modelA100?.missedRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "5. Entry improvement risk üzerindeki etkisi?",
      answer: auditBlocked ? blockedAns : "Compare medianRisk I1 vs baseline in invalidationComparison.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "6. Entry improvement RR üzerindeki etkisi?",
      answer: auditBlocked ? blockedAns : "medianRrI1 in decisionComparisonTable vs MODEL_D.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "7. T1 vs T2 target reach farkı?",
      answer: auditBlocked
        ? blockedAns
        : `MODEL_A 0.25% T1 ${((modelA25?.t1TargetReachRate ?? 0) * 100).toFixed(1)}% vs T2 ${((modelA25?.t2TargetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "8. I1 vs I2 invalidation farkı?",
      answer: auditBlocked
        ? blockedAns
        : `I1 inv rate ${((i1a25?.invalidationRate ?? 0) * 100).toFixed(1)}% vs I2 ${((i2a25?.invalidationRate ?? 0) * 100).toFixed(1)}% (T1).`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "9. Delayed entry target reachability?",
      answer: auditBlocked ? blockedAns : "targetReachDetail by model/level/T1/T2.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "10. Delayed entry invalidation davranışı?",
      answer: auditBlocked ? blockedAns : "invalidationComparison I1/I2 separated.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "11. Cost @0.20%?",
      answer: auditBlocked ? blockedAns : "fullCostMatrix roundTripCostPercent=0.2.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "12. Küçük target bucket?",
      answer: auditBlocked ? blockedAns : "targetRewardBucketAudit REWARD_LT_0_10 rows.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "13. Büyük target bucket?",
      answer: auditBlocked ? blockedAns : "targetRewardBucketAudit REWARD_GTE_3_00 rows.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "14. FAILED + FAVORABLE?",
      answer: auditBlocked ? blockedAns : `Cohort n≈${failedIds.size}; failedFavorableAudit table.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "15. PASSED + ADVERSE?",
      answer: auditBlocked ? blockedAns : `Cohort n≈${passedAdvIds.size}; passedAdverseAudit table.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "16. Context slices?",
      answer: auditBlocked ? blockedAns : "contextSliceAudit from B-18 (associational).",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "17. Temporal split?",
      answer: auditBlocked ? blockedAns : "TEMPORAL_DESCRIPTIVE_SPLIT from B-18 — not OOS.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "18. Direct vs associational?",
      answer: "directVsAssociational lists; cohort/context/temporal are associational.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "19. Lookahead?",
      answer: b18.lookaheadAttestation.statement,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "20. Production entry rule çıkarılabilir mi?",
      answer: "NOT_ESTABLISHED — see productionDecisionAudit.",
      tag: "NOT_ESTABLISHED",
    },
  ];

  return {
    schemaVersion: HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION,
    datasetReference: b18.datasetReference,
    population: b18.population,
    b18Parity: {
      allMatch: parity.allMatch,
      mismatchCount: parity.rows.filter((r) => !r.match).length,
      rows: parity.rows,
      note: auditBlocked
        ? "B-19 extended tables produced but parity mismatch detected — investigate before policy use."
        : "Recomputed aggregates match B-18 report within tolerance.",
    },
    auditBlocked,
    invalidationComparison: {
      i1Note: "I1_FROZEN_INVALIDATION uses lifecycle invalidationReferencePrice.",
      i2Note: "I2_RELATIVE_RISK_REFERENCE uses anchor-relative counterfactual risk; not production invalidation.",
      rows: auditBlocked ? [] : invalidationRows,
    },
    targetModelSeparation: {
      t1Note: "T1_FROZEN_CANONICAL_TARGET at E.",
      t2Note: "T2_REPROJECTED displacement target from delayed entry; not production target.",
      t1ReachSummary: auditBlocked ? [] : decisionRows,
      t2ReachSummary: auditBlocked
        ? []
        : DELAYED_ENTRY_SCENARIOS.map((scenario) => {
            const results = sim.resultsByScenarioKey[scenarioKey(scenario)] ?? [];
            const t1 = aggregateScenario(results, scenario, "T1_FROZEN_TARGET");
            const t2 = aggregateScenario(results, scenario, "T2_REPROJECTED_TARGET");
            const row = decisionRow(results, scenario, t1, t2);
            return { ...row, t1TargetReachRate: t2.targetReachRate };
          }),
    },
    fullCostMatrix: auditBlocked ? [] : costCells,
    missedEntryDetail: auditBlocked ? [] : missedRows,
    improvementDistribution: auditBlocked ? [] : improvementRows,
    missedMoveTradeOff: auditBlocked ? [] : improvementRows,
    decisionComparisonTable: auditBlocked ? [] : decisionRows,
    failedFavorableAudit: auditBlocked ? [] : cohortDecision(failedIds),
    passedAdverseAudit: auditBlocked ? [] : cohortDecision(passedAdvIds),
    temporalDescriptiveSplit: b18.temporalDescriptiveSplit,
    targetRewardBucketAudit: auditBlocked ? [] : targetRewardBucketAudit,
    contextSliceAudit: b18.contextSlices,
    mfeMaeSummary: auditBlocked ? [] : mfeMaeSummary,
    timeToFillSummary: auditBlocked ? [] : timeToFillSummary,
    targetReachDetail: auditBlocked ? [] : targetReachDetail,
    directVsAssociational: b18.directVsAssociational,
    lookaheadAttestation: b18.lookaheadAttestation,
    multipleComparisonWarning: {
      note: "Many model×level×target×invalidation comparisons; associational slices only — not multiple-testing adjusted.",
    },
    productionDecisionAudit: {
      question:
        "Bu frozen BTCUSDT 1H dataset üzerinde delayed-entry araştırması production entry rule belirlemek için yeterli mi?",
      conclusion: "NOT_ESTABLISHED",
      rationale: [
        "single_symbol_single_timeframe",
        "frozen_historical_sample",
        "counterfactual_touch_fill",
        "no_slippage_funding_execution",
        "no_out_of_sample_validation",
        "no_optimizer",
      ],
      tag: "NOT_ESTABLISHED",
    },
    diagnosticSummary,
    warnings: [...WARNINGS, ...(auditBlocked ? ["b18_parity_mismatch"] : [])],
    consumedReports: {
      delayedEntryResearchReport: true,
      reachabilityReplayReport: true,
      lifecycleReport: true,
      costAwareCounterfactualAnalysisReport: Boolean(input.costAwareCounterfactualAnalysisReport),
      historicalEntryContextTargetResearchReport: Boolean(input.historicalEntryContextTargetResearchReport),
      entryContextCombinationFutureMoveAnalysisReport: Boolean(
        input.entryContextCombinationFutureMoveAnalysisReport
      ),
      signalIndependenceAuditReport: Boolean(input.signalIndependenceAuditReport),
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
    },
  };
}
