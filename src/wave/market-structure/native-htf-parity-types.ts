import type { Candle } from "../types";

export const NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION = "1.1" as const;

/** D-VOL-1: BTC frozen research window observation only (not universal Binance precision). */
export const BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES = 3 as const;

export const NATIVE_HTF_PARITY_RESEARCH_RULE_ID =
  "NATIVE_HTF_PARITY_RESEARCH_V1" as const;

export type NativeHtfFieldParityStatus =
  | "FIELD_PARITY_ESTABLISHED"
  | "FIELD_PARITY_FAILED"
  | "NOT_ESTABLISHED";

export type NativeHtfSemanticParityStatus =
  | "SEMANTIC_PARITY_ESTABLISHED"
  | "SEMANTIC_PARITY_FAILED"
  | "NOT_ESTABLISHED";

export type NativeHtfParityBucketOutcome =
  | "matched"
  | "timestampMismatch"
  | "openMismatch"
  | "highMismatch"
  | "lowMismatch"
  | "closeMismatch"
  | "volumeMismatch"
  | "nativeMissing"
  | "incompleteDerivedBucket";

export interface NativeHtfParityBucketRow {
  bucketOpen: number;
  outcome: NativeHtfParityBucketOutcome;
  derived: Candle | null;
  native: Candle | null;
}

export interface NativeHtfParityInvalidNativeInput {
  code: string;
  message: string;
}

export type DecimalNormalizedVolumeParityStatus =
  | "ESTABLISHED"
  | "FAILED"
  | "NOT_ESTABLISHED";

export interface DecimalNormalizedVolumeParityRepresentativeCase {
  label: string;
  bucketOpen: number;
  nativeVolume: number;
  jsFloatingSumVolume: number;
  decimalNormalizedSumVolume: number;
}

export interface DecimalNormalizedVolumeParityResult {
  status: DecimalNormalizedVolumeParityStatus;
  precision: number | null;
  comparedBuckets: number;
  matchedBuckets: number;
  mismatchedBuckets: number;
  limitations: readonly string[];
  representativeEvidence: readonly DecimalNormalizedVolumeParityRepresentativeCase[];
}

export interface NativeHtfParityReport {
  schemaVersion: typeof NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION;
  ruleId: typeof NATIVE_HTF_PARITY_RESEARCH_RULE_ID;
  ltfTimeframeId: string;
  htfTimeframeId: string;
  /** Strict D3 exact JS numeric equality (unchanged). */
  fieldParityStatus: NativeHtfFieldParityStatus;
  /** Research-only decimal-safe volume tier (D-VOL-1); independent of fieldParityStatus. */
  normalizedVolumeParity: DecimalNormalizedVolumeParityResult;
  comparedCompleteBucketCount: number;
  matchedCount: number;
  bucketRows: readonly NativeHtfParityBucketRow[];
  /** Native bars outside complete derived bucket set (includes edge native-only). */
  nativeOnlyTimestamps: readonly number[];
  /** Derived complete buckets with no native row at same open time. */
  derivedOnlyTimestamps: readonly number[];
  incompleteDerivedBuckets: readonly number[];
  invalidNativeInput: NativeHtfParityInvalidNativeInput | null;
  invalidLtfInput: NativeHtfParityInvalidNativeInput | null;
  mismatchCounts: Readonly<Partial<Record<NativeHtfParityBucketOutcome, number>>>;
  limitations: readonly string[];
}

export interface BuildNativeHtfParityReportInput {
  ltfCandles: readonly Candle[];
  nativeHtfCandles: readonly Candle[];
  ltfTimeframeId?: string;
  htfTimeframeId?: string;
  /** Exclude native bars not closed at this instant (developing bars). Default: all rows treated closed. */
  nativeClosedAsOfMs?: number;
  /**
   * D-VOL-1: optional research-only normalized volume parity.
   * `decimalPlaces` must be explicit; omitting leaves normalizedVolumeParity NOT_ESTABLISHED.
   */
  decimalNormalizedVolumeParity?: {
    decimalPlaces: number;
    /** For limitation tagging only (e.g. BTCUSDT research fixture). */
    researchSymbol?: string;
  };
}

export interface NativeHtfSemanticParitySampleResult {
  ltfEvaluationBarIndex: number;
  ok: boolean;
  differences: readonly string[];
}

export interface NativeHtfSemanticParityReport {
  status: NativeHtfSemanticParityStatus;
  mtfAlignmentSamples: readonly NativeHtfSemanticParitySampleResult[];
  confluence9fOk: boolean;
  confluence9fDifferences: readonly string[];
}
