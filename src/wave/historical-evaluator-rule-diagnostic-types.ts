import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type { EvaluatorDiagnosticMismatchSummary } from "./historical-independent-trade-evaluator-diagnostic-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { IndependentTradeRMultipleSliceStatistics } from "./historical-independent-trade-r-multiple-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type {
  EvaluatorFailureReasonDimensionRow,
  EvaluatorFailureReasonFailedSlice,
  EvaluatorFailureReasonOutcomeCross,
  EvaluatorFailureReasonOverallSlice,
  EvaluatorFailureReasonPassedSummary,
} from "./historical-evaluator-failure-reason-analysis-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

export const HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION =
  "1.0" as const;

export type EvaluatorRuleDiagnosticStatus = Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>;

export const EVALUATOR_RULE_DIAGNOSTIC_STATUSES: readonly EvaluatorRuleDiagnosticStatus[] =
  ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

export interface EvaluatorRuleDiagnosticStatusRow {
  evaluationStatus: EvaluatorRuleDiagnosticStatus;
  totalTrades: number;
  decisiveTrades: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  unmeasuredTrades: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
  decisiveShare: number | null;
  contributionToDecisiveWins: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface EvaluatorRuleDiagnosticEvalCell {
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  winRate_decisive: HistoricalPositionOutcomeStatisticRate;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface EvaluatorRuleDiagnosticFailureReasonUnavailable {
  available: false;
  reason: string;
  canonicalNote: string;
}

/** B-12l report embedded in B-12k when lifecycle is supplied (B-12m). */
export interface EvaluatorRuleDiagnosticFailureReasonAvailable {
  available: true;
  sourcePhase: "B-12l";
  sourceSchemaVersion: string;
  observationalNote: string;
  canonicalSource: {
    artifactPath: string;
    lifecycleField: string;
    freezeNote: string;
  };
  overallByFailureReason: readonly EvaluatorFailureReasonOverallSlice[];
  failedTradeOutcomeByReason: readonly EvaluatorFailureReasonFailedSlice[];
  passedTradeOutcomeSummary: EvaluatorFailureReasonPassedSummary;
  failureReasonByOutcome: readonly EvaluatorFailureReasonOutcomeCross[];
  byDirection: readonly EvaluatorFailureReasonDimensionRow<
    import("./historical-position-outcome-statistics-types").HistoricalPositionOutcomeDirectionSliceKey
  >[];
  byRrBucket: readonly EvaluatorFailureReasonDimensionRow<
    import("./historical-measurement-rr-statistics-types").HistoricalMeasurementRRBucketRow
  >[];
  bySetupFamily: readonly EvaluatorFailureReasonDimensionRow<string>[];
  byGeometry: readonly EvaluatorFailureReasonDimensionRow<
    import("./historical-entry-reference-quality-analysis-types").EntryReferenceGeometryQuality
  >[];
  byExitReason: readonly EvaluatorFailureReasonDimensionRow<
    import("./setup/prospective-setup-outcome-replay-types").ProspectiveSetupOutcomeReplayStatus
  >[];
  byDuration: readonly EvaluatorFailureReasonDimensionRow<
    import("./historical-independent-trade-analysis-types").IndependentTradeDurationBucketId
  >[];
  missingFailureReasonCount: number;
  insufficientContextNoFailureReason: number;
  unknownPopulationNotes: string;
}

export type EvaluatorRuleDiagnosticFailureReasonAnalysis =
  | EvaluatorRuleDiagnosticFailureReasonUnavailable
  | EvaluatorRuleDiagnosticFailureReasonAvailable;

/** Among FAILED trades: observational co-occurrence of frozen failure reason with favorable path outcome (B-12m). */
export interface EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis {
  available: boolean;
  observationalNote: string;
  byFailureReason: readonly EvaluatorFailureReasonFailedSlice[];
}

export interface EvaluatorRuleDiagnosticRrBucketSlice {
  prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
  passed: EvaluatorRuleDiagnosticEvalCell;
  failed: EvaluatorRuleDiagnosticEvalCell;
}

export interface EvaluatorRuleDiagnosticDirectionSlice {
  direction: HistoricalPositionOutcomeDirectionSliceKey;
  passed: EvaluatorRuleDiagnosticEvalCell;
  failed: EvaluatorRuleDiagnosticEvalCell;
}

export interface EvaluatorRuleDiagnosticFamilySlice {
  setupFamilyId: string;
  passed: EvaluatorRuleDiagnosticEvalCell;
  failed: EvaluatorRuleDiagnosticEvalCell;
}

export interface EvaluatorRuleDiagnosticGeometrySlice {
  geometry: EntryReferenceGeometryQuality;
  passed: EvaluatorRuleDiagnosticEvalCell;
  failed: EvaluatorRuleDiagnosticEvalCell;
}

export interface EvaluatorRuleDiagnosticExitSlice {
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  passed: { count: number; shareWithinPassed: number | null };
  failed: { count: number; shareWithinFailed: number | null };
}

export interface EvaluatorRuleDiagnosticDurationSlice {
  durationBucket: IndependentTradeDurationBucketId;
  passed: EvaluatorRuleDiagnosticEvalCell;
  failed: EvaluatorRuleDiagnosticEvalCell;
}

export interface EvaluatorRuleDiagnosticTheoreticalRAnalysis {
  available: boolean;
  source: string;
  passed: IndependentTradeRMultipleSliceStatistics | null;
  failed: IndependentTradeRMultipleSliceStatistics | null;
  insufficientContext: IndependentTradeRMultipleSliceStatistics | null;
  note: string;
}

export interface EvaluatorRuleDiagnosticProspectiveVsTheoreticalR {
  prospectiveRrSource: string;
  theoreticalRSource: string;
  evaluatorDiagnosticsRrNote: string;
}

export type EvaluatorMismatchQuadrantId =
  | "PASSED_WIN"
  | "PASSED_LOSS"
  | "FAILED_WIN"
  | "FAILED_LOSS";

export interface EvaluatorRuleDiagnosticQuadrantProfile {
  quadrant: EvaluatorMismatchQuadrantId;
  count: number;
  percentageOfEvaluatorGroup: number | null;
  percentageOfAllDecisive: number | null;
  directionDistribution: Record<HistoricalPositionOutcomeDirectionSliceKey, number>;
  rrBucketDistribution: Record<HistoricalMeasurementRRBucketRow, number>;
  setupFamilyDistribution: Record<string, number>;
  geometryDistribution: Record<EntryReferenceGeometryQuality, number>;
  exitReasonDistribution: Record<ProspectiveSetupOutcomeReplayStatus, number>;
  durationBucketDistribution: Record<IndependentTradeDurationBucketId, number>;
}

export interface EvaluatorRuleDiagnosticOutcomeCrossCell {
  wins: number;
  losses: number;
  decisive: number;
  inconclusive: number;
  unresolved: number;
  unmeasured: number;
}

export interface EvaluatorRuleDiagnosticConditionalAnalysis {
  passedDirectionOutcome: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  failedDirectionOutcome: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  passedRrOutcome: Record<
    HistoricalMeasurementRRBucketRow,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  failedRrOutcome: Record<
    HistoricalMeasurementRRBucketRow,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  passedFamilyOutcome: Record<string, EvaluatorRuleDiagnosticOutcomeCrossCell>;
  failedFamilyOutcome: Record<string, EvaluatorRuleDiagnosticOutcomeCrossCell>;
  passedGeometryOutcome: Record<
    EntryReferenceGeometryQuality,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  failedGeometryOutcome: Record<
    EntryReferenceGeometryQuality,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  passedDurationOutcome: Record<
    IndependentTradeDurationBucketId,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
  failedDurationOutcome: Record<
    IndependentTradeDurationBucketId,
    EvaluatorRuleDiagnosticOutcomeCrossCell
  >;
}

export interface EvaluatorRuleDiagnosticFieldAuditEntry {
  field: string;
  source: string;
  frozenInIndependentTradeUnit: boolean;
  usedInB12k: boolean;
  notes: string;
}

export interface EvaluatorRuleDiagnosticMismatchAnalysis
  extends EvaluatorDiagnosticMismatchSummary {
  passedLossRate: number | null;
  failedLossRate: number | null;
  /** PASSED win rate minus FAILED win rate (percentage points); B-12f parity. */
  winRateDifferencePercentagePoints: number | null;
  b12fParityNote: string;
}

export interface HistoricalEvaluatorRuleDiagnosticReport {
  schemaVersion: typeof HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_EVALUATOR_RULE_DIAGNOSTIC";
  consumedReports: {
    statisticsSchemaVersion: string;
    evaluatorDiagnosticSchemaVersion: string;
    failureReasonSchemaVersion: string | null;
    rMultipleSchemaVersion: string | null;
    entryReferenceQualitySchemaVersion: string | null;
    validationSchemaVersion: string | null;
  };
  population: {
    independentTrades: number;
    decisiveResolutions: number;
    snapshotReference: IndependentTradeSnapshotReference;
    primaryPopulationNote: string;
  };
  overall: {
    decisiveWinRate: number | null;
    researchQuestion: string;
  };
  statusAnalysis: Record<EvaluatorRuleDiagnosticStatus, EvaluatorRuleDiagnosticStatusRow>;
  failureReasonAnalysis: EvaluatorRuleDiagnosticFailureReasonAnalysis;
  failedWinFailureReasonAnalysis: EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis;
  rrAnalysis: readonly EvaluatorRuleDiagnosticRrBucketSlice[];
  directionAnalysis: readonly EvaluatorRuleDiagnosticDirectionSlice[];
  setupFamilyAnalysis: readonly EvaluatorRuleDiagnosticFamilySlice[];
  geometryAnalysis: readonly EvaluatorRuleDiagnosticGeometrySlice[];
  exitReasonAnalysis: readonly EvaluatorRuleDiagnosticExitSlice[];
  durationAnalysis: readonly EvaluatorRuleDiagnosticDurationSlice[];
  theoreticalRAnalysis: EvaluatorRuleDiagnosticTheoreticalRAnalysis;
  prospectiveVsTheoreticalR: EvaluatorRuleDiagnosticProspectiveVsTheoreticalR;
  mismatchAnalysis: EvaluatorRuleDiagnosticMismatchAnalysis;
  quadrantProfiles: readonly EvaluatorRuleDiagnosticQuadrantProfile[];
  conditionalAnalysis: EvaluatorRuleDiagnosticConditionalAnalysis;
  fieldAudit: readonly EvaluatorRuleDiagnosticFieldAuditEntry[];
  b12fReference: {
    mismatch: EvaluatorDiagnosticMismatchSummary;
    passedWinRate: number | null;
    failedWinRate: number | null;
  };
  warnings: readonly string[];
}

export interface BuildHistoricalEvaluatorRuleDiagnosticInput {
  /** When omitted, B-12k status/dimension slices use empty trades; B-12m failure-reason analysis stays unavailable. */
  lifecycleReport?: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  statisticsReport: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  evaluatorDiagnosticReport?: import("./historical-independent-trade-evaluator-diagnostic-types").HistoricalIndependentTradeEvaluatorDiagnosticReport;
  /** Pre-built B-12l report; avoids duplicate build when supplied with lifecycleReport. */
  failureReasonAnalysisReport?: import("./historical-evaluator-failure-reason-analysis-types").HistoricalEvaluatorFailureReasonAnalysisReport;
  rMultipleStatisticsReport?: import("./historical-independent-trade-r-multiple-statistics-types").HistoricalIndependentTradeRMultipleStatisticsReport;
  entryReferenceQualityReport?: import("./historical-entry-reference-quality-analysis-types").HistoricalEntryReferenceQualityAnalysisReport;
  validationReport?: import("./historical-independent-trade-statistical-validation-types").IndependentTradeStatisticalValidationReport;
}
