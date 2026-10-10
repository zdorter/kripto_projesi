import { createHash } from "node:crypto";
import type { Candle } from "./types";
import type { HistoricalFrozenOhlcvCandleRecord } from "./historical-frozen-ohlcv-dataset-types";

function canonicalCandleLine(c: {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): string {
  return `${c.timestamp}|${c.open}|${c.high}|${c.low}|${c.close}|${c.volume}`;
}

/**
 * Deterministic SHA-256 over candle rows (oldest→newest). No runtime clocks.
 */
export function computeHistoricalFrozenOhlcvDatasetChecksum(
  candles: readonly Pick<
    Candle,
    "time" | "open" | "high" | "low" | "close" | "volume"
  >[]
): string {
  const lines: string[] = [];
  for (const c of candles) {
    lines.push(
      canonicalCandleLine({
        timestamp: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })
    );
  }
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function frozenOhlcvRecordsFromCandles(
  candles: readonly Candle[]
): HistoricalFrozenOhlcvCandleRecord[] {
  return candles.map((c) => ({
    timestamp: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export function candlesFromFrozenOhlcvRecords(
  records: readonly HistoricalFrozenOhlcvCandleRecord[]
): Candle[] {
  return records.map((r) => ({
    time: r.timestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}
