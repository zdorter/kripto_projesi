import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchBinanceFuturesHistoricalCandles,
  mapWaveTimeframeIdToBinanceInterval,
} from "../historical-ohlcv-dataset-loader";
import type { FetchFn } from "../../providers/binance-ohlcv";

function klineRow(
  openTime: number,
  o: number,
  h: number,
  l: number,
  c: number,
  vol: number,
  closeTime: number
): unknown[] {
  return [openTime, String(o), String(h), String(l), String(c), String(vol), closeTime];
}

describe("historical-ohlcv-dataset-loader", () => {
  it("maps 1H to binance 1h", () => {
    assert.equal(mapWaveTimeframeIdToBinanceInterval("1H"), "1h");
  });

  it("paginates klines deterministically with mocked fetch", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) =>
      klineRow((i + 1) * 3_600_000, 1, 2, 0.5, 1.5, 10, (i + 1) * 3_600_000 + 3599)
    );
    const page2 = Array.from({ length: 500 }, (_, i) =>
      klineRow((i + 1001) * 3_600_000, 1, 2, 0.5, 1.5, 10, (i + 1001) * 3_600_000 + 3599)
    );
    let calls = 0;
    const fetchFn: FetchFn = async (input) => {
      calls += 1;
      const url = String(input);
      const hasEnd = url.includes("endTime=");
      const body = hasEnd ? page1 : page2;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => body,
      } as Response;
    };

    const candles = await fetchBinanceFuturesHistoricalCandles(
      "BTCUSDT",
      "1H",
      1200,
      { fetchFn, nowMs: 10_000_000_000 }
    );
    assert.equal(candles.length, 1200);
    assert.ok(calls >= 2);
    assert.ok(candles[0].time < candles[candles.length - 1].time);
  });
});
