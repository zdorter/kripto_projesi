import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { detectSetups, detectSetupsFromScanReport } from "../setup/setup-detector";
import { runWaveScan } from "../wave-scanner";
import type { WaveScanReport, WaveScanResult } from "../wave-scanner";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

const FORBIDDEN = [
  "LONG",
  "SHORT",
  "BUY",
  "SELL",
  "ENTRY",
  "STOP_LOSS",
  "TAKE_PROFIT",
  "riskReward",
  "leverage",
];

function findPrimaryFocus(
  report: ReturnType<typeof detectSetups>
) {
  return report.candidates.find(
    (c) =>
      c.setupTypeId === "primary-focus-leg" &&
      c.scenarioRef.role === "PRIMARY"
  );
}

describe("setup-detector", () => {
  it("produces setups from WaveScanReport without re-running scanner", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    assert.ok(report.candidateCount > 0);
    assert.equal(report.timeframe, TF);
  });

  it("ACTIVE primary focus is never setup CONFIRMED on demo (structural catalog)", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    const focus = findPrimaryFocus(report);
    assert.ok(focus);
    assert.notEqual(focus.status, "CONFIRMED");
    assert.equal(focus.isTradeSetup, false);
  });

  it("INVALIDATED scenario yields INVALID setup", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const mutated: WaveScanReport = {
      ...scan,
      results: scan.results.map((r) =>
        r.scenarioId === scan.results.find((x) => x.role === "PRIMARY")?.scenarioId
          ? { ...r, scenarioStatus: "INVALIDATED", engineStatus: "INVALIDATED" }
          : r
      ),
    };
    const report = detectSetupsFromScanReport(mutated);
    const invalid = report.candidates.filter(
      (c) =>
        c.scenarioRef.scenarioId ===
          mutated.results.find((x) => x.role === "PRIMARY")!.scenarioId &&
        c.status === "INVALID"
    );
    assert.ok(invalid.length > 0);
  });

  it("INSUFFICIENT_CONTEXT scenario yields INSUFFICIENT_CONTEXT setup", () => {
    const row: WaveScanResult = {
      symbol: "X",
      timeframe: TF,
      scenarioId: "primary-impulse-5",
      role: "PRIMARY",
      structure: "IMPULSE",
      waveLabel: "5",
      scenarioStatus: "INSUFFICIENT_CONTEXT",
      confidence: 0,
      startIndex: -1,
      endIndex: -1,
      startPrice: 0,
      endPrice: 0,
      invalidation: { available: false, rule: "none", source: "NONE" },
      evidence: [],
      limitations: [],
    };
    const report = detectSetupsFromScanReport({
      schemaVersion: "1.0",
      timeframe: TF,
      symbols: ["X"],
      results: [row],
      analyzedSymbolCount: 1,
      scenarioCount: 1,
      errors: [],
    });
    const setup = report.candidates.find((c) => c.setupTypeId === "primary-focus-leg");
    assert.ok(setup);
    assert.equal(setup.status, "INSUFFICIENT_CONTEXT");
  });

  it("mtf-primary-pair-context is INSUFFICIENT_CONTEXT without optional MTF block", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    assert.equal(scan.optionalMtfBySymbol, undefined);
    const report = detectSetupsFromScanReport(scan);
    const mtfSetups = report.candidates.filter(
      (c) => c.setupTypeId === "mtf-primary-pair-context"
    );
    assert.ok(mtfSetups.length > 0);
    assert.ok(
      mtfSetups.every((c) => c.status === "INSUFFICIENT_CONTEXT")
    );
  });

  it("non-MTF setups work when optional MTF absent", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    const impulse = report.candidates.filter(
      (c) => c.setupTypeId === "impulse-wave-segment"
    );
    assert.ok(impulse.length > 0);
    assert.ok(impulse.some((c) => c.status !== "INSUFFICIENT_CONTEXT"));
  });

  it("does not fabricate scenario invalidation reference level", () => {
    const row: WaveScanResult = {
      symbol: "Y",
      timeframe: TF,
      scenarioId: "primary-impulse-3",
      role: "PRIMARY",
      structure: "IMPULSE",
      waveLabel: "3",
      engineStatus: "POTENTIAL",
      scenarioStatus: "ACTIVE",
      confidence: 50,
      startIndex: 1,
      endIndex: 5,
      startPrice: 10,
      endPrice: 12,
      invalidation: { available: false, rule: "none", source: "NONE" },
      evidence: [],
      limitations: [],
    };
    const report = detectSetupsFromScanReport({
      schemaVersion: "1.0",
      timeframe: TF,
      symbols: ["Y"],
      results: [row],
      analyzedSymbolCount: 1,
      scenarioCount: 1,
      errors: [],
    });
    const setup = report.candidates.find((c) => c.setupTypeId === "primary-focus-leg");
    assert.ok(setup);
    assert.ok(
      !setup.referenceLevels.some((l) => l.kind === "SCENARIO_INVALIDATION")
    );
  });

  it("is deterministic for the same scan input", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const a = detectSetupsFromScanReport(scan);
    const b = detectSetupsFromScanReport(scan);
    assert.deepEqual(a, b);
  });

  it("continues other symbols when one symbol only has scan errors", () => {
    const scan = runWaveScan(
      [
        { symbol: "BTCUSDT", candles: DEMO_OHLCV },
        { symbol: "ETHUSDT", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    const report = detectSetupsFromScanReport({
      ...scan,
      errors: [
        {
          symbol: "BAD",
          timeframe: TF,
          message: "failed",
        },
      ],
    });
    assert.ok(
      report.candidates.some((c) => c.symbol === "BTCUSDT") &&
        report.candidates.some((c) => c.symbol === "ETHUSDT")
    );
    assert.ok(report.errors.some((e) => e.symbol === "BAD"));
  });

  it("no detector output uses CONFIRMED status", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    assert.ok(report.candidates.every((c) => c.status !== "CONFIRMED"));
  });

  it("NESTED_POSSIBLE MTF does not yield CONFIRMED mtf-primary setup", () => {
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
    assert.ok(scan.optionalMtfBySymbol?.BTCUSDT);
    const kind = scan.optionalMtfBySymbol!.BTCUSDT.multiTimeframe.relationship.kind;
    const report = detectSetupsFromScanReport(scan);
    const mtf = report.candidates.filter(
      (c) => c.setupTypeId === "mtf-primary-pair-context"
    );
    assert.ok(mtf.length > 0);
    if (kind === "NESTED_POSSIBLE") {
      assert.ok(mtf.every((c) => c.status !== "CONFIRMED"));
    }
  });

  it("hierarchy NESTED_CANDIDATE does not auto-confirm mtf-primary setup", () => {
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
    const hierarchy = scan.optionalMtfBySymbol?.BTCUSDT?.hierarchy;
    const report = detectSetupsFromScanReport(scan);
    const mtf = report.candidates.filter(
      (c) => c.setupTypeId === "mtf-primary-pair-context"
    );
    if (
      hierarchy?.primaryPair?.relationship === "NESTED_CANDIDATE"
    ) {
      assert.ok(mtf.every((c) => c.status !== "CONFIRMED"));
    }
  });

  it("output object keys do not include trade signal field names", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetups({ scanReport: scan });
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        for (const [k, v] of Object.entries(value)) {
          keys.push(k.toUpperCase());
          walk(v);
        }
      }
    };
    walk(report);
    for (const token of FORBIDDEN) {
      assert.ok(!keys.includes(token), `forbidden key ${token}`);
    }
  });

  it("includes alternative and candidate setup types when scenarios exist", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    if (scan.results.some((r) => r.role === "ALTERNATIVE")) {
      assert.ok(
        report.candidates.some((c) => c.setupTypeId === "alternative-focus-leg")
      );
    }
    assert.ok(
      report.candidates.some((c) => c.setupTypeId === "corrective-wave-segment") ||
        report.candidates.some((c) => c.setupTypeId === "impulse-wave-segment")
    );
  });

  it("NOT_MET confirmation keeps CANDIDATE for active primary", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetupsFromScanReport(scan);
    const primary = findPrimaryFocus(report);
    assert.ok(primary);
    const inv = primary.confirmation.conditions.find(
      (c) => c.conditionId === "invalidation-available"
    );
    if (inv?.outcome === "NOT_MET" && primary.scenarioRef.scenarioStatus === "ACTIVE") {
      assert.equal(primary.status, "CANDIDATE");
    }
  });
});
