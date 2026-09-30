import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { analyzeWaveAtEvaluationBarFromSeries } from "../evaluation-scoped-analysis";
import { buildSymbolEvaluationBundleAtEvaluationBar } from "../setup/trade-setup-context";
import { resolveOpenStructuralLeg } from "../setup/open-structural-leg";
import { resolveProspectiveSetupContract } from "../setup/prospective-setup-contract";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { Candle } from "../types";
import type { SetupCandidate } from "../setup/setup-types";

function candlesThrough(
  count: number,
  closeAt: (i: number) => number
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const close = closeAt(i);
    out.push({
      time: i * 60_000,
      open: close - 0.5,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000,
    });
  }
  return out;
}

function setupAtEnd(endIndex: number, endPrice: number): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "t:impulse-continuation:3",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "s",
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel: "3",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
    },
    setupTypeId: "impulse-continuation",
    setupTypeLabel: "x",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    status: "CONFIRMED",
    directionalBias: "BULLISH",
    directionalBasis: "IMPULSE_COUNT_DIRECTION",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: {
      conditions: [{ conditionId: "x", outcome: "MET", detail: "" }],
      summary: "x",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 10,
      endIndex: endIndex,
      startPrice: 100,
      endPrice: endPrice,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
  };
}

function scopedBundle(candles: Candle[], bar: number) {
  return buildSymbolEvaluationBundleAtEvaluationBar(
    candles,
    "1H",
    { evaluationBarIndex: bar, closedSeriesOnly: true },
    DEMO_WAVE_ENGINE_OPTIONS
  );
}

describe("open structural leg (14N-G)", () => {
  it("A: uses evaluation-scoped bundle only", () => {
    const N = 22;
    const candles = DEMO_OHLCV;
    const bundle = scopedBundle(candles, N);
    const r = resolveOpenStructuralLeg({
      bundle,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(20, 110),
    });
    assert.ok(r.futureSafe || r.status === "NO_ANCHOR");
    for (const c of r.anchorCandidates) {
      assert.ok(c.anchorIndex <= N);
    }
  });

  it("B: historical setup endpoint anchor when unambiguous", () => {
    const N = 35;
    const candles = candlesThrough(N + 1, (i) =>
      i <= 30 ? 100 + i * 0.1 : 110 + (i - 30) * 0.5
    );
    const bundle = scopedBundle(candles, N);
    const setup = setupAtEnd(30, 110);
    const bundleWithFocus = {
      ...bundle,
      diagnostics: {
        ...bundle.diagnostics,
        confirmedSwings: [],
        confirmedSwingCount: 0,
        focus: {
          primary: {
            role: "PRIMARY" as const,
            structure: "IMPULSE" as const,
            wave: "3" as const,
            status: "CONFIRMED" as const,
            confidence: 1,
            startIndex: 20,
            endIndex: 30,
            startPrice: 105,
            endPrice: 110,
            startTime: 0,
            endTime: 0,
            selectionReason: "test",
          },
          alternative: null,
        },
      },
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            {
              label: "3",
              startIndex: 20,
              endIndex: 30,
              confidence: 1,
              status: "CONFIRMED",
            },
          ],
        },
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: bundleWithFocus,
      candles: candles.slice(0, N + 1),
      historicalSetup: setup,
    });
    assert.equal(r.anchorSelection, "SELECTED");
    assert.equal(r.status, "AVAILABLE");
    assert.equal(r.leg?.anchorIndex, 30);
    assert.equal(r.leg?.observationEndIndex, N);
    assert.notEqual(r.leg?.observationEndIndex, r.leg?.anchorIndex);
  });

  it("E1: merges provenance at same structural index and price", () => {
    const N = 35;
    const candles = candlesThrough(N + 1, (i) =>
      i <= 30 ? 100 + i * 0.1 : 110 + (i - 30) * 0.5
    );
    const bundle = scopedBundle(candles, N);
    const withFocus = {
      ...bundle,
      diagnostics: {
        ...bundle.diagnostics,
        confirmedSwings: [
          {
            index: 30,
            type: "LOW" as const,
            price: 110,
            time: 0,
            strength: 1,
          },
        ],
        confirmedSwingCount: 1,
        focus: {
          primary: {
            role: "PRIMARY" as const,
            structure: "IMPULSE" as const,
            wave: "3" as const,
            status: "CONFIRMED" as const,
            confidence: 1,
            startIndex: 15,
            endIndex: 30,
            startPrice: 100,
            endPrice: 110,
            startTime: 0,
            endTime: 0,
            selectionReason: "t",
          },
          alternative: null,
        },
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: withFocus,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 110),
    });
    assert.equal(r.anchorSelection, "SELECTED");
    assert.equal(r.anchorCandidates.length, 1);
    assert.ok(r.anchorCandidates[0]!.sources.length >= 2);
  });

  it("E: ambiguous anchors when swing differs from setup endpoint", () => {
    const N = 40;
    const candles = candlesThrough(N + 1, (i) => 100 + i * 0.2);
    const bundle = scopedBundle(candles, N);
    const withSwings = {
      ...bundle,
      diagnostics: {
        ...bundle.diagnostics,
        confirmedSwings: [
          { index: 25, type: "LOW" as const, price: 105, time: 0, strength: 1 },
          { index: 35, type: "HIGH" as const, price: 115, time: 0, strength: 1 },
        ],
        confirmedSwingCount: 2,
      },
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            {
              label: "3",
              startIndex: 15,
              endIndex: 30,
              confidence: 1,
              status: "CONFIRMED",
            },
          ],
        },
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: withSwings,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 110),
    });
    assert.equal(r.anchorSelection, "AMBIGUOUS");
    assert.equal(r.status, "AMBIGUOUS_ANCHOR");
  });

  it("F: no anchor when no candidates", () => {
    const N = 20;
    const candles = candlesThrough(N + 1, () => 100);
    const bundle = scopedBundle(candles, N);
    const r = resolveOpenStructuralLeg({
      bundle,
      candles: candles.slice(0, N + 1),
      historicalSetup: null,
    });
    assert.equal(r.status, "NO_ANCHOR");
  });

  it("G: no observed span when anchor equals evaluation bar", () => {
    const N = 30;
    const candles = candlesThrough(N + 1, () => 100);
    const bundle = scopedBundle(candles, N);
    const withWaves = {
      ...bundle,
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            {
              label: "3",
              startIndex: 20,
              endIndex: 30,
              confidence: 1,
              status: "CONFIRMED",
            },
          ],
        },
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: withWaves,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 110),
    });
    assert.equal(r.status, "NO_OBSERVED_SPAN");
  });

  it("H/I: bullish and bearish observed displacement", () => {
    const N = 35;
    const up = candlesThrough(N + 1, (i) => (i <= 30 ? 100 : 100 + (i - 30)));
    const bundle = scopedBundle(up, N);
    const focusBundle = {
      ...bundle,
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            { label: "3", startIndex: 20, endIndex: 30, confidence: 1, status: "CONFIRMED" },
          ],
        },
      },
      diagnostics: {
        ...bundle.diagnostics,
        confirmedSwings: [],
        confirmedSwingCount: 0,
      },
    };
    const upLeg = resolveOpenStructuralLeg({
      bundle: focusBundle,
      candles: up.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 100),
    });
    assert.equal(upLeg.leg?.observedDirection, "BULLISH");

    const down = candlesThrough(N + 1, (i) => (i <= 30 ? 120 : 120 - (i - 30)));
    const downLeg = resolveOpenStructuralLeg({
      bundle: focusBundle,
      candles: down.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 120),
    });
    assert.equal(downLeg.leg?.observedDirection, "BEARISH");
  });

  it("J: zero displacement → UNRESOLVED", () => {
    const N = 35;
    const candles = candlesThrough(N + 1, (i) => (i <= 30 ? 100 : 100));
    const bundle = scopedBundle(candles, N);
    const b = {
      ...bundle,
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            { label: "3", startIndex: 20, endIndex: 30, confidence: 1, status: "CONFIRMED" },
          ],
        },
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: b,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 100),
    });
    assert.equal(r.leg?.observedDirection, "UNRESOLVED");
  });

  it("K: observed high/low from anchor..evaluation range only", () => {
    const N = 35;
    const candles = candlesThrough(N + 1, (i) => 100 + i);
    candles[32].high = 200;
    candles[32].low = 50;
    const bundle = scopedBundle(candles, N);
    const b = {
      ...bundle,
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            { label: "3", startIndex: 20, endIndex: 30, confidence: 1, status: "CONFIRMED" },
          ],
        },
      },
      diagnostics: {
        ...bundle.diagnostics,
        focus: {
          primary: {
            role: "PRIMARY" as const,
            structure: "IMPULSE" as const,
            wave: "3" as const,
            status: "CONFIRMED" as const,
            confidence: 1,
            startIndex: 20,
            endIndex: 30,
            startPrice: 100,
            endPrice: 103,
            startTime: 0,
            endTime: 0,
            selectionReason: "test",
          },
          alternative: null,
        },
        confirmedSwings: [],
        confirmedSwingCount: 0,
      },
    };
    const r = resolveOpenStructuralLeg({
      bundle: b,
      candles: candles.slice(0, N + 1),
      historicalSetup: setupAtEnd(30, 103),
    });
    assert.equal(r.status, "AVAILABLE");
    assert.ok(r.leg);
    assert.equal(r.leg!.observedHigh, 200);
    assert.equal(r.leg!.observedLow, 50);
  });

  it("L/M: prefix invariance and extreme future mutation", () => {
    const base = candlesThrough(101, (i) => 100 + Math.sin(i / 8) * 3);
    const wild = base.map((c, i) =>
      i > 60
        ? {
            ...c,
            high: c.high * 2,
            low: c.low * 0.5,
            close: c.close * 1.5,
          }
        : c
    );
    const N = 60;
    const a = analyzeWaveAtEvaluationBarFromSeries(base, N, {
      closedSeriesOnly: true,
    });
    const b = analyzeWaveAtEvaluationBarFromSeries(wild, N, {
      closedSeriesOnly: true,
    });
    const bundleA = {
      timeframeId: "1H",
      evaluationBarIndex: N,
      evaluationBarBoundaryEstablished: true,
      evaluationBarContractDetail: "t",
      candleCount: base.length,
      diagnostics: a.diagnostics!,
      presentation: a.presentation!,
    };
    const bundleB = {
      ...bundleA,
      diagnostics: b.diagnostics!,
      presentation: b.presentation!,
    };
    const legA = resolveOpenStructuralLeg({
      bundle: bundleA,
      candles: base.slice(0, N + 1),
      historicalSetup: null,
    });
    const legB = resolveOpenStructuralLeg({
      bundle: bundleB,
      candles: wild.slice(0, N + 1),
      historicalSetup: null,
    });
    assert.deepEqual(legA, legB);
  });

  it("Q: open movement != automatic phase in progress", () => {
    const setup = setupAtEnd(30, 110);
    const N = 35;
    const candles = candlesThrough(N + 1, (i) => 100 + i * 0.3);
    const bundle = scopedBundle(candles, N);
    const b = {
      ...bundle,
      presentation: {
        ...bundle.presentation,
        engine: {
          ...bundle.presentation.engine,
          flatWaves: [
            { label: "3", startIndex: 20, endIndex: 30, confidence: 1, status: "CONFIRMED" },
          ],
        },
      },
    };
    const p = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: b,
      candles: candles.slice(0, N + 1),
    });
    if (p.openMovementVerdict === "OPEN_MOVEMENT_OBSERVED") {
      assert.notEqual(p.phaseStatus, "PHASE_IN_PROGRESS");
      assert.ok(
        p.objectiveEligibilityReasons.some((x) =>
          x.includes("TRANSITION")
        ) || p.objectiveEligibility !== "ELIGIBLE"
      );
    }
  });

  it("T: Fib registry empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });
});
