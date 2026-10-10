import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { computeGrossPriceMovePercentages } from "./historical-entry-price-move-quality-analysis";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { classifyTargetMagnitudeRewardBucket } from "./historical-target-provenance-structural-distance-analysis";
import type { TargetMagnitudeRewardBucketId } from "./historical-target-provenance-structural-distance-analysis-types";
import { projectProspectiveOpenLegDisplacementEqualityTarget } from "./setup/prospective-open-leg-displacement-equality-policy";
import type { HistoricalMeasurementEvaluationSnapshot } from "./setup/historical-measurement-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  ALTERNATIVE_TARGET_MODEL_IDS,
  HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION,
  type AlternativeTargetModelId,
  type AlternativeTargetTradeRow,
  type BuildHistoricalAlternativeTargetModelAnalysisInput,
  type CounterfactualTargetModelResult,
  type HistoricalAlternativeTargetModelAnalysisReport,
  type ModelAggregateMetrics,
} from "./historical-alternative-target-model-analysis-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const DISPLACEMENT_MULTIPLIERS: readonly { id: AlternativeTargetModelId; m: number }[] =
  [
    { id: "CANONICAL_DISPLACEMENT_EQUALITY", m: 1 },
    { id: "DISPLACEMENT_1_25", m: 1.25 },
    { id: "DISPLACEMENT_1_50", m: 1.5 },
    { id: "DISPLACEMENT_2_00", m: 2 },
    { id: "DISPLACEMENT_2_50", m: 2.5 },
    { id: "DISPLACEMENT_3_00", m: 3 },
  ];

const EXTENSION_MULTIPLIERS: readonly { id: AlternativeTargetModelId; m: number }[] = [
  { id: "STRUCTURAL_EXTENSION_1_00", m: 1 },
  { id: "STRUCTURAL_EXTENSION_1_25", m: 1.25 },
  { id: "STRUCTURAL_EXTENSION_1_50", m: 1.5 },
  { id: "STRUCTURAL_EXTENSION_2_00", m: 2 },
];

const WARNINGS: readonly string[] = [
  "counterfactual_geometry_research_only",
  "not_a_target_recommendation",
  "alternative_target_not_measured_on_replayed_path",
  "no_alternative_win_loss_inference",
  "counterfactual_target_rr_not_canonical_prospective_rr",
  "canonical_theoretical_r_only_from_b12h",
  "no_pnl_no_execution",
  "observational_not_causal",
];

const HEADROOM_CROSS: readonly {
  canonicalRewardThresholdPercent: number;
  headroomThresholdPercent: number;
}[] = [
  { canonicalRewardThresholdPercent: 0.5, headroomThresholdPercent: 0.5 },
  { canonicalRewardThresholdPercent: 0.5, headroomThresholdPercent: 1 },
  { canonicalRewardThresholdPercent: 1, headroomThresholdPercent: 1 },
  { canonicalRewardThresholdPercent: 1, headroomThresholdPercent: 2 },
  { canonicalRewardThresholdPercent: 1, headroomThresholdPercent: 3 },
];

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function resolveAnchorSourceKey(
  sources: readonly OpenStructuralLegAnchorSource[]
): OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED" {
  if (!sources.length) return "UNKNOWN";
  if (sources.length === 1) return sources[0]!;
  const u = [...new Set(sources)];
  return u.length === 1 ? u[0]! : "MIXED";
}

function computePrefixHeadroom(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null,
  canonicalTarget: number | null
): number | null {
  const entry = trade.entryReferencePrice;
  const leg = evaluation?.production?.openLegResolution.leg ?? null;
  if (
    entry === null ||
    canonicalTarget === null ||
    !leg ||
    !Number.isFinite(entry) ||
    entry <= 0
  ) {
    return null;
  }
  const dir = trade.direction;
  if (dir === "BULLISH" && leg.observedHigh > canonicalTarget) {
    return ((leg.observedHigh - canonicalTarget) / entry) * 100;
  }
  if (dir === "BEARISH" && leg.observedLow < canonicalTarget) {
    return ((canonicalTarget - leg.observedLow) / entry) * 100;
  }
  return 0;
}

export function computeDisplacementCounterfactualTarget(
  entry: number,
  anchor: number,
  direction: "BULLISH" | "BEARISH",
  multiplier: number
): number {
  const d = Math.abs(entry - anchor);
  return direction === "BULLISH" ? entry + d * multiplier : entry - d * multiplier;
}

export function computeStructuralPrefixCounterfactualTarget(
  entry: number,
  observedHigh: number,
  observedLow: number,
  direction: "BULLISH" | "BEARISH"
): number | null {
  if (direction === "BULLISH") {
    if (!Number.isFinite(observedHigh) || observedHigh <= entry) return null;
    return observedHigh;
  }
  if (!Number.isFinite(observedLow) || observedLow >= entry) return null;
  return observedLow;
}

export function computeStructuralExtensionCounterfactualTarget(
  entry: number,
  observedHigh: number,
  observedLow: number,
  direction: "BULLISH" | "BEARISH",
  extensionMultiplier: number
): number | null {
  if (direction === "BULLISH") {
    const s = observedHigh - entry;
    if (!Number.isFinite(s) || s <= 0) return null;
    return entry + s * extensionMultiplier;
  }
  const s = entry - observedLow;
  if (!Number.isFinite(s) || s <= 0) return null;
  return entry - s * extensionMultiplier;
}

export function classifyCounterfactualGeometry(
  direction: "BULLISH" | "BEARISH" | null,
  entry: number,
  target: number,
  invalidation: number
): "VALID_GEOMETRY" | "INVALID_GEOMETRY" {
  if (direction === "BULLISH") {
    return target > entry && entry > invalidation ? "VALID_GEOMETRY" : "INVALID_GEOMETRY";
  }
  if (direction === "BEARISH") {
    return invalidation > entry && entry > target ? "VALID_GEOMETRY" : "INVALID_GEOMETRY";
  }
  return "INVALID_GEOMETRY";
}

export function computeCounterfactualTargetRr(
  direction: "BULLISH" | "BEARISH",
  entry: number,
  target: number,
  invalidation: number
): { riskStatus: "VALID_RISK" | "INVALID_RISK_REFERENCE"; rr: number | null } {
  const risk =
    direction === "BULLISH" ? entry - invalidation : invalidation - entry;
  if (!Number.isFinite(risk) || risk <= 0) {
    return { riskStatus: "INVALID_RISK_REFERENCE", rr: null };
  }
  const reward =
    direction === "BULLISH" ? target - entry : entry - target;
  if (!Number.isFinite(reward) || reward <= 0) {
    return { riskStatus: "INVALID_RISK_REFERENCE", rr: null };
  }
  const rr = reward / risk;
  return Number.isFinite(rr)
    ? { riskStatus: "VALID_RISK", rr }
    : { riskStatus: "INVALID_RISK_REFERENCE", rr: null };
}

function buildModelResult(input: {
  modelId: AlternativeTargetModelId;
  trade: IndependentTradeUnit;
  evaluation: HistoricalMeasurementEvaluationSnapshot | null;
  targetPrice: number | null;
  classifiable: boolean;
  unclassifiableReason: string | null;
  canonicalRewardPct: number | null;
  canonicalTheoreticalR: number | null;
  prefixHeadroom: number | null;
}): CounterfactualTargetModelResult {
  const { trade, targetPrice, classifiable } = input;
  const entry = trade.entryReferencePrice;
  const inv = trade.invalidationReferencePrice;
  const dir = trade.direction;

  if (!classifiable || targetPrice === null || entry === null || inv === null) {
    return {
      modelId: input.modelId,
      classifiable: false,
      unclassifiableReason: input.unclassifiableReason ?? "NOT_CLASSIFIABLE",
      geometryStatus: "NOT_CLASSIFIABLE",
      riskStatus: "NOT_CLASSIFIABLE",
      counterfactualTargetPrice: targetPrice,
      rewardPercentage: null,
      riskPercentage: null,
      counterfactualTargetRr: null,
      rewardBucket: "REWARD_NOT_APPLICABLE",
      rrBucket: "NOT_APPLICABLE",
      targetDistanceRatioVsCanonical: null,
      alternativeRewardVsCanonicalPercentage: null,
      targetExpansionVsCanonical: null,
      prefixStructuralHeadroomPercentage: input.prefixHeadroom,
      reachability: {
        status: "NOT_MEASURABLE",
        reason: "alternative_target_path_replay_not_performed",
      },
      pathOutcomeComparability: {
        canonicalPathOutcome: trade.pathOutcome,
        policyClassification: trade.policyClassification,
        alternativeOutcomeInference: "NOT_INFERRED",
        note: "Canonical path outcome applies to canonical target only.",
      },
      canonicalTheoreticalR: input.canonicalTheoreticalR,
      alternativeTheoreticalR: null,
    };
  }

  const geometryStatus = classifyCounterfactualGeometry(
    dir,
    entry,
    targetPrice,
    inv
  );
  const rewardPct = (Math.abs(targetPrice - entry) / entry) * 100;
  const riskPct =
    dir === "BULLISH"
      ? ((entry - inv) / entry) * 100
      : ((inv - entry) / entry) * 100;

  let riskStatus: CounterfactualTargetModelResult["riskStatus"] = "NOT_CLASSIFIABLE";
  let rr: number | null = null;
  if (geometryStatus === "VALID_GEOMETRY" && dir) {
    const rrRes = computeCounterfactualTargetRr(dir, entry, targetPrice, inv);
    riskStatus = rrRes.riskStatus;
    rr = rrRes.rr;
  } else {
    riskStatus = "INVALID_RISK_REFERENCE";
  }

  let ratio: number | null = null;
  let vsCanonical: number | null = null;
  let expansion: number | null = null;
  if (input.canonicalRewardPct !== null && input.canonicalRewardPct > 0) {
    ratio = rewardPct / input.canonicalRewardPct;
    vsCanonical = rewardPct - input.canonicalRewardPct;
    expansion = ratio - 1;
  }

  const rrBucket =
    rr !== null && riskStatus === "VALID_RISK"
      ? classifyHistoricalMeasurementRrBucketRow(rr)
      : "NOT_APPLICABLE";

  return {
    modelId: input.modelId,
    classifiable: true,
    unclassifiableReason: null,
    geometryStatus,
    riskStatus,
    counterfactualTargetPrice: targetPrice,
    rewardPercentage: rewardPct,
    riskPercentage: riskPct,
    counterfactualTargetRr: rr,
    rewardBucket: classifyTargetMagnitudeRewardBucket(rewardPct),
    rrBucket,
    targetDistanceRatioVsCanonical: ratio,
    alternativeRewardVsCanonicalPercentage: vsCanonical,
    targetExpansionVsCanonical: expansion,
    prefixStructuralHeadroomPercentage: input.prefixHeadroom,
    reachability: {
      status: "NOT_MEASURABLE",
      reason: "alternative_target_path_replay_not_performed",
    },
    pathOutcomeComparability: {
      canonicalPathOutcome: trade.pathOutcome,
      policyClassification: trade.policyClassification,
      alternativeOutcomeInference: "NOT_INFERRED",
      note: "Do not infer alternative WIN/LOSS from canonical path replay.",
    },
    canonicalTheoreticalR: input.canonicalTheoreticalR,
    alternativeTheoreticalR: null,
  };
}

function emptyAgg(modelId: AlternativeTargetModelId): ModelAggregateMetrics {
  return {
    modelId,
    classifiableTrades: 0,
    invalidGeometry: 0,
    invalidRisk: 0,
    meanRewardPercentage: null,
    meanRiskPercentage: null,
    meanCounterfactualRr: null,
    meanTargetDistanceRatioVsCanonical: null,
    rewardBucketCounts: {},
    rrBucketCounts: {},
    largeTargetCounts: {
      gte1Percent: 0,
      gte2Percent: 0,
      gte3Percent: 0,
      gte5Percent: 0,
      gte10Percent: 0,
    },
    sampleSizeQuality: "VERY_SMALL_SAMPLE",
    interpretWithCaution: true,
  };
}

function finalizeAgg(agg: ModelAggregateMetrics, rewards: number[], risks: number[], rrs: number[], ratios: number[]): ModelAggregateMetrics {
  const q = classifyHistoricalIndependentTradeSampleSize(agg.classifiableTrades);
  return {
    ...agg,
    meanRewardPercentage: mean(rewards),
    meanRiskPercentage: mean(risks),
    meanCounterfactualRr: mean(rrs),
    meanTargetDistanceRatioVsCanonical: mean(ratios),
    sampleSizeQuality: q,
    interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
  };
}

export function buildHistoricalAlternativeTargetModelAnalysis(
  input: BuildHistoricalAlternativeTargetModelAnalysisInput
): HistoricalAlternativeTargetModelAnalysisReport {
  const { lifecycleReport, artifactMeasurements, eligibilityAuditReport } = input;
  const artifactBySnapshot = new Map(
    artifactMeasurements.map((m) => [m.snapshotId, m])
  );
  const theoreticalRByTrade = new Map<string, number>();
  if (eligibilityAuditReport) {
    for (const row of eligibilityAuditReport.decisiveRows ?? []) {
      if (row.theoreticalR !== null && Number.isFinite(row.theoreticalR)) {
        theoreticalRByTrade.set(row.tradeId, row.theoreticalR);
      }
    }
  }

  const aggs = new Map<AlternativeTargetModelId, ModelAggregateMetrics>();
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    aggs.set(id, emptyAgg(id));
  }
  const aggScratch = new Map<
    AlternativeTargetModelId,
    { rewards: number[]; risks: number[]; rrs: number[]; ratios: number[] }
  >();
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    aggScratch.set(id, { rewards: [], risks: [], rrs: [], ratios: [] });
  }

  let joinHits = 0;
  let b12uPrefixBeyond = 0;
  let canonicalMult1Parity = 0;
  const perTrade: AlternativeTargetTradeRow[] = [];

  const failedFav: IndependentTradeUnit[] = [];
  const passedAdv: IndependentTradeUnit[] = [];

  const evalCrossMap = new Map<string, { trades: number; rewards: number[] }>();
  const dirCrossMap = new Map<string, { trades: number }>();
  const familyCrossMap = new Map<string, { trades: number }>();
  const waveCrossMap = new Map<string, { trades: number }>();
  const anchorCrossMap = new Map<string, { trades: number; displacements: number[] }>();

  for (const trade of lifecycleReport.trades) {
    const artifact = artifactBySnapshot.get(trade.snapshotId);
    if (artifact) joinHits += 1;
    const evaluation = artifact?.evaluation ?? null;
    const leg = evaluation?.production?.openLegResolution.leg ?? null;
    const anchor = leg?.anchorPrice ?? null;
    const entry = trade.entryReferencePrice;
    const canonicalTarget = trade.targetReferencePrice;
    const { grossRewardPercentage: canonicalRewardPct } =
      computeGrossPriceMovePercentages(trade);
    const prefixHeadroom = computePrefixHeadroom(trade, evaluation, canonicalTarget);
    if ((prefixHeadroom ?? 0) > 0) b12uPrefixBeyond += 1;

    const waveLabel =
      evaluation?.production?.prospectiveWaveLabel ??
      evaluation?.historicalSetup?.scenarioRef?.waveLabel ??
      "UNKNOWN";
    const anchorSources = leg?.selectedAnchorSources ?? [];
    const anchorKey = resolveAnchorSourceKey(anchorSources);

    if (
      trade.tradeEvaluationStatus === "FAILED" &&
      trade.policyClassification === "FAVORABLE_RESOLUTION"
    ) {
      failedFav.push(trade);
    }
    if (
      trade.tradeEvaluationStatus === "PASSED" &&
      trade.policyClassification === "ADVERSE_RESOLUTION"
    ) {
      passedAdv.push(trade);
    }

    const dir = trade.direction;
    const models: CounterfactualTargetModelResult[] = [];
    const canonicalTheoreticalR = theoreticalRByTrade.get(trade.tradeId) ?? null;

    const addTarget = (
      modelId: AlternativeTargetModelId,
      target: number | null,
      classifiable: boolean,
      reason: string | null
    ) => {
      const res = buildModelResult({
        modelId,
        trade,
        evaluation,
        targetPrice: target,
        classifiable,
        unclassifiableReason: reason,
        canonicalRewardPct,
        canonicalTheoreticalR,
        prefixHeadroom,
      });
      models.push(res);
      const agg = aggs.get(modelId)!;
      const scratch = aggScratch.get(modelId)!;
      if (res.classifiable) {
        agg.classifiableTrades += 1;
        if (res.geometryStatus === "INVALID_GEOMETRY") agg.invalidGeometry += 1;
        if (res.riskStatus === "INVALID_RISK_REFERENCE") agg.invalidRisk += 1;
        if (res.rewardPercentage !== null) {
          scratch.rewards.push(res.rewardPercentage);
          const r = res.rewardPercentage;
          if (r >= 1) agg.largeTargetCounts.gte1Percent += 1;
          if (r >= 2) agg.largeTargetCounts.gte2Percent += 1;
          if (r >= 3) agg.largeTargetCounts.gte3Percent += 1;
          if (r >= 5) agg.largeTargetCounts.gte5Percent += 1;
          if (r >= 10) agg.largeTargetCounts.gte10Percent += 1;
          agg.rewardBucketCounts[res.rewardBucket] =
            (agg.rewardBucketCounts[res.rewardBucket] ?? 0) + 1;
        }
        if (res.riskPercentage !== null) scratch.risks.push(res.riskPercentage);
        if (res.counterfactualTargetRr !== null) scratch.rrs.push(res.counterfactualTargetRr);
        if (res.targetDistanceRatioVsCanonical !== null) {
          scratch.ratios.push(res.targetDistanceRatioVsCanonical);
        }
        agg.rrBucketCounts[res.rrBucket] = (agg.rrBucketCounts[res.rrBucket] ?? 0) + 1;

        const ek = `${trade.tradeEvaluationStatus}|${modelId}`;
        if (!evalCrossMap.has(ek)) evalCrossMap.set(ek, { trades: 0, rewards: [] });
        const ev = evalCrossMap.get(ek)!;
        ev.trades += 1;
        if (res.rewardPercentage !== null) ev.rewards.push(res.rewardPercentage);

        const dk = `${trade.direction ?? "UNRESOLVED"}|${modelId}`;
        if (!dirCrossMap.has(dk)) dirCrossMap.set(dk, { trades: 0 });
        dirCrossMap.get(dk)!.trades += 1;

        const fk = `${trade.setupFamilyId}|${modelId}`;
        if (!familyCrossMap.has(fk)) familyCrossMap.set(fk, { trades: 0 });
        familyCrossMap.get(fk)!.trades += 1;

        const wk = `${waveLabel}|${modelId}`;
        if (!waveCrossMap.has(wk)) waveCrossMap.set(wk, { trades: 0 });
        waveCrossMap.get(wk)!.trades += 1;

        const ak = `${anchorKey}|${modelId}`;
        if (!anchorCrossMap.has(ak)) anchorCrossMap.set(ak, { trades: 0, displacements: [] });
        const av = anchorCrossMap.get(ak)!;
        av.trades += 1;
        if (
          entry !== null &&
          anchor !== null &&
          Number.isFinite(entry) &&
          entry > 0
        ) {
          av.displacements.push((Math.abs(entry - anchor) / entry) * 100);
        }
      }
    };

    if (
      entry !== null &&
      anchor !== null &&
      dir &&
      Number.isFinite(entry) &&
      Number.isFinite(anchor)
    ) {
      for (const { id, m } of DISPLACEMENT_MULTIPLIERS) {
        const t =
          m === 1
            ? projectProspectiveOpenLegDisplacementEqualityTarget(anchor, entry)
            : computeDisplacementCounterfactualTarget(entry, anchor, dir, m);
        if (id === "CANONICAL_DISPLACEMENT_EQUALITY" && canonicalTarget !== null) {
          if (Math.abs(t - canonicalTarget) < 1e-6) canonicalMult1Parity += 1;
        }
        addTarget(id, t, true, null);
      }
    } else {
      for (const { id } of DISPLACEMENT_MULTIPLIERS) {
        addTarget(id, null, false, "MISSING_ENTRY_ANCHOR_OR_DIRECTION");
      }
    }

    if (entry !== null && leg && dir) {
      const prefixT = computeStructuralPrefixCounterfactualTarget(
        entry,
        leg.observedHigh,
        leg.observedLow,
        dir
      );
      addTarget(
        "STRUCTURAL_PREFIX_EXTREME",
        prefixT,
        prefixT !== null,
        prefixT === null ? "NO_PREFIX_EXTREME_BEYOND_ENTRY" : null
      );
      for (const { id, m } of EXTENSION_MULTIPLIERS) {
        const t = computeStructuralExtensionCounterfactualTarget(
          entry,
          leg.observedHigh,
          leg.observedLow,
          dir,
          m
        );
        addTarget(
          id,
          t,
          t !== null,
          t === null ? "STRUCTURAL_MOVE_UNAVAILABLE" : null
        );
      }
    } else {
      addTarget("STRUCTURAL_PREFIX_EXTREME", null, false, "OPEN_LEG_UNAVAILABLE");
      for (const { id } of EXTENSION_MULTIPLIERS) {
        addTarget(id, null, false, "OPEN_LEG_UNAVAILABLE");
      }
    }

    perTrade.push({
      tradeId: trade.tradeId,
      snapshotId: trade.snapshotId,
      direction: trade.direction ?? "UNRESOLVED",
      entryPrice: entry,
      anchorPrice: anchor,
      canonicalTargetPrice: canonicalTarget,
      invalidationPrice: trade.invalidationReferencePrice,
      canonicalRewardPercentage: canonicalRewardPct,
      canonicalRrRatio: trade.canonicalRrRatio,
      tradeEvaluationStatus: trade.tradeEvaluationStatus,
      evaluatorFirstFailure: trade.evaluatorFirstFailure,
      setupFamilyId: trade.setupFamilyId,
      waveLabel,
      anchorSources,
      models,
    });
  }

  const modelComparison: ModelAggregateMetrics[] = [];
  for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
    const scratch = aggScratch.get(id)!;
    modelComparison.push(finalizeAgg(aggs.get(id)!, scratch.rewards, scratch.risks, scratch.rrs, scratch.ratios));
  }

  const structuralHeadroomComparison = HEADROOM_CROSS.map((pair) => {
    const subset = perTrade.filter((row) => {
      const r = row.canonicalRewardPercentage;
      const h =
        row.models.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY")
          ?.prefixStructuralHeadroomPercentage ?? null;
      return (
        r !== null &&
        h !== null &&
        r < pair.canonicalRewardThresholdPercent &&
        h >= pair.headroomThresholdPercent
      );
    });
    const byModelMeanReward: Partial<Record<AlternativeTargetModelId, number | null>> = {};
    for (const id of ALTERNATIVE_TARGET_MODEL_IDS) {
      const rewards = subset
        .map((row) => row.models.find((m) => m.modelId === id)?.rewardPercentage)
        .filter((x): x is number => x !== null && x !== undefined);
      byModelMeanReward[id] = mean(rewards);
    }
    const q = classifyHistoricalIndependentTradeSampleSize(subset.length);
    return {
      canonicalRewardThresholdPercent: pair.canonicalRewardThresholdPercent,
      headroomThresholdPercent: pair.headroomThresholdPercent,
      trades: subset.length,
      byModelMeanReward,
      sampleSizeQuality: q,
      interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
    };
  });

  const summarizeFailedFav = () => {
    const ids = failedFav.map((t) => t.tradeId);
    const rows = perTrade.filter((r) => ids.includes(r.tradeId));
    const byModel = ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => {
      const ms = rows
        .map((r) => r.models.find((m) => m.modelId === modelId))
        .filter((m): m is CounterfactualTargetModelResult => m !== undefined && m.classifiable);
      return {
        modelId,
        classifiable: ms.length,
        meanRewardPercentage: mean(
          ms.map((m) => m.rewardPercentage).filter((x): x is number => x !== null)
        ),
        meanCounterfactualRr: mean(
          ms.map((m) => m.counterfactualTargetRr).filter((x): x is number => x !== null)
        ),
      };
    });
    return {
      trades: failedFav.length,
      rrBelowMinimum: failedFav.filter((t) => t.evaluatorFirstFailure === "RR_BELOW_MINIMUM").length,
      byModel,
      note: "Observational geometry only; not an evaluator verdict.",
    };
  };

  const summarizePassedAdv = () => {
    const ids = passedAdv.map((t) => t.tradeId);
    const rows = perTrade.filter((r) => ids.includes(r.tradeId));
    return {
      trades: passedAdv.length,
      byModel: ALTERNATIVE_TARGET_MODEL_IDS.map((modelId) => {
        const ms = rows
          .map((r) => r.models.find((m) => m.modelId === modelId))
          .filter((m): m is CounterfactualTargetModelResult => m !== undefined && m.classifiable);
        return {
          modelId,
          classifiable: ms.length,
          meanRewardPercentage: mean(
            ms.map((m) => m.rewardPercentage).filter((x): x is number => x !== null)
          ),
        };
      }),
      note: "Observational geometry only.",
    };
  };

  const diagnosticSummary = [
    {
      question: "How often do counterfactual models exceed canonical target distance?",
      answer: `Displacement multipliers expand canonical reward by design; STRUCTURAL_PREFIX_EXTREME classifiable on ${modelComparison.find((m) => m.modelId === "STRUCTURAL_PREFIX_EXTREME")?.classifiableTrades ?? 0} trades.`,
    },
    {
      question: "Reachability of alternative targets on frozen path?",
      answer: "NOT_MEASURABLE — path replay not performed for alternative targets.",
    },
    {
      question: "Geometric vs associational findings?",
      answer:
        "Reward %, RR, and geometry are direct counterfactual measurements; evaluator/outcome slices are observational association only.",
    },
  ];

  return {
    schemaVersion: HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      artifactJoinHits: joinHits,
      lifecycleSummary: lifecycleReport.summary,
    },
    canonicalModel: {
      formula: "target = entry + (entry - anchor); multiplier 1.00",
      sourceFunction: "projectProspectiveOpenLegDisplacementEqualityTarget",
    },
    alternativeModels: ALTERNATIVE_TARGET_MODEL_IDS.map((id) => ({
      modelId: id,
      description:
        id === "STRUCTURAL_PREFIX_EXTREME"
          ? "observedHigh/Low at E (prefix)"
          : id.startsWith("DISPLACEMENT")
            ? `|entry-anchor| × ${id.replace("DISPLACEMENT_", "").replace("_", ".")}`
            : id.startsWith("STRUCTURAL_EXTENSION")
              ? `structural move S × ${id.replace("STRUCTURAL_EXTENSION_", "").replace("_", ".")}`
              : "canonical",
    })),
    modelComparison,
    modelDistributions: { byModel: modelComparison },
    rewardMagnitudeComparison: modelComparison.map((m) => ({
      modelId: m.modelId,
      byBucket: m.rewardBucketCounts,
    })),
    riskMagnitudeComparison: modelComparison.map((m) => ({
      modelId: m.modelId,
      meanRiskPercentage: m.meanRiskPercentage,
    })),
    rrComparison: modelComparison.map((m) => ({
      modelId: m.modelId,
      byRrBucket: m.rrBucketCounts,
    })),
    structuralHeadroomComparison,
    evaluatorCross: [...evalCrossMap.entries()].map(([key, v]) => {
      const [evaluationStatus, modelId] = key.split("|");
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        evaluationStatus,
        modelId: modelId as AlternativeTargetModelId,
        classifiableTrades: v.trades,
        meanRewardPercentage: mean(v.rewards),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    failedFavorableAnalysis: summarizeFailedFav(),
    passedAdverseAnalysis: summarizePassedAdv(),
    directionCross: [...dirCrossMap.entries()].map(([key, v]) => {
      const [direction, modelId] = key.split("|");
      return {
        direction,
        modelId: modelId as AlternativeTargetModelId,
        classifiableTrades: v.trades,
        meanRewardPercentage: null,
      };
    }),
    setupFamilyCross: [...familyCrossMap.entries()].map(([key, v]) => {
      const [setupFamilyId, modelId] = key.split("|");
      return { setupFamilyId, modelId: modelId as AlternativeTargetModelId, classifiableTrades: v.trades };
    }),
    waveContextCross: [...waveCrossMap.entries()].map(([key, v]) => {
      const [waveLabel, modelId] = key.split("|");
      return { waveLabel, modelId: modelId as AlternativeTargetModelId, classifiableTrades: v.trades };
    }),
    anchorSourceCross: [...anchorCrossMap.entries()].map(([key, v]) => {
      const [anchorSource, modelId] = key.split("|");
      return {
        anchorSource: anchorSource as OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED",
        modelId: modelId as AlternativeTargetModelId,
        classifiableTrades: v.trades,
        meanDisplacementMagnitude: mean(v.displacements),
      };
    }),
    largeTargetContext: modelComparison.map((m) => ({
      modelId: m.modelId,
      gte1: m.largeTargetCounts.gte1Percent,
      gte2: m.largeTargetCounts.gte2Percent,
      gte3: m.largeTargetCounts.gte3Percent,
      gte5: m.largeTargetCounts.gte5Percent,
      gte10: m.largeTargetCounts.gte10Percent,
      reachabilityNote: "NOT_MEASURABLE without path replay.",
    })),
    reachability: {
      globalStatus: "NOT_MEASURABLE",
      reason: "alternative_target_touch_requires_path_replay_not_performed_in_b12v",
      canonicalPathOutcomeMeasured: true,
      alternativeTargetTouchMeasured: false,
    },
    parity: {
      b12uPrefixBeyondCanonicalTargetCount: b12uPrefixBeyond,
      canonicalDisplacementMultiplier1ParityTrades: canonicalMult1Parity,
      note: "b12uPrefixBeyond counts prefix headroom > 0 vs canonical target.",
    },
    perTrade,
    warnings: [...WARNINGS],
    diagnosticSummary,
    lookaheadAttestation: {
      prefixInformationSetOnly: true,
      noPathReplay: true,
      statement: "Counterfactual targets use E-prefix open leg and frozen entry/anchor only.",
    },
  };
}
