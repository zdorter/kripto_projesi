import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  composeProductionWaveScannerForSymbol,
  runProductionWaveScanner,
} from "../production-wave-scanner";
import { presentWaveScannerRow, WAVE_SCANNER_UI_LABELS } from "../wave-scanner-presentation";
import {
  formatTradeEvaluationStatusColumn,
  mapTradeEvaluationPresentation,
} from "../setup/trade-evaluation-presentation";
import { evaluateTradeEvaluation } from "../setup/trade-evaluation";

describe("wave scanner trade evaluation display (B-3)", () => {
  it("1-3: PASSED and FAILED with firstFailure in status column HTML", () => {
    const passed = mapTradeEvaluationPresentation(
      evaluateTradeEvaluation({
        direction: "BEARISH",
        entryReferencePrice: 100,
        liveMarketPrice: 100,
        stopReferencePrice: 110,
        targetReferencePrice: 80,
        structuralInvalidationReferencePrice: 110,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
        evaluationBarIndex: 1,
        evaluationPrice: 100,
        futureSafe: true,
      })
    );
    const passedHtml = formatTradeEvaluationStatusColumn(
      WAVE_SCANNER_UI_LABELS.readyDisplay,
      passed
    );
    assert.ok(passedHtml.includes("READY FOR EVALUATION"));
    assert.ok(passedHtml.includes("Trade Evaluation: PASSED"));
    assert.ok(passedHtml.includes("trade-eval-passed"));

    const failed = mapTradeEvaluationPresentation(
      evaluateTradeEvaluation({
        direction: "BULLISH",
        entryReferencePrice: 769.85,
        liveMarketPrice: 769.85,
        stopReferencePrice: 762.12,
        targetReferencePrice: 780.82,
        structuralInvalidationReferencePrice: 762.12,
        setupLifecycleStatus: "CONFIRMED",
        structuralInvalidationTriggered: false,
        evaluationBarIndex: 1,
        evaluationPrice: 769.85,
        futureSafe: true,
      })
    );
    const failedHtml = formatTradeEvaluationStatusColumn(
      WAVE_SCANNER_UI_LABELS.readyDisplay,
      failed
    );
    assert.ok(failedHtml.includes("Trade Evaluation: FAILED"));
    assert.ok(failedHtml.includes("RR_BELOW_MINIMUM"));
    assert.ok(failedHtml.includes("trade-eval-failed"));
  });

  it("4: INSUFFICIENT_CONTEXT in status column", () => {
    const te = mapTradeEvaluationPresentation(
      evaluateTradeEvaluation({
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
      })
    );
    const html = formatTradeEvaluationStatusColumn("INSUFFICIENT_CONTEXT", te);
    assert.ok(html.includes("INSUFFICIENT_CONTEXT"));
    assert.ok(html.includes("trade-eval-insufficient"));
  });

  it("5-7: DEMO READY unchanged; trade eval FAILED RR_BELOW_MINIMUM; MVP refs stable", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const row = report.rows[0]!;
    assert.equal(row.displayStatus, WAVE_SCANNER_UI_LABELS.readyDisplay);
    assert.equal(row.readyForFurtherEvaluation, true);
    assert.equal(row.tradeEvaluation.status, "FAILED");
    assert.equal(row.tradeEvaluation.firstFailure, "RR_BELOW_MINIMUM");
    assert.equal(row.entryReference.price, 115);
    assert.equal(row.stopReference.price, 145);
    assert.equal(row.targetReference.price, 102);
    assert.ok(row.rr.value !== null && Math.abs(row.rr.value! - 0.43333333333333335) < 0.001);
    const statusHtml = formatTradeEvaluationStatusColumn(
      row.displayStatus,
      row.tradeEvaluation
    );
    assert.ok(statusHtml.includes("READY FOR EVALUATION"));
    assert.ok(statusHtml.includes("RR_BELOW_MINIMUM"));
  });

  it("8: ETH golden unit — trade evaluation PASSED", () => {
    const te = evaluateTradeEvaluation({
      direction: "BEARISH",
      entryReferencePrice: 2682.97,
      liveMarketPrice: 2682.97,
      stopReferencePrice: 2720,
      targetReferencePrice: 2616.77,
      structuralInvalidationReferencePrice: 2720,
      setupLifecycleStatus: "CONFIRMED",
      structuralInvalidationTriggered: false,
      evaluationBarIndex: 1,
      evaluationPrice: 2682.97,
      futureSafe: true,
    });
    assert.equal(te.status, "PASSED");
    assert.ok(te.diagnostics.rrRatio! > 1.75 - 0.02);
  });

  it("9: page renders status column via formatter; no domain math in browser", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-page.ts"),
      "utf8"
    );
    assert.ok(page.includes("formatTradeEvaluationStatusColumn"));
    assert.ok(!page.includes("evaluateTradeEvaluation"));
    assert.ok(!page.includes("tradeEvaluationCanonicalRr"));
  });

  it("insufficient row from compose still exposes tradeEvaluation presentation", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "ETHUSDT",
      candles: [],
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const row = presentWaveScannerRow(composed);
    assert.equal(row.tradeEvaluation.status, "INSUFFICIENT_CONTEXT");
  });
});
