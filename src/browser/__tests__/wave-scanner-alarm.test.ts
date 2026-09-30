import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../demo-ohlcv";
import { runProductionWaveScanner } from "../../wave/production-wave-scanner";
import {
  createWaveScannerAlarms,
  isAlarmableReferenceType,
  listAlarmableReferences,
  previewWaveScannerAlarmsToCreate,
} from "../wave-scanner-alarm-adapter";
import {
  derivePriceCrossOperator,
  findWaveScannerDuplicate,
  persistNewAlert,
  buildWaveScannerPriceAlert,
  waveScannerDuplicateKey,
  type AlarmStoreBackend,
} from "../crypto-dashboard-alarm-store";
import { evaluateDashboardAlertsForSymbol } from "../wave-scanner-alarm-monitor";
import { emptyAlertsStore } from "../crypto-dashboard-alarm-types";

function readyRow() {
  const report = runProductionWaveScanner({
    symbols: ["BTCUSDT"],
    candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  return report.rows[0]!;
}

describe("wave scanner alarm integration (16)", () => {
  it("A-C: entry, SL, target alarm creation from AVAILABLE refs", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    const price = row.entryReference.price!;
    const result = createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: [
        "ENTRY_REFERENCE",
        "STRUCTURAL_INVALIDATION_REFERENCE",
        "TARGET_REFERENCE",
      ],
      store,
      currentEvaluationPrice: price,
    });
    assert.equal(result.created, 3);
    assert.equal(store.alerts.length, 3);
    assert.ok(store.alerts.every((a) => a.waveScanner?.source === "WAVE_SCANNER"));
  });

  it("D: unavailable reference cannot create", () => {
    const row = readyRow();
    const refs = listAlarmableReferences(row);
    const stop = refs.find((r) => r.referenceType === "STRUCTURAL_INVALIDATION_REFERENCE");
    assert.ok(stop);
    const store = emptyAlertsStore();
    const broken = {
      ...row,
      stopReference: { status: "INSUFFICIENT_CONTEXT", price: null, source: null },
    };
    const result = createWaveScannerAlarms({
      row: broken,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["STRUCTURAL_INVALIDATION_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.equal(result.created, 0);
    assert.equal(result.failed, 1);
  });

  it("E-F: RR and READY are not alarmable types", () => {
    assert.ok(!isAlarmableReferenceType("RR"));
    assert.ok(!isAlarmableReferenceType("READY_FOR_FURTHER_EVALUATION"));
    const row = readyRow();
    assert.ok(row.readyForFurtherEvaluation);
    const store = emptyAlertsStore();
    const result = createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: [],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.equal(result.failed, 0);
    assert.match(result.messageTr, /oluşturulamadı/i);
  });

  it("G-H: explicit selection and preview before persist", () => {
    const row = readyRow();
    const preview = previewWaveScannerAlarmsToCreate({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE"],
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.equal(preview.length, 1);
    assert.equal(preview[0]!.referenceType, "ENTRY_REFERENCE");
  });

  it("I: duplicate prevention", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    const input = {
      row,
      sourceMode: "DEMO" as const,
      selectedReferenceTypes: ["ENTRY_REFERENCE" as const],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    };
    const a = createWaveScannerAlarms(input);
    assert.equal(a.created, 1);
    const b = createWaveScannerAlarms(input);
    assert.equal(b.created, 0);
    assert.equal(b.duplicates, 1);
    assert.equal(store.alerts.length, 1);
  });

  it("J-K: snapshot price and provenance", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    createWaveScannerAlarms({
      row,
      sourceMode: "LIVE",
      selectedReferenceTypes: ["TARGET_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    const alert = store.alerts[0]!;
    assert.equal(alert.waveScanner!.snapshotPrice, alert.conditions[0]!.value);
    assert.equal(alert.waveScanner!.sourceMode, "LIVE");
    assert.equal(alert.waveScanner!.targetPolicy, "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY");
  });

  it("L: demo provenance", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.equal(store.alerts[0]!.waveScanner!.sourceMode, "DEMO");
  });

  it("M: page reload persistence via store backend", async () => {
    const mem = new Map<string, unknown>();
    const backend: AlarmStoreBackend = {
      load: async (k) => mem.get(k) ?? null,
      save: async (k, v) => {
        mem.set(k, v);
      },
    };
    const row = readyRow();
    const store = emptyAlertsStore();
    createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    const { persistDashboardAlertsStore, loadDashboardAlertsStore } = await import(
      "../crypto-dashboard-alarm-store"
    );
    await persistDashboardAlertsStore(store, backend);
    const reloaded = await loadDashboardAlertsStore(backend);
    assert.equal(reloaded.alerts.length, 1);
  });

  it("N: crossing direction from evaluation vs reference", () => {
    assert.deepEqual(derivePriceCrossOperator(100, 110), { operator: ">", atReference: false });
    assert.deepEqual(derivePriceCrossOperator(120, 110), { operator: "<", atReference: false });
    assert.deepEqual(derivePriceCrossOperator(110, 110), { operator: ">", atReference: true });
  });

  it("O: partial failure per reference", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    const result = createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE", "STRUCTURAL_INVALIDATION_REFERENCE"],
      store,
      currentEvaluationPrice: row.entryReference.price!,
    });
    assert.ok(result.items.length === 2);
    assert.ok(result.created + result.duplicates + result.failed === 2);
  });

  it("P: invalid evaluation price rejected", () => {
    const row = readyRow();
    const store = emptyAlertsStore();
    const result = createWaveScannerAlarms({
      row,
      sourceMode: "DEMO",
      selectedReferenceTypes: ["ENTRY_REFERENCE"],
      store,
      currentEvaluationPrice: Number.NaN,
    });
    assert.equal(result.created, 0);
    assert.ok(result.failed >= 1);
  });

  it("Q: no BUY/SELL in alert names", () => {
    const row = readyRow();
    const prov = {
      source: "WAVE_SCANNER" as const,
      sourceMode: "DEMO" as const,
      symbol: "BTCUSDT",
      timeframe: "1H",
      referenceType: "ENTRY_REFERENCE" as const,
      referencePrice: 100,
      setupFamily: "STRUCTURAL_RESUMPTION_CONTEXT",
      prospectiveCandidateId: "x",
      evaluationBarTime: 1,
      targetPolicy: null,
      snapshotPrice: 100,
      duplicateKey: waveScannerDuplicateKey({
        source: "WAVE_SCANNER",
        symbol: "BTCUSDT",
        timeframe: "1H",
        referenceType: "ENTRY_REFERENCE",
        referencePrice: 100,
      }),
    };
    const alert = buildWaveScannerPriceAlert({ provenance: prov, currentPrice: 95 });
    assert.ok(!alert.name.includes("BUY"));
    assert.ok(!alert.name.includes("SELL"));
  });

  it("R: wave production module does not import alarm store", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const prod = fs.readFileSync(
      path.join(process.cwd(), "src/wave/production-wave-scanner.ts"),
      "utf8"
    );
    assert.ok(!prod.includes("alarm"));
    assert.ok(!prod.includes("Alarm"));
  });

  it("S: dashboard-compatible price alert evaluation", () => {
    const store = emptyAlertsStore();
    const alert = buildWaveScannerPriceAlert({
      provenance: {
        source: "WAVE_SCANNER",
        sourceMode: "DEMO",
        symbol: "BTCUSDT",
        timeframe: "1H",
        referenceType: "ENTRY_REFERENCE",
        referencePrice: 100,
        setupFamily: null,
        prospectiveCandidateId: null,
        evaluationBarTime: null,
        targetPolicy: null,
        snapshotPrice: 100,
        duplicateKey: "k",
      },
      currentPrice: 90,
    });
    persistNewAlert(store, alert);
    const fires: string[] = [];
    evaluateDashboardAlertsForSymbol(store, "BTCUSDT", 101, () => {
      fires.push("fired");
    });
    assert.deepEqual(fires, ["fired"]);
  });

  it("duplicate key lookup", () => {
    const store = emptyAlertsStore();
    const key = waveScannerDuplicateKey({
      source: "WAVE_SCANNER",
      symbol: "BTCUSDT",
      timeframe: "1H",
      referenceType: "ENTRY_REFERENCE",
      referencePrice: 1,
    });
    const alert = buildWaveScannerPriceAlert({
      provenance: {
        source: "WAVE_SCANNER",
        sourceMode: "DEMO",
        symbol: "BTCUSDT",
        timeframe: "1H",
        referenceType: "ENTRY_REFERENCE",
        referencePrice: 1,
        setupFamily: null,
        prospectiveCandidateId: null,
        evaluationBarTime: null,
        targetPolicy: null,
        snapshotPrice: 1,
        duplicateKey: key,
      },
      currentPrice: 0.5,
    });
    persistNewAlert(store, alert);
    assert.ok(findWaveScannerDuplicate(store, key));
  });
});
