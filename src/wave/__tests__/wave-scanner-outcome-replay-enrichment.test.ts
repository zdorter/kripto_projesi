import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  composeProductionWaveScannerForSymbol,
  runProductionWaveScanner,
} from "../production-wave-scanner";
import { enrichProspectiveSetupOutcomeReplay } from "../setup/prospective-setup-outcome-replay-enrichment";
import { buildProspectiveSetupOutcomeReplayInput } from "../setup/prospective-setup-outcome-replay-input";
import { replayProspectiveSetupOutcome } from "../setup/prospective-setup-outcome-replay";

function flatCandles(count: number, high = 100, low = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: i,
    open: 100,
    high,
    low,
    close: 100,
    volume: 1,
  }));
}

describe("wave scanner outcome replay enrichment (B-7b)", () => {
  const composed = composeProductionWaveScannerForSymbol({
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });

  it("A: includeOutcomeReplay false → no outcomeReplay field", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(report.rows[0]!.outcomeReplay, undefined);
  });

  it("B: includeOutcomeReplay true → outcomeReplay present", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      includeOutcomeReplay: true,
    });
    assert.ok(report.rows[0]!.outcomeReplay);
  });

  it("C/D: LIVE-shaped DEMO → NO_FUTURE_DATA, futureBarsAvailable 0", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      includeOutcomeReplay: true,
    });
    const o = report.rows[0]!.outcomeReplay!;
    assert.equal(o.outcome, "NO_FUTURE_DATA");
    assert.equal(o.futureBarsAvailable, 0);
    assert.equal(report.rows[0]!.tradeEvaluation.status, "FAILED");
  });

  it("E: synthetic TARGET_TOUCHED at bar 110 (bearish, canonical inv 145)", () => {
    const candles = flatCandles(120);
    candles[110] = { ...candles[110], high: 100, low: 89 };
    const synthetic = {
      ...composed,
      evaluationBarIndex: 100,
      references: {
        ...composed.references,
        target: { ...composed.references.target, referencePrice: 90 },
      },
      production: composed.production
        ? { ...composed.production, observedDirection: "BEARISH" as const }
        : null,
      historicalSetup: composed.historicalSetup,
    };
    const o = enrichProspectiveSetupOutcomeReplay(synthetic, candles)!;
    assert.equal(o.outcome, "TARGET_TOUCHED");
    assert.equal(o.resolutionBarIndex, 110);
    assert.equal(o.barsAfterEvaluation, 10);
  });

  it("F: synthetic INVALIDATION_TOUCHED", () => {
    const candles = flatCandles(105);
    candles[102] = { ...candles[102], high: 146, low: 140 };
    const synthetic = {
      ...composed,
      evaluationBarIndex: 100,
      references: {
        ...composed.references,
        target: { ...composed.references.target, referencePrice: 90 },
      },
      production: composed.production
        ? { ...composed.production, observedDirection: "BEARISH" as const }
        : null,
      historicalSetup: composed.historicalSetup,
    };
    const o = enrichProspectiveSetupOutcomeReplay(synthetic, candles)!;
    assert.equal(o.outcome, "INVALIDATION_TOUCHED");
    assert.equal(o.resolutionBarIndex, 102);
  });

  it("G: synthetic AMBIGUOUS same candle", () => {
    const candles = flatCandles(102);
    candles[101] = { ...candles[101], high: 146, low: 89 };
    const synthetic = {
      ...composed,
      evaluationBarIndex: 100,
      references: {
        ...composed.references,
        target: { ...composed.references.target, referencePrice: 90 },
      },
      production: composed.production
        ? { ...composed.production, observedDirection: "BEARISH" as const }
        : null,
      historicalSetup: composed.historicalSetup,
    };
    assert.equal(
      enrichProspectiveSetupOutcomeReplay(synthetic, candles)!.outcome,
      "AMBIGUOUS"
    );
  });

  it("H/I: trade eval and MVP refs unchanged when enrichment enabled", () => {
    const base = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    }).rows[0]!;
    const enriched = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      includeOutcomeReplay: true,
    }).rows[0]!;
    assert.deepEqual(enriched.tradeEvaluation, base.tradeEvaluation);
    assert.equal(enriched.entryReference.price, base.entryReference.price);
    assert.equal(enriched.stopReference.price, base.stopReference.price);
    assert.equal(enriched.targetReference.price, base.targetReference.price);
    assert.equal(enriched.rr.value, base.rr.value);
    assert.equal(enriched.readyForFurtherEvaluation, base.readyForFurtherEvaluation);
    assert.equal(enriched.displayStatus, base.displayStatus);
  });

  it("J: outcome status independent of trade evaluation status", () => {
    const row = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      includeOutcomeReplay: true,
    }).rows[0]!;
    assert.equal(row.tradeEvaluation.status, "FAILED");
    assert.equal(row.outcomeReplay!.outcome, "NO_FUTURE_DATA");
    assert.notEqual(row.tradeEvaluation.status, row.outcomeReplay!.outcome);
  });

  it("K: horizon override", () => {
    const candles = flatCandles(130);
    candles[112] = { ...candles[112], high: 100, low: 89 };
    const synthetic = {
      ...composed,
      evaluationBarIndex: 100,
      references: {
        ...composed.references,
        target: { ...composed.references.target, referencePrice: 90 },
      },
      production: composed.production
        ? { ...composed.production, observedDirection: "BEARISH" as const }
        : null,
      historicalSetup: composed.historicalSetup,
    };
    const short = enrichProspectiveSetupOutcomeReplay(synthetic, candles, {
      horizonBars: 10,
    })!;
    assert.equal(short.outcome, "NO_TOUCH");
    const long = enrichProspectiveSetupOutcomeReplay(synthetic, candles, {
      horizonBars: 24,
    })!;
    assert.equal(long.outcome, "TARGET_TOUCHED");
    assert.equal(long.horizonBars, 24);
  });

  it("L: mapper uses canonical invalidation in enrichment chain", () => {
    const input = buildProspectiveSetupOutcomeReplayInput(composed, DEMO_OHLCV);
    assert.ok(input);
    assert.equal(
      input!.invalidationReferencePrice,
      composed.references.stop.referencePrice
    );
  });

  it("M: evaluation bar candle not used for touch", () => {
    const candles = flatCandles(102);
    candles[100] = { ...candles[100], high: 200, low: 50 };
    candles[101] = { ...candles[101], high: 100, low: 100 };
    const synthetic = {
      ...composed,
      evaluationBarIndex: 100,
      references: {
        ...composed.references,
        target: { ...composed.references.target, referencePrice: 90 },
      },
      production: composed.production
        ? { ...composed.production, observedDirection: "BEARISH" as const }
        : null,
      historicalSetup: composed.historicalSetup,
    };
    assert.equal(
      enrichProspectiveSetupOutcomeReplay(synthetic, candles)!.outcome,
      "NO_TOUCH"
    );
    const input = buildProspectiveSetupOutcomeReplayInput(synthetic, candles)!;
    assert.equal(replayProspectiveSetupOutcome(input).outcome, "NO_TOUCH");
  });
});
