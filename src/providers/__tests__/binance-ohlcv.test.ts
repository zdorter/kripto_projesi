import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBinanceFuturesKlinesUrl,
  fetchBinanceFuturesKlines,
  filterClosedKlines,
  mapBinanceKlinesResponse,
  normalizeCandleOrder,
  parseBinanceKlineRow,
  validateOhlcvRequest,
} from "../binance-ohlcv";

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

describe("binance-ohlcv", () => {
  it("maps Binance response to Candle[] with numeric fields", () => {
    const rows = mapBinanceKlinesResponse([
      klineRow(1000, 1, 2, 0.5, 1.5, 100, 1999),
      klineRow(2000, 2, 3, 1.5, 2.5, 200, 2999),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].candle.open, 1);
    assert.equal(rows[0].candle.high, 2);
    assert.equal(rows[0].candle.volume, 100);
    assert.equal(rows[0].candle.time, 1000);
  });

  it("numeric conversion from strings", () => {
    const p = parseBinanceKlineRow(klineRow(1, 10, 11, 9, 10.5, 50, 60));
    assert.equal(p.candle.close, 10.5);
    assert.equal(typeof p.candle.volume, "number");
  });

  it("normalizes ordering oldest to newest", () => {
    const candles = normalizeCandleOrder([
      { time: 3000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: 2000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);
    assert.deepEqual(candles.map((c) => c.time), [1000, 2000, 3000]);
  });

  it("removes open candle when closeTime is in the future", () => {
    const now = 5000;
    const rows = mapBinanceKlinesResponse([
      klineRow(1000, 1, 2, 0.5, 1.5, 10, 1999),
      klineRow(4000, 2, 3, 1.5, 2.5, 20, 9000),
    ]);
    const candles = filterClosedKlines(rows, now);
    assert.equal(candles.length, 1);
    assert.equal(candles[0].time, 1000);
  });

  it("rejects malformed kline row", () => {
    assert.throws(() => parseBinanceKlineRow([1, "a"]), /malformed/);
    assert.throws(() => parseBinanceKlineRow(null), /malformed/);
  });

  it("throws on HTTP error", async () => {
    await assert.rejects(
      () =>
        fetchBinanceFuturesKlines("BTCUSDT", "1h", 10, {
          fetchFn: async () =>
            ({
              ok: false,
              status: 418,
              statusText: "I'm a teapot",
              json: async () => ({ msg: "blocked" }),
            }) as Response,
        }),
      /HTTP 418/
    );
  });

  it("throws on Binance API error object", () => {
    assert.throws(
      () => mapBinanceKlinesResponse({ code: -1121, msg: "Invalid symbol." }),
      /Binance API error -1121/
    );
  });

  it("throws on empty result after closed filter", () => {
    const rows = mapBinanceKlinesResponse([
      klineRow(1000, 1, 2, 0.5, 1.5, 10, 99999),
    ]);
    assert.throws(() => filterClosedKlines(rows, 100), /no closed candles/);
  });

  it("validateOhlcvRequest rejects bad inputs", () => {
    assert.throws(() => validateOhlcvRequest("", "1h", 10), /symbol/);
    assert.throws(() => validateOhlcvRequest("BTCUSDT", "2h", 0), /limit/);
    assert.throws(() => validateOhlcvRequest("BTCUSDT", "bad", 10), /interval/);
  });

  it("buildBinanceFuturesKlinesUrl encodes query", () => {
    const url = buildBinanceFuturesKlinesUrl("btcusdt", "1h", 500);
    assert.ok(url.includes("symbol=BTCUSDT"));
    assert.ok(url.includes("interval=1h"));
    assert.ok(url.includes("limit=500"));
  });
});
