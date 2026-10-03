import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { analyzeWaveAtEvaluationBar } from "../evaluation-scoped-analysis";
import {
  HISTORICAL_AS_OF_EVAL_LIVE_MARKET_PRICE_POLICY,
  resolveHistoricalAsOfEvalLiveMarketPrice,
} from "../historical-production-compose-policy";
import {
  PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE,
  composeProductionWaveScannerForSymbol,
} from "../production-wave-scanner";
import { presentWaveScannerRow } from "../wave-scanner-presentation";
import { evaluateTradeEvaluation } from "../setup/trade-evaluation";
import { resolveProspectiveStructuralInvalidation } from "../setup/prospective-structural-invalidation";
import { WAVE_SCANNER_UI_LABELS } from "../wave-scanner-presentation";

function evaluationSideFingerprint(
  composed: ReturnType<typeof composeProductionWaveScannerForSymbol>
) {
  return {
    evaluationBarIndex: composed.evaluationBarIndex,
    evaluationBarTime: composed.evaluationBarTime,
    loadError: composed.loadError,
    productionId: composed.production?.id ?? null,
    productionStatus: composed.production?.status ?? null,
    entry: composed.references.entry,
    stop: composed.references.stop,
    target: composed.references.target,
    rr: composed.references.rr,
    ready: composed.references.readyForFurtherEvaluation,
    setupId: composed.historicalSetup?.id ?? null,
  };
}

describe("historical production compose at E (B-8b)", () => {
  const baseInput = {
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  };
  /** DEMO fixture length is 24; bar 22 has confirmed production for mutation tests. */
  const historicalE = 22;

  it("A + I: default compose unchanged vs explicit last bar", () => {
    const defaultComposed = composeProductionWaveScannerForSymbol(baseInput);
    const lastE = DEMO_OHLCV.length - 1;
    const explicitLast = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: lastE },
    });
    assert.deepEqual(
      evaluationSideFingerprint(defaultComposed),
      evaluationSideFingerprint(explicitLast)
    );

    const entryRef = defaultComposed.references.entry.referencePrice;
    const defaultRow = presentWaveScannerRow(defaultComposed, {
      liveMarketPrice: entryRef,
    });
    assert.equal(defaultRow.readyForFurtherEvaluation, true);
    assert.equal(defaultRow.displayStatus, WAVE_SCANNER_UI_LABELS.readyDisplay);
    assert.equal(defaultRow.entryReference.status, "AVAILABLE");
    assert.equal(defaultRow.stopReference.status, "AVAILABLE");
    assert.equal(defaultRow.targetReference.status, "AVAILABLE");
    assert.equal(defaultRow.rr.status, "AVAILABLE");
    assert.equal(defaultRow.tradeEvaluation.status, "FAILED");
    assert.equal(defaultRow.tradeEvaluation.firstFailure, "RR_BELOW_MINIMUM");
  });

  it("B: explicit E sets evaluation bar", () => {
    const composed = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.equal(composed.evaluationBarIndex, historicalE);
    assert.equal(composed.evaluationBarTime, DEMO_OHLCV[historicalE]!.time);
  });

  it("C: scoped evaluation uses E+1 candles at historical E", () => {
    const scoped = analyzeWaveAtEvaluationBar({
      candles: DEMO_OHLCV,
      evaluationBarIndex: historicalE,
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(scoped.status, "OK");
    assert.equal(scoped.evidence.usedCandleCount, historicalE + 1);
    assert.equal(scoped.evidence.maxCandleIndexUsed, historicalE);
  });

  it("D: future candle mutation does not change evaluation-side compose at historical E", () => {
    const baseline = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    const mutatedCandles = DEMO_OHLCV.map((c, i) =>
      i <= historicalE
        ? c
        : {
            ...c,
            high: c.high * 3 + 999,
            low: c.low * 0.1 - 999,
            close: c.close * 2,
          }
    );
    const afterMutation = composeProductionWaveScannerForSymbol({
      ...baseInput,
      candles: mutatedCandles,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.deepEqual(
      evaluationSideFingerprint(baseline),
      evaluationSideFingerprint(afterMutation)
    );
  });

  it("E: E=N-1 matches default fingerprint", () => {
    const last = DEMO_OHLCV.length - 1;
    const a = composeProductionWaveScannerForSymbol(baseInput);
    const b = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: last },
    });
    assert.deepEqual(
      evaluationSideFingerprint(a),
      evaluationSideFingerprint(b)
    );
  });

  it("F: invalid E is deterministic", () => {
    const negative = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: -1 },
    });
    assert.equal(
      negative.loadError,
      PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE
    );
    assert.equal(negative.evaluationBarIndex, null);

    const pastEnd = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: DEMO_OHLCV.length },
    });
    assert.equal(
      pastEnd.loadError,
      PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE
    );
  });

  it("G: historical as-of liveMarketPrice uses entry reference", () => {
    assert.equal(HISTORICAL_AS_OF_EVAL_LIVE_MARKET_PRICE_POLICY, "ENTRY_REFERENCE");
    const composed = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.ok(composed.references.entry.referencePrice !== null);
    const entryRef = composed.references.entry.referencePrice;
    assert.equal(
      resolveHistoricalAsOfEvalLiveMarketPrice(entryRef),
      entryRef
    );
    const row = presentWaveScannerRow(composed, {
      liveMarketPrice: resolveHistoricalAsOfEvalLiveMarketPrice(entryRef),
    });
    assert.equal(row.details.tradeEvaluation.diagnostics.liveMarketPrice, entryRef);
    assert.equal(row.details.tradeEvaluation.checks.entry, "VALID");
  });

  it("H: trade evaluation uses domain evaluator via presentation", () => {
    const composed = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    const setup = composed.historicalSetup;
    const production = composed.production;
    assert.ok(setup && production);
    const inv = resolveProspectiveStructuralInvalidation(setup);
    const entryRef = composed.references.entry.referencePrice;
    const expected = evaluateTradeEvaluation({
      direction: production.observedDirection,
      entryReferencePrice: entryRef,
      liveMarketPrice: resolveHistoricalAsOfEvalLiveMarketPrice(entryRef),
      stopReferencePrice: composed.references.stop.referencePrice,
      targetReferencePrice: composed.references.target.referencePrice,
      structuralInvalidationReferencePrice: inv.invalidationPrice,
      setupLifecycleStatus: setup.status,
      structuralInvalidationTriggered:
        inv.triggered || setup.status === "INVALID",
      evaluationBarIndex: composed.evaluationBarIndex,
      evaluationPrice: entryRef,
      futureSafe: production.futureSafe,
    });
    const row = presentWaveScannerRow(composed, {
      liveMarketPrice: resolveHistoricalAsOfEvalLiveMarketPrice(entryRef),
    });
    assert.deepEqual(row.details.tradeEvaluation, expected);
  });

  it("J: compose path does not import outcome replay enrichment", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/production-wave-scanner.ts"),
      "utf8"
    );
    const composeBody = src.slice(
      src.indexOf("export function composeProductionWaveScannerForSymbol"),
      src.indexOf("export function runProductionWaveScanner")
    );
    assert.ok(!composeBody.includes("enrichProspectiveSetupOutcomeReplay"));
    assert.ok(!composeBody.includes("replayProspectiveSetupOutcome"));
  });

  it("K: alarm architecture untouched", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const alarm = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-alarm-monitor.ts"),
      "utf8"
    );
    assert.ok(!alarm.includes("composeOptions"));
    assert.ok(!alarm.includes("historical-production-compose"));
  });
});
