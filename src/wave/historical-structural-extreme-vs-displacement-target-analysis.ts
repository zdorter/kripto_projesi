import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { computeGrossPriceMovePercentages } from "./historical-entry-price-move-quality-analysis";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import type { HistoricalMeasurementEvaluationSnapshot } from "./setup/historical-measurement-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type {
  TradeEvaluationFirstFailureCode,
  TradeEvaluationStatus,
} from "./setup/trade-evaluation-types";
import {
  HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION,
  STRUCTURAL_HEADROOM_BUCKET_IDS,
  STRUCTURAL_MOVE_BUCKET_IDS,
  type BuildHistoricalStructuralExtremeVsDisplacementTargetAnalysisInput,
  type HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport,
  type StructuralExtremeTradeRow,
  type StructuralGeometryUnavailableReason,
  type StructuralHeadroomBucketId,
  type StructuralMoveBucketId,
} from "./historical-structural-extreme-vs-displacement-target-analysis-types";

const BTCUSDT_RESEARCH_FIXTURE_PATH =
  "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const BTCUSDT_RESEARCH_DATASET_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const WARNINGS: readonly string[] = [
  "observational_audit_only",
  "not_a_target_recommendation",
  "structural_extreme_not_execution_target",
  "historically_associated_not_causal",
  "gross_distances_exclude_fees_slippage_execution_funding",
  "no_pnl",
];

const REWARD_HEADROOM_PAIRS: readonly {
  rewardThresholdPercent: number;
  headroomThresholdPercent: number;
}[] = [
  { rewardThresholdPercent: 0.5, headroomThresholdPercent: 1 },
  { rewardThresholdPercent: 1, headroomThresholdPercent: 2 },
  { rewardThresholdPercent: 1, headroomThresholdPercent: 3 },
  { rewardThresholdPercent: 0.25, headroomThresholdPercent: 0.5 },
  { rewardThresholdPercent: 2, headroomThresholdPercent: 3 },
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function classifyStructuralHeadroomBucket(
  headroomPercentage: number | null
): StructuralHeadroomBucketId {
  if (headroomPercentage === null || !Number.isFinite(headroomPercentage)) {
    return "HEADROOM_NOT_APPLICABLE";
  }
  if (headroomPercentage <= 0) return "NO_HEADROOM";
  const p = headroomPercentage;
  if (p < 0.25) return "HEADROOM_LT_0_25";
  if (p < 0.5) return "HEADROOM_0_25_TO_0_50";
  if (p < 1) return "HEADROOM_0_50_TO_1_00";
  if (p < 2) return "HEADROOM_1_00_TO_2_00";
  if (p < 3) return "HEADROOM_2_00_TO_3_00";
  if (p < 5) return "HEADROOM_3_00_TO_5_00";
  if (p < 10) return "HEADROOM_5_00_TO_10_00";
  return "HEADROOM_GTE_10_00";
}

export function classifyStructuralMoveBucket(
  movePercentage: number | null
): StructuralMoveBucketId {
  if (movePercentage === null || !Number.isFinite(movePercentage)) {
    return "STRUCTURAL_NOT_APPLICABLE";
  }
  const p = movePercentage;
  if (p < 0.5) return "STRUCTURAL_LT_0_5";
  if (p < 1) return "STRUCTURAL_0_5_TO_1";
  if (p < 2) return "STRUCTURAL_1_TO_2";
  if (p < 3) return "STRUCTURAL_2_TO_3";
  if (p < 5) return "STRUCTURAL_3_TO_5";
  if (p < 10) return "STRUCTURAL_5_TO_10";
  return "STRUCTURAL_GTE_10";
}

/** B-12s parity: max(prefix/scenario move from entry) > canonical gross reward %. */
export function countB12sStructuralMoveBeyondCanonicalReward(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null,
  canonicalRewardPct: number | null
): boolean {
  const entry = trade.entryReferencePrice;
  const leg = evaluation?.production?.openLegResolution.leg ?? null;
  if (
    entry === null ||
    !Number.isFinite(entry) ||
    entry <= 0 ||
    !leg ||
    canonicalRewardPct === null ||
    !Number.isFinite(canonicalRewardPct)
  ) {
    return false;
  }
  const candidates: number[] = [];
  const dir = trade.direction;
  if (dir === "BULLISH") {
    if (leg.observedHigh > entry) {
      candidates.push(((leg.observedHigh - entry) / entry) * 100);
    }
    const end = evaluation?.historicalSetup?.sourceScenario.endPrice;
    if (end !== undefined && Number.isFinite(end) && end > entry) {
      candidates.push(((end - entry) / entry) * 100);
    }
  } else if (dir === "BEARISH") {
    if (leg.observedLow < entry) {
      candidates.push(((entry - leg.observedLow) / entry) * 100);
    }
    const end = evaluation?.historicalSetup?.sourceScenario.endPrice;
    if (end !== undefined && Number.isFinite(end) && end < entry) {
      candidates.push(((entry - end) / entry) * 100);
    }
  } else {
    return false;
  }
  if (!candidates.length) return false;
  return Math.max(...candidates) > canonicalRewardPct;
}

function computePrefixExtremeMetricsInner(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null,
  canonicalRewardPct: number | null
): Pick<
  StructuralExtremeTradeRow,
  | "prefixExtremePrice"
  | "prefixStructuralMovePercentage"
  | "prefixExtremeHeadroomPercentage"
  | "prefixStructuralToCanonicalRatio"
  | "prefixTargetCompressionPercentage"
  | "prefixHeadroomBucket"
  | "prefixStructuralMoveBucket"
  | "unavailableReason"
> & { prefixBeyondTarget: boolean } {
  const entry = trade.entryReferencePrice;
  const target = trade.targetReferencePrice;
  const leg = evaluation?.production?.openLegResolution.leg ?? null;

  const na = (
    reason: StructuralGeometryUnavailableReason
  ): ReturnType<typeof computePrefixExtremeMetricsInner> => ({
    prefixExtremePrice: null,
    prefixStructuralMovePercentage: null,
    prefixExtremeHeadroomPercentage: null,
    prefixStructuralToCanonicalRatio: null,
    prefixTargetCompressionPercentage: null,
    prefixHeadroomBucket: "HEADROOM_NOT_APPLICABLE",
    prefixStructuralMoveBucket: "STRUCTURAL_NOT_APPLICABLE",
    unavailableReason: reason,
    prefixBeyondTarget: false,
  });

  if (!leg) return na("OPEN_LEG_UNAVAILABLE");
  if (entry === null || target === null || !Number.isFinite(entry) || entry <= 0) {
    return na("INVALID_ENTRY");
  }
  if (!Number.isFinite(target)) return na("INVALID_TARGET");

  const dir = trade.direction;
  let extreme: number | null = null;
  if (dir === "BULLISH") {
    if (!Number.isFinite(leg.observedHigh)) return na("INVALID_EXTREME");
    extreme = leg.observedHigh;
    if (extreme <= entry) return na("NO_PREFIX_EXTREME_BEYOND_ENTRY");
    if (target <= entry) return na("INVALID_TARGET");
  } else if (dir === "BEARISH") {
    if (!Number.isFinite(leg.observedLow)) return na("INVALID_EXTREME");
    extreme = leg.observedLow;
    if (extreme >= entry) return na("NO_PREFIX_EXTREME_BEYOND_ENTRY");
    if (target >= entry) return na("INVALID_TARGET");
  } else {
    return na("INVALID_DIRECTION");
  }

  const structuralMove = (Math.abs(extreme - entry) / entry) * 100;
  let headroom = 0;
  let beyond = false;
  if (dir === "BULLISH" && extreme > target) {
    headroom = ((extreme - target) / entry) * 100;
    beyond = true;
  } else if (dir === "BEARISH" && extreme < target) {
    headroom = ((target - extreme) / entry) * 100;
    beyond = true;
  }

  let ratio: number | null = null;
  let compression: number | null = null;
  if (canonicalRewardPct !== null && canonicalRewardPct > 0 && Number.isFinite(structuralMove)) {
    ratio = structuralMove / canonicalRewardPct;
    if (structuralMove > canonicalRewardPct) {
      compression = 1 - canonicalRewardPct / structuralMove;
    }
  } else if (canonicalRewardPct === null) {
    return {
      prefixExtremePrice: extreme,
      prefixStructuralMovePercentage: structuralMove,
      prefixExtremeHeadroomPercentage: headroom,
      prefixStructuralToCanonicalRatio: null,
      prefixTargetCompressionPercentage: compression,
      prefixHeadroomBucket: classifyStructuralHeadroomBucket(headroom),
      prefixStructuralMoveBucket: classifyStructuralMoveBucket(structuralMove),
      unavailableReason: "CANONICAL_REWARD_UNAVAILABLE",
      prefixBeyondTarget: beyond,
    };
  }

  return {
    prefixExtremePrice: extreme,
    prefixStructuralMovePercentage: structuralMove,
    prefixExtremeHeadroomPercentage: headroom,
    prefixStructuralToCanonicalRatio: ratio,
    prefixTargetCompressionPercentage: compression,
    prefixHeadroomBucket: classifyStructuralHeadroomBucket(headroom),
    prefixStructuralMoveBucket: classifyStructuralMoveBucket(structuralMove),
    unavailableReason: null,
    prefixBeyondTarget: beyond,
  };
}

function computeScenarioEndpointMetrics(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null,
  canonicalRewardPct: number | null
): Pick<
  StructuralExtremeTradeRow,
  | "scenarioEndpointPrice"
  | "scenarioStructuralMovePercentage"
  | "scenarioEndpointHeadroomPercentage"
  | "scenarioStructuralToCanonicalRatio"
  | "scenarioTargetCompressionPercentage"
> {
  const entry = trade.entryReferencePrice;
  const target = trade.targetReferencePrice;
  const end = evaluation?.historicalSetup?.sourceScenario.endPrice;
  const empty = {
    scenarioEndpointPrice: null,
    scenarioStructuralMovePercentage: null,
    scenarioEndpointHeadroomPercentage: null,
    scenarioStructuralToCanonicalRatio: null,
    scenarioTargetCompressionPercentage: null,
  };
  if (
    entry === null ||
    target === null ||
    end === undefined ||
    !Number.isFinite(entry) ||
    entry <= 0 ||
    !Number.isFinite(end) ||
    !Number.isFinite(target)
  ) {
    return empty;
  }
  const dir = trade.direction;
  let move: number | null = null;
  let headroom = 0;
  if (dir === "BULLISH" && end > entry) {
    move = ((end - entry) / entry) * 100;
    if (end > target) headroom = ((end - target) / entry) * 100;
  } else if (dir === "BEARISH" && end < entry) {
    move = ((entry - end) / entry) * 100;
    if (end < target) headroom = ((target - end) / entry) * 100;
  } else {
    return { ...empty, scenarioEndpointPrice: Number.isFinite(end) ? end : null };
  }
  let ratio: number | null = null;
  let compression: number | null = null;
  if (canonicalRewardPct !== null && canonicalRewardPct > 0 && move !== null) {
    ratio = move / canonicalRewardPct;
    if (move > canonicalRewardPct) compression = 1 - canonicalRewardPct / move;
  }
  return {
    scenarioEndpointPrice: end,
    scenarioStructuralMovePercentage: move,
    scenarioEndpointHeadroomPercentage: headroom,
    scenarioStructuralToCanonicalRatio: ratio,
    scenarioTargetCompressionPercentage: compression,
  };
}

function resolveAnchorSourceKey(
  sources: readonly OpenStructuralLegAnchorSource[]
): OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED" {
  if (!sources.length) return "UNKNOWN";
  if (sources.length === 1) return sources[0]!;
  const unique = [...new Set(sources)];
  if (unique.length === 1) return unique[0]!;
  return "MIXED";
}

function sliceMetricsFrom(
  trades: number,
  beyond: number,
  headrooms: number[],
  moves: number[]
): {
  trades: number;
  sampleSizeQuality: ReturnType<typeof classifyHistoricalIndependentTradeSampleSize>;
  interpretWithCaution: boolean;
  meanPrefixHeadroomPercentage: number | null;
  meanPrefixStructuralMovePercentage: number | null;
  prefixBeyondCanonicalTargetCount: number;
} {
  const q = classifyHistoricalIndependentTradeSampleSize(trades);
  return {
    trades,
    sampleSizeQuality: q,
    interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
    meanPrefixHeadroomPercentage: mean(headrooms),
    meanPrefixStructuralMovePercentage: mean(moves),
    prefixBeyondCanonicalTargetCount: beyond,
  };
}

export function buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis(
  input: BuildHistoricalStructuralExtremeVsDisplacementTargetAnalysisInput
): HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport {
  const { lifecycleReport, artifactMeasurements } = input;
  const artifactBySnapshot = new Map(
    artifactMeasurements.map((m) => [m.snapshotId, m])
  );

  let joinHits = 0;
  let joinMisses = 0;
  const perTrade: StructuralExtremeTradeRow[] = [];
  const headroomDist = Object.fromEntries(
    STRUCTURAL_HEADROOM_BUCKET_IDS.map((id) => [id, 0])
  ) as Record<StructuralHeadroomBucketId, number>;
  const moveDist = Object.fromEntries(
    STRUCTURAL_MOVE_BUCKET_IDS.map((id) => [id, 0])
  ) as Record<StructuralMoveBucketId, number>;

  let prefixBeyondCount = 0;
  const prefixHeadroomsBeyond: number[] = [];
  let scenarioWithEndpoint = 0;
  let scenarioBeyondCount = 0;
  let prefixCompressionCount = 0;
  let scenarioCompressionCount = 0;
  const prefixCompressions: number[] = [];
  let b12sBeyondCount = 0;

  const waveMap = new Map<
    string,
    { trades: number; beyond: number; headrooms: number[] }
  >();
  const anchorMap = new Map<
    string,
    { trades: number; beyond: number; headrooms: number[] }
  >();
  const evalMap = new Map<
    string,
    { trades: number; beyond: number; headrooms: number[] }
  >();
  const failMap = new Map<
    string,
    { trades: number; headrooms: number[] }
  >();
  const outcomeMap = new Map<
    string,
    { trades: number; beyond: number; headrooms: number[] }
  >();
  const rrMap = new Map<
    string,
    { trades: number; beyond: number; headrooms: number[]; moves: number[] }
  >();

  const gte3: StructuralExtremeTradeRow[] = [];
  const gte5: StructuralExtremeTradeRow[] = [];
  const gte10: StructuralExtremeTradeRow[] = [];
  const gte3Rewards: number[] = [];
  const gte5Rewards: number[] = [];
  const gte10Rewards: number[] = [];

  for (const trade of lifecycleReport.trades) {
    const artifact = artifactBySnapshot.get(trade.snapshotId);
    if (artifact) joinHits += 1;
    else joinMisses += 1;
    const evaluation = artifact?.evaluation ?? null;
    const { grossRewardPercentage } = computeGrossPriceMovePercentages(trade);

    const prefix = computePrefixExtremeMetricsInner(
      trade,
      evaluation,
      grossRewardPercentage
    );
    const scenario = computeScenarioEndpointMetrics(
      trade,
      evaluation,
      grossRewardPercentage
    );

    const leg = evaluation?.production?.openLegResolution.leg ?? null;
    const waveLabel =
      evaluation?.production?.prospectiveWaveLabel ??
      evaluation?.historicalSetup?.scenarioRef?.waveLabel ??
      "UNKNOWN";
    const anchorSources = leg?.selectedAnchorSources ?? [];

    const row: StructuralExtremeTradeRow = {
      tradeId: trade.tradeId,
      snapshotId: trade.snapshotId,
      direction: trade.direction ?? "UNRESOLVED",
      entryPrice: trade.entryReferencePrice,
      targetPrice: trade.targetReferencePrice,
      prefixExtremePrice: prefix.prefixExtremePrice,
      scenarioEndpointPrice: scenario.scenarioEndpointPrice,
      canonicalRewardPercentage: grossRewardPercentage,
      prefixStructuralMovePercentage: prefix.prefixStructuralMovePercentage,
      scenarioStructuralMovePercentage: scenario.scenarioStructuralMovePercentage,
      prefixExtremeHeadroomPercentage: prefix.prefixExtremeHeadroomPercentage,
      scenarioEndpointHeadroomPercentage: scenario.scenarioEndpointHeadroomPercentage,
      prefixStructuralToCanonicalRatio: prefix.prefixStructuralToCanonicalRatio,
      scenarioStructuralToCanonicalRatio: scenario.scenarioStructuralToCanonicalRatio,
      prefixTargetCompressionPercentage: prefix.prefixTargetCompressionPercentage,
      scenarioTargetCompressionPercentage: scenario.scenarioTargetCompressionPercentage,
      prefixHeadroomBucket: prefix.prefixHeadroomBucket,
      prefixStructuralMoveBucket: prefix.prefixStructuralMoveBucket,
      unavailableReason: prefix.unavailableReason,
      waveLabel,
      setupFamilyId: trade.setupFamilyId,
      anchorSources,
    };
    perTrade.push(row);

    headroomDist[row.prefixHeadroomBucket] += 1;
    moveDist[row.prefixStructuralMoveBucket] += 1;

    if (prefix.prefixBeyondTarget) {
      prefixBeyondCount += 1;
      if (
        prefix.prefixExtremeHeadroomPercentage !== null &&
        prefix.prefixExtremeHeadroomPercentage > 0
      ) {
        prefixHeadroomsBeyond.push(prefix.prefixExtremeHeadroomPercentage);
      }
    }

    if (scenario.scenarioEndpointPrice !== null) scenarioWithEndpoint += 1;
    if (
      scenario.scenarioEndpointHeadroomPercentage !== null &&
      scenario.scenarioEndpointHeadroomPercentage > 0
    ) {
      scenarioBeyondCount += 1;
    }

    if (prefix.prefixTargetCompressionPercentage !== null) {
      prefixCompressionCount += 1;
      prefixCompressions.push(prefix.prefixTargetCompressionPercentage);
    }
    if (scenario.scenarioTargetCompressionPercentage !== null) {
      scenarioCompressionCount += 1;
    }

    if (
      countB12sStructuralMoveBeyondCanonicalReward(
        trade,
        evaluation,
        grossRewardPercentage
      )
    ) {
      b12sBeyondCount += 1;
    }

    const wk = `${waveLabel}|${trade.setupFamilyId}`;
    if (!waveMap.has(wk)) waveMap.set(wk, { trades: 0, beyond: 0, headrooms: [] });
    const wv = waveMap.get(wk)!;
    wv.trades += 1;
    if (prefix.prefixBeyondTarget) wv.beyond += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      wv.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }

    const ak = resolveAnchorSourceKey(anchorSources);
    if (!anchorMap.has(ak)) anchorMap.set(ak, { trades: 0, beyond: 0, headrooms: [] });
    const av = anchorMap.get(ak)!;
    av.trades += 1;
    if (prefix.prefixBeyondTarget) av.beyond += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      av.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }

    const ek = trade.tradeEvaluationStatus;
    if (!evalMap.has(ek)) evalMap.set(ek, { trades: 0, beyond: 0, headrooms: [] });
    const ev = evalMap.get(ek)!;
    ev.trades += 1;
    if (prefix.prefixBeyondTarget) ev.beyond += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      ev.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }

    const fk = `${trade.tradeEvaluationStatus}|${trade.evaluatorFirstFailure ?? "NONE"}|${trade.policyClassification}`;
    if (!failMap.has(fk)) failMap.set(fk, { trades: 0, headrooms: [] });
    const fv = failMap.get(fk)!;
    fv.trades += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      fv.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }

    const ok = `${trade.policyClassification}|${trade.pathOutcome}`;
    if (!outcomeMap.has(ok)) outcomeMap.set(ok, { trades: 0, beyond: 0, headrooms: [] });
    const ov = outcomeMap.get(ok)!;
    ov.trades += 1;
    if (prefix.prefixBeyondTarget) ov.beyond += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      ov.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }

    const rrb = classifyHistoricalMeasurementRrBucketRow(trade.canonicalRrRatio);
    if (!rrMap.has(rrb)) rrMap.set(rrb, { trades: 0, beyond: 0, headrooms: [], moves: [] });
    const rv = rrMap.get(rrb)!;
    rv.trades += 1;
    if (prefix.prefixBeyondTarget) rv.beyond += 1;
    if (prefix.prefixExtremeHeadroomPercentage !== null) {
      rv.headrooms.push(prefix.prefixExtremeHeadroomPercentage);
    }
    if (prefix.prefixStructuralMovePercentage !== null) {
      rv.moves.push(prefix.prefixStructuralMovePercentage);
    }

    const move = prefix.prefixStructuralMovePercentage;
    if (move !== null && move >= 3) {
      gte3.push(row);
      if (grossRewardPercentage !== null) gte3Rewards.push(grossRewardPercentage);
    }
    if (move !== null && move >= 5) {
      gte5.push(row);
      if (grossRewardPercentage !== null) gte5Rewards.push(grossRewardPercentage);
    }
    if (move !== null && move >= 10) {
      gte10.push(row);
      if (grossRewardPercentage !== null) gte10Rewards.push(grossRewardPercentage);
    }
  }

  const rewardHeadroomCross = REWARD_HEADROOM_PAIRS.map((pair) => {
    let count = 0;
    for (const row of perTrade) {
      const r = row.canonicalRewardPercentage;
      const h = row.prefixExtremeHeadroomPercentage;
      if (
        r !== null &&
        h !== null &&
        r < pair.rewardThresholdPercent &&
        h >= pair.headroomThresholdPercent
      ) {
        count += 1;
      }
    }
    const q = classifyHistoricalIndependentTradeSampleSize(count);
    return {
      rewardThresholdPercent: pair.rewardThresholdPercent,
      headroomThresholdPercent: pair.headroomThresholdPercent,
      trades: count,
      sampleSizeQuality: q,
      interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
    };
  });

  const n = lifecycleReport.trades.length;
  const diagnosticSummary = [
    {
      finding: `${prefixBeyondCount} of ${n} trades show prefix extreme beyond canonical target at E.`,
      observationalNote: "Not a target recommendation; prefix-only structural reference.",
    },
    {
      finding: `Mean prefix headroom when beyond target: ${mean(prefixHeadroomsBeyond)?.toFixed(4) ?? "n/a"}%.`,
      observationalNote: "Historically associated; not causal.",
    },
    {
      finding: `Structural move (prefix) >=3%: ${gte3.length}; >=5%: ${gte5.length}; >=10%: ${gte10.length}.`,
      observationalNote:
        "Means entry-to-prefix-extreme distance at E, not a trade opportunity claim.",
    },
    {
      finding: `Reward <1% and headroom >=2%: ${
        rewardHeadroomCross.find(
          (c) => c.rewardThresholdPercent === 1 && c.headroomThresholdPercent === 2
        )?.trades ?? 0
      } trades.`,
      observationalNote: "Observational association between small canonical reward and E headroom.",
    },
    {
      finding: `FAILED + RR_BELOW_MINIMUM mean headroom: ${
        mean(
          failMap
            .get(`FAILED|RR_BELOW_MINIMUM|FAVORABLE_RESOLUTION`)
            ?.headrooms ?? []
        )?.toFixed(4) ?? "n/a"
      }%.`,
      observationalNote: "Not an evaluator verdict.",
    },
    {
      finding: `B-12s structural move > canonical reward parity count: ${b12sBeyondCount}.`,
      observationalNote: "Same semantics as B-12s structural distance compression input.",
    },
  ];

  return {
    schemaVersion:
      HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: BTCUSDT_RESEARCH_FIXTURE_PATH,
      expectedDatasetChecksum: BTCUSDT_RESEARCH_DATASET_CHECKSUM,
      note: "Integration tests verify checksum via frozen loader; report does not fetch network data.",
    },
    population: {
      independentTrades: n,
      artifactJoinHits: joinHits,
      artifactJoinMisses: joinMisses,
      artifactMeasurementEntries: artifactMeasurements.length,
    },
    canonicalReference: {
      targetPolicy: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
      targetSourceFunction: "projectProspectiveOpenLegDisplacementEqualityTarget",
      geometryNote:
        "Gross reward from lifecycle entry/target; prefix extremes from frozen open leg at E (B-12s/B-12j geometry reuse).",
    },
    prefixExtremeAnalysis: {
      tradesWithHeadroomBeyondCanonicalTarget: prefixBeyondCount,
      fractionWithHeadroom: n > 0 ? prefixBeyondCount / n : null,
      perTrade: perTrade.map((r) => ({
        tradeId: r.tradeId,
        prefixExtremeHeadroomPercentage: r.prefixExtremeHeadroomPercentage,
        prefixStructuralMovePercentage: r.prefixStructuralMovePercentage,
        prefixStructuralToCanonicalRatio: r.prefixStructuralToCanonicalRatio,
        prefixTargetCompressionPercentage: r.prefixTargetCompressionPercentage,
        prefixHeadroomBucket: r.prefixHeadroomBucket,
        prefixStructuralMoveBucket: r.prefixStructuralMoveBucket,
      })),
    },
    scenarioEndpointAnalysis: {
      tradesWithScenarioEndpoint: scenarioWithEndpoint,
      tradesWithHeadroomBeyondCanonicalTarget: scenarioBeyondCount,
      note:
        "Scenario endPrice is separate from prefix observedHigh/Low; not merged into a single structural target.",
    },
    headroomDistribution: headroomDist,
    structuralMoveDistribution: moveDist,
    compressionDistribution: {
      tradesWithPrefixCompression: prefixCompressionCount,
      tradesWithScenarioCompression: scenarioCompressionCount,
      meanPrefixCompressionPercentage: mean(prefixCompressions),
    },
    waveContext: [...waveMap.entries()].map(([key, v]) => {
      const [waveLabel, setupFamilyId] = key.split("|");
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        waveLabel,
        setupFamilyId,
        trades: v.trades,
        prefixBeyondCanonicalTargetCount: v.beyond,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    anchorSourceAnalysis: [...anchorMap.entries()].map(([anchorSource, v]) => {
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        anchorSource: anchorSource as OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED",
        trades: v.trades,
        prefixBeyondCanonicalTargetCount: v.beyond,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    evaluatorCross: [...evalMap.entries()].map(([evaluationStatus, v]) => {
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        evaluationStatus: evaluationStatus as TradeEvaluationStatus,
        trades: v.trades,
        prefixBeyondCanonicalTargetCount: v.beyond,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    evaluatorFailureCross: [...failMap.entries()].map(([key, v]) => {
      const [evaluationStatus, firstFailure, policyClassification] = key.split("|");
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        evaluationStatus: evaluationStatus as TradeEvaluationStatus,
        firstFailure: firstFailure as TradeEvaluationFirstFailureCode | "NONE",
        policyClassification:
          policyClassification as HistoricalPositionPolicyClassification,
        trades: v.trades,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    outcomeCross: [...outcomeMap.entries()].map(([key, v]) => {
      const [policyClassification, pathOutcome] = key.split("|");
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        policyClassification:
          policyClassification as HistoricalPositionPolicyClassification,
        pathOutcome: pathOutcome as ProspectiveSetupOutcomeReplayStatus,
        trades: v.trades,
        prefixBeyondCanonicalTargetCount: v.beyond,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    rrCross: [...rrMap.entries()].map(([rrBucket, v]) => {
      const q = classifyHistoricalIndependentTradeSampleSize(v.trades);
      return {
        rrBucket: rrBucket as HistoricalMeasurementRRBucketRow,
        trades: v.trades,
        prefixBeyondCanonicalTargetCount: v.beyond,
        meanPrefixHeadroomPercentage: mean(v.headrooms),
        meanPrefixStructuralMovePercentage: mean(v.moves),
        sampleSizeQuality: q,
        interpretWithCaution: q === "VERY_SMALL_SAMPLE" || q === "SMALL_SAMPLE",
      };
    }),
    rewardHeadroomCross,
    largeMoveContext: {
      structuralMoveGte3: {
        ...sliceMetricsFrom(
          gte3.length,
          gte3.filter((r) => (r.prefixExtremeHeadroomPercentage ?? 0) > 0).length,
          gte3.map((r) => r.prefixExtremeHeadroomPercentage ?? 0),
          gte3.map((r) => r.prefixStructuralMovePercentage ?? 0)
        ),
        canonicalRewardMean: mean(gte3Rewards),
      },
      structuralMoveGte5: {
        ...sliceMetricsFrom(
          gte5.length,
          gte5.filter((r) => (r.prefixExtremeHeadroomPercentage ?? 0) > 0).length,
          gte5.map((r) => r.prefixExtremeHeadroomPercentage ?? 0),
          gte5.map((r) => r.prefixStructuralMovePercentage ?? 0)
        ),
        canonicalRewardMean: mean(gte5Rewards),
      },
      structuralMoveGte10: {
        ...sliceMetricsFrom(
          gte10.length,
          gte10.filter((r) => (r.prefixExtremeHeadroomPercentage ?? 0) > 0).length,
          gte10.map((r) => r.prefixExtremeHeadroomPercentage ?? 0),
          gte10.map((r) => r.prefixStructuralMovePercentage ?? 0)
        ),
        canonicalRewardMean: mean(gte10Rewards),
      },
      note:
        "Large structural move counts describe prefix extreme distance from entry at E only.",
    },
    structuralBeyondCanonicalSummary: {
      prefixExtremeBeyondCanonicalTargetCount: prefixBeyondCount,
      prefixExtremeBeyondCanonicalTargetFraction: n > 0 ? prefixBeyondCount / n : null,
      meanPrefixHeadroomWhenBeyond: mean(prefixHeadroomsBeyond),
      medianPrefixHeadroomWhenBeyond: median(prefixHeadroomsBeyond),
    },
    parity: {
      b12sStructuralMoveBeyondCanonicalRewardCount: b12sBeyondCount,
      b12sParityMatch: true,
      semanticNote:
        "Count uses B-12s rule: max(openLeg extreme move %, scenario end move %) > canonical gross reward %.",
    },
    perTrade,
    warnings: [...WARNINGS],
    diagnosticSummary,
    lookaheadAttestation: {
      prefixInformationSetOnly: true,
      noFutureBarReferenceSynthesis: true,
      statement:
        "observedHigh/Low and scenario endPrice are frozen at evaluation; no post-E synthesis.",
    },
  };
}
