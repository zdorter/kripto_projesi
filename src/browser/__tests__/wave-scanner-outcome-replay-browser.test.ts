import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../demo-ohlcv";
import { runProductionWaveScanner } from "../../wave/production-wave-scanner";
import { enrichProspectiveSetupOutcomeReplay } from "../../wave/setup/prospective-setup-outcome-replay-enrichment";
import { formatOutcomeReplayDetailsSection } from "../../wave/setup/prospective-setup-outcome-replay-presentation";
import type { WaveScannerOutcomeReplayPresentation } from "../../wave/wave-scanner-presentation-types";
import {
  composeProductionWaveScannerForSymbol,
} from "../../wave/production-wave-scanner";
import { createWaveScannerAlarms } from "../wave-scanner-alarm-adapter";
import { emptyAlertsStore } from "../crypto-dashboard-alarm-types";

function baseReport(include: boolean) {
  return runProductionWaveScanner({
    symbols: ["BTCUSDT"],
    candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    includeOutcomeReplay: include,
  }).rows[0]!;
}

function htmlFor(outcome: WaveScannerOutcomeReplayPresentation) {
  return formatOutcomeReplayDetailsSection(outcome);
}

describe("wave scanner outcome replay browser (B-7c)", () => {
  const appSrc = fs.readFileSync(
    path.join(process.cwd(), "src/browser/wave-scanner-app.ts"),
    "utf8"
  );
  const pageSrc = fs.readFileSync(
    path.join(process.cwd(), "src/browser/wave-scanner-page.ts"),
    "utf8"
  );
  const html = fs.readFileSync(
    path.join(process.cwd(), "wave-scanner.html"),
    "utf8"
  );

  it("A: default OFF → no outcomeReplay on row", () => {
    assert.equal(baseReport(false).outcomeReplay, undefined);
    assert.ok(appSrc.includes("isOutcomeReplayEnabled"));
    assert.ok(!appSrc.includes("includeOutcomeReplay: true"));
    assert.ok(html.includes('id="outcome-replay-enabled"'));
    assert.ok(!html.includes("checked"));
  });

  it("B: ON → Details formatter shows Outcome Replay section", () => {
    const row = baseReport(true);
    assert.ok(row.outcomeReplay);
    const section = formatOutcomeReplayDetailsSection(row.outcomeReplay);
    assert.ok(section.includes("Outcome Replay"));
    assert.ok(section.includes(row.outcomeReplay!.outcome));
  });

  it("C/D: LIVE-shaped DEMO → NO_FUTURE_DATA in details HTML", () => {
    const row = baseReport(true);
    assert.equal(row.outcomeReplay!.outcome, "NO_FUTURE_DATA");
    assert.equal(row.outcomeReplay!.futureBarsAvailable, 0);
    assert.ok(htmlFor(row.outcomeReplay!).includes("NO_FUTURE_DATA"));
    assert.equal(row.tradeEvaluation.status, "FAILED");
  });

  it("E: TARGET_TOUCHED details", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const candles = Array.from({ length: 120 }, (_, i) => ({
      time: i,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
    }));
    candles[110] = { ...candles[110], low: 89 };
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
    assert.ok(htmlFor(o).includes("TARGET_TOUCHED"));
    assert.ok(htmlFor(o).includes("Resolution Bar: 110"));
  });

  it("F: INVALIDATION_TOUCHED details", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const candles = Array.from({ length: 105 }, (_, i) => ({
      time: i,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
    }));
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
    assert.ok(htmlFor(o).includes("INVALIDATION_TOUCHED"));
  });

  it("G: AMBIGUOUS details", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const candles = Array.from({ length: 102 }, (_, i) => ({
      time: i,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
    }));
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
    assert.ok(htmlFor(enrichProspectiveSetupOutcomeReplay(synthetic, candles)!).includes("AMBIGUOUS"));
  });

  it("H: NO_TOUCH details", () => {
    const o: WaveScannerOutcomeReplayPresentation = {
      outcome: "NO_TOUCH",
      horizonBars: 24,
      futureBarsAvailable: 10,
      resolutionBarIndex: null,
      barsAfterEvaluation: 10,
      targetTouched: false,
      invalidationTouched: false,
      prospectiveSetupId: "x",
    };
    assert.ok(htmlFor(o).includes("NO_TOUCH"));
    assert.ok(htmlFor(o).includes("Resolution Bar: —"));
  });

  it("I: INSUFFICIENT_CONTEXT details", () => {
    const o: WaveScannerOutcomeReplayPresentation = {
      outcome: "INSUFFICIENT_CONTEXT",
      horizonBars: 24,
      futureBarsAvailable: 5,
      resolutionBarIndex: null,
      barsAfterEvaluation: null,
      targetTouched: false,
      invalidationTouched: false,
      prospectiveSetupId: null,
    };
    assert.ok(htmlFor(o).includes("INSUFFICIENT_CONTEXT"));
  });

  it("J/K/L: trade eval and MVP refs unchanged with outcome on", () => {
    const off = baseReport(false);
    const on = baseReport(true);
    assert.deepEqual(on.tradeEvaluation, off.tradeEvaluation);
    assert.equal(on.entryReference.price, off.entryReference.price);
    assert.equal(on.readyForFurtherEvaluation, off.readyForFurtherEvaluation);
    assert.equal(on.displayStatus, off.displayStatus);
    assert.notEqual(on.tradeEvaluation.status, on.outcomeReplay!.outcome);
  });

  it("M: outcome replay does not create alarms", () => {
    const row = baseReport(true);
    const store = emptyAlertsStore();
    const before = store.alerts.length;
    createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.ok(store.alerts.length > before);
    assert.ok(store.alerts.every((a) => !a.name.includes("Outcome")));
  });

  it("N/O/P: no outcome polling; page render-only; horizon in HTML", () => {
    assert.ok(!appSrc.match(/outcome.*setInterval/i));
    assert.ok(pageSrc.includes("formatOutcomeReplayDetailsSection"));
    assert.ok(!pageSrc.includes("replayProspectiveSetupOutcome"));
    assert.ok(!pageSrc.includes("enrichProspectiveSetupOutcomeReplay"));
    const row = baseReport(true);
    assert.ok(htmlFor(row.outcomeReplay!).includes("Horizon: 24 bars"));
    assert.ok(htmlFor(row.outcomeReplay!).includes("Future Bars Available: 0"));
  });
});
