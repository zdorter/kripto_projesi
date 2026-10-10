import {
  HistoricalOhlcvDatasetValidationError,
  validateHistoricalOhlcvDataset,
} from "../historical-ohlcv-dataset-validation";
import type { Candle } from "../types";
import { deriveHtfCandlesFromLtf } from "./market-structure-htf-derivation";
import {
  barCloseTimestamp,
  getTimeframeDurationMs,
  normalizeTimeframeId,
} from "./market-structure-bar-timestamp";
import {
  buildMarketStructureMtfAlignmentContext,
  resolveHtfEvaluationBarIndex,
} from "./market-structure-mtf-alignment";
import { buildMarketStructureDescriptiveConfluenceSurfaceContext } from "./market-structure-descriptive-confluence-surface";
import {
  BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES,
  NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
  NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
  type BuildNativeHtfParityReportInput,
  type DecimalNormalizedVolumeParityRepresentativeCase,
  type DecimalNormalizedVolumeParityResult,
  type NativeHtfParityBucketOutcome,
  type NativeHtfParityBucketRow,
  type NativeHtfParityInvalidNativeInput,
  type NativeHtfParityReport,
  type NativeHtfSemanticParityReport,
  type NativeHtfSemanticParitySampleResult,
} from "./native-htf-parity-types";

export {
  BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES,
  NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
  NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
} from "./native-htf-parity-types";

export type {
  BuildNativeHtfParityReportInput,
  DecimalNormalizedVolumeParityResult,
  DecimalNormalizedVolumeParityStatus,
  NativeHtfFieldParityStatus,
  NativeHtfParityBucketOutcome,
  NativeHtfParityBucketRow,
  NativeHtfParityReport,
  NativeHtfSemanticParityReport,
  NativeHtfSemanticParitySampleResult,
  NativeHtfSemanticParityStatus,
} from "./native-htf-parity-types";

const FOUR_H_MS = 14_400_000;
const ONE_H_MS = 3_600_000;

/** Known strict field mismatch buckets (IEEE-754); decimal-normalized evidence (D-VOL-1). */
export const BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS = {
  firstStrictMismatch: 1780502400000,
  largestAbsDiff: 1780560000000,
  smallestAbsDiff: 1791014400000,
  mixedDecimalMember: 1780560000000,
} as const;

const NORMALIZED_VOLUME_LIMITATIONS = [
  "decimal_normalized_volume_parity_research_only",
  "btc_only",
  "research_window_only",
  "three_decimal_observation",
  "not_universal_binance_volume_precision",
  "not_field_parity_substitute",
  "msl7b_js_sum_unchanged",
] as const;

function emptyNormalizedVolumeParity(): DecimalNormalizedVolumeParityResult {
  return {
    status: "NOT_ESTABLISHED",
    precision: null,
    comparedBuckets: 0,
    matchedBuckets: 0,
    mismatchedBuckets: 0,
    limitations: ["decimal_normalized_volume_parity_not_requested"],
    representativeEvidence: [],
  };
}

/**
 * Decimal literal at fixed scale (pad/truncate fractional part; no float accumulation).
 */
export function volumeDecimalLiteralAtFixedPrecision(
  volume: number,
  decimalPlaces: number
): string {
  if (!Number.isFinite(volume) || !Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new Error("invalid volume or decimalPlaces");
  }
  const s = String(volume);
  if (!s.includes(".")) {
    return decimalPlaces === 0 ? s : `${s}.${"0".repeat(decimalPlaces)}`;
  }
  const [intPart, frac = ""] = s.split(".");
  if (frac.length > decimalPlaces) {
    throw new Error(`volume ${volume} exceeds fixed precision ${decimalPlaces}`);
  }
  return `${intPart}.${frac.padEnd(decimalPlaces, "0")}`;
}

/** Sum volumes with BigInt at explicit decimal precision (no IEEE-754 accumulation). */
export function sumVolumesAtDecimalPrecision(
  volumes: readonly number[],
  decimalPlaces: number
): number {
  const scale = decimalPlaces;
  const factor = 10n ** BigInt(scale);
  let total = 0n;
  for (const v of volumes) {
    const lit = volumeDecimalLiteralAtFixedPrecision(v, scale);
    const [intPart, frac = ""] = lit.split(".");
    const padded = frac.padEnd(scale, "0");
    total += BigInt(intPart + padded);
  }
  return Number(total) / Number(factor);
}

export function maxVolumeDecimalPlacesObserved(volumes: readonly number[]): number {
  let max = 0;
  for (const v of volumes) {
    const s = String(v);
    if (s.includes(".")) {
      max = Math.max(max, s.split(".")[1]?.length ?? 0);
    }
  }
  return max;
}

const STANDARD_LIMITATIONS = [
  "native_htf_parity_research_only",
  "not_production_signal",
  "derived_htf_remains_canonical_for_msl",
  "no_network_in_comparator",
  `parity_rule_id=${NATIVE_HTF_PARITY_RESEARCH_RULE_ID}`,
] as const;

export function utc4hBucketOpen(timestampMs: number): number {
  return Math.floor(timestampMs / FOUR_H_MS) * FOUR_H_MS;
}

export function assertUtc4hBucketAligned(timeMs: number): boolean {
  return timeMs === utc4hBucketOpen(timeMs);
}

function compareCandleFields(
  derived: Candle,
  native: Candle
): NativeHtfParityBucketOutcome {
  if (derived.time !== native.time) {
    return "timestampMismatch";
  }
  if (derived.open !== native.open) {
    return "openMismatch";
  }
  if (derived.high !== native.high) {
    return "highMismatch";
  }
  if (derived.low !== native.low) {
    return "lowMismatch";
  }
  if (derived.close !== native.close) {
    return "closeMismatch";
  }
  if (derived.volume !== native.volume) {
    return "volumeMismatch";
  }
  return "matched";
}

/**
 * D2/D4: strict OHLCV validation + UTC 4H bucket alignment + no duplicates (via validator).
 */
export function validateNative4hForParity(
  candles: readonly Candle[],
  htfTimeframeId: string = "4H"
): { ok: true } | { ok: false; issue: NativeHtfParityInvalidNativeInput } {
  const tf = normalizeTimeframeId(htfTimeframeId);
  const durationMs = getTimeframeDurationMs(tf);
  if (durationMs === null) {
    return {
      ok: false,
      issue: { code: "UNSUPPORTED_TIMEFRAME", message: `Unsupported HTF: ${htfTimeframeId}` },
    };
  }

  const validation = validateHistoricalOhlcvDataset({
    candles,
    expectedBarDurationMs: durationMs,
  });
  if (!validation.ok) {
    const first = validation.issues[0];
    return {
      ok: false,
      issue: {
        code: first?.code ?? "INVALID_NATIVE",
        message: first?.message ?? "Native validation failed",
      },
    };
  }

  for (let i = 0; i < candles.length; i++) {
    if (!assertUtc4hBucketAligned(candles[i].time)) {
      return {
        ok: false,
        issue: {
          code: "UTC_4H_BUCKET_MISALIGNED",
          message: `Native time ${candles[i].time} is not UTC 4H bucket open`,
        },
      };
    }
  }

  return { ok: true };
}

/** D2: developing native bars excluded from parity comparison set. */
function buildDecimalNormalizedVolumeParity(input: {
  ltfByTime: Map<number, Candle>;
  derivedCandles: readonly Candle[];
  nativeByTime: Map<number, Candle>;
  decimalPlaces: number;
  researchSymbol?: string;
}): DecimalNormalizedVolumeParityResult {
  const limitations: string[] = [...NORMALIZED_VOLUME_LIMITATIONS];
  if (input.researchSymbol && input.researchSymbol !== "BTCUSDT") {
    limitations.push("research_symbol_not_btcusdt");
  }

  let matched = 0;
  let mismatched = 0;
  const evidence: DecimalNormalizedVolumeParityRepresentativeCase[] = [];
  const evidenceLabels: Record<number, string> = {
    [BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS.firstStrictMismatch]:
      "first_strict_field_mismatch",
    [BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS.largestAbsDiff]:
      "largest_js_native_abs_diff",
    [BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS.smallestAbsDiff]:
      "smallest_js_native_abs_diff",
  };

  for (const derived of input.derivedCandles) {
    const native = input.nativeByTime.get(derived.time);
    if (!native) {
      continue;
    }
    const memberTimes = [0, 1, 2, 3].map((j) => derived.time + j * ONE_H_MS);
    const members = memberTimes.map((t) => input.ltfByTime.get(t)!);
    const decimalSum = sumVolumesAtDecimalPrecision(
      members.map((m) => m.volume),
      input.decimalPlaces
    );
    const jsSum = members.reduce((s, c) => s + c.volume, 0);
    if (decimalSum === native.volume) {
      matched += 1;
    } else {
      mismatched += 1;
    }
    const label = evidenceLabels[derived.time];
    if (label) {
      evidence.push({
        label,
        bucketOpen: derived.time,
        nativeVolume: native.volume,
        jsFloatingSumVolume: jsSum,
        decimalNormalizedSumVolume: decimalSum,
      });
    }
  }

  const compared = matched + mismatched;
  let status: DecimalNormalizedVolumeParityResult["status"] = "NOT_ESTABLISHED";
  if (compared > 0 && mismatched === 0) {
    status = "ESTABLISHED";
  } else if (compared > 0 && mismatched > 0) {
    status = "FAILED";
  }

  return {
    status,
    precision: input.decimalPlaces,
    comparedBuckets: compared,
    matchedBuckets: matched,
    mismatchedBuckets: mismatched,
    limitations,
    representativeEvidence: evidence,
  };
}

export function filterNative4hClosedForParity(
  candles: readonly Candle[],
  closedAsOfMs: number,
  htfTimeframeId: string = "4H"
): Candle[] {
  const tf = normalizeTimeframeId(htfTimeframeId);
  return candles.filter((c) => {
    const closeTs = barCloseTimestamp(c, tf);
    return closeTs !== null && closeTs <= closedAsOfMs;
  });
}

export function buildNativeHtfParityReport(
  input: BuildNativeHtfParityReportInput
): NativeHtfParityReport {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId ?? "1H");
  const htfTf = normalizeTimeframeId(input.htfTimeframeId ?? "4H");
  const limitations = [...STANDARD_LIMITATIONS];

  const nativeValidation = validateNative4hForParity(input.nativeHtfCandles, htfTf);
  if (!nativeValidation.ok) {
    return {
      schemaVersion: NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
      ruleId: NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
      ltfTimeframeId: ltfTf,
      htfTimeframeId: htfTf,
      fieldParityStatus: "NOT_ESTABLISHED",
      comparedCompleteBucketCount: 0,
      matchedCount: 0,
      bucketRows: [],
      nativeOnlyTimestamps: [],
      derivedOnlyTimestamps: [],
      incompleteDerivedBuckets: [],
      invalidNativeInput: nativeValidation.issue,
      invalidLtfInput: null,
      mismatchCounts: {},
      normalizedVolumeParity: emptyNormalizedVolumeParity(),
      limitations,
    };
  }

  let nativeForCompare = [...input.nativeHtfCandles];
  if (input.nativeClosedAsOfMs !== undefined) {
    nativeForCompare = filterNative4hClosedForParity(
      nativeForCompare,
      input.nativeClosedAsOfMs,
      htfTf
    );
  }

  const nativeByTime = new Map<number, Candle>();
  for (const c of nativeForCompare) {
    nativeByTime.set(c.time, c);
  }

  let derivedResult;
  try {
    derivedResult = deriveHtfCandlesFromLtf({
      ltfCandles: input.ltfCandles,
      ltfTimeframeId: ltfTf,
      htfTimeframeId: htfTf,
    });
  } catch (err) {
    const code =
      err instanceof HistoricalOhlcvDatasetValidationError
        ? err.issues[0]?.code ?? "INVALID_LTF"
        : "INVALID_LTF";
    const message = err instanceof Error ? err.message : "LTF derivation failed";
    return {
      schemaVersion: NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
      ruleId: NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
      ltfTimeframeId: ltfTf,
      htfTimeframeId: htfTf,
      fieldParityStatus: "NOT_ESTABLISHED",
      comparedCompleteBucketCount: 0,
      matchedCount: 0,
      bucketRows: [],
      nativeOnlyTimestamps: [],
      derivedOnlyTimestamps: [],
      incompleteDerivedBuckets: [],
      invalidNativeInput: null,
      invalidLtfInput: { code, message },
      mismatchCounts: {},
      normalizedVolumeParity: emptyNormalizedVolumeParity(),
      limitations,
    };
  }

  const ltfByTime = new Map<number, Candle>();
  for (const c of input.ltfCandles) {
    ltfByTime.set(c.time, c);
  }

  const incompleteDerivedBuckets = derivedResult.unresolved
    .filter((u) => u.code === "AGGREGATION_INCOMPLETE_BUCKET" && u.bucketOpen !== undefined)
    .map((u) => u.bucketOpen!);

  const derivedTimes = new Set(derivedResult.candles.map((c) => c.time));
  const nativeOnlyTimestamps: number[] = [];
  for (const c of nativeForCompare) {
    if (!derivedTimes.has(c.time)) {
      nativeOnlyTimestamps.push(c.time);
    }
  }

  const bucketRows: NativeHtfParityBucketRow[] = [];
  let matchedCount = 0;
  let fieldFailed = false;
  const derivedOnlyTimestamps: number[] = [];

  for (const derived of derivedResult.candles) {
    const native = nativeByTime.get(derived.time) ?? null;
    if (!native) {
      derivedOnlyTimestamps.push(derived.time);
      bucketRows.push({
        bucketOpen: derived.time,
        outcome: "nativeMissing",
        derived,
        native: null,
      });
      fieldFailed = true;
      continue;
    }
    const outcome = compareCandleFields(derived, native);
    bucketRows.push({
      bucketOpen: derived.time,
      outcome,
      derived,
      native,
    });
    if (outcome === "matched") {
      matchedCount += 1;
    } else {
      fieldFailed = true;
    }
  }

  const mismatchCounts: Partial<Record<NativeHtfParityBucketOutcome, number>> = {};
  for (const row of bucketRows) {
    if (row.outcome !== "matched") {
      mismatchCounts[row.outcome] = (mismatchCounts[row.outcome] ?? 0) + 1;
    }
  }

  const comparedCompleteBucketCount = derivedResult.candles.length;
  let fieldParityStatus: NativeHtfParityReport["fieldParityStatus"] = "NOT_ESTABLISHED";
  if (comparedCompleteBucketCount > 0 && !fieldFailed) {
    fieldParityStatus = "FIELD_PARITY_ESTABLISHED";
  } else if (comparedCompleteBucketCount > 0 && fieldFailed) {
    fieldParityStatus = "FIELD_PARITY_FAILED";
  } else if (comparedCompleteBucketCount === 0) {
    fieldParityStatus = "NOT_ESTABLISHED";
  }

  let normalizedVolumeParity = emptyNormalizedVolumeParity();
  const normCfg = input.decimalNormalizedVolumeParity;
  if (
    normCfg &&
    Number.isInteger(normCfg.decimalPlaces) &&
    normCfg.decimalPlaces >= 0
  ) {
    normalizedVolumeParity = buildDecimalNormalizedVolumeParity({
      ltfByTime,
      derivedCandles: derivedResult.candles,
      nativeByTime,
      decimalPlaces: normCfg.decimalPlaces,
      researchSymbol: normCfg.researchSymbol,
    });
  }

  return {
    schemaVersion: NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
    ruleId: NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    fieldParityStatus,
    normalizedVolumeParity,
    comparedCompleteBucketCount,
    matchedCount,
    bucketRows,
    nativeOnlyTimestamps,
    derivedOnlyTimestamps,
    incompleteDerivedBuckets,
    invalidNativeInput: null,
    invalidLtfInput: null,
    mismatchCounts,
    limitations,
  };
}

/** Native rows at derived complete bucket opens, ascending (for 7A/9F semantic alignment). */
export function alignNativeHtfCandlesToDerivedCompleteBuckets(
  derivedHtfCandles: readonly Candle[],
  nativeHtfCandles: readonly Candle[]
): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of nativeHtfCandles) {
    byTime.set(c.time, c);
  }
  const aligned: Candle[] = [];
  for (const d of derivedHtfCandles) {
    const n = byTime.get(d.time);
    if (n) {
      aligned.push(n);
    }
  }
  return aligned;
}

function alignmentSemanticSignature(
  ctx: ReturnType<typeof buildMarketStructureMtfAlignmentContext>
): Record<string, unknown> {
  return {
    htfEvaluationBarIndex: ctx.htf?.evaluationBarIndex ?? null,
    htfEvaluationTimestamp: ctx.htf?.evaluationTimestamp ?? null,
    htfBarCloseTimestamp: ctx.alignment.htfBarCloseTimestamp,
    htfBarClosedAtLtfEvaluation: ctx.alignment.htfBarClosedAtLtfEvaluation,
    causal: ctx.alignment.causal,
    visibleConfirmedSwingCount: ctx.visibility?.confirmedSwingIndices.length ?? null,
    visibleStructurePairCount: ctx.visibility?.structurePairIndices.length ?? null,
    visibleZigzagPivotCount: ctx.visibility?.zigzagSpinePivotIndices.length ?? null,
  };
}

export function compareNativeDerivedMtfAlignmentSemanticParity(input: {
  ltfCandles: readonly Candle[];
  derivedHtfCandles: readonly Candle[];
  nativeHtfCandles: readonly Candle[];
  ltfEvaluationBarIndices: readonly number[];
  swingConfig?: Parameters<typeof buildMarketStructureMtfAlignmentContext>[0]["swingConfig"];
}): NativeHtfSemanticParitySampleResult[] {
  const results: NativeHtfSemanticParitySampleResult[] = [];
  for (const E of input.ltfEvaluationBarIndices) {
    const derivedCtx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: input.ltfCandles,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: input.derivedHtfCandles,
      htfTimeframeId: "4H",
      swingConfig: input.swingConfig,
    });
    const nativeCtx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: input.ltfCandles,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: input.nativeHtfCandles,
      htfTimeframeId: "4H",
      swingConfig: input.swingConfig,
    });
    const a = alignmentSemanticSignature(derivedCtx);
    const b = alignmentSemanticSignature(nativeCtx);
    const differences: string[] = [];
    for (const key of Object.keys(a)) {
      if (JSON.stringify(a[key as keyof typeof a]) !== JSON.stringify(b[key as keyof typeof b])) {
        differences.push(key);
      }
    }
    results.push({
      ltfEvaluationBarIndex: E,
      ok: differences.length === 0,
      differences,
    });
  }
  return results;
}

function confluenceMtfPanelSignature(
  surface: ReturnType<typeof buildMarketStructureDescriptiveConfluenceSurfaceContext>
): Record<string, unknown> | null {
  const panel = surface.mtfPanel;
  if (!panel) {
    return null;
  }
  return {
    ltfEvaluationTimestamp: panel.evaluationMetadata?.ltfEvaluationTimestamp ?? null,
    htfEvaluationTimestamp: panel.evaluationMetadata?.htfEvaluationTimestamp ?? null,
    horizonBars: panel.evaluationMetadata?.horizonBars ?? null,
    structureAlignment: panel.structureAlignment,
    liquidityAlignment: panel.liquidityAlignment,
    eventOrderingRelationCount: panel.eventOrdering?.evaluationRelationCount ?? null,
  };
}

export function compareNativeDerivedConfluence9fSemanticParity(input: {
  ltfCandles: readonly Candle[];
  derivedHtfCandles: readonly Candle[];
  nativeHtfCandles: readonly Candle[];
  ltfEvaluationBarIndex: number;
  swingConfig?: Parameters<typeof buildMarketStructureDescriptiveConfluenceSurfaceContext>[0]["swingConfig"];
}): { ok: boolean; differences: string[] } {
  const E = input.ltfEvaluationBarIndex;
  const derivedSurface = buildMarketStructureDescriptiveConfluenceSurfaceContext({
    timeframeInputs: [
      { timeframeId: "1H", candles: input.ltfCandles, evaluationBarIndex: E },
    ],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    htfSourceTrack: "DERIVED_1H_4H",
    swingConfig: input.swingConfig,
  });

  const T_LTF = input.ltfCandles[E]!.time;
  const htfEval = resolveHtfEvaluationBarIndex({
    candles: input.nativeHtfCandles,
    timeframeId: "4H",
    ltfEvaluationTimestamp: T_LTF,
  });
  const htfE = htfEval.ok ? htfEval.evaluationBarIndex : 0;

  const nativeSurface = buildMarketStructureDescriptiveConfluenceSurfaceContext({
    timeframeInputs: [
      { timeframeId: "1H", candles: input.ltfCandles, evaluationBarIndex: E },
      { timeframeId: "4H", candles: input.nativeHtfCandles, evaluationBarIndex: htfE },
    ],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    htfSourceTrack: "NATIVE_HTF",
    swingConfig: input.swingConfig,
  });

  const a = confluenceMtfPanelSignature(derivedSurface);
  const b = confluenceMtfPanelSignature(nativeSurface);
  const differences: string[] = [];
  if (a === null || b === null) {
    return { ok: false, differences: ["mtfPanel missing"] };
  }
  for (const key of Object.keys(a)) {
    if (JSON.stringify(a[key as keyof typeof a]) !== JSON.stringify(b[key as keyof typeof b])) {
      differences.push(key);
    }
  }
  return { ok: differences.length === 0, differences };
}

export function buildNativeHtfSemanticParityReport(input: {
  ltfCandles: readonly Candle[];
  derivedHtfCandles: readonly Candle[];
  nativeHtfCandles: readonly Candle[];
  ltfEvaluationBarIndices: readonly number[];
  confluenceEvaluationBarIndex: number;
  swingConfig?: Parameters<typeof buildMarketStructureMtfAlignmentContext>[0]["swingConfig"];
}): NativeHtfSemanticParityReport {
  const mtfAlignmentSamples = compareNativeDerivedMtfAlignmentSemanticParity(input);
  const mtfOk = mtfAlignmentSamples.every((s) => s.ok);
  const confluence = compareNativeDerivedConfluence9fSemanticParity({
    ltfCandles: input.ltfCandles,
    derivedHtfCandles: input.derivedHtfCandles,
    nativeHtfCandles: input.nativeHtfCandles,
    ltfEvaluationBarIndex: input.confluenceEvaluationBarIndex,
    swingConfig: input.swingConfig,
  });

  let status: NativeHtfSemanticParityReport["status"] = "NOT_ESTABLISHED";
  if (mtfOk && confluence.ok) {
    status = "SEMANTIC_PARITY_ESTABLISHED";
  } else if (mtfAlignmentSamples.length > 0) {
    status = "SEMANTIC_PARITY_FAILED";
  }

  return {
    status,
    mtfAlignmentSamples,
    confluence9fOk: confluence.ok,
    confluence9fDifferences: confluence.differences,
  };
}

export { resolveHtfEvaluationBarIndex, barCloseTimestamp, utc4hBucketOpen as fourHourBucketOpen };
