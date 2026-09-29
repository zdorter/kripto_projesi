import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { filterClosedKlines, mapBinanceKlinesResponse } from "../../providers/binance-ohlcv";
import { resolveTradeSetupEvaluationBoundary } from "../setup/trade-setup-evaluation-bar";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { evaluateTradeCondition } from "../setup/trade-setup-rules";
import { detectSetups } from "../setup/setup-detector";
import { runWaveScan } from "../wave-scanner";
import type { Candle } from "../types";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

function candle(i: number): Candle {
  return {
    time: i * 60_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 10,
  };
}

function klineRow(
  openTime: number,
  closeTime: number
): unknown[] {
  return [openTime, "1", "2", "0.5", "1.5", "10", closeTime];
}

describe("trade-setup evaluation bar contract", () => {
  it("A: closed last candle with closedSeriesOnly attestation", () => {
    const candles = [candle(0), candle(1), candle(2)];
    const r = resolveTradeSetupEvaluationBoundary({
      candles,
      closedSeriesOnly: true,
    });
    assert.equal(r.boundaryEstablished, true);
    assert.equal(r.evaluationBarIndex, 2);
  });

  it("B: open last candle without attestation is not established at tail", () => {
    const candles = [candle(0), candle(1), candle(2)];
    const r = resolveTradeSetupEvaluationBoundary({ candles });
    assert.equal(r.boundaryEstablished, false);
    assert.equal(r.evaluationBarIndex, -1);
  });

  it("C: explicit evaluationBarIndex before open tail is established", () => {
    const candles = [candle(0), candle(1), candle(2)];
    const r = resolveTradeSetupEvaluationBoundary({
      candles,
      evaluationBarIndex: 1,
    });
    assert.equal(r.boundaryEstablished, true);
    assert.equal(r.evaluationBarIndex, 1);
  });

  it("D: confirmed leg ending after evaluationBarIndex is NOT_MET", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true, evaluationBarIndex: 0 },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const bundle = tradeCtx.bundlesBySymbol!.BTCUSDT;
    const row = scan.results.find(
      (r) => r.structure === "IMPULSE" && ["3", "4", "5"].includes(r.waveLabel)
    );
    if (!row) {
      return;
    }
    const out = evaluateTradeCondition("impulse-leading-leg-confirmed-at-bar", {
      scanRow: row,
      bundle,
    });
    if (row.endIndex > 0) {
      assert.equal(out.outcome, "NOT_MET");
    }
  });

  it("E: POTENTIAL leg cannot satisfy impulse-leading-leg-confirmed-at-bar", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const bundle = tradeCtx.bundlesBySymbol!.BTCUSDT;
    const row = scan.results.find(
      (r) => r.structure === "IMPULSE" && ["3", "4", "5"].includes(r.waveLabel)
    );
    if (!row) {
      return;
    }
    const w = bundle.presentation.engine.flatWaves.find((x) => x.label === row.waveLabel);
    if (w?.status === "POTENTIAL") {
      const out = evaluateTradeCondition("impulse-leading-leg-confirmed-at-bar", {
        scanRow: row,
        bundle,
      });
      assert.equal(out.outcome, "NOT_MET");
    }
  });

  it("F: missing closed status yields INSUFFICIENT_CONTEXT on trade rows", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({ scanReport: scan, tradeContext: tradeCtx });
    const trade = report.candidates.filter((c) => c.isTradeSetup);
    assert.ok(trade.length > 0);
    assert.ok(trade.every((c) => c.status === "INSUFFICIENT_CONTEXT"));
    assert.equal(
      tradeCtx.bundlesBySymbol!.BTCUSDT.evaluationBarBoundaryEstablished,
      false
    );
  });

  it("Binance filterClosedKlines output satisfies closedSeriesOnly contract", () => {
    const now = 10_000;
    const rows = mapBinanceKlinesResponse([
      klineRow(1000, 1999),
      klineRow(2000, 50_000),
    ]);
    const closed = filterClosedKlines(rows, now);
    const r = resolveTradeSetupEvaluationBoundary({
      candles: closed,
      closedSeriesOnly: true,
    });
    assert.equal(closed.length, 1);
    assert.equal(r.boundaryEstablished, true);
    assert.equal(r.evaluationBarIndex, 0);
  });
});
