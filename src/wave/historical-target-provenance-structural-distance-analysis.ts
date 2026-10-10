import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import {
  computeGrossPriceMovePercentages,
} from "./historical-entry-price-move-quality-analysis";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { computeIndependentTradeWinRateDecisive } from "./historical-independent-trade-statistics";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementEvaluationSnapshot } from "./setup/historical-measurement-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";
import {
  HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION,
  TARGET_MAGNITUDE_REWARD_BUCKET_IDS,
  TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT,
  type BuildHistoricalTargetProvenanceStructuralDistanceAnalysisInput,
  type CanonicalSourceAuditLine,
  type HistoricalTargetProvenanceStructuralDistanceAnalysisReport,
  type LargeMoveExampleRow,
  type StructuralDistanceTradeRow,
  type TargetMagnitudeBucketMetrics,
  type TargetMagnitudeRewardBucketId,
  type TargetProvenanceCategory,
  type TargetProvenanceClassificationRecord,
  type TargetProvenanceTradeRow,
} from "./historical-target-provenance-structural-distance-analysis-types";

const CANONICAL_SOURCE_AUDIT: readonly CanonicalSourceAuditLine[] = [
  {
    field: "entryReferencePrice",
    frozenSource: "IndependentTradeUnit ← evaluation.references.entry.referencePrice",
    sourceModule: "setup/prospective-reference-evaluation.ts",
    sourceFunction: "evaluateProspectiveReferenceBundle",
    evidenceLevel: "DIRECT",
  },
  {
    field: "targetReferencePrice",
    frozenSource: "IndependentTradeUnit ← evaluation.references.target.referencePrice",
    sourceModule: "setup/prospective-reference-evaluation.ts",
    sourceFunction: "projectProspectiveOpenLegDisplacementEqualityTarget",
    evidenceLevel: "DIRECT",
  },
  {
    field: "invalidationReferencePrice",
    frozenSource: "IndependentTradeUnit ← pathResult.invalidationReferencePrice (lifecycle)",
    sourceModule: "setup/prospective-structural-invalidation.ts",
    sourceFunction: "resolveProspectiveStructuralInvalidation",
    evidenceLevel: "DIRECT",
  },
  {
    field: "canonicalRrRatio",
    frozenSource: "IndependentTradeUnit ← evaluation.references.rr.ratio",
    sourceModule: "setup/prospective-reference-evaluation.ts",
    sourceFunction: "evaluateProspectiveReferenceBundle",
    evidenceLevel: "DIRECT",
  },
];

const WARNINGS: readonly string[] = [
  "observational_research_only",
  "no_target_strategy_recommendation",
  "gross_reward_excludes_fees_slippage_execution_funding",
  "leverage_not_applied",
  "fibonacci_provenance_not_in_historical_prospective_path",
  "no_causality",
  "no_pnl",
];

export function classifyTargetMagnitudeRewardBucket(
  rewardPercentage: number | null
): TargetMagnitudeRewardBucketId {
  if (rewardPercentage === null || !Number.isFinite(rewardPercentage)) {
    return "REWARD_NOT_APPLICABLE";
  }
  const p = rewardPercentage;
  const t = TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT;
  if (p < t.lt0_10MaxExclusive) return "REWARD_LT_0_10";
  if (p < t.to0_25MaxExclusive) return "REWARD_0_10_TO_0_25";
  if (p < t.to0_50MaxExclusive) return "REWARD_0_25_TO_0_50";
  if (p < t.to1_00MaxExclusive) return "REWARD_0_50_TO_1_00";
  if (p < t.to2_00MaxExclusive) return "REWARD_1_00_TO_2_00";
  if (p < t.to3_00MaxExclusive) return "REWARD_2_00_TO_3_00";
  if (p < t.to5_00MaxExclusive) return "REWARD_3_00_TO_5_00";
  if (p < t.to10_00MaxExclusive) return "REWARD_5_00_TO_10_00";
  return "REWARD_GTE_10_00";
}

function resolveDurationBucket(
  durationBars: number | null
): IndependentTradeDurationBucketId | null {
  if (durationBars === null || !Number.isFinite(durationBars)) {
    return null;
  }
  const d = Math.floor(durationBars);
  if (d >= 1 && d <= 3) return "DURATION_1_3";
  if (d >= 4 && d <= 6) return "DURATION_4_6";
  if (d >= 7 && d <= 12) return "DURATION_7_12";
  if (d >= 13 && d <= 24) return "DURATION_13_24";
  return null;
}

function isDecisive(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION" || c === "ADVERSE_RESOLUTION";
}

function isWin(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION";
}

function isInconclusive(c: HistoricalPositionPolicyClassification): boolean {
  return c === "INCONCLUSIVE_SAME_BAR";
}

function isUnresolved(c: HistoricalPositionPolicyClassification): boolean {
  return c === "UNRESOLVED_AT_HORIZON";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function classifyPrimaryTargetProvenance(
  evaluation: HistoricalMeasurementEvaluationSnapshot | null
): TargetProvenanceClassificationRecord {
  const modelId = evaluation?.references.target.modelId ?? null;
  const policyId = evaluation?.references.target.policyId ?? null;
  if (modelId === "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION") {
    return {
      category: "STRUCTURAL_LEVEL_REFERENCE",
      sourceField: "evaluation.references.target.referencePrice",
      sourceModule: "setup/prospective-reference-evaluation.ts",
      sourceFunction: "projectProspectiveOpenLegDisplacementEqualityTarget",
      evidenceLevel: "DIRECT",
      confidence: "HIGH",
      note:
        "Target is open-leg displacement equality projection from anchorPrice and evaluation-bar close (not Fibonacci path target).",
    };
  }
  if (!evaluation) {
    return {
      category: "UNAVAILABLE",
      sourceField: null,
      sourceModule: null,
      sourceFunction: null,
      evidenceLevel: "UNKNOWN",
      confidence: "LOW",
      note: "No artifact measurement join for snapshot.",
    };
  }
  return {
    category: "UNKNOWN_REFERENCE",
    sourceField: "evaluation.references.target",
    sourceModule: "setup/prospective-reference-evaluation.ts",
    sourceFunction: "evaluateProspectiveReferenceBundle",
    evidenceLevel: "UNKNOWN",
    confidence: "LOW",
    note: `Unexpected target modelId: ${modelId ?? "null"}`,
  };
}

function supplementaryProvenance(
  evaluation: HistoricalMeasurementEvaluationSnapshot | null
): TargetProvenanceClassificationRecord[] {
  const out: TargetProvenanceClassificationRecord[] = [];
  out.push({
    category: "FIBONACCI_RETRACEMENT_REFERENCE",
    sourceField: null,
    sourceModule: "setup/prospective-open-leg-displacement-equality-policy.ts",
    sourceFunction: null,
    evidenceLevel: "UNKNOWN",
    confidence: "HIGH",
    note: "Fibonacci provenance not established for historical prospective target path.",
  });
  out.push({
    category: "FIBONACCI_EXTENSION_REFERENCE",
    sourceField: null,
    sourceModule: null,
    sourceFunction: null,
    evidenceLevel: "UNKNOWN",
    confidence: "HIGH",
    note: "Fibonacci extension not used in PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY.",
  });
  const waveLabel =
    evaluation?.production?.prospectiveWaveLabel ??
    evaluation?.historicalSetup?.scenarioRef.waveLabel ??
    null;
  if (waveLabel) {
    out.push({
      category: "WAVE_REFERENCE",
      sourceField: "production.prospectiveWaveLabel / scenarioRef.waveLabel",
      sourceModule: "setup/prospective-setup-production.ts",
      sourceFunction: "detectProspectiveSetupProduction",
      evidenceLevel: "INFERRED",
      confidence: "MEDIUM",
      note: `Wave label context ${waveLabel}; target price still from displacement policy.`,
    });
  }
  const sources =
    evaluation?.production?.openLegResolution.leg?.selectedAnchorSources ?? [];
  if (sources.includes("CONFIRMED_SWING")) {
    out.push({
      category: "PREVIOUS_SWING_REFERENCE",
      sourceField: "openLegResolution.leg.selectedAnchorSources",
      sourceModule: "setup/open-structural-leg.ts",
      sourceFunction: null,
      evidenceLevel: "DERIVED",
      confidence: "MEDIUM",
      note: "Anchor may include CONFIRMED_SWING; target is not swing price itself.",
    });
  }
  return out;
}

function computeStructuralAlternativeReward(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null
): Pick<
  StructuralDistanceTradeRow,
  | "structuralRewardPercentage"
  | "structuralRewardSource"
  | "structuralRewardUnavailableReason"
> {
  const entry = trade.entryReferencePrice;
  const leg = evaluation?.production?.openLegResolution.leg ?? null;
  if (entry === null || !Number.isFinite(entry) || entry <= 0 || !leg) {
    return {
      structuralRewardPercentage: null,
      structuralRewardSource: null,
      structuralRewardUnavailableReason: leg
        ? "INVALID_ENTRY"
        : "OPEN_LEG_UNAVAILABLE",
    };
  }
  const dir = trade.direction;
  const candidates: { pct: number; source: string }[] = [];
  if (dir === "BULLISH") {
    if (leg.observedHigh > entry) {
      candidates.push({
        pct: ((leg.observedHigh - entry) / entry) * 100,
        source: "openLeg.observedHigh",
      });
    }
    const end = evaluation?.historicalSetup?.sourceScenario.endPrice;
    if (end !== undefined && Number.isFinite(end) && end > entry) {
      candidates.push({
        pct: ((end - entry) / entry) * 100,
        source: "historicalSetup.sourceScenario.endPrice",
      });
    }
  } else if (dir === "BEARISH") {
    if (leg.observedLow < entry) {
      candidates.push({
        pct: ((entry - leg.observedLow) / entry) * 100,
        source: "openLeg.observedLow",
      });
    }
    const end = evaluation?.historicalSetup?.sourceScenario.endPrice;
    if (end !== undefined && Number.isFinite(end) && end < entry) {
      candidates.push({
        pct: ((entry - end) / entry) * 100,
        source: "historicalSetup.sourceScenario.endPrice",
      });
    }
  } else {
    return {
      structuralRewardPercentage: null,
      structuralRewardSource: null,
      structuralRewardUnavailableReason: "INVALID_DIRECTION",
    };
  }
  if (!candidates.length) {
    return {
      structuralRewardPercentage: null,
      structuralRewardSource: null,
      structuralRewardUnavailableReason: "NO_STRUCTURAL_EXTREME_BEYOND_ENTRY",
    };
  }
  const best = candidates.reduce((a, b) => (b.pct > a.pct ? b : a));
  return {
    structuralRewardPercentage: best.pct,
    structuralRewardSource: best.source,
    structuralRewardUnavailableReason: null,
  };
}

type MagAcc = {
  trades: number;
  measured: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  rewardSum: number;
  rewardCount: number;
  riskSum: number;
  riskCount: number;
  rrSum: number;
  rrCount: number;
  rSum: number;
  rCount: number;
};

function emptyMagAcc(): MagAcc {
  return {
    trades: 0,
    measured: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    rewardSum: 0,
    rewardCount: 0,
    riskSum: 0,
    riskCount: 0,
    rrSum: 0,
    rrCount: 0,
    rSum: 0,
    rCount: 0,
  };
}

function addToMagAcc(
  acc: MagAcc,
  trade: IndependentTradeUnit,
  reward: number | null,
  risk: number | null,
  theoreticalR: number | null
): void {
  acc.trades += 1;
  if (trade.pathOutcome !== "NO_FUTURE_DATA" && trade.pathOutcome !== "INSUFFICIENT_CONTEXT") {
    acc.measured += 1;
  }
  const c = trade.policyClassification;
  if (isDecisive(c)) {
    acc.decisive += 1;
    if (isWin(c)) acc.wins += 1;
    else acc.losses += 1;
  } else if (isInconclusive(c)) acc.inconclusive += 1;
  else if (isUnresolved(c)) acc.unresolved += 1;
  if (reward !== null) {
    acc.rewardSum += reward;
    acc.rewardCount += 1;
  }
  if (risk !== null) {
    acc.riskSum += risk;
    acc.riskCount += 1;
  }
  if (trade.canonicalRrRatio !== null && Number.isFinite(trade.canonicalRrRatio)) {
    acc.rrSum += trade.canonicalRrRatio;
    acc.rrCount += 1;
  }
  if (theoreticalR !== null && Number.isFinite(theoreticalR)) {
    acc.rSum += theoreticalR;
    acc.rCount += 1;
  }
}

function magAccToMetrics(acc: MagAcc): TargetMagnitudeBucketMetrics {
  return {
    trades: acc.trades,
    measured: acc.measured,
    decisive: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    winRateDecisive: computeIndependentTradeWinRateDecisive(acc.wins, acc.losses),
    averageRewardPercentage:
      acc.rewardCount > 0 ? acc.rewardSum / acc.rewardCount : null,
    averageRiskPercentage: acc.riskCount > 0 ? acc.riskSum / acc.riskCount : null,
    averageCanonicalRR: acc.rrCount > 0 ? acc.rrSum / acc.rrCount : null,
    averageTheoreticalR: acc.rCount > 0 ? acc.rSum / acc.rCount : null,
    theoreticalRTradeCount: acc.rCount,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
  };
}

function toLargeMoveExample(
  trade: IndependentTradeUnit,
  reward: number | null,
  risk: number | null,
  theoreticalR: number | null,
  provenance: TargetProvenanceCategory,
  waveContext: string
): LargeMoveExampleRow {
  return {
    tradeId: trade.tradeId,
    evaluationBarIndex: trade.evaluationBarIndex,
    direction: trade.direction,
    entryReferencePrice: trade.entryReferencePrice,
    targetReferencePrice: trade.targetReferencePrice,
    invalidationReferencePrice: trade.invalidationReferencePrice,
    rewardPercentage: reward,
    riskPercentage: risk,
    canonicalRR: trade.canonicalRrRatio,
    waveContext,
    setupFamilyId: trade.setupFamilyId,
    targetProvenanceCategory: provenance,
    pathOutcome: trade.pathOutcome,
    tradeEvaluationStatus: trade.tradeEvaluationStatus as LargeMoveExampleRow["tradeEvaluationStatus"],
    evaluatorFirstFailure: trade.evaluatorFirstFailure,
    theoreticalR,
  };
}

export function buildHistoricalTargetProvenanceStructuralDistanceAnalysis(
  input: BuildHistoricalTargetProvenanceStructuralDistanceAnalysisInput
): HistoricalTargetProvenanceStructuralDistanceAnalysisReport {
  const { lifecycleReport, eligibilityAuditReport } = input;
  const theoreticalRByTradeId = new Map<string, number | null>();
  for (const row of eligibilityAuditReport.decisiveRows) {
    theoreticalRByTradeId.set(row.tradeId, row.theoreticalR);
  }

  const artifactBySnapshot = new Map<string, HistoricalMeasurementArtifactEntry>();
  for (const m of input.artifactMeasurements ?? []) {
    artifactBySnapshot.set(m.snapshotId, m);
  }

  let joinHits = 0;
  let joinMisses = 0;

  const magAcc = Object.fromEntries(
    TARGET_MAGNITUDE_REWARD_BUCKET_IDS.map((id) => [id, emptyMagAcc()])
  ) as Record<TargetMagnitudeRewardBucketId, MagAcc>;

  const perTradeProvenance: TargetProvenanceTradeRow[] = [];
  const structuralRows: StructuralDistanceTradeRow[] = [];
  const compressionValues: number[] = [];
  let structuralAltCount = 0;

  const waveMap = new Map<string, { trades: number; rewardSum: number; rewardN: number; wins: number; decisive: number }>();
  const provenanceMag = new Map<
    TargetProvenanceCategory,
    { trades: number; rewards: number[]; wins: number; decisive: number }
  >();

  const durationCross = new Map<string, MagAcc>();
  const evalCross = new Map<string, { trades: number; decisive: number; failedWin: number }>();
  const dirCross = new Map<string, { trades: number; decisive: number }>();
  const failCross = new Map<string, { trades: number; decisive: number; failedWin: number }>();
  const rrRewardCross = new Map<string, { trades: number; rewardSum: number; rewardN: number; riskSum: number; riskN: number }>();

  const allRewards: number[] = [];
  const allRisks: number[] = [];

  for (const trade of lifecycleReport.trades) {
    const artifact = artifactBySnapshot.get(trade.snapshotId);
    if (artifact) joinHits += 1;
    else joinMisses += 1;
    const evaluation = artifact?.evaluation ?? null;

    const { grossRewardPercentage, grossRiskPercentage } =
      computeGrossPriceMovePercentages(trade);
    const rewardBucket = classifyTargetMagnitudeRewardBucket(grossRewardPercentage);
    const theoreticalR = theoreticalRByTradeId.get(trade.tradeId) ?? null;
    addToMagAcc(magAcc[rewardBucket], trade, grossRewardPercentage, grossRiskPercentage, theoreticalR);

    if (grossRewardPercentage !== null) allRewards.push(grossRewardPercentage);
    if (grossRiskPercentage !== null) allRisks.push(grossRiskPercentage);

    const primary = classifyPrimaryTargetProvenance(evaluation);
    perTradeProvenance.push({
      tradeId: trade.tradeId,
      snapshotId: trade.snapshotId,
      evaluationBarIndex: trade.evaluationBarIndex,
      primaryProvenance: primary,
      supplementary: supplementaryProvenance(evaluation),
      targetModelId: evaluation?.references.target.modelId ?? null,
      targetPolicyId: evaluation?.references.target.policyId ?? null,
    });

    const provCat = primary.category;
    if (!provenanceMag.has(provCat)) {
      provenanceMag.set(provCat, { trades: 0, rewards: [], wins: 0, decisive: 0 });
    }
    const pm = provenanceMag.get(provCat)!;
    pm.trades += 1;
    if (grossRewardPercentage !== null) pm.rewards.push(grossRewardPercentage);
    if (isDecisive(trade.policyClassification)) {
      pm.decisive += 1;
      if (isWin(trade.policyClassification)) pm.wins += 1;
    }

    const leg = evaluation?.production?.openLegResolution.leg ?? null;
    const entry = trade.entryReferencePrice;
    let entryToAnchor: number | null = null;
    if (entry && leg && Number.isFinite(entry) && entry > 0) {
      entryToAnchor = (Math.abs(entry - leg.anchorPrice) / entry) * 100;
    }

    const structural = computeStructuralAlternativeReward(trade, evaluation);
    let compression: number | null = null;
    if (
      grossRewardPercentage !== null &&
      structural.structuralRewardPercentage !== null &&
      structural.structuralRewardPercentage > 0 &&
      structural.structuralRewardPercentage > grossRewardPercentage
    ) {
      structuralAltCount += 1;
      compression = 1 - grossRewardPercentage / structural.structuralRewardPercentage;
      compressionValues.push(compression);
    }

    structuralRows.push({
      tradeId: trade.tradeId,
      canonicalRewardPercentage: grossRewardPercentage,
      canonicalRiskPercentage: grossRiskPercentage,
      structuralRewardPercentage: structural.structuralRewardPercentage,
      structuralRewardSource: structural.structuralRewardSource,
      structuralRewardUnavailableReason: structural.structuralRewardUnavailableReason,
      targetCompressionPercentage: compression,
      entryToAnchorDistancePercentage: entryToAnchor,
      anchorPrice: leg?.anchorPrice ?? null,
      observedHigh: leg?.observedHigh ?? null,
      observedLow: leg?.observedLow ?? null,
    });

    const waveLabel =
      evaluation?.production?.prospectiveWaveLabel ??
      evaluation?.historicalSetup?.scenarioRef.waveLabel ??
      "UNKNOWN";
    const waveKey = `${waveLabel}|${trade.setupFamilyId}`;
    if (!waveMap.has(waveKey)) {
      waveMap.set(waveKey, { trades: 0, rewardSum: 0, rewardN: 0, wins: 0, decisive: 0 });
    }
    const w = waveMap.get(waveKey)!;
    w.trades += 1;
    if (grossRewardPercentage !== null) {
      w.rewardSum += grossRewardPercentage;
      w.rewardN += 1;
    }
    if (isDecisive(trade.policyClassification)) {
      w.decisive += 1;
      if (isWin(trade.policyClassification)) w.wins += 1;
    }

    const dur = resolveDurationBucket(trade.lifecycleDurationBars);
    if (dur) {
      const dk = `${dur}|${rewardBucket}`;
      if (!durationCross.has(dk)) durationCross.set(dk, emptyMagAcc());
      addToMagAcc(durationCross.get(dk)!, trade, grossRewardPercentage, grossRiskPercentage, theoreticalR);
    }

    const ek = `${rewardBucket}|${trade.tradeEvaluationStatus}`;
    if (!evalCross.has(ek)) evalCross.set(ek, { trades: 0, decisive: 0, failedWin: 0 });
    const ev = evalCross.get(ek)!;
    ev.trades += 1;
    if (isDecisive(trade.policyClassification)) ev.decisive += 1;
    if (trade.tradeEvaluationStatus === "FAILED" && isWin(trade.policyClassification)) {
      ev.failedWin += 1;
    }

    const dirKey = `${rewardBucket}|${trade.direction ?? "UNRESOLVED"}`;
    if (!dirCross.has(dirKey)) dirCross.set(dirKey, { trades: 0, decisive: 0 });
    const dc = dirCross.get(dirKey)!;
    dc.trades += 1;
    if (isDecisive(trade.policyClassification)) dc.decisive += 1;

    const fr = trade.evaluatorFirstFailure ?? "NONE";
    const fk = `${rewardBucket}|${fr}`;
    if (!failCross.has(fk)) failCross.set(fk, { trades: 0, decisive: 0, failedWin: 0 });
    const fc = failCross.get(fk)!;
    fc.trades += 1;
    if (isDecisive(trade.policyClassification)) fc.decisive += 1;
    if (trade.tradeEvaluationStatus === "FAILED" && isWin(trade.policyClassification)) {
      fc.failedWin += 1;
    }

    const rrB = classifyHistoricalMeasurementRrBucketRow(trade.canonicalRrRatio);
    const rk = `${rrB}|${rewardBucket}`;
    if (!rrRewardCross.has(rk)) {
      rrRewardCross.set(rk, { trades: 0, rewardSum: 0, rewardN: 0, riskSum: 0, riskN: 0 });
    }
    const rc = rrRewardCross.get(rk)!;
    rc.trades += 1;
    if (grossRewardPercentage !== null) {
      rc.rewardSum += grossRewardPercentage;
      rc.rewardN += 1;
    }
    if (grossRiskPercentage !== null) {
      rc.riskSum += grossRiskPercentage;
      rc.riskN += 1;
    }
  }

  const rewardByBucket = Object.fromEntries(
    TARGET_MAGNITUDE_REWARD_BUCKET_IDS.map((id) => [id, magAccToMetrics(magAcc[id])])
  ) as HistoricalTargetProvenanceStructuralDistanceAnalysisReport["rewardMagnitude"]["byBucket"];

  const gte3 = lifecycleReport.trades
    .map((t, i) => ({ t, row: structuralRows[i]! }))
    .filter((x) => (x.row.canonicalRewardPercentage ?? 0) >= 3)
    .slice(0, 10);
  const gte5 = lifecycleReport.trades
    .map((t, i) => ({ t, row: structuralRows[i]! }))
    .filter((x) => (x.row.canonicalRewardPercentage ?? 0) >= 5)
    .slice(0, 10);
  const gte10 = lifecycleReport.trades
    .map((t, i) => ({ t, row: structuralRows[i]! }))
    .filter((x) => (x.row.canonicalRewardPercentage ?? 0) >= 10)
    .slice(0, 10);

  const emptyNotes: string[] = [];
  if (gte3.length === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 3%.");
  }
  if (gte5.length === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 5%.");
  }
  if (gte10.length === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 10%.");
  }

  const exampleFrom = (pairs: { t: IndependentTradeUnit; row: StructuralDistanceTradeRow }[]) =>
    pairs.map(({ t, row }) => {
      const ev = artifactBySnapshot.get(t.snapshotId)?.evaluation ?? null;
      const wave =
        ev?.production?.prospectiveWaveLabel ??
        ev?.historicalSetup?.scenarioRef.waveLabel ??
        "UNKNOWN";
      const prov = classifyPrimaryTargetProvenance(ev).category;
      return toLargeMoveExample(
        t,
        row.canonicalRewardPercentage,
        row.canonicalRiskPercentage,
        theoreticalRByTradeId.get(t.tradeId) ?? null,
        prov,
        wave
      );
    });

  const targetProvenanceByMagnitude = [...provenanceMag.entries()].map(
    ([category, v]) => ({
      provenanceCategory: category,
      trades: v.trades,
      averageRewardPercentage:
        v.rewards.length ? v.rewards.reduce((a, b) => a + b, 0) / v.rewards.length : null,
      medianRewardPercentage: median(v.rewards),
      decisiveWinRate: computeIndependentTradeWinRateDecisive(v.wins, v.decisive - v.wins),
      interpretWithCaution: v.decisive < 30,
    })
  );

  const countGte = (min: number) =>
    lifecycleReport.trades.filter((t) => {
      const g = computeGrossPriceMovePercentages(t);
      return (g.grossRewardPercentage ?? 0) >= min;
    }).length;

  const diagnosticSummary = [
    `Frozen population %3+ canonical target trades: ${countGte(3)} (${countGte(3) > 0 ? "present" : "none"}).`,
    `Frozen population %5+ canonical target trades: ${countGte(5)} (${countGte(5) > 0 ? "present" : "none"}).`,
    `Frozen population %10+ canonical target trades: ${countGte(10)} (${countGte(10) > 0 ? "present" : "none"}).`,
    `Wave context slices: ${waveMap.size} distinct waveLabel×setupFamily groups.`,
    `Trades with measurable structural alternative beyond canonical target: ${structuralAltCount}.`,
    `Majority of targets are below 1% reward: ${rewardByBucket.REWARD_LT_0_10.trades + rewardByBucket.REWARD_0_10_TO_0_25.trades + rewardByBucket.REWARD_0_25_TO_0_50.trades} of ${lifecycleReport.trades.length} trades in <=0.5% buckets.`,
    `FAILED + FAVORABLE (failed win) count: ${lifecycleReport.trades.filter((t) => t.tradeEvaluationStatus === "FAILED" && t.policyClassification === "FAVORABLE_RESOLUTION").length}; see rewardByFailureReason.`,
    `Large reward bucket (>=3%) decisive win rate: ${rewardByBucket.REWARD_3_00_TO_5_00.winRateDecisive.value ?? "n/a"} (decisive ${rewardByBucket.REWARD_3_00_TO_5_00.decisive}).`,
    `Large reward buckets sample size quality: >=3% decisive=${rewardByBucket.REWARD_3_00_TO_5_00.decisive + rewardByBucket.REWARD_5_00_TO_10_00.decisive + rewardByBucket.REWARD_GTE_10_00.decisive}.`,
    "Not established from this observational dataset: whether larger canonical targets are 'better' (no strategy conclusion).",
  ];

  return {
    schemaVersion:
      HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION,
    population: {
      independentTrades: lifecycleReport.trades.length,
      artifactJoinHits: joinHits,
      artifactJoinMisses: joinMisses,
    },
    targetProvenance: {
      canonicalSourceAudit: CANONICAL_SOURCE_AUDIT,
      populationPrimaryCategory: "STRUCTURAL_LEVEL_REFERENCE",
      perTrade: perTradeProvenance,
      fibonacciProvenanceNote:
        "Fibonacci provenance not established for frozen historical prospective references (displacement equality policy).",
    },
    rewardMagnitude: {
      contractVersion: "1.0",
      thresholdsPercent: TARGET_MAGNITUDE_REWARD_BUCKET_THRESHOLDS_PERCENT,
      byBucket: rewardByBucket,
    },
    riskMagnitude: {
      note: "Risk % from B-12r geometry on lifecycle invalidation reference.",
      averageRiskPercentage:
        allRisks.length ? allRisks.reduce((a, b) => a + b, 0) / allRisks.length : null,
      medianRiskPercentage: median(allRisks),
    },
    structuralDistance: {
      rows: structuralRows,
      canonicalVsStructural: {
        tradesWithStructuralAlternative: structuralAltCount,
        tradesWithCompression: compressionValues.length,
        averageCompressionPercentage:
          compressionValues.length
            ? compressionValues.reduce((a, b) => a + b, 0) / compressionValues.length
            : null,
        medianCompressionPercentage: median(compressionValues),
        note:
          "Compression compares canonical target reward % to max frozen open-leg/scenario extreme distance at E (observational).",
      },
    },
    waveContext: [...waveMap.entries()].map(([key, v]) => {
      const [waveLabel, setupFamilyId] = key.split("|");
      return {
        waveLabel,
        setupFamilyId,
        productionStatus: null,
        trades: v.trades,
        averageRewardPercentage: v.rewardN ? v.rewardSum / v.rewardN : null,
        decisiveWinRate: computeIndependentTradeWinRateDecisive(
          v.wins,
          v.decisive - v.wins
        ),
      };
    }),
    fibonacciContext: {
      fibonacciProvenanceEstablished: false,
      note: "No Fibonacci price reference in frozen prospective evaluation snapshot.",
      entryFibRelation: "UNAVAILABLE",
      targetFibRelation: "UNAVAILABLE",
      fibReferenceType: "UNAVAILABLE",
    },
    targetProvenanceByMagnitude,
    rewardByDuration: [...durationCross.entries()].map(([key, acc]) => {
      const [durationBucket, rewardBucket] = key.split("|") as [
        IndependentTradeDurationBucketId,
        TargetMagnitudeRewardBucketId,
      ];
      return {
        durationBucket,
        rewardBucket,
        trades: acc.trades,
        decisive: acc.decisive,
        wins: acc.wins,
        losses: acc.losses,
      };
    }),
    rewardByEvaluator: [...evalCross.entries()].map(([key, v]) => {
      const [rewardBucket, evaluationStatus] = key.split("|") as [
        TargetMagnitudeRewardBucketId,
        TradeEvaluationStatus,
      ];
      return {
        rewardBucket,
        evaluationStatus,
        trades: v.trades,
        decisive: v.decisive,
        failedWinCount: v.failedWin,
      };
    }),
    rewardByDirection: [...dirCross.entries()].map(([key, v]) => {
      const [rewardBucket, direction] = key.split("|") as [
        TargetMagnitudeRewardBucketId,
        string,
      ];
      return {
        rewardBucket,
        direction,
        trades: v.trades,
        decisive: v.decisive,
      };
    }),
    rewardByFailureReason: [...failCross.entries()].map(([key, v]) => {
      const [rewardBucket, failureReason] = key.split("|") as [
        TargetMagnitudeRewardBucketId,
        string,
      ];
      return {
        rewardBucket,
        failureReason,
        trades: v.trades,
        decisive: v.decisive,
        failedWinCount: v.failedWin,
      };
    }),
    rewardByProspectiveRr: [...rrRewardCross.entries()].map(([key, v]) => {
      const [prospectiveRrBucket, rewardBucket] = key.split("|") as [
        (typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number],
        TargetMagnitudeRewardBucketId,
      ];
      return {
        prospectiveRrBucket,
        rewardBucket,
        trades: v.trades,
        averageRewardPercentage: v.rewardN ? v.rewardSum / v.rewardN : null,
        averageRiskPercentage: v.riskN ? v.riskSum / v.riskN : null,
      };
    }),
    largeMoveExamples: {
      gte3Percent: exampleFrom(gte3),
      gte5Percent: exampleFrom(gte5),
      gte10Percent: exampleFrom(gte10),
      emptyBucketNotes: emptyNotes,
    },
    canonicalVsStructuralAnalysis: {
      structuralReferenceQuestion:
        "Mevcut canonical entry'den sonra fiyatın daha uzak bir structural, wave veya Fibonacci reference'a ulaşması mümkün olan trade'ler var mı?",
      answer:
        structuralAltCount > 0
          ? `${structuralAltCount} trade'de frozen open-leg/scenario extreme, canonical target'tan daha uzak bir yüzde mesafe gösteriyor (E-prefix verisi; forward üretim yok).`
          : "Frozen open-leg/scenario extreme verisi ile canonical target'tan daha uzak mesafe gösteren trade bulunamadı veya open leg join eksik.",
      tradesWithMeasurableStructuralAlternative: structuralAltCount,
    },
    diagnosticSummary,
    warnings: [...WARNINGS],
    lookaheadAttestation: {
      noFutureBarReferenceSynthesis: true,
      detail:
        "Structural extremes and scenario endpoints are frozen evaluation fields; no post-E candle synthesis for references.",
    },
    consumedReports: {
      lifecycleSchemaVersion: lifecycleReport.schemaVersion,
      eligibilityAuditSchemaVersion: eligibilityAuditReport.schemaVersion,
      b12pSchemaVersion:
        input.rrThresholdTheoreticalRAnalysisReport?.schemaVersion ?? null,
      failureReasonSchemaVersion:
        input.historicalEvaluatorFailureReasonAnalysisReport?.schemaVersion ??
        null,
    },
  };
}
