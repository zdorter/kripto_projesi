import type {
  MslHistoricalEvidenceEventFamily,
  MslHistoricalEvidenceMeasurementMode,
  MslHistoricalEvidenceSampleStatus,
} from "./msl-historical-evidence-types";

export const MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION = "1.0" as const;

export const PERCENTILE_LINEAR_INTERPOLATION_V1 =
  "PERCENTILE_LINEAR_INTERPOLATION_V1" as const;

export type MslHistoricalCohortAnalyticsPercentileAlgorithm =
  typeof PERCENTILE_LINEAR_INTERPOLATION_V1;

export interface MslHistoricalNumericDistributionStats {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  percentileAlgorithm: MslHistoricalCohortAnalyticsPercentileAlgorithm | null;
}

export interface MslHistoricalTimeToEventStats {
  count: number;
  minBars: number | null;
  maxBars: number | null;
  meanBars: number | null;
  medianBars: number | null;
  percentileAlgorithm: MslHistoricalCohortAnalyticsPercentileAlgorithm | null;
}

export interface MslHistoricalCohortDefinition {
  symbol: string;
  timeframe: string;
  measurementMode: MslHistoricalEvidenceMeasurementMode;
  eventFamily: MslHistoricalEvidenceEventFamily;
  eventDirection: string | null;
  observationHorizonBars: number;
  sampleStatus: MslHistoricalEvidenceSampleStatus | "ALL";
}

export interface MslHistoricalCohortEventCounts {
  subsequentBosCount: number;
  subsequentChochCount: number;
  subsequentMssCount: number;
  subsequentTouchCount: number;
  subsequentCrossTfTouchCount: number;
  subsequentSweepCount: number;
  subsequentTakenCount: number;
  subsequentReclaimCount: number;
  associationLiquidityToBosCount: number;
  associationLiquidityToChochCount: number;
  firstSubsequentEventFamilyCounts: Readonly<Record<string, number>>;
}

export interface MslHistoricalObservedCoOccurrenceCount {
  observedCoOccurrenceKey: string;
  count: number;
}

export interface MslHistoricalCohortAnalyticsV1 {
  schemaVersion: typeof MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION;
  cohortDefinition: MslHistoricalCohortDefinition;
  sampleCount: number;
  eventCount: number;
  noEventCount: number;
  sufficientHorizonCount: number;
  insufficientHorizonCount: number;
  overlappingWindowRisk: boolean;
  forwardReturnStats: MslHistoricalNumericDistributionStats;
  mfeStats: MslHistoricalNumericDistributionStats;
  maeStats: MslHistoricalNumericDistributionStats;
  rangeExpansionStats: MslHistoricalNumericDistributionStats;
  eventCounts: MslHistoricalCohortEventCounts;
  timeToEventStats: {
    bos: MslHistoricalTimeToEventStats;
    choch: MslHistoricalTimeToEventStats;
    mss: MslHistoricalTimeToEventStats;
    liquidityWickTouch: MslHistoricalTimeToEventStats;
    liquiditySweep: MslHistoricalTimeToEventStats;
    liquidityTaken: MslHistoricalTimeToEventStats;
    liquidityReclaim: MslHistoricalTimeToEventStats;
  };
  observedCoOccurrenceCounts: readonly MslHistoricalObservedCoOccurrenceCount[];
  limitations: readonly string[];
  unresolved: readonly { code: string; message: string }[];
}

export interface MslHistoricalCohortAnalyticsReportV1 {
  schemaVersion: typeof MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION;
  datasetIds: readonly string[];
  datasetChecksums: readonly string[];
  symbolsPresent: readonly string[];
  timeframesPresent: readonly string[];
  multisymbolDataSupplied: boolean;
  overlappingWindowRisk: boolean;
  cohorts: readonly MslHistoricalCohortAnalyticsV1[];
  limitations: readonly string[];
  unresolved: readonly { code: string; message: string }[];
}

export interface BuildMslHistoricalCohortAnalyticsInput {
  records: readonly import("./msl-historical-evidence-types").MslHistoricalEvidenceRecordV1[];
}

export interface DescriptiveCohortComparisonV1 {
  comparisonKind: "DESCRIPTIVE_COHORT_COMPARISON";
  label: "DESCRIPTIVE_ONLY";
  cohortA: MslHistoricalCohortDefinition;
  cohortB: MslHistoricalCohortDefinition;
  sampleCountA: number;
  sampleCountB: number;
  meanForwardReturnDifference: number | null;
  medianForwardReturnDifference: number | null;
  meanMfeDifference: number | null;
  meanMaeDifference: number | null;
  limitations: readonly string[];
}

export interface BuildDescriptiveCohortComparisonInput {
  records: readonly import("./msl-historical-evidence-types").MslHistoricalEvidenceRecordV1[];
  cohortA: Omit<MslHistoricalCohortDefinition, "sampleStatus"> & {
    sampleStatus?: MslHistoricalCohortDefinition["sampleStatus"];
    strictEventPresence?: "PRESENT" | "ABSENT";
  };
  cohortB: Omit<MslHistoricalCohortDefinition, "sampleStatus"> & {
    sampleStatus?: MslHistoricalCohortDefinition["sampleStatus"];
    strictEventPresence?: "PRESENT" | "ABSENT";
  };
}
