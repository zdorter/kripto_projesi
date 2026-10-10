import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { CounterfactualReachabilityRow } from "./historical-alternative-target-reachability-replay-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import {
  CONTEXT_HEADROOM_BUCKET_IDS,
  DISPLACEMENT_CONTEXT_BUCKET_IDS,
  HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION,
  TARGET_DISTANCE_AGGREGATE_BAND_IDS,
  type AnchorSourceDimension,
  type BuildHistoricalTargetDistanceStructuralContextAnalysisInput,
  type ContextHeadroomBucketId,
  type DisplacementContextBucketId,
  type HistoricalTargetDistanceStructuralContextAnalysisReport,
  type ReachSliceMetrics,
  type StructuralContextTradeExample,
  type TargetDistanceAggregateBandId,
  type TargetDistanceHeadroomCell,
} from "./historical-target-distance-structural-context-analysis-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const CANONICAL_MODEL = "CANONICAL_DISPLACEMENT_EQUALITY" as const;
const COST_EPS = 1e-9;
const COST_LEVELS = [0.1, 0.2, 0.3, 0.5] as const;

const WARNINGS: readonly string[] = [
  "observational_structural_context_research_only",
  "no_strategy_recommendation",
  "no_causality",
  "no_target_policy_change",
  "no_evaluator_change",
  "reach_rate_not_equal_cost_coverage",
  "cost_coverage_from_b12x_semantics",
];

export function classifyTargetDistanceAggregateBand(
  rewardPercentage: number | null
): TargetDistanceAggregateBandId {
  if (rewardPercentage === null || !Number.isFinite(rewardPercentage)) {
    return "AGG_NOT_APPLICABLE";
  }
  const p = rewardPercentage;
  if (p < 0.25) return "AGG_LT_0_25";
  if (p < 0.5) return "AGG_0_25_TO_0_50";
  if (p < 1) return "AGG_0_50_TO_1_00";
  if (p < 2) return "AGG_1_00_TO_2_00";
  if (p < 3) return "AGG_2_00_TO_3_00";
  return "AGG_GTE_3_00";
}

export function classifyContextHeadroomBucket(
  headroomPercentage: number | null
): ContextHeadroomBucketId {
  if (headroomPercentage === null || !Number.isFinite(headroomPercentage)) {
    return "HEADROOM_NOT_APPLICABLE";
  }
  if (headroomPercentage <= 0) return "NO_HEADROOM";
  if (headroomPercentage < 0.25) return "HEADROOM_LT_0_25";
  if (headroomPercentage < 0.5) return "HEADROOM_0_25_TO_0_50";
  if (headroomPercentage < 1) return "HEADROOM_0_50_TO_1_00";
  if (headroomPercentage < 2) return "HEADROOM_1_00_TO_2_00";
  return "HEADROOM_GTE_2_00";
}

export function classifyDisplacementContextBucket(
  displacementPercentage: number | null
): DisplacementContextBucketId {
  if (displacementPercentage === null || !Number.isFinite(displacementPercentage)) {
    return "DISP_NOT_APPLICABLE";
  }
  const p = Math.abs(displacementPercentage);
  if (p < 0.25) return "DISP_LT_0_25";
  if (p < 0.5) return "DISP_0_25_TO_0_50";
  if (p < 1) return "DISP_0_50_TO_1_00";
  if (p < 2) return "DISP_1_00_TO_2_00";
  if (p < 3) return "DISP_2_00_TO_3_00";
  return "DISP_GTE_3_00";
}

export function resolveDurationBucket(
  durationBars: number | null
): IndependentTradeDurationBucketId | null {
  if (durationBars === null || !Number.isFinite(durationBars)) return null;
  const d = Math.floor(durationBars);
  if (d >= 1 && d <= 3) return "DURATION_1_3";
  if (d >= 4 && d <= 6) return "DURATION_4_6";
  if (d >= 7 && d <= 12) return "DURATION_7_12";
  if (d >= 13 && d <= 24) return "DURATION_13_24";
  return null;
}

function resolveAnchorKey(
  sources: readonly OpenStructuralLegAnchorSource[] | readonly string[] | null | undefined
): AnchorSourceDimension {
  if (!sources?.length) return "UNKNOWN";
  const u = [...new Set(sources)];
  if (u.length === 1) return u[0] as AnchorSourceDimension;
  return "MIXED";
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

function isClassifiable(event: CounterfactualReachabilityRow["replayEvent"]): boolean {
  return event !== "NOT_REPLAYABLE";
}

function isDecisive(policy: string): boolean {
  return policy === "FAVORABLE_RESOLUTION" || policy === "ADVERSE_RESOLUTION";
}

function costCovered(gross: number | null, cost: number): boolean {
  return gross !== null && Number.isFinite(gross) && gross > cost + COST_EPS;
}

interface EnrichedTrade {
  tradeId: string;
  evaluationBarIndex: number;
  timestamp: number | null;
  direction: string;
  setupFamilyId: string;
  evaluatorStatus: string;
  failureReason: string;
  pathOutcome: string;
  policyClassification: string;
  entryPrice: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  anchorPrice: number | null;
  canonicalRewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  displacementPercentage: number | null;
  structuralMovePercentage: number | null;
  headroomPercentage: number | null;
  structuralToCanonicalRatio: number | null;
  anchorSource: AnchorSourceDimension;
  waveContext: string;
  durationBucket: IndependentTradeDurationBucketId | "UNKNOWN";
  rewardBucket: PriceMoveRewardBucketId;
  aggregateBand: TargetDistanceAggregateBandId;
  headroomBucket: ContextHeadroomBucketId;
  displacementBucket: DisplacementContextBucketId;
  replay: CounterfactualReachabilityRow;
  prefixExtremeAtE: boolean;
}

function emptyReachMetrics(): ReachSliceMetrics {
  const ci = computeIndependentTradeWinRateConfidenceInterval(0, 0, 0.95);
  return {
    trades: 0,
    classifiableTrades: 0,
    targetReached: 0,
    targetReachRate: null,
    reachRateWilson95: ci,
    targetBeforeInvalidation: 0,
    targetBeforeInvalidationRate: null,
    invalidationFirst: 0,
    invalidationFirstRate: null,
    medianBarsToTarget: null,
    meanMfePercentage: null,
    meanCanonicalRewardPercentage: null,
    meanRiskPercentage: null,
    meanCanonicalRr: null,
    costCoveredAt0_10: 0,
    costCoveredAt0_20: 0,
    costCoveredAt0_30: 0,
    costCoveredAt0_50: 0,
    costCoverageRateAt0_20: null,
    meanGrossMarginOnReached: null,
    meanNetMarginOnReachedAt0_20: null,
    sampleSizeQuality: "VERY_SMALL_SAMPLE",
    interpretWithCaution: true,
  };
}

function aggregateReachSlice(rows: EnrichedTrade[]): ReachSliceMetrics {
  const m = emptyReachMetrics();
  m.trades = rows.length;
  const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent));
  m.classifiableTrades = classifiable.length;
  const reached = classifiable.filter((r) => r.replay.replayEvent === "TARGET_REACHED");
  m.targetReached = reached.length;
  m.targetReachRate =
    m.classifiableTrades > 0 ? m.targetReached / m.classifiableTrades : null;
  m.reachRateWilson95 = computeIndependentTradeWinRateConfidenceInterval(
    m.targetReached,
    m.classifiableTrades - m.targetReached,
    0.95
  );
  m.targetBeforeInvalidation = classifiable.filter(
    (r) => r.replay.targetBeforeInvalidation
  ).length;
  m.targetBeforeInvalidationRate =
    m.classifiableTrades > 0 ? m.targetBeforeInvalidation / m.classifiableTrades : null;
  m.invalidationFirst = classifiable.filter(
    (r) => r.replay.replayEvent === "INVALIDATION_REACHED"
  ).length;
  m.invalidationFirstRate =
    m.classifiableTrades > 0 ? m.invalidationFirst / m.classifiableTrades : null;

  const bars = reached
    .map((r) => r.replay.barsToTarget)
    .filter((b): b is number => b !== null && Number.isFinite(b));
  m.medianBarsToTarget = median(bars);
  m.meanMfePercentage = mean(
    classifiable
      .map((r) => r.replay.mfePercentage)
      .filter((x): x is number => x !== null && Number.isFinite(x))
  );
  m.meanCanonicalRewardPercentage = mean(
    rows
      .map((r) => r.canonicalRewardPercentage)
      .filter((x): x is number => x !== null && Number.isFinite(x))
  );
  m.meanRiskPercentage = mean(
    rows.map((r) => r.riskPercentage).filter((x): x is number => x !== null && Number.isFinite(x))
  );
  m.meanCanonicalRr = mean(
    rows
      .map((r) => r.canonicalRrRatio)
      .filter((x): x is number => x !== null && Number.isFinite(x))
  );

  const grossReached = reached
    .map((r) => r.replay.grossTargetMovePercentage)
    .filter((g): g is number => g !== null && Number.isFinite(g));
  m.meanGrossMarginOnReached = mean(grossReached);
  m.meanNetMarginOnReachedAt0_20 = mean(
    grossReached.map((g) => g - 0.2)
  );

  for (const r of reached) {
    const g = r.replay.grossTargetMovePercentage;
    if (costCovered(g, 0.1)) m.costCoveredAt0_10++;
    if (costCovered(g, 0.2)) m.costCoveredAt0_20++;
    if (costCovered(g, 0.3)) m.costCoveredAt0_30++;
    if (costCovered(g, 0.5)) m.costCoveredAt0_50++;
  }
  m.costCoverageRateAt0_20 =
    m.targetReached > 0 ? m.costCoveredAt0_20 / m.targetReached : null;

  const quality = classifyHistoricalIndependentTradeSampleSize(m.trades);
  m.sampleSizeQuality = quality;
  m.interpretWithCaution = quality !== "LARGE_SAMPLE";
  return m;
}

export function buildHistoricalTargetDistanceStructuralContextAnalysis(
  input: BuildHistoricalTargetDistanceStructuralContextAnalysisInput
): HistoricalTargetDistanceStructuralContextAnalysisReport {
  const {
    lifecycleReport,
    reachabilityReplayReport,
    costAwareCounterfactualAnalysisReport: b12x,
    displacementEqualityTargetMechanicsAnalysisReport,
    structuralExtremeVsDisplacementTargetAnalysisReport,
    alternativeTargetModelAnalysisReport,
  } = input;

  for (const c of COST_LEVELS) {
    if (!b12x.costScenarios.some((s) => Math.abs(s - c) <= COST_EPS)) {
      throw new Error(`B-12x cost scenario ${c}% required for B-12y cost findings`);
    }
  }

  const replayByTrade = new Map<string, CounterfactualReachabilityRow>();
  for (const row of reachabilityReplayReport.perTrade) {
    if (row.modelId === CANONICAL_MODEL) {
      replayByTrade.set(row.tradeId, row);
    }
  }

  const dispByTrade = new Map(
    (displacementEqualityTargetMechanicsAnalysisReport?.targetMagnitude.perTrade ?? []).map(
      (r) => [r.tradeId, r]
    )
  );
  const structByTrade = new Map(
    (structuralExtremeVsDisplacementTargetAnalysisReport?.perTrade ?? []).map((r) => [
      r.tradeId,
      r,
    ])
  );
  const altByTrade = new Map(
    (alternativeTargetModelAnalysisReport?.perTrade ?? []).map((r) => [r.tradeId, r])
  );

  const enriched: EnrichedTrade[] = [];
  for (const t of lifecycleReport.trades) {
    const replay = replayByTrade.get(t.tradeId);
    if (!replay) continue;
    const disp = dispByTrade.get(t.tradeId);
    const struct = structByTrade.get(t.tradeId);
    const alt = altByTrade.get(t.tradeId);
    const reward =
      replay.grossTargetMovePercentage ??
      disp?.rewardPercentage ??
      null;
    const risk = disp?.riskPercentage ?? null;
    enriched.push({
      tradeId: t.tradeId,
      evaluationBarIndex: t.evaluationBarIndex,
      timestamp: t.evaluationBarTime,
      direction: t.direction ?? "UNKNOWN",
      setupFamilyId: t.setupFamilyId,
      evaluatorStatus: t.tradeEvaluationStatus,
      failureReason: t.evaluatorFirstFailure ?? "NONE",
      pathOutcome: t.pathOutcome,
      policyClassification: t.policyClassification,
      entryPrice: t.entryReferencePrice,
      targetPrice: t.targetReferencePrice,
      invalidationPrice: t.invalidationReferencePrice,
      anchorPrice: disp?.anchorPrice ?? null,
      canonicalRewardPercentage: reward,
      riskPercentage: risk,
      canonicalRrRatio: t.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null,
      displacementPercentage: disp?.displacementPercentage ?? null,
      structuralMovePercentage: struct?.prefixStructuralMovePercentage ?? null,
      headroomPercentage: struct?.prefixExtremeHeadroomPercentage ?? null,
      structuralToCanonicalRatio: struct?.prefixStructuralToCanonicalRatio ?? null,
      anchorSource: resolveAnchorKey(
        (disp?.anchorSources as OpenStructuralLegAnchorSource[] | undefined) ??
          alt?.anchorSources
      ),
      waveContext: alt?.waveLabel ?? struct?.waveLabel ?? "UNKNOWN",
      durationBucket: resolveDurationBucket(t.lifecycleDurationBars) ?? "UNKNOWN",
      rewardBucket: classifyPriceMoveRewardBucket(reward),
      aggregateBand: classifyTargetDistanceAggregateBand(reward),
      headroomBucket: classifyContextHeadroomBucket(struct?.prefixExtremeHeadroomPercentage ?? null),
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      replay,
      prefixExtremeAtE: replay.prefixExtremeObservedAtE,
    });
  }

  const classifiableCount = enriched.filter((r) =>
    isClassifiable(r.replay.replayEvent)
  ).length;
  const notReplayable = enriched.length - classifiableCount;

  function groupBy<K extends string>(
    rows: EnrichedTrade[],
    keyFn: (r: EnrichedTrade) => K
  ): Map<K, EnrichedTrade[]> {
    const m = new Map<K, EnrichedTrade[]>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }

  const byRewardBucket = [...groupBy(enriched, (r) => r.rewardBucket)].map(([bucket, rows]) => ({
    bucket,
    ...aggregateReachSlice(rows),
  }));

  const byAggregateBand = TARGET_DISTANCE_AGGREGATE_BAND_IDS.filter(
    (id) => id !== "AGG_NOT_APPLICABLE"
  ).map((band) => {
    const rows = enriched.filter((r) => r.aggregateBand === band);
    return { band, ...aggregateReachSlice(rows) };
  });

  const displacementFindings = DISPLACEMENT_CONTEXT_BUCKET_IDS.filter(
    (b) => b !== "DISP_NOT_APPLICABLE"
  ).map((bucket) => {
    const rows = enriched.filter((r) => r.displacementBucket === bucket);
    const disps = rows
      .map((r) => r.displacementPercentage)
      .filter((d): d is number => d !== null && Number.isFinite(d))
      .map(Math.abs);
    return {
      bucket,
      meanDisplacementPercentage: mean(disps),
      medianDisplacementPercentage: median(disps),
      ...aggregateReachSlice(rows),
    };
  });

  const structuralHeadroomFindings = CONTEXT_HEADROOM_BUCKET_IDS.filter(
    (b) => b !== "HEADROOM_NOT_APPLICABLE"
  ).map((bucket) => {
    const rows = enriched.filter((r) => r.headroomBucket === bucket);
    return {
      bucket,
      prefixExtremeObservedAtECount: rows.filter((r) => r.prefixExtremeAtE).length,
      ...aggregateReachSlice(rows),
    };
  });

  const anchorSourceFindings = [...groupBy(enriched, (r) => r.anchorSource)].map(
    ([anchorSource, rows]) => ({
      anchorSource,
      ...aggregateReachSlice(rows),
    })
  );

  const anchorByTargetDistance: HistoricalTargetDistanceStructuralContextAnalysisReport["anchorByTargetDistance"][number][] =
    [];
  for (const [anchorSource, aRows] of groupBy(enriched, (r) => r.anchorSource)) {
    for (const [bucket, rows] of groupBy(aRows, (r) => r.rewardBucket)) {
      anchorByTargetDistance.push({
        anchorSource,
        targetDistanceBucket: bucket,
        ...aggregateReachSlice(rows),
      });
    }
  }

  const targetDistanceByHeadroom: TargetDistanceHeadroomCell[] = [];
  for (const [rewardBucket, rRows] of groupBy(enriched, (r) => r.rewardBucket)) {
    for (const [headroomBucket, rows] of groupBy(rRows, (r) => r.headroomBucket)) {
      targetDistanceByHeadroom.push({
        targetDistanceBucket: rewardBucket,
        headroomBucket,
        decisive: rows.filter((r) => isDecisive(r.policyClassification)).length,
        ...aggregateReachSlice(rows),
      });
    }
  }

  const targetDistanceByDuration: HistoricalTargetDistanceStructuralContextAnalysisReport["targetDistanceByDuration"][number][] =
    [];
  for (const [rewardBucket, rRows] of groupBy(enriched, (r) => r.rewardBucket)) {
    for (const [durationBucket, rows] of groupBy(rRows, (r) => r.durationBucket)) {
      targetDistanceByDuration.push({
        targetDistanceBucket: rewardBucket,
        durationBucket,
        ...aggregateReachSlice(rows),
      });
    }
  }

  const waveFindings: HistoricalTargetDistanceStructuralContextAnalysisReport["waveFindings"][number][] =
    [];
  for (const [waveLabel, wRows] of groupBy(enriched, (r) => r.waveContext)) {
    for (const [bucket, rows] of groupBy(wRows, (r) => r.rewardBucket)) {
      waveFindings.push({ waveLabel, targetDistanceBucket: bucket, ...aggregateReachSlice(rows) });
    }
  }

  const setupFamilyFindings: HistoricalTargetDistanceStructuralContextAnalysisReport["setupFamilyFindings"][number][] =
    [];
  for (const [setupFamilyId, fRows] of groupBy(enriched, (r) => r.setupFamilyId)) {
    for (const [bucket, rows] of groupBy(fRows, (r) => r.rewardBucket)) {
      setupFamilyFindings.push({
        setupFamilyId,
        targetDistanceBucket: bucket,
        ...aggregateReachSlice(rows),
      });
    }
  }

  const evaluatorFindings: HistoricalTargetDistanceStructuralContextAnalysisReport["evaluatorFindings"][number][] =
    [];
  for (const [evaluationStatus, eRows] of groupBy(enriched, (r) => r.evaluatorStatus)) {
    for (const [bucket, rows] of groupBy(eRows, (r) => r.rewardBucket)) {
      const rrBelow = rows.filter((r) => r.failureReason === "RR_BELOW_MINIMUM");
      evaluatorFindings.push({
        evaluationStatus,
        targetDistanceBucket: bucket,
        failureReason: null,
        ...aggregateReachSlice(rows),
      });
      if (evaluationStatus === "FAILED" && rrBelow.length) {
        evaluatorFindings.push({
          evaluationStatus: "FAILED",
          targetDistanceBucket: bucket,
          failureReason: "RR_BELOW_MINIMUM",
          ...aggregateReachSlice(rrBelow),
        });
      }
    }
  }

  const pathOutcomeFindings: HistoricalTargetDistanceStructuralContextAnalysisReport["pathOutcomeFindings"][number][] =
    [];
  for (const [pathOutcome, pRows] of groupBy(enriched, (r) => r.pathOutcome)) {
    for (const [bucket, rows] of groupBy(pRows, (r) => r.rewardBucket)) {
      pathOutcomeFindings.push({
        pathOutcome,
        targetDistanceBucket: bucket,
        ...aggregateReachSlice(rows),
      });
    }
  }

  const costFindings = COST_LEVELS.map((cost) => ({
    roundTripCostPercentage: cost,
    byTargetDistanceBucket: byRewardBucket.map((row) => {
      const rows = enriched.filter((r) => r.rewardBucket === row.bucket);
      const reached = rows.filter(
        (r) =>
          isClassifiable(r.replay.replayEvent) &&
          r.replay.replayEvent === "TARGET_REACHED"
      );
      const covered = reached.filter((r) =>
        costCovered(r.replay.grossTargetMovePercentage, cost)
      ).length;
      const gross = reached
        .map((r) => r.replay.grossTargetMovePercentage)
        .filter((g): g is number => g !== null);
      return {
        bucket: row.bucket,
        ...aggregateReachSlice(rows),
        costCoveredAt0_20: cost === 0.2 ? covered : row.costCoveredAt0_20,
        costCoverageRateAt0_20:
          reached.length > 0 && cost === 0.2 ? covered / reached.length : row.costCoverageRateAt0_20,
        meanGrossMarginOnReached: mean(gross),
        meanNetMarginOnReachedAt0_20: mean(gross.map((g) => g - cost)),
      };
    }),
  }));

  const largeThresholds = [1, 2, 3, 5, 10];
  const largeTargetFindings = largeThresholds.map((threshold) => {
    const rows = enriched.filter(
      (r) =>
        r.canonicalRewardPercentage !== null &&
        r.canonicalRewardPercentage >= threshold
    );
    return { rewardThresholdPercent: threshold, ...aggregateReachSlice(rows) };
  });

  const failedFav = enriched.filter(
    (r) =>
      r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdv = enriched.filter(
    (r) =>
      r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const failedFavBands = [
    { band: "small (<0.25%)", rows: failedFav.filter((r) => r.aggregateBand === "AGG_LT_0_25") },
    {
      band: "medium (0.25–1%)",
      rows: failedFav.filter(
        (r) =>
          r.aggregateBand === "AGG_0_25_TO_0_50" || r.aggregateBand === "AGG_0_50_TO_1_00"
      ),
    },
    {
      band: "large (>=1%)",
      rows: failedFav.filter(
        (r) =>
          r.aggregateBand === "AGG_1_00_TO_2_00" ||
          r.aggregateBand === "AGG_2_00_TO_3_00" ||
          r.aggregateBand === "AGG_GTE_3_00"
      ),
    },
  ];

  const tradeExamples = buildTradeExamples(enriched);

  const sortedBuckets = [...byRewardBucket].sort(
    (a, b) => (a.targetReachRate ?? 0) - (b.targetReachRate ?? 0)
  );
  const headroomCompare = [
    aggregateReachSlice(enriched.filter((r) => r.headroomBucket === "NO_HEADROOM")),
    aggregateReachSlice(
      enriched.filter((r) => r.headroomBucket !== "NO_HEADROOM" && r.headroomBucket !== "HEADROOM_NOT_APPLICABLE")
    ),
  ];

  const diagnosticSummary: HistoricalTargetDistanceStructuralContextAnalysisReport["diagnosticSummary"] =
    [
      {
        question: "Target distance büyüdükçe reach rate nasıl değişiyor?",
        answer: `By B-12r bucket (classifiable canonical replay): lowest reach rate bucket ${sortedBuckets[0]?.bucket ?? "n/a"} (${((sortedBuckets[0]?.targetReachRate ?? 0) * 100).toFixed(1)}%), highest ${sortedBuckets[sortedBuckets.length - 1]?.bucket ?? "n/a"} (${((sortedBuckets[sortedBuckets.length - 1]?.targetReachRate ?? 0) * 100).toFixed(1)}%).`,
        classification: "DIRECT",
      },
      {
        question: "Büyük targetlarda MFE ne gösteriyor?",
        answer: `>=1% reward: mean MFE ${largeTargetFindings.find((l) => l.rewardThresholdPercent === 1)?.meanMfePercentage?.toFixed(3) ?? "n/a"}%; >=3%: ${largeTargetFindings.find((l) => l.rewardThresholdPercent === 3)?.meanMfePercentage?.toFixed(3) ?? "n/a"}%.`,
        classification: "DIRECT",
      },
      {
        question: "Structural headroom target reach ile ilişkili mi?",
        answer: `NO_HEADROOM reach ${((headroomCompare[0].targetReachRate ?? 0) * 100).toFixed(1)}% vs positive headroom ${((headroomCompare[1].targetReachRate ?? 0) * 100).toFixed(1)}% (associational slice comparison).`,
        classification: "ASSOCIATIONAL",
      },
      {
        question: "Anchor source grupları arasında target reach farkı var mı?",
        answer: anchorSourceFindings
          .map(
            (a) =>
              `${a.anchorSource}: ${((a.targetReachRate ?? 0) * 100).toFixed(1)}% (n=${a.classifiableTrades})`
          )
          .join("; "),
        classification: "ASSOCIATIONAL",
      },
      {
        question: "Displacement büyüklüğü target reach ile ilişkili mi?",
        answer: displacementFindings
          .filter((d) => d.classifiableTrades > 0)
          .map(
            (d) =>
              `${d.bucket}: ${((d.targetReachRate ?? 0) * 100).toFixed(1)}%`
          )
          .join("; "),
        classification: "ASSOCIATIONAL",
      },
      {
        question: "Target distance × duration ilişkisi ne?",
        answer: "See targetDistanceByDuration cross-tab (observational).",
        classification: "ASSOCIATIONAL",
      },
      {
        question: "Target distance × cost coverage ilişkisi ne?",
        answer: `At 0.20% cost, smallest bucket REWARD_LT_0_10 cost coverage on reached: ${(byRewardBucket.find((b) => b.bucket === "REWARD_LT_0_10")?.costCoverageRateAt0_20 ?? 0) * 100}% vs REWARD_GTE_3_00: ${(byRewardBucket.find((b) => b.bucket === "REWARD_GTE_3_00")?.costCoverageRateAt0_20 ?? 0) * 100}%.`,
        classification: "DIRECT",
      },
      {
        question: ">=3%, >=5%, >=10% reachability?",
        answer: largeTargetFindings
          .filter((l) => l.rewardThresholdPercent >= 3)
          .map(
            (l) =>
              `>=${l.rewardThresholdPercent}%: reach ${((l.targetReachRate ?? 0) * 100).toFixed(1)}% (n=${l.classifiableTrades})`
          )
          .join("; "),
        classification: "DIRECT",
      },
      {
        question: "FAILED+FAVORABLE cohort target mesafeleri?",
        answer: failedFavBands.map((b) => `${b.band}: ${b.rows.length}`).join("; "),
        classification: "ASSOCIATIONAL",
      },
      {
        question: "DIRECT vs ASSOCIATIONAL?",
        answer:
          "DIRECT: reward/risk/displacement/headroom, B-12w touch timing, MFE, B-12x-aligned cost coverage on reached. ASSOCIATIONAL: evaluator, wave, family, anchor, duration crosses.",
        classification: "DIRECT",
      },
    ];

  return {
    schemaVersion: HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      canonicalReplayClassifiable: classifiableCount,
      canonicalNotReplayable: notReplayable,
    },
    canonicalSources: {
      targetDistanceBuckets: "B-12r PRICE_MOVE_REWARD_BUCKET_IDS",
      reachability: "B-12w CANONICAL_DISPLACEMENT_EQUALITY",
      costCoverage: "B-12x round-trip scenarios (0.10/0.20/0.30/0.50 on reached)",
      displacement: "B-12t perTrade when provided",
      headroom: "B-12u perTrade when provided",
      anchorWave: "B-12t/B-12v when provided",
    },
    targetDistanceFindings: { byRewardBucket, byAggregateBand },
    displacementFindings,
    structuralHeadroomFindings,
    anchorSourceFindings,
    anchorByTargetDistance,
    targetDistanceByHeadroom,
    targetDistanceByDuration,
    waveFindings,
    setupFamilyFindings,
    evaluatorFindings,
    pathOutcomeFindings,
    costFindings,
    largeTargetFindings,
    failedFavorableAnalysis: {
      trades: failedFav.length,
      byTargetSizeBand: failedFavBands.map((b) => ({ band: b.band, trades: b.rows.length })),
      slice: aggregateReachSlice(failedFav),
      note: "FAILED evaluator with FAVORABLE_RESOLUTION path classification; observational only.",
    },
    passedAdverseAnalysis: {
      trades: passedAdv.length,
      slice: aggregateReachSlice(passedAdv),
      note: "PASSED evaluator with ADVERSE_RESOLUTION path classification; observational only.",
    },
    directVsAssociational: {
      directMeasurements: [
        "canonicalRewardPercentage",
        "riskPercentage",
        "displacementPercentage",
        "headroomPercentage",
        "structuralMovePercentage",
        "B-12w TARGET_REACHED / barsToTarget / MFE",
        "cost coverage on reached (B-12x semantics)",
      ],
      associationalMeasurements: [
        "evaluatorStatus × target distance",
        "failureReason × target distance",
        "waveLabel × target distance",
        "setupFamilyId × target distance",
        "anchorSource × outcome",
        "durationBucket × outcome",
      ],
    },
    tradeExamples,
    diagnosticSummary,
    warnings: [...WARNINGS],
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      costAwareCounterfactualAnalysisReport: true,
      entryPriceMoveQualityAnalysisReport: Boolean(input.entryPriceMoveQualityAnalysisReport),
      targetProvenanceStructuralDistanceAnalysisReport: Boolean(
        input.targetProvenanceStructuralDistanceAnalysisReport
      ),
      displacementEqualityTargetMechanicsAnalysisReport: Boolean(
        displacementEqualityTargetMechanicsAnalysisReport
      ),
      structuralExtremeVsDisplacementTargetAnalysisReport: Boolean(
        structuralExtremeVsDisplacementTargetAnalysisReport
      ),
      alternativeTargetModelAnalysisReport: Boolean(alternativeTargetModelAnalysisReport),
    },
  };
}

function pickDistinct(
  list: EnrichedTrade[],
  n: number,
  used: Set<string>
): EnrichedTrade[] {
  const out: EnrichedTrade[] = [];
  for (const r of list) {
    if (out.length >= n) break;
    if (used.has(r.tradeId)) continue;
    used.add(r.tradeId);
    out.push(r);
  }
  return out;
}

function buildTradeExamples(enriched: EnrichedTrade[]): StructuralContextTradeExample[] {
  const withReward = enriched.filter(
    (r) => r.canonicalRewardPercentage !== null && isClassifiable(r.replay.replayEvent)
  );
  const small = [...withReward].sort(
    (a, b) => (a.canonicalRewardPercentage ?? 0) - (b.canonicalRewardPercentage ?? 0)
  );
  const large = [...withReward].sort(
    (a, b) => (b.canonicalRewardPercentage ?? 0) - (a.canonicalRewardPercentage ?? 0)
  );
  const mid = [...withReward].sort(
    (a, b) =>
      Math.abs((a.canonicalRewardPercentage ?? 0) - 0.75) -
      Math.abs((b.canonicalRewardPercentage ?? 0) - 0.75)
  );
  const headroom = [...withReward]
    .filter((r) => (r.headroomPercentage ?? 0) > 0)
    .sort((a, b) => (b.headroomPercentage ?? 0) - (a.headroomPercentage ?? 0));

  const used = new Set<string>();
  const selected = [
    ...pickDistinct(small, 5, used),
    ...pickDistinct(mid, 5, used),
    ...pickDistinct(large, 5, used),
    ...pickDistinct(headroom, 5, used),
  ];
  for (const r of [...enriched].sort((a, b) => a.tradeId.localeCompare(b.tradeId))) {
    if (selected.length >= 20) break;
    if (!used.has(r.tradeId)) {
      used.add(r.tradeId);
      selected.push(r);
    }
  }

  return selected
    .sort((a, b) => a.tradeId.localeCompare(b.tradeId))
    .map(toExample);
}

function toExample(r: EnrichedTrade): StructuralContextTradeExample {
  const reached = r.replay.replayEvent === "TARGET_REACHED";
  const gross = r.replay.grossTargetMovePercentage;
  return {
    tradeId: r.tradeId,
    evaluationBarIndex: r.evaluationBarIndex,
    timestamp: r.timestamp,
    direction: r.direction,
    anchorPrice: r.anchorPrice,
    entryPrice: r.entryPrice,
    targetPrice: r.targetPrice,
    invalidationPrice: r.invalidationPrice,
    canonicalRewardPercentage: r.canonicalRewardPercentage,
    riskPercentage: r.riskPercentage,
    canonicalRrRatio: r.canonicalRrRatio,
    displacementPercentage: r.displacementPercentage,
    structuralMovePercentage: r.structuralMovePercentage,
    headroomPercentage: r.headroomPercentage,
    anchorSource: r.anchorSource,
    waveContext: r.waveContext,
    durationBucket: r.durationBucket,
    evaluatorStatus: r.evaluatorStatus,
    failureReason: r.failureReason,
    pathOutcome: r.pathOutcome,
    targetReached: reached,
    barsToTarget: r.replay.barsToTarget,
    mfe: r.replay.mfePercentage,
    costCoveredAt0_20: reached ? costCovered(gross, 0.2) : null,
  };
}
