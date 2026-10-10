import { HistoricalOhlcvDatasetValidationError } from "../historical-ohlcv-dataset-validation";
import { validateHistoricalOhlcvDataset } from "../historical-ohlcv-dataset-validation";
import type { Candle } from "../types";
import {
  getTimeframeDurationMs,
  normalizeTimeframeId,
} from "./market-structure-bar-timestamp";
import {
  MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID,
  MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_HTF_DERIVATION_RESULT_SCHEMA_VERSION,
  MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID,
  NATIVE_HTF_RESEARCH_TRACK_LIMITATION,
  type DeriveHtfCandlesFromLtfResult,
  type HtfDerivationUnresolvedReason,
} from "./market-structure-htf-derivation-types";

export {
  MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID,
  MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_HTF_DERIVATION_RESULT_SCHEMA_VERSION,
  MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID,
  NATIVE_HTF_RESEARCH_TRACK_LIMITATION,
} from "./market-structure-htf-derivation-types";

export type {
  DeriveHtfCandlesFromLtfResult,
  HtfDerivationUnresolvedReason,
} from "./market-structure-htf-derivation-types";

export type HtfDerivationValidationMode = "strict" | "report";

export class HtfDerivationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HtfDerivationError";
    this.code = code;
  }
}

export interface DeriveHtfCandlesFromLtfInput {
  ltfCandles: readonly Candle[];
  ltfTimeframeId: string;
  htfTimeframeId: string;
  validationMode?: HtfDerivationValidationMode;
}

const STANDARD_LIMITATIONS = [
  "derived_htf_research_only",
  "binance_utc_bucket_alignment",
  "no_partial_htf_bars",
  "no_silent_gap_fill",
  NATIVE_HTF_RESEARCH_TRACK_LIMITATION,
  "native_htf_not_frozen",
  "native_binance_parity_not_established",
  "msl7c_cross_tf_liquidity_not_implemented",
  "not_production_trading_rule",
  `derivation_rule_id=${MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID}`,
] as const;

function bucketOpenTimestamp(ltfOpen: number, htfDurationMs: number): number {
  return Math.floor(ltfOpen / htfDurationMs) * htfDurationMs;
}

function validateLtfInput(
  candles: readonly Candle[],
  ltfDurationMs: number,
  mode: HtfDerivationValidationMode
): void {
  const validation = validateHistoricalOhlcvDataset({
    candles,
    expectedBarDurationMs: ltfDurationMs,
  });
  if (!validation.ok) {
    if (mode === "strict") {
      throw new HistoricalOhlcvDatasetValidationError(validation.issues);
    }
    throw new HtfDerivationError(
      validation.issues[0]?.code ?? "INVALID_LTF_INPUT",
      validation.issues[0]?.message ?? "LTF validation failed."
    );
  }
}

function aggregateBucket(
  bucketOpen: number,
  members: readonly Candle[]
): Candle {
  const sorted = [...members].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let high = -Infinity;
  let low = Infinity;
  let volume = 0;
  for (const c of sorted) {
    high = Math.max(high, c.high);
    low = Math.min(low, c.low);
    volume += c.volume;
  }
  return {
    time: bucketOpen,
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
  };
}

/**
 * MSL-7B: derive closed HTF OHLCV buckets from LTF candles (UTC Binance-aligned buckets).
 */
export function deriveHtfCandlesFromLtf(
  input: DeriveHtfCandlesFromLtfInput
): DeriveHtfCandlesFromLtfResult {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  const mode = input.validationMode ?? "strict";
  const limitations: string[] = [...STANDARD_LIMITATIONS];
  const unresolved: HtfDerivationUnresolvedReason[] = [];

  const ltfDurationMs = getTimeframeDurationMs(ltfTf);
  const htfDurationMs = getTimeframeDurationMs(htfTf);

  if (ltfDurationMs === null || htfDurationMs === null) {
    throw new HtfDerivationError(
      "UNSUPPORTED_TIMEFRAME",
      `Unsupported timeframe pair: ${input.ltfTimeframeId} → ${input.htfTimeframeId}.`
    );
  }

  if (htfDurationMs <= ltfDurationMs || htfDurationMs % ltfDurationMs !== 0) {
    throw new HtfDerivationError(
      "UNSUPPORTED_TIMEFRAME_RATIO",
      `HTF duration must be an integer multiple of LTF duration.`
    );
  }

  const ratio = htfDurationMs / ltfDurationMs;
  const ltfCandles = input.ltfCandles;

  if (!ltfCandles.length) {
    throw new HtfDerivationError("EMPTY_LTF_INPUT", "LTF candle series is empty.");
  }

  validateLtfInput(ltfCandles, ltfDurationMs, mode);

  const byTime = new Map<number, Candle>();
  for (const c of ltfCandles) {
    byTime.set(c.time, c);
  }

  const bucketOpens = new Set<number>();
  for (const c of ltfCandles) {
    bucketOpens.add(bucketOpenTimestamp(c.time, htfDurationMs));
  }

  const sortedBuckets = [...bucketOpens].sort((a, b) => a - b);
  const derived: Candle[] = [];

  for (const bucketOpen of sortedBuckets) {
    const expectedTimes: number[] = [];
    const members: Candle[] = [];
    let complete = true;
    for (let j = 0; j < ratio; j++) {
      const t = bucketOpen + j * ltfDurationMs;
      expectedTimes.push(t);
      const row = byTime.get(t);
      if (!row) {
        complete = false;
        break;
      }
      members.push(row);
    }
    if (!complete) {
      unresolved.push({
        code: "AGGREGATION_INCOMPLETE_BUCKET",
        message: `Incomplete LTF constituents for HTF bucket open ${bucketOpen}.`,
        bucketOpen,
      });
      continue;
    }
    derived.push(aggregateBucket(bucketOpen, members));
  }

  derived.sort((a, b) => a.time - b.time);

  if (ltfTf === "1H" && htfTf === "4H") {
    limitations.push("v1_primary_pair_1h_to_4h");
  }

  return {
    schemaVersion: MARKET_STRUCTURE_HTF_DERIVATION_RESULT_SCHEMA_VERSION,
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ratio,
    ruleIds: {
      derivation: MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID,
      aggregation: MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID,
      bucket: MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID,
    },
    candles: derived,
    unresolved,
    limitations,
  };
}
