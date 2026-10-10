import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import { mapHeadroomToSameTargetTier } from "./historical-entry-context-target-research";
import type { HeadroomPresence } from "./historical-entry-context-target-research-types";
import type { CounterfactualReachabilityRow } from "./historical-alternative-target-reachability-replay-types";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";
import type { StructuralHeadroomBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import {
  classifyDisplacementContextBucket,
} from "./historical-target-distance-structural-context-analysis";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { Candle } from "./types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { SameTargetBandHeadroomTier } from "./historical-entry-context-target-research-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import {
  HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
  type BuildHistoricalEntryContextFutureMoveAnalysisInput,
  type FutureMoveContextCrossRow,
  type FutureMoveOutcomeBucketId,
  type FutureMovePerTradeRow,
  type FutureMoveThresholdReachRow,
  type FutureMoveTradeExample,
  type GteThresholdMetrics,
  type HistoricalEntryContextFutureMoveAnalysisReport,
  type MovementOutcomeClass,
  type ProspectiveRrBucketId,
  type TargetVsFutureMoveRow,
} from "./historical-entry-context-future-move-analysis-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const CANONICAL_MODEL = "CANONICAL_DISPLACEMENT_EQUALITY" as const;
const COST_EPS = 1e-9;
const GTE_THRESHOLDS = [1, 2, 3, 5, 10] as const;
const THRESHOLD_ANALYSIS_PCTS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10] as const;

const HEADROOM_TIERS: readonly SameTargetBandHeadroomTier[] = [
  "NO_HEADROOM",
  "SMALL_HEADROOM",
  "MEDIUM_HEADROOM",
  "LARGE_HEADROOM",
];

const WARNINGS: readonly string[] = [
  "future_move_observational_research_only",
  "mfe_not_target_not_profit",
  "no_entry_or_target_rule",
  "prospective_rr_not_mfe_over_risk",
  "theoretical_r_not_recomputed",
  "historically_associated_not_causal",
];

interface TradeRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  movementOutcomeClass: MovementOutcomeClass;
  replayEvent: CounterfactualReplayEvent;
  mfePercentage: number | null;
  maePercentage: number | null;
  favorableMfePrice: number | null;
  adverseMaePrice: number | null;
  barsToMfePeak: number | null;
  barsToMaeExtreme: number | null;
  barsToTarget: number | null;
  canonicalTargetPercent: number | null;
  canonicalRiskPercent: number | null;
  prospectiveRr: number | null;
  rrBucket: ProspectiveRrBucketId;
  futureMoveBucket: FutureMoveOutcomeBucketId;
  displacementBucket: DisplacementContextBucketId;
  headroomTier: SameTargetBandHeadroomTier;
  headroomPresence: HeadroomPresence;
  structuralMoveBucket: StructuralMoveBucketId;
  rewardBucket: PriceMoveRewardBucketId;
  waveContext: string;
  setupFamilyId: string;
  evaluatorStatus: string;
  failureReason: TradeEvaluationFirstFailureCode | "NONE";
  policyClassification: string;
  pathOutcome: string;
  entryReferencePrice: number | null;
  theoreticalR: number | null;
  futureContextStatus: FutureMovePerTradeRow["futureContextStatus"];
  thresholdBarsToReach: readonly (number | null)[];
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
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

export function measurePostEntryHorizonExcursion(input: {
  direction: "BULLISH" | "BEARISH";
  evaluationBarIndex: number;
  entryPrice: number;
  candles: readonly Candle[];
  horizonBars: number;
}): {
  favorableMovePercentage: number | null;
  adverseMovePercentage: number | null;
  favorableMfePrice: number | null;
  adverseMaePrice: number | null;
  barsToMaxFavorableExcursion: number | null;
  barsToMaxAdverseExcursion: number | null;
  incompleteFutureContext: boolean;
} {
  const { direction, evaluationBarIndex, entryPrice, candles, horizonBars } = input;
  const evalIdx = Math.floor(evaluationBarIndex);
  const start = evalIdx + 1;
  const lastIndex = candles.length - 1;
  const end = Math.min(evalIdx + horizonBars, lastIndex);

  if (start > lastIndex || entryPrice <= 0) {
    return {
      favorableMovePercentage: null,
      adverseMovePercentage: null,
      favorableMfePrice: null,
      adverseMaePrice: null,
      barsToMaxFavorableExcursion: null,
      barsToMaxAdverseExcursion: null,
      incompleteFutureContext: start > lastIndex,
    };
  }

  let mfeExtreme = direction === "BULLISH" ? -Infinity : Infinity;
  let maeExtreme = direction === "BULLISH" ? Infinity : -Infinity;
  let barsToMfe: number | null = null;
  let barsToMae: number | null = null;

  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    const offset = i - evalIdx;
    if (direction === "BULLISH") {
      if (c.high >= mfeExtreme) {
        mfeExtreme = c.high;
        barsToMfe = offset;
      }
      if (c.low <= maeExtreme) {
        maeExtreme = c.low;
        barsToMae = offset;
      }
    } else {
      if (c.low <= mfeExtreme) {
        mfeExtreme = c.low;
        barsToMfe = offset;
      }
      if (c.high >= maeExtreme) {
        maeExtreme = c.high;
        barsToMae = offset;
      }
    }
  }

  const favorableMovePercentage =
    direction === "BULLISH"
      ? ((mfeExtreme - entryPrice) / entryPrice) * 100
      : ((entryPrice - mfeExtreme) / entryPrice) * 100;
  const adverseMovePercentage =
    direction === "BULLISH"
      ? ((entryPrice - maeExtreme) / entryPrice) * 100
      : ((maeExtreme - entryPrice) / entryPrice) * 100;

  return {
    favorableMovePercentage: Number.isFinite(favorableMovePercentage)
      ? Math.max(0, favorableMovePercentage)
      : null,
    adverseMovePercentage: Number.isFinite(adverseMovePercentage)
      ? Math.max(0, adverseMovePercentage)
      : null,
    favorableMfePrice: Number.isFinite(mfeExtreme) ? mfeExtreme : null,
    adverseMaePrice: Number.isFinite(maeExtreme) ? maeExtreme : null,
    barsToMaxFavorableExcursion: barsToMfe,
    barsToMaxAdverseExcursion: barsToMae,
    incompleteFutureContext: end < evalIdx + horizonBars,
  };
}

export function findFirstFutureMoveReachBar(input: {
  direction: "BULLISH" | "BEARISH";
  evaluationBarIndex: number;
  entryPrice: number;
  candles: readonly Candle[];
  horizonBars: number;
  thresholdPercent: number;
}): number | null {
  const { direction, evaluationBarIndex, entryPrice, candles, horizonBars, thresholdPercent } =
    input;
  const evalIdx = Math.floor(evaluationBarIndex);
  const start = evalIdx + 1;
  const lastIndex = candles.length - 1;
  const end = Math.min(evalIdx + horizonBars, lastIndex);
  if (start > lastIndex || entryPrice <= 0) return null;

  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    const offset = i - evalIdx;
    if (direction === "BULLISH") {
      if (c.high >= entryPrice * (1 + thresholdPercent / 100) - COST_EPS) return offset;
    } else if (c.low <= entryPrice * (1 - thresholdPercent / 100) + COST_EPS) return offset;
  }
  return null;
}

export function classifyFutureMoveOutcomeBucket(
  mfe: number | null
): FutureMoveOutcomeBucketId {
  if (mfe === null || !Number.isFinite(mfe) || mfe < 0) return "FUTURE_MOVE_NOT_APPLICABLE";
  if (mfe < 1) return "FUTURE_MOVE_LT_1";
  if (mfe < 2) return "FUTURE_MOVE_1_TO_2";
  if (mfe < 3) return "FUTURE_MOVE_2_TO_3";
  if (mfe < 5) return "FUTURE_MOVE_3_TO_5";
  return "FUTURE_MOVE_GTE_5";
}

export function classifyProspectiveRrBucket(rr: number | null): ProspectiveRrBucketId {
  if (rr === null || !Number.isFinite(rr)) return "RR_NOT_APPLICABLE";
  if (rr < 1) return "RR_LT_1";
  if (rr < 1.5) return "RR_1_TO_1_5";
  return "RR_GTE_1_5";
}

export function measureFutureMaximumFavorableExcursion(input: {
  direction: "BULLISH" | "BEARISH";
  evaluationBarIndex: number;
  entryPrice: number;
  candles: readonly Candle[];
  horizonBars: number;
}): { mfePercentage: number | null; barsToMfePeak: number | null } {
  const exc = measurePostEntryHorizonExcursion(input);
  return {
    mfePercentage: exc.favorableMovePercentage,
    barsToMfePeak: exc.barsToMaxFavorableExcursion,
  };
}

export function classifyMovementOutcome(
  replayEvent: CounterfactualReplayEvent,
  mfe: number | null,
  targetPct: number | null
): MovementOutcomeClass {
  if (replayEvent === "NOT_REPLAYABLE") return "NOT_REPLAYABLE";
  if (replayEvent === "TARGET_REACHED") return "TARGET_REACHED";
  if (replayEvent === "INVALIDATION_REACHED") return "INVALIDATION_REACHED";
  if (
    replayEvent === "NOT_REACHED_WITHIN_HORIZON" ||
    replayEvent === "AMBIGUOUS_SAME_BAR" ||
    replayEvent === "INSUFFICIENT_FUTURE"
  ) {
    if (targetPct !== null && mfe !== null && mfe >= targetPct - COST_EPS) {
      return "TARGET_NOT_REACHED_MFE_GTE_TARGET";
    }
    return "TARGET_NOT_REACHED_MFE_LT_TARGET";
  }
  return "NO_TOUCH_HORIZON_END";
}

function buildThresholdAnalysis(rows: TradeRow[]): FutureMoveThresholdReachRow[] {
  return THRESHOLD_ANALYSIS_PCTS.map((thresholdPercent, idx) => {
    const eligible = rows.filter(
      (r) => r.mfePercentage !== null && r.movementOutcomeClass !== "NOT_REPLAYABLE"
    );
    const reached = eligible.filter(
      (r) => (r.mfePercentage ?? 0) >= thresholdPercent - COST_EPS
    );
    const bars = reached
      .map((r) => r.thresholdBarsToReach[idx] ?? null)
      .filter((b): b is number => b !== null);
    const n = eligible.length;
    const h = reached.length;
    return {
      thresholdPercent,
      eligibleTrades: n,
      futureMoveReachedCount: h,
      futureMoveReachRate: n > 0 ? h / n : null,
      medianBarsToReach: median(bars),
      p25BarsToReach: percentile(bars, 0.25),
      p75BarsToReach: percentile(bars, 0.75),
      sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
      interpretWithCaution: n < 10,
      wilson95: computeIndependentTradeWinRateConfidenceInterval(h, n - h, 0.95),
    };
  });
}

function gteMetrics(rows: TradeRow[], threshold: number): GteThresholdMetrics {
  const eligible = rows.filter((r) => r.mfePercentage !== null);
  const hit = eligible.filter((r) => r.mfePercentage! >= threshold - COST_EPS);
  const h = hit.length;
  const n = eligible.length;
  return {
    thresholdPercent: threshold,
    rate: n > 0 ? h / n : null,
    count: h,
    eligible: n,
    wilson95: computeIndependentTradeWinRateConfidenceInterval(h, n - h, 0.95),
  };
}

function aggregateFutureMoveCross(rows: TradeRow[]): FutureMoveContextCrossRow {
  const classifiable = rows.filter((r) => r.movementOutcomeClass !== "NOT_REPLAYABLE");
  const mfes = classifiable.map((r) => r.mfePercentage).filter((x): x is number => x !== null);
  const bars = classifiable
    .map((r) => r.barsToMfePeak)
    .filter((x): x is number => x !== null);
  const reached = classifiable.filter((r) => r.movementOutcomeClass === "TARGET_REACHED");
  const trades = rows.length;
  return {
    trades,
    classifiable: classifiable.length,
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    medianBarsToMfe: median(bars),
    targetReachRate: classifiable.length > 0 ? reached.length / classifiable.length : null,
    gte1: gteMetrics(classifiable, 1),
    gte2: gteMetrics(classifiable, 2),
    gte3: gteMetrics(classifiable, 3),
    gte5: gteMetrics(classifiable, 5),
    gte10: gteMetrics(classifiable, 10),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(trades),
    interpretWithCaution: trades < 10,
  };
}

export function buildHistoricalEntryContextFutureMoveAnalysis(
  input: BuildHistoricalEntryContextFutureMoveAnalysisInput
): HistoricalEntryContextFutureMoveAnalysisReport {
  const { lifecycleReport, candles, reachabilityReplayReport } = input;

  if (!reachabilityReplayReport) {
    return emptyReport(lifecycleReport, ["reachabilityReplayReport_required"]);
  }

  const horizonBars =
    input.horizonBars ??
    lifecycleReport.configuration?.horizonBars ??
    reachabilityReplayReport.replayPolicy.horizonBars;
  const horizonSource = input.horizonBars
    ? "input.horizonBars"
    : lifecycleReport.configuration?.horizonBars
      ? "lifecycleReport.configuration.horizonBars"
      : "reachabilityReplayReport.replayPolicy.horizonBars";
  const replayByTrade = new Map<string, CounterfactualReachabilityRow>();
  for (const row of reachabilityReplayReport.perTrade) {
    if (row.modelId === CANONICAL_MODEL) replayByTrade.set(row.tradeId, row);
  }

  const b12t = input.displacementEqualityTargetMechanicsAnalysisReport;
  const b12u = input.structuralExtremeVsDisplacementTargetAnalysisReport;
  const dispByTrade = new Map(
    (b12t?.targetMagnitude.perTrade ?? []).map((r) => [r.tradeId, r])
  );
  const structByTrade = new Map((b12u?.perTrade ?? []).map((r) => [r.tradeId, r]));
  const auditByTrade = new Map(
    (input.eligibilityAuditReport?.decisiveRows ?? []).map((r) => [r.tradeId, r])
  );

  const perTrade: TradeRow[] = [];
  for (const t of lifecycleReport.trades) {
    const replay = replayByTrade.get(t.tradeId);
    if (!replay) continue;
    const disp = dispByTrade.get(t.tradeId);
    const struct = structByTrade.get(t.tradeId);
    const audit = auditByTrade.get(t.tradeId);
    const targetPct = replay.grossTargetMovePercentage ?? disp?.rewardPercentage ?? null;
    const rewardBucket = classifyPriceMoveRewardBucket(targetPct);
    if (rewardBucket === "REWARD_NOT_APPLICABLE") continue;

    const direction = t.direction === "BULLISH" || t.direction === "BEARISH" ? t.direction : null;
    const entryPrice = replay.entryPrice ?? t.entryReferencePrice;
    let mfePct = replay.mfePercentage;
    let maePct: number | null = null;
    let barsToMfePeak: number | null = null;
    let barsToMaeExtreme: number | null = null;
    let favorableMfePrice: number | null = null;
    let adverseMaePrice: number | null = null;
    let futureContextStatus: FutureMovePerTradeRow["futureContextStatus"] = "CLASSIFIABLE";
    const thresholdBarsToReach: (number | null)[] = [];

    if (candles.length && direction && entryPrice !== null && entryPrice > 0) {
      const exc = measurePostEntryHorizonExcursion({
        direction,
        evaluationBarIndex: replay.evaluationBarIndex,
        entryPrice,
        candles,
        horizonBars,
      });
      if (exc.incompleteFutureContext) futureContextStatus = "INCOMPLETE_FUTURE_CONTEXT";
      if (exc.favorableMovePercentage !== null) mfePct = exc.favorableMovePercentage;
      maePct = exc.adverseMovePercentage;
      barsToMfePeak = exc.barsToMaxFavorableExcursion;
      barsToMaeExtreme = exc.barsToMaxAdverseExcursion;
      favorableMfePrice = exc.favorableMfePrice;
      adverseMaePrice = exc.adverseMaePrice;
      for (const th of THRESHOLD_ANALYSIS_PCTS) {
        thresholdBarsToReach.push(
          findFirstFutureMoveReachBar({
            direction,
            evaluationBarIndex: replay.evaluationBarIndex,
            entryPrice,
            candles,
            horizonBars,
            thresholdPercent: th,
          })
        );
      }
    } else {
      for (const _ of THRESHOLD_ANALYSIS_PCTS) thresholdBarsToReach.push(null);
    }
    if (replay.replayEvent === "NOT_REPLAYABLE") futureContextStatus = "NOT_REPLAYABLE";

    const headroomBucket = struct?.prefixHeadroomBucket ?? "HEADROOM_NOT_APPLICABLE";
    const headroomPct = struct?.prefixExtremeHeadroomPercentage ?? null;
    const headroomPresence: HeadroomPresence =
      headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT";

    perTrade.push({
      tradeId: t.tradeId,
      evaluationBarIndex: replay.evaluationBarIndex,
      direction: t.direction ?? "UNKNOWN",
      movementOutcomeClass: classifyMovementOutcome(replay.replayEvent, mfePct, targetPct),
      replayEvent: replay.replayEvent,
      mfePercentage: mfePct,
      maePercentage: maePct,
      favorableMfePrice,
      adverseMaePrice,
      barsToMfePeak,
      barsToMaeExtreme,
      barsToTarget: replay.barsToTarget,
      canonicalTargetPercent: targetPct,
      canonicalRiskPercent: disp?.riskPercentage ?? null,
      prospectiveRr: t.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null,
      rrBucket: classifyProspectiveRrBucket(t.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null),
      futureMoveBucket: classifyFutureMoveOutcomeBucket(mfePct),
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      headroomTier: mapHeadroomToSameTargetTier(headroomBucket),
      headroomPresence,
      structuralMoveBucket: struct?.prefixStructuralMoveBucket ?? "STRUCTURAL_NOT_APPLICABLE",
      rewardBucket,
      waveContext: struct?.waveLabel ?? "UNKNOWN",
      setupFamilyId: t.setupFamilyId,
      evaluatorStatus: t.tradeEvaluationStatus,
      failureReason: t.evaluatorFirstFailure ?? "NONE",
      policyClassification: t.policyClassification,
      pathOutcome: t.pathOutcome,
      entryReferencePrice: entryPrice,
      theoreticalR: audit?.theoreticalR ?? null,
      futureContextStatus,
      thresholdBarsToReach,
    });
  }

  const classifiableRows = perTrade.filter((r) => r.movementOutcomeClass !== "NOT_REPLAYABLE");
  const outcomeCounts: Record<MovementOutcomeClass, number> = {
    TARGET_REACHED: 0,
    TARGET_NOT_REACHED_MFE_GTE_TARGET: 0,
    TARGET_NOT_REACHED_MFE_LT_TARGET: 0,
    INVALIDATION_REACHED: 0,
    NO_TOUCH_HORIZON_END: 0,
    NOT_REPLAYABLE: 0,
  };
  for (const r of perTrade) outcomeCounts[r.movementOutcomeClass]++;

  const futureMoveBucketIds = [
    "FUTURE_MOVE_LT_1",
    "FUTURE_MOVE_1_TO_2",
    "FUTURE_MOVE_2_TO_3",
    "FUTURE_MOVE_3_TO_5",
    "FUTURE_MOVE_GTE_5",
  ] as FutureMoveOutcomeBucketId[];

  const futureMoveBuckets = futureMoveBucketIds.map((bucket) => ({
    bucket,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.futureMoveBucket === bucket)),
  }));

  const gtePopulationThresholds = GTE_THRESHOLDS.map((t) => gteMetrics(classifiableRows, t));
  const thresholdAnalysis = buildThresholdAnalysis(perTrade);
  const largeMoveAnalysis = gtePopulationThresholds;

  const targetBands = [...new Set(perTrade.map((r) => r.rewardBucket))].filter(
    (b) => b !== "REWARD_NOT_APPLICABLE"
  );

  const targetVsFutureMove: TargetVsFutureMoveRow[] = targetBands.map((canonicalRewardBucket) => {
    const rows = perTrade.filter((r) => r.rewardBucket === canonicalRewardBucket);
    const rewards = rows
      .map((r) => r.canonicalTargetPercent)
      .filter((x): x is number => x !== null);
    const mfes = rows.map((r) => r.mfePercentage).filter((x): x is number => x !== null);
    const gteCanon = rows.filter(
      (r) =>
        r.mfePercentage !== null &&
        r.canonicalTargetPercent !== null &&
        r.mfePercentage >= r.canonicalTargetPercent - COST_EPS
    );
    const gte2x = rows.filter(
      (r) =>
        r.mfePercentage !== null &&
        r.canonicalTargetPercent !== null &&
        r.mfePercentage >= 2 * r.canonicalTargetPercent - COST_EPS
    );
    const n = rows.length;
    return {
      canonicalRewardBucket,
      trades: n,
      meanCanonicalReward: mean(rewards),
      medianCanonicalReward: median(rewards),
      meanFavorableFutureMove: mean(mfes),
      medianFavorableFutureMove: median(mfes),
      mfeGteCanonicalTargetCount: gteCanon.length,
      mfeGteCanonicalTargetRate: n > 0 ? gteCanon.length / n : null,
      mfeGte2xCanonicalTargetCount: gte2x.length,
      mfeGte2xCanonicalTargetRate: n > 0 ? gte2x.length / n : null,
      sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
      interpretWithCaution: n < 10,
    };
  });

  const evaluatorStatuses = ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];
  const evaluatorCross = evaluatorStatuses.map((evaluatorStatus) => ({
    evaluatorStatus,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.evaluatorStatus === evaluatorStatus)),
  }));

  const failureKeys = [...new Set(perTrade.map((r) => r.failureReason))] as readonly (
    | TradeEvaluationFirstFailureCode
    | "NONE"
  )[];
  const evaluatorFailureCross = failureKeys.map((failureReason) => ({
    failureReason,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.failureReason === failureReason)),
  }));

  const beyondTouchRows = classifiableRows.filter(
    (r) =>
      r.mfePercentage !== null &&
      r.canonicalTargetPercent !== null &&
      r.mfePercentage >= r.canonicalTargetPercent - COST_EPS &&
      r.pathOutcome !== "TARGET_TOUCHED"
  );
  const mfeBeyondTargetWithoutCanonicalTouch = {
    trades: beyondTouchRows.length,
    meanFavorableMove: mean(
      beyondTouchRows.map((r) => r.mfePercentage).filter((x): x is number => x !== null)
    ),
    medianFavorableMove: median(
      beyondTouchRows.map((r) => r.mfePercentage).filter((x): x is number => x !== null)
    ),
    note:
      "Favorable excursion met or exceeded canonical reward distance without pathOutcome TARGET_TOUCHED.",
  };

  const perTradeReport: FutureMovePerTradeRow[] = perTrade.map((r) => {
    const ratio =
      r.mfePercentage !== null &&
      r.canonicalTargetPercent !== null &&
      r.canonicalTargetPercent > 0
        ? r.mfePercentage / r.canonicalTargetPercent
        : null;
    const beyond =
      r.mfePercentage !== null && r.canonicalTargetPercent !== null
        ? Math.max(0, r.mfePercentage - r.canonicalTargetPercent)
        : null;
    return {
      tradeId: r.tradeId,
      evaluationBarIndex: r.evaluationBarIndex,
      direction: r.direction,
      entryReferencePrice: r.entryReferencePrice,
      canonicalTargetPercent: r.canonicalTargetPercent,
      canonicalRiskPercent: r.canonicalRiskPercent,
      canonicalRrRatio: r.prospectiveRr,
      favorableMovePercentage: r.mfePercentage,
      adverseMovePercentage: r.maePercentage,
      favorableMfePrice: r.favorableMfePrice,
      adverseMaePrice: r.adverseMaePrice,
      barsToMaxFavorableExcursion: r.barsToMfePeak,
      barsToMaxAdverseExcursion: r.barsToMaeExtreme,
      futureMfeToCanonicalTargetRatio: ratio,
      futureMfeBeyondCanonicalTargetPercentage: beyond,
      pathOutcome: r.pathOutcome as FutureMovePerTradeRow["pathOutcome"],
      policyClassification: r.policyClassification,
      tradeEvaluationStatus: r.evaluatorStatus,
      evaluatorFirstFailure:
        r.failureReason === "NONE" ? null : (r.failureReason as FutureMovePerTradeRow["evaluatorFirstFailure"]),
      theoreticalR: r.theoreticalR,
      futureContextStatus: r.futureContextStatus,
      movementOutcomeClass: r.movementOutcomeClass,
    };
  });

  const canonReached =
    reachabilityReplayReport.modelResults.find((m) => m.modelId === CANONICAL_MODEL)
      ?.targetReached ?? null;

  const displacementBuckets = [...new Set(perTrade.map((r) => r.displacementBucket))].filter(
    (b) => b !== "DISP_NOT_APPLICABLE"
  );
  const displacementCross = displacementBuckets.map((displacementBucket) => ({
    displacementBucket,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.displacementBucket === displacementBucket)),
  }));

  const headroomCross = HEADROOM_TIERS.map((headroomTier) => ({
    headroomTier,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.headroomTier === headroomTier)),
  }));

  const targetDistanceCross = targetBands.map((targetBand) => ({
    targetBand,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.rewardBucket === targetBand)),
  }));

  const structuralBuckets = [...new Set(perTrade.map((r) => r.structuralMoveBucket))].filter(
    (b) => b !== "STRUCTURAL_NOT_APPLICABLE"
  );
  const structuralMoveCross = structuralBuckets.map((structuralMoveBucket) => ({
    structuralMoveBucket,
    ...aggregateFutureMoveCross(
      perTrade.filter((r) => r.structuralMoveBucket === structuralMoveBucket)
    ),
  }));

  const rrBuckets = ["RR_LT_1", "RR_1_TO_1_5", "RR_GTE_1_5"] as ProspectiveRrBucketId[];
  const prospectiveRrCross = rrBuckets.map((rrBucket) => ({
    rrBucket,
    ...aggregateFutureMoveCross(perTrade.filter((r) => r.rrBucket === rrBucket)),
  }));

  const absentRows = perTrade.filter((r) => r.headroomPresence === "HEADROOM_ABSENT");
  const presentRows = perTrade.filter((r) => r.headroomPresence === "HEADROOM_PRESENT");
  const absentCross = aggregateFutureMoveCross(absentRows);
  const presentCross = aggregateFutureMoveCross(presentRows);
  const gte3Delta =
    absentCross.gte3.rate !== null && presentCross.gte3.rate !== null
      ? (presentCross.gte3.rate - absentCross.gte3.rate) * 100
      : null;
  const gte5Delta =
    absentCross.gte5.rate !== null && presentCross.gte5.rate !== null
      ? (presentCross.gte5.rate - absentCross.gte5.rate) * 100
      : null;

  const targetBandHeadroomCross: NonNullable<
    HistoricalEntryContextFutureMoveAnalysisReport["targetBandHeadroomCross"][number]
  >[] = [];
  for (const targetBand of targetBands) {
    for (const tier of HEADROOM_TIERS) {
      const rows = perTrade.filter((r) => r.rewardBucket === targetBand && r.headroomTier === tier);
      if (!rows.length) continue;
      targetBandHeadroomCross.push({
        targetBand,
        headroomTier: tier,
        ...aggregateFutureMoveCross(rows),
      });
    }
  }

  const failedFav = perTrade.filter(
    (r) => r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdv = perTrade.filter(
    (r) => r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const theoreticalRCross: {
    theoreticalRBucket: string;
    cross: FutureMoveContextCrossRow;
  }[] = [];
  for (const label of ["R_NEGATIVE", "R_0_TO_1", "R_1_TO_2", "R_GTE_2", "R_INELIGIBLE"]) {
    const rows = perTrade.filter((r) => {
      if (label === "R_INELIGIBLE") return r.theoreticalR === null;
      if (r.theoreticalR === null) return false;
      if (label === "R_NEGATIVE") return r.theoreticalR < 0;
      if (label === "R_0_TO_1") return r.theoreticalR >= 0 && r.theoreticalR < 1;
      if (label === "R_1_TO_2") return r.theoreticalR >= 1 && r.theoreticalR < 2;
      return r.theoreticalR >= 2;
    });
    theoreticalRCross.push({ theoreticalRBucket: label, cross: aggregateFutureMoveCross(rows) });
  }

  const costContext = [
    { label: "MFE_LT_0_20", min: 0, max: 0.2 },
    { label: "MFE_0_20_TO_0_50", min: 0.2, max: 0.5 },
    { label: "MFE_0_50_TO_1", min: 0.5, max: 1 },
    { label: "MFE_1_TO_2", min: 1, max: 2 },
    { label: "MFE_GTE_2", min: 2, max: Infinity },
  ].map(({ label, min, max }) => {
    const rows = classifiableRows.filter((r) => {
      const m = r.mfePercentage;
      if (m === null) return false;
      if (max === Infinity) return m >= min - COST_EPS;
      return m >= min - COST_EPS && m < max + COST_EPS;
    });
    return {
      mfeBandLabel: label,
      trades: rows.length,
      fractionAboveRoundTrip0_20:
        rows.length > 0
          ? rows.filter((r) => (r.mfePercentage ?? 0) >= 0.2 + COST_EPS).length / rows.length
          : null,
      note: "Gross MFE band vs 0.20% round-trip reference (not profitability).",
    };
  });

  const popCross = aggregateFutureMoveCross(perTrade);
  const mfeGte3NotReached = classifiableRows.filter(
    (r) =>
      r.mfePercentage !== null &&
      r.mfePercentage >= 3 - COST_EPS &&
      r.movementOutcomeClass !== "TARGET_REACHED"
  ).length;

  const diagnosticSummary = buildDiagnosticSummary({
    popCross,
    absentCross,
    presentCross,
    gte3Delta,
    gtePopulationThresholds,
    outcomeCounts,
    failedFavCross: aggregateFutureMoveCross(failedFav),
    passedAdvCross: aggregateFutureMoveCross(passedAdv),
    failedFavN: failedFav.length,
    passedAdvN: passedAdv.length,
    costContext,
    displacementCross,
    targetBandHeadroomCross,
  });

  const tradeExamples: FutureMoveTradeExample[] = [...perTrade]
    .sort((a, b) => a.tradeId.localeCompare(b.tradeId))
    .slice(0, 36)
    .map((r) => ({
      tradeId: r.tradeId,
      evaluationBarIndex: r.evaluationBarIndex,
      direction: r.direction,
      movementOutcomeClass: r.movementOutcomeClass,
      futureMoveBucket: r.futureMoveBucket,
      mfePercentage: r.mfePercentage,
      maePercentage: r.maePercentage,
      canonicalTargetPercent: r.canonicalTargetPercent,
      canonicalRiskPercent: r.canonicalRiskPercent,
      canonicalRrRatio: r.prospectiveRr,
      headroomPresence: r.headroomPresence,
      pathOutcome: r.pathOutcome as FutureMoveTradeExample["pathOutcome"],
      policyClassification: r.policyClassification,
      evaluatorStatus: r.evaluatorStatus,
      firstFailure:
        r.failureReason === "NONE" ? null : (r.failureReason as FutureMoveTradeExample["firstFailure"]),
      theoreticalR: r.theoreticalR,
      barsToMaxMfe: r.barsToMfePeak,
      barsToMaxMae: r.barsToMaeExtreme,
      note:
        r.movementOutcomeClass === "TARGET_NOT_REACHED_MFE_GTE_TARGET"
          ? "FUTURE_MOVE_REACHED canonical distance without TARGET_TOUCHED path semantics."
          : "Frozen horizon future-move example.",
    }));

  const warnings = [...WARNINGS];
  if (!b12t) warnings.push("b12t_not_supplied_displacement_buckets_may_be_na");
  if (!b12u) warnings.push("b12u_not_supplied_headroom_buckets_may_be_na");

  const directionCross = [...new Set(perTrade.map((r) => r.direction))].map((direction) => ({
    direction,
    cross: aggregateFutureMoveCross(perTrade.filter((r) => r.direction === direction)),
  }));
  const waveCross = [...new Set(perTrade.map((r) => r.waveContext))].map((waveLabel) => ({
    waveLabel,
    cross: aggregateFutureMoveCross(perTrade.filter((r) => r.waveContext === waveLabel)),
  }));
  const setupFamilyCross = [...new Set(perTrade.map((r) => r.setupFamilyId))].map((setupFamilyId) => ({
    setupFamilyId,
    cross: aggregateFutureMoveCross(perTrade.filter((r) => r.setupFamilyId === setupFamilyId)),
  }));

  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    horizon: { horizonBars, source: horizonSource },
    determinism: {
      reportBuilder: "buildHistoricalEntryContextFutureMoveAnalysis",
      inputHashNote: "deepEqual on frozen input verified in tests",
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      totalSnapshots: lifecycleReport.summary?.totalSnapshots ?? null,
      eligibleEntrySnapshots: lifecycleReport.summary?.eligibleEntrySnapshots ?? null,
      canonicalReplayClassifiable: classifiableRows.length,
      canonicalNotReplayable: perTrade.length - classifiableRows.length,
      movementOutcomeCounts: outcomeCounts,
    },
    perTrade: perTradeReport,
    thresholdAnalysis,
    futureMoveBuckets,
    gtePopulationThresholds,
    largeMoveAnalysis,
    targetVsFutureMove,
    evaluatorCross,
    evaluatorFailureCross,
    mfeBeyondTargetWithoutCanonicalTouch,
    displacementCross,
    headroomCross,
    targetDistanceCross,
    structuralMoveCross,
    prospectiveRrCross,
    rrCross: prospectiveRrCross,
    headroomPresenceComparison: {
      absent: absentCross,
      present: presentCross,
      gte3RateDeltaPercentagePoints: gte3Delta,
      gte5RateDeltaPercentagePoints: gte5Delta,
      note: "Historically associated comparison; prefix headroom at E vs post-E MFE.",
    },
    targetBandHeadroomCross,
    reachVsMfe: {
      targetReached: outcomeCounts.TARGET_REACHED,
      mfeGteTargetNotReached: outcomeCounts.TARGET_NOT_REACHED_MFE_GTE_TARGET,
      mfeGte3NotReached,
      note: "TARGET_REACHED is touch semantics; MFE thresholds are excursion semantics.",
    },
    costContext,
    failedFavorableAnalysis: {
      trades: failedFav.length,
      cross: aggregateFutureMoveCross(failedFav),
      note: "FAILED + FAVORABLE_RESOLUTION observational cohort.",
    },
    passedAdverseAnalysis: {
      trades: passedAdv.length,
      cross: aggregateFutureMoveCross(passedAdv),
      note: "PASSED + ADVERSE_RESOLUTION observational cohort.",
    },
    failedFavorableFutureMove: {
      trades: failedFav.length,
      cross: aggregateFutureMoveCross(failedFav),
      note: "FAILED + FAVORABLE_RESOLUTION observational cohort.",
    },
    passedAdverseFutureMove: {
      trades: passedAdv.length,
      cross: aggregateFutureMoveCross(passedAdv),
      note: "PASSED + ADVERSE_RESOLUTION observational cohort.",
    },
    theoreticalRCross,
    directionCross,
    waveCross,
    setupFamilyCross,
    secondaryDirection: directionCross,
    secondaryWave: waveCross,
    secondaryFamily: setupFamilyCross,
    costComparison: costContext,
    theoreticalRReference: {
      consumed: Boolean(input.eligibilityAuditReport),
      note: "Frozen B-12h decisiveRows theoreticalR only; not recomputed.",
      cross: theoreticalRCross,
    },
    parity: {
      b12wCanonicalTargetReached: canonReached,
      note: "reachVsMfe.targetReached should match B-12w canonical targetReached when replay supplied.",
    },
    directVsAssociational: {
      direct: [
        "futureMaximumFavorableExcursionPercentage",
        "future move buckets",
        "GTE threshold counts",
        "TARGET_REACHED vs MFE",
        "cost gross bands",
      ],
      associational: [
        "displacement × future MFE",
        "headroom × future MFE",
        "target distance × future MFE",
        "structural move × future MFE",
        "prospective RR × future MFE",
        "evaluator cohorts",
        "theoretical R × MFE",
      ],
    },
    lookaheadAttestation: {
      entryContextUsesAnchorToEOnly: true,
      postEUsedForFutureOutcomesOnly: true,
      statement:
        "ENTRY_CONTEXT: anchor→E only (B-12t/u when supplied). FUTURE_OUTCOME: E+1..horizon for MFE/timing/reach.",
    },
    diagnosticSummary,
    tradeExamples,
    warnings,
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      costAwareCounterfactualAnalysisReport: Boolean(input.costAwareCounterfactualAnalysisReport),
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
      entryContextTargetResearchReport: Boolean(input.entryContextTargetResearchReport),
      displacementEqualityTargetMechanicsAnalysisReport: Boolean(b12t),
      structuralExtremeVsDisplacementTargetAnalysisReport: Boolean(b12u),
      alternativeTargetModelAnalysisReport: Boolean(input.alternativeTargetModelAnalysisReport),
    },
  };
}

function emptyReport(
  lifecycleReport: BuildHistoricalEntryContextFutureMoveAnalysisInput["lifecycleReport"],
  extraWarnings: string[]
): HistoricalEntryContextFutureMoveAnalysisReport {
  const emptyCross = aggregateFutureMoveCross([]);
  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    horizon: {
      horizonBars: lifecycleReport.configuration?.horizonBars ?? 24,
      source: "lifecycleReport.configuration.horizonBars",
    },
    determinism: {
      reportBuilder: "buildHistoricalEntryContextFutureMoveAnalysis",
      inputHashNote: "empty report",
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      totalSnapshots: lifecycleReport.summary?.totalSnapshots ?? null,
      eligibleEntrySnapshots: lifecycleReport.summary?.eligibleEntrySnapshots ?? null,
      canonicalReplayClassifiable: 0,
      canonicalNotReplayable: 0,
      movementOutcomeCounts: {
        TARGET_REACHED: 0,
        TARGET_NOT_REACHED_MFE_GTE_TARGET: 0,
        TARGET_NOT_REACHED_MFE_LT_TARGET: 0,
        INVALIDATION_REACHED: 0,
        NO_TOUCH_HORIZON_END: 0,
        NOT_REPLAYABLE: 0,
      },
    },
    perTrade: [],
    thresholdAnalysis: [],
    futureMoveBuckets: [],
    gtePopulationThresholds: [],
    largeMoveAnalysis: [],
    targetVsFutureMove: [],
    evaluatorCross: [],
    evaluatorFailureCross: [],
    mfeBeyondTargetWithoutCanonicalTouch: {
      trades: 0,
      meanFavorableMove: null,
      medianFavorableMove: null,
      note: "",
    },
    displacementCross: [],
    headroomCross: [],
    targetDistanceCross: [],
    structuralMoveCross: [],
    prospectiveRrCross: [],
    rrCross: [],
    headroomPresenceComparison: {
      absent: emptyCross,
      present: emptyCross,
      gte3RateDeltaPercentagePoints: null,
      gte5RateDeltaPercentagePoints: null,
      note: "",
    },
    targetBandHeadroomCross: [],
    reachVsMfe: {
      targetReached: 0,
      mfeGteTargetNotReached: 0,
      mfeGte3NotReached: 0,
      note: "",
    },
    costContext: [],
    failedFavorableAnalysis: { trades: 0, cross: emptyCross, note: "" },
    passedAdverseAnalysis: { trades: 0, cross: emptyCross, note: "" },
    failedFavorableFutureMove: { trades: 0, cross: emptyCross, note: "" },
    passedAdverseFutureMove: { trades: 0, cross: emptyCross, note: "" },
    theoreticalRCross: [],
    directionCross: [],
    waveCross: [],
    setupFamilyCross: [],
    secondaryDirection: [],
    secondaryWave: [],
    secondaryFamily: [],
    costComparison: [],
    theoreticalRReference: { consumed: false, note: "", cross: [] },
    parity: { b12wCanonicalTargetReached: null, note: "" },
    directVsAssociational: { direct: [], associational: [] },
    lookaheadAttestation: {
      entryContextUsesAnchorToEOnly: true,
      postEUsedForFutureOutcomesOnly: true,
      statement: "",
    },
    diagnosticSummary: [],
    tradeExamples: [],
    warnings: [...WARNINGS, ...extraWarnings],
    consumedReports: { lifecycleReport: true, reachabilityReplayReport: false },
  };
}

function buildDiagnosticSummary(ctx: {
  popCross: FutureMoveContextCrossRow;
  absentCross: FutureMoveContextCrossRow;
  presentCross: FutureMoveContextCrossRow;
  gte3Delta: number | null;
  gtePopulationThresholds: GteThresholdMetrics[];
  outcomeCounts: Record<MovementOutcomeClass, number>;
  failedFavCross: FutureMoveContextCrossRow;
  passedAdvCross: FutureMoveContextCrossRow;
  failedFavN: number;
  passedAdvN: number;
  costContext: HistoricalEntryContextFutureMoveAnalysisReport["costContext"];
  displacementCross: readonly (FutureMoveContextCrossRow & {
    displacementBucket: DisplacementContextBucketId;
  })[];
  targetBandHeadroomCross: HistoricalEntryContextFutureMoveAnalysisReport["targetBandHeadroomCross"];
}): HistoricalEntryContextFutureMoveAnalysisReport["diagnosticSummary"] {
  const gte3Pop = ctx.gtePopulationThresholds.find((g) => g.thresholdPercent === 3);
  const gte5Pop = ctx.gtePopulationThresholds.find((g) => g.thresholdPercent === 5);
  const gte10Pop = ctx.gtePopulationThresholds.find((g) => g.thresholdPercent === 10);
  const tag = (n: number): ResearchConclusionTag =>
    n < 10 ? "INSUFFICIENT_SAMPLE" : "ASSOCIATIONAL_FINDING";

  return [
    {
      question: "Entry context büyük future move'u ayırt ediyor mu?",
      answer: `Headroom GTE_3 delta ${ctx.gte3Delta?.toFixed(1) ?? "n/a"} pp (present minus absent); observational only.`,
      tag: tag(ctx.presentCross.trades),
    },
    {
      question: "Küçük displacement daha fazla future MFE ile ilişkili mi?",
      answer: `See displacementCross median MFE by bucket (historically associated).`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Büyük displacement daha fazla future MFE ile ilişkili mi?",
      answer: `Compare DISP_LT_0_25 vs DISP_GTE_3_00 in displacementCross.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Headroom GTE_1/2/3/5 oranlarını değiştiriyor mu?",
      answer: `Present GTE_3 ${((ctx.presentCross.gte3.rate ?? 0) * 100).toFixed(1)}% vs absent ${((ctx.absentCross.gte3.rate ?? 0) * 100).toFixed(1)}%.`,
      tag: tag(Math.min(ctx.presentCross.trades, ctx.absentCross.trades)),
    },
    {
      question: "Aynı target-distance bandında headroom fark yaratıyor mu?",
      answer: `targetBandHeadroomCross rows: ${ctx.targetBandHeadroomCross.length}.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Structural move future MFE ile nasıl ilişkili?",
      answer: "See structuralMoveCross.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Prospective RR future MFE'yi ayırt ediyor mu?",
      answer: "See prospectiveRrCross.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "%3 future move ne sıklıkta?",
      answer: `Population GTE_3: ${((gte3Pop?.rate ?? 0) * 100).toFixed(1)}% (n=${gte3Pop?.eligible ?? 0}).`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "%5 future move ne sıklıkta?",
      answer: `Population GTE_5: ${((gte5Pop?.rate ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "%10 future move ne sıklıkta?",
      answer: `Population GTE_10: ${((gte10Pop?.rate ?? 0) * 100).toFixed(1)}% (small sample likely).`,
      tag: (gte10Pop?.eligible ?? 0) < 10 ? "INSUFFICIENT_SAMPLE" : "DIRECT_OBSERVATION",
    },
    {
      question: "MFE >= target ama TARGET_REACHED olmayan?",
      answer: `${ctx.outcomeCounts.TARGET_NOT_REACHED_MFE_GTE_TARGET} trades.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "FAILED + FAVORABLE future MFE profili?",
      answer: `n=${ctx.failedFavN}; median MFE ${ctx.failedFavCross.medianMfe?.toFixed(2) ?? "n/a"}%; GTE_3 ${((ctx.failedFavCross.gte3.rate ?? 0) * 100).toFixed(1)}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "PASSED + ADVERSE future MFE profili?",
      answer: `n=${ctx.passedAdvN}; median MFE ${ctx.passedAdvCross.medianMfe?.toFixed(2) ?? "n/a"}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "0.20% cost vs küçük future moves?",
      answer: `MFE_LT_0_20 band trades: ${ctx.costContext.find((c) => c.mfeBandLabel === "MFE_LT_0_20")?.trades ?? 0}.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "DIRECT_OBSERVATION bulgular?",
      answer: "MFE distributions, GTE population rates, reach vs MFE counts.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "ASSOCIATIONAL bulgular?",
      answer: "Entry context crosses (displacement, headroom, RR, structural move).",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "INSUFFICIENT_SAMPLE?",
      answer: "Cells with interpretWithCaution; GTE_10 and large target bands.",
      tag: "INSUFFICIENT_SAMPLE",
    },
    {
      question: "Production entry/target kuralı ESTABLISHED mı?",
      answer: "NOT_ESTABLISHED — observational frozen cohort only.",
      tag: "NOT_ESTABLISHED",
    },
  ];
}
