/**
 * Historical production compose (Phase B-8b) — as-of evaluation trade-evaluation inputs.
 *
 * B-4 entry freshness and B-5 setup validity both use `liveMarketPrice`.
 * For offline historical compose at bar E, network ticker is not used.
 *
 * Policy ENTRY_REFERENCE: use the same prospective entry reference produced at E
 * (evaluation-bar close reference). Effects:
 * - Entry freshness: zero deviation vs entry ref → VALID (not STALE from a later ticker).
 * - Setup validity: invalidation breach is judged at the as-of entry reference price,
 *   consistent with structural refs frozen at E (not a subsequent live path).
 */
export const HISTORICAL_AS_OF_EVAL_LIVE_MARKET_PRICE_POLICY =
  "ENTRY_REFERENCE" as const;

export type HistoricalAsOfEvalLiveMarketPricePolicy =
  typeof HISTORICAL_AS_OF_EVAL_LIVE_MARKET_PRICE_POLICY;

/**
 * Deterministic liveMarketPrice for `presentWaveScannerRow` on historical compose rows.
 */
export function resolveHistoricalAsOfEvalLiveMarketPrice(
  entryReferencePrice: number | null
): number | null {
  return entryReferencePrice;
}
