import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { HistoricalEvaluatorFailureReasonAnalysisReport } from "./historical-evaluator-failure-reason-analysis-types";
import type { HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { TargetMagnitudeRewardBucketId } from "./historical-target-provenance-structural-distance-analysis-types";
import type { TargetProvenanceCategory } from "./historical-target-provenance-structural-distance-analysis-types";

export const HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export interface BuildHistoricalDisplacementEqualityTargetMechanicsAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  eligibilityAuditReport: HistoricalIndependentTradeREligibilityAuditReport;
  artifactMeasurements: readonly HistoricalMeasurementArtifactEntry[];
  rrThresholdTheoreticalRAnalysisReport?: HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport;
  historicalEvaluatorFailureReasonAnalysisReport?: HistoricalEvaluatorFailureReasonAnalysisReport;
}

export interface AnchorProvenanceRow {
  field: string;
  source: string;
  functionName: string | null;
  meaning: string;
  evidence: "DIRECT" | "DERIVED" | "INFERRED" | "UNKNOWN";
}

export interface TargetFormulaReport {
  functionName: string;
  sourceFile: string;
  formulaText: string;
  variables: readonly { name: string; description: string }[];
  bullishFormula: string;
  bearishFormula: string;
  equalityDefinition: string;
  verifiedOnFrozenPopulation: boolean;
  mismatchCount: number;
}

export interface DisplacementEqualityMetrics {
  trades: number;
  tradesWithAnchor: number;
  equalityRatioMean: number | null;
  equalityRatioMedian: number | null;
  equalityRatioMin: number | null;
  equalityRatioMax: number | null;
  exactEqualityCount: number;
  nearEqualityCount: number;
  mismatchCount: number;
  formulaValidationMatchCount: number;
  formulaValidationMismatchCount: number;
}

export interface DisplacementMechanicsTradeRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  anchorPrice: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  signedDisplacement: number | null;
  displacementPercentage: number | null;
  anchorEntryDistance: number | null;
  entryTargetDistance: number | null;
  displacementRatio: number | null;
  expectedTargetFromFormula: number | null;
  targetFormulaDelta: number | null;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  openLegSpanBars: number | null;
  anchorSources: readonly string[] | null;
}

export interface HypothesisTestResult {
  hypothesisId: string;
  statement: string;
  outcome: "SUPPORTED_ON_DATA" | "NOT_SUPPORTED" | "NOT_ESTABLISHED" | "PARTIAL";
  note: string;
}

export interface MechanicsExampleRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  anchorPrice: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  anchorEntryDistance: number | null;
  entryTargetDistance: number | null;
  displacementRatio: number | null;
  rewardPercentage: number | null;
  riskPercentage: number | null;
  canonicalRrRatio: number | null;
  waveLabel: string;
  setupFamilyId: string;
  targetProvenance: TargetProvenanceCategory | "UNKNOWN";
  pathOutcome: string;
  evaluationStatus: string;
}

export interface HistoricalDisplacementEqualityTargetMechanicsAnalysisReport {
  schemaVersion: typeof HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION;
  population: {
    independentTrades: number;
    artifactJoinHits: number;
    artifactJoinMisses: number;
    tradesWithOpenLegAnchor: number;
  };
  targetFormula: TargetFormulaReport;
  anchorAnalysis: {
    summary: string;
    isAnchorSwingPrice: string;
    rows: readonly AnchorProvenanceRow[];
  };
  openLegAnalysis: {
    definitionSourceModule: string;
    definitionSourceFunction: string;
    answers: readonly { question: string; answer: string; evidence: string }[];
  };
  displacementEquality: DisplacementEqualityMetrics;
  targetMagnitude: {
    rewardBucketCounts: Partial<Record<TargetMagnitudeRewardBucketId, number>>;
    anchorEntryDisplacementPercentMean: number | null;
    rewardPercentMean: number | null;
    rewardMatchesAnchorEntryDisplacementPercentCount: number;
    perTrade: readonly DisplacementMechanicsTradeRow[];
  };
  structuralComparison: {
    tradesWithStructuralBeyondCanonical: number;
    meanStructuralToCanonicalRatio: number | null;
    note: string;
  };
  waveContext: readonly {
    waveLabel: string;
    setupFamilyId: string;
    trades: number;
    meanDisplacementRatio: number | null;
    meanRewardPercentage: number | null;
  }[];
  fibonacciAudit: {
    fibonacciInCanonicalTargetFormula: false;
    statement: string;
    artifactFibonacciReferencesPresent: boolean;
    note: string;
  };
  rewardVsDisplacement: {
    deterministicOneToOneWhenFormulaValid: boolean;
    pearsonCorrelationAnchorEntryPctToRewardPct: number | null;
    note: string;
  };
  displacementVsRR: readonly {
    displacementRatioBucket: string;
    rrBucket: string;
    trades: number;
  }[];
  failedWinAnalysis: {
    failedFavorableCount: number;
    rrBelowMinimumCount: number;
    meanRewardPercentage: number | null;
    meanDisplacementRatio: number | null;
    meanCanonicalRr: number | null;
  };
  largeMoveContext: {
    canonicalGte3Count: number;
    canonicalGte5Count: number;
    canonicalGte10Count: number;
    structuralBeyondCanonicalCount: number;
    emptyBucketNotes: readonly string[];
  };
  examples: {
    normal: readonly MechanicsExampleRow[];
    smallReward: readonly MechanicsExampleRow[];
    largeReward: readonly MechanicsExampleRow[];
    gte3Percent: readonly MechanicsExampleRow[];
    gte5Percent: readonly MechanicsExampleRow[];
    gte10Percent: readonly MechanicsExampleRow[];
  };
  diagnosticSummary: readonly { question: string; answer: string }[];
  warnings: readonly string[];
  lookaheadAttestation: {
    noFutureBarReferenceSynthesis: true;
    prefixInformationSetOnly: true;
    statement: string;
  };
  consumedReports: {
    lifecycleReport: true;
    eligibilityAuditReport: true;
    artifactMeasurements: true;
    rrThresholdTheoreticalRAnalysisReport: boolean;
    historicalEvaluatorFailureReasonAnalysisReport: boolean;
  };
  hypothesisTests: readonly HypothesisTestResult[];
  formulaMismatches: readonly {
    tradeId: string;
    expected: number;
    actual: number;
    difference: number;
    direction: string;
  }[];
}
