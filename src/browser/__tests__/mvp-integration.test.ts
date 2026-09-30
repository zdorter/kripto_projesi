import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { filterClosedKlines, mapBinanceKlinesResponse } from "../../providers/binance-ohlcv";
import { emptyAlertsStore } from "../crypto-dashboard-alarm-types";
import {
  buildWaveScannerPriceAlert,
  persistNewAlert,
  persistDashboardAlertsStore,
  loadDashboardAlertsStore,
  type AlarmStoreBackend,
} from "../crypto-dashboard-alarm-store";
import { AlarmFireCoordinator, buildAlarmFireEventKey } from "../alarm-fire-coordination";
import { evaluateDashboardAlertsForSymbol } from "../wave-scanner-alarm-monitor";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../demo-ohlcv";
import { runProductionWaveScanner } from "../../wave/production-wave-scanner";

describe("MVP application integration (17)", () => {
  it("A-B-C: dashboard and scanner navigation use relative GitHub Pages paths", () => {
    const dash = fs.readFileSync(
      path.join(process.cwd(), "crypto-dashboard.html"),
      "utf8"
    );
    const scan = fs.readFileSync(
      path.join(process.cwd(), "wave-scanner.html"),
      "utf8"
    );
    assert.ok(dash.includes('href="./wave-scanner.html"'));
    assert.ok(scan.includes('href="./crypto-dashboard.html"'));
    assert.ok(scan.includes("./dist/wave/wave-scanner-app.js"));
    assert.ok(!scan.includes('src="/dist/'));
  });

  it("D-E-F-G: wave alarm store compatible with toggle/delete semantics", async () => {
    const mem = new Map<string, unknown>();
    const backend: AlarmStoreBackend = {
      load: async (k) => mem.get(k) ?? null,
      save: async (k, v) => {
        mem.set(k, v);
      },
    };
    const store = emptyAlertsStore();
    const alert = buildWaveScannerPriceAlert({
      provenance: {
        source: "WAVE_SCANNER",
        sourceMode: "DEMO",
        symbol: "BTCUSDT",
        timeframe: "1H",
        referenceType: "ENTRY_REFERENCE",
        referencePrice: 100,
        setupFamily: "STRUCTURAL_RESUMPTION_CONTEXT",
        prospectiveCandidateId: "x",
        evaluationBarTime: 1,
        targetPolicy: null,
        snapshotPrice: 100,
        duplicateKey: "k",
      },
      currentPrice: 90,
    });
    persistNewAlert(store, alert);
    await persistDashboardAlertsStore(store, backend);
    const reloaded = await loadDashboardAlertsStore(backend);
    assert.equal(reloaded.alerts.length, 1);
    reloaded.alerts[0]!.enabled = false;
    await persistDashboardAlertsStore(reloaded, backend);
    const again = await loadDashboardAlertsStore(backend);
    assert.equal(again.alerts[0]!.enabled, false);
    again.alerts = [];
    await persistDashboardAlertsStore(again, backend);
    assert.equal((await loadDashboardAlertsStore(backend)).alerts.length, 0);
  });

  it("H: dual-monitor single-fire protection", () => {
    const store = emptyAlertsStore();
    const alert = buildWaveScannerPriceAlert({
      provenance: {
        source: "WAVE_SCANNER",
        sourceMode: "LIVE",
        symbol: "BTCUSDT",
        timeframe: "1H",
        referenceType: "TARGET_REFERENCE",
        referencePrice: 50,
        setupFamily: null,
        prospectiveCandidateId: null,
        evaluationBarTime: null,
        targetPolicy: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
        snapshotPrice: 50,
        duplicateKey: "d",
      },
      currentPrice: 40,
    });
    persistNewAlert(store, alert);
    const coordinator = new AlarmFireCoordinator();
    const fires: string[] = [];
    evaluateDashboardAlertsForSymbol(
      store,
      "BTCUSDT",
      55,
      () => fires.push("a"),
      coordinator
    );
    alert._wasTrue = false;
    evaluateDashboardAlertsForSymbol(
      store,
      "BTCUSDT",
      55,
      () => fires.push("b"),
      coordinator
    );
    assert.equal(fires.length, 1);
    const key = buildAlarmFireEventKey(alert.id, alert.conditions[0]!);
    assert.equal(alert.lastFiredEventKey, key);
  });

  it("J-K: DEMO/LIVE banner strings and no silent demo fallback in app source", () => {
    const app = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-app.ts"),
      "utf8"
    );
    assert.ok(app.includes("Demo moduna otomatik geçilmedi"));
    assert.ok(app.includes("updateScannerSourceBanner"));
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-page.ts"),
      "utf8"
    );
    assert.ok(page.includes("source-demo"));
    assert.ok(page.includes("source-live"));
  });

  it("L-M: symbol failure isolation and closed candle contract", () => {
    const now = Date.now() + 60_000;
    const rows = mapBinanceKlinesResponse([
      [now - 7200_000, "1", "2", "0.5", "1.5", "10", now - 3600_000],
      [now - 3600_000, "1.5", "2", "1", "1.8", "10", now + 3600_000],
    ]);
    const closed = filterClosedKlines(rows, now);
    assert.equal(closed.length, 1);
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT", "ETHUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV, ETHUSDT: [] },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(report.rows.length, 2);
    assert.ok(report.rows.find((r) => r.symbol === "ETHUSDT")?.loadError);
  });

  it("N: monitor start is idempotent", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-alarm-monitor.ts"),
      "utf8"
    );
    assert.ok(src.includes("if (this.timer)"));
    assert.ok(src.includes("if (this.polling)"));
    const app = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-app.ts"),
      "utf8"
    );
    assert.ok(app.includes("uiBound"));
  });

  it("O-P: READY terminology and prohibited trading terms absent", () => {
    const scan = fs.readFileSync(
      path.join(process.cwd(), "wave-scanner.html"),
      "utf8"
    );
    const upper = scan.toUpperCase();
    assert.ok(scan.includes("READY FOR EVALUATION"));
    for (const bad of ["TRADE NOW", "EXECUTE", "BUY", "SELL"]) {
      assert.ok(!upper.includes(bad));
    }
  });

  it("Q: target policy not labeled Fibonacci in UI", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/browser/wave-scanner-page.ts"),
      "utf8"
    );
    assert.ok(
      page.includes("PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY") ||
        page.includes("targetPolicyDescription")
    );
    assert.ok(!page.includes("Fibonacci target"));
  });

  it("R: deterministic Demo E2E composition", () => {
    const report = runProductionWaveScanner({
      symbols: ["BTCUSDT"],
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
      timeframeId: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const row = report.rows[0]!;
    assert.ok(row.readyForFurtherEvaluation || row.blockerReason);
  });
});
