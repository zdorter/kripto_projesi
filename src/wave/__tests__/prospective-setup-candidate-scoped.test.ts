import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveOpenStructuralLeg } from "../setup/open-structural-leg";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";

function setup(endIndex: number, endPrice: number): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "t:impulse",
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
    status: "CANDIDATE",
    directionalBias: "BULLISH",
    directionalBasis: "IMPULSE_COUNT_DIRECTION",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: {
      conditions: [],
      summary: "",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 5,
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

function bundle(bar: number): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex: bar,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    evaluationAnalysisScope: "EVALUATION_SCOPED",
    candleCount: 50,
    diagnostics: {
      confirmedSwings: [
        { index: 30, type: "LOW", price: 110, time: 0, strength: 1 },
        { index: 35, type: "HIGH", price: 115, time: 0, strength: 1 },
      ],
      confirmedSwingCount: 2,
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
          startIndex: 10,
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
      presentation: {
        engine: {
          flatWaves: [
            {
              label: "3",
              startIndex: 10,
              endIndex: 30,
              confidence: 1,
              status: "CONFIRMED",
            },
          ],
          impulseBullish: true,
        },
      } as never,
    },
    presentation: {
      engine: {
        flatWaves: [
          {
            label: "3",
            startIndex: 10,
            endIndex: 30,
            confidence: 1,
            status: "CONFIRMED",
          },
        ],
        impulseBullish: true,
      },
    } as never,
  };
}

function candles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: 100 + i * 0.2,
    high: 120,
    low: 90,
    close: 100 + i * 0.3,
    volume: 1,
  }));
}

describe("candidate-scoped anchor (14N-J)", () => {
  it("B: unrelated swing point does not create ambiguity", () => {
    const N = 40;
    const r = resolveOpenStructuralLeg({
      bundle: bundle(N),
      candles: candles(N + 1),
      historicalSetup: setup(30, 110),
    });
    assert.equal(r.anchorResolutionMode, "CANDIDATE_SCOPED");
    assert.equal(r.anchorSelection, "SELECTED");
    assert.equal(r.status, "AVAILABLE");
    assert.ok(r.anchorCandidates[0]!.sources.length >= 2);
  });
});
