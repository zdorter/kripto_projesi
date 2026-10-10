import {
  PERCENTILE_LINEAR_INTERPOLATION_V1,
  type MslHistoricalCohortAnalyticsPercentileAlgorithm,
  type MslHistoricalNumericDistributionStats,
  type MslHistoricalTimeToEventStats,
} from "./msl-historical-cohort-analytics-types";

/** position = p * (n - 1); linear interpolate floor/ceil indices. */
export function percentileLinearInterpolationV1(
  sortedValues: readonly number[],
  p: number
): number | null {
  const n = sortedValues.length;
  if (n === 0 || !Number.isFinite(p) || p < 0 || p > 1) {
    return null;
  }
  if (n === 1) {
    return sortedValues[0]!;
  }
  const position = p * (n - 1);
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  if (lo === hi) {
    return sortedValues[lo]!;
  }
  const weight = position - lo;
  return sortedValues[lo]! + (sortedValues[hi]! - sortedValues[lo]!) * weight;
}

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function emptyNumericDistributionStats(): MslHistoricalNumericDistributionStats {
  return {
    count: 0,
    min: null,
    max: null,
    mean: null,
    median: null,
    p25: null,
    p50: null,
    p75: null,
    percentileAlgorithm: null,
  };
}

export function buildNumericDistributionStats(
  values: readonly number[]
): MslHistoricalNumericDistributionStats {
  if (values.length === 0) {
    return emptyNumericDistributionStats();
  }
  const sorted = sortedCopy(values);
  const algo: MslHistoricalCohortAnalyticsPercentileAlgorithm =
    PERCENTILE_LINEAR_INTERPOLATION_V1;
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: mean(sorted),
    median: percentileLinearInterpolationV1(sorted, 0.5),
    p25: percentileLinearInterpolationV1(sorted, 0.25),
    p50: percentileLinearInterpolationV1(sorted, 0.5),
    p75: percentileLinearInterpolationV1(sorted, 0.75),
    percentileAlgorithm: algo,
  };
}

export function emptyTimeToEventStats(): MslHistoricalTimeToEventStats {
  return {
    count: 0,
    minBars: null,
    maxBars: null,
    meanBars: null,
    medianBars: null,
    percentileAlgorithm: null,
  };
}

export function buildTimeToEventStats(
  barsAfterEvaluation: readonly number[]
): MslHistoricalTimeToEventStats {
  if (barsAfterEvaluation.length === 0) {
    return emptyTimeToEventStats();
  }
  const sorted = sortedCopy(barsAfterEvaluation);
  const algo: MslHistoricalCohortAnalyticsPercentileAlgorithm =
    PERCENTILE_LINEAR_INTERPOLATION_V1;
  return {
    count: sorted.length,
    minBars: sorted[0]!,
    maxBars: sorted[sorted.length - 1]!,
    meanBars: mean(sorted),
    medianBars: percentileLinearInterpolationV1(sorted, 0.5),
    percentileAlgorithm: algo,
  };
}
