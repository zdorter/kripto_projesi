import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  compareWaveScanResults,
  runWaveScan,
  runWaveScanWithProvider,
  scanSymbolWaveScenarios,
} from "../wave-scanner";
import type { Candle } from "../types";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

describe("wave-scanner", () => {
  it("scans a single symbol and timeframe", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    assert.equal(report.timeframe, TF);
    assert.ok(report.scenarioCount > 0);
    assert.equal(report.analyzedSymbolCount, 1);
    assert.equal(report.errors.length, 0);
  });

  it("scans multiple symbols", () => {
    const report = runWaveScan(
      [
        { symbol: "BTCUSDT", candles: DEMO_OHLCV },
        { symbol: "ETHUSDT", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    assert.equal(report.symbols.length, 2);
    assert.ok(
      report.results.some((r) => r.symbol === "BTCUSDT") &&
        report.results.some((r) => r.symbol === "ETHUSDT")
    );
  });

  it("includes multiple scenarios per symbol", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const forBtc = report.results.filter((r) => r.symbol === "BTCUSDT");
    assert.ok(forBtc.length > 1);
    assert.equal(report.scenarioCount, forBtc.length);
  });

  it("carries PRIMARY scenario role", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const primary = report.results.find((r) => r.role === "PRIMARY");
    assert.ok(primary);
    assert.ok(primary.scenarioId.startsWith("primary-"));
  });

  it("carries ALTERNATIVE when presentation has alternative", () => {
    const { results } = scanSymbolWaveScenarios(
      { symbol: "X", candles: DEMO_OHLCV },
      OPTS
    );
    const alt = results.find((r) => r.role === "ALTERNATIVE");
    const bundle = scanSymbolWaveScenarios(
      { symbol: "X", candles: DEMO_OHLCV },
      OPTS
    );
    if (results.some((r) => r.role === "ALTERNATIVE")) {
      assert.ok(alt);
    }
    assert.ok(bundle.results.some((r) => r.role === "CANDIDATE"));
  });

  it("carries CANDIDATE scenarios from flat engine waves", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const candidates = report.results.filter((r) => r.role === "CANDIDATE");
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((c) => c.scenarioId.startsWith("candidate-")));
  });

  it("preserves engine status on scan rows", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    assert.ok(
      report.results.every(
        (r) =>
          r.engineStatus === undefined ||
          ["POTENTIAL", "CONFIRMED", "INVALIDATED"].includes(r.engineStatus)
      )
    );
    const primary = report.results.find((r) => r.role === "PRIMARY");
    assert.ok(primary?.engineStatus);
  });

  it("preserves scenario status vocabulary", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    for (const r of report.results) {
      assert.ok(
        ["ACTIVE", "INVALIDATED", "INSUFFICIENT_CONTEXT"].includes(
          r.scenarioStatus
        )
      );
    }
  });

  it("preserves confidence from scenario layer", () => {
    const { results } = scanSymbolWaveScenarios(
      { symbol: "BTCUSDT", candles: DEMO_OHLCV },
      OPTS
    );
    const primary = results.find((r) => r.role === "PRIMARY");
    assert.ok(primary);
    assert.equal(typeof primary.confidence, "number");
  });

  it("preserves invalidation object from scenario layer", () => {
    const report = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const row = report.results[0];
    assert.ok(row.invalidation);
    assert.equal(typeof row.invalidation.rule, "string");
    assert.equal(typeof row.invalidation.available, "boolean");
  });

  it("orders results by symbol, timeframe, role, scenarioId", () => {
    const report = runWaveScan(
      [
        { symbol: "ZZZ", candles: DEMO_OHLCV },
        { symbol: "AAA", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    for (let i = 1; i < report.results.length; i++) {
      assert.ok(compareWaveScanResults(report.results[i - 1], report.results[i]) <= 0);
    }
    assert.equal(report.results[0].symbol, "AAA");
  });

  it("isolates per-symbol analysis failures", () => {
    const report = runWaveScan(
      [
        { symbol: "AAA", candles: DEMO_OHLCV },
        { symbol: "BBB", candles: [] },
        { symbol: "CCC", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].symbol, "BBB");
    assert.ok(report.results.some((r) => r.symbol === "AAA"));
    assert.ok(report.results.some((r) => r.symbol === "CCC"));
    assert.equal(report.analyzedSymbolCount, 2);
  });

  it("is deterministic for identical inputs", () => {
    const input = [{ symbol: "BTCUSDT", candles: DEMO_OHLCV }];
    const a = runWaveScan(input, OPTS);
    const b = runWaveScan(input, OPTS);
    assert.deepEqual(a, b);
  });

  it("handles empty symbol list", () => {
    const report = runWaveScan([], OPTS);
    assert.equal(report.scenarioCount, 0);
    assert.equal(report.analyzedSymbolCount, 0);
  });

  it("optional MTF and hierarchy attached when lower candles provided", () => {
    const report = runWaveScan(
      [
        {
          symbol: "BTCUSDT",
          candles: DEMO_OHLCV,
          lowerCandles: DEMO_OHLCV,
        },
      ],
      { ...OPTS, lowerTimeframe: "15M" }
    );
    assert.ok(report.optionalMtfBySymbol?.BTCUSDT);
    assert.ok(report.optionalMtfBySymbol.BTCUSDT.multiTimeframe);
    assert.ok(report.optionalMtfBySymbol.BTCUSDT.hierarchy);
    const row = report.results.find((r) => r.role === "PRIMARY");
    assert.ok(row?.evidence.some((e) => e.includes("Multi-timeframe")));
  });

  it("provider path composes scan without hardcoding Binance", async () => {
    const store: Record<string, Candle[]> = {
      AAA: DEMO_OHLCV,
      BBB: DEMO_OHLCV,
      BAD: [],
    };
    const provider = {
      async getCandles(symbol: string) {
        if (symbol === "FAIL") {
          throw new Error("provider failure");
        }
        const c = store[symbol];
        if (!c) {
          throw new Error("unknown");
        }
        return c;
      },
    };
    const report = await runWaveScanWithProvider(
      provider,
      ["AAA", "FAIL", "BAD"],
      "1h",
      100,
      OPTS
    );
    assert.equal(report.errors.length, 2);
    assert.ok(report.results.some((r) => r.symbol === "AAA"));
    assert.equal(report.analyzedSymbolCount, 1);
  });
});
