import {
  BINANCE_FUTURES_KLINES_URL,
  type FetchFn,
  filterClosedKlines,
  mapBinanceKlinesResponse,
  normalizeCandleOrder,
  validateOhlcvRequest,
} from "../providers/binance-ohlcv";
import type { Candle } from "./types";
import { getTimeframeDurationMs } from "./market-structure/market-structure-bar-timestamp";

export const REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES = 3000 as const;
export const REAL_HISTORICAL_BACKTEST_MAX_TARGET_CANDLES = 10_000 as const;

const WAVE_TIMEFRAME_TO_BINANCE_INTERVAL: Record<string, string> = {
  "1M": "1m",
  "3M": "3m",
  "5M": "5m",
  "15M": "15m",
  "30M": "30m",
  "1H": "1h",
  "2H": "2h",
  "4H": "4h",
  "6H": "6h",
  "8H": "8h",
  "12H": "12h",
  "1D": "1d",
  "3D": "3d",
  "1W": "1w",
};

export function mapWaveTimeframeIdToBinanceInterval(timeframeId: string): string {
  const key = String(timeframeId ?? "").trim().toUpperCase();
  const interval = WAVE_TIMEFRAME_TO_BINANCE_INTERVAL[key];
  if (!interval) {
    throw new Error(`unsupported timeframeId for Binance loader: ${timeframeId}`);
  }
  return interval;
}

export function expectedBarDurationMsForWaveTimeframe(timeframeId: string): number | null {
  return getTimeframeDurationMs(timeframeId);
}

function buildBinanceFuturesKlinesUrlWithEnd(
  symbol: string,
  interval: string,
  limit: number,
  endTime?: number
): string {
  const v = validateOhlcvRequest(symbol, interval, limit);
  const params = new URLSearchParams({
    symbol: v.symbol,
    interval: v.interval,
    limit: String(v.limit),
  });
  if (endTime !== undefined && Number.isFinite(endTime)) {
    params.set("endTime", String(Math.floor(endTime)));
  }
  return `${BINANCE_FUTURES_KLINES_URL}?${params.toString()}`;
}

async function fetchBinanceKlinesPage(
  symbol: string,
  interval: string,
  limit: number,
  endTime: number | undefined,
  fetchFn: FetchFn,
  nowMs: number
): Promise<Candle[]> {
  const url = buildBinanceFuturesKlinesUrlWithEnd(symbol, interval, limit, endTime);
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
  return filterClosedKlines(parsed, nowMs);
}

/**
 * Paginated Binance Futures klines (network layer only). Returns oldest→newest candles.
 */
export async function fetchBinanceFuturesHistoricalCandles(
  symbol: string,
  timeframeId: string,
  targetCount: number,
  options?: { fetchFn?: FetchFn; nowMs?: number }
): Promise<Candle[]> {
  const count = Math.floor(Number(targetCount));
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("targetCount must be a positive integer");
  }
  if (count > REAL_HISTORICAL_BACKTEST_MAX_TARGET_CANDLES) {
    throw new Error(
      `targetCount exceeds max ${REAL_HISTORICAL_BACKTEST_MAX_TARGET_CANDLES}`
    );
  }

  const interval = mapWaveTimeframeIdToBinanceInterval(timeframeId);
  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch is not available");
  }
  const nowMs = options?.nowMs ?? Date.now();

  const byTime = new Map<number, Candle>();
  let endTime: number | undefined = undefined;

  while (byTime.size < count) {
    const remaining = count - byTime.size;
    const batchLimit = Math.min(1000, remaining);
    const batch = await fetchBinanceKlinesPage(
      symbol,
      interval,
      batchLimit,
      endTime,
      fetchFn,
      nowMs
    );
    if (!batch.length) {
      break;
    }
    for (const candle of batch) {
      byTime.set(candle.time, candle);
    }
    const oldest = batch[0];
    endTime = oldest.time - 1;
  }

  if (byTime.size === 0) {
    throw new Error("no candles returned from Binance");
  }

  const ordered = normalizeCandleOrder([...byTime.values()]);
  if (ordered.length < count) {
    return ordered;
  }
  return ordered.slice(ordered.length - count);
}
