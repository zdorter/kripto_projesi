import type { Candle } from "../types";

export const MARKET_STRUCTURE_HTF_DERIVATION_RESULT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID =
  "MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_V1" as const;

export const MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID =
  "MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_V1" as const;

export const NATIVE_HTF_RESEARCH_TRACK_LIMITATION =
  "NATIVE_HTF_RESEARCH_TRACK" as const;

export interface HtfDerivationUnresolvedReason {
  code: string;
  message: string;
  bucketOpen?: number;
}

export interface DeriveHtfCandlesFromLtfResult {
  schemaVersion: typeof MARKET_STRUCTURE_HTF_DERIVATION_RESULT_SCHEMA_VERSION;
  ltfTimeframeId: string;
  htfTimeframeId: string;
  ratio: number;
  ruleIds: {
    derivation: typeof MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID;
    aggregation: typeof MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID;
    bucket: typeof MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID;
  };
  candles: readonly Candle[];
  unresolved: readonly HtfDerivationUnresolvedReason[];
  limitations: readonly string[];
}
