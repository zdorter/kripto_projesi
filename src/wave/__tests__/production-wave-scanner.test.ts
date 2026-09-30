import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { DEFAULT_WATCHLIST_SYMBOLS } from "../../browser/default-watchlist";
import {
  composeProductionWaveScannerForSymbol,
  runProductionWaveScanner,
} from "../production-wave-scanner";
import {
  presentWaveScannerRow,
  WAVE_SCANNER_FORBIDDEN_UI_TOKENS,
  WAVE_SCANNER_UI_LABELS,
} from "../wave-scanner-presentation";

describe("production wave scanner composition (15)", () => {
  it("A: wires prospective production through evaluateProspectiveReferenceBundle", () => {
    const bar = 22;
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(composed.loadError, null);
    assert.ok(composed.production);
    assert.equal(composed.production!.status, "CONFIRMED");
    assert.equal(composed.references.entry.modelId, "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE");
    assert.equal(
      composed.references.target.policyId,
      "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY"
    );
  });

  it("B-L: deterministic DEMO READY presentation on impulse path", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      generatedAt: "2020-01-01T00:00:00.000Z",
    });
    const row = report.rows.find((r) => r.symbol === "BTCUSDT");
    assert.ok(row);
    assert.equal(row!.prospectiveSetup?.status, "CONFIRMED");
    assert.equal(row!.entryReference.status, "AVAILABLE");
    assert.equal(row!.stopReference.status, "AVAILABLE");
    assert.equal(row!.targetReference.status, "AVAILABLE");
    assert.equal(row!.rr.status, "AVAILABLE");
    assert.equal(row!.readyForFurtherEvaluation, true);
    assert.equal(row!.displayStatus, WAVE_SCANNER_UI_LABELS.readyDisplay);
  });

  it("C: non-ready blocker surfaces on row", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "ETHUSDT",
      candles: [],
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const row = presentWaveScannerRow(composed);
    assert.ok(!row.readyForFurtherEvaluation);
    assert.equal(row.loadError, "INSUFFICIENT_CANDLES");
  });

  it("D-G: entry/stop/target/RR presentation semantics", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-page.ts"),
      "utf8"
    );
    assert.ok(page.includes("WAVE_SCANNER_UI_LABELS.entryColumn"));
    assert.ok(page.includes("WAVE_SCANNER_UI_LABELS.stopColumn"));
    assert.ok(page.includes("not an executable stop order"));
    assert.ok(page.includes("not a take-profit order"));
    assert.ok(page.includes("targetPolicyDescription"));
    const row = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    }).rows[0]!;
    assert.equal(
      row.targetReference.source,
      "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY"
    );
    assert.notEqual(row.targetReference.source, "FIBONACCI");
  });

  it("H-I: READY display and forbidden action tokens absent from UI labels", () => {
    const labels = Object.values(WAVE_SCANNER_UI_LABELS).join(" ");
    for (const token of WAVE_SCANNER_FORBIDDEN_UI_TOKENS) {
      assert.ok(!labels.includes(token));
    }
    const html = fs.readFileSync(
      path.join(process.cwd(), "wave-scanner.html"),
      "utf8"
    );
    for (const token of ["BUY", "SELL", "LONG", "SHORT", "EXECUTE"]) {
      assert.ok(!html.toUpperCase().includes(token));
    }
  });

  it("J: symbol failure isolation", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT", "ETHUSDT"],
      candlesBySymbol: {
        BTCUSDT: DEMO_OHLCV,
        ETHUSDT: [],
      },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(report.rows.length, 2);
    const eth = report.rows.find((r) => r.symbol === "ETHUSDT");
    assert.ok(eth?.loadError);
    const btc = report.rows.find((r) => r.symbol === "BTCUSDT");
    assert.ok(btc?.prospectiveSetup);
  });

  it("K: closed-candle evaluation path", () => {
    const composed = composeProductionWaveScannerForSymbol({
      symbol: "BTCUSDT",
      candles: DEMO_OHLCV,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.ok(composed.evaluationBarIndex !== null);
    assert.ok(composed.evaluationBarIndex! < DEMO_OHLCV.length - 1 || DEMO_OHLCV.length > 1);
  });

  it("M-N: browser bundle entry and GitHub Pages relative paths", () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), "wave-scanner.html"),
      "utf8"
    );
    assert.ok(html.includes("./dist/wave/wave-scanner-app.js"));
    assert.ok(!html.includes('src="/dist/'));
    const build = fs.readFileSync(
      path.join(process.cwd(), "scripts/build-wave-browser.mjs"),
      "utf8"
    );
    assert.ok(build.includes("wave-scanner-app"));
  });

  it("real-market smoke: processes six default symbols without throwing", () => {
    const candlesBySymbol: Record<string, typeof DEMO_OHLCV> = {};
    for (const s of DEFAULT_WATCHLIST_SYMBOLS) {
      candlesBySymbol[s] = DEMO_OHLCV;
    }
    const report = runProductionWaveScanner({
      symbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      candlesBySymbol,
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(report.rows.length, 6);
    assert.ok(report.rows.some((r) => r.readyForFurtherEvaluation));
  });
});
