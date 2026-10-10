import type { EntryReferenceGeometryQuality } from "./historical-entry-reference-quality-analysis-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import type {
  EvaluatorFailureReasonAnalysisBucket,
  HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
} from "./historical-evaluator-failure-reason-contract";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { HistoricalPositionOutcomeStatisticRate } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { IndependentTradeSnapshotReference } from "./historical-independent-trade-statistics-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

export const HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION =
  "1.0" as const;

export const FAILURE_REASON_DEEP_DIAGNOSTIC_EXIT_PRESENTATION_IDS = [
  "TARGET",
  "INVALIDATION",
  "AMBIGUOUS",
  "NO_TOUCH",
] as const;

export type FailureReasonDeepDiagnosticExitPresentationId =
  (typeof FAILURE_REASON_DEEP_DIAGNOSTIC_EXIT_PRESENTATION_IDS)[number];

export const FAILURE_REASON_DEEP_DIAGNOSTIC_CONDITIONAL_DIMENSIONS = [
  "DIRECTION",
  "PROSPECTIVE_RR",
  "GEOMETRY",
  "SETUP_FAMILY",
  "EXIT_PRESENTATION",
  "DURATION",
] as const;

export type FailureReasonDeepDiagnosticConditionalDimension =
  (typeof FAILURE_REASON_DEEP_DIAGNOSTIC_CONDITIONAL_DIMENSIONS)[number];

export const FAILURE_REASON_DEEP_DIAGNOSTIC_POLICY_CLASSIFICATIONS: readonly HistoricalPositionPolicyClassification[] =
  [
    "FAVORABLE_RESOLUTION",
    "ADVERSE_RESOLUTION",
    "INCONCLUSIVE_SAME_BAR",
    "UNRESOLVED_AT_HORIZON",
    "UNMEASURED_NO_FUTURE",
    "UNMEASURED_INSUFFICIENT",
  ];

export interface FailureReasonDeepDiagnosticMasterRow {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  failedTrades: number;
  failedDecisive: number;
  failedWins: number;
  failedLosses: number;
  failedInconclusive: number;
  failedUnresolved: number;
  failedUnmeasured: number;
  failedWinRateDecisive: HistoricalPositionOutcomeStatisticRate;
  failedWinRateDenominatorId: typeof import("./historical-evaluator-failure-reason-analysis-types").EVALUATOR_FAILURE_REASON_DENOMINATOR_IDS.FAILED_DECISIVE_RESOLUTIONS;
  contributionToAllFailedWins: number | null;
  contributionToAllDecisiveWins: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  winRateDeltaFromOverallDecisivePercentagePoints: number | null;
  winRateDeltaFromFailedDecisivePercentagePoints: number | null;
}

export interface FailureReasonDeepDiagnosticRankingEntry {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  rank: number;
  metricValue: number;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  rankingEligible: boolean;
  descriptiveLabel: string;
}

export interface FailureReasonDeepDiagnosticRankings {
  highestObservedFailedDecisiveWinRate: readonly FailureReasonDeepDiagnosticRankingEntry[];
  highestObservedFailedWinCount: readonly FailureReasonDeepDiagnosticRankingEntry[];
  highestObservedContributionToFailedWins: readonly FailureReasonDeepDiagnosticRankingEntry[];
  highestObservedContributionToDecisiveWins: readonly FailureReasonDeepDiagnosticRankingEntry[];
  notes: string;
}

export interface FailureReasonDeepDiagnosticFailedWinProfile {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  failedWins: number;
  failedLosses: number;
  decisive: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  contributionToFailedWins: number | null;
  contributionToOverallDecisiveWins: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface FailureReasonDeepDiagnosticPolicyOutcomeCell {
  policyClassification: HistoricalPositionPolicyClassification;
  count: number;
}

export interface FailureReasonDeepDiagnosticOutcomeMatrixRow {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  cells: readonly FailureReasonDeepDiagnosticPolicyOutcomeCell[];
}

export interface FailureReasonDeepDiagnosticDimensionSlice {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  total: number;
  decisive: number;
  wins: number;
  losses: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface FailureReasonDeepDiagnosticDirectionRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  direction: HistoricalPositionOutcomeDirectionSliceKey;
}

export interface FailureReasonDeepDiagnosticRrRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  prospectiveRrBucket: HistoricalMeasurementRRBucketRow;
}

export interface FailureReasonDeepDiagnosticGeometryRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  geometry: EntryReferenceGeometryQuality;
}

export interface FailureReasonDeepDiagnosticFamilyRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  setupFamilyId: string;
}

export interface FailureReasonDeepDiagnosticExitRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  exitPresentation: FailureReasonDeepDiagnosticExitPresentationId;
}

export interface FailureReasonDeepDiagnosticDurationRow
  extends FailureReasonDeepDiagnosticDimensionSlice {
  durationBucket: IndependentTradeDurationBucketId;
}

export interface FailureReasonDeepDiagnosticConditionalSlice {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  dimension: FailureReasonDeepDiagnosticConditionalDimension;
  dimensionValue: string;
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  winRateDecisive: HistoricalPositionOutcomeStatisticRate;
  deltaVsOverallDecisiveWinRatePercentagePoints: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
}

export interface FailureReasonDeepDiagnosticConcentrationRow {
  failureReason: EvaluatorFailureReasonAnalysisBucket;
  failedWins: number;
  failedWinShare: number | null;
  decisiveWinShare: number | null;
}

export interface FailureReasonDeepDiagnosticBaselines {
  overallDecisiveWins: number;
  overallDecisiveLosses: number;
  overallDecisiveTrades: number;
  overallDecisiveWinRate: HistoricalPositionOutcomeStatisticRate;
  failedDecisiveWins: number;
  failedDecisiveLosses: number;
  failedDecisiveTrades: number;
  failedDecisiveWinRate: HistoricalPositionOutcomeStatisticRate;
  referenceExpectationNote: string;
}

export interface FailureReasonDeepDiagnosticUnknownPopulation {
  failedWithMissingFailureReason: number;
  insufficientContextNoFailureReason: number;
  notes: string;
}

export interface FailureReasonDeepDiagnosticConsumedReports {
  failureReasonSchemaVersion: typeof HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION;
  statisticsSchemaVersion: string | null;
  evaluatorDiagnosticSchemaVersion: string | null;
  rMultipleSchemaVersion: string | null;
  entryReferenceQualitySchemaVersion: string | null;
}

export interface FailureReasonDeepDiagnosticParity {
  observedOverallWins: number;
  observedOverallLosses: number;
  observedOverallDecisive: number;
  observedPassedWins: number | null;
  observedPassedLosses: number | null;
  observedPassedDecisive: number | null;
  observedFailedWins: number | null;
  observedFailedLosses: number | null;
  observedFailedDecisive: number | null;
  statisticsParityHolds: boolean;
  b12lParityHolds: boolean;
  referenceFixtureNote: string;
}

export interface FailureReasonDeepDiagnosticRReference {
  available: boolean;
  sumR: number | null;
  expectancyR: number | null;
  note: string;
}

export interface FailureReasonDeepDiagnosticGeometryReference {
  available: boolean;
  note: string;
}

export interface HistoricalEvaluatorFailureReasonDeepDiagnosticReport {
  schemaVersion: typeof HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION;
  populationKind: "INDEPENDENT_TRADE_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC";
  canonicalSource: {
    lifecycleField: string;
    artifactPath: string;
    freezeNote: string;
  };
  population: {
    independentTrades: number;
    snapshotReference: IndependentTradeSnapshotReference | null;
    primaryPopulationNote: string;
  };
  baselines: FailureReasonDeepDiagnosticBaselines;
  masterTable: readonly FailureReasonDeepDiagnosticMasterRow[];
  rankings: FailureReasonDeepDiagnosticRankings;
  failedWinProfiles: readonly FailureReasonDeepDiagnosticFailedWinProfile[];
  failureReasonByPolicyOutcome: readonly FailureReasonDeepDiagnosticOutcomeMatrixRow[];
  byDirection: readonly FailureReasonDeepDiagnosticDirectionRow[];
  byProspectiveRr: readonly FailureReasonDeepDiagnosticRrRow[];
  byGeometry: readonly FailureReasonDeepDiagnosticGeometryRow[];
  bySetupFamily: readonly FailureReasonDeepDiagnosticFamilyRow[];
  byExitPresentation: readonly FailureReasonDeepDiagnosticExitRow[];
  byDuration: readonly FailureReasonDeepDiagnosticDurationRow[];
  conditionalSlices: readonly FailureReasonDeepDiagnosticConditionalSlice[];
  concentration: {
    byFailureReason: readonly FailureReasonDeepDiagnosticConcentrationRow[];
    topFailureReasonsByFailedWinContribution: readonly FailureReasonDeepDiagnosticConcentrationRow[];
  };
  unknownPopulation: FailureReasonDeepDiagnosticUnknownPopulation;
  consumedReports: FailureReasonDeepDiagnosticConsumedReports;
  parity: FailureReasonDeepDiagnosticParity;
  rMultipleReference: FailureReasonDeepDiagnosticRReference;
  geometryReference: FailureReasonDeepDiagnosticGeometryReference;
  findings: readonly string[];
  warnings: readonly string[];
}

export interface BuildHistoricalEvaluatorFailureReasonDeepDiagnosticInput {
  lifecycleReport: import("./independent-trade-unit-lifecycle-types").IndependentTradeLifecycleReport;
  statisticsReport?: import("./historical-independent-trade-statistics-types").IndependentTradeStatisticsReport;
  evaluatorDiagnosticReport?: import("./historical-independent-trade-evaluator-diagnostic-types").HistoricalIndependentTradeEvaluatorDiagnosticReport;
  failureReasonAnalysisReport?: import("./historical-evaluator-failure-reason-analysis-types").HistoricalEvaluatorFailureReasonAnalysisReport;
  /** Reference only; B-12g values are not recomputed. */
  rMultipleStatisticsReport?: import("./historical-independent-trade-r-multiple-statistics-types").HistoricalIndependentTradeRMultipleStatisticsReport;
  /** Reference only; B-12j geometry counts are not recomputed. */
  entryReferenceQualityReport?: import("./historical-entry-reference-quality-analysis-types").HistoricalEntryReferenceQualityAnalysisReport;
}
