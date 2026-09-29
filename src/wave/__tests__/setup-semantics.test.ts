import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  SETUP_CATALOG,
  isEntryPlanEligibleSetup,
  listTradeSetupCatalogEntries,
} from "../setup/setup-catalog";
import { detectSetupsFromScanReport } from "../setup/setup-detector";
import { evaluateCondition, resolveSetupLifecycleStatus } from "../setup/setup-rules";
import { getSetupCatalogEntry } from "../setup/setup-catalog";
import { runWaveScan } from "../wave-scanner";
import type { WaveScanResult } from "../wave-scanner";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

function baseRow(overrides: Partial<WaveScanResult> = {}): WaveScanResult {
  return {
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioId: "primary-impulse-5",
    role: "PRIMARY",
    structure: "IMPULSE",
    waveLabel: "5",
    engineStatus: "CONFIRMED",
    scenarioStatus: "ACTIVE",
    confidence: 72,
    startIndex: 10,
    endIndex: 20,
    startPrice: 100,
    endPrice: 120,
    invalidation: {
      available: true,
      price: 95,
      rule: "Focus-leg invalidation.",
      source: "FOCUS_LEG",
    },
    evidence: [],
    limitations: [],
    ...overrides,
  };
}

function statusForType(
  setupTypeId: string,
  row: WaveScanResult
): ReturnType<typeof resolveSetupLifecycleStatus> {
  const entry = getSetupCatalogEntry(setupTypeId)!;
  const ctx = { scanRow: row };
  const trigger = entry.triggerConditions.map((id) => evaluateCondition(id, ctx));
  const confirmation = entry.confirmationConditions.map((id) =>
    evaluateCondition(id, ctx)
  );
  const invalidation = [evaluateCondition("setup-invalidation-triggered", ctx)];
  return resolveSetupLifecycleStatus(
    row,
    entry,
    trigger,
    confirmation,
    invalidation,
    false
  );
}

describe("setup semantics 14B.6", () => {
  it("catalog separates structural context and trade setup types", () => {
    assert.equal(listTradeSetupCatalogEntries().length, 2);
    assert.ok(
      listTradeSetupCatalogEntries().every((e) => e.isTradeSetup === true)
    );
    assert.ok(
      SETUP_CATALOG.filter((e) => !e.isTradeSetup).every(
        (e) => e.category === "STRUCTURAL_CONTEXT"
      )
    );
  });

  it("entry plan eligibility contract", () => {
    assert.equal(
      isEntryPlanEligibleSetup({ isTradeSetup: false, status: "CONFIRMED" }),
      false
    );
    assert.equal(
      isEntryPlanEligibleSetup({ isTradeSetup: true, status: "CANDIDATE" }),
      false
    );
    assert.equal(
      isEntryPlanEligibleSetup({ isTradeSetup: true, status: "CONFIRMED" }),
      true
    );
  });

  it("Wave 5 impulse-wave-segment is never CONFIRMED", () => {
    const row = baseRow({ waveLabel: "5", structure: "IMPULSE" });
    assert.notEqual(statusForType("impulse-wave-segment", row), "CONFIRMED");
    assert.equal(statusForType("impulse-wave-segment", row), "CANDIDATE");
  });

  it("Wave C corrective-wave-segment is never CONFIRMED", () => {
    const row = baseRow({
      waveLabel: "C",
      structure: "CORRECTIVE",
      scenarioId: "primary-corrective-c",
    });
    assert.notEqual(statusForType("corrective-wave-segment", row), "CONFIRMED");
  });

  it("ACTIVE primary focus is never trade CONFIRMED", () => {
    const row = baseRow({ role: "PRIMARY" });
    assert.notEqual(statusForType("primary-focus-leg", row), "CONFIRMED");
  });

  it("ACTIVE alternative focus is never trade CONFIRMED", () => {
    const row = baseRow({
      role: "ALTERNATIVE",
      scenarioId: "alternative-impulse-5",
    });
    assert.notEqual(statusForType("alternative-focus-leg", row), "CONFIRMED");
  });

  it("full demo scan produces no CONFIRMED candidates", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    assert.ok(report.candidates.length > 0);
    assert.ok(report.candidates.every((c) => c.status !== "CONFIRMED"));
    assert.ok(report.candidates.every((c) => c.isTradeSetup === false));
    assert.ok(
      report.candidates.every((c) => !isEntryPlanEligibleSetup(c))
    );
  });

  it("MTF scan does not produce CONFIRMED mtf-primary-pair-context", () => {
    const scan = runWaveScan(
      [
        {
          symbol: "BTCUSDT",
          candles: DEMO_OHLCV,
          lowerCandles: DEMO_OHLCV,
        },
      ],
      { ...OPTS, lowerTimeframe: "15M" }
    );
    const report = detectSetupsFromScanReport(scan);
    const mtf = report.candidates.filter(
      (c) => c.setupTypeId === "mtf-primary-pair-context"
    );
    assert.ok(mtf.length > 0);
    assert.ok(mtf.every((c) => c.status !== "CONFIRMED"));
  });

  it("engine CONFIRMED does not imply setup CONFIRMED on demo", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const engineConfirmed = scan.results.filter(
      (r) => r.engineStatus === "CONFIRMED"
    );
    assert.ok(engineConfirmed.length > 0);
    const report = detectSetupsFromScanReport(scan);
    for (const row of engineConfirmed) {
      const related = report.candidates.filter(
        (c) => c.scenarioRef.scenarioId === row.scenarioId
      );
      assert.ok(related.every((c) => c.status !== "CONFIRMED"));
    }
  });

  it("same scenario multiple structural types none CONFIRMED", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    const byScenario = new Map<string, typeof report.candidates>();
    for (const c of report.candidates) {
      const list = byScenario.get(c.scenarioRef.scenarioId) ?? [];
      list.push(c);
      byScenario.set(c.scenarioRef.scenarioId, list);
    }
    for (const [, list] of byScenario) {
      if (list.length > 1) {
        assert.ok(list.every((c) => c.status !== "CONFIRMED"));
      }
    }
  });
});
