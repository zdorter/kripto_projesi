import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import { evaluateTradeEvaluation } from "../setup/trade-evaluation";
import {
  PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS,
} from "../setup/prospective-setup-outcome-replay-contract";
import {
  candleTouchesInvalidation,
  candleTouchesTarget,
  replayProspectiveSetupOutcome,
} from "../setup/prospective-setup-outcome-replay";

function candle(high: number, low: number) {
  return { high, low };
}

describe("prospective setup outcome replay (Phase B-6)", () => {
  it("A: bullish target touched", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(111, 100)],
    });
    assert.equal(r.outcome, "TARGET_TOUCHED");
    assert.equal(r.resolutionBarIndex, 1);
  });

  it("B: bullish invalidation touched", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(103, 94)],
    });
    assert.equal(r.outcome, "INVALIDATION_TOUCHED");
    assert.equal(r.resolutionBarIndex, 1);
  });

  it("C: bearish target touched", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 105,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(101, 89)],
    });
    assert.equal(r.outcome, "TARGET_TOUCHED");
  });

  it("D: bearish invalidation touched", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 105,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(106, 98)],
    });
    assert.equal(r.outcome, "INVALIDATION_TOUCHED");
  });

  it("E: neither touched → NO_TOUCH", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(105, 96)],
      horizonBars: 5,
    });
    assert.equal(r.outcome, "NO_TOUCH");
    assert.equal(r.resolutionBarIndex, null);
  });

  it("F: same candle both touched → AMBIGUOUS", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(111, 94)],
    });
    assert.equal(r.outcome, "AMBIGUOUS");
    assert.equal(r.targetTouched, true);
    assert.equal(r.invalidationTouched, true);
  });

  it("G: evaluation candle touch does not count", () => {
    const candles = [candle(111, 94), candle(100, 99)];
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles,
    });
    assert.equal(r.outcome, "NO_TOUCH");
  });

  it("H: replay starts at evaluationBarIndex + 1", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 2,
      candles: [
        candle(50, 40),
        candle(50, 40),
        candle(50, 40),
        candle(111, 100),
      ],
    });
    assert.equal(r.resolutionBarIndex, 3);
    assert.equal(r.barsAfterEvaluation, 1);
  });

  it("I: default horizon is contract constant 24", () => {
    assert.equal(PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS, 24);
    const candles = new Array(30).fill(candle(100, 100));
    candles[24] = candle(111, 100);
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles,
    });
    assert.equal(r.horizonBars, 24);
    assert.equal(r.resolutionBarIndex, 24);
  });

  it("J: touch on horizon boundary counts", () => {
    const horizon = 3;
    const candles = [
      candle(100, 100),
      candle(100, 100),
      candle(100, 100),
      candle(111, 100),
      candle(100, 100),
    ];
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles,
      horizonBars: horizon,
    });
    assert.equal(r.resolutionBarIndex, 3);
    assert.equal(r.outcome, "TARGET_TOUCHED");
  });

  it("K: touch beyond horizon does not count", () => {
    const candles = [
      candle(100, 100),
      candle(100, 100),
      candle(100, 100),
      candle(100, 100),
      candle(111, 100),
    ];
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 0,
      candles,
      horizonBars: 2,
    });
    assert.equal(r.outcome, "NO_TOUCH");
  });

  it("L/M: no future candles → NO_FUTURE_DATA", () => {
    const r = replayProspectiveSetupOutcome({
      direction: "BULLISH",
      entryReferencePrice: 100,
      targetReferencePrice: 110,
      invalidationReferencePrice: 95,
      evaluationBarIndex: 5,
      candles: [candle(100, 100), candle(100, 100), candle(100, 100)],
    });
    assert.equal(r.outcome, "NO_FUTURE_DATA");
  });

  it("N: UNRESOLVED direction → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      replayProspectiveSetupOutcome({
        direction: "UNRESOLVED",
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
        evaluationBarIndex: 0,
        candles: [candle(111, 100)],
      }).outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("O: missing target → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      replayProspectiveSetupOutcome({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: null,
        invalidationReferencePrice: 95,
        evaluationBarIndex: 0,
        candles: [candle(111, 100)],
      }).outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("P: missing invalidation → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      replayProspectiveSetupOutcome({
        direction: "BULLISH",
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: null,
        evaluationBarIndex: 0,
        candles: [candle(111, 100)],
      }).outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("Q: uses supplied refs only (touch helpers are pure)", () => {
    assert.equal(candleTouchesTarget("BULLISH", candle(110, 100), 110), true);
    assert.equal(
      candleTouchesInvalidation("BULLISH", candle(100, 95), 95),
      true
    );
  });

  it("R: deterministic repeat", () => {
    const input = {
      direction: "BEARISH" as const,
      entryReferencePrice: 100,
      targetReferencePrice: 90,
      invalidationReferencePrice: 105,
      evaluationBarIndex: 0,
      candles: [candle(100, 100), candle(101, 89)],
    };
    assert.deepEqual(
      replayProspectiveSetupOutcome(input),
      replayProspectiveSetupOutcome(input)
    );
  });

  it("S: outcome replay does not change trade evaluation", () => {
    const te = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: 100,
      liveMarketPrice: 100,
      stopReferencePrice: 110,
      targetReferencePrice: 80,
      structuralInvalidationReferencePrice: 110,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 10,
      evaluationPrice: 100,
      futureSafe: true,
    });
    replayProspectiveSetupOutcome({
      direction: "BEARISH",
      entryReferencePrice: 100,
      targetReferencePrice: 80,
      invalidationReferencePrice: 110,
      evaluationBarIndex: 10,
      candles: [candle(120, 70)],
    });
    const te2 = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: 100,
      liveMarketPrice: 100,
      stopReferencePrice: 110,
      targetReferencePrice: 80,
      structuralInvalidationReferencePrice: 110,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 10,
      evaluationPrice: 100,
      futureSafe: true,
    });
    assert.deepEqual(te, te2);
  });

  it("golden DEMO: eval bar 23 has no post-eval candles → NO_FUTURE_DATA", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(composed.evaluationBarIndex, 23);
    const r = replayProspectiveSetupOutcome({
      direction: composed.production?.observedDirection ?? null,
      entryReferencePrice: composed.references.entry.referencePrice,
      targetReferencePrice: composed.references.target.referencePrice,
      invalidationReferencePrice: composed.references.stop.referencePrice,
      evaluationBarIndex: composed.evaluationBarIndex,
      candles: DEMO_OHLCV,
      prospectiveSetupId: composed.production?.id ?? null,
    });
    assert.equal(r.outcome, "NO_FUTURE_DATA");
    assert.equal(r.targetPrice, 102);
    assert.equal(r.invalidationPrice, 145);
  });
});
