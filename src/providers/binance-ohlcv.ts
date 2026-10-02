import type { Candle } from "../wave/types";
import type { OhlcvProvider } from "./ohlcv";

export const BINANCE_FUTURES_KLINES_URL =
  "https://fapi.binance.com/fapi/v1/klines";

export const BINANCE_FUTURES_TICKER_PRICE_URL =
  "https://fapi.binance.com/fapi/v1/ticker/price";

export const BINANCE_FUTURES_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

const MIN_LIMIT = 1;
const MAX_LIMIT = 1000;

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface ParsedBinanceKline {
  candle: Candle;
  closeTime: number;
}

export function validateOhlcvRequest(
  symbol: string,
  interval: string,
  limit: number
): { symbol: string; interval: string; limit: number } {
  const sym = String(symbol ?? "").trim().toUpperCase();
  if (!sym) {
    throw new Error("symbol must not be empty");
  }
  if (!/^[A-Z0-9]{2,20}$/.test(sym)) {
    throw new Error(`invalid symbol: ${symbol}`);
  }

  const intv = String(interval ?? "").trim();
  if (!BINANCE_FUTURES_INTERVALS.has(intv)) {
    throw new Error(`invalid interval: ${interval}`);
  }

  const lim = Math.floor(Number(limit));
  if (!Number.isFinite(lim) || lim < MIN_LIMIT || lim > MAX_LIMIT) {
    throw new Error(`limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
  }

  return { symbol: sym, interval: intv, limit: lim };
}

function parseNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid numeric field: ${field}`);
  }
  return n;
}

export function parseBinanceKlineRow(row: unknown): ParsedBinanceKline {
  if (!Array.isArray(row) || row.length < 7) {
    throw new Error("malformed kline row");
  }

  const openTime = parseNumber(row[0], "openTime");
  const open = parseNumber(row[1], "open");
  const high = parseNumber(row[2], "high");
  const low = parseNumber(row[3], "low");
  const close = parseNumber(row[4], "close");
  const volume = parseNumber(row[5], "volume");
  const closeTime = parseNumber(row[6], "closeTime");

  return {
    closeTime,
    candle: {
      time: openTime,
      open,
      high,
      low,
      close,
      volume,
    },
  };
}

export function mapBinanceKlinesResponse(data: unknown): ParsedBinanceKline[] {
  if (!Array.isArray(data)) {
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      "msg" in data
    ) {
      const err = data as { code: number; msg: string };
      throw new Error(`Binance API error ${err.code}: ${err.msg}`);
    }
    throw new Error("expected klines array response");
  }

  if (data.length === 0) {
    throw new Error("empty klines response");
  }

  return data.map((row) => parseBinanceKlineRow(row));
}

export function filterClosedKlines(
  rows: ParsedBinanceKline[],
  nowMs: number = Date.now()
): Candle[] {
  const closed = rows.filter((r) => r.closeTime <= nowMs);
  if (closed.length === 0) {
    throw new Error("no closed candles after filtering open kline");
  }
  return normalizeCandleOrder(closed.map((r) => r.candle));
}

export function normalizeCandleOrder(candles: Candle[]): Candle[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time < sorted[i - 1].time) {
      throw new Error("candle ordering could not be normalized");
    }
  }
  return sorted;
}

export function parseBinanceTickerPriceResponse(data: unknown): number {
  if (!data || typeof data !== "object" || !("price" in data)) {
    throw new Error("expected ticker price response");
  }
  const price = parseNumber((data as { price: unknown }).price, "price");
  if (price <= 0) {
    throw new Error("invalid ticker price");
  }
  return price;
}

export function buildBinanceFuturesTickerPriceUrl(symbol: string): string {
  const v = validateOhlcvRequest(symbol, "1h", 1);
  const params = new URLSearchParams({ symbol: v.symbol });
  return `${BINANCE_FUTURES_TICKER_PRICE_URL}?${params.toString()}`;
}

export async function fetchBinanceFuturesTickerPrice(
  symbol: string,
  options?: { fetchFn?: FetchFn }
): Promise<number> {
  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch is not available");
  }
  const url = buildBinanceFuturesTickerPriceUrl(symbol);
  const res = await fetchFn(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "msg" in body) {
        detail = String((body as { msg: string }).msg);
      }
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  const json = await res.json();
  return parseBinanceTickerPriceResponse(json);
}

export function buildBinanceFuturesKlinesUrl(
  symbol: string,
  interval: string,
  limit: number
): string {
  const v = validateOhlcvRequest(symbol, interval, limit);
  const params = new URLSearchParams({
    symbol: v.symbol,
    interval: v.interval,
    limit: String(v.limit),
  });
  return `${BINANCE_FUTURES_KLINES_URL}?${params.toString()}`;
}

export async function fetchBinanceFuturesKlines(
  symbol: string,
  interval: string,
  limit: number,
  options?: { fetchFn?: FetchFn; nowMs?: number }
): Promise<Candle[]> {
  const v = validateOhlcvRequest(symbol, interval, limit);
  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch is not available");
  }

  const url = buildBinanceFuturesKlinesUrl(v.symbol, v.interval, v.limit);
  const res = await fetchFn(url);

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "msg" in body) {
        detail = String((body as { msg: string }).msg);
      }
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  const json = await res.json();
  const parsed = mapBinanceKlinesResponse(json);
  return filterClosedKlines(parsed, options?.nowMs ?? Date.now());
}

export class BinanceFuturesOhlcvProvider implements OhlcvProvider {
  constructor(
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis)
  ) {}

  getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<Candle[]> {
    return fetchBinanceFuturesKlines(symbol, interval, limit, {
      fetchFn: this.fetchFn,
    });
  }

  getTickerPrice(symbol: string): Promise<number> {
    return fetchBinanceFuturesTickerPrice(symbol, { fetchFn: this.fetchFn });
  }
}
