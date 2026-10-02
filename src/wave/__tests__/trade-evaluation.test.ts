import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import { presentWaveScannerRow } from "../wave-scanner-presentation";
import {
  TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE,
  TRADE_EVALUATION_MIN_RR,
} from "../setup/trade-evaluation-contract";
import {
  evaluateEntryFreshness,
  evaluateRrCheck,
  evaluateSetupValidity,
  evaluateStopGeometry,
  evaluateTargetGeometry,
  evaluateTradeEvaluation,
  tradeEvaluationCanonicalRr,
} from "../setup/trade-evaluation";

const baseInput = {
  direction: "BEARISH" as const,
  entryReferencePrice: 100,
  liveMarketPrice: 100,
  stopReferencePrice: 110,
  targetReferencePrice: 80,
  structuralInvalidationReferencePrice: 110,
  setupLifecycleStatus: "CONFIRMED" as const,
  structuralInvalidationTriggered: false,
  evaluationBarIndex: 10,
  evaluationPrice: 100,
  futureSafe: true,
};

describe("trade evaluation (Phase B)", () => {
  it("A: entry deviation 0% → VALID", () => {
    const r = evaluateEntryFreshness(100, 100);
    assert.equal(r.outcome, "VALID");
    assert.equal(r.deviationRatio, 0);
  });

  it("B: entry deviation exactly 1% → VALID", () => {
    const r = evaluateEntryFreshness(100, 101);
    assert.equal(r.outcome, "VALID");
    assert.equal(r.deviationRatio, 0.01);
  });

  it("C: entry deviation >1% → STALE", () => {
    const r = evaluateEntryFreshness(100, 101.01);
    assert.equal(r.outcome, "STALE");
  });

  it("D: entry 100 live 99 → VALID", () => {
    const r = evaluateEntryFreshness(100, 99);
    assert.equal(r.outcome, "VALID");
    assert.equal(r.deviationRatio, 0.01);
  });

  it("E: invalid entry → INSUFFICIENT_CONTEXT", () => {
    assert.equal(evaluateEntryFreshness(null, 100).outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(evaluateEntryFreshness(0, 100).outcome, "INSUFFICIENT_CONTEXT");
  });

  it("F: invalid live price → INSUFFICIENT_CONTEXT", () => {
    assert.equal(evaluateEntryFreshness(100, NaN).outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(evaluateEntryFreshness(100, null).outcome, "INSUFFICIENT_CONTEXT");
  });

  it("G: evaluationPrice vs live — deviation uses live only", () => {
    const r = evaluateTradeEvaluation({
      ...baseInput,
      evaluationPrice: 100,
      entryReferencePrice: 100,
      liveMarketPrice: 101.5,
    });
    assert.equal(r.diagnostics.entryDeviationPercent, 1.5);
    assert.equal(r.checks.entry, "STALE");
    assert.equal(r.firstFailure, "ENTRY_STALE");
    assert.equal(r.checks.rr, "VALID");
    assert.equal(r.checks.stop, "VALID");
  });

  it("golden: entry 100 eval 100 live 102 → 2% STALE", () => {
    const r = evaluateTradeEvaluation({
      ...baseInput,
      evaluationPrice: 100,
      liveMarketPrice: 102,
    });
    assert.equal(r.diagnostics.entryDeviationPercent, 2);
    assert.equal(r.checks.entry, "STALE");
  });

  it("H: stop/target/RR unaffected by live price", () => {
    const r = evaluateTradeEvaluation({
      ...baseInput,
      liveMarketPrice: 500,
      stopReferencePrice: 110,
      targetReferencePrice: 80,
    });
    assert.equal(r.checks.stop, "VALID");
    assert.equal(r.checks.target, "VALID");
    assert.equal(r.checks.rr, "VALID");
    assert.ok(r.diagnostics.rrRatio! > 1.5);
  });

  it("ticker missing with valid entry → INSUFFICIENT_CONTEXT trade eval", () => {
    const r = evaluateTradeEvaluation({
      ...baseInput,
      liveMarketPrice: null,
    });
    assert.equal(r.checks.entry, "INSUFFICIENT_CONTEXT");
    assert.equal(r.status, "INSUFFICIENT_CONTEXT");
    assert.equal(r.checks.rr, "VALID");
  });

  it("E-bullish: bullish valid stop", () => {
    const r = evaluateStopGeometry("BULLISH", 100, 90);
    assert.equal(r.outcome, "VALID");
  });

  it("F: bullish invalid stop", () => {
    const r = evaluateStopGeometry("BULLISH", 100, 100);
    assert.equal(r.outcome, "INVALID");
  });

  it("G: bearish valid stop", () => {
    const r = evaluateStopGeometry("BEARISH", 100, 110);
    assert.equal(r.outcome, "VALID");
  });

  it("H: bearish invalid stop", () => {
    const r = evaluateStopGeometry("BEARISH", 100, 90);
    assert.equal(r.outcome, "INVALID");
  });

  it("I: zero risk → INVALID", () => {
    const r = evaluateStopGeometry("BEARISH", 100, 100);
    assert.equal(r.outcome, "INVALID");
    assert.equal(r.risk, 0);
  });

  it("J: bullish valid target", () => {
    assert.equal(evaluateTargetGeometry("BULLISH", 100, 120).outcome, "VALID");
  });

  it("K: bullish invalid target", () => {
    assert.equal(evaluateTargetGeometry("BULLISH", 100, 90).outcome, "INVALID");
  });

  it("L: bearish valid target", () => {
    assert.equal(evaluateTargetGeometry("BEARISH", 100, 80).outcome, "VALID");
  });

  it("M: bearish invalid target", () => {
    assert.equal(evaluateTargetGeometry("BEARISH", 100, 110).outcome, "INVALID");
  });

  it("N: zero reward → INVALID", () => {
    const r = evaluateTargetGeometry("BEARISH", 100, 100);
    assert.equal(r.outcome, "INVALID");
    assert.equal(r.reward, 0);
  });

  it("O: RR 1.49 → INVALID", () => {
    const entry = 100;
    const stop = 110;
    const target = 100 - 1.49 * 10;
    const r = evaluateRrCheck(entry, stop, target);
    assert.equal(r.outcome, "INVALID");
    assert.ok(r.rrRatio! < TRADE_EVALUATION_MIN_RR);
  });

  it("P: RR exactly 1.50 → VALID", () => {
    const entry = 100;
    const stop = 110;
    const target = 100 - 1.5 * 10;
    const r = evaluateRrCheck(entry, stop, target);
    assert.equal(r.outcome, "VALID");
    assert.ok(Math.abs(r.rrRatio! - 1.5) < 1e-9);
  });

  it("Q: RR > 1.50 → VALID", () => {
    const r = evaluateRrCheck(100, 110, 80);
    assert.equal(r.outcome, "VALID");
    assert.ok(r.rrRatio! > TRADE_EVALUATION_MIN_RR);
  });

  it("R: invalid RR → INSUFFICIENT_CONTEXT", () => {
    assert.equal(evaluateRrCheck(null, 110, 80).outcome, "INSUFFICIENT_CONTEXT");
  });

  it("S: valid setup with live above bearish invalidation → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("T: lifecycle INVALID → INVALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "INVALID",
        structuralInvalidationTriggered: false,
      }),
      "INVALID"
    );
  });

  it("U: deterministic first failure (entry before rr)", () => {
    const r = evaluateTradeEvaluation({
      ...baseInput,
      liveMarketPrice: 102,
      targetReferencePrice: 70,
    });
    assert.equal(r.firstFailure, "ENTRY_STALE");
    assert.equal(r.checks.stop, "VALID");
    assert.equal(r.checks.rr, "VALID");
  });

  it("V: all checks pass → PASSED", () => {
    const r = evaluateTradeEvaluation(baseInput);
    assert.equal(r.status, "PASSED");
    assert.equal(r.passed, true);
    assert.equal(r.firstFailure, null);
  });

  it("W: insufficient context", () => {
    const r = evaluateTradeEvaluation({
      direction: null,
      entryReferencePrice: null,
      liveMarketPrice: null,
      stopReferencePrice: null,
      targetReferencePrice: null,
      structuralInvalidationReferencePrice: null,
      setupLifecycleStatus: null,
      structuralInvalidationTriggered: false,
      evaluationBarIndex: null,
      evaluationPrice: null,
      futureSafe: false,
    });
    assert.equal(r.status, "INSUFFICIENT_CONTEXT");
    assert.equal(r.passed, false);
  });

  it("ETH golden: bearish RR ≈ 1.79 PASS", () => {
    const entry = 2682.97;
    const stop = 2720.0;
    const target = 2616.77;
    const rr = tradeEvaluationCanonicalRr(entry, stop, target)!;
    assert.ok(Math.abs(rr - 1.79) < 0.02);
    const r = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: entry,
      liveMarketPrice: entry,
      stopReferencePrice: stop,
      targetReferencePrice: target,
      structuralInvalidationReferencePrice: stop,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 1,
      evaluationPrice: entry,
      futureSafe: true,
    });
    assert.equal(r.checks.rr, "VALID");
    assert.equal(r.status, "PASSED");
  });

  it("contract constants", () => {
    assert.equal(TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE, 0.01);
    assert.equal(TRADE_EVALUATION_MIN_RR, 1.5);
  });

  it("DEMO integration: READY unchanged; trade evaluation on row", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const entryRef = composed.references.entry.referencePrice!;
    const row = presentWaveScannerRow(composed, { liveMarketPrice: entryRef });
    assert.equal(row.readyForFurtherEvaluation, true);
    assert.equal(row.displayStatus, "READY FOR EVALUATION");
    assert.ok(row.details.tradeEvaluation);
    assert.equal(row.details.tradeEvaluation.firstFailure, "RR_BELOW_MINIMUM");
    assert.equal(row.details.tradeEvaluation.status, "FAILED");
    const staleRow = presentWaveScannerRow(composed, { liveMarketPrice: 102 });
    assert.equal(staleRow.details.tradeEvaluation.checks.entry, "STALE");
    assert.equal(staleRow.details.tradeEvaluation.firstFailure, "ENTRY_STALE");
  });
});

describe("trade evaluation setup validity (Phase B-5)", () => {
  const bullishPass = {
    direction: "BULLISH" as const,
    entryReferencePrice: 100,
    liveMarketPrice: 100,
    stopReferencePrice: 95,
    targetReferencePrice: 120,
    structuralInvalidationReferencePrice: 95,
    setupLifecycleStatus: "CONFIRMED" as const,
    structuralInvalidationTriggered: false,
    evaluationBarIndex: 1,
    evaluationPrice: 100,
    futureSafe: true,
  };

  it("A: bullish live 100 inv 95 → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("B: bullish live 95.01 inv 95 → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 95.01,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("C: bullish live 94.99 inv 95 → INVALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 94.99,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "INVALID"
    );
  });

  it("boundary: bullish live equals invalidation → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 95,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("D: bearish live 100 inv 105 → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("E: bearish live 104.99 inv 105 → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 104.99,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("F: bearish live 105.01 inv 105 → INVALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 105.01,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "INVALID"
    );
  });

  it("boundary: bearish live equals invalidation → VALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BEARISH",
        liveMarketPrice: 105,
        structuralInvalidationReferencePrice: 105,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "VALID"
    );
  });

  it("G: lifecycle triggered flag → INVALID", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: true,
      }),
      "INVALID"
    );
  });

  it("H: missing invalidation → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: null,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("I: missing live → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "BULLISH",
        liveMarketPrice: null,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("J: UNRESOLVED direction → INSUFFICIENT_CONTEXT", () => {
    assert.equal(
      evaluateSetupValidity({
        direction: "UNRESOLVED",
        liveMarketPrice: 100,
        structuralInvalidationReferencePrice: 95,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
      }),
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("K: RR invalid beats setup valid", () => {
    const r = evaluateTradeEvaluation({
      ...bullishPass,
      targetReferencePrice: 106,
    });
    assert.equal(r.checks.setupValidity, "VALID");
    assert.equal(r.firstFailure, "RR_BELOW_MINIMUM");
  });

  it("L: RR valid setup invalid → SETUP_INVALIDATED", () => {
    const r = evaluateTradeEvaluation({
      ...bullishPass,
      stopReferencePrice: 99.5,
      structuralInvalidationReferencePrice: 99.5,
      liveMarketPrice: 99.4,
    });
    assert.equal(r.checks.rr, "VALID");
    assert.equal(r.checks.entry, "VALID");
    assert.equal(r.firstFailure, "SETUP_INVALIDATED");
  });

  it("M: entry stale before setup invalid", () => {
    const r = evaluateTradeEvaluation({
      ...bullishPass,
      liveMarketPrice: 102,
    });
    assert.equal(r.checks.setupValidity, "VALID");
    assert.equal(r.firstFailure, "ENTRY_STALE");
  });

  it("N: uses live not evaluationPrice for breach", () => {
    const r = evaluateTradeEvaluation({
      ...bullishPass,
      evaluationPrice: 100,
      liveMarketPrice: 94,
      structuralInvalidationReferencePrice: 95,
    });
    assert.equal(r.checks.setupValidity, "INVALID");
    const ok = evaluateTradeEvaluation({
      ...bullishPass,
      evaluationPrice: 100,
      liveMarketPrice: 97,
      structuralInvalidationReferencePrice: 95,
    });
    assert.equal(ok.checks.setupValidity, "VALID");
  });
});
