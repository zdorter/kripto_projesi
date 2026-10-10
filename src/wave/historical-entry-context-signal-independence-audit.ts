import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import type { HeadroomPresence } from "./historical-entry-context-target-research-types";
import { classifyDisplacementContextBucket } from "./historical-target-distance-structural-context-analysis";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { FutureMovePerTradeRow, ProspectiveRrBucketId } from "./historical-entry-context-future-move-analysis-types";
import { classifyProspectiveRrBucket } from "./historical-entry-context-future-move-analysis";
import { futureMoveReachedAtThreshold } from "./historical-entry-context-future-move-predictiveness-analysis";
import { classifyTargetVsFutureMoveCategory } from "./historical-entry-context-future-move-predictiveness-analysis";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import {
  AUDIT_CONTROL_THRESHOLDS,
  HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION,
  type BuildHistoricalEntryContextSignalIndependenceAuditInput,
  type ControlSliceMetrics,
  type CrossThresholdRobustnessClass,
  type DependencyMatrixRow,
  type FeatureIndependenceSummaryRow,
  type HistoricalEntryContextSignalIndependenceAuditReport,
  type PredictiveValidityClass,
  type SameBandControlRow,
} from "./historical-entry-context-signal-independence-audit-types";

const MIN_CELL = 10;
const WARNINGS: readonly string[] = [
  "signal_independence_audit_observational_only",
  "no_predictive_validity_or_production_rule_claim",
  "multiple_comparison_selection_bias_risk",
  "no_statistical_significance_claims",
  "temporal_split_not_out_of_sample_validation",
  "prospective_rr_not_future_move",
];

interface EnrichedRow {
  tradeId: string;
  evaluationBarIndex: number;
  displacementPct: number | null;
  rewardPct: number | null;
  riskPct: number | null;
  rr: number | null;
  headroomPct: number | null;
  structuralMovePct: number | null;
  displacementBucket: DisplacementContextBucketId;
  headroomPresence: HeadroomPresence;
  rewardBucket: PriceMoveRewardBucketId;
  rrBucket: ProspectiveRrBucketId;
  structuralMoveBucket: StructuralMoveBucketId;
  direction: string;
  waveLabel: string;
  setupFamilyId: string;
  evaluatorStatus: string;
  policyClassification: string;
  future: FutureMovePerTradeRow;
  classifiable: boolean;
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

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
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

export function spearmanRankCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rank = (arr: number[]) => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    for (let j = 0; j < sorted.length; j++) {
      ranks[sorted[j]!.i] = j + 1;
    }
    return ranks;
  };
  return pearsonCorrelation(rank(xs), rank(ys));
}

function isClassifiable(row: FutureMovePerTradeRow): boolean {
  return (
    row.futureContextStatus === "CLASSIFIABLE" &&
    row.movementOutcomeClass !== "NOT_REPLAYABLE" &&
    row.favorableMovePercentage !== null
  );
}

function enrich(input: BuildHistoricalEntryContextSignalIndependenceAuditInput): EnrichedRow[] {
  const { lifecycleReport, futureMoveAnalysisReport: b14 } = input;
  const b14Map = new Map(b14.perTrade.map((r) => [r.tradeId, r]));
  const dispMap = new Map(
    (input.displacementEqualityTargetMechanicsReport?.targetMagnitude.perTrade ?? []).map((r) => [
      r.tradeId,
      r,
    ])
  );
  const structMap = new Map(
    (input.structuralExtremeVsDisplacementTargetReport?.perTrade ?? []).map((r) => [r.tradeId, r])
  );
  const rows: EnrichedRow[] = [];
  for (const t of lifecycleReport.trades) {
    const future = b14Map.get(t.tradeId);
    if (!future) continue;
    const disp = dispMap.get(t.tradeId);
    const struct = structMap.get(t.tradeId);
    const headroomPct = struct?.prefixExtremeHeadroomPercentage ?? null;
    rows.push({
      tradeId: t.tradeId,
      evaluationBarIndex: future.evaluationBarIndex,
      displacementPct: disp?.displacementPercentage ?? null,
      rewardPct: future.canonicalTargetPercent ?? disp?.rewardPercentage ?? null,
      riskPct: future.canonicalRiskPercent ?? disp?.riskPercentage ?? null,
      rr: future.canonicalRrRatio ?? disp?.canonicalRrRatio ?? null,
      headroomPct,
      structuralMovePct: struct?.prefixStructuralMovePercentage ?? null,
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      headroomPresence:
        headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT",
      rewardBucket: classifyPriceMoveRewardBucket(future.canonicalTargetPercent),
      structuralMoveBucket: struct?.prefixStructuralMoveBucket ?? "STRUCTURAL_NOT_APPLICABLE",
      rrBucket: classifyProspectiveRrBucket(future.canonicalRrRatio),
      direction: future.direction,
      waveLabel: struct?.waveLabel ?? "UNKNOWN",
      setupFamilyId: struct?.setupFamilyId ?? t.setupFamilyId ?? "UNKNOWN",
      evaluatorStatus: future.tradeEvaluationStatus,
      policyClassification: future.policyClassification,
      future,
      classifiable: isClassifiable(future),
    });
  }
  return rows;
}

function buildControlSlice(
  label: string,
  rows: EnrichedRow[],
  validityClass: PredictiveValidityClass = "ASSOCIATIONAL"
): ControlSliceMetrics {
  const classifiable = rows.filter((r) => r.classifiable);
  const mfes = classifiable.map((r) => r.future.favorableMovePercentage!).filter((x) => x !== null);
  const maes = classifiable
    .map((r) => r.future.adverseMovePercentage)
    .filter((x): x is number => x !== null);
  const reachRates = AUDIT_CONTROL_THRESHOLDS.map((t) => {
    const hit = classifiable.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)
    );
    const n = classifiable.length;
    const h = hit.length;
    return {
      thresholdPercent: t,
      reachRate: n > 0 ? h / n : null,
      wilson95: computeIndependentTradeWinRateConfidenceInterval(h, n - h, 0.95),
    };
  });
  const n = classifiable.length;
  return {
    sliceLabel: label,
    trades: rows.length,
    classifiable: n,
    reachRates,
    meanMfe: mean(mfes),
    medianMfe: median(mfes),
    meanMae: mean(maes),
    medianMae: median(maes),
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
    interpretWithCaution: n < MIN_CELL,
    validityClass: n < MIN_CELL ? "INSUFFICIENT_SAMPLE" : validityClass,
  };
}

function crossTabMaxShare(rows: EnrichedRow[], keyA: (r: EnrichedRow) => string, keyB: (r: EnrichedRow) => string) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = `${keyA(r)}|${keyB(r)}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (!rows.length) return null;
  return Math.max(...counts.values()) / rows.length;
}

function depRow(
  contextA: string,
  contextB: string,
  rows: EnrichedRow[],
  pickA: (r: EnrichedRow) => number | null,
  pickB: (r: EnrichedRow) => number | null,
  bucketA: (r: EnrichedRow) => string,
  bucketB: (r: EnrichedRow) => string,
  validity: PredictiveValidityClass
): DependencyMatrixRow {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rows) {
    const a = pickA(r);
    const b = pickB(r);
    if (a !== null && b !== null) {
      xs.push(a);
      ys.push(b);
    }
  }
  return {
    contextA,
    contextB,
    pearsonCorrelation: pearsonCorrelation(xs, ys),
    spearmanRankCorrelation: spearmanRankCorrelation(xs, ys),
    crossTabMaxBucketShare: crossTabMaxShare(rows, bucketA, bucketB),
    note: "Descriptive dependency; not causal.",
    validityClass: validity,
  };
}

function reachAt(rows: EnrichedRow[], t: number): number | null {
  const c = rows.filter((r) => r.classifiable);
  if (!c.length) return null;
  return (
    c.filter((r) => futureMoveReachedAtThreshold(r.future.favorableMovePercentage, t)).length / c.length
  );
}

function assessRobustness(profile: { thresholdPercent: number; reachRate: number | null }[]): CrossThresholdRobustnessClass {
  const focus = profile.filter((p) => [1, 1.5, 2, 3].includes(p.thresholdPercent));
  const rates = focus.map((p) => p.reachRate).filter((r): r is number => r !== null);
  if (rates.length < 2) return "INSUFFICIENT_SAMPLE";
  const spread = Math.max(...rates) - Math.min(...rates);
  if (spread < 0.15) return "MORE_STABLE_HISTORICAL_ASSOCIATION";
  return "UNSTABLE";
}

export function buildHistoricalEntryContextSignalIndependenceAudit(
  input: BuildHistoricalEntryContextSignalIndependenceAuditInput
): HistoricalEntryContextSignalIndependenceAuditReport {
  const { futureMoveAnalysisReport: b14, entryContextCombinationFutureMoveAnalysisReport: b16 } = input;
  const rows = enrich(input);
  const classifiableRows = rows.filter((r) => r.classifiable);

  const dependencyMatrix: DependencyMatrixRow[] = [
    depRow(
      "displacement",
      "canonicalReward",
      rows,
      (r) => r.displacementPct,
      (r) => r.rewardPct,
      (r) => r.displacementBucket,
      (r) => r.rewardBucket,
      "POSSIBLY_REDUNDANT_GEOMETRY"
    ),
    depRow(
      "displacement",
      "prospectiveRr",
      rows,
      (r) => r.displacementPct,
      (r) => r.rr,
      (r) => r.displacementBucket,
      (r) => r.rrBucket,
      "POSSIBLY_REDUNDANT"
    ),
    depRow(
      "displacement",
      "headroom",
      rows,
      (r) => r.displacementPct,
      (r) => r.headroomPct,
      (r) => r.displacementBucket,
      (r) => r.headroomPresence,
      "ASSOCIATIONAL"
    ),
    depRow(
      "canonicalReward",
      "prospectiveRr",
      rows,
      (r) => r.rewardPct,
      (r) => r.rr,
      (r) => r.rewardBucket,
      (r) => r.rrBucket,
      "POSSIBLY_REDUNDANT_GEOMETRY"
    ),
    depRow(
      "canonicalReward",
      "headroom",
      rows,
      (r) => r.rewardPct,
      (r) => r.headroomPct,
      (r) => r.rewardBucket,
      (r) => r.headroomPresence,
      "POSSIBLY_REDUNDANT_GEOMETRY"
    ),
    depRow(
      "structuralMove",
      "headroom",
      rows,
      (r) => r.structuralMovePct,
      (r) => r.headroomPct,
      (r) => r.structuralMoveBucket,
      (r) => r.headroomPresence,
      "DIRECT_GEOMETRIC_RELATION"
    ),
    depRow(
      "structuralMove",
      "displacement",
      rows,
      (r) => r.structuralMovePct,
      (r) => r.displacementPct,
      (r) => r.structuralMoveBucket,
      (r) => r.displacementBucket,
      "ASSOCIATIONAL"
    ),
    depRow(
      "headroom",
      "prospectiveRr",
      rows,
      (r) => r.headroomPct,
      (r) => r.rr,
      (r) => r.headroomPresence,
      (r) => r.rrBucket,
      "POSSIBLY_REDUNDANT"
    ),
  ];

  const dispRewardPearson = dependencyMatrix[0]!.pearsonCorrelation;
  const dispRewardSpearman = dependencyMatrix[0]!.spearmanRankCorrelation;

  const controlSlices: ControlSliceMetrics[] = [
    buildControlSlice(
      "A: DISP_LT_1% (bucket DISP_LT_0_25 or DISP_0_25_TO_0_50)",
      rows.filter(
        (r) =>
          r.displacementBucket === "DISP_LT_0_25" || r.displacementBucket === "DISP_0_25_TO_0_50"
      )
    ),
    buildControlSlice(
      "B: small displacement + HEADROOM_PRESENT",
      rows.filter(
        (r) =>
          (r.displacementBucket === "DISP_LT_0_25" ||
            r.displacementBucket === "DISP_0_25_TO_0_50") &&
          r.headroomPresence === "HEADROOM_PRESENT"
      )
    ),
    buildControlSlice(
      "C: small displacement + HEADROOM_ABSENT",
      rows.filter(
        (r) =>
          (r.displacementBucket === "DISP_LT_0_25" ||
            r.displacementBucket === "DISP_0_25_TO_0_50") &&
          r.headroomPresence === "HEADROOM_ABSENT"
      )
    ),
    buildControlSlice(
      "D: small displacement + RR_GTE_1_5",
      rows.filter(
        (r) =>
          (r.displacementBucket === "DISP_LT_0_25" ||
            r.displacementBucket === "DISP_0_25_TO_0_50") &&
          r.rrBucket === "RR_GTE_1_5"
      )
    ),
  ];

  const rewardBands: PriceMoveRewardBucketId[] = [
    "REWARD_0_50_TO_1_00",
    "REWARD_1_00_TO_2_00",
    "REWARD_2_00_TO_3_00",
    "REWARD_GTE_3_00",
  ];
  const sameTargetControls: SameBandControlRow[] = [];
  for (const band of rewardBands) {
    const inBand = rows.filter((r) => r.rewardBucket === band);
    const present = inBand.filter((r) => r.headroomPresence === "HEADROOM_PRESENT");
    const absent = inBand.filter((r) => r.headroomPresence === "HEADROOM_ABSENT");
    const sliceA = buildControlSlice(`${band} HEADROOM_PRESENT`, present);
    const sliceB = buildControlSlice(`${band} HEADROOM_ABSENT`, absent);
    if (sliceA.classifiable < MIN_CELL || sliceB.classifiable < MIN_CELL) continue;
    const r2a = sliceA.reachRates.find((x) => x.thresholdPercent === 2)?.reachRate;
    const r2b = sliceB.reachRates.find((x) => x.thresholdPercent === 2)?.reachRate;
    sameTargetControls.push({
      rewardBand: band,
      comparisonLabel: "HEADROOM_PRESENT vs ABSENT within same reward band",
      sliceA,
      sliceB,
      reach2DeltaPercentagePoints:
        r2a !== null && r2b !== null && r2a !== undefined && r2b !== undefined
          ? (r2a - r2b) * 100
          : null,
      note: "Same-target control; associational only.",
    });
  }

  const sameDisplacementControls: SameBandControlRow[] = [];
  for (const disp of ["DISP_LT_0_25", "DISP_0_25_TO_0_50", "DISP_0_50_TO_1_00"] as DisplacementContextBucketId[]) {
    const inDisp = rows.filter((r) => r.displacementBucket === disp);
    const present = inDisp.filter((r) => r.headroomPresence === "HEADROOM_PRESENT");
    const absent = inDisp.filter((r) => r.headroomPresence === "HEADROOM_ABSENT");
    const sliceA = buildControlSlice(`${disp} HEADROOM_PRESENT`, present);
    const sliceB = buildControlSlice(`${disp} HEADROOM_ABSENT`, absent);
    if (sliceA.classifiable < MIN_CELL || sliceB.classifiable < MIN_CELL) continue;
    const r2a = sliceA.reachRates.find((x) => x.thresholdPercent === 2)?.reachRate ?? null;
    const r2b = sliceB.reachRates.find((x) => x.thresholdPercent === 2)?.reachRate ?? null;
    sameDisplacementControls.push({
      rewardBand: disp,
      comparisonLabel: "HEADROOM within same displacement bucket",
      sliceA,
      sliceB,
      reach2DeltaPercentagePoints:
        r2a !== null && r2b !== null ? (r2a - r2b) * 100 : null,
      note: "Same-displacement control.",
    });
    const rrLow = inDisp.filter((r) => r.rrBucket === "RR_LT_1" || r.rrBucket === "RR_1_TO_1_5");
    const rrHigh = inDisp.filter((r) => r.rrBucket === "RR_GTE_1_5");
    const rrA = buildControlSlice(`${disp} RR_LT_1.5`, rrLow);
    const rrB = buildControlSlice(`${disp} RR_GTE_1.5`, rrHigh);
    if (rrA.classifiable >= MIN_CELL && rrB.classifiable >= MIN_CELL) {
      sameDisplacementControls.push({
        rewardBand: disp,
        comparisonLabel: "RR_LT_1.5 vs RR_GTE_1.5 within displacement bucket",
        sliceA: rrA,
        sliceB: rrB,
        reach2DeltaPercentagePoints: null,
        note: "RR control within displacement; RR is geometry-derived.",
      });
    }
  }

  const rrXs: number[] = [];
  const rrYs: number[] = [];
  const rrDx: number[] = [];
  const rrRx: number[] = [];
  for (const r of classifiableRows) {
    if (r.rr !== null && r.rewardPct !== null) {
      rrXs.push(r.rr);
      rrYs.push(r.rewardPct);
    }
    if (r.rr !== null && r.displacementPct !== null) {
      rrDx.push(r.rr);
      rrRx.push(r.displacementPct);
    }
  }
  const rrForRisk: number[] = [];
  const riskXs: number[] = [];
  for (const r of classifiableRows) {
    if (r.rr !== null && r.riskPct !== null) {
      rrForRisk.push(r.rr);
      riskXs.push(r.riskPct);
    }
  }

  const structMfeXs: number[] = [];
  const structMfeYs: number[] = [];
  for (const r of classifiableRows) {
    if (r.structuralMovePct !== null && r.future.favorableMovePercentage !== null) {
      structMfeXs.push(r.structuralMovePct);
      structMfeYs.push(r.future.favorableMovePercentage);
    }
  }

  const withoutTouch = rows.filter(
    (r) =>
      classifyTargetVsFutureMoveCategory(r.future) === "FUTURE_EXCEEDED_TARGET_WITHOUT_CANONICAL_TOUCH"
  );

  const failedFav = rows.filter(
    (r) => r.evaluatorStatus === "FAILED" && r.policyClassification === "FAVORABLE_RESOLUTION"
  );
  const passedAdv = rows.filter(
    (r) => r.evaluatorStatus === "PASSED" && r.policyClassification === "ADVERSE_RESOLUTION"
  );

  const sorted = [...classifiableRows].sort((a, b) => a.evaluationBarIndex - b.evaluationBarIndex);
  const splitIdx = Math.floor(sorted.length * 0.7);
  const earlier = sorted.slice(0, splitIdx);
  const later = sorted.slice(splitIdx);

  const headroomPresent = classifiableRows.filter((r) => r.headroomPresence === "HEADROOM_PRESENT");
  const headroomAbsent = classifiableRows.filter((r) => r.headroomPresence === "HEADROOM_ABSENT");
  const sameDispSmall = rows.filter(
    (r) =>
      r.classifiable &&
      (r.displacementBucket === "DISP_LT_0_25" || r.displacementBucket === "DISP_0_25_TO_0_50")
  );
  const sameDispPresent = sameDispSmall.filter((r) => r.headroomPresence === "HEADROOM_PRESENT");
  const sameDispAbsent = sameDispSmall.filter((r) => r.headroomPresence === "HEADROOM_ABSENT");

  const crossThresholdRobustness = [
    {
      associationLabel: "HEADROOM_PRESENT overall",
      thresholdProfile: AUDIT_CONTROL_THRESHOLDS.map((t) => ({
        thresholdPercent: t,
        reachRate: reachAt(headroomPresent, t),
      })),
      robustness: assessRobustness(
        AUDIT_CONTROL_THRESHOLDS.map((t) => ({
          thresholdPercent: t,
          reachRate: reachAt(headroomPresent, t),
        }))
      ),
    },
    {
      associationLabel: "small displacement + HEADROOM_PRESENT",
      thresholdProfile: AUDIT_CONTROL_THRESHOLDS.map((t) => ({
        thresholdPercent: t,
        reachRate: reachAt(sameDispPresent, t),
      })),
      robustness: assessRobustness(
        AUDIT_CONTROL_THRESHOLDS.map((t) => ({
          thresholdPercent: t,
          reachRate: reachAt(sameDispPresent, t),
        }))
      ),
    },
  ];

  let b14Parity = true;
  for (const row of b14.thresholdAnalysis) {
    const hit = classifiableRows.filter((r) =>
      futureMoveReachedAtThreshold(r.future.favorableMovePercentage, row.thresholdPercent)
    );
    if (hit.length !== row.futureMoveReachedCount) b14Parity = false;
  }

  const featureIndependenceSummary: FeatureIndependenceSummaryRow[] = [
    {
      context: "displacement",
      futureAssociationObserved: true,
      geometryDependency: "HIGH",
      independentInformationStatus: "POSSIBLY_REDUNDANT_GEOMETRY",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "canonicalReward",
      futureAssociationObserved: true,
      geometryDependency: "HIGH",
      independentInformationStatus: "POSSIBLY_REDUNDANT_GEOMETRY",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "headroom",
      futureAssociationObserved: reachAt(headroomPresent, 2) !== reachAt(headroomAbsent, 2),
      geometryDependency: "HIGH",
      independentInformationStatus: "NOT_ESTABLISHED",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "prospectiveRr",
      futureAssociationObserved: true,
      geometryDependency: "HIGH",
      independentInformationStatus: "POSSIBLY_REDUNDANT",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "structuralMove",
      futureAssociationObserved: structMfeXs.length > 0,
      geometryDependency: "HIGH",
      independentInformationStatus: "NOT_ESTABLISHED",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "direction",
      futureAssociationObserved: true,
      geometryDependency: "LOW",
      independentInformationStatus: "NOT_ESTABLISHED",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "wave",
      futureAssociationObserved: true,
      geometryDependency: "UNKNOWN",
      independentInformationStatus: "INSUFFICIENT_SAMPLE",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
    {
      context: "setupFamily",
      futureAssociationObserved: true,
      geometryDependency: "UNKNOWN",
      independentInformationStatus: "INSUFFICIENT_SAMPLE",
      entryAvailability: "AVAILABLE_AT_ENTRY",
    },
  ];

  const diagnosticSummary: HistoricalEntryContextSignalIndependenceAuditReport["diagnosticSummary"] =
    [
      {
        question: "Displacement ile canonical reward ne kadar redundant?",
        answer: `Pearson ${dispRewardPearson?.toFixed(3) ?? "n/a"}; Spearman ${dispRewardSpearman?.toFixed(3) ?? "n/a"} (B-12t displacement-equality geometry).`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Headroom future move ile association gösteriyor mu?",
        answer: `Reach 2% present ${((reachAt(headroomPresent, 2) ?? 0) * 100).toFixed(1)}% vs absent ${((reachAt(headroomAbsent, 2) ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Headroom association displacement kontrol edildiğinde devam ediyor mu?",
        answer: `Same-displacement small disp: present ${((reachAt(sameDispPresent, 2) ?? 0) * 100).toFixed(1)}% vs absent ${((reachAt(sameDispAbsent, 2) ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Headroom association target band kontrol edildiğinde devam ediyor mu?",
        answer: `${sameTargetControls.length} same-target band comparisons reported.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "RR future move'dan bağımsız bilgi taşıyor mu?",
        answer: "NOT_ESTABLISHED — RR is prospective geometry, not future move.",
        tag: "NOT_ESTABLISHED",
      },
      {
        question: "RR ile reward arasındaki dependency ne kadar?",
        answer: `Pearson rr×reward ${pearsonCorrelation(rrXs, rrYs)?.toFixed(3) ?? "n/a"}.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "Structural move future move'u ayırıyor mu?",
        answer: `Prefix structural vs post-E MFE Pearson ${pearsonCorrelation(structMfeXs, structMfeYs)?.toFixed(3) ?? "n/a"} (prefix vs outcome; not causal).`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Direction ek bilgi taşıyor mu?",
        answer: "NOT_ESTABLISHED — descriptive only.",
        tag: "NOT_ESTABLISHED",
      },
      {
        question: "Wave context ek bilgi taşıyor mu?",
        answer: "INSUFFICIENT_SAMPLE / secondary dimension.",
        tag: "INSUFFICIENT_SAMPLE",
      },
      {
        question: "Setup family ek bilgi taşıyor mu?",
        answer: "INSUFFICIENT_SAMPLE / secondary dimension.",
        tag: "INSUFFICIENT_SAMPLE",
      },
      {
        question: "MFE >= target without touch hangi contextlerde yoğun?",
        answer: `n=${withoutTouch.length}; mean reward ${mean(withoutTouch.map((r) => r.rewardPct).filter((x): x is number => x !== null))?.toFixed(2) ?? "n/a"}%.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "FAILED + FAVORABLE cohortunda hangi contextler öne çıkıyor?",
        answer: `n=${failedFav.length}; see failedFavorableAnalysis control slices.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "PASSED + ADVERSE cohortunda hangi contextler öne çıkıyor?",
        answer: `n=${passedAdv.length}; see passedAdverseAnalysis.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Associations threshold'lar arasında stabil mi?",
        answer: `See crossThresholdRobustness (${crossThresholdRobustness.map((c) => c.robustness).join(", ")}).`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Earlier vs later period arasında pattern korunuyor mu?",
        answer: `TEMPORAL_DESCRIPTIVE_SPLIT: earlier 2% ${((reachAt(earlier, 2) ?? 0) * 100).toFixed(1)}% vs later ${((reachAt(later, 2) ?? 0) * 100).toFixed(1)}%.`,
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi contextler büyük ölçüde aynı geometry'nin farklı gösterimleri?",
        answer: "Displacement, canonical reward, RR (high pairwise correlation expected).",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi contextler potentially redundant?",
        answer: "displacement↔reward, reward↔RR per dependency matrix POSSIBLY_REDUNDANT_GEOMETRY.",
        tag: "ASSOCIATIONAL_FINDING",
      },
      {
        question: "Hangi contextler sample nedeniyle değerlendirilemiyor?",
        answer: `Cells with classifiable < ${MIN_CELL} omitted or INSUFFICIENT_SAMPLE.`,
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "Entry anında gerçekten mevcut olmayan bilgi var mı?",
        answer: "All listed contexts are PREFIX_CONTEXT at E; future fields are POST_E_OUTCOME only via B-14.",
        tag: "DIRECT_OBSERVATION",
      },
      {
        question: "Bu araştırmadan production entry/target rule çıkarılabilir mi?",
        answer: "NOT_ESTABLISHED — geometry redundancy and multiple comparison bias.",
        tag: "NOT_ESTABLISHED",
      },
    ];

  const sumR =
    input.eligibilityAuditReport?.decisiveRows?.reduce((s, r) => s + (r.theoreticalR ?? 0), 0) ?? null;

  return {
    schemaVersion: HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION,
    datasetReference: b14.datasetReference,
    population: {
      independentTrades: input.lifecycleReport.trades.length,
      classifiableForFutureMove: classifiableRows.length,
      horizonBars: b14.horizon.horizonBars,
    },
    contextAvailability: [
      {
        context: "displacement",
        availability: "AVAILABLE_AT_ENTRY",
        note: "B-12t prefix geometry at E.",
      },
      {
        context: "canonicalReward",
        availability: "AVAILABLE_AT_ENTRY",
        note: "Frozen lifecycle target at E.",
      },
      {
        context: "headroom",
        availability: "AVAILABLE_AT_ENTRY",
        note: "B-12u prefix extreme vs target at E (includes prefix favorable movement).",
      },
      {
        context: "futureMove",
        availability: "LOOKAHEAD_RISK",
        note: "POST_E_OUTCOME only — never used as context feature.",
      },
    ],
    dependencyMatrix,
    geometricRedundancyAnalysis: {
      displacementRewardPearson: dispRewardPearson,
      displacementRewardSpearman: dispRewardSpearman,
      equalityMechanicsNote:
        "B-12t canonical displacement-equality implies reward distance ≈ displacement; separation on both may reflect same geometry.",
      validityClass: "POSSIBLY_REDUNDANT_GEOMETRY",
      warning:
        "Canonical reward bucket separation and displacement bucket separation may represent the same underlying anchor-entry geometry.",
    },
    headroomIndependenceAnalysis: {
      headroomPresentReach2: reachAt(headroomPresent, 2),
      headroomAbsentReach2: reachAt(headroomAbsent, 2),
      sameDisplacementControlDeltaPp:
        reachAt(sameDispPresent, 2) !== null && reachAt(sameDispAbsent, 2) !== null
          ? (reachAt(sameDispPresent, 2)! - reachAt(sameDispAbsent, 2)!) * 100
          : null,
      prefixVsFutureNote:
        "Headroom uses E-prefix extreme; may proxy prefix favorable movement — cannot definitively separate from post-E predictive information.",
      validityClass: "NOT_ESTABLISHED",
    },
    controlSlices,
    sameTargetControls,
    sameDisplacementControls,
    rrDependencyAnalysis: {
      rrRewardPearson: pearsonCorrelation(rrXs, rrYs),
      rrDisplacementPearson: pearsonCorrelation(rrDx, rrRx),
      rrRiskPearson: pearsonCorrelation(rrForRisk, riskXs),
      note: "RR is derived from reward/risk geometry at E; not a future-move signal.",
      validityClass: "POSSIBLY_REDUNDANT_GEOMETRY",
    },
    structuralExtremeAnalysis: {
      structuralMoveHeadroomPearson: dependencyMatrix.find(
        (d) => d.contextA === "structuralMove" && d.contextB === "headroom"
      )?.pearsonCorrelation ?? null,
      structuralMoveMfePearson: pearsonCorrelation(structMfeXs, structMfeYs),
      prefixContextNote:
        "PREFIX_CONTEXT structural move vs POST_E_OUTCOME MFE — measures prefix/post alignment, not independent prediction proof.",
      validityClass: "NOT_ESTABLISHED",
    },
    mfeWithoutTouchAnalysis: {
      trades: withoutTouch.length,
      meanDisplacement: mean(
        withoutTouch.map((r) => r.displacementPct).filter((x): x is number => x !== null)
      ),
      meanHeadroomPct: mean(
        withoutTouch.map((r) => r.headroomPct).filter((x): x is number => x !== null)
      ),
      meanReward: mean(withoutTouch.map((r) => r.rewardPct).filter((x): x is number => x !== null)),
      meanRr: mean(withoutTouch.map((r) => r.rr).filter((x): x is number => x !== null)),
      note: "TARGET_TOUCH ≠ FUTURE_MOVE_REACHED; path semantics from B-14.",
    },
    failedFavorableAnalysis: {
      trades: failedFav.length,
      controlSlices: [
        buildControlSlice("FAILED+FAVORABLE overall", failedFav),
        buildControlSlice(
          "FAILED+FAVORABLE HEADROOM_PRESENT",
          failedFav.filter((r) => r.headroomPresence === "HEADROOM_PRESENT")
        ),
      ],
      note: "Associational cohort only; not evaluator correctness.",
    },
    passedAdverseAnalysis: {
      trades: passedAdv.length,
      controlSlices: [buildControlSlice("PASSED+ADVERSE overall", passedAdv)],
      note: "Associational cohort only.",
    },
    crossThresholdRobustness,
    temporalDescriptiveSplit: {
      label: "TEMPORAL_DESCRIPTIVE_SPLIT",
      earlierFraction: 0.7,
      earlier: {
        classifiable: earlier.length,
        reach1: reachAt(earlier, 1),
        reach2: reachAt(earlier, 2),
        reach3: reachAt(earlier, 3),
        headroomPresentReach2: reachAt(
          earlier.filter((r) => r.headroomPresence === "HEADROOM_PRESENT"),
          2
        ),
      },
      later: {
        classifiable: later.length,
        reach1: reachAt(later, 1),
        reach2: reachAt(later, 2),
        reach3: reachAt(later, 3),
        headroomPresentReach2: reachAt(
          later.filter((r) => r.headroomPresence === "HEADROOM_PRESENT"),
          2
        ),
      },
      note: "Not out-of-sample validation; descriptive temporal split on frozen cohort.",
    },
    featureIndependenceSummary,
    theoreticalRReference: {
      consumed: Boolean(input.eligibilityAuditReport),
      label: "THEORETICAL_R_REFERENCE",
      sumTheoreticalR: sumR,
    },
    costReference: {
      consumed: Boolean(input.costAwareCounterfactualAnalysisReport),
      roundTripPercentage: 0.2,
      note: "B-12x descriptive reference only.",
    },
    multipleComparisonWarning: {
      cellsExamined:
        b16.multipleComparisonWarning.combinationCellsTested +
        controlSlices.length +
        sameTargetControls.length,
      selectionBiasNote:
        "Many context×threshold×cohort cells examined; highest observed associations may reflect selection bias without independent validation.",
    },
    diagnosticSummary,
    directVsAssociational: {
      direct: [
        "correlation_coefficients",
        "reach_rate_arithmetic",
        "wilson_intervals",
        "sample_counts",
        "PREFIX vs POST_E labeling",
      ],
      associational: [
        "context_combination_controls",
        "headroom_displacement_controls",
        "temporal_descriptive_split",
        "cohort_profiles",
      ],
    },
    lookaheadAttestation: {
      prefixContextEnd: "E",
      postEOutcomeStart: "E+1",
      statement:
        "Context features from B-12t/u and lifecycle at E only. Future move from B-14 perTrade (E+1..horizon).",
    },
    parity: {
      b14ThresholdReachCountsMatch: b14Parity,
      b16B14ParityMatch: b16.parity.b14ThresholdReachCountsMatch,
      note: "Input reports must remain unchanged; reach counts recomputed from B-14 perTrade.",
    },
    warnings: [...WARNINGS],
    tradeExamples: classifiableRows
      .sort((a, b) => a.tradeId.localeCompare(b.tradeId))
      .slice(0, 24)
      .map((r) => ({ tradeId: r.tradeId, note: "deterministic audit example" })),
    consumedReports: {
      lifecycleReport: true,
      futureMoveAnalysisReport: true,
      entryContextCombinationFutureMoveAnalysisReport: true,
      historicalEntryContextTargetResearchReport: Boolean(input.historicalEntryContextTargetResearchReport),
      displacementEqualityTargetMechanicsReport: Boolean(input.displacementEqualityTargetMechanicsReport),
      structuralExtremeVsDisplacementTargetReport: Boolean(input.structuralExtremeVsDisplacementTargetReport),
      alternativeTargetModelAnalysisReport: Boolean(input.alternativeTargetModelAnalysisReport),
      costAwareCounterfactualAnalysisReport: Boolean(input.costAwareCounterfactualAnalysisReport),
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
    },
  };
}
