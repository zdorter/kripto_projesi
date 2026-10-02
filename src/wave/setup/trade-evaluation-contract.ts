/** Trade evaluation layer (Phase B) — does not alter MVP reference production. */

export const TRADE_EVALUATION_SCHEMA_VERSION = "1.0" as const;

/** Maximum relative deviation from entry reference for ENTRY_VALID. */
export const TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE = 0.01;

/** Minimum risk-reward ratio (canonical prospective RR math). */
export const TRADE_EVALUATION_MIN_RR = 1.5;

export const TRADE_EVALUATION_FIRST_FAILURE_ORDER = [
  "ENTRY",
  "STOP",
  "TARGET",
  "RR",
  "SETUP_VALIDITY",
] as const;

/**
 * Live structural invalidation breach (not an executable stop order).
 * BULLISH: breached when liveMarketPrice < invalidationPrice (equality = still valid).
 * BEARISH: breached when liveMarketPrice > invalidationPrice (equality = still valid).
 */
export const TRADE_EVALUATION_STRUCTURAL_INVALIDATION_BREACH = {
  bullish: "liveMarketPrice < invalidationPrice",
  bearish: "liveMarketPrice > invalidationPrice",
} as const;
