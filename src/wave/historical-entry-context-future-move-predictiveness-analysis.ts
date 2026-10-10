import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import { mapHeadroomToSameTargetTier } from "./historical-entry-context-target-research";
import type { AnchorSourceDimension, HeadroomPresence } from "./historical-entry-context-target-research-types";
import { classifyDisplacementContextBucket } from "./historical-target-distance-structural-context-analysis";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import { DISPLACEMENT_CONTEXT_BUCKET_IDS } from "./historical-target-distance-structural-context-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import { STRUCTURAL_MOVE_BUCKET_IDS } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { FutureMovePerTradeRow, ProspectiveRrBucketId } from "./historical-entry-context-future-move-analysis-types";
import { classifyProspectiveRrBucket } from "./historical-entry-context-future-move-analysis";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { ResearchConclusionTag, SameTargetBandHeadroomTier } from "./historical-entry-context-target-research-types";
import {
  FUTURE_MOVE_CONDITIONAL_THRESHOLDS,
  FUTURE_MOVE_LARGE_MOVE_THRESHOLDS,
  FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS,
  FUTURE_MOVE_PROFILE_THRESHOLDS,
  HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION,
  type BuildHistoricalEntryContextFutureMovePredictivenessAnalysisInput,
  type CohortFutureMoveProfile,
  type FutureMoveContextBucketAnalysis,
  type FutureMoveDimensionAnalysis,
  type FutureMovePredictivenessContextDimensionId,
  type FutureMoveSeparationRow,
  type FutureMoveThresholdSliceRow,
  type HistoricalConditionalReachRow,
  type HistoricalEntryContextFutureMovePredictivenessAnalysisReport,
  type LargeMoveContextCrossRow,
  type MonotonicityAssessment,
  type PredictivenessTradeExample,
  type TargetVsFutureMoveCategoryId,
  type TargetVsFutureMoveClassificationRow,
} from "./historical-entry-context-future-move-predictiveness-analysis-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";
const COST_EPS = 1e-9;

const WARNINGS: readonly string[] = [
  "future_move_predictiveness_observational_only",
  "no_production_entry_or_target_rule",
  "historical_conditional_reach_not_causal_probability",
  "evaluator_fields_associational_only",
  "prospective_rr_not_future_move",
  "context_slice_timing_from_b14_population_for_overall_only",
];

const HEADROOM_TIERS: readonly SameTargetBandHeadroomTier[] = [
  "NO_HEADROOM",
  "SMALL_HEADROOM",
  "MEDIUM_HEADROOM",
  "LARGE_HEADROOM",
];

const RR_BUCKET_ORDER: readonly ProspectiveRrBucketId[] = [
  "RR_LT_1",
  "RR_1_TO_1_5",
  "RR_GTE_1_5",
];

interface EnrichedRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  waveLabel: string;
  setupFamilyId: string;
  anchorSource: AnchorSourceDimension;
  displacementBucket: DisplacementContextBucketId;
  headroomPresence: HeadroomPresence;
  headroomTier: SameTargetBandHeadroomTier;
  structuralMoveBucket: StructuralMoveBucketId;
  rewardBucket: PriceMoveRewardBucketId;
  rrBucket: ProspectiveRrBucketId;
  evaluatorStatus: string;
  failureReason: TradeEvaluationFirstFailureCode | "NONE";
  policyClassification: string;
  future: FutureMovePerTradeRow;
  classifiable: boolean;
}

function resolveAnchorKey(
  sources: readonly OpenStructuralLegAnchorSource[] | readonly string[] | null | undefined
): AnchorSourceDimension {
  if (!sources?.length) return "UNKNOWN";
  const u = [...new Set(sources)];
  return u.length === 1 ? (u[0] as AnchorSourceDimension) : "MIXED";
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

export function futureMoveReachedAtThreshold(
  favorableMovePercentage: number | null,
  thresholdPercent: number
): boolean {
  return favorableMovePercentage !== null && favorableMovePercentage + COST_EPS >= thresholdPercent;
}

export function classifyTargetVsFutureMoveCategory(row: FutureMovePerTradeRow): TargetVsFutureMoveCategoryId {
  const mfe = row.favorableMovePercentage;
  const target = row.canonicalTargetPercent;
  if (row.futureContextStatus !== "CLASSIFIABLE" || row.movementOutcomeClass === "NOT_REPLAYABLE") {
    return "NOT_CLASSIFIED";
  }
  if (mfe === null || target === null) return "NOT_CLASSIFIED";
  if (row.movementOutcomeClass === "TARGET_REACHED" || row.pathOutcome === "TARGET_TOUCHED") {
    return "FUTURE_REACHED_TARGET";
  }
  if (row.movementOutcomeClass === "TARGET_NOT_REACHED_MFE_GTE_TARGET") {
    return "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH";
  }
  if (mfe + COST_EPS >= target) {
    return "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH";
  }
  if (mfe > target + COST_EPS) {
    return "FUTURE_EXCEEDED_TARGET";
  }
  return "FUTURE_BELOW_TARGET";
}

function isClassifiableFuture(row: FutureMovePerTradeRow): boolean {
  return (
    row.futureContextStatus === "CLASSIFIABLE" &&
    row.movementOutcomeClass !== "NOT_REPLAYABLE" &&
    row.favorableMovePercentage !== null
  );
}

function buildThresholdSlice(
  rows: EnrichedRow[],
  thresholdPercent: number,
  overallReachRate: number | null
): FutureMoveThresholdSliceRow {
  const classifiableRows = rows.filter((r) => r.classifiable);
  const reached = classifiableRows.filter((r) =>
    futureMoveReachedAtThreshold(r.future.favorableMovePercentage, thresholdPercent)
  );
  const mfes = classifiableRows
    .map((r) => r.future.favorableMovePercentage)
    .filter((x): x is number => x !== null);
  const bars = reached
    .map((r) => r.future.barsToMaxFavorableExcursion)
    .filter((b): b is number => b !== null);
  const n = classifiableRows.length;
  const h = reached.length;
  const rate = n > 0 ? h / n : null;
  return {
    thresholdPercent,
    trades: rows.length,
    classifiable: n,
    futureMoveReachedCount: h,
    futureMoveReachRate: rate,
    medianBarsToThreshold: median(bars),
    meanFavorableMovePercentage: mean(mfes),
    medianFavorableMovePercentage: median(mfes),
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
    interpretWithCaution: n < 10,
    wilson95: computeIndependentTradeWinRateConfidenceInterval(h, n - h, 0.95),
    deltaVsOverallPercentagePoints:
      rate !== null && overallReachRate !== null ? (rate - overallReachRate) * 100 : null,
    associationTag: "DESCRIPTIVE_ASSOCIATION",
  };
}

function buildBucketAnalysis(
  rows: EnrichedRow[],
  overallRates: Map<number, number | null>
): FutureMoveContextBucketAnalysis {
  const classifiableRows = rows.filter((r) => r.classifiable);
  const mfes = classifiableRows
    .map((r) => r.future.favorableMovePercentage)
    .filter((x): x is number => x !== null);
  const maes = classifiableRows
    .map((r) => r.future.adverseMovePercentage)
    .filter((x): x is number => x !== null);
  const ratios = classifiableRows
    .map((r) => r.future.futureMfeToCanonicalTargetRatio)
    .filter((x): x is number => x !== null);
  const barsMfe = classifiableRows
    .map((r) => r.future.barsToMaxFavorableExcursion)
    .filter((b): b is number => b !== null);
  const n = rows.length;
  const thresholdSlices = FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS.map((t) =>
    buildThresholdSlice(rows, t, overallRates.get(t) ?? null)
  );
  const multiThresholdProfile = FUTURE_MOVE_PROFILE_THRESHOLDS.map((t) => {
    const slice = thresholdSlices.find((s) => s.thresholdPercent === t);
    return {
      thresholdPercent: t,
      futureMoveReachRate: slice?.futureMoveReachRate ?? null,
      futureMoveReachedCount: slice?.futureMoveReachedCount ?? 0,
      classifiable: slice?.classifiable ?? 0,
    };
  });
  return {
    bucketId: "PENDING",
    trades: n,
    classifiable: classifiableRows.length,
    thresholdSlices,
    multiThresholdProfile,
    mfeMae: {
      meanMfe: mean(mfes),
      medianMfe: median(mfes),
      meanMae: mean(maes),
      medianMae: median(maes),
      meanMfeToCanonicalTargetRatio: mean(ratios),
      medianBarsToMaxFavorableExcursion: median(barsMfe),
    },
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(classifiableRows.length),
    interpretWithCaution: classifiableRows.length < 10,
  };
}

function buildDimensionAnalysis(
  dimensionId: FutureMovePredictivenessContextDimensionId,
  rows: EnrichedRow[],
  bucketKey: (r: EnrichedRow) => string,
  orderedBucketIds: readonly string[],
  overallRates: Map<number, number | null>,
  secondaryAssociational = false
): FutureMoveDimensionAnalysis {
  const buckets: FutureMoveContextBucketAnalysis[] = [];
  for (const bucketId of orderedBucketIds) {
    const group = rows.filter((r) => bucketKey(r) === bucketId);
    if (!group.length) continue;
    const analysis = buildBucketAnalysis(group, overallRates);
    buckets.push({ ...analysis, bucketId });
  }
  const extraBuckets = [...new Set(rows.map(bucketKey))].filter(
    (id) => !orderedBucketIds.includes(id)
  );
  for (const bucketId of extraBuckets.sort()) {
    const group = rows.filter((r) => bucketKey(r) === bucketId);
    const analysis = buildBucketAnalysis(group, overallRates);
    buckets.push({ ...analysis, bucketId });
  }
  return {
    dimensionId,
    secondaryAssociational,
    orderedBucketIds,
    buckets,
  };
}

function assessMonotonicity(
  ordered: readonly { bucketId: string; reachRate: number | null }[]
): MonotonicityAssessment {
  const rates = ordered.map((o) => o.reachRate).filter((r): r is number => r !== null);
  if (rates.length < 2) return "NOT_MONOTONIC";
  let inc = true;
  let dec = true;
  for (let i = 1; i < rates.length; i++) {
    if (rates[i]! < rates[i - 1]! - COST_EPS) inc = false;
    if (rates[i]! > rates[i - 1]! + COST_EPS) dec = false;
  }
  if (inc) return "MONOTONIC_INCREASING";
  if (dec) return "MONOTONIC_DECREASING";
  return "NOT_MONOTONIC";
}

function buildSeparation(
  dimensionId: FutureMovePredictivenessContextDimensionId,
  dimension: FutureMoveDimensionAnalysis,
  thresholdPercent: number
): FutureMoveSeparationRow {
  const orderedBucketReachRates = dimension.orderedBucketIds.map((bucketId) => {
    const bucket = dimension.buckets.find((b) => b.bucketId === bucketId);
    const slice = bucket?.thresholdSlices.find((s) => s.thresholdPercent === thresholdPercent);
    return {
      bucketId,
      reachRate: slice?.futureMoveReachRate ?? null,
      classifiable: slice?.classifiable ?? 0,
    };
  });
  const withRates = orderedBucketReachRates.filter((o) => o.reachRate !== null && o.classifiable > 0);
  let highestBucketId: string | null = null;
  let highestReachRate: number | null = null;
  let lowestBucketId: string | null = null;
  let lowestReachRate: number | null = null;
  for (const o of withRates) {
    if (highestReachRate === null || o.reachRate! > highestReachRate) {
      highestReachRate = o.reachRate;
      highestBucketId = o.bucketId;
    }
    if (lowestReachRate === null || o.reachRate! < lowestReachRate) {
      lowestReachRate = o.reachRate;
      lowestBucketId = o.bucketId;
    }
  }
  const spread =
    highestReachRate !== null && lowestReachRate !== null
      ? (highestReachRate - lowestReachRate) * 100
      : null;
  const totalClassifiable = withRates.reduce((s, o) => s + o.classifiable, 0);
  return {
    dimensionId,
    thresholdPercent,
    highestBucketId,
    highestReachRate,
    lowestBucketId,
    lowestReachRate,
    spreadPercentagePoints: spread,
    monotonicity: assessMonotonicity(orderedBucketReachRates),
    orderedBucketReachRates,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(totalClassifiable),
    interpretWithCaution: totalClassifiable < 30,
    wilson95SpreadNote: "Spread is descriptive; bucket-level Wilson intervals not combined.",
  };
}

function buildCohortProfile(rows: EnrichedRow[], note: string): CohortFutureMoveProfile {
  const classifiable = rows.filter((r) => r.classifiable);
  const mfes = classifiable
    .map((r) => r.future.favorableMovePercentage)
    .filter((x): x is number => x !== null);
  const maes = classifiable
    .map((r) => r.future.adverseMovePercentage)
    .filter((x): x is number => x !== null);
  const rewards = classifiable
    .map((r) => r.future.canonicalTargetPercent)
    .filter((x): x is number => x !== null);
  const ratios = classifiable
    .map((r) => r.future.futureMfeToCanonicalTargetRatio)
    .filter((x): x is number => x !== null);
  const multiThresholdProfile = FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS.map((t) => {
    const hit = classifiable.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)
    );
    const n = classifiable.length;
    return {
      thresholdPercent: t,
      futureMoveReachRate: n > 0 ? hit.length / n : null,
      futureMoveReachedCount: hit.length,
    };
  });
  return {
    trades: rows.length,
    classifiable: classifiable.length,
    multiThresholdProfile,
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    meanMae: mean(maes),
    medianMae: median(maes),
    meanCanonicalReward: mean(rewards),
    meanMfeToCanonicalTargetRatio: mean(ratios),
    note,
  };
}

function buildTradeExamples(rows: EnrichedRow[]): PredictivenessTradeExample[] {
  const picks: PredictivenessTradeExample[] = [];
  const sorted = [...rows].filter((r) => r.classifiable).sort((a, b) => a.tradeId.localeCompare(b.tradeId));
  const push = (r: EnrichedRow, note: string) => {
    if (picks.some((p) => p.tradeId === r.tradeId)) return;
    picks.push({
      tradeId: r.tradeId,
      evaluationBarIndex: r.evaluationBarIndex,
      direction: r.direction,
      displacementBucket: r.displacementBucket,
      headroomPresence: r.headroomPresence,
      canonicalRewardPercentage: r.future.canonicalTargetPercent,
      prospectiveRr: r.future.canonicalRrRatio,
      favorableMovePercentage: r.future.favorableMovePercentage,
      targetVsFutureCategory: classifyTargetVsFutureMoveCategory(r.future),
      evaluatorStatus: r.evaluatorStatus,
      policyClassification: r.policyClassification,
      note,
    });
  };
  for (const r of sorted.slice(0, 12)) push(r, "deterministic_sample");
  const smallTarget = sorted.find((r) => (r.future.canonicalTargetPercent ?? 99) < 1);
  if (smallTarget) push(smallTarget, "small_canonical_target");
  const largeMfe = [...sorted].sort(
    (a, b) => (b.future.favorableMovePercentage ?? 0) - (a.future.favorableMovePercentage ?? 0)
  )[0];
  if (largeMfe) push(largeMfe, "large_future_move");
  const failedFav = rows.find(
    (r) => r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  if (failedFav) push(failedFav, "failed_favorable_cohort");
  const passedAdv = rows.find(
    (r) => r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );
  if (passedAdv) push(passedAdv, "passed_adverse_cohort");
  const beyond = sorted.find(
    (r) => classifyTargetVsFutureMoveCategory(r.future) === "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH"
  );
  if (beyond) push(beyond, "mfe_beyond_without_touch");
  let fillIndex = 0;
  while (picks.length < 30 && fillIndex < sorted.length) {
    push(sorted[fillIndex]!, "fill_to_thirty");
    fillIndex += 1;
  }
  return picks.slice(0, 36);
}

export function buildHistoricalEntryContextFutureMovePredictivenessAnalysis(
  input: BuildHistoricalEntryContextFutureMovePredictivenessAnalysisInput
): HistoricalEntryContextFutureMovePredictivenessAnalysisReport {
  const { lifecycleReport, futureMoveAnalysisReport: b14 } = input;
  const b14ByTrade = new Map(b14.perTrade.map((r) => [r.tradeId, r]));
  const dispByTrade = new Map(
    (input.displacementEqualityTargetMechanicsReport?.targetMagnitude.perTrade ?? []).map((r) => [
      r.tradeId,
      r,
    ])
  );
  const structByTrade = new Map(
    (input.structuralExtremeVsDisplacementTargetReport?.perTrade ?? []).map((r) => [r.tradeId, r])
  );

  const enriched: EnrichedRow[] = [];
  for (const t of lifecycleReport.trades) {
    const future = b14ByTrade.get(t.tradeId);
    if (!future) continue;
    const disp = dispByTrade.get(t.tradeId);
    const struct = structByTrade.get(t.tradeId);
    const displacementBucket = classifyDisplacementContextBucket(disp?.displacementPercentage ?? null);
    const headroomPct = struct?.prefixExtremeHeadroomPercentage ?? null;
    const headroomPresence: HeadroomPresence =
      headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT";
    const headroomTier = mapHeadroomToSameTargetTier(
      struct?.prefixHeadroomBucket ?? "HEADROOM_NOT_APPLICABLE"
    );
    enriched.push({
      tradeId: t.tradeId,
      evaluationBarIndex: future.evaluationBarIndex,
      direction: future.direction,
      waveLabel: struct?.waveLabel ?? "UNKNOWN",
      setupFamilyId: struct?.setupFamilyId ?? t.setupFamilyId ?? "UNKNOWN",
      anchorSource: resolveAnchorKey(disp?.anchorSources ?? struct?.anchorSources),
      displacementBucket,
      headroomPresence,
      headroomTier,
      structuralMoveBucket: struct?.prefixStructuralMoveBucket ?? "STRUCTURAL_NOT_APPLICABLE",
      rewardBucket: classifyPriceMoveRewardBucket(future.canonicalTargetPercent),
      rrBucket: classifyProspectiveRrBucket(future.canonicalRrRatio),
      evaluatorStatus: future.tradeEvaluationStatus,
      failureReason: future.evaluatorFirstFailure ?? "NONE",
      policyClassification: future.policyClassification,
      future,
      classifiable: isClassifiableFuture(future),
    });
  }

  const classifiableRows = enriched.filter((r) => r.classifiable);
  const overallRates = new Map<number, number | null>();
  for (const t of FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS) {
    const hit = classifiableRows.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)
    );
    overallRates.set(t, classifiableRows.length > 0 ? hit.length / classifiableRows.length : null);
  }

  const displacementAnalysis = buildDimensionAnalysis(
    "DISPLACEMENT",
    enriched,
    (r) => r.displacementBucket,
    DISPLACEMENT_CONTEXT_BUCKET_IDS,
    overallRates
  );
  const headroomPresenceAnalysis = buildDimensionAnalysis(
    "HEADROOM_PRESENCE",
    enriched,
    (r) => r.headroomPresence,
    ["HEADROOM_ABSENT", "HEADROOM_PRESENT"],
    overallRates
  );
  const headroomTierAnalysis = buildDimensionAnalysis(
    "HEADROOM_TIER",
    enriched,
    (r) => r.headroomTier,
    HEADROOM_TIERS,
    overallRates
  );
  const structuralMoveAnalysis = buildDimensionAnalysis(
    "STRUCTURAL_MOVE",
    enriched,
    (r) => r.structuralMoveBucket,
    STRUCTURAL_MOVE_BUCKET_IDS,
    overallRates
  );
  const canonicalRewardAnalysis = buildDimensionAnalysis(
    "CANONICAL_REWARD",
    enriched,
    (r) => r.rewardBucket,
    [
      "REWARD_0_50_TO_1_00",
      "REWARD_1_00_TO_2_00",
      "REWARD_2_00_TO_3_00",
      "REWARD_GTE_3_00",
    ],
    overallRates
  );
  const prospectiveRrAnalysis = buildDimensionAnalysis(
    "PROSPECTIVE_RR",
    enriched,
    (r) => r.rrBucket,
    RR_BUCKET_ORDER,
    overallRates
  );
  const directionAnalysis = buildDimensionAnalysis(
    "DIRECTION",
    enriched,
    (r) => r.direction,
    ["BULLISH", "BEARISH", "UNRESOLVED", "UNKNOWN"],
    overallRates
  );
  const waveAnalysis = buildDimensionAnalysis(
    "WAVE",
    enriched,
    (r) => r.waveLabel,
    [],
    overallRates,
    true
  );
  const setupFamilyAnalysis = buildDimensionAnalysis(
    "SETUP_FAMILY",
    enriched,
    (r) => r.setupFamilyId,
    [],
    overallRates,
    true
  );
  const anchorSourceAnalysis = buildDimensionAnalysis(
    "ANCHOR_SOURCE",
    enriched,
    (r) => r.anchorSource,
    [],
    overallRates,
    true
  );
  const evaluatorStatusAnalysis = buildDimensionAnalysis(
    "EVALUATOR_STATUS",
    enriched,
    (r) => r.evaluatorStatus,
    ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"],
    overallRates,
    true
  );
  const evaluatorFailureAnalysis = buildDimensionAnalysis(
    "EVALUATOR_FAILURE",
    enriched,
    (r) => r.failureReason as string,
    [],
    overallRates,
    true
  );

  const separationDimensions: FutureMoveDimensionAnalysis[] = [
    displacementAnalysis,
    headroomPresenceAnalysis,
    structuralMoveAnalysis,
    canonicalRewardAnalysis,
    prospectiveRrAnalysis,
  ];
  const separationAnalysis: FutureMoveSeparationRow[] = [];
  for (const dim of separationDimensions) {
    for (const th of [1, 2, 3] as const) {
      separationAnalysis.push(buildSeparation(dim.dimensionId, dim, th));
    }
  }

  const conditionalHistoricalReach: HistoricalConditionalReachRow[] = [];
  const conditionalDims: { dim: FutureMoveDimensionAnalysis; id: FutureMovePredictivenessContextDimensionId }[] =
    [
      { dim: displacementAnalysis, id: "DISPLACEMENT" },
      { dim: headroomPresenceAnalysis, id: "HEADROOM_PRESENCE" },
      { dim: prospectiveRrAnalysis, id: "PROSPECTIVE_RR" },
    ];
  for (const { dim, id } of conditionalDims) {
    for (const bucket of dim.buckets) {
      for (const th of FUTURE_MOVE_CONDITIONAL_THRESHOLDS) {
        const slice = bucket.thresholdSlices.find((s) => s.thresholdPercent === th);
        if (!slice) continue;
        conditionalHistoricalReach.push({
          contextDimension: id,
          bucketId: bucket.bucketId,
          thresholdPercent: th,
          classifiable: slice.classifiable,
          futureMoveReachedCount: slice.futureMoveReachedCount,
          historicalConditionalReachRate: slice.futureMoveReachRate,
          wilson95: slice.wilson95,
          sampleSizeQuality: slice.sampleSizeQuality,
          interpretWithCaution: slice.interpretWithCaution,
          label: "HISTORICAL_CONDITIONAL_REACH_RATE",
        });
      }
    }
  }

  const multiThresholdProfiles = displacementAnalysis.buckets.map((b) => ({
    dimensionId: "DISPLACEMENT" as const,
    bucketId: b.bucketId,
    profile: b.multiThresholdProfile.map((p) => ({
      thresholdPercent: p.thresholdPercent,
      futureMoveReachRate: p.futureMoveReachRate,
    })),
  }));

  const largeMoveAnalysis: LargeMoveContextCrossRow[] = [];
  const largeDims: { dim: FutureMoveDimensionAnalysis; id: FutureMovePredictivenessContextDimensionId }[] =
    [
      { dim: displacementAnalysis, id: "DISPLACEMENT" },
      { dim: headroomPresenceAnalysis, id: "HEADROOM_PRESENCE" },
      { dim: prospectiveRrAnalysis, id: "PROSPECTIVE_RR" },
      { dim: waveAnalysis, id: "WAVE" },
      { dim: setupFamilyAnalysis, id: "SETUP_FAMILY" },
    ];
  for (const { dim, id } of largeDims) {
    for (const bucket of dim.buckets) {
      for (const th of FUTURE_MOVE_LARGE_MOVE_THRESHOLDS) {
        const slice = bucket.thresholdSlices.find((s) => s.thresholdPercent === th);
        if (!slice) continue;
        largeMoveAnalysis.push({
          dimensionId: id,
          bucketId: bucket.bucketId,
          thresholdPercent: th,
          trades: bucket.trades,
          classifiable: slice.classifiable,
          futureMoveReachedCount: slice.futureMoveReachedCount,
          futureMoveReachRate: slice.futureMoveReachRate,
          wilson95: slice.wilson95,
          sampleSizeQuality: slice.sampleSizeQuality,
          interpretWithCaution: slice.interpretWithCaution || th >= 10,
        });
      }
    }
  }

  const targetCategories: TargetVsFutureMoveCategoryId[] = [
    "FUTURE_BELOW_TARGET",
    "FUTURE_REACHED_TARGET",
    "FUTURE_EXCEEDED_TARGET",
    "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH",
    "NOT_CLASSIFIED",
  ];
  const targetVsFutureMove: TargetVsFutureMoveClassificationRow[] = targetCategories.map((category) => {
    const group = enriched.filter((r) => classifyTargetVsFutureMoveCategory(r.future) === category);
    const mfes = group
      .map((r) => r.future.favorableMovePercentage)
      .filter((x): x is number => x !== null);
    const rewards = group
      .map((r) => r.future.canonicalTargetPercent)
      .filter((x): x is number => x !== null);
    return {
      category,
      trades: group.length,
      meanFavorableMove: mean(mfes),
      medianFavorableMove: median(mfes),
      meanCanonicalReward: mean(rewards),
    };
  });

  const failedFavorable = enriched.filter(
    (r) => r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdverse = enriched.filter(
    (r) => r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const mfeMaeAnalysis = displacementAnalysis.buckets.map((b) => ({
    dimensionId: "DISPLACEMENT" as const,
    bucketId: b.bucketId,
    meanMfe: b.mfeMae.meanMfe,
    medianMfe: b.mfeMae.medianMfe,
    meanMae: b.mfeMae.meanMae,
    medianMae: b.mfeMae.medianMae,
    meanMfeToTargetRatio: b.mfeMae.meanMfeToCanonicalTargetRatio,
    trades: b.trades,
  }));

  const timeToThresholdAnalysis = b14.thresholdAnalysis.map((row) => ({
    thresholdPercent: row.thresholdPercent,
    source: "B-14.thresholdAnalysis",
    medianBarsToReach: row.medianBarsToReach,
    p25BarsToReach: row.p25BarsToReach,
    p75BarsToReach: row.p75BarsToReach,
    b14ParityMatch: true,
  }));

  let b14ThresholdParity = true;
  for (const row of b14.thresholdAnalysis) {
    const slice = buildThresholdSlice(classifiableRows, row.thresholdPercent, null);
    if (slice.futureMoveReachedCount !== row.futureMoveReachedCount) {
      b14ThresholdParity = false;
      break;
    }
  }

  const dispSmall = displacementAnalysis.buckets.find((b) => b.bucketId === "DISP_LT_0_25");
  const dispLarge = displacementAnalysis.buckets.find((b) => b.bucketId === "DISP_GTE_3_00");
  const rateAt = (b: FutureMoveContextBucketAnalysis | undefined, t: number) =>
    b?.thresholdSlices.find((s) => s.thresholdPercent === t)?.futureMoveReachRate;

  const diagnosticSummary: HistoricalEntryContextFutureMovePredictivenessAnalysisReport["diagnosticSummary"] =
    [
    {
      question: "E anındaki displacement future move büyüklüğüyle ilişkili mi?",
      answer: `Displacement buckets n=${displacementAnalysis.buckets.length}; separation at 1% spread ${separationAnalysis.find((s) => s.dimensionId === "DISPLACEMENT" && s.thresholdPercent === 1)?.spreadPercentagePoints?.toFixed(1) ?? "n/a"} pp.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Küçük displacement büyük move'ları daha sık görüyor mu?",
      answer: `DISP_LT_0_25 vs DISP_GTE_3_00 at 1%: ${((rateAt(dispSmall, 1) ?? 0) * 100).toFixed(1)}% vs ${((rateAt(dispLarge, 1) ?? 0) * 100).toFixed(1)}%; at 2%: ${((rateAt(dispSmall, 2) ?? 0) * 100).toFixed(1)}% vs ${((rateAt(dispLarge, 2) ?? 0) * 100).toFixed(1)}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Headroom present future move ile ilişkili mi?",
      answer: `HEADROOM_PRESENT vs ABSENT at 2%: compare headroomAnalysis.presence buckets.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Structural move future move ile ilişkili mi?",
      answer: `Structural buckets: ${structuralMoveAnalysis.buckets.length}; see structuralMoveAnalysis.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Canonical reward ile future MFE arasında ilişki nasıl?",
      answer: `See canonicalRewardAnalysis multiThresholdProfile by reward bucket.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "RR future move magnitude'u ayırt ediyor mu?",
      answer: `RR separation at 2%: ${separationAnalysis.find((s) => s.dimensionId === "PROSPECTIVE_RR" && s.thresholdPercent === 2)?.spreadPercentagePoints?.toFixed(1) ?? "n/a"} pp; prospective RR ≠ future move.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "%1 future move hangi contextlerde yoğun?",
      answer: `Highest 1% reach bucket (displacement): ${separationAnalysis.find((s) => s.dimensionId === "DISPLACEMENT" && s.thresholdPercent === 1)?.highestBucketId ?? "n/a"}.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "%2 future move hangi contextlerde yoğun?",
      answer: `Highest 2% reach (displacement): ${separationAnalysis.find((s) => s.dimensionId === "DISPLACEMENT" && s.thresholdPercent === 2)?.highestBucketId ?? "n/a"}.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "%3 future move hangi contextlerde yoğun?",
      answer: `Population overall 3%: ${((overallRates.get(3) ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "%5 future move hangi contextlerde yoğun?",
      answer: `Population overall 5%: ${((overallRates.get(5) ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "%10 future move için yeterli sample var mı?",
      answer: `Overall 10% reached ${b14.thresholdAnalysis.find((t) => t.thresholdPercent === 10)?.futureMoveReachedCount ?? 0} / ${classifiableRows.length}.`,
      tag: ((b14.thresholdAnalysis.find((t) => t.thresholdPercent === 10)?.futureMoveReachedCount ?? 0) <
      10
        ? "INSUFFICIENT_SAMPLE"
        : "DIRECT_OBSERVATION") satisfies ResearchConclusionTag,
    },
    {
      question: "FAILED + FAVORABLE future move profili nedir?",
      answer: `n=${failedFavorable.length}; median MFE ${buildCohortProfile(failedFavorable, "").medianMfe?.toFixed(2) ?? "n/a"}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "PASSED + ADVERSE future move profili nedir?",
      answer: `n=${passedAdverse.length}; median MFE ${buildCohortProfile(passedAdverse, "").medianMfe?.toFixed(2) ?? "n/a"}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Canonical target küçükken daha büyük future move gerçekleşiyor mu?",
      answer: `See targetVsFutureMove and mfeBeyond canonical fields in B-14; ${targetVsFutureMove.find((t) => t.category === "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH")?.trades ?? 0} without-touch exceed rows.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "MFE >= target ama target touch yok durumu ne kadar?",
      answer: `${targetVsFutureMove.find((t) => t.category === "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH")?.trades ?? 0} trades (B-14 movement semantics).`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Context değişkenlerinden hangilerinde en yüksek separation var?",
      answer: `Max spread among displacement/headroom/structural/reward/RR at 2%: ${Math.max(...separationAnalysis.filter((s) => s.thresholdPercent === 2).map((s) => s.spreadPercentagePoints ?? 0)).toFixed(1)} pp.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Separation monoton mu?",
      answer: `Displacement 2%: ${separationAnalysis.find((s) => s.dimensionId === "DISPLACEMENT" && s.thresholdPercent === 2)?.monotonicity ?? "n/a"}.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Hangi sonuçlar direct observation?",
      answer: "Overall threshold reach, MFE/MAE arithmetic, B-14 timeToThreshold parity rows, target-vs-future counts.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Hangi sonuçlar yalnızca association?",
      answer: "Displacement, headroom, structural move, RR, wave, family, evaluator slices.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Production entry/target rule çıkarmak için veri yeterli mi?",
      answer: "NOT_ESTABLISHED — observational frozen cohort only; no causal or out-of-sample validation.",
      tag: "NOT_ESTABLISHED",
    },
  ];

  const warnings = [...WARNINGS];
  if (!input.displacementEqualityTargetMechanicsReport) {
    warnings.push("b12t_not_supplied_displacement_from_null_classifier");
  }
  if (!input.structuralExtremeVsDisplacementTargetReport) {
    warnings.push("b12u_not_supplied_headroom_structural_na");
  }
  const anchorUnique = [...new Set(enriched.map((r) => r.anchorSource))];
  if (anchorUnique.length === 1 && anchorUnique[0] === "MIXED") {
    warnings.push("anchor_source_cohort_mostly_mixed");
  }

  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION,
    datasetReference: b14.datasetReference,
    population: {
      independentTrades: lifecycleReport.trades.length,
      b14PerTradeRows: b14.perTrade.length,
      classifiableForFutureMove: classifiableRows.length,
      horizonBars: b14.horizon.horizonBars,
    },
    thresholds: [...FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS],
    contextDimensions: [
      "DISPLACEMENT",
      "HEADROOM_PRESENCE",
      "HEADROOM_TIER",
      "STRUCTURAL_MOVE",
      "CANONICAL_REWARD",
      "PROSPECTIVE_RR",
      "DIRECTION",
      "WAVE",
      "SETUP_FAMILY",
      "ANCHOR_SOURCE",
      "EVALUATOR_STATUS",
      "EVALUATOR_FAILURE",
    ],
    displacementAnalysis,
    headroomAnalysis: {
      presence: headroomPresenceAnalysis,
      tier: headroomTierAnalysis,
    },
    structuralMoveAnalysis,
    canonicalRewardAnalysis,
    prospectiveRrAnalysis,
    directionAnalysis,
    waveAnalysis,
    setupFamilyAnalysis,
    anchorSourceAnalysis,
    evaluatorStatusAnalysis,
    evaluatorFailureAnalysis,
    targetVsFutureMove,
    largeMoveAnalysis,
    failedFavorableAnalysis: buildCohortProfile(
      failedFavorable,
      "FAILED + FAVORABLE_RESOLUTION — associational only."
    ),
    passedAdverseAnalysis: buildCohortProfile(
      passedAdverse,
      "PASSED + ADVERSE_RESOLUTION — associational only."
    ),
    separationAnalysis,
    conditionalHistoricalReach,
    multiThresholdProfiles,
    mfeMaeAnalysis,
    timeToThresholdAnalysis,
    diagnosticSummary,
    directVsAssociational: {
      direct: [
        "future_move_threshold_reach_counts",
        "MFE_MAE_arithmetic",
        "historical_conditional_reach_rate_formula",
        "target_vs_future_classification_counts",
        "B-14_time_to_threshold_parity",
      ],
      associational: [
        "displacement_vs_future_move",
        "headroom_vs_future_move",
        "structural_move_vs_future_move",
        "canonical_reward_vs_future_move",
        "prospective_rr_vs_future_move",
        "evaluator_status_vs_future_move",
        "wave_and_setup_family_secondary",
      ],
    },
    lookaheadAttestation: {
      entryContextEnd: "E",
      futureOutcomeStart: "E+1",
      statement:
        "Context fields consumed from frozen E-time reports only. Future favorable/adverse percentages from B-14 perTrade (E+1..horizon).",
    },
    parity: {
      b14ThresholdReachCountsMatch: b14ThresholdParity,
      b14PopulationClassifiable: b14.population.canonicalReplayClassifiable,
      note: "Reach counts recomputed from B-14 perTrade favorableMovePercentage must match B-14 thresholdAnalysis.",
    },
    warnings,
    tradeExamples: buildTradeExamples(enriched),
    consumedReports: {
      lifecycleReport: true,
      futureMoveAnalysisReport: true,
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
      historicalEntryContextTargetResearchReport: Boolean(input.historicalEntryContextTargetResearchReport),
      displacementEqualityTargetMechanicsReport: Boolean(input.displacementEqualityTargetMechanicsReport),
      structuralExtremeVsDisplacementTargetReport: Boolean(input.structuralExtremeVsDisplacementTargetReport),
      alternativeTargetModelAnalysisReport: Boolean(input.alternativeTargetModelAnalysisReport),
    },
  };
}
