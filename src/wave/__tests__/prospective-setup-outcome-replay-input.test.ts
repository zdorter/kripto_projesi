import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS } from "../setup/prospective-setup-outcome-replay-contract";
import { buildProspectiveSetupOutcomeReplayInput } from "../setup/prospective-setup-outcome-replay-input";
import { resolveProspectiveStructuralInvalidation } from "../setup/prospective-structural-invalidation";
import { evaluateTradeEvaluation } from "../setup/trade-evaluation";

describe("prospective setup outcome replay input (B-7a)", () => {
  const composed = composeProductionWaveScannerForSymbol({
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });

  it("A–G: production composed row maps to replay input", () => {
    const input = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV
    );
    assert.ok(input);
    assert.equal(input!.entryReferencePrice, composed.references.entry.referencePrice);
    assert.equal(input!.targetReferencePrice, composed.references.target.referencePrice);
    assert.equal(
      input!.invalidationReferencePrice,
      resolveProspectiveStructuralInvalidation(composed.historicalSetup!)
        .invalidationPrice
    );
    assert.equal(input!.evaluationBarIndex, composed.evaluationBarIndex);
    assert.equal(input!.direction, composed.production!.observedDirection);
    assert.equal(input!.prospectiveSetupId, composed.production!.id);
    assert.equal(input!.candles, DEMO_OHLCV);
  });

  it("H: default horizon = 24", () => {
    const input = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV
    );
    assert.equal(input!.horizonBars, PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS);
    assert.equal(input!.horizonBars, 24);
  });

  it("I: custom horizon", () => {
    const input = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV,
      { horizonBars: 12 }
    );
    assert.equal(input!.horizonBars, 12);
  });

  it("J: mapper does not recompute refs (uses bundle + resolver only)", () => {
    const mapperSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/prospective-setup-outcome-replay-input.ts"
      ),
      "utf8"
    );
    assert.ok(!mapperSrc.includes("evaluateProspectiveReferenceBundle"));
    assert.ok(!mapperSrc.includes("projectProspectiveOpenLeg"));
    assert.ok(!mapperSrc.includes("tradeEvaluationCanonicalRr"));
    assert.ok(mapperSrc.includes("resolveProspectiveStructuralInvalidation"));
  });

  it("K: trade evaluation independent of mapper", () => {
    const teBefore = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: 115,
      liveMarketPrice: 115,
      stopReferencePrice: 145,
      targetReferencePrice: 102,
      structuralInvalidationReferencePrice: 145,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 23,
      evaluationPrice: 115,
      futureSafe: true,
    });
    buildProspectiveSetupOutcomeReplayInput(composed, DEMO_OHLCV);
    const teAfter = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: 115,
      liveMarketPrice: 115,
      stopReferencePrice: 145,
      targetReferencePrice: 102,
      structuralInvalidationReferencePrice: 145,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 23,
      evaluationPrice: 115,
      futureSafe: true,
    });
    assert.deepEqual(teBefore, teAfter);
    assert.equal(teBefore.status, "FAILED");
  });

  it("L: LIVE-shaped eval = last candle index", () => {
    const liveCandles = DEMO_OHLCV;
    const input = buildProspectiveSetupOutcomeReplayInput(composed, liveCandles);
    assert.equal(input!.evaluationBarIndex, liveCandles.length - 1);
  });

  it("M: mapper passes candles unchanged (no synthetic future bars)", () => {
    const copy = DEMO_OHLCV.slice();
    const input = buildProspectiveSetupOutcomeReplayInput(composed, copy);
    assert.equal(input!.candles.length, copy.length);
    assert.equal(input!.candles, copy);
  });

  it("N: deterministic mapping", () => {
    const a = buildProspectiveSetupOutcomeReplayInput(composed, DEMO_OHLCV);
    const b = buildProspectiveSetupOutcomeReplayInput(composed, DEMO_OHLCV);
    assert.deepEqual(a, b);
  });

  it("null when candles empty", () => {
    assert.equal(
      buildProspectiveSetupOutcomeReplayInput(composed, []),
      null
    );
  });

  it("null when load error row", () => {
    const bad = composeProductionWaveScannerForSymbol({
      symbol: "ETHUSDT",
      candles: [],
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(
      buildProspectiveSetupOutcomeReplayInput(bad, DEMO_OHLCV),
      null
    );
  });
});
