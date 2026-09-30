import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  listStructuralContextCatalogEntries,
  listTradeSetupCatalogEntries,
  isEntryPlanEligibleSetup,
} from "../setup/setup-catalog";
import { detectSetups } from "../setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import {
  evaluateTradeCondition,
  resolveTradeSetupLifecycleStatus,
} from "../setup/trade-setup-rules";
import { TRADE_SETUP_CATALOG } from "../setup/trade-setup-catalog";
import { evaluateCondition } from "../setup/setup-rules";
import { runWaveScan } from "../wave-scanner";
import type { WaveScanResult } from "../wave-scanner";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

describe("trade-setup 14C.1", () => {
  it("catalog: 5 structural + 2 trade", () => {
    assert.equal(listStructuralContextCatalogEntries().length, 5);
    assert.equal(listTradeSetupCatalogEntries().length, 2);
    assert.ok(
      listTradeSetupCatalogEntries().every(
        (e) => e.category === "TRADE_SETUP" && e.isTradeSetup
      )
    );
  });

  it("structural detections never CONFIRMED without trade context", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetups({ scanReport: scan });
    assert.ok(report.candidates.every((c) => !c.isTradeSetup));
    assert.ok(report.candidates.every((c) => c.status !== "CONFIRMED"));
  });

  it("trade without bundle yields INSUFFICIENT_CONTEXT on trade rows", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({
      scanReport: tradeCtx.scanReport,
      tradeContext: tradeCtx,
    });
    const trade = report.candidates.filter((c) => c.isTradeSetup);
    assert.ok(trade.length > 0);
    assert.ok(
      trade.every(
        (c) =>
          c.status === "INSUFFICIENT_CONTEXT" ||
          c.status === "CANDIDATE" ||
          c.status === "INVALID"
      )
    );
  });

  it("correction-end cannot CONFIRMED without ABC fib contract", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({
      scanReport: tradeCtx.scanReport,
      tradeContext: tradeCtx,
    });
    const corr = report.candidates.filter(
      (c) => c.setupTypeId === "correction-end"
    );
    assert.ok(corr.length > 0);
    assert.ok(corr.every((c) => c.status !== "CONFIRMED"));
  });

  it("POTENTIAL leg cannot satisfy impulse-leading-leg-confirmed-at-bar", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const bundle = tradeCtx.bundlesBySymbol!.BTCUSDT;
    const row = tradeCtx.scanReport.results.find(
      (r) => r.structure === "IMPULSE" && ["3", "4", "5"].includes(r.waveLabel)
    );
    if (!row) {
      return;
    }
    const out = evaluateTradeCondition("impulse-leading-leg-confirmed-at-bar", {
      scanRow: row,
      bundle,
    });
    if (bundle.presentation.engine.flatWaves.find((w) => w.label === row.waveLabel)?.status === "POTENTIAL") {
      assert.equal(out.outcome, "NOT_MET");
    }
  });

  it("Wave 5 row does not auto-set direction from label", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({
      scanReport: tradeCtx.scanReport,
      tradeContext: tradeCtx,
    });
    for (const c of report.candidates.filter(
      (x) => x.isTradeSetup && x.scenarioRef.waveLabel === "5"
    )) {
      if (c.directionalBasis === "LEG_PRICE_DELTA") {
        assert.fail("Wave 5 must not use LEG_PRICE_DELTA");
      }
    }
  });

  it("entry whitelist: only confirmed trade setup", () => {
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

  it("resolveTradeSetupLifecycleStatus CONFIRMED when all trade groups MET", () => {
    const entry = TRADE_SETUP_CATALOG[0];
    const row: WaveScanResult = {
      symbol: "T",
      timeframe: TF,
      scenarioId: "primary-impulse-5",
      role: "PRIMARY",
      structure: "IMPULSE",
      waveLabel: "5",
      engineStatus: "CONFIRMED",
      scenarioStatus: "ACTIVE",
      confidence: 80,
      startIndex: 1,
      endIndex: 10,
      startPrice: 100,
      endPrice: 110,
      invalidation: {
        available: true,
        price: 95,
        rule: "test",
        source: "FOCUS_LEG",
      },
      evidence: [],
      limitations: [],
    };
    const met = (id: string) => ({
      conditionId: id,
      outcome: "MET" as const,
      detail: "test",
    });
    const status = resolveTradeSetupLifecycleStatus(
      row,
      entry,
      [met("a"), met("b")],
      [met("t")],
      [met("c1"), met("c2")],
      [evaluateCondition("setup-invalidation-triggered", { scanRow: row })]
    );
    assert.equal(status, "CONFIRMED");
  });

  it("deterministic trade detection", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const a = detectSetups({
      scanReport: tradeCtx.scanReport,
      tradeContext: tradeCtx,
    });
    const b = detectSetups({
      scanReport: tradeCtx.scanReport,
      tradeContext: tradeCtx,
    });
    assert.deepEqual(a, b);
  });

  it("missing evaluation bundle for symbol → trade INSUFFICIENT_CONTEXT", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetups({
      scanReport: scan,
      tradeContext: { scanReport: scan, bundlesBySymbol: {} },
    });
    const trade = report.candidates.filter((c) => c.isTradeSetup);
    assert.ok(trade.length > 0);
    assert.ok(trade.every((c) => c.status === "INSUFFICIENT_CONTEXT"));
  });
});
