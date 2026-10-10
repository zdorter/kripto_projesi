import { computeGrossPriceMovePercentages } from "./historical-entry-price-move-quality-analysis";
import {
  classifyTargetMagnitudeRewardBucket,
} from "./historical-target-provenance-structural-distance-analysis";
import type { TargetMagnitudeRewardBucketId } from "./historical-target-provenance-structural-distance-analysis-types";
import type { HistoricalMeasurementEvaluationSnapshot } from "./setup/historical-measurement-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import { projectProspectiveOpenLegDisplacementEqualityTarget } from "./setup/prospective-open-leg-displacement-equality-policy";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import {
  HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION,
  type AnchorProvenanceRow,
  type BuildHistoricalDisplacementEqualityTargetMechanicsAnalysisInput,
  type DisplacementMechanicsTradeRow,
  type HistoricalDisplacementEqualityTargetMechanicsAnalysisReport,
  type HypothesisTestResult,
  type MechanicsExampleRow,
} from "./historical-displacement-equality-target-mechanics-analysis-types";

const TARGET_PRICE_EPSILON = 1e-8;
const RATIO_NEAR_ONE_EPSILON = 1e-6;

const WARNINGS: readonly string[] = [
  "observational_mechanics_research_only",
  "target_formula_not_target_strategy_quality",
  "gross_target_distance_excludes_fees_slippage_execution_funding",
  "no_causality",
  "no_pnl",
  "no_strategy_recommendation",
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

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}

function displacementRatioBucket(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "UNAVAILABLE";
  if (Math.abs(r - 1) <= RATIO_NEAR_ONE_EPSILON) return "RATIO_NEAR_1";
  if (r < 0.99) return "RATIO_LT_1";
  return "RATIO_GT_1";
}

function computeStructuralBeyondCanonical(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null,
  canonicalRewardPct: number | null
): { beyond: boolean; structuralPct: number | null; ratio: number | null } {
  const entry = trade.entryReferencePrice;
  const leg = evaluation?.production?.openLegResolution.leg ?? null;
  if (entry === null || !Number.isFinite(entry) || entry <= 0 || !leg) {
    return { beyond: false, structuralPct: null, ratio: null };
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
  }
  if (candidates.length === 0 || canonicalRewardPct === null) {
    return { beyond: false, structuralPct: null, ratio: null };
  }
  const structuralPct = Math.max(...candidates);
  const beyond = structuralPct > canonicalRewardPct;
  const ratio =
    canonicalRewardPct > 0 ? structuralPct / canonicalRewardPct : null;
  return { beyond, structuralPct, ratio };
}

function toExampleRow(
  trade: IndependentTradeUnit,
  row: DisplacementMechanicsTradeRow,
  waveLabel: string
): MechanicsExampleRow {
  return {
    tradeId: trade.tradeId,
    evaluationBarIndex: trade.evaluationBarIndex,
    direction: trade.direction ?? "UNRESOLVED",
    anchorPrice: row.anchorPrice,
    entryPrice: row.entryPrice,
    targetPrice: row.targetPrice,
    invalidationPrice: row.invalidationPrice,
    anchorEntryDistance: row.anchorEntryDistance,
    entryTargetDistance: row.entryTargetDistance,
    displacementRatio: row.displacementRatio,
    rewardPercentage: row.rewardPercentage,
    riskPercentage: row.riskPercentage,
    canonicalRrRatio: row.canonicalRrRatio,
    waveLabel,
    setupFamilyId: trade.setupFamilyId,
    targetProvenance: "STRUCTURAL_LEVEL_REFERENCE",
    pathOutcome: trade.pathOutcome,
    evaluationStatus: trade.tradeEvaluationStatus,
  };
}

function buildPerTradeRow(
  trade: IndependentTradeUnit,
  evaluation: HistoricalMeasurementEvaluationSnapshot | null
): DisplacementMechanicsTradeRow {
  const leg = evaluation?.production?.openLegResolution.leg ?? null;
  const anchorPrice = leg?.anchorPrice ?? null;
  const entryPrice = trade.entryReferencePrice;
  const targetPrice = trade.targetReferencePrice;
  const invalidationPrice = trade.invalidationReferencePrice;

  let signedDisplacement: number | null = null;
  let anchorEntryDistance: number | null = null;
  let entryTargetDistance: number | null = null;
  let displacementRatio: number | null = null;
  let displacementPercentage: number | null = null;
  let expectedTarget: number | null = null;
  let targetFormulaDelta: number | null = null;

  if (
    anchorPrice !== null &&
    entryPrice !== null &&
    Number.isFinite(anchorPrice) &&
    Number.isFinite(entryPrice)
  ) {
    signedDisplacement = entryPrice - anchorPrice;
    anchorEntryDistance = Math.abs(signedDisplacement);
    if (entryPrice > 0) {
      displacementPercentage = (anchorEntryDistance / entryPrice) * 100;
    }
  }

  if (entryPrice !== null && targetPrice !== null && Number.isFinite(targetPrice)) {
    entryTargetDistance = Math.abs(targetPrice - entryPrice);
    if (anchorEntryDistance !== null && anchorEntryDistance > 0) {
      displacementRatio = entryTargetDistance / anchorEntryDistance;
    }
  }

  if (anchorPrice !== null && entryPrice !== null && Number.isFinite(anchorPrice)) {
    expectedTarget = projectProspectiveOpenLegDisplacementEqualityTarget(
      anchorPrice,
      entryPrice
    );
    if (targetPrice !== null && Number.isFinite(targetPrice)) {
      targetFormulaDelta = targetPrice - expectedTarget;
    }
  }

  const { grossRewardPercentage, grossRiskPercentage } =
    computeGrossPriceMovePercentages(trade);

  return {
    tradeId: trade.tradeId,
    evaluationBarIndex: trade.evaluationBarIndex,
    direction: trade.direction ?? "UNRESOLVED",
    anchorPrice,
    entryPrice,
    targetPrice,
    invalidationPrice,
    signedDisplacement,
    displacementPercentage,
    anchorEntryDistance,
    entryTargetDistance,
    displacementRatio,
    expectedTargetFromFormula: expectedTarget,
    targetFormulaDelta,
    rewardPercentage: grossRewardPercentage,
    riskPercentage: grossRiskPercentage,
    canonicalRrRatio: trade.canonicalRrRatio,
    openLegSpanBars: leg?.observationSpanBars ?? null,
    anchorSources: leg?.selectedAnchorSources ?? null,
  };
}

const ANCHOR_PROVENANCE_ROWS: readonly AnchorProvenanceRow[] = [
  {
    field: "openLegResolution.leg.anchorPrice",
    source: "Open structural leg anchor candidate selection at evaluation bar",
    functionName: "resolveOpenStructuralLeg / buildLeg",
    meaning: "Confirmed structural anchor price used as displacement origin",
    evidence: "DIRECT",
  },
  {
    field: "selectedAnchorSources",
    source: "CONFIRMED_SWING | HISTORICAL_SETUP_ENDPOINT | SCENARIO_FOCUS_ENDPOINT",
    functionName: "corroborationAtStructuralPoint",
    meaning: "Anchor may be swing price or scenario endpoint price at anchorIndex",
    evidence: "DIRECT",
  },
  {
    field: "historicalSetup.sourceScenario.endPrice",
    source: "Candidate-scoped completed source endpoint",
    functionName: "resolveCandidateScopedOpenLeg",
    meaning: "When scoped mode selects setup endpoint as anchor",
    evidence: "DERIVED",
  },
];

export function buildHistoricalDisplacementEqualityTargetMechanicsAnalysis(
  input: BuildHistoricalDisplacementEqualityTargetMechanicsAnalysisInput
): HistoricalDisplacementEqualityTargetMechanicsAnalysisReport {
  const { lifecycleReport, artifactMeasurements } = input;
  const artifactBySnapshot = new Map(
    artifactMeasurements.map((m) => [m.snapshotId, m])
  );

  let joinHits = 0;
  let joinMisses = 0;
  let withAnchor = 0;
  const perTrade: DisplacementMechanicsTradeRow[] = [];
  const ratios: number[] = [];
  const formulaMismatches: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport["formulaMismatches"][number][] =
    [];
  let exactEquality = 0;
  let nearEquality = 0;
  let mismatchRatio = 0;
  let formulaMatch = 0;
  let formulaMismatch = 0;
  const rewardBucketCounts: Partial<Record<TargetMagnitudeRewardBucketId, number>> =
    {};
  const anchorEntryPcts: number[] = [];
  const rewardPcts: number[] = [];
  const pairedAnchorReward: { a: number; r: number }[] = [];
  let rewardMatchesAnchorEntryPct = 0;
  const waveMap = new Map<
    string,
    { trades: number; ratios: number[]; rewards: number[] }
  >();
  const dispRrCross = new Map<string, number>();
  let structuralBeyond = 0;
  const structuralRatios: number[] = [];
  let gte3 = 0;
  let gte5 = 0;
  let gte10 = 0;
  let fibArtifactScan = false;

  const failedWinRows: DisplacementMechanicsTradeRow[] = [];
  let rrBelowMinFailedWin = 0;

  for (const trade of lifecycleReport.trades) {
    const artifact = artifactBySnapshot.get(trade.snapshotId);
    if (artifact) joinHits += 1;
    else joinMisses += 1;
    const evaluation = artifact?.evaluation ?? null;
    if (evaluation && JSON.stringify(evaluation).includes("fibonacci")) {
      fibArtifactScan = true;
    }

    const row = buildPerTradeRow(trade, evaluation);
    perTrade.push(row);

    if (row.anchorPrice !== null) withAnchor += 1;

    const bucket = classifyTargetMagnitudeRewardBucket(row.rewardPercentage);
    rewardBucketCounts[bucket] = (rewardBucketCounts[bucket] ?? 0) + 1;

    if (row.rewardPercentage !== null && row.rewardPercentage >= 3) gte3 += 1;
    if (row.rewardPercentage !== null && row.rewardPercentage >= 5) gte5 += 1;
    if (row.rewardPercentage !== null && row.rewardPercentage >= 10) gte10 += 1;

    if (row.displacementRatio !== null && Number.isFinite(row.displacementRatio)) {
      ratios.push(row.displacementRatio);
      if (Math.abs(row.displacementRatio - 1) <= RATIO_NEAR_ONE_EPSILON) {
        exactEquality += 1;
        nearEquality += 1;
      } else if (Math.abs(row.displacementRatio - 1) <= 1e-4) {
        nearEquality += 1;
      } else {
        mismatchRatio += 1;
      }
    }

    if (
      row.expectedTargetFromFormula !== null &&
      row.targetPrice !== null &&
      row.targetFormulaDelta !== null
    ) {
      if (Math.abs(row.targetFormulaDelta) <= TARGET_PRICE_EPSILON) {
        formulaMatch += 1;
      } else {
        formulaMismatch += 1;
        formulaMismatches.push({
          tradeId: trade.tradeId,
          expected: row.expectedTargetFromFormula,
          actual: row.targetPrice,
          difference: row.targetFormulaDelta,
          direction: row.direction,
        });
      }
    }

    if (
      row.displacementPercentage !== null &&
      row.rewardPercentage !== null &&
      Math.abs(row.displacementPercentage - row.rewardPercentage) <= 1e-4
    ) {
      rewardMatchesAnchorEntryPct += 1;
    }
    if (row.displacementPercentage !== null) anchorEntryPcts.push(row.displacementPercentage);
    if (row.rewardPercentage !== null) rewardPcts.push(row.rewardPercentage);
    if (row.displacementPercentage !== null && row.rewardPercentage !== null) {
      pairedAnchorReward.push({
        a: row.displacementPercentage,
        r: row.rewardPercentage,
      });
    }

    const waveLabel =
      evaluation?.production?.prospectiveWaveLabel ??
      evaluation?.historicalSetup?.scenarioRef.waveLabel ??
      "UNKNOWN";
    const wk = `${waveLabel}|${trade.setupFamilyId}`;
    if (!waveMap.has(wk)) waveMap.set(wk, { trades: 0, ratios: [], rewards: [] });
    const w = waveMap.get(wk)!;
    w.trades += 1;
    if (row.displacementRatio !== null) w.ratios.push(row.displacementRatio);
    if (row.rewardPercentage !== null) w.rewards.push(row.rewardPercentage);

    const drb = displacementRatioBucket(row.displacementRatio);
    const rrb = classifyHistoricalMeasurementRrBucketRow(trade.canonicalRrRatio);
    const crossKey = `${drb}|${rrb}`;
    dispRrCross.set(crossKey, (dispRrCross.get(crossKey) ?? 0) + 1);

    const struct = computeStructuralBeyondCanonical(
      trade,
      evaluation,
      row.rewardPercentage
    );
    if (struct.beyond) {
      structuralBeyond += 1;
      if (struct.ratio !== null) structuralRatios.push(struct.ratio);
    }

    if (
      trade.tradeEvaluationStatus === "FAILED" &&
      trade.policyClassification === "FAVORABLE_RESOLUTION"
    ) {
      failedWinRows.push(row);
      if (trade.evaluatorFirstFailure === "RR_BELOW_MINIMUM") {
        rrBelowMinFailedWin += 1;
      }
    }
  }

  const tradesWithRatio = ratios.length;
  const displacementEquality: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport["displacementEquality"] =
    {
      trades: lifecycleReport.trades.length,
      tradesWithAnchor: withAnchor,
      equalityRatioMean: mean(ratios),
      equalityRatioMedian: median(ratios),
      equalityRatioMin: ratios.length ? Math.min(...ratios) : null,
      equalityRatioMax: ratios.length ? Math.max(...ratios) : null,
      exactEqualityCount: exactEquality,
      nearEqualityCount: nearEquality,
      mismatchCount: mismatchRatio,
      formulaValidationMatchCount: formulaMatch,
      formulaValidationMismatchCount: formulaMismatch,
    };

  const verifiedFrozen =
    lifecycleReport.trades.length > 0 && formulaMismatch === 0 && withAnchor > 0;

  const hypothesisTests: HypothesisTestResult[] = [
    {
      hypothesisId: "H1",
      statement: "Target is small because anchor→entry displacement is small",
      outcome:
        anchorEntryPcts.length > 0 && mean(anchorEntryPcts)! < 1
          ? "SUPPORTED_ON_DATA"
          : "PARTIAL",
      note: "Reward % tracks |entry−anchor|/entry when displacement equality holds.",
    },
    {
      hypothesisId: "H2",
      statement: "Target is small because open leg span is short",
      outcome: "PARTIAL",
      note: "Shorter spans often imply smaller anchor→entry move at E; observational only.",
    },
    {
      hypothesisId: "H3",
      statement: "Target is small because anchor is close to entry at E",
      outcome:
        anchorEntryPcts.length > 0 && mean(anchorEntryPcts)! < 1
          ? "SUPPORTED_ON_DATA"
          : "NOT_SUPPORTED",
      note: "Mean anchor-entry displacement % reported in targetMagnitude.",
    },
    {
      hypothesisId: "H4",
      statement: "Projection formula produces 1:1 entry-target vs anchor-entry distance",
      outcome:
        tradesWithRatio > 0 && mismatchRatio === 0
          ? "SUPPORTED_ON_DATA"
          : formulaMismatch > 0
            ? "NOT_SUPPORTED"
            : "PARTIAL",
      note: `B/A ratio mismatches: ${mismatchRatio}; formula price mismatches: ${formulaMismatch}.`,
    },
    {
      hypothesisId: "H5",
      statement: "Target magnitude relates to wave type / setup family",
      outcome: waveMap.size > 1 ? "PARTIAL" : "NOT_ESTABLISHED",
      note: "See waveContext; no new wave taxonomy introduced.",
    },
    {
      hypothesisId: "H6",
      statement: "Target magnitude relates to Fibonacci",
      outcome: "NOT_ESTABLISHED",
      note: "Fibonacci is not part of the canonical target formula.",
    },
  ];

  const sortedByReward = [...perTrade].sort(
    (a, b) => (a.rewardPercentage ?? 0) - (b.rewardPercentage ?? 0)
  );
  const tradeById = new Map(lifecycleReport.trades.map((t) => [t.tradeId, t]));

  const exampleFor = (row: DisplacementMechanicsTradeRow): MechanicsExampleRow => {
    const t = tradeById.get(row.tradeId)!;
    const ev = artifactBySnapshot.get(t.snapshotId)?.evaluation ?? null;
    const wave =
      ev?.production?.prospectiveWaveLabel ??
      ev?.historicalSetup?.scenarioRef.waveLabel ??
      "UNKNOWN";
    return toExampleRow(t, row, wave);
  };

  const normal = perTrade
    .filter((r) => r.anchorPrice !== null && r.targetFormulaDelta !== null)
    .slice(0, 10)
    .map(exampleFor);
  const smallReward = sortedByReward.slice(0, 5).map(exampleFor);
  const largeReward = sortedByReward.slice(-5).reverse().map(exampleFor);
  const gte3Rows = perTrade
    .filter((r) => (r.rewardPercentage ?? 0) >= 3)
    .slice(0, 10)
    .map(exampleFor);
  const gte5Rows = perTrade
    .filter((r) => (r.rewardPercentage ?? 0) >= 5)
    .slice(0, 10)
    .map(exampleFor);
  const gte10Rows = perTrade
    .filter((r) => (r.rewardPercentage ?? 0) >= 10)
    .slice(0, 10)
    .map(exampleFor);

  const emptyNotes: string[] = [];
  if (gte3 === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 3%.");
  }
  if (gte5 === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 5%.");
  }
  if (gte10 === 0) {
    emptyNotes.push("Frozen population contains no trades with canonical reward >= 10%.");
  }

  const diagnosticSummary = [
    {
      question: "What is the exact target formula?",
      answer:
        "targetPrice = entryPrice + (entryPrice - anchorPrice) = 2 * entryPrice - anchorPrice (projectProspectiveOpenLegDisplacementEqualityTarget).",
    },
    {
      question: "Where does anchor come from?",
      answer:
        "openLegResolution.leg.anchorPrice from resolveOpenStructuralLeg at evaluation bar; sources may include CONFIRMED_SWING, HISTORICAL_SETUP_ENDPOINT, or SCENARIO_FOCUS_ENDPOINT.",
    },
    {
      question: "What is open leg?",
      answer:
        "Confirmed structural anchor through evaluation bar close: observation span anchorIndex→E with prefix candle high/low (open-structural-leg.ts buildLeg).",
    },
    {
      question: "Is anchor→entry distance equal to entry→target distance?",
      answer:
        tradesWithRatio > 0 && mismatchRatio === 0
          ? "Yes on frozen population where anchor is available (B/A ≈ 1)."
          : `Observed ${mismatchRatio} B/A mismatches among ${tradesWithRatio} measured trades.`,
    },
    {
      question: "Which variable most determines target size?",
      answer: "|entryPrice − anchorPrice| (signed displacement magnitude) at evaluation.",
    },
    {
      question: "Why are targets mostly small?",
      answer:
        mean(anchorEntryPcts) !== null
          ? `Anchor→entry displacement % mean ≈ ${mean(anchorEntryPcts)!.toFixed(4)}; reward % mean ≈ ${mean(rewardPcts)?.toFixed(4) ?? "n/a"} (1:1 under equality).`
          : "Insufficient anchor joins.",
    },
    {
      question: "Is Fibonacci part of the target formula?",
      answer: "No. Fibonacci is not part of the canonical target formula.",
    },
    {
      question: "Is wave part of the target formula?",
      answer:
        "No direct wave endpoint in target price; wave labels are contextual only for open-leg anchor selection.",
    },
    {
      question: "Is there a gap vs structural reference?",
      answer:
        structuralBeyond > 0
          ? `Yes for ${structuralBeyond} trades: frozen open-leg extreme or scenario endPrice beyond canonical target (observational).`
          : "No measurable beyond-canonical structural reference on joined trades.",
    },
    {
      question: "Any >=3% canonical targets?",
      answer: gte3 > 0 ? `Yes: ${gte3} trades.` : "No in frozen population.",
    },
    {
      question: "Any >=5% canonical targets?",
      answer: gte5 > 0 ? `Yes: ${gte5} trades.` : "No in frozen population.",
    },
    {
      question: "Any >=10% canonical targets?",
      answer: gte10 > 0 ? `Yes: ${gte10} trades.` : "No in frozen population.",
    },
    {
      question:
        "Could the system end large structural moves at an earlier canonical target?",
      answer:
        structuralBeyond > 0
          ? "Could be associated with canonical target distance smaller than prefix structural extremes already stored at E (observational only)."
          : "Not established from structural fields on this population.",
    },
  ];

  return {
    schemaVersion: HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION,
    population: {
      independentTrades: lifecycleReport.trades.length,
      artifactJoinHits: joinHits,
      artifactJoinMisses: joinMisses,
      tradesWithOpenLegAnchor: withAnchor,
    },
    targetFormula: {
      functionName: "projectProspectiveOpenLegDisplacementEqualityTarget",
      sourceFile: "setup/prospective-open-leg-displacement-equality-policy.ts",
      formulaText: "target = entryPrice + (entryPrice - anchorPrice)",
      variables: [
        { name: "anchorPrice", description: "Open leg anchor at evaluation" },
        { name: "entryPrice", description: "Evaluation bar close (entry reference)" },
        {
          name: "signedDisplacement",
          description: "entryPrice - anchorPrice",
        },
        {
          name: "targetPrice",
          description: "entryPrice + signedDisplacement",
        },
      ],
      bullishFormula: "target = entry + (entry - anchor) when entry > anchor",
      bearishFormula: "target = entry + (entry - anchor) when entry < anchor",
      equalityDefinition:
        "Entry→target signed displacement equals anchor→entry signed displacement (mirror beyond entry).",
      verifiedOnFrozenPopulation: verifiedFrozen,
      mismatchCount: formulaMismatch,
    },
    anchorAnalysis: {
      summary:
        "Anchor is the selected open structural leg origin at evaluation; price is structural (swing or scenario endpoint), not Fibonacci.",
      isAnchorSwingPrice:
        "Often yes when CONFIRMED_SWING is among selectedAnchorSources; not exclusively swing.",
      rows: ANCHOR_PROVENANCE_ROWS,
    },
    openLegAnalysis: {
      definitionSourceModule: "setup/open-structural-leg.ts",
      definitionSourceFunction: "resolveOpenStructuralLeg / buildLeg",
      answers: [
        {
          question: "Where created?",
          answer: "production.openLegResolution during prospective measurement at E",
          evidence: "prospective-reference-evaluation.ts uses leg.anchorPrice",
        },
        {
          question: "Between which points?",
          answer: "anchorIndex → evaluationBarIndex (inclusive prefix candles)",
          evidence: "buildLeg observationSpanBars = E - anchorIndex",
        },
        {
          question: "Start point?",
          answer: "anchorIndex / anchorPrice (selected anchor candidate)",
          evidence: "open-structural-leg-types OpenStructuralLeg.startPrice",
        },
        {
          question: "End point?",
          answer: "Evaluation bar close as evaluationPrice; observation ends at E",
          evidence: "buildLeg evaluationBarIndex",
        },
        {
          question: "Price difference?",
          answer: "signedDisplacement = evaluationPrice - anchorPrice for target policy",
          evidence: "prospective-open-leg-displacement-equality-policy.ts",
        },
        {
          question: "Direction?",
          answer: "BULLISH if evaluationPrice > anchorPrice else BEARISH",
          evidence: "observedDirection() in open-structural-leg.ts",
        },
        {
          question: "Future candles?",
          answer: "No; range uses candles[anchorIndex..evaluationBarIndex] at E",
          evidence: "pricePathRange with toIndex <= evaluationBarIndex",
        },
        {
          question: "Information at E?",
          answer: "anchor, observedHigh/Low on prefix path, evaluation close",
          evidence: "OpenStructuralLeg fields",
        },
      ],
    },
    displacementEquality,
    targetMagnitude: {
      rewardBucketCounts,
      anchorEntryDisplacementPercentMean: mean(anchorEntryPcts),
      rewardPercentMean: mean(rewardPcts),
      rewardMatchesAnchorEntryDisplacementPercentCount: rewardMatchesAnchorEntryPct,
      perTrade,
    },
    structuralComparison: {
      tradesWithStructuralBeyondCanonical: structuralBeyond,
      meanStructuralToCanonicalRatio: mean(structuralRatios),
      note:
        "Structural reference uses frozen openLeg observed extremes or sourceScenario.endPrice at E only; not a recommended target.",
    },
    waveContext: [...waveMap.entries()].map(([key, v]) => {
      const [waveLabel, setupFamilyId] = key.split("|");
      return {
        waveLabel,
        setupFamilyId,
        trades: v.trades,
        meanDisplacementRatio: mean(v.ratios),
        meanRewardPercentage: mean(v.rewards),
      };
    }),
    fibonacciAudit: {
      fibonacciInCanonicalTargetFormula: false,
      statement: "Fibonacci is not part of the canonical target formula.",
      artifactFibonacciReferencesPresent: fibArtifactScan,
      note: fibArtifactScan
        ? "Artifact may mention fibonacci elsewhere; target path uses displacement equality only."
        : "No fibonacci fields detected in joined evaluation snapshots.",
    },
    rewardVsDisplacement: {
      deterministicOneToOneWhenFormulaValid: formulaMismatch === 0,
      pearsonCorrelationAnchorEntryPctToRewardPct: pearson(
        pairedAnchorReward.map((p) => p.a),
        pairedAnchorReward.map((p) => p.r)
      ),
      note:
        "When canonical target matches formula, gross reward % equals anchor-entry displacement % of entry (observational, not causal).",
    },
    displacementVsRR: [...dispRrCross.entries()].map(([key, trades]) => {
      const [displacementRatioBucket, rrBucket] = key.split("|");
      return { displacementRatioBucket, rrBucket, trades };
    }),
    failedWinAnalysis: {
      failedFavorableCount: failedWinRows.length,
      rrBelowMinimumCount: rrBelowMinFailedWin,
      meanRewardPercentage: mean(
        failedWinRows.map((r) => r.rewardPercentage).filter((x): x is number => x !== null)
      ),
      meanDisplacementRatio: mean(
        failedWinRows
          .map((r) => r.displacementRatio)
          .filter((x): x is number => x !== null)
      ),
      meanCanonicalRr: mean(
        failedWinRows
          .map((r) => r.canonicalRrRatio)
          .filter((x): x is number => x !== null)
      ),
    },
    largeMoveContext: {
      canonicalGte3Count: gte3,
      canonicalGte5Count: gte5,
      canonicalGte10Count: gte10,
      structuralBeyondCanonicalCount: structuralBeyond,
      emptyBucketNotes: emptyNotes,
    },
    examples: {
      normal,
      smallReward,
      largeReward,
      gte3Percent: gte3Rows,
      gte5Percent: gte5Rows,
      gte10Percent: gte10Rows,
    },
    diagnosticSummary,
    warnings: [...WARNINGS],
    lookaheadAttestation: {
      noFutureBarReferenceSynthesis: true,
      prefixInformationSetOnly: true,
      statement:
        "Anchor and open-leg fields are frozen at evaluation; no post-E bars used to synthesize anchor, entry, or target.",
    },
    consumedReports: {
      lifecycleReport: true,
      eligibilityAuditReport: true,
      artifactMeasurements: true,
      rrThresholdTheoreticalRAnalysisReport:
        input.rrThresholdTheoreticalRAnalysisReport !== undefined,
      historicalEvaluatorFailureReasonAnalysisReport:
        input.historicalEvaluatorFailureReasonAnalysisReport !== undefined,
    },
    hypothesisTests,
    formulaMismatches,
  };
}
