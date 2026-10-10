import type { MslHistoricalCohortAnalyticsReportV1 } from "./msl-historical-cohort-analytics-types";
import type { MslHistoricalEvidenceRecordV1 } from "./msl-historical-evidence-types";
import type { Candle } from "../types";

export const MSL_HISTORICAL_RESEARCH_BATCH_REPORT_SCHEMA_VERSION = "1.0" as const;

export type MslHistoricalResearchDatasetStatus = "COMPLETE" | "PARTIAL" | "INVALID";

export interface HistoricalResearchDataset {
  datasetId: string;
  symbol: string;
  timeframe: string;
  datasetChecksum: string;
  source: string;
  closedCandleOnly: boolean;
  barDurationMs: number;
  fixturePath: string;
  candles: readonly Candle[];
  status: MslHistoricalResearchDatasetStatus;
  firstEvaluationBar: number;
  lastEvaluationBar: number;
}

export interface MslHistoricalResearchEvaluationConfig {
  evaluationIndices: readonly number[];
  observationHorizonBars: readonly number[];
  skippedEvaluations: readonly MslHistoricalResearchSkippedEvaluation[];
}

export interface MslHistoricalResearchSkippedEvaluation {
  datasetId: string;
  evaluationBarIndex: number;
  code: string;
  message: string;
}

export interface MslHistoricalResearchEvidenceSummary {
  totalRecordCount: number;
  strictRecordCount: number;
  disclosureRecordCount: number;
  observationOnlyRecordCount: number;
  eventFamilyCounts: Readonly<Record<string, number>>;
}

export interface MslHistoricalResearchCoverage {
  datasetCount: number;
  symbolCount: number;
  timeframeCount: number;
  requestedEvaluationCount: number;
  completedEvaluationCount: number;
  skippedEvaluationCount: number;
  perDataset: readonly MslHistoricalResearchDatasetCoverage[];
}

export interface MslHistoricalResearchDatasetCoverage {
  datasetId: string;
  symbol: string;
  timeframe: string;
  datasetChecksum: string;
  status: MslHistoricalResearchDatasetStatus;
  firstEvaluationBar: number;
  lastEvaluationBar: number;
  requestedEvaluationCount: number;
  completedEvaluationCount: number;
  skippedEvaluationCount: number;
}

export interface MslHistoricalResearchOverlapReport {
  overlapDependencyRisk: boolean;
  evaluationPairCount: number;
  overlappingPairCount: number;
  overlapRatio: number | null;
  sameDatasetOverlapCount: number;
  sameSymbolOverlapCount: number;
  sameTimeframeOverlapCount: number;
  overlappingWindowLabels: readonly string[];
}

export interface MslHistoricalResearchHorizonComparisonRow {
  observationHorizonBars: number;
  sampleCount: number;
  meanForwardReturn: number | null;
  medianForwardReturn: number | null;
  meanMfe: number | null;
  meanMae: number | null;
}

export interface MslHistoricalResearchCrossSymbolAggregate {
  aggregateLabel: "ALL_SYMBOLS";
  cohortAnalytics: MslHistoricalCohortAnalyticsReportV1;
  limitations: readonly string[];
}

export interface MslHistoricalResearchCrossTimeframeAggregate {
  aggregateLabel: string;
  timeframesIncluded: readonly string[];
  cohortAnalytics: MslHistoricalCohortAnalyticsReportV1;
  limitations: readonly string[];
}

export interface MslHistoricalResearchPerformanceMetrics {
  evidenceGenerationMs: number;
  analyticsGenerationMs: number;
  totalProcessingMs: number;
}

export interface MslHistoricalResearchBatchReportV1 {
  schemaVersion: typeof MSL_HISTORICAL_RESEARCH_BATCH_REPORT_SCHEMA_VERSION;
  runId: string;
  datasets: readonly HistoricalResearchDatasetMeta[];
  evaluationConfig: MslHistoricalResearchEvaluationConfig;
  evidenceRecords: readonly MslHistoricalEvidenceRecordV1[];
  evidenceSummary: MslHistoricalResearchEvidenceSummary;
  cohortAnalytics: MslHistoricalCohortAnalyticsReportV1;
  crossSymbolAggregate: MslHistoricalResearchCrossSymbolAggregate | null;
  crossTimeframeAggregates: readonly MslHistoricalResearchCrossTimeframeAggregate[];
  horizonComparisons: readonly MslHistoricalResearchHorizonComparisonRow[];
  coverage: MslHistoricalResearchCoverage;
  overlap: MslHistoricalResearchOverlapReport;
  performance: MslHistoricalResearchPerformanceMetrics;
  limitations: readonly string[];
  unresolved: readonly { code: string; message: string }[];
}

export interface HistoricalResearchDatasetMeta {
  datasetId: string;
  symbol: string;
  timeframe: string;
  datasetChecksum: string;
  source: string;
  closedCandleOnly: boolean;
  barDurationMs: number;
  fixturePath: string;
  status: MslHistoricalResearchDatasetStatus;
  firstEvaluationBar: number;
  lastEvaluationBar: number;
}

export interface BuildMslHistoricalResearchBatchReportInput {
  datasets: readonly HistoricalResearchDataset[];
  evaluationIndices?: readonly number[];
  startE?: number;
  endE?: number;
  step?: number;
  observationHorizonBars: readonly number[];
  swingConfig?: import("../types").SwingConfig;
  /** Optional derived HTF candles keyed by LTF datasetId for MSL-7C. */
  htfCandlesByDatasetId?: Readonly<Record<string, readonly Candle[]>>;
  minEvaluationBarIndex?: number;
}
