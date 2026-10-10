import { buildHistoricalAlternativeTargetModelAnalysis } from "./historical-alternative-target-model-analysis";
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import { classifyTargetMagnitudeRewardBucket } from "./historical-target-provenance-structural-distance-analysis";
import {
  ALTERNATIVE_TARGET_MODEL_IDS,
  type AlternativeTargetModelId,
} from "./historical-alternative-target-model-analysis-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { Candle } from "./types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION,
  type BuildHistoricalAlternativeTargetReachabilityReplayInput,
  type CounterfactualReachabilityRow,
  type CounterfactualReplayEvent,
  type HistoricalAlternativeTargetReachabilityReplayReport,
  type ModelReachabilityAggregate,
} from "./historical-alternative-target-reachability-replay-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const WARNINGS: readonly string[] = [
  "historical_counterfactual_replay",
  "no_execution_simulation",
  "no_fees",
  "no_slippage",
  "no_funding",
  "no_position_sizing",
  "ohlc_intrabar_ambiguity",
  "same_bar_target_invalidation_ambiguous",
  "not_profitability_measurement",
  "counterfactual_replay_outcome_not_canonical_historical_outcome",
];

function touchesTarget(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  target: number
): boolean {
  return direction === "BULLISH" ? candle.high >= target : candle.low <= target;
}

function touchesInvalidation(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  inv: number
): boolean {
  return direction === "BULLISH" ? candle.low <= inv : candle.high >= inv;
}

export function mapReplayEventToPathOutcome(
  event: CounterfactualReplayEvent
): ProspectiveSetupOutcomeReplayStatus | null {
  switch (event) {
    case "TARGET_REACHED":
      return "TARGET_TOUCHED";
    case "INVALIDATION_REACHED":
      return "INVALIDATION_TOUCHED";
    case "AMBIGUOUS_SAME_BAR":
      return "AMBIGUOUS";
    case "NOT_REACHED_WITHIN_HORIZON":
      return "NO_TOUCH";
    case "INSUFFICIENT_FUTURE":
      return "NO_FUTURE_DATA";
    default:
      return null;
  }
}

export interface ReplayCounterfactualTargetReachabilityResult {
  event: CounterfactualReplayEvent;
  barsToTarget: number | null;
  mfePercentage: number | null;
  mfeToTargetDistanceRatio: number | null;
}

export function replayCounterfactualTargetReachability(input: {
  direction: "BULLISH" | "BEARISH";
  evaluationBarIndex: number;
  entryPrice: number;
  targetPrice: number;
  invalidationPrice: number;
  candles: readonly Candle[];
  horizonBars: number;
}): ReplayCounterfactualTargetReachabilityResult {
  const { direction, evaluationBarIndex, entryPrice, targetPrice, invalidationPrice, candles, horizonBars } =
    input;
  const evalIdx = Math.floor(evaluationBarIndex);
  const start = evalIdx + 1;
  const lastIndex = candles.length - 1;
  const end = Math.min(evalIdx + horizonBars, lastIndex);

  if (start > lastIndex) {
    return {
      event: "INSUFFICIENT_FUTURE",
      barsToTarget: null,
      mfePercentage: null,
      mfeToTargetDistanceRatio: null,
    };
  }

  let mfeExtreme = direction === "BULLISH" ? -Infinity : Infinity;
  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    if (direction === "BULLISH") {
      mfeExtreme = Math.max(mfeExtreme, c.high);
    } else {
      mfeExtreme = Math.min(mfeExtreme, c.low);
    }
  }

  const targetDistance = Math.abs(targetPrice - entryPrice);
  const mfePct =
    direction === "BULLISH"
      ? ((mfeExtreme - entryPrice) / entryPrice) * 100
      : ((entryPrice - mfeExtreme) / entryPrice) * 100;
  const mfeRatio =
    targetDistance > 0
      ? (direction === "BULLISH"
          ? mfeExtreme - entryPrice
          : entryPrice - mfeExtreme) / targetDistance
      : null;

  for (let i = start; i <= end; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const tHit = touchesTarget(direction, candle, targetPrice);
    const iHit = touchesInvalidation(direction, candle, invalidationPrice);
    if (tHit && iHit) {
      return {
        event: "AMBIGUOUS_SAME_BAR",
        barsToTarget: i - evalIdx,
        mfePercentage: mfePct,
        mfeToTargetDistanceRatio: mfeRatio,
      };
    }
    if (tHit) {
      return {
        event: "TARGET_REACHED",
        barsToTarget: i - evalIdx,
        mfePercentage: mfePct,
        mfeToTargetDistanceRatio: mfeRatio,
      };
    }
    if (iHit) {
      return {
        event: "INVALIDATION_REACHED",
        barsToTarget: null,
        mfePercentage: mfePct,
        mfeToTargetDistanceRatio: mfeRatio,
      };
    }
  }

  return {
    event: "NOT_REACHED_WITHIN_HORIZON",
    barsToTarget: null,
    mfePercentage: mfePct,
    mfeToTargetDistanceRatio: mfeRatio,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return percentile(s, 0.5);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function emptyModelAgg(modelId: AlternativeTargetModelId): ModelReachabilityAggregate {
  return {
    modelId,
    totalTrades: 0,
    classifiableTrades: 0,
    targetReached: 0,
    invalidationReached: 0,
    ambiguousSameBar: 0,
    notReachedWithinHorizon: 0,
    insufficientFuture: 0,
    notReplayable: 0,
    targetReachRate: null,
    targetBeforeInvalidationRate: null,
    ambiguousRate: null,
    medianBarsToTarget: null,
    meanBarsToTarget: null,
    meanMfePercentage: null,
    sampleSizeQuality: "VERY_SMALL_SAMPLE",
    interpretWithCaution: true,
  };
}

function finalizeAgg(
  agg: ModelReachabilityAggregate,
  barsToTarget: number[],
  mfes: number[]
): ModelReachabilityAggregate {
  const classifiable = agg.classifiableTrades;
  const q = classifyHistoricalIndependentTradeSampleSize(classifiable);
  return {
    ...agg,
    targetReachRate: classifiable > 0 ? agg.targetReached / classifiable : null,
    targetBeforeInvalidationRate: null,
    ambiguousRate: classifiable > 0 ? agg.ambiguousSameBar / classifiable : null,
    medianBarsToTarget: median(barsToTarget),
    meanBarsToTarget: mean(barsToTarget),
    meanMfePercentage: mean(mfes),
    sampleSizeQuality: q,
    interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
  };
}

function bumpEvent(agg: ModelReachabilityAggregate, event: CounterfactualReplayEvent): void {
  switch (event) {
    case "TARGET_REACHED":
      agg.targetReached += 1;
      break;
    case "INVALIDATION_REACHED":
      agg.invalidationReached += 1;
      break;
    case "AMBIGUOUS_SAME_BAR":
      agg.ambiguousSameBar += 1;
      break;
    case "NOT_REACHED_WITHIN_HORIZON":
      agg.notReachedWithinHorizon += 1;
      break;
    case "INSUFFICIENT_FUTURE":
      agg.insufficientFuture += 1;
      break;
    case "NOT_REPLAYABLE":
      agg.notReplayable += 1;
      break;
  }
}

function resolveAnchorKey(
  sources: readonly OpenStructuralLegAnchorSource[]
): OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED" {
  if (!sources.length) return "UNKNOWN";
  const u = [...new Set(sources)];
  return u.length === 1 ? u[0]! : "MIXED";
}

function prefixExtremeAtE(
  trade: IndependentTradeUnit,
  leg: { observedHigh: number; observedLow: number } | null
): boolean {
  if (!leg || trade.entryReferencePrice === null) return false;
  const e = trade.entryReferencePrice;
  if (trade.direction === "BULLISH") return leg.observedHigh >= e;
  if (trade.direction === "BEARISH") return leg.observedLow <= e;
  return false;
}

export function buildHistoricalAlternativeTargetReachabilityReplay(
  input: BuildHistoricalAlternativeTargetReachabilityReplayInput
): HistoricalAlternativeTargetReachabilityReplayReport {
  const { lifecycleReport, artifactMeasurements, candles } = input;
  const horizonBars =
    input.horizonBars ?? lifecycleReport.configuration.horizonBars;
  const b12v =
    input.alternativeTargetModelAnalysisReport ??
    buildHistoricalAlternativeTargetModelAnalysis({
      lifecycleReport,
      artifactMeasurements,
    });

  const artifactBySnapshot = new Map(artifactMeasurements.map((m) => [m.snapshotId, m]));
  const modelAggs = new Map<AlternativeTargetModelId, ModelReachabilityAggregate>();
  const modelBars = new Map<AlternativeTargetModelId, number[]>();
  const modelMfes = new Map<AlternativeTargetModelId, number[]>();
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    modelAggs.set(id, emptyModelAgg(id));
    modelAggs.get(id)!.totalTrades = lifecycleReport.trades.length;
    modelBars.set(id, []);
    modelMfes.set(id, []);
  }

  const perTrade: CounterfactualReachabilityRow[] = [];
  const parityMismatches: HistoricalAlternativeTargetReachabilityReplayReport["canonicalParity"]["mismatchSamples"][number][] =
    [];
  let parityComparable = 0;
  let parityMatches = 0;

  const rrCrossMap = new Map<string, { trades: number; reached: number }>();
  const rewardCrossMap = new Map<string, { trades: number; reached: number }>();
  const dirCrossMap = new Map<string, { trades: number; reached: number }>();
  const familyCrossMap = new Map<string, { trades: number; reached: number }>();
  const waveCrossMap = new Map<string, { trades: number; reached: number }>();
  const anchorCrossMap = new Map<string, { trades: number; reached: number }>();

  const failedFavIds = new Set<string>();
  const passedAdvIds = new Set<string>();
  for (const t of lifecycleReport.trades) {
    if (t.tradeEvaluationStatus === "FAILED" && t.policyClassification === "FAVORABLE_RESOLUTION") {
      failedFavIds.add(t.tradeId);
    }
    if (t.tradeEvaluationStatus === "PASSED" && t.policyClassification === "ADVERSE_RESOLUTION") {
      passedAdvIds.add(t.tradeId);
    }
  }

  const largeThresholds = [1, 2, 3, 5, 10];
  const largeMap = new Map<string, { count: number; reached: number; targetFirst: number }>();

  for (const tradeRow of b12v.perTrade) {
    const trade = lifecycleReport.trades.find((t) => t.tradeId === tradeRow.tradeId)!;
    const artifact = artifactBySnapshot.get(trade.snapshotId);
    const leg = artifact?.evaluation?.production?.openLegResolution.leg ?? null;
    const waveLabel = tradeRow.waveLabel;
    const anchorKey = resolveAnchorKey(tradeRow.anchorSources);
    const prefixAtE = prefixExtremeAtE(trade, leg);

    for (const model of tradeRow.models) {
      const agg = modelAggs.get(model.modelId)!;
      const entry = trade.entryReferencePrice;
      const inv = trade.invalidationReferencePrice;
      const dir = trade.direction;

      if (
        !model.classifiable ||
        model.counterfactualTargetPrice === null ||
        entry === null ||
        inv === null ||
        (dir !== "BULLISH" && dir !== "BEARISH") ||
        model.geometryStatus !== "VALID_GEOMETRY"
      ) {
        bumpEvent(agg, "NOT_REPLAYABLE");
        perTrade.push({
          tradeId: trade.tradeId,
          modelId: model.modelId,
          evaluationBarIndex: trade.evaluationBarIndex,
          entryPrice: entry,
          counterfactualTargetPrice: model.counterfactualTargetPrice,
          invalidationPrice: inv,
          grossTargetMovePercentage: model.rewardPercentage,
          counterfactualTargetRr: model.counterfactualTargetRr,
          replayEvent: "NOT_REPLAYABLE",
          barsToTarget: null,
          mfePercentage: null,
          mfeToTargetDistanceRatio: null,
          canonicalHistoricalPathOutcome: trade.pathOutcome,
          canonicalHistoricalPolicyClassification: trade.policyClassification,
          counterfactualReplayOutcome: "NOT_REPLAYABLE",
          targetBeforeInvalidation: false,
          prefixExtremeObservedAtE: prefixAtE,
          netReward: null,
          roundTripCost: null,
          alternativeTheoreticalR: null,
        });
        continue;
      }

      agg.classifiableTrades += 1;
      const replay = replayCounterfactualTargetReachability({
        direction: dir,
        evaluationBarIndex: trade.evaluationBarIndex,
        entryPrice: entry,
        targetPrice: model.counterfactualTargetPrice,
        invalidationPrice: inv,
        candles,
        horizonBars,
      });
      bumpEvent(agg, replay.event);
      const targetFirst = replay.event === "TARGET_REACHED";
      if (replay.barsToTarget !== null && replay.event === "TARGET_REACHED") {
        modelBars.get(model.modelId)!.push(replay.barsToTarget);
      }
      if (replay.mfePercentage !== null) {
        modelMfes.get(model.modelId)!.push(replay.mfePercentage);
      }

      if (model.modelId === "CANONICAL_DISPLACEMENT_EQUALITY") {
        const mapped = mapReplayEventToPathOutcome(replay.event);
        if (mapped !== null) {
          parityComparable += 1;
          if (mapped === trade.pathOutcome) {
            parityMatches += 1;
          } else if (parityMismatches.length < 25) {
            parityMismatches.push({
              tradeId: trade.tradeId,
              productionPathOutcome: trade.pathOutcome,
              b12wMappedOutcome: mapped,
              b12wReplayEvent: replay.event,
              note:
                "B-12w isolated OHLC replay; production path may use B-6 wiring or different invalidation timing.",
            });
          }
        }
      }

      const reached = replay.event === "TARGET_REACHED";
      const rrB = classifyHistoricalMeasurementRrBucketRow(trade.canonicalRrRatio);
      const rk = `${rrB}|${model.modelId}`;
      if (!rrCrossMap.has(rk)) rrCrossMap.set(rk, { trades: 0, reached: 0 });
      const rv = rrCrossMap.get(rk)!;
      rv.trades += 1;
      if (reached) rv.reached += 1;

      const rewB = classifyTargetMagnitudeRewardBucket(model.rewardPercentage);
      const rewK = `${rewB}|${model.modelId}`;
      if (!rewardCrossMap.has(rewK)) rewardCrossMap.set(rewK, { trades: 0, reached: 0 });
      const rewV = rewardCrossMap.get(rewK)!;
      rewV.trades += 1;
      if (reached) rewV.reached += 1;

      const dk = `${trade.direction ?? "UNRESOLVED"}|${model.modelId}`;
      if (!dirCrossMap.has(dk)) dirCrossMap.set(dk, { trades: 0, reached: 0 });
      const dv = dirCrossMap.get(dk)!;
      dv.trades += 1;
      if (reached) dv.reached += 1;

      const fk = `${trade.setupFamilyId}|${model.modelId}`;
      if (!familyCrossMap.has(fk)) familyCrossMap.set(fk, { trades: 0, reached: 0 });
      const fv = familyCrossMap.get(fk)!;
      fv.trades += 1;
      if (reached) fv.reached += 1;

      const wk = `${waveLabel}|${model.modelId}`;
      if (!waveCrossMap.has(wk)) waveCrossMap.set(wk, { trades: 0, reached: 0 });
      const wv = waveCrossMap.get(wk)!;
      wv.trades += 1;
      if (reached) wv.reached += 1;

      const ak = `${anchorKey}|${model.modelId}`;
      if (!anchorCrossMap.has(ak)) anchorCrossMap.set(ak, { trades: 0, reached: 0 });
      anchorCrossMap.get(ak)!.trades += 1;
      if (reached) anchorCrossMap.get(ak)!.reached += 1;

      if (model.rewardPercentage !== null) {
        for (const th of largeThresholds) {
          if (model.rewardPercentage >= th) {
            const lk = `${th}|${model.modelId}`;
            if (!largeMap.has(lk)) largeMap.set(lk, { count: 0, reached: 0, targetFirst: 0 });
            const lv = largeMap.get(lk)!;
            lv.count += 1;
            if (reached) lv.reached += 1;
            if (targetFirst) lv.targetFirst += 1;
          }
        }
      }

      perTrade.push({
        tradeId: trade.tradeId,
        modelId: model.modelId,
        evaluationBarIndex: trade.evaluationBarIndex,
        entryPrice: entry,
        counterfactualTargetPrice: model.counterfactualTargetPrice,
        invalidationPrice: inv,
        grossTargetMovePercentage: model.rewardPercentage,
        counterfactualTargetRr: model.counterfactualTargetRr,
        replayEvent: replay.event,
        barsToTarget: replay.barsToTarget,
        mfePercentage: replay.mfePercentage,
        mfeToTargetDistanceRatio: replay.mfeToTargetDistanceRatio,
        canonicalHistoricalPathOutcome: trade.pathOutcome,
        canonicalHistoricalPolicyClassification: trade.policyClassification,
        counterfactualReplayOutcome: replay.event,
        targetBeforeInvalidation: targetFirst,
        prefixExtremeObservedAtE: prefixAtE,
        netReward: null,
        roundTripCost: null,
        alternativeTheoreticalR: null,
      });
    }
  }

  const modelResults: ModelReachabilityAggregate[] = [];
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    const agg = modelAggs.get(id)!;
    const targetFirstCount = perTrade.filter(
      (r) => r.modelId === id && r.replayEvent === "TARGET_REACHED"
    ).length;
    const finalized = finalizeAgg(agg, modelBars.get(id)!, modelMfes.get(id)!);
    finalized.targetBeforeInvalidationRate =
      finalized.classifiableTrades > 0
        ? targetFirstCount / finalized.classifiableTrades
        : null;
    modelResults.push(finalized);
  }

  const timeToTarget = ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => {
    const bars = modelBars.get(modelId)!.filter((b) => b > 0);
    const sorted = [...bars].sort((a, b) => a - b);
    const bucket = (lo: number, hi: number) =>
      bars.filter((b) => b >= lo && b <= hi).length;
    return {
      modelId,
      mean: mean(bars),
      median: median(bars),
      min: bars.length ? Math.min(...bars) : null,
      max: bars.length ? Math.max(...bars) : null,
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      bucket_1_3: bucket(1, 3),
      bucket_4_6: bucket(4, 6),
      bucket_7_12: bucket(7, 12),
      bucket_13_24: bucket(13, 24),
    };
  });

  const summarizeSlice = (ids: Set<string>) =>
    ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => {
      const rows = perTrade.filter((r) => ids.has(r.tradeId) && r.modelId === modelId);
      const agg = emptyModelAgg(modelId);
      agg.totalTrades = ids.size;
      const bars: number[] = [];
      const mfes: number[] = [];
      for (const r of rows) {
        if (r.replayEvent === "NOT_REPLAYABLE") {
          bumpEvent(agg, r.replayEvent);
          continue;
        }
        agg.classifiableTrades += 1;
        bumpEvent(agg, r.replayEvent);
        if (r.barsToTarget !== null && r.replayEvent === "TARGET_REACHED") {
          bars.push(r.barsToTarget);
        }
        if (r.mfePercentage !== null) mfes.push(r.mfePercentage);
      }
      const fin = finalizeAgg(agg, bars, mfes);
      const tf = rows.filter((r) => r.replayEvent === "TARGET_REACHED").length;
      fin.targetBeforeInvalidationRate =
        fin.classifiableTrades > 0 ? tf / fin.classifiableTrades : null;
      return fin;
    });

  const b12vByModel = new Map(b12v.modelComparison.map((m) => [m.modelId, m]));

  return {
    schemaVersion: HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      lifecycleSummary: lifecycleReport.summary,
    },
    replayPolicy: {
      replayStart: "E_PLUS_1",
      replayEnd: "E_PLUS_HORIZON_INCLUSIVE",
      horizonSource: "lifecycleReport.configuration.horizonBars",
      horizonBars,
      semantics:
        "B-12w counterfactual OHLC replay; not production B-6 path mutation.",
    },
    canonicalReference: {
      entrySource: "lifecycle entryReferencePrice (E close)",
      targetSource: "B-12v counterfactual geometry per model",
      invalidationSource: "lifecycle invalidationReferencePrice",
    },
    modelResults,
    modelComparison: modelResults.map((m) => ({
      modelId: m.modelId,
      meanRewardPercentage: b12vByModel.get(m.modelId)?.meanRewardPercentage ?? null,
      meanCounterfactualRr: b12vByModel.get(m.modelId)?.meanCounterfactualRr ?? null,
      targetReachRate: m.targetReachRate,
      targetBeforeInvalidationRate: m.targetBeforeInvalidationRate,
      medianBarsToTarget: m.medianBarsToTarget,
      meanMfePercentage: m.meanMfePercentage,
    })),
    targetReachability: { byModel: modelResults },
    targetFirstAnalysis: { byModel: modelResults },
    timeToTarget,
    mfeAnalysis: modelResults.map((m) => ({
      modelId: m.modelId,
      meanMfePercentage: m.meanMfePercentage,
      meanMfeToTargetRatio: null,
    })),
    largeTargetAnalysis: [...largeMap.entries()].map(([key, v]) => {
      const [th, modelId] = key.split("|");
      return {
        rewardThresholdPercent: Number(th),
        modelId: modelId as AlternativeTargetModelId,
        count: v.count,
        targetReached: v.reached,
        targetReachRate: v.count > 0 ? v.reached / v.count : null,
        targetBeforeInvalidation: v.targetFirst,
      };
    }),
    failedFavorableAnalysis: {
      trades: failedFavIds.size,
      byModel: summarizeSlice(failedFavIds),
      note: "Observational replay rates; not an evaluator verdict.",
    },
    passedAdverseAnalysis: {
      trades: passedAdvIds.size,
      byModel: summarizeSlice(passedAdvIds),
      note: "Observational replay rates only.",
    },
    rrCross: [...rrCrossMap.entries()].map(([key, v]) => {
      const [rrBucket, modelId] = key.split("|");
      return {
        rrBucket: rrBucket as HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE",
        modelId: modelId as AlternativeTargetModelId,
        trades: v.trades,
        targetReached: v.reached,
      };
    }),
    rewardCross: [...rewardCrossMap.entries()].map(([key, v]) => {
      const [rewardBucket, modelId] = key.split("|");
      return { rewardBucket, modelId: modelId as AlternativeTargetModelId, trades: v.trades, targetReached: v.reached };
    }),
    directionCross: [...dirCrossMap.entries()].map(([key, v]) => ({
      direction: key.split("|")[0]!,
      modelId: key.split("|")[1] as AlternativeTargetModelId,
      targetReachRate: v.trades > 0 ? v.reached / v.trades : null,
      trades: v.trades,
    })),
    setupFamilyCross: [...familyCrossMap.entries()].map(([key, v]) => ({
      setupFamilyId: key.split("|")[0]!,
      modelId: key.split("|")[1] as AlternativeTargetModelId,
      targetReachRate: v.trades > 0 ? v.reached / v.trades : null,
      trades: v.trades,
    })),
    waveContextCross: [...waveCrossMap.entries()].map(([key, v]) => ({
      waveLabel: key.split("|")[0]!,
      modelId: key.split("|")[1] as AlternativeTargetModelId,
      targetReachRate: v.trades > 0 ? v.reached / v.trades : null,
      trades: v.trades,
    })),
    anchorSourceCross: [...anchorCrossMap.entries()].map(([key, v]) => ({
      anchorSource: key.split("|")[0] as OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED",
      modelId: key.split("|")[1] as AlternativeTargetModelId,
      targetReachRate: v.trades > 0 ? v.reached / v.trades : null,
      trades: v.trades,
    })),
    canonicalParity: {
      canonicalModelReplayComparable: parityComparable,
      matchesProductionPathOutcome: parityMatches,
      mismatches: parityComparable - parityMatches,
      mismatchSamples: parityMismatches,
    },
    perTrade,
    warnings: [...WARNINGS],
    diagnosticSummary: [
      {
        finding: "Alternative target reachability measured via E+1..E+horizon OHLC touch.",
        note: "Historical replay rate, not strategy win rate.",
      },
      {
        finding: `Canonical parity: ${parityMatches}/${parityComparable} mapped path outcomes match lifecycle pathOutcome.`,
        note: "Mismatches are diagnostic, not automatic bugs.",
      },
      {
        finding: "Profitability cannot be concluded without fees/execution.",
        note: "not_profitability_measurement",
      },
    ],
    consumedReports: {
      lifecycleReport: true,
      artifactMeasurements: true,
      alternativeTargetModelAnalysisReport: input.alternativeTargetModelAnalysisReport !== undefined,
    },
  };
}
