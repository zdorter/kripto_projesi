import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { evaluateProspectiveSetupProduction } from "../setup/prospective-setup-production";
import { evaluateProspectiveSourcePolicy } from "../setup/prospective-setup-source-policy";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";
import { DEMO_OHLCV } from "../../browser/demo-ohlcv";
import { runWaveScan } from "../wave-scanner";

function historicalSetup(endIndex: number): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:s1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "s1",
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
    status: "CANDIDATE",
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
      startIndex: 20,
      endIndex: endIndex,
      startPrice: 100,
      endPrice: 110,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
  };
}

function bundleWith(
  bar: number,
  waves: { label: string; start: number; end: number; status: string }[],
  swings: { index: number; type: "HIGH" | "LOW"; price: number }[]
): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex: bar,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    evaluationAnalysisScope: "EVALUATION_SCOPED",
    candleCount: 100,
    diagnostics: {
      confirmedSwings: swings.map((s) => ({
        ...s,
        time: 0,
        strength: 1,
      })),
      confirmedSwingCount: swings.length,
      swingConfig: {} as never,
      structurePairs: [],
      allStructures: [],
      trendSource: {} as never,
      waveLegs: [],
      fibonacci: { available: false },
      focus: {
        primary: {
          role: "PRIMARY",
          structure: "IMPULSE",
          wave: "3",
          status: "CONFIRMED",
          confidence: 1,
          startIndex: 20,
          endIndex: 30,
          startPrice: 100,
          endPrice: 110,
          startTime: 0,
          endTime: 0,
          selectionReason: "t",
        },
        alternative: null,
      },
      overlaps: [],
      presentation: {} as never,
    },
    presentation: {
      engine: {
        flatWaves: waves.map((w) => ({
          label: w.label,
          startIndex: w.start,
          endIndex: w.end,
          confidence: 1,
          status: w.status,
        })),
        impulseBullish: true,
      },
    } as never,
  };
}

function candles(n: number): import("../types").Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: 100 + i * 0.1,
    high: 105 + i * 0.1,
    low: 95 + i * 0.1,
    close: 100 + i * 0.2,
    volume: 1,
  }));
}

describe("prospective setup production (14N-H)", () => {
  it("source policy accepts HISTORICAL_STRUCTURE without lifecycle CONFIRMED", () => {
    const setup = historicalSetup(30);
    const bundle = bundleWith(40, [{ label: "3", start: 20, end: 30, status: "CONFIRMED" }], []);
    const p = evaluateProspectiveSourcePolicy({ setup, bundle });
    assert.equal(p.verdict, "ACCEPTED_HISTORICAL_TRADE_SETUP");
  });

  it("movement alone does not confirm prospective production", () => {
    const setup = historicalSetup(30);
    const bundle = bundleWith(
      40,
      [{ label: "3", start: 20, end: 30, status: "CONFIRMED" }],
      []
    );
    const r = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: candles(41),
    });
    assert.notEqual(r.status, "CONFIRMED");
    assert.ok(
      r.funnelReasonCode === "TRANSITION_NOT_OBSERVED" ||
        r.funnelReasonCode === "OPEN_MOVEMENT_ONLY" ||
        r.funnelReasonCode === "OPEN_LEG_UNAVAILABLE"
    );
  });

  it("ambiguous anchor blocks confirmation", () => {
    const setup = historicalSetup(30);
    const bundle = bundleWith(
      45,
      [{ label: "3", start: 20, end: 30, status: "CONFIRMED" }],
      [
        { index: 30, type: "HIGH", price: 110 },
        { index: 38, type: "LOW", price: 105 },
      ]
    );
    const r = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: candles(46),
    });
    assert.notEqual(r.status, "CONFIRMED");
    assert.equal(r.usesLegacyPotentialAsProductionEvidence, false);
  });

  it("scoped trade context marks evaluationAnalysisScope", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], {
      timeframe: "1H",
    });
    const ctx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    });
    assert.equal(
      ctx.bundlesBySymbol?.BTCUSDT?.evaluationAnalysisScope,
      "EVALUATION_SCOPED"
    );
  });

  it("Fib registry empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });
});
