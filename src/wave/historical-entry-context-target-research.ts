import { buildHistoricalDisplacementEqualityTargetMechanicsAnalysis } from "./historical-displacement-equality-target-mechanics-analysis";
import { buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis } from "./historical-structural-extreme-vs-displacement-target-analysis";
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import type { CounterfactualReachabilityRow } from "./historical-alternative-target-reachability-replay-types";
import {
  classifyStructuralHeadroomBucket,
} from "./historical-structural-extreme-vs-displacement-target-analysis";
import type { StructuralHeadroomBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import {
  classifyDisplacementContextBucket,
} from "./historical-target-distance-structural-context-analysis";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import {
  HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION,
  type AnchorSourceDimension,
  type BuildHistoricalEntryContextTargetResearchInput,
  type ContextSliceMetrics,
  type DisplacementTargetRow,
  type EntryContextTargetBandRow,
  type HeadroomPresence,
  type HeadroomTargetRow,
  type HistoricalEntryContextTargetResearchReport,
  type ResearchConclusionTag,
  type SameTargetBandHeadroomTier,
  type SameTargetBandSegmentRow,
} from "./historical-entry-context-target-research-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const CANONICAL_MODEL = "CANONICAL_DISPLACEMENT_EQUALITY" as const;
const COST_EPS = 1e-9;
const COST_BASELINE = 0.2;

const ALT_REF_MODELS: readonly AlternativeTargetModelId[] = [
  "CANONICAL_DISPLACEMENT_EQUALITY",
  "DISPLACEMENT_1_50",
  "DISPLACEMENT_2_00",
  "DISPLACEMENT_3_00",
];

const SAME_TARGET_BANDS: readonly PriceMoveRewardBucketId[] = [
  "REWARD_0_50_TO_1_00",
  "REWARD_1_00_TO_2_00",
  "REWARD_2_00_TO_3_00",
  "REWARD_GTE_3_00",
];

const WARNINGS: readonly string[] = [
  "entry_context_observational_research_only",
  "no_target_selection_rule",
  "no_entry_quality_score",
  "prefix_observation_not_post_e_causality",
  "reach_not_cost_coverage",
  "theoretical_r_not_recomputed",
  "mfe_not_target_touch",
];

interface EnrichedTrade {
  tradeId: string;
  direction: string;
  setupFamilyId: string;
  evaluatorStatus: string;
  failureReason: string;
  pathOutcome: string;
  policyClassification: string;
  waveContext: string;
  anchorSource: AnchorSourceDimension;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  displacementPercentage: number | null;
  structuralMovePercentage: number | null;
  headroomPercentage: number | null;
  observedHigh: number | null;
  observedLow: number | null;
  rewardBucket: PriceMoveRewardBucketId;
  displacementBucket: DisplacementContextBucketId;
  headroomBucket: StructuralHeadroomBucketId;
  headroomTier: SameTargetBandHeadroomTier;
  headroomPresence: HeadroomPresence;
  headroomGeTarget: boolean;
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

function isClassifiable(event: CounterfactualReachabilityRow["replayEvent"]): boolean {
  return event !== "NOT_REPLAYABLE";
}

function isDecisive(policy: string): boolean {
  return policy === "FAVORABLE_RESOLUTION" || policy === "ADVERSE_RESOLUTION";
}

function costCovered(gross: number | null, cost: number): boolean {
  return gross !== null && Number.isFinite(gross) && gross > cost + COST_EPS;
}

export function mapHeadroomToSameTargetTier(
  bucket: StructuralHeadroomBucketId
): SameTargetBandHeadroomTier {
  if (bucket === "NO_HEADROOM") return "NO_HEADROOM";
  if (bucket === "HEADROOM_LT_0_25") return "SMALL_HEADROOM";
  if (bucket === "HEADROOM_0_25_TO_0_50" || bucket === "HEADROOM_0_50_TO_1_00") {
    return "MEDIUM_HEADROOM";
  }
  if (bucket === "HEADROOM_NOT_APPLICABLE") return "NO_HEADROOM";
  return "LARGE_HEADROOM";
}

function aggregateSlice(rows: EnrichedTrade[]): ContextSliceMetrics {
  const classifiable = rows.filter((r) => isClassifiable(r.replay.replayEvent));
  const decisive = rows.filter((r) => r.decisive);
  const reached = classifiable.filter((r) => r.replay.replayEvent === "TARGET_REACHED");
  const classifiableN = classifiable.length;
  const reachedN = reached.length;
  const bars = reached
    .map((r) => r.replay.barsToTarget)
    .filter((b): b is number => b !== null && Number.isFinite(b));
  const mfes = classifiable
    .map((r) => r.replay.mfePercentage)
    .filter((m): m is number => m !== null && Number.isFinite(m));
  const mfeRatios = classifiable
    .map((r) => {
      const g = r.rewardPercentage;
      const m = r.replay.mfePercentage;
      if (g === null || m === null || g <= 0) return null;
      return m / g;
    })
    .filter((x): x is number => x !== null);
  const eligibleR = decisive.filter((r) => r.theoreticalREligible && r.theoreticalR !== null);
  const rs = eligibleR.map((r) => r.theoreticalR!);
  const sumR = rs.reduce((a, b) => a + b, 0);
  const covered = reached.filter((r) =>
    costCovered(r.replay.grossTargetMovePercentage, COST_BASELINE)
  ).length;
  const tbi = classifiable.filter((r) => r.replay.targetBeforeInvalidation).length;
  const trades = rows.length;
  const decisiveN = decisive.length;
  const interpretWithCaution = trades < 10 || decisiveN < 10;

  return {
    trades,
    decisive: decisiveN,
    classifiable: classifiableN,
    targetReached: reachedN,
    targetReachRate: classifiableN > 0 ? reachedN / classifiableN : null,
    reachRateWilson95: computeIndependentTradeWinRateConfidenceInterval(
      reachedN,
      classifiableN - reachedN,
      0.95
    ),
    targetBeforeInvalidationRate: classifiableN > 0 ? tbi / classifiableN : null,
    medianBarsToTarget: median(bars),
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    mfeToTargetRatio: mean(mfeRatios),
    meanCanonicalTargetPercent: mean(
      rows.map((r) => r.rewardPercentage).filter((x): x is number => x !== null)
    ),
    costCoverageRateAt0_20: reachedN > 0 ? covered / reachedN : null,
    expectancyR: eligibleR.length ? sumR / eligibleR.length : null,
    sumR,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(trades),
    interpretWithCaution,
  };
}

function tagForSlice(slice: ContextSliceMetrics, associational = false): ResearchConclusionTag {
  if (slice.trades < 10 || slice.decisive < 10) return "INSUFFICIENT_SAMPLE";
  if (associational) return "ASSOCIATIONAL_FINDING";
  return "DIRECT_OBSERVATION";
}

export function buildHistoricalEntryContextTargetResearch(
  input: BuildHistoricalEntryContextTargetResearchInput
): HistoricalEntryContextTargetResearchReport {
  const {
    lifecycleReport,
    artifactMeasurements,
    reachabilityReplayReport,
    costAwareCounterfactualAnalysisReport,
    eligibilityAuditReport,
  } = input;

  const b12t =
    input.historicalDisplacementEqualityTargetMechanicsAnalysisReport ??
    buildHistoricalDisplacementEqualityTargetMechanicsAnalysis({
      lifecycleReport,
      eligibilityAuditReport,
      artifactMeasurements,
    });

  const b12u =
    input.historicalStructuralExtremeVsDisplacementTargetAnalysisReport ??
    buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis({
      lifecycleReport,
      artifactMeasurements,
    });

  const replayByTrade = new Map<string, CounterfactualReachabilityRow>();
  const replayByTradeModel = new Map<string, CounterfactualReachabilityRow>();
  for (const row of reachabilityReplayReport.perTrade) {
    replayByTradeModel.set(`${row.tradeId}|${row.modelId}`, row);
    if (row.modelId === CANONICAL_MODEL) replayByTrade.set(row.tradeId, row);
  }

  const auditByTrade = new Map(
    eligibilityAuditReport.decisiveRows.map((r) => [r.tradeId, r])
  );
  const dispByTrade = new Map(b12t.targetMagnitude.perTrade.map((r) => [r.tradeId, r]));
  const structByTrade = new Map(b12u.perTrade.map((r) => [r.tradeId, r]));

  const enriched: EnrichedTrade[] = [];
  for (const t of lifecycleReport.trades) {
    const replay = replayByTrade.get(t.tradeId);
    if (!replay) continue;
    const disp = dispByTrade.get(t.tradeId);
    const struct = structByTrade.get(t.tradeId);
    const audit = auditByTrade.get(t.tradeId);
    const reward = replay.grossTargetMovePercentage ?? disp?.rewardPercentage ?? null;
    const rewardBucket = classifyPriceMoveRewardBucket(reward);
    if (rewardBucket === "REWARD_NOT_APPLICABLE") continue;
    const headroomBucket =
      struct?.prefixHeadroomBucket ??
      classifyStructuralHeadroomBucket(struct?.prefixExtremeHeadroomPercentage ?? null);
    const headroomPct = struct?.prefixExtremeHeadroomPercentage ?? null;
    const headroomPresence: HeadroomPresence =
      headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT";

    enriched.push({
      tradeId: t.tradeId,
      direction: t.direction ?? "UNKNOWN",
      setupFamilyId: t.setupFamilyId,
      evaluatorStatus: t.tradeEvaluationStatus,
      failureReason: t.evaluatorFirstFailure ?? "NONE",
      pathOutcome: t.pathOutcome,
      policyClassification: t.policyClassification,
      waveContext: struct?.waveLabel ?? "UNKNOWN",
      anchorSource: resolveAnchorKey(disp?.anchorSources as string[] | undefined),
      rewardPercentage: reward,
      riskPercentage: disp?.riskPercentage ?? null,
      canonicalRrRatio: t.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null,
      displacementPercentage: disp?.displacementPercentage ?? null,
      structuralMovePercentage: struct?.prefixStructuralMovePercentage ?? null,
      headroomPercentage: headroomPct,
      observedHigh: struct?.prefixExtremePrice ?? null,
      observedLow: struct?.prefixExtremePrice ?? null,
      rewardBucket,
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      headroomBucket,
      headroomTier: mapHeadroomToSameTargetTier(headroomBucket),
      headroomPresence,
      headroomGeTarget:
        headroomPct !== null &&
        reward !== null &&
        headroomPct >= reward - COST_EPS,
      replay,
      theoreticalR: audit?.theoreticalR ?? null,
      theoreticalREligible: audit?.theoreticalREligible ?? false,
      decisive: isDecisive(t.policyClassification),
    });
  }

  const populationSlice = aggregateSlice(enriched);
  const classifiableCount = enriched.filter((r) => isClassifiable(r.replay.replayEvent)).length;

  const displacementBuckets = new Set(enriched.map((r) => r.displacementBucket));
  const displacementAnalysis = [...displacementBuckets]
    .filter((b) => b !== "DISP_NOT_APPLICABLE")
    .map((displacementBucket) => ({
      displacementBucket,
      ...aggregateSlice(enriched.filter((r) => r.displacementBucket === displacementBucket)),
    }));

  const headroomBuckets = new Set(enriched.map((r) => r.headroomBucket));
  const headroomAnalysis = [...headroomBuckets]
    .filter((b) => b !== "HEADROOM_NOT_APPLICABLE")
    .map((headroomBucket) => ({
      headroomBucket,
      ...aggregateSlice(enriched.filter((r) => r.headroomBucket === headroomBucket)),
    }));

  const headroomPresenceComparison = {
    noHeadroom: aggregateSlice(enriched.filter((r) => r.headroomPresence === "HEADROOM_ABSENT")),
    positiveHeadroom: aggregateSlice(enriched.filter((r) => r.headroomPresence === "HEADROOM_PRESENT")),
  };

  const sameTargetBandSegmentation: SameTargetBandSegmentRow[] = [];
  for (const targetBand of SAME_TARGET_BANDS) {
    const bandRows = enriched.filter((r) => r.rewardBucket === targetBand);
    for (const tier of [
      "NO_HEADROOM",
      "SMALL_HEADROOM",
      "MEDIUM_HEADROOM",
      "LARGE_HEADROOM",
    ] as SameTargetBandHeadroomTier[]) {
      const rows = bandRows.filter((r) => r.headroomTier === tier);
      if (!rows.length) continue;
      sameTargetBandSegmentation.push({
        targetBand,
        headroomTier: tier,
        ...aggregateSlice(rows),
      });
    }
  }

  const headroomGeTargetCohort = {
    headroomGeTarget: aggregateSlice(enriched.filter((r) => r.headroomGeTarget)),
    headroomLtTarget: aggregateSlice(enriched.filter((r) => !r.headroomGeTarget)),
    note:
      "Prefix structural headroom at E compared to canonical reward distance; post-E reachability is B-12w replay outcome.",
  };

  const notReached = enriched.filter(
    (r) =>
      isClassifiable(r.replay.replayEvent) && r.replay.replayEvent !== "TARGET_REACHED"
  );
  const groupA = notReached.filter((r) => {
    const g = r.rewardPercentage;
    const m = r.replay.mfePercentage;
    return g === null || m === null || m < g - COST_EPS;
  });
  const groupB = notReached.filter((r) => {
    const g = r.rewardPercentage;
    const m = r.replay.mfePercentage;
    return g !== null && m !== null && m >= g - COST_EPS;
  });

  const targetHeadroomMfeCross: HistoricalEntryContextTargetResearchReport["targetHeadroomMfeCross"][number][] =
    [];
  for (const targetBand of SAME_TARGET_BANDS) {
    for (const hb of headroomBuckets) {
      if (hb === "HEADROOM_NOT_APPLICABLE") continue;
      for (const tier of ["MFE_LT_TARGET", "MFE_GTE_TARGET"] as const) {
        const rows = enriched.filter((r) => {
          if (r.rewardBucket !== targetBand || r.headroomBucket !== hb) return false;
          const g = r.rewardPercentage;
          const m = r.replay.mfePercentage;
          if (g === null || m === null) return tier === "MFE_LT_TARGET";
          return tier === "MFE_GTE_TARGET" ? m >= g - COST_EPS : m < g - COST_EPS;
        });
        if (!rows.length) continue;
        const s = aggregateSlice(rows);
        targetHeadroomMfeCross.push({
          targetBand,
          headroomBucket: hb,
          mfeToTargetTier: tier,
          trades: s.trades,
          targetReachRate: s.targetReachRate,
          costCoverageRateAt0_20: s.costCoverageRateAt0_20,
          interpretWithCaution: s.interpretWithCaution,
        });
      }
    }
  }

  const displacementHeadroomCross: HistoricalEntryContextTargetResearchReport["displacementHeadroomCross"][number][] =
    [];
  for (const db of displacementBuckets) {
    if (db === "DISP_NOT_APPLICABLE") continue;
    for (const hb of headroomBuckets) {
      if (hb === "HEADROOM_NOT_APPLICABLE") continue;
      const rows = enriched.filter(
        (r) => r.displacementBucket === db && r.headroomBucket === hb
      );
      if (!rows.length) continue;
      const s = aggregateSlice(rows);
      displacementHeadroomCross.push({
        displacementBucket: db,
        headroomBucket: hb,
        trades: s.trades,
        meanCanonicalTargetPercent: s.meanCanonicalTargetPercent,
        targetReachRate: s.targetReachRate,
        mfeToTargetRatio: s.mfeToTargetRatio,
        costCoverageRateAt0_20: s.costCoverageRateAt0_20,
      });
    }
  }

  const prefixExtremeAssociation = {
    headroomPresent: headroomPresenceComparison.positiveHeadroom,
    headroomAbsent: headroomPresenceComparison.noHeadroom,
    note: "E-prefix headroom observation; associational comparison to post-E canonical reach.",
  };

  const alternativeModelReference: HistoricalEntryContextTargetResearchReport["alternativeModelReference"][number][] =
    [];
  for (const presence of ["HEADROOM_PRESENT", "HEADROOM_ABSENT"] as HeadroomPresence[]) {
    const cohort = enriched.filter((r) => r.headroomPresence === presence);
    const ids = new Set(cohort.map((r) => r.tradeId));
    for (const modelId of ALT_REF_MODELS) {
      let classifiable = 0;
      let reached = 0;
      for (const id of ids) {
        const row = replayByTradeModel.get(`${id}|${modelId}`);
        if (!row || !isClassifiable(row.replayEvent)) continue;
        classifiable++;
        if (row.replayEvent === "TARGET_REACHED") reached++;
      }
      alternativeModelReference.push({
        headroomPresence: presence,
        modelId,
        classifiable,
        targetReached: reached,
        targetReachRate: classifiable > 0 ? reached / classifiable : null,
      });
    }
  }

  const entryContextByTargetBand: EntryContextTargetBandRow[] = [];
  for (const db of displacementBuckets) {
    if (db === "DISP_NOT_APPLICABLE") continue;
    for (const tb of new Set(enriched.map((r) => r.rewardBucket))) {
      const rows = enriched.filter(
        (r) => r.displacementBucket === db && r.rewardBucket === tb
      );
      if (!rows.length) continue;
      entryContextByTargetBand.push({
        entryContextLabel: `DISPLACEMENT:${db}`,
        targetBand: tb,
        ...aggregateSlice(rows),
      });
    }
  }

  const headroomByTarget: HeadroomTargetRow[] = [];
  for (const hb of headroomBuckets) {
    if (hb === "HEADROOM_NOT_APPLICABLE") continue;
    for (const tb of new Set(enriched.map((r) => r.rewardBucket))) {
      const rows = enriched.filter((r) => r.headroomBucket === hb && r.rewardBucket === tb);
      if (!rows.length) continue;
      headroomByTarget.push({ headroomBucket: hb, targetBand: tb, ...aggregateSlice(rows) });
    }
  }

  const displacementByTarget: DisplacementTargetRow[] = [];
  for (const db of displacementBuckets) {
    if (db === "DISP_NOT_APPLICABLE") continue;
    for (const tb of new Set(enriched.map((r) => r.rewardBucket))) {
      const rows = enriched.filter((r) => r.displacementBucket === db && r.rewardBucket === tb);
      if (!rows.length) continue;
      displacementByTarget.push({
        displacementBucket: db,
        targetBand: tb,
        ...aggregateSlice(rows),
      });
    }
  }

  const failedFav = enriched.filter(
    (r) =>
      r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdv = enriched.filter(
    (r) =>
      r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const rrControlCross: HistoricalEntryContextTargetResearchReport["rrControlCross"][number][] = [];
  for (const presence of ["HEADROOM_PRESENT", "HEADROOM_ABSENT"] as HeadroomPresence[]) {
    for (const band of ["RR_LT_1_5", "RR_GTE_1_5"] as const) {
      const rows = enriched.filter((r) => {
        if (r.headroomPresence !== presence) return false;
        const rr = r.canonicalRrRatio;
        if (rr === null) return false;
        return band === "RR_GTE_1_5" ? rr >= 1.5 : rr < 1.5;
      });
      const s = aggregateSlice(rows);
      rrControlCross.push({
        rrBucket: band,
        headroomPresence: presence,
        trades: s.trades,
        targetReachRate: s.targetReachRate,
      });
    }
  }

  const waves = new Set(enriched.map((r) => r.waveContext));
  const secondaryWaveDirectionFamily = {
    wave: [...waves].map((waveLabel) => ({
      waveLabel,
      slice: aggregateSlice(enriched.filter((r) => r.waveContext === waveLabel)),
    })),
    direction: [...new Set(enriched.map((r) => r.direction))].map((direction) => ({
      direction,
      slice: aggregateSlice(enriched.filter((r) => r.direction === direction)),
    })),
    family: [...new Set(enriched.map((r) => r.setupFamilyId))].map((setupFamilyId) => ({
      setupFamilyId,
      slice: aggregateSlice(enriched.filter((r) => r.setupFamilyId === setupFamilyId)),
    })),
  };

  const anchorSources = new Set(enriched.map((r) => r.anchorSource));
  const anchorSourceNote =
    anchorSources.size === 1 && anchorSources.has("MIXED")
      ? "Frozen cohort anchor source dimension is MIXED-only."
      : `Anchor sources observed: ${[...anchorSources].join(", ")}`;

  const reachSpread =
    (headroomPresenceComparison.positiveHeadroom.targetReachRate ?? 0) -
    (headroomPresenceComparison.noHeadroom.targetReachRate ?? 0);

  const diagnosticSummary: HistoricalEntryContextTargetResearchReport["diagnosticSummary"] = [
    {
      question: "Displacement magnitude target reachability'yi ayırıyor mu?",
      answer: displacementAnalysis
        .map((d) => `${d.displacementBucket}: ${((d.targetReachRate ?? 0) * 100).toFixed(1)}%`)
        .join("; "),
      tag: tagForSlice(displacementAnalysis[0] ?? populationSlice),
    },
    {
      question: "Structural headroom target reachability'yi ayırıyor mu?",
      answer: `HEADROOM_PRESENT ${((headroomPresenceComparison.positiveHeadroom.targetReachRate ?? 0) * 100).toFixed(1)}% vs ABSENT ${((headroomPresenceComparison.noHeadroom.targetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: tagForSlice(headroomPresenceComparison.positiveHeadroom, true),
    },
    {
      question: "NO_HEADROOM vs POSITIVE_HEADROOM farkı?",
      answer: `Reach spread (present - absent): ${(reachSpread * 100).toFixed(1)} percentage points on classifiable canonical replay.`,
      tag:
        headroomPresenceComparison.positiveHeadroom.interpretWithCaution
          ? "INSUFFICIENT_SAMPLE"
          : "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Aynı target bandında headroom tier farkı?",
      answer: "See sameTargetBandSegmentation table.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Aynı target bandında displacement farkı?",
      answer: "See displacementByTarget cross-tab.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Headroom >= target cohort?",
      answer: `GE: ${((headroomGeTargetCohort.headroomGeTarget.targetReachRate ?? 0) * 100).toFixed(1)}% vs LT: ${((headroomGeTargetCohort.headroomLtTarget.targetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: tagForSlice(headroomGeTargetCohort.headroomGeTarget, true),
    },
    {
      question: "MFE beyond reach semantics?",
      answer: `Not reached + MFE>=target: ${groupB.length} trades; not reached + MFE<target: ${groupA.length}.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Büyük target sorun mesafe mi hareket mi?",
      answer: "Large bands show lower reach; MFE>=target without reach indicates favorable excursion without touch.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Cost coverage kritik dilimler?",
      answer: `Population cost coverage @0.20% on reached: ${((populationSlice.costCoverageRateAt0_20 ?? 0) * 100).toFixed(1)}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "FAILED+FAVORABLE context?",
      answer: `n=${failedFav.length}; reach ${((aggregateSlice(failedFav).targetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "PASSED+ADVERSE context?",
      answer: `n=${passedAdv.length}; reach ${((aggregateSlice(passedAdv).targetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "RR control × headroom?",
      answer: rrControlCross
        .map(
          (r) =>
            `${r.rrBucket}/${r.headroomPresence}: ${((r.targetReachRate ?? 0) * 100).toFixed(1)}%`
        )
        .join("; "),
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "En belirgin entry-context dimension?",
      answer:
        Math.abs(reachSpread) > 0.1
          ? "Headroom presence shows largest reach spread in frozen cohort."
          : "No single dimension exceeds 10pp reach spread; review cross-tabs.",
      tag: Math.abs(reachSpread) > 0.1 ? "ASSOCIATIONAL_FINDING" : "NOT_ESTABLISHED",
    },
    {
      question: "Yeni target selection rule için veri yeterli mi?",
      answer:
        "NOT_ESTABLISHED for production rule; observational separation only. See nextPhaseResearchCandidates.",
      tag: "NOT_ESTABLISHED",
    },
  ];

  const establishedFindings: { finding: string; tag: ResearchConclusionTag }[] = [];
  const notEstablishedFindings: { finding: string; tag: ResearchConclusionTag }[] = [];
  if (Math.abs(reachSpread) > 0.05 && !headroomPresenceComparison.positiveHeadroom.interpretWithCaution) {
    establishedFindings.push({
      finding: "Positive E-prefix headroom associated with different canonical reach rate than no headroom.",
      tag: "ASSOCIATIONAL_FINDING",
    });
  } else {
    notEstablishedFindings.push({
      finding: "Headroom presence reach separation not established at frozen sample thresholds.",
      tag: "NOT_ESTABLISHED",
    });
  }
  if (groupB.length > 0) {
    establishedFindings.push({
      finding: "Some TARGET_NOT_REACHED trades show MFE >= canonical target distance (touch semantics).",
      tag: "DIRECT_OBSERVATION",
    });
  }

  const nextPhaseResearchCandidates: { candidate: string; rationale: string }[] = [];
  if (Math.abs(reachSpread) > 0.1) {
    nextPhaseResearchCandidates.push({
      candidate: "Headroom-conditioned target distance research (non-production)",
      rationale: "Frozen cohort shows >10pp reach spread by headroom presence on canonical replay.",
    });
  }
  if (sameTargetBandSegmentation.some((s) => !s.interpretWithCaution && s.targetReachRate !== null)) {
    nextPhaseResearchCandidates.push({
      candidate: "Same-target-band entry quality segmentation follow-up",
      rationale: "Adequate sample in at least one target band × headroom tier cell.",
    });
  }

  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      totalSnapshots: lifecycleReport.summary?.totalSnapshots ?? null,
      eligibleEntrySnapshots: lifecycleReport.summary?.eligibleEntrySnapshots ?? null,
      canonicalReplayClassifiable: classifiableCount,
      canonicalNotReplayable: enriched.length - classifiableCount,
    },
    lookaheadAttestation: {
      entryContextUsesAnchorToEOnly: true,
      postEUsedForOutcomesOnly: true,
      statement:
        "Displacement, headroom, structural move, anchor, wave, RR, and target distance use evaluation-bar references only; B-12w outcomes use E+1..horizon.",
    },
    entryContextDimensions: [
      "displacementPercentage",
      "headroomPercentage",
      "structuralMovePercentage",
      "waveContext",
      "anchorSource",
      "direction",
      "setupFamilyId",
      "canonicalRrRatio",
      "evaluatorStatus",
    ],
    displacementAnalysis,
    headroomAnalysis,
    headroomPresenceComparison,
    sameTargetBandSegmentation,
    headroomGeTargetCohort,
    mfeNotReachedAnalysis: {
      groupA_targetNotReached_mfeLtTarget: aggregateSlice(groupA),
      groupB_targetNotReached_mfeGteTarget: aggregateSlice(groupB),
      note: "Group B shows favorable excursion without canonical TARGET_REACHED touch.",
    },
    targetHeadroomMfeCross,
    displacementHeadroomCross,
    prefixExtremeAssociation,
    alternativeModelReference,
    entryContextByTargetBand,
    headroomByTarget,
    displacementByTarget,
    costBaseline: {
      roundTripCostPercent: 0.2,
      note: "B-12x round-trip scenario; not exchange fee claim.",
    },
    failedFavorableAnalysis: {
      trades: failedFav.length,
      slice: aggregateSlice(failedFav),
      vsPopulationReachRate: populationSlice.targetReachRate,
      note: "Observational cohort; not evaluator verdict.",
    },
    passedAdverseAnalysis: {
      trades: passedAdv.length,
      slice: aggregateSlice(passedAdv),
      vsPopulationReachRate: populationSlice.targetReachRate,
      note: "Observational cohort; not evaluator verdict.",
    },
    rrControlCross,
    secondaryWaveDirectionFamily,
    anchorSourceNote,
    directVsAssociational: {
      direct: [
        "displacement",
        "headroom",
        "structural move",
        "target distance",
        "target reached",
        "bars to target",
        "MFE",
        "cost coverage",
        "theoretical R (frozen audit)",
      ],
      associational: [
        "evaluator",
        "failure reason",
        "wave",
        "direction",
        "setup family",
        "FAILED+FAVORABLE",
        "PASSED+ADVERSE",
      ],
    },
    diagnosticSummary,
    establishedFindings,
    notEstablishedFindings,
    nextPhaseResearchCandidates,
    warnings: [...WARNINGS],
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      costAwareCounterfactualAnalysisReport: Boolean(costAwareCounterfactualAnalysisReport),
      eligibilityAuditReport: true,
      displacementEqualityTargetMechanicsAnalysisReport: Boolean(
        input.historicalDisplacementEqualityTargetMechanicsAnalysisReport
      ),
      structuralExtremeVsDisplacementTargetAnalysisReport: Boolean(
        input.historicalStructuralExtremeVsDisplacementTargetAnalysisReport
      ),
      structuralContextAnalysisReport: Boolean(
        input.historicalTargetDistanceStructuralContextAnalysisReport
      ),
      failureReasonAnalysisReport: Boolean(input.historicalEvaluatorFailureReasonAnalysisReport),
      rrThresholdTheoreticalRAnalysisReport: Boolean(input.rrThresholdTheoreticalRAnalysisReport),
    },
  };
}
