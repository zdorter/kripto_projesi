import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { CounterfactualReachabilityRow } from "./historical-alternative-target-reachability-replay-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import {
  classifyContextHeadroomBucket,
  classifyDisplacementContextBucket,
  resolveDurationBucket,
} from "./historical-target-distance-structural-context-analysis";
import type { ContextHeadroomBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import {
  HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION,
  TARGET_DISTANCE_BAND_IDS,
  type AnchorSourceDimension,
  type BalanceAnalysisRow,
  type BalanceTradeExample,
  type BuildHistoricalTargetDistanceReachabilityCostBalanceAnalysisInput,
  type CostSensitivityCell,
  type HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport,
  type TargetDistanceBandBalanceRow,
  type TargetDistanceBandId,
} from "./historical-target-distance-reachability-cost-balance-analysis-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const CANONICAL_MODEL = "CANONICAL_DISPLACEMENT_EQUALITY" as const;
const COST_EPS = 1e-9;
const COST_LEVELS = [0.1, 0.2, 0.3, 0.5] as const;

const WARNINGS: readonly string[] = [
  "observational_balance_research_only",
  "no_target_optimization",
  "reach_rate_not_cost_coverage",
  "theoretical_r_not_pnl",
  "theoretical_r_not_prospective_rr",
  "mfe_not_target_touch",
];

export function targetBandToRewardBucket(
  band: TargetDistanceBandId
): PriceMoveRewardBucketId {
  const map: Record<TargetDistanceBandId, PriceMoveRewardBucketId> = {
    TARGET_LT_0_10: "REWARD_LT_0_10",
    TARGET_0_10_TO_0_25: "REWARD_0_10_TO_0_25",
    TARGET_0_25_TO_0_50: "REWARD_0_25_TO_0_50",
    TARGET_0_50_TO_1_00: "REWARD_0_50_TO_1_00",
    TARGET_1_00_TO_2_00: "REWARD_1_00_TO_2_00",
    TARGET_2_00_TO_3_00: "REWARD_2_00_TO_3_00",
    TARGET_GTE_3_00: "REWARD_GTE_3_00",
  };
  return map[band];
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
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  displacementPercentage: number | null;
  structuralMovePercentage: number | null;
  headroomPercentage: number | null;
  anchorSource: AnchorSourceDimension;
  waveContext: string;
  durationBucket: IndependentTradeDurationBucketId | "UNKNOWN";
  targetBand: TargetDistanceBandId;
  rewardBucket: PriceMoveRewardBucketId;
  headroomBucket: ContextHeadroomBucketId;
  displacementBucket: ReturnType<typeof classifyDisplacementContextBucket>;
  replay: CounterfactualReachabilityRow;
  theoreticalR: number | null;
  theoreticalREligible: boolean;
  decisive: boolean;
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

function isDecisive(policy: string): boolean {
  return policy === "FAVORABLE_RESOLUTION" || policy === "ADVERSE_RESOLUTION";
}

function costCovered(gross: number | null, cost: number): boolean {
  return gross !== null && Number.isFinite(gross) && gross > cost + COST_EPS;
}

function aggregateR(rows: EnrichedTrade[]) {
  const decisive = rows.filter((r) => r.decisive);
  const eligible = decisive.filter((r) => r.theoreticalREligible && r.theoreticalR !== null);
  const rs = eligible.map((r) => r.theoreticalR!);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const sumR = rs.reduce((a, b) => a + b, 0);
  const sumWin = wins.reduce((a, b) => a + b, 0);
  const sumLoss = losses.reduce((a, b) => a + b, 0);
  return {
    theoreticalREligibleDecisive: eligible.length,
    sumR,
    expectancyR: eligible.length ? sumR / eligible.length : null,
    avgWinR: wins.length ? sumWin / wins.length : null,
    avgLossR: losses.length ? sumLoss / losses.length : null,
    profitFactorR:
      losses.length && sumLoss < 0 ? sumWin / Math.abs(sumLoss) : wins.length ? null : null,
  };
}

function buildBandRow(
  band: TargetDistanceBandId,
  rows: EnrichedTrade[]
): TargetDistanceBandBalanceRow {
  const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent));
  const reached = classifiable.filter((r) => r.replay.replayEvent === "TARGET_REACHED");
  const bars = reached
    .map((r) => r.replay.barsToTarget)
    .filter((b): b is number => b !== null && Number.isFinite(b));
  const mfes = classifiable
    .map((r) => r.replay.mfePercentage)
    .filter((m): m is number => m !== null && Number.isFinite(m));
  const grossReached = reached
    .map((r) => r.replay.grossTargetMovePercentage)
    .filter((g): g is number => g !== null && Number.isFinite(g));
  const netReached = grossReached.map((g) => g - 0.2);

  const coverage = (cost: number) => {
    const c = reached.filter((r) => costCovered(r.replay.grossTargetMovePercentage, cost)).length;
    return reached.length ? c / reached.length : null;
  };

  const mfeRatios = classifiable
    .map((r) => {
      const g = r.rewardPercentage;
      const m = r.replay.mfePercentage;
      if (g === null || m === null || g <= 0) return null;
      return m / g;
    })
    .filter((x): x is number => x !== null && Number.isFinite(x));

  const rAgg = aggregateR(rows);
  const quality = classifyHistoricalIndependentTradeSampleSize(rows.length);
  const classifiableN = classifiable.length;
  const reachedN = reached.length;

  return {
    targetDistanceBand: band,
    b12rRewardBucket: targetBandToRewardBucket(band),
    trades: rows.length,
    classifiable: classifiableN,
    notReplayable: rows.length - classifiableN,
    targetReached: reachedN,
    targetReachRate: classifiableN > 0 ? reachedN / classifiableN : null,
    reachRateWilson95: computeIndependentTradeWinRateConfidenceInterval(
      reachedN,
      classifiableN - reachedN,
      0.95
    ),
    targetBeforeInvalidation: classifiable.filter((r) => r.replay.targetBeforeInvalidation).length,
    invalidationFirst: classifiable.filter((r) => r.replay.replayEvent === "INVALIDATION_REACHED")
      .length,
    ambiguous: classifiable.filter((r) => r.replay.replayEvent === "AMBIGUOUS_SAME_BAR").length,
    noTouch: classifiable.filter(
      (r) => r.replay.replayEvent === "NOT_REACHED_WITHIN_HORIZON"
    ).length,
    unresolved: classifiable.filter((r) => r.replay.replayEvent === "INSUFFICIENT_FUTURE").length,
    medianBarsToTarget: median(bars),
    p25BarsToTarget: percentile(bars, 25),
    p75BarsToTarget: percentile(bars, 75),
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    mfeToTargetRatio: mean(mfeRatios),
    mfeGteTargetCount: classifiable.filter((r) => {
      const g = r.rewardPercentage;
      const m = r.replay.mfePercentage;
      return g !== null && m !== null && m >= g - COST_EPS;
    }).length,
    costCoverageAt0_10: coverage(0.1),
    costCoverageAt0_20: coverage(0.2),
    costCoverageAt0_30: coverage(0.3),
    costCoverageAt0_50: coverage(0.5),
    meanGrossMarginOnReached: mean(grossReached),
    medianGrossMarginOnReached: median(grossReached),
    meanNetMarginOnReachedAt0_20: mean(netReached),
    medianNetMarginOnReachedAt0_20: median(netReached),
    ...rAgg,
    sampleSizeQuality: quality,
    interpretWithCaution: quality !== "LARGE_SAMPLE",
  };
}

export function buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis(
  input: BuildHistoricalTargetDistanceReachabilityCostBalanceAnalysisInput
): HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport {
  const {
    lifecycleReport,
    reachabilityReplayReport,
    costAwareCounterfactualAnalysisReport: b12x,
    eligibilityAuditReport,
    displacementEqualityTargetMechanicsAnalysisReport,
    structuralExtremeVsDisplacementTargetAnalysisReport,
    alternativeTargetModelAnalysisReport,
  } = input;

  for (const c of COST_LEVELS) {
    if (!b12x.costScenarios.some((s) => Math.abs(s - c) <= COST_EPS)) {
      throw new Error(`B-12x must include cost scenario ${c}% for B-12z`);
    }
  }

  const replayByTrade = new Map<string, CounterfactualReachabilityRow>();
  for (const row of reachabilityReplayReport.perTrade) {
    if (row.modelId === CANONICAL_MODEL) replayByTrade.set(row.tradeId, row);
  }

  const auditByTrade = new Map(
    eligibilityAuditReport.decisiveRows.map((r) => [r.tradeId, r])
  );
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
    const audit = auditByTrade.get(t.tradeId);
    const reward = replay.grossTargetMovePercentage ?? disp?.rewardPercentage ?? null;
    const rewardBucket = classifyPriceMoveRewardBucket(reward);
    const targetBand = TARGET_DISTANCE_BAND_IDS.find(
      (b) => targetBandToRewardBucket(b) === rewardBucket
    );
    if (!targetBand) continue;

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
      rewardPercentage: reward,
      riskPercentage: disp?.riskPercentage ?? null,
      canonicalRrRatio: t.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null,
      displacementPercentage: disp?.displacementPercentage ?? null,
      structuralMovePercentage: struct?.prefixStructuralMovePercentage ?? null,
      headroomPercentage: struct?.prefixExtremeHeadroomPercentage ?? null,
      anchorSource: resolveAnchorKey(
        (disp?.anchorSources as OpenStructuralLegAnchorSource[] | undefined) ??
          alt?.anchorSources
      ),
      waveContext: alt?.waveLabel ?? struct?.waveLabel ?? "UNKNOWN",
      durationBucket: resolveDurationBucket(t.lifecycleDurationBars) ?? "UNKNOWN",
      targetBand,
      rewardBucket,
      headroomBucket: classifyContextHeadroomBucket(struct?.prefixExtremeHeadroomPercentage ?? null),
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      replay,
      theoreticalR: audit?.theoreticalR ?? null,
      theoreticalREligible: audit?.theoreticalREligible ?? false,
      decisive: isDecisive(t.policyClassification),
    });
  }

  const classifiableCount = enriched.filter((r) => isClassifiable(r.replay.replayEvent)).length;

  const targetDistanceBalanceTable = TARGET_DISTANCE_BAND_IDS.map((band) =>
    buildBandRow(band, enriched.filter((r) => r.targetBand === band))
  );

  const reachRates = targetDistanceBalanceTable
    .map((r) => r.targetReachRate)
    .filter((x): x is number => x !== null);
  let monotonic:
    | "MONOTONIC_DECREASING"
    | "NOT_MONOTONIC"
    | "INSUFFICIENT_BANDS" = "INSUFFICIENT_BANDS";
  if (reachRates.length >= 3) {
    let decreasing = true;
    for (let i = 1; i < reachRates.length; i++) {
      if (reachRates[i]! > reachRates[i - 1]! + 1e-9) decreasing = false;
    }
    monotonic = decreasing ? "MONOTONIC_DECREASING" : "NOT_MONOTONIC";
  }

  const costSensitivityMatrix = TARGET_DISTANCE_BAND_IDS.map((band) => {
    const rows = enriched.filter((r) => r.targetBand === band);
    const cells: CostSensitivityCell[] = COST_LEVELS.map((cost) => {
      const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent));
      const reached = classifiable.filter((r) => r.replay.replayEvent === "TARGET_REACHED");
      const covered = reached.filter((r) =>
        costCovered(r.replay.grossTargetMovePercentage, cost)
      ).length;
      const gross = reached
        .map((r) => r.replay.grossTargetMovePercentage)
        .filter((g): g is number => g !== null);
      return {
        roundTripCostPercentage: cost,
        reached: reached.length,
        costCovered: covered,
        coverageRate: reached.length ? covered / reached.length : null,
        meanNetMargin: mean(gross.map((g) => g - cost)),
      };
    });
    return { targetDistanceBand: band, cells };
  });

  const mfeAnalysis = TARGET_DISTANCE_BAND_IDS.map((band) => {
    const row = targetDistanceBalanceTable.find((r) => r.targetDistanceBand === band)!;
    const rows = enriched.filter((r) => r.targetBand === band);
    const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent));
    const mfeGteNotReached = classifiable.filter((r) => {
      const g = r.rewardPercentage;
      const m = r.replay.mfePercentage;
      return (
        r.replay.replayEvent !== "TARGET_REACHED" &&
        g !== null &&
        m !== null &&
        m >= g - COST_EPS
      );
    }).length;
    return {
      targetDistanceBand: band,
      meanMfe: row.meanMfe,
      medianMfe: row.medianMfe,
      mfeToTargetRatio: row.mfeToTargetRatio,
      mfeGteTargetRate: classifiable.length ? row.mfeGteTargetCount / classifiable.length : null,
      mfeGteTargetButNotReached: mfeGteNotReached,
      note:
        "MFE uses B-12w replay favorable excursion; TARGET_REACHED uses touch semantics — divergence is possible.",
    };
  });

  const targetDistanceByHeadroom: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["targetDistanceByHeadroom"][number][] =
    [];
  for (const band of TARGET_DISTANCE_BAND_IDS) {
    const bandRows = enriched.filter((r) => r.targetBand === band);
    const headrooms = new Set(bandRows.map((r) => r.headroomBucket));
    for (const hb of headrooms) {
      const rows = bandRows.filter((r) => r.headroomBucket === hb);
      const slice = buildBandRow(band, rows);
      targetDistanceByHeadroom.push({
        targetDistanceBand: band,
        headroomBucket: hb,
        trades: rows.length,
        targetReachRate: slice.targetReachRate,
        medianBarsToTarget: slice.medianBarsToTarget,
        meanMfe: slice.meanMfe,
        costCoverageRateAt0_20: slice.costCoverageAt0_20,
        sampleSizeQuality: slice.sampleSizeQuality,
        interpretWithCaution: slice.interpretWithCaution,
      });
    }
  }

  const targetDistanceByDisplacement: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["targetDistanceByDisplacement"][number][] =
    [];
  for (const band of TARGET_DISTANCE_BAND_IDS) {
    const bandRows = enriched.filter((r) => r.targetBand === band);
    const disps = new Set(bandRows.map((r) => r.displacementBucket));
    for (const db of disps) {
      const rows = bandRows.filter((r) => r.displacementBucket === db);
      const slice = buildBandRow(band, rows);
      targetDistanceByDisplacement.push({
        targetDistanceBand: band,
        displacementBucket: db,
        trades: rows.length,
        targetReachRate: slice.targetReachRate,
        sampleSizeQuality: slice.sampleSizeQuality,
      });
    }
  }

  const anchorSources = new Set(enriched.map((r) => r.anchorSource));
  const anchorByTargetBand: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["anchorByTargetBand"][number][] =
    [];
  for (const anchorSource of anchorSources) {
    for (const band of TARGET_DISTANCE_BAND_IDS) {
      const rows = enriched.filter(
        (r) => r.anchorSource === anchorSource && r.targetBand === band
      );
      if (!rows.length) continue;
      anchorByTargetBand.push({
        anchorSource,
        targetDistanceBand: band,
        trades: rows.length,
        targetReachRate: buildBandRow(band, rows).targetReachRate,
      });
    }
  }
  const anchorSourceCoverageNote =
    anchorSources.size === 1 && anchorSources.has("MIXED")
      ? "Frozen cohort reports only MIXED anchor source labels; finer anchor splits are not populated."
      : `Observed anchor sources: ${[...anchorSources].join(", ")}`;

  const waveByTargetBand: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["waveByTargetBand"][number][] =
    [];
  const waves = new Set(enriched.map((r) => r.waveContext));
  for (const waveLabel of waves) {
    for (const band of TARGET_DISTANCE_BAND_IDS) {
      const rows = enriched.filter((r) => r.waveContext === waveLabel && r.targetBand === band);
      if (!rows.length) continue;
      const slice = buildBandRow(band, rows);
      waveByTargetBand.push({
        waveLabel,
        targetDistanceBand: band,
        trades: rows.length,
        targetReachRate: slice.targetReachRate,
        interpretWithCaution: slice.interpretWithCaution,
      });
    }
  }

  const setupFamilyByTargetBand: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["setupFamilyByTargetBand"][number][] =
    [];
  const families = new Set(enriched.map((r) => r.setupFamilyId));
  for (const setupFamilyId of families) {
    for (const band of TARGET_DISTANCE_BAND_IDS) {
      const rows = enriched.filter(
        (r) => r.setupFamilyId === setupFamilyId && r.targetBand === band
      );
      if (!rows.length) continue;
      const slice = buildBandRow(band, rows);
      setupFamilyByTargetBand.push({
        setupFamilyId,
        targetDistanceBand: band,
        trades: rows.length,
        targetReachRate: slice.targetReachRate,
        interpretWithCaution: slice.interpretWithCaution,
      });
    }
  }

  const evaluatorByTargetBand: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["evaluatorByTargetBand"][number][] =
    [];
  for (const band of TARGET_DISTANCE_BAND_IDS) {
    const bandRows = enriched.filter((r) => r.targetBand === band);
    const statuses = new Set(bandRows.map((r) => r.evaluatorStatus));
    for (const evaluationStatus of statuses) {
      const rows = bandRows.filter((r) => r.evaluatorStatus === evaluationStatus);
      const reached = rows.filter(
        (r) =>
          isClassifiable(r.replay.replayEvent) && r.replay.replayEvent === "TARGET_REACHED"
      ).length;
      const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent)).length;
      evaluatorByTargetBand.push({
        evaluationStatus,
        failureReason: null,
        targetDistanceBand: band,
        trades: rows.length,
        targetReached: reached,
        targetReachRate: classifiable > 0 ? reached / classifiable : null,
      });
      const rrBelow = rows.filter((r) => r.failureReason === "RR_BELOW_MINIMUM");
      if (rrBelow.length) {
        const r2 = rrBelow.filter(
          (r) =>
            isClassifiable(r.replay.replayEvent) && r.replay.replayEvent === "TARGET_REACHED"
        ).length;
        const c2 = rrBelow.filter((r) => isClassifiable(r.replay.replayEvent)).length;
        evaluatorByTargetBand.push({
          evaluationStatus: "FAILED",
          failureReason: "RR_BELOW_MINIMUM",
          targetDistanceBand: band,
          trades: rrBelow.length,
          targetReached: r2,
          targetReachRate: c2 > 0 ? r2 / c2 : null,
        });
      }
    }
  }

  const pathByTargetBand: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["pathByTargetBand"][number][] =
    [];
  for (const band of TARGET_DISTANCE_BAND_IDS) {
    const bandRows = enriched.filter((r) => r.targetBand === band);
    const paths = new Set(bandRows.map((r) => r.pathOutcome));
    for (const pathOutcome of paths) {
      pathByTargetBand.push({
        pathOutcome,
        targetDistanceBand: band,
        trades: bandRows.filter((r) => r.pathOutcome === pathOutcome).length,
      });
    }
  }

  const theoreticalRByBand = targetDistanceBalanceTable.map((row) => ({
    targetDistanceBand: row.targetDistanceBand,
    rEligibleDecisive: row.theoreticalREligibleDecisive,
    sumR: row.sumR,
    expectancyR: row.expectancyR,
    avgWinR: row.avgWinR,
    avgLossR: row.avgLossR,
    profitFactorR: row.profitFactorR,
    note: "Frozen B-12h theoretical R on decisive trades; not prospective RR or gross move.",
  }));

  const balanceAnalysis: BalanceAnalysisRow[] = targetDistanceBalanceTable.map((row) => {
    const parts: string[] = [];
    if ((row.targetReachRate ?? 0) > 0.5 && (row.costCoverageAt0_20 ?? 0) < 0.5) {
      parts.push("observed higher reach with lower cost coverage on reached touches");
    }
    if ((row.targetReachRate ?? 0) < 0.25 && (row.costCoverageAt0_20 ?? 0) > 0.8) {
      parts.push("observed lower reach with higher cost coverage among reached touches");
    }
    return {
      targetDistanceBand: row.targetDistanceBand,
      reachRate: row.targetReachRate,
      costCoverageRateAt0_20: row.costCoverageAt0_20,
      medianBarsToTarget: row.medianBarsToTarget,
      mfeToTargetRatio: row.mfeToTargetRatio,
      expectancyR: row.expectancyR,
      profitFactorR: row.profitFactorR,
      sampleSizeQuality: row.sampleSizeQuality,
      descriptiveTradeoffNote: parts.length
        ? parts.join("; ")
        : "No descriptive trade-off flag for this band on frozen run.",
    };
  });

  const thresholdAggregateViews = [
    { label: "<0.25%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 0.25 },
    { label: "<0.50%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 0.5 },
    { label: "<1.00%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 1 },
    { label: "<2.00%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 2 },
    { label: ">=1.00%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) >= 1 },
    { label: ">=2.00%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) >= 2 },
    { label: ">=3.00%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) >= 3 },
  ].map(({ label, pred }) => {
    const rows = enriched.filter(pred);
    const slice = buildBandRow("TARGET_GTE_3_00", rows);
    return {
      thresholdLabel: label,
      trades: rows.length,
      targetReachRate: slice.targetReachRate,
      costCoverageRateAt0_20: slice.costCoverageAt0_20,
    };
  });

  const largeThresholds = [1, 2, 3, 5, 10];
  const b12wLarge = reachabilityReplayReport.largeTargetAnalysis.filter(
    (x) => x.modelId === CANONICAL_MODEL
  );
  const largeTargetAnalysis = largeThresholds.map((threshold) => {
    const rows = enriched.filter(
      (r) => r.rewardPercentage !== null && r.rewardPercentage >= threshold
    );
    const slice = buildBandRow("TARGET_GTE_3_00", rows);
    const b12wRow = b12wLarge.find((x) => x.rewardThresholdPercent === threshold);
    const parity =
      b12wRow !== undefined && b12wRow.targetReached === slice.targetReached;
    return {
      rewardThresholdPercent: threshold,
      trades: rows.length,
      targetReached: slice.targetReached,
      targetReachRate: slice.targetReachRate,
      medianBarsToTarget: slice.medianBarsToTarget,
      meanMfe: slice.meanMfe,
      costCoverageRateAt0_20: slice.costCoverageAt0_20,
      b12wReachParity: parity,
      sampleSizeQuality: slice.sampleSizeQuality,
      interpretWithCaution: slice.interpretWithCaution,
    };
  });

  const smallThresholds = [
    { label: "<0.10%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 0.1 },
    { label: "<0.25%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 0.25 },
    { label: "<0.50%", pred: (r: EnrichedTrade) => (r.rewardPercentage ?? 0) < 0.5 },
  ];
  const smallTargetAnalysis = smallThresholds.map(({ label, pred }) => {
    const rows = enriched.filter(pred);
    const slice = buildBandRow("TARGET_LT_0_10", rows);
    const rAgg = aggregateR(rows);
    return {
      thresholdLabel: label,
      trades: rows.length,
      targetReachRate: slice.targetReachRate,
      costCoverageRateAt0_20: slice.costCoverageAt0_20,
      meanNetMarginOnReachedAt0_20: slice.meanNetMarginOnReachedAt0_20,
      expectancyR: rAgg.expectancyR,
      sampleSizeQuality: slice.sampleSizeQuality,
    };
  });

  const failedFav = enriched.filter(
    (r) =>
      r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdv = enriched.filter(
    (r) =>
      r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const failedFavorableByBand = TARGET_DISTANCE_BAND_IDS.map((band) => {
    const rows = failedFav.filter((r) => r.targetBand === band);
    const slice = buildBandRow(band, rows);
    return {
      targetDistanceBand: band,
      trades: rows.length,
      targetReached: slice.targetReached,
      costCoverageRateAt0_20: slice.costCoverageAt0_20,
      meanHeadroom: mean(
        rows.map((r) => r.headroomPercentage).filter((h): h is number => h !== null)
      ),
      meanDisplacement: mean(
        rows
          .map((r) => r.displacementPercentage)
          .filter((d): d is number => d !== null)
          .map(Math.abs)
      ),
    };
  });

  const passedAdverseByBand = TARGET_DISTANCE_BAND_IDS.map((band) => {
    const rows = passedAdv.filter((r) => r.targetBand === band);
    const slice = buildBandRow(band, rows);
    return {
      targetDistanceBand: band,
      trades: rows.length,
      targetReached: slice.targetReached,
      costCoverageRateAt0_20: slice.costCoverageAt0_20,
      meanMfe: slice.meanMfe,
      medianBarsToTarget: slice.medianBarsToTarget,
    };
  });

  const tradeExamples = buildTradeExamples(enriched);

  const highReachLowCost = targetDistanceBalanceTable.filter(
    (r) => (r.targetReachRate ?? 0) > 0.5 && (r.costCoverageAt0_20 ?? 0) < 0.5
  );
  const lowReachHighMargin = targetDistanceBalanceTable.filter(
    (r) => (r.targetReachRate ?? 0) < 0.3 && (r.meanGrossMarginOnReached ?? 0) > 0.5
  );

  const diagnosticSummary: HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport["diagnosticSummary"] =
    [
      {
        question: "Target küçüldükçe reach rate artıyor mu?",
        answer: `Observed reach rates by band: ${targetDistanceBalanceTable
          .map((r) => `${r.targetDistanceBand} ${((r.targetReachRate ?? 0) * 100).toFixed(1)}%`)
          .join("; ")}. Monotonicity: ${monotonic}.`,
        classification: "OBSERVATIONAL",
      },
      {
        question: "Target büyüdükçe cost coverage artıyor mu?",
        answer: targetDistanceBalanceTable
          .map(
            (r) =>
              `${r.targetDistanceBand} cov@0.20 ${((r.costCoverageAt0_20 ?? 0) * 100).toFixed(1)}%`
          )
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "Reach yüksek, cost coverage düşük bantlar?",
        answer: highReachLowCost.map((r) => r.targetDistanceBand).join(", ") || "none flagged",
        classification: "OBSERVATIONAL",
      },
      {
        question: "Reach düşük, reached gross margin geniş bantlar?",
        answer: lowReachHighMargin.map((r) => r.targetDistanceBand).join(", ") || "none flagged",
        classification: "OBSERVATIONAL",
      },
      {
        question: "MFE/target ilişkisi?",
        answer: mfeAnalysis
          .map((m) => `${m.targetDistanceBand} ratio ${m.mfeToTargetRatio?.toFixed(2) ?? "n/a"}`)
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "Time-to-target ilişkisi?",
        answer: targetDistanceBalanceTable
          .map(
            (r) =>
              `${r.targetDistanceBand} median bars ${r.medianBarsToTarget?.toFixed(1) ?? "n/a"}`
          )
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "Headroom association?",
        answer: "See targetDistanceByHeadroom cross-tab (associational).",
        classification: "OBSERVATIONAL",
      },
      {
        question: "Displacement association?",
        answer: "See targetDistanceByDisplacement cross-tab (associational).",
        classification: "OBSERVATIONAL",
      },
      {
        question: "Large thresholds >=1/2/3/5/10%?",
        answer: largeTargetAnalysis
          .map(
            (l) =>
              `>=${l.rewardThresholdPercent}% reach ${((l.targetReachRate ?? 0) * 100).toFixed(1)}% n=${l.trades}`
          )
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "FAILED+FAVORABLE band yoğunluğu?",
        answer: failedFavorableByBand
          .filter((f) => f.trades > 0)
          .map((f) => `${f.targetDistanceBand}: ${f.trades}`)
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "Theoretical R by band?",
        answer: theoreticalRByBand
          .map(
            (t) =>
              `${t.targetDistanceBand} expectancyR ${t.expectancyR?.toFixed(3) ?? "n/a"} (n=${t.rEligibleDecisive})`
          )
          .join("; "),
        classification: "OBSERVATIONAL",
      },
      {
        question: "Direct vs association?",
        answer:
          "Direct: reach/time/MFE/cost margin/theoretical R aggregates. Associational: evaluator/wave/family/anchor/headroom crosses.",
        classification: "OBSERVATIONAL",
      },
    ];

  return {
    schemaVersion: HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      canonicalReplayClassifiable: classifiableCount,
      canonicalNotReplayable: enriched.length - classifiableCount,
    },
    canonicalSources: {
      targetBands: "B-12r PRICE_MOVE_REWARD_BUCKET contract (alias TARGET_*)",
      reachability: "B-12w CANONICAL_DISPLACEMENT_EQUALITY",
      cost: "B-12x round-trip scenarios",
      theoreticalR: "B-12h eligibilityAudit decisiveRows (not recomputed)",
      structuralContext: "B-12y optional reference",
    },
    targetDistanceBalanceTable,
    observedReachMonotonicity: {
      byIncreasingTargetDistance: monotonic,
      note: "Ordered by TARGET_* band from smallest to largest reward distance.",
    },
    costSensitivityMatrix,
    mfeAnalysis,
    targetDistanceByHeadroom,
    targetDistanceByDisplacement,
    anchorByTargetBand,
    anchorSourceCoverageNote,
    waveByTargetBand,
    setupFamilyByTargetBand,
    evaluatorByTargetBand,
    pathByTargetBand,
    theoreticalRByBand,
    balanceAnalysis,
    thresholdAggregateViews,
    largeTargetAnalysis,
    smallTargetAnalysis,
    failedFavorableByBand,
    passedAdverseByBand,
    directVsAssociational: {
      direct: [
        "reward %",
        "risk %",
        "B-12w reach / timing / MFE",
        "B-12x-aligned cost coverage",
        "net margin scenarios",
        "B-12h theoretical R aggregates",
      ],
      associational: [
        "target × evaluator",
        "target × failure reason",
        "target × wave",
        "target × setup family",
        "target × anchor",
        "target × headroom / displacement",
      ],
    },
    diagnosticSummary,
    tradeExamples,
    warnings: [...WARNINGS],
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      costAwareCounterfactualAnalysisReport: true,
      eligibilityAuditReport: true,
      structuralContextAnalysisReport: Boolean(input.structuralContextAnalysisReport),
      entryPriceMoveQualityAnalysisReport: Boolean(input.entryPriceMoveQualityAnalysisReport),
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

function buildTradeExamples(enriched: EnrichedTrade[]): BalanceTradeExample[] {
  const classifiable = enriched.filter((r) => isClassifiable(r.replay.replayEvent));
  const bands: { band: TargetDistanceBandId; n: number }[] = [
    { band: "TARGET_LT_0_10", n: 5 },
    { band: "TARGET_0_10_TO_0_25", n: 5 },
    { band: "TARGET_0_25_TO_0_50", n: 5 },
    { band: "TARGET_0_50_TO_1_00", n: 5 },
    { band: "TARGET_1_00_TO_2_00", n: 5 },
    { band: "TARGET_GTE_3_00", n: 5 },
  ];
  const used = new Set<string>();
  const selected: EnrichedTrade[] = [];
  for (const { band, n } of bands) {
    const pool = classifiable
      .filter((r) => r.targetBand === band && !used.has(r.tradeId))
      .sort((a, b) => a.tradeId.localeCompare(b.tradeId));
    for (const r of pool.slice(0, n)) {
      used.add(r.tradeId);
      selected.push(r);
    }
  }
  for (const r of classifiable.sort((a, b) => a.tradeId.localeCompare(b.tradeId))) {
    if (selected.length >= 30) break;
    if (!used.has(r.tradeId)) {
      used.add(r.tradeId);
      selected.push(r);
    }
  }
  return selected.sort((a, b) => a.tradeId.localeCompare(b.tradeId)).map(toExample);
}

function toExample(r: EnrichedTrade): BalanceTradeExample {
  const reached = r.replay.replayEvent === "TARGET_REACHED";
  const gross = r.replay.grossTargetMovePercentage;
  return {
    tradeId: r.tradeId,
    timestamp: r.timestamp,
    evaluationBarIndex: r.evaluationBarIndex,
    direction: r.direction,
    anchorPrice: r.anchorPrice,
    entryPrice: r.entryPrice,
    targetPrice: r.targetPrice,
    invalidationPrice: r.invalidationPrice,
    rewardPercentage: r.rewardPercentage,
    riskPercentage: r.riskPercentage,
    canonicalRrRatio: r.canonicalRrRatio,
    displacementPercentage: r.displacementPercentage,
    structuralMovePercentage: r.structuralMovePercentage,
    headroomPercentage: r.headroomPercentage,
    targetDistanceBucket: r.targetBand,
    hasStructuralHeadroom: (r.headroomPercentage ?? 0) > 0,
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
    theoreticalR: r.theoreticalR,
  };
}
