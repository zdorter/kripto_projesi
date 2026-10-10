import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import { mapHeadroomToSameTargetTier } from "./historical-entry-context-target-research";
import type { AnchorSourceDimension, HeadroomPresence } from "./historical-entry-context-target-research-types";
import { classifyDisplacementContextBucket } from "./historical-target-distance-structural-context-analysis";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { FutureMovePerTradeRow, ProspectiveRrBucketId } from "./historical-entry-context-future-move-analysis-types";
import { classifyProspectiveRrBucket } from "./historical-entry-context-future-move-analysis";
import { futureMoveReachedAtThreshold } from "./historical-entry-context-future-move-predictiveness-analysis";
import { classifyTargetVsFutureMoveCategory } from "./historical-entry-context-future-move-predictiveness-analysis";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { SameTargetBandHeadroomTier } from "./historical-entry-context-target-research-types";
import {
  COMBINATION_FUTURE_MOVE_THRESHOLDS,
  COMBINATION_LARGE_MOVE_THRESHOLDS,
  COMBINATION_STABILITY_THRESHOLDS,
  HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
  type BuildHistoricalEntryContextCombinationFutureMoveAnalysisInput,
  type CombinationBucketReport,
  type CombinationSeparationRow,
  type CombinationSetReport,
  type CombinationStabilityClass,
  type CombinationThresholdCell,
  type ContextDimensionKey,
  type HistoricalEntryContextCombinationFutureMoveAnalysisReport,
} from "./historical-entry-context-combination-future-move-analysis-types";

const MIN_REPORTABLE_CLASSIFIABLE = 10;

const WARNINGS: readonly string[] = [
  "combination_future_move_observational_only",
  "multiple_comparisons_selection_bias_risk",
  "no_best_or_optimal_combination_language",
  "historical_conditional_reach_not_causal",
  "evaluator_fields_associational_only",
  "prospective_rr_not_future_move",
  "no_statistical_significance_claims",
];

interface EnrichedRow {
  tradeId: string;
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

interface CombinationSpec {
  id: string;
  dimensions: readonly ContextDimensionKey[];
}

const PAIR_SPECS: readonly CombinationSpec[] = [
  { id: "PAIR_DISPLACEMENT_HEADROOM", dimensions: ["displacement", "headroom"] },
  { id: "PAIR_DISPLACEMENT_REWARD", dimensions: ["displacement", "canonicalReward"] },
  { id: "PAIR_DISPLACEMENT_RR", dimensions: ["displacement", "prospectiveRr"] },
  { id: "PAIR_HEADROOM_REWARD", dimensions: ["headroom", "canonicalReward"] },
  { id: "PAIR_HEADROOM_RR", dimensions: ["headroom", "prospectiveRr"] },
  { id: "PAIR_STRUCTURAL_DISPLACEMENT", dimensions: ["structuralMove", "displacement"] },
  { id: "PAIR_STRUCTURAL_HEADROOM", dimensions: ["structuralMove", "headroom"] },
  { id: "PAIR_REWARD_RR", dimensions: ["canonicalReward", "prospectiveRr"] },
  { id: "PAIR_DIRECTION_DISPLACEMENT", dimensions: ["direction", "displacement"] },
  { id: "PAIR_DIRECTION_HEADROOM", dimensions: ["direction", "headroom"] },
  { id: "PAIR_WAVE_DISPLACEMENT", dimensions: ["wave", "displacement"] },
  { id: "PAIR_FAMILY_DISPLACEMENT", dimensions: ["setupFamily", "displacement"] },
];

const TRIPLE_SPECS: readonly CombinationSpec[] = [
  { id: "TRIPLE_DISPLACEMENT_HEADROOM_RR", dimensions: ["displacement", "headroom", "prospectiveRr"] },
  { id: "TRIPLE_DISPLACEMENT_HEADROOM_REWARD", dimensions: ["displacement", "headroom", "canonicalReward"] },
  { id: "TRIPLE_DISPLACEMENT_REWARD_RR", dimensions: ["displacement", "canonicalReward", "prospectiveRr"] },
  { id: "TRIPLE_HEADROOM_REWARD_RR", dimensions: ["headroom", "canonicalReward", "prospectiveRr"] },
  { id: "TRIPLE_DIRECTION_DISPLACEMENT_HEADROOM", dimensions: ["direction", "displacement", "headroom"] },
  { id: "TRIPLE_WAVE_DISPLACEMENT_HEADROOM", dimensions: ["wave", "displacement", "headroom"] },
  { id: "TRIPLE_FAMILY_DISPLACEMENT_HEADROOM", dimensions: ["setupFamily", "displacement", "headroom"] },
];

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

function dimensionValue(row: EnrichedRow, key: ContextDimensionKey): string {
  switch (key) {
    case "displacement":
      return row.displacementBucket;
    case "headroom":
      return row.headroomPresence;
    case "structuralMove":
      return row.structuralMoveBucket;
    case "canonicalReward":
      return row.rewardBucket;
    case "prospectiveRr":
      return row.rrBucket;
    case "direction":
      return row.direction;
    case "wave":
      return row.waveLabel;
    case "setupFamily":
      return row.setupFamilyId;
    case "anchorSource":
      return row.anchorSource;
    case "evaluatorStatus":
      return row.evaluatorStatus;
    case "evaluatorFailure":
      return row.failureReason as string;
    default:
      return "UNKNOWN";
  }
}

export function buildCombinationBucketLabel(
  spec: CombinationSpec,
  row: EnrichedRow
): string {
  return spec.dimensions.map((d) => `${d}=${dimensionValue(row, d)}`).join(" & ");
}

function isClassifiableFuture(row: FutureMovePerTradeRow): boolean {
  return (
    row.futureContextStatus === "CLASSIFIABLE" &&
    row.movementOutcomeClass !== "NOT_REPLAYABLE" &&
    row.favorableMovePercentage !== null
  );
}

function enrichRows(
  input: BuildHistoricalEntryContextCombinationFutureMoveAnalysisInput
): EnrichedRow[] {
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
    const headroomPct = struct?.prefixExtremeHeadroomPercentage ?? null;
    enriched.push({
      tradeId: t.tradeId,
      direction: future.direction,
      waveLabel: struct?.waveLabel ?? "UNKNOWN",
      setupFamilyId: struct?.setupFamilyId ?? t.setupFamilyId ?? "UNKNOWN",
      anchorSource: resolveAnchorKey(disp?.anchorSources ?? struct?.anchorSources),
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      headroomPresence:
        headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT",
      headroomTier: mapHeadroomToSameTargetTier(
        struct?.prefixHeadroomBucket ?? "HEADROOM_NOT_APPLICABLE"
      ),
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
  return enriched;
}

function buildThresholdCell(
  rows: EnrichedRow[],
  thresholdPercent: number,
  overallRate: number | null
): CombinationThresholdCell {
  const classifiableRows = rows.filter((r) => r.classifiable);
  const reached = classifiableRows.filter((r) =>
    futureMoveReachedAtThreshold(r.future.favorableMovePercentage, thresholdPercent)
  );
  const mfes = classifiableRows
    .map((r) => r.future.favorableMovePercentage)
    .filter((x): x is number => x !== null);
  const maes = classifiableRows
    .map((r) => r.future.adverseMovePercentage)
    .filter((x): x is number => x !== null);
  const bars = reached
    .map((r) => r.future.barsToMaxFavorableExcursion)
    .filter((b): b is number => b !== null);
  const n = classifiableRows.length;
  const h = reached.length;
  const rate = n > 0 ? h / n : null;
  const insufficient = n < MIN_REPORTABLE_CLASSIFIABLE;
  return {
    thresholdPercent,
    trades: rows.length,
    classifiable: n,
    futureMoveReachedCount: h,
    futureMoveReachRate: rate,
    wilson95: computeIndependentTradeWinRateConfidenceInterval(h, n - h, 0.95),
    medianBarsToThreshold: median(bars),
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    meanMae: mean(maes),
    medianMae: median(maes),
    overallReachRate: overallRate,
    conditionalReachRate: rate,
    deltaVsOverallPercentagePoints:
      rate !== null && overallRate !== null ? (rate - overallRate) * 100 : null,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
    interpretWithCaution: insufficient,
    insufficientSample: insufficient,
    label: "HISTORICAL_CONDITIONAL_REACH_RATE",
    associationTag: "DESCRIPTIVE_ASSOCIATION",
  };
}

function assessStability(
  profile: readonly { thresholdPercent: number; reachRate: number | null }[],
  overallRates: Map<number, number | null>,
  classifiable: number
): CombinationStabilityClass {
  if (classifiable < MIN_REPORTABLE_CLASSIFIABLE) return "INSUFFICIENT_SAMPLE";
  const focus = [1, 1.5, 2, 3];
  let above = 0;
  let below = 0;
  for (const t of focus) {
    const rate = profile.find((p) => p.thresholdPercent === t)?.reachRate;
    const overall = overallRates.get(t) ?? null;
    if (rate === null || rate === undefined || overall === null) continue;
    if (rate > overall + 0.005) above++;
    else if (rate < overall - 0.005) below++;
  }
  if (above >= 3 && below === 0) return "STABLE";
  if (above >= 2 || below >= 2) return "PARTIALLY_STABLE";
  return "UNSTABLE";
}

function buildCombinationSet(
  spec: CombinationSpec,
  rows: EnrichedRow[],
  overallRates: Map<number, number | null>
): CombinationSetReport {
  const groups = new Map<string, EnrichedRow[]>();
  for (const r of rows) {
    const label = buildCombinationBucketLabel(spec, r);
    const list = groups.get(label) ?? [];
    list.push(r);
    groups.set(label, list);
  }
  const buckets: CombinationBucketReport[] = [];
  let insufficient = 0;
  for (const [bucketLabel, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const classifiable = group.filter((r) => r.classifiable).length;
    const thresholdCells = COMBINATION_FUTURE_MOVE_THRESHOLDS.map((t) =>
      buildThresholdCell(group, t, overallRates.get(t) ?? null)
    );
    const crossThresholdProfile = COMBINATION_STABILITY_THRESHOLDS.map((t) => {
      const cell = thresholdCells.find((c) => c.thresholdPercent === t);
      return { thresholdPercent: t, futureMoveReachRate: cell?.futureMoveReachRate ?? null };
    });
    const stability = assessStability(
      crossThresholdProfile.map((p) => ({
        thresholdPercent: p.thresholdPercent,
        reachRate: p.futureMoveReachRate,
      })),
      overallRates,
      classifiable
    );
    if (classifiable < MIN_REPORTABLE_CLASSIFIABLE) insufficient++;
    const reported = classifiable >= MIN_REPORTABLE_CLASSIFIABLE;
    buckets.push({
      combinationId: `${spec.id}:${bucketLabel}`,
      dimensionKeys: spec.dimensions,
      bucketLabel,
      trades: group.length,
      classifiable,
      thresholdCells,
      crossThresholdProfile,
      crossThresholdStability: stability,
      sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(classifiable),
      interpretWithCaution: classifiable < MIN_REPORTABLE_CLASSIFIABLE,
      reported,
    });
  }
  return {
    combinationSpecId: spec.id,
    dimensions: spec.dimensions,
    combinationCountTested: groups.size,
    validCombinationBuckets: buckets.filter((b) => b.reported).length,
    insufficientSampleBuckets: insufficient,
    buckets,
  };
}

function buildSeparationForSpec(
  set: CombinationSetReport,
  thresholdPercent: number,
  largeMove = false
): CombinationSeparationRow {
  const valid = set.buckets.filter((b) => b.reported);
  const rates = valid
    .map((b) => {
      const cell = b.thresholdCells.find((c) => c.thresholdPercent === thresholdPercent);
      return { label: b.bucketLabel, rate: cell?.futureMoveReachRate ?? null, classifiable: b.classifiable };
    })
    .filter((x) => x.rate !== null && x.classifiable >= MIN_REPORTABLE_CLASSIFIABLE);
  let highest: string | null = null;
  let highestRate: number | null = null;
  let lowest: string | null = null;
  let lowestRate: number | null = null;
  for (const r of rates) {
    if (highestRate === null || r.rate! > highestRate) {
      highestRate = r.rate;
      highest = r.label;
    }
    if (lowestRate === null || r.rate! < lowestRate) {
      lowestRate = r.rate;
      lowest = r.label;
    }
  }
  const spread =
    highestRate !== null && lowestRate !== null ? (highestRate - lowestRate) * 100 : null;
  const totalClassifiable = rates.reduce((s, r) => s + r.classifiable, 0);
  const insufficient = rates.length < 2 || totalClassifiable < MIN_REPORTABLE_CLASSIFIABLE * 2;
  return {
    combinationSpecId: set.combinationSpecId,
    thresholdPercent,
    highestObservedReachCombination: highest,
    highestObservedReachRate: highestRate,
    lowestObservedReachCombination: lowest,
    lowestObservedReachRate: lowestRate,
    spreadPercentagePoints: spread,
    numberOfValidCombinations: rates.length,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(totalClassifiable),
    interpretWithCaution: insufficient,
    insufficientSample: insufficient,
    note: largeMove
      ? "Large-move separation; descriptive highest/lowest observed reach only."
      : "Descriptive separation; not optimal combination ranking.",
  };
}

function cohortProfile(rows: EnrichedRow[]) {
  const classifiable = rows.filter((r) => r.classifiable);
  const mfes = classifiable
    .map((r) => r.future.favorableMovePercentage)
    .filter((x): x is number => x !== null);
  const maes = classifiable
    .map((r) => r.future.adverseMovePercentage)
    .filter((x): x is number => x !== null);
  const thresholdProfile = COMBINATION_FUTURE_MOVE_THRESHOLDS.map((t) => {
    const hit = classifiable.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)
    );
    const n = classifiable.length;
    return { thresholdPercent: t, reachRate: n > 0 ? hit.length / n : null };
  });
  return {
    trades: rows.length,
    classifiable: classifiable.length,
    thresholdProfile,
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    meanMae: mean(maes),
  };
}

export function buildHistoricalEntryContextCombinationFutureMoveAnalysis(
  input: BuildHistoricalEntryContextCombinationFutureMoveAnalysisInput
): HistoricalEntryContextCombinationFutureMoveAnalysisReport {
  const { lifecycleReport, futureMoveAnalysisReport: b14 } = input;
  const enriched = enrichRows(input);
  const classifiableRows = enriched.filter((r) => r.classifiable);
  const overallRates = new Map<number, number | null>();
  for (const t of COMBINATION_FUTURE_MOVE_THRESHOLDS) {
    const hit = classifiableRows.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)
    );
    overallRates.set(t, classifiableRows.length > 0 ? hit.length / classifiableRows.length : null);
  }

  const pairCombinations = PAIR_SPECS.map((s) => buildCombinationSet(s, enriched, overallRates));
  const tripleCombinations = TRIPLE_SPECS.map((s) => buildCombinationSet(s, enriched, overallRates));

  const headroomAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_DISPLACEMENT_HEADROOM")!;
  const displacementAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_DISPLACEMENT_REWARD")!;
  const rrAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_DISPLACEMENT_RR")!;
  const directionAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_DIRECTION_DISPLACEMENT")!;
  const waveAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_WAVE_DISPLACEMENT")!;
  const setupFamilyAnalysis = pairCombinations.find((p) => p.combinationSpecId === "PAIR_FAMILY_DISPLACEMENT")!;
  const anchorAnalysis = buildCombinationSet(
    { id: "ANCHOR_DISPLACEMENT", dimensions: ["anchorSource", "displacement"] },
    enriched,
    overallRates
  );

  const separationAnalysis: CombinationSeparationRow[] = [];
  for (const set of [...pairCombinations, ...tripleCombinations]) {
    for (const th of [1, 2, 3] as const) {
      separationAnalysis.push(buildSeparationForSpec(set, th));
    }
  }

  const largeMoveSeparation: CombinationSeparationRow[] = [];
  for (const set of pairCombinations) {
    for (const th of COMBINATION_LARGE_MOVE_THRESHOLDS) {
      largeMoveSeparation.push(buildSeparationForSpec(set, th, true));
    }
  }

  const crossThresholdStability = [...pairCombinations, ...tripleCombinations].flatMap((set) =>
    set.buckets
      .filter((b) => b.reported)
      .map((b) => ({
        combinationSpecId: set.combinationSpecId,
        bucketLabel: b.bucketLabel,
        stability: b.crossThresholdStability,
        profile: b.crossThresholdProfile.map((p) => ({
          thresholdPercent: p.thresholdPercent,
          reachRate: p.futureMoveReachRate,
        })),
      }))
  );

  const conditionalHistoricalReach = pairCombinations.flatMap((set) =>
    set.buckets.flatMap((b) =>
      b.thresholdCells
        .filter((c) => !c.insufficientSample)
        .map((c) => ({
          combinationSpecId: set.combinationSpecId,
          bucketLabel: b.bucketLabel,
          thresholdPercent: c.thresholdPercent,
          historicalConditionalReachRate: c.conditionalReachRate,
          classifiable: c.classifiable,
          label: "HISTORICAL_CONDITIONAL_REACH_RATE" as const,
        }))
    )
  );

  const smallRewardHeadroom = enriched.filter(
    (r) =>
      r.classifiable &&
      r.rewardBucket === "REWARD_0_50_TO_1_00" &&
      r.headroomPresence === "HEADROOM_PRESENT"
  );
  const targetDistanceAnalysis = [
    {
      scenarioLabel: "canonicalReward_lt_1pct_band_AND_headroom_present",
      bucketLabel: "REWARD_0_50_TO_1_00 & HEADROOM_PRESENT",
      classifiable: smallRewardHeadroom.length,
      futureMoveGte2Rate:
        smallRewardHeadroom.length > 0
          ? smallRewardHeadroom.filter((r) =>
              futureMoveReachedAtThreshold(r.future.favorableMovePercentage, 2)
            ).length / smallRewardHeadroom.length
          : null,
      note: "Associational; does not recommend target change.",
    },
    {
      scenarioLabel: "mfe_gte_target_without_touch",
      bucketLabel: "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH",
      classifiable: enriched.filter(
        (r) =>
          classifyTargetVsFutureMoveCategory(r.future) ===
          "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH"
      ).length,
      futureMoveGte2Rate: null,
      note: "Count by B-14 movement semantics; not TARGET_TOUCHED.",
    },
  ];

  const failedFavorable = enriched.filter(
    (r) => r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdverse = enriched.filter(
    (r) => r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const sumR =
    input.eligibilityAuditReport?.decisiveRows?.reduce((s, r) => s + (r.theoreticalR ?? 0), 0) ??
    null;

  const cellsTested = pairCombinations.reduce(
    (s, p) => s + p.buckets.length * COMBINATION_FUTURE_MOVE_THRESHOLDS.length,
    0
  );
  const validCells = pairCombinations.reduce(
    (s, p) => s + p.buckets.filter((b) => b.reported).length * COMBINATION_FUTURE_MOVE_THRESHOLDS.length,
    0
  );
  const insufficientCells = cellsTested - validCells;

  let b14Parity = true;
  for (const row of b14.thresholdAnalysis) {
    const hit = classifiableRows.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, row.thresholdPercent)
    );
    if (hit.length !== row.futureMoveReachedCount) {
      b14Parity = false;
      break;
    }
  }

  const dispHeadroomPair = pairCombinations.find((p) => p.combinationSpecId === "PAIR_DISPLACEMENT_HEADROOM")!;
  const maxSpread1 = Math.max(
    ...separationAnalysis.filter((s) => s.thresholdPercent === 1).map((s) => s.spreadPercentagePoints ?? 0)
  );
  const smallDispHeadroom = dispHeadroomPair.buckets.find((b) =>
    b.bucketLabel.includes("DISP_LT_0_25") && b.bucketLabel.includes("HEADROOM_PRESENT")
  );
  const smallDispHeadroomAbsent = dispHeadroomPair.buckets.find((b) =>
    b.bucketLabel.includes("DISP_LT_0_25") && b.bucketLabel.includes("HEADROOM_ABSENT")
  );

  const diagnosticSummary: HistoricalEntryContextCombinationFutureMoveAnalysisReport["diagnosticSummary"] =
    [
      {
        question: "Hangi context pair'leri future move'u en fazla ayırıyor?",
        answer: `Max observed 1% spread among pair specs: ${maxSpread1.toFixed(1)} pp (descriptive, not optimal).`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi pair'ler %1 future move'da ayrışıyor?",
        answer: `See separationAnalysis thresholdPercent=1; highest spread spec varies by frozen cohort.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi pair'ler %2 future move'da ayrışıyor?",
        answer: `Overall 2%: ${((overallRates.get(2) ?? 0) * 100).toFixed(1)}%; pair spreads in separationAnalysis.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi pair'ler %3 future move'da ayrışıyor?",
        answer: `Overall 3%: ${((overallRates.get(3) ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "%5 için yeterli sample var mı?",
        answer: `Overall 5% reached ${classifiableRows.filter((r) => futureMoveReachedAtThreshold(r.future.favorableMovePercentage, 5)).length}/${classifiableRows.length}.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "%10 için yeterli sample var mı?",
        answer: `Overall 10% reached ${classifiableRows.filter((r) => futureMoveReachedAtThreshold(r.future.favorableMovePercentage, 10)).length}/${classifiableRows.length}.`,
        tag: "INSUFFICIENT_SAMPLE",
      },
      {
        question: "Küçük displacement + headroom kombinasyonu ne gösteriyor?",
        answer: `DISP_LT_0_25+HEADROOM_PRESENT 1%: ${((smallDispHeadroom?.thresholdCells.find((c) => c.thresholdPercent === 1)?.futureMoveReachRate ?? 0) * 100).toFixed(1)}% vs ABSENT: ${((smallDispHeadroomAbsent?.thresholdCells.find((c) => c.thresholdPercent === 1)?.futureMoveReachRate ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Küçük displacement + RR kombinasyonu ne gösteriyor?",
        answer: "See PAIR_DISPLACEMENT_RR buckets and crossThresholdStability.",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Headroom + canonical reward kombinasyonu ne gösteriyor?",
        answer: "See PAIR_HEADROOM_REWARD combination set.",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Headroom + RR kombinasyonu ne gösteriyor?",
        answer: "See PAIR_HEADROOM_RR combination set.",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Structural move + displacement kombinasyonu ne gösteriyor?",
        answer: "See PAIR_STRUCTURAL_DISPLACEMENT.",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi kombinasyonlar cross-threshold stable?",
        answer: `STABLE count: ${crossThresholdStability.filter((c) => c.stability === "STABLE").length} reported buckets.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi kombinasyonlar unstable?",
        answer: `UNSTABLE count: ${crossThresholdStability.filter((c) => c.stability === "UNSTABLE").length}.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Canonical target küçükken büyük future move hangi context'lerde görülüyor?",
        answer: `targetDistanceAnalysis small-reward+headroom gte2: ${((targetDistanceAnalysis[0]?.futureMoveGte2Rate ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "MFE >= target fakat TARGET_TOUCH olmayan trade'ler hangi context'lerde yoğun?",
        answer: `See targetDistanceAnalysis mfe_gte_target_without_touch count ${targetDistanceAnalysis[1]?.classifiable ?? 0}.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "FAILED + FAVORABLE cohortunda hangi kombinasyonlar öne çıkıyor?",
        answer: `n=${failedFavorable.length}; median MFE ${cohortProfile(failedFavorable).medianMfe?.toFixed(2) ?? "n/a"}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "PASSED + ADVERSE cohortunda hangi kombinasyonlar öne çıkıyor?",
        answer: `n=${passedAdverse.length}; median MFE ${cohortProfile(passedAdverse).medianMfe?.toFixed(2) ?? "n/a"}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Combination separation overall baseline'a göre ne kadar?",
        answer: `Example deltas in thresholdCells.deltaVsOverallPercentagePoints per bucket.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Sonuçlar ne kadar sample-sensitive?",
        answer: `${insufficientCells} insufficient cells of ${cellsTested} tested; min classifiable ${MIN_REPORTABLE_CLASSIFIABLE}.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "Bu sonuçlardan production entry/target rule çıkarılabilir mi?",
        answer: "NOT_ESTABLISHED — multiple comparison bias risk; observational frozen cohort only.",
        tag: "NOT_ESTABLISHED",
      },
    ];

  const warnings = [...WARNINGS];
  const anchorUnique = [...new Set(enriched.map((r) => r.anchorSource))];
  if (anchorUnique.length === 1 && anchorUnique[0] === "MIXED") {
    warnings.push("anchor_source_cohort_mostly_mixed");
  }

  const mfeMaeAnalysis = dispHeadroomPair.buckets
    .filter((b) => b.reported)
    .map((b) => ({
      combinationSpecId: dispHeadroomPair.combinationSpecId,
      bucketLabel: b.bucketLabel,
      meanMfe: b.thresholdCells[0]?.meanMfe ?? null,
      medianMfe: b.thresholdCells[0]?.medianMfe ?? null,
      meanMae: b.thresholdCells[0]?.meanMae ?? null,
      medianMae: b.thresholdCells[0]?.medianMae ?? null,
      trades: b.trades,
    }));

  const tradeExamples = enriched
    .filter((r) => r.classifiable)
    .sort((a, b) => a.tradeId.localeCompare(b.tradeId))
    .slice(0, 36)
    .map((r) => ({
      tradeId: r.tradeId,
      bucketLabels: [
        buildCombinationBucketLabel(PAIR_SPECS[0], r),
        buildCombinationBucketLabel(TRIPLE_SPECS[0], r),
      ],
      favorableMovePercentage: r.future.favorableMovePercentage,
      note: "deterministic example",
    }));

  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
    datasetReference: b14.datasetReference,
    population: {
      independentTrades: lifecycleReport.trades.length,
      b14PerTradeRows: b14.perTrade.length,
      classifiableForFutureMove: classifiableRows.length,
      horizonBars: b14.horizon.horizonBars,
    },
    contextDefinitions: [
      { key: "displacement", description: "B-12t displacement bucket at E", secondary: false },
      { key: "headroom", description: "B-12u prefix headroom presence at E", secondary: false },
      { key: "structuralMove", description: "B-12u structural move bucket", secondary: false },
      { key: "canonicalReward", description: "Canonical reward % bucket", secondary: false },
      { key: "prospectiveRr", description: "Frozen prospective RR band", secondary: false },
      { key: "direction", description: "Trade direction", secondary: true },
      { key: "wave", description: "Frozen wave label", secondary: true },
      { key: "setupFamily", description: "Setup family id", secondary: true },
      { key: "anchorSource", description: "Frozen anchor source dimension", secondary: true },
      { key: "evaluatorStatus", description: "Evaluator status (associational)", secondary: true },
      { key: "evaluatorFailure", description: "First failure code (associational)", secondary: true },
    ],
    pairCombinations,
    tripleCombinations,
    conditionalHistoricalReach,
    separationAnalysis,
    crossThresholdStability,
    largeMoveSeparation,
    targetDistanceAnalysis,
    headroomAnalysis,
    displacementAnalysis,
    rrAnalysis,
    directionAnalysis,
    waveAnalysis,
    setupFamilyAnalysis,
    anchorAnalysis,
    failedFavorableAnalysis: {
      ...cohortProfile(failedFavorable),
      note: "FAILED + FAVORABLE_RESOLUTION — associational only.",
    },
    passedAdverseAnalysis: {
      ...cohortProfile(passedAdverse),
      note: "PASSED + ADVERSE_RESOLUTION — associational only.",
    },
    theoreticalRReference: {
      consumed: Boolean(input.eligibilityAuditReport),
      label: "THEORETICAL_R_REFERENCE",
      sumTheoreticalR: sumR,
      note: "Frozen B-12h decisiveRows; not recomputed; not future MFE.",
    },
    costReference: {
      consumed: Boolean(input.costAwareCounterfactualAnalysisReport),
      roundTripPercentageScenario: 0.2,
      note: "B-12x reference when supplied; profitability not assessed.",
    },
    mfeMaeAnalysis,
    timeToThresholdAnalysis: b14.thresholdAnalysis.map((row) => ({
      thresholdPercent: row.thresholdPercent,
      source: "B-14.thresholdAnalysis",
      medianBarsToReach: row.medianBarsToReach,
      b14ParityMatch: true,
    })),
    multipleComparisonWarning: {
      combinationCellsTested: cellsTested + tripleCombinations.reduce(
        (s, t) => s + t.buckets.length * COMBINATION_FUTURE_MOVE_THRESHOLDS.length,
        0
      ),
      validCells: validCells,
      insufficientCells,
      selectionBiasNote:
        "Many combination cells were tested; highest observed reach rate may arise from selection bias without stability and sample quality.",
    },
    diagnosticSummary,
    directVsAssociational: {
      direct: [
        "future_move_threshold_counts",
        "conditional_reach_arithmetic",
        "wilson_intervals",
        "combination_sample_counts",
        "B-14_time_parity",
      ],
      associational: [
        "pair_and_triple_context_combinations",
        "headroom_displacement_interactions",
        "rr_reward_combinations",
        "evaluator_cohorts",
        "wave_family_secondary",
      ],
    },
    lookaheadAttestation: {
      entryContextEnd: "E",
      futureOutcomeStart: "E+1",
      statement:
        "Combination keys use frozen E-time context only. Future outcomes from B-14 perTrade measurements (E+1..horizon).",
    },
    parity: {
      b14ThresholdReachCountsMatch: b14Parity,
      note: "Reach counts derived from B-14 perTrade must match B-14 thresholdAnalysis.",
    },
    warnings,
    tradeExamples,
    consumedReports: {
      lifecycleReport: true,
      futureMoveAnalysisReport: true,
      historicalEntryContextTargetResearchReport: Boolean(input.historicalEntryContextTargetResearchReport),
      displacementEqualityTargetMechanicsReport: Boolean(input.displacementEqualityTargetMechanicsReport),
      structuralExtremeVsDisplacementTargetReport: Boolean(input.structuralExtremeVsDisplacementTargetReport),
      alternativeTargetModelAnalysisReport: Boolean(input.alternativeTargetModelAnalysisReport),
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
      costAwareCounterfactualAnalysisReport: Boolean(input.costAwareCounterfactualAnalysisReport),
    },
  };
}
