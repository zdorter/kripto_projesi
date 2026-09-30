/**
 * Default futures watchlist (matches crypto-dashboard DEFAULT_WATCHLIST_SYMBOLS).
 */
export const DEFAULT_WATCHLIST_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

export function normalizeWatchlistSymbol(symbol: string): string {
  return String(symbol ?? "").trim().toUpperCase();
}
