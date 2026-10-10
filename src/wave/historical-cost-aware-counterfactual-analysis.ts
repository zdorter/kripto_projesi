import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { computeGrossPriceMovePercentages } from "./historical-entry-price-move-quality-analysis";
import { classifyTargetMagnitudeRewardBucket } from "./historical-target-provenance-structural-distance-analysis";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import { ALTERNATIVE_TARGET_MODEL_IDS } from "./historical-alternative-target-model-analysis-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import {
  DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT,
  HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION,
  type BuildHistoricalCostAwareCounterfactualAnalysisInput,
  type CostMarginState,
  type HistoricalCostAwareCounterfactualAnalysisReport,
  type ModelCostScenarioMetrics,
} from "./historical-cost-aware-counterfactual-analysis-types";
import type { CounterfactualReachabilityRow } from "./historical-alternative-target-reachability-replay-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const COST_EPS = 1e-9;

const WARNINGS: readonly string[] = [
  "historical_counterfactual_descriptive_only",
  "round_trip_cost_scenario_not_actual_exchange_fee",
  "leverage_not_modeled",
  "no_funding",
  "no_slippage_model",
  "no_execution_simulation",
  "entry_assumed_reference_fill",
  "target_assumed_touch_fill",
  "stop_assumed_touch_fill",
  "not_profitability_measurement",
  "net_counterfactual_rr_not_theoretical_r",
  "target_reachability_from_b12w_unchanged",
];

const ARITHMETIC_EXAMPLE_ROWS: readonly {
  grossTargetPercent: number;
  costPercent: number;
  netMarginPercent: number;
}[] = [
  { grossTargetPercent: 0.1, costPercent: 0.1, netMarginPercent: 0 },
  { grossTargetPercent: 0.1, costPercent: 0.2, netMarginPercent: -0.1 },
  { grossTargetPercent: 0.25, costPercent: 0.1, netMarginPercent: 0.15 },
  { grossTargetPercent: 0.5, costPercent: 0.2, netMarginPercent: 0.3 },
  { grossTargetPercent: 1, costPercent: 0.2, netMarginPercent: 0.8 },
  { grossTargetPercent: 2, costPercent: 0.2, netMarginPercent: 1.8 },
];

export function classifyCostMarginState(
  grossRewardPercentage: number | null,
  roundTripCostPercentage: number
): CostMarginState {
  if (grossRewardPercentage === null || !Number.isFinite(grossRewardPercentage)) {
    return "NOT_CLASSIFIABLE";
  }
  const delta = grossRewardPercentage - roundTripCostPercentage;
  if (Math.abs(delta) <= COST_EPS) return "BREAK_EVEN_MARGIN";
  if (delta > 0) return "POSITIVE_GROSS_MARGIN";
  return "NET_NEGATIVE_MARGIN";
}

export function netTargetMarginPercentage(
  grossRewardPercentage: number | null,
  roundTripCostPercentage: number
): number | null {
  if (grossRewardPercentage === null || !Number.isFinite(grossRewardPercentage)) {
    return null;
  }
  return grossRewardPercentage - roundTripCostPercentage;
}

export function netRealizedRewardPercentage(
  replayEvent: CounterfactualReachabilityRow["replayEvent"],
  grossRewardPercentage: number | null,
  roundTripCostPercentage: number
): number | null {
  if (replayEvent !== "TARGET_REACHED") return null;
  return netTargetMarginPercentage(grossRewardPercentage, roundTripCostPercentage);
}

export function effectiveRiskWithCostPercentage(
  grossRiskPercentage: number | null,
  roundTripCostPercentage: number
): number | null {
  if (grossRiskPercentage === null || !Number.isFinite(grossRiskPercentage)) {
    return null;
  }
  return grossRiskPercentage + roundTripCostPercentage;
}

/** NET_COUNTERFACTUAL_RR — not B-12h theoretical R. */
export function netCounterfactualRr(
  replayEvent: CounterfactualReachabilityRow["replayEvent"],
  grossRewardPercentage: number | null,
  grossRiskPercentage: number | null,
  roundTripCostPercentage: number
): number | null {
  if (replayEvent !== "TARGET_REACHED") return null;
  const netReward = netTargetMarginPercentage(grossRewardPercentage, roundTripCostPercentage);
  const risk = effectiveRiskWithCostPercentage(grossRiskPercentage, roundTripCostPercentage);
  if (netReward === null || risk === null || risk <= 0) return null;
  return netReward / risk;
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

function isClassifiable(event: CounterfactualReachabilityRow["replayEvent"]): boolean {
  return event !== "NOT_REPLAYABLE";
}

function aggregateModelCost(
  rows: readonly CounterfactualReachabilityRow[],
  modelId: AlternativeTargetModelId,
  roundTripCostPercentage: number,
  grossRiskByTradeId: ReadonlyMap<string, number | null>,
  tradeFilter?: ReadonlySet<string>
): ModelCostScenarioMetrics {
  const modelRows = rows.filter(
    (r) =>
      r.modelId === modelId && (!tradeFilter || tradeFilter.has(r.tradeId))
  );
  let classifiable = 0;
  let targetReached = 0;
  let costCovered = 0;
  let negativeMargin = 0;
  const grossOnReached: number[] = [];
  const netOnReached: number[] = [];
  const netRrOnReached: number[] = [];
  const breakEvenCosts: number[] = [];

  for (const row of modelRows) {
    if (!isClassifiable(row.replayEvent)) continue;
    classifiable++;
    if (row.grossTargetMovePercentage !== null && Number.isFinite(row.grossTargetMovePercentage)) {
      breakEvenCosts.push(row.grossTargetMovePercentage);
    }
    if (row.replayEvent === "TARGET_REACHED") {
      targetReached++;
      const g = row.grossTargetMovePercentage;
      const risk = grossRiskByTradeId.get(row.tradeId) ?? null;
      if (g !== null && Number.isFinite(g)) {
        grossOnReached.push(g);
        const net = g - roundTripCostPercentage;
        netOnReached.push(net);
        if (g > roundTripCostPercentage + COST_EPS) costCovered++;
        if (g < roundTripCostPercentage - COST_EPS) negativeMargin++;
        const nrr = netCounterfactualRr(
          row.replayEvent,
          g,
          risk,
          roundTripCostPercentage
        );
        if (nrr !== null && Number.isFinite(nrr)) netRrOnReached.push(nrr);
      }
    }
  }

  return {
    modelId,
    roundTripCostPercentage,
    classifiableTrades: classifiable,
    targetReached,
    targetReachRate: classifiable > 0 ? targetReached / classifiable : null,
    costCoveredTargetCount: costCovered,
    costCoveredTargetRate: targetReached > 0 ? costCovered / targetReached : null,
    negativeMarginTargetCount: negativeMargin,
    meanGrossRewardPercentageOnReached: mean(grossOnReached),
    meanNetMarginPercentageOnReached: mean(netOnReached),
    medianBreakEvenCostPercentage: median(breakEvenCosts),
    meanNetCounterfactualRrOnReached: mean(netRrOnReached),
  };
}

function resolveAnchorKey(
  sources: readonly OpenStructuralLegAnchorSource[]
): OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED" {
  if (!sources.length) return "UNKNOWN";
  const u = [...new Set(sources)];
  return u.length === 1 ? u[0]! : "MIXED";
}

export function buildHistoricalCostAwareCounterfactualAnalysis(
  input: BuildHistoricalCostAwareCounterfactualAnalysisInput
): HistoricalCostAwareCounterfactualAnalysisReport {
  const {
    lifecycleReport,
    reachabilityReplayReport,
    eligibilityAuditReport,
    alternativeTargetModelAnalysisReport,
    historicalEvaluatorFailureReasonAnalysisReport,
  } = input;

  const costScenarios = [
    ...(input.roundTripCostScenariosPercent ?? DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT),
  ];

  const grossRiskByTradeId = new Map<string, number | null>();
  for (const t of lifecycleReport.trades) {
    grossRiskByTradeId.set(
      t.tradeId,
      computeGrossPriceMovePercentages(t).grossRiskPercentage
    );
  }

  const waveByTradeId = new Map<string, string>();
  const anchorByTradeId = new Map<
    string,
    OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED"
  >();
  if (alternativeTargetModelAnalysisReport) {
    for (const row of alternativeTargetModelAnalysisReport.perTrade) {
      waveByTradeId.set(row.tradeId, row.waveLabel);
      anchorByTradeId.set(row.tradeId, resolveAnchorKey(row.anchorSources));
    }
  }

  const failedFavIds = new Set<string>();
  const passedAdvIds = new Set<string>();
  for (const t of lifecycleReport.trades) {
    if (
      t.tradeEvaluationStatus === "FAILED" &&
      t.policyClassification === "FAVORABLE_RESOLUTION"
    ) {
      failedFavIds.add(t.tradeId);
    }
    if (
      t.tradeEvaluationStatus === "PASSED" &&
      t.policyClassification === "ADVERSE_RESOLUTION"
    ) {
      passedAdvIds.add(t.tradeId);
    }
  }

  const perTrade = reachabilityReplayReport.perTrade;
  const notReplayableRows = perTrade.filter((r) => r.replayEvent === "NOT_REPLAYABLE").length;

  const modelResults: ModelCostScenarioMetrics[] = [];
  for (const modelId of ALTERNATIVE_TARGET_MODEL_IDS) {
    for (const cost of costScenarios) {
      modelResults.push(
        aggregateModelCost(perTrade, modelId, cost, grossRiskByTradeId)
      );
    }
  }

  const b12wByModel = new Map(
    reachabilityReplayReport.modelResults.map((m) => [m.modelId, m])
  );
  let parityOk = true;
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    const b12w = b12wByModel.get(id);
    const zeroCost = modelResults.find(
      (m) => m.modelId === id && m.roundTripCostPercentage === 0
    );
    if (!b12w || !zeroCost) continue;
    if (
      zeroCost.targetReached !== b12w.targetReached ||
      zeroCost.classifiableTrades !== b12w.classifiableTrades ||
      (b12w.targetReachRate !== null &&
        zeroCost.targetReachRate !== null &&
        Math.abs(zeroCost.targetReachRate - b12w.targetReachRate) > 1e-12)
    ) {
      parityOk = false;
    }
  }

  const costSensitivity = ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => ({
    modelId,
    curve: costScenarios.map((cost) => {
      const m = modelResults.find(
        (x) => x.modelId === modelId && x.roundTripCostPercentage === cost
      )!;
      return {
        roundTripCostPercentage: cost,
        costCoveredTargetRate: m.costCoveredTargetRate,
      };
    }),
  }));

  const breakEvenCost = ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => {
    const grosses = perTrade
      .filter((r) => r.modelId === modelId && r.grossTargetMovePercentage !== null)
      .map((r) => r.grossTargetMovePercentage!);
    return {
      modelId,
      meanBreakEvenCostPercentage: mean(grosses),
      medianBreakEvenCostPercentage: median(grosses),
      p25BreakEvenCostPercentage: percentile(grosses, 25),
      p75BreakEvenCostPercentage: percentile(grosses, 75),
    };
  });

  const rewardBucketAnalysis: HistoricalCostAwareCounterfactualAnalysisReport["rewardBucketAnalysis"][number][] =
    [];
  const canonicalId: AlternativeTargetModelId = "CANONICAL_DISPLACEMENT_EQUALITY";
  for (const cost of costScenarios) {
    const bucketMap = new Map<
      string,
      { trades: number; reached: number; gross: number[]; net: number[]; covered: number }
    >();
    for (const row of perTrade) {
      if (row.modelId !== canonicalId || !isClassifiable(row.replayEvent)) continue;
      const bucket = classifyTargetMagnitudeRewardBucket(row.grossTargetMovePercentage);
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, { trades: 0, reached: 0, gross: [], net: [], covered: 0 });
      }
      const b = bucketMap.get(bucket)!;
      b.trades++;
      if (row.replayEvent === "TARGET_REACHED" && row.grossTargetMovePercentage !== null) {
        b.reached++;
        b.gross.push(row.grossTargetMovePercentage);
        const net = row.grossTargetMovePercentage - cost;
        b.net.push(net);
        if (row.grossTargetMovePercentage > cost + COST_EPS) b.covered++;
      }
    }
    for (const [rewardBucket, v] of bucketMap) {
      rewardBucketAnalysis.push({
        rewardBucket,
        roundTripCostPercentage: cost,
        tradeCount: v.trades,
        targetReached: v.reached,
        meanGrossRewardPercentage: mean(v.gross),
        meanNetMarginOnReached: mean(v.net),
        costCoverageRate: v.reached > 0 ? v.covered / v.reached : null,
      });
    }
  }

  const failedFavorableByModelAndCost = modelResults
    .map((m) =>
      aggregateModelCost(
        perTrade,
        m.modelId,
        m.roundTripCostPercentage,
        grossRiskByTradeId,
        failedFavIds
      )
    )
    .filter((m) => m.classifiableTrades > 0);

  const passedAdverseByModelAndCost = modelResults
    .map((m) =>
      aggregateModelCost(
        perTrade,
        m.modelId,
        m.roundTripCostPercentage,
        grossRiskByTradeId,
        passedAdvIds
      )
    )
    .filter((m) => m.classifiableTrades > 0);

  const tradeById = new Map(lifecycleReport.trades.map((t) => [t.tradeId, t]));

  const directionCross: HistoricalCostAwareCounterfactualAnalysisReport["directionCross"][number][] =
    [];
  const setupFamilyCross: HistoricalCostAwareCounterfactualAnalysisReport["setupFamilyCross"][number][] =
    [];
  const waveContextCross: HistoricalCostAwareCounterfactualAnalysisReport["waveContextCross"][number][] =
    [];
  const anchorSourceCross: HistoricalCostAwareCounterfactualAnalysisReport["anchorSourceCross"][number][] =
    [];
  const evaluatorCross: HistoricalCostAwareCounterfactualAnalysisReport["evaluatorCross"][number][] =
    [];
  const failureReasonCross: HistoricalCostAwareCounterfactualAnalysisReport["failureReasonCross"][number][] =
    [];
  const rrCross: HistoricalCostAwareCounterfactualAnalysisReport["rrCross"][number][] = [];

  for (const modelId of ALTERNATIVE_TARGET_MODEL_IDS) {
    for (const cost of costScenarios) {
      const dirs = new Set<string>();
      const families = new Set<string>();
      const waves = new Set<string>();
      const anchors = new Set<string>();
      const evals = new Set<string>();
      const failures = new Set<string>();
      const rrBuckets = new Set<string>();

      for (const row of perTrade) {
        if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
        const t = tradeById.get(row.tradeId)!;
        dirs.add(t.direction ?? "UNKNOWN");
        families.add(t.setupFamilyId);
        waves.add(waveByTradeId.get(row.tradeId) ?? "UNKNOWN");
        anchors.add(anchorByTradeId.get(row.tradeId) ?? "UNKNOWN");
        evals.add(t.tradeEvaluationStatus);
        failures.add(t.evaluatorFirstFailure ?? "NONE");
        const rr = classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio);
        rrBuckets.add(rr);
      }

      for (const direction of dirs) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          const t = tradeById.get(row.tradeId)!;
          if ((t.direction ?? "UNKNOWN") !== direction) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        directionCross.push({
          direction,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const setupFamilyId of families) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          const t = tradeById.get(row.tradeId)!;
          if (t.setupFamilyId !== setupFamilyId) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        setupFamilyCross.push({
          setupFamilyId,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const waveLabel of waves) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          if ((waveByTradeId.get(row.tradeId) ?? "UNKNOWN") !== waveLabel) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        waveContextCross.push({
          waveLabel,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const anchorSource of anchors) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          if ((anchorByTradeId.get(row.tradeId) ?? "UNKNOWN") !== anchorSource) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        anchorSourceCross.push({
          anchorSource,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const evaluationStatus of evals) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          const t = tradeById.get(row.tradeId)!;
          if (t.tradeEvaluationStatus !== evaluationStatus) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        evaluatorCross.push({
          evaluationStatus,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const failureReason of failures) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          const t = tradeById.get(row.tradeId)!;
          if ((t.evaluatorFirstFailure ?? "NONE") !== failureReason) continue;
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        failureReasonCross.push({
          failureReason,
          roundTripCostPercentage: cost,
          modelId,
          costCoveredTargetRate: reached > 0 ? covered / reached : null,
          trades,
        });
      }

      for (const rrBucket of rrBuckets) {
        let trades = 0;
        let reached = 0;
        let covered = 0;
        for (const row of perTrade) {
          if (row.modelId !== modelId || !isClassifiable(row.replayEvent)) continue;
          const t = tradeById.get(row.tradeId)!;
          if (classifyHistoricalMeasurementRrBucketRow(t.canonicalRrRatio) !== rrBucket) {
            continue;
          }
          trades++;
          if (row.replayEvent === "TARGET_REACHED") {
            reached++;
            const g = row.grossTargetMovePercentage;
            if (g !== null && g > cost + COST_EPS) covered++;
          }
        }
        rrCross.push({
          rrBucket: rrBucket as HistoricalCostAwareCounterfactualAnalysisReport["rrCross"][number]["rrBucket"],
          roundTripCostPercentage: cost,
          modelId,
          targetReached: reached,
          costCoveredTargetCount: covered,
          trades,
        });
      }
    }
  }

  const canonicalAtCost = (cost: number): ModelCostScenarioMetrics | undefined =>
    modelResults.find(
      (m) =>
        m.modelId === canonicalId && m.roundTripCostPercentage === cost
    );

  const diagnosticCostAnswer = (costs: readonly number[]): string =>
    costs
      .filter((c) => costScenarios.some((s) => Math.abs(s - c) <= COST_EPS))
      .map((c) => {
        const m = canonicalAtCost(c);
        if (!m) return `${c}%: n/a`;
        return `${c}%: ${m.costCoveredTargetCount}/${m.targetReached} reached (${((m.costCoveredTargetRate ?? 0) * 100).toFixed(1)}% cost coverage rate)`;
      })
      .join("; ") || "n/a (cost scenarios not included in input)";

  const diagnosticSummary: HistoricalCostAwareCounterfactualAnalysisReport["diagnosticSummary"] =
    [
      {
        question:
          "Canonical target reach edilen işlemlerde gross reward tipik olarak ne kadar?",
        answer: `Median break-even gross (trade-level arithmetic) canonical model: ${breakEvenCost.find((b) => b.modelId === canonicalId)?.medianBreakEvenCostPercentage?.toFixed(4) ?? "n/a"}%; mean gross on TARGET_REACHED at 0% cost: ${canonicalAtCost(0)?.meanGrossRewardPercentageOnReached?.toFixed(4) ?? "n/a"}%.`,
      },
      {
        question: "0.10/0.20/0.30/0.50% cost altında kaç target reach maliyeti karşılıyor?",
        answer: diagnosticCostAnswer([0.1, 0.2, 0.3, 0.5]),
      },
      {
        question: "Küçük target historical reach cost sonrası anlamlılık?",
        answer:
          "See rewardBucketAnalysis: compare targetReached vs costCoverageRate by REWARD_LT_0_10 and adjacent buckets per cost scenario.",
      },
      {
        question: "1.25×–3× modellerde cost coverage?",
        answer: costScenarios
          .filter((cost) => Math.abs(cost - 0.1) <= COST_EPS || Math.abs(cost - 0.2) <= COST_EPS)
          .map((cost) => {
            const ids = [
              "DISPLACEMENT_1_25",
              "DISPLACEMENT_1_50",
              "DISPLACEMENT_2_00",
              "DISPLACEMENT_2_50",
              "DISPLACEMENT_3_00",
            ] as AlternativeTargetModelId[];
            return `cost ${cost}%: ${ids
              .map((id) => {
                const m = modelResults.find(
                  (x) => x.modelId === id && x.roundTripCostPercentage === cost
                );
                return `${id} ${m?.costCoveredTargetCount ?? 0}/${m?.targetReached ?? 0}`;
              })
              .join(", ")}`;
          })
          .join("; ") || "n/a",
      },
      {
        question: "Target büyüdükçe reach vs cost coverage?",
        answer: "rewardBucketAnalysis + costSensitivity curves per model (descriptive).",
      },
      {
        question: "FAILED+FAVORABLE cost coverage?",
        answer: `cohort trades=${failedFavIds.size}; at 0.2% cost canonical: ${
          failedFavorableByModelAndCost.find(
            (m) =>
              m.modelId === canonicalId && Math.abs(m.roundTripCostPercentage - 0.2) <= COST_EPS
          )?.costCoveredTargetCount ?? "n/a"
        }/${
          failedFavorableByModelAndCost.find(
            (m) =>
              m.modelId === canonicalId && Math.abs(m.roundTripCostPercentage - 0.2) <= COST_EPS
          )?.targetReached ?? "n/a"
        } cost-covered reaches.`,
      },
      {
        question: "PASSED+ADVERSE cost coverage?",
        answer: `cohort trades=${passedAdvIds.size}; at 0.2% cost canonical: ${
          passedAdverseByModelAndCost.find(
            (m) =>
              m.modelId === canonicalId && m.roundTripCostPercentage === 0.2
          )?.costCoveredTargetCount ?? "n/a"
        }/${
          passedAdverseByModelAndCost.find(
            (m) =>
              m.modelId === canonicalId && m.roundTripCostPercentage === 0.2
          )?.targetReached ?? "n/a"
        } cost-covered reaches.`,
      },
      {
        question: "Break-even round-trip cost tipik?",
        answer: `Canonical median trade-level breakEvenCostPercentage=${breakEvenCost.find((b) => b.modelId === canonicalId)?.medianBreakEvenCostPercentage?.toFixed(4) ?? "n/a"}% (equals gross target distance arithmetic).`,
      },
      {
        question: "Prospective RR vs net counterfactual RR?",
        answer:
          "Prospective RR from lifecycle canonicalRrRatio (gross geometry). Net counterfactual RR uses (grossReward-cost)/(grossRisk+cost) on TARGET_REACHED only; not theoretical R.",
      },
      {
        question: "Fee/slippage/execution olmadan gerçek profitability?",
        answer:
          "No — this phase reports gross margin and cost coverage on historical touch counterfactuals only.",
      },
      {
        question: "Direct vs observational?",
        answer:
          "Direct: gross/net margin, cost coverage, reach counts from B-12w replay. Observational: evaluator/failure/family/wave/direction cross-tabs.",
      },
    ];

  return {
    schemaVersion: HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      reachabilityRows: perTrade.length,
      notReplayableRows,
      b12wReachabilityParityVerified: parityOk,
    },
    costPolicy: {
      denomination: "ROUND_TRIP_PERCENTAGE",
      description:
        "Scenario round-trip cost as single gross percentage (entry+exit+assumed execution); not a claim of actual Binance fees.",
      notActualExchangeFee: true,
      includesSlippage: false,
      includesFunding: false,
      executionAssumption:
        "Entry at reference; target/stop at touch; no fill simulation.",
    },
    costScenarios,
    canonicalReference: {
      grossRewardSource: "B-12w perTrade.grossTargetMovePercentage",
      grossRiskSource: "lifecycle entry/invalidation (B-12r semantics, read-only)",
      reachabilitySource: "B-12w replayEvent (unchanged)",
      theoreticalRReference: "B-12h via eligibilityAudit only; B-12x does not recompute",
    },
    modelResults,
    costSensitivity,
    targetCostCoverage: modelResults,
    breakEvenCost,
    rewardBucketAnalysis,
    failedFavorableAnalysis: {
      trades: failedFavIds.size,
      byModelAndCost: failedFavorableByModelAndCost,
      note: "Descriptive counterfactual margin on FAILED trades with FAVORABLE_RESOLUTION path classification.",
    },
    passedAdverseAnalysis: {
      trades: passedAdvIds.size,
      byModelAndCost: passedAdverseByModelAndCost,
      note: "Descriptive counterfactual margin on PASSED trades with ADVERSE_RESOLUTION path classification.",
    },
    rrCross,
    directionCross,
    setupFamilyCross,
    waveContextCross,
    anchorSourceCross,
    evaluatorCross,
    failureReasonCross,
    targetReachabilityCross: modelResults.filter((m) => m.roundTripCostPercentage === 0),
    arithmeticExamples: {
      label: "ARITHMETIC_REFERENCE",
      rows: ARITHMETIC_EXAMPLE_ROWS,
    },
    warnings: [...WARNINGS],
    diagnosticSummary,
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      alternativeTargetModelAnalysisReport: Boolean(alternativeTargetModelAnalysisReport),
      eligibilityAuditReport: Boolean(eligibilityAuditReport),
      historicalEvaluatorFailureReasonAnalysisReport: Boolean(
        historicalEvaluatorFailureReasonAnalysisReport
      ),
    },
  };
}

// Parity helper exported for tests (uses internal row counts).
export function assertReachabilityUnchanged(
  reachabilityReport: BuildHistoricalCostAwareCounterfactualAnalysisInput["reachabilityReplayReport"],
  analysis: HistoricalCostAwareCounterfactualAnalysisReport
): boolean {
  for (const m of reachabilityReport.modelResults) {
    const zero = analysis.modelResults.find(
      (x) => x.modelId === m.modelId && x.roundTripCostPercentage === 0
    );
    if (!zero || zero.targetReached !== m.targetReached) return false;
  }
  return analysis.population.b12wReachabilityParityVerified;
}
