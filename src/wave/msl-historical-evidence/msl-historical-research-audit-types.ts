import type { MslHistoricalNumericDistributionStats } from "./msl-historical-cohort-analytics-types";
import type { MslHistoricalResearchBatchReportV1 } from "./msl-historical-research-pipeline-types";
import type { Msl14AuditGridSpecV1 } from "./msl-historical-research-audit-grid";

export const MSL_HISTORICAL_RESEARCH_MEASUREMENT_AUDIT_SCHEMA_VERSION = "1.0" as const;

export interface MslHistoricalResearchChecksumAuditEntry {
  datasetId: string;
  symbol: string;
  timeframe: string;
  checksumBefore: string;
  checksumAfter: string;
  unchanged: boolean;
}

export interface MslHistoricalResearchMeasurementModeCohortSummary {
  measurementMode: "STRICT_AT_E" | "DISCLOSURE_HORIZON" | "OBSERVATION_ONLY";
  cohortRowCount: number;
  sampleCount: number;
  eventCount: number;
  noEventCount: number;
  sufficientHorizonCount: number;
  insufficientHorizonCount: number;
}

export interface MslHistoricalResearchEventInventoryV1 {
  BOS: number;
  CHoCH: number;
  MSS: number;
  LIQUIDITY_WICK_TOUCH: number;
  CROSS_TF_LIQUIDITY_WICK_TOUCH: number;
  SWEEP: number;
  TAKEN: number;
  RECLAIM: number;
  LIQUIDITY_TO_BOS: number;
  LIQUIDITY_TO_CHOCH: number;
  STRUCTURE_TO_MSS: number;
  MSS_TO_STRUCTURE: number;
  MSS_TO_MSS: number;
  NONE: number;
}

export interface MslHistoricalResearchForwardMetricAuditSlice {
  eventFamily: string;
  measurementMode: string;
  observationHorizonBars: number;
  timeframe: string;
  forwardReturnStats: MslHistoricalNumericDistributionStats;
  mfeStats: MslHistoricalNumericDistributionStats;
  maeStats: MslHistoricalNumericDistributionStats;
  rangeExpansionStats: MslHistoricalNumericDistributionStats;
}

export interface MslHistoricalResearchTimeToEventAuditSlice {
  eventFamily: string;
  count: number;
  minBars: number | null;
  medianBars: number | null;
  meanBars: number | null;
  maxBars: number | null;
}

export interface MslHistoricalResearchCoOccurrenceAuditEntry {
  observedCoOccurrenceKey: string;
  count: number;
}

export interface MslHistoricalResearchDataQualityFinding {
  code: string;
  count: number;
  sampleMessages: readonly string[];
}

export interface MslHistoricalResearchLeakageAuditResult {
  representativeEvaluationBarIndices: readonly number[];
  strictMembershipUnchanged: boolean;
  knownAtClassificationUnchanged: boolean;
  passed: boolean;
}

export interface MslHistoricalResearchFutureSpikeAuditResult {
  strictMembershipUnchanged: boolean;
  forwardMetricsMayDiffer: boolean;
  frozenBtcChecksumUnchanged: boolean;
  passed: boolean;
}

export interface MslHistoricalResearchMeasurementAuditReportV1 {
  schemaVersion: typeof MSL_HISTORICAL_RESEARCH_MEASUREMENT_AUDIT_SCHEMA_VERSION;
  auditRunId: string;
  grid: Msl14AuditGridSpecV1;
  batchRunId: string;
  datasetInventory: readonly {
    datasetId: string;
    symbol: string;
    timeframe: string;
    datasetChecksum: string;
    fixturePath: string;
    candleCount: number;
    status: string;
  }[];
  checksumAudit: readonly MslHistoricalResearchChecksumAuditEntry[];
  measurementModeAudit: readonly MslHistoricalResearchMeasurementModeCohortSummary[];
  eventInventory: MslHistoricalResearchEventInventoryV1;
  associationInventory: Readonly<Record<string, number>>;
  forwardMetricAudit: readonly MslHistoricalResearchForwardMetricAuditSlice[];
  timeToEventAudit: readonly MslHistoricalResearchTimeToEventAuditSlice[];
  horizonComparison: MslHistoricalResearchBatchReportV1["horizonComparisons"];
  coOccurrenceAudit: readonly MslHistoricalResearchCoOccurrenceAuditEntry[];
  overlapDependencyAudit: MslHistoricalResearchBatchReportV1["overlap"] & {
    overlapDependencyRiskLabel: "overlap_dependency_risk";
    notStatisticallyIndependentNote: string;
  };
  leakageAudit: MslHistoricalResearchLeakageAuditResult;
  futureSpikeAudit: MslHistoricalResearchFutureSpikeAuditResult;
  dataQualityAudit: readonly MslHistoricalResearchDataQualityFinding[];
  multisymbolStatus: {
    multisymbolDataSupplied: boolean;
    symbolCount: number;
    unresolvedCodes: readonly string[];
  };
  mtfStatus: {
    canonicalMtf: "DERIVED_1H_4H";
    fifteenMinute: "NOT_ESTABLISHED";
    nativeHtfProduction: "NOT_ESTABLISHED";
  };
  performance: MslHistoricalResearchBatchReportV1["performance"];
  limitations: readonly string[];
  unresolved: readonly { code: string; message: string }[];
}

export interface BuildMslHistoricalResearchMeasurementAuditInput {
  batchReport: MslHistoricalResearchBatchReportV1;
  grid: Msl14AuditGridSpecV1;
  checksumAudit: readonly MslHistoricalResearchChecksumAuditEntry[];
  leakageAudit: MslHistoricalResearchLeakageAuditResult;
  futureSpikeAudit: MslHistoricalResearchFutureSpikeAuditResult;
  datasetCandleCounts: Readonly<Record<string, number>>;
  dataQualityAudit?: readonly MslHistoricalResearchDataQualityFinding[];
}
