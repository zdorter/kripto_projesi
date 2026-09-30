import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntryPlanFromSetup } from "../../wave/setup/entry-plan";
import { evaluateStopLossModel } from "../../wave/setup/stop-loss-model";
import { SETUP_SCHEMA_VERSION } from "../../wave/setup/setup-types";
import type { SetupCandidate } from "../../wave/setup/setup-types";
import {
  enumerateScenarioInvalidationCandidates,
  resolveScenarioInvalidation,
} from "../../wave/wave-scenarios";
import type { FocusView, WavePresentationState } from "../../wave/presentation-state";
import { stopGeometryValid } from "../real-market-stop-diagnostics";
import { buildInvalidationScopeSummary } from "../real-market-invalidation-scope";
import type { WaveScanReport } from "../../wave/wave-scanner";

const BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

function setup14H(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc-w3",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "sc-w3",
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel: "3",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
    },
    setupTypeId: "impulse-continuation",
    setupTypeLabel: "Impulse continuation",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    status: "CONFIRMED",
    directionalBias: "BULLISH",
    directionalBasis: "IMPULSE_COUNT_DIRECTION",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: {
      conditions: [
        {
          conditionId: "setup-invalidation-triggered",
          outcome: "NOT_MET",
          detail: "ok",
        },
      ],
      summary: "track",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      {
        kind: "SCENARIO_INVALIDATION",
        label: "inv",
        price: 83_674,
        note: "TRACK_SCOPE",
      },
    ],
    sourceScenario: {
      confidence: 1,
      startIndex: 10,
      endIndex: 20,
      startPrice: 83_824.7,
      endPrice: 83_122.1,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

describe("invalidation scope / stop contract (14I)", () => {
  it("14H real semantics: TRACK_SCOPE inside segment envelope → geometry reject", () => {
    const segmentLow = 83_122.1;
    const inv = 83_674;
    assert.equal(
      stopGeometryValid("BULLISH", inv, 83_824.7, 83_122.1),
      false
    );
    const plan = buildEntryPlanFromSetup({
      setup: setup14H(),
      evaluationBar: BAR,
    }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan,
    });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.ok(ref.rationale.includes("not below segment") || ref.rationale.includes("geometry"));
    assert.ok(inv > segmentLow);
  });

  it("compatible structural invalidation below segment envelope → STOP AVAILABLE", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup14H({
        referenceLevels: [
          {
            kind: "SCENARIO_INVALIDATION",
            label: "inv",
            price: 82_900,
            note: "TRACK_SCOPE",
          },
        ],
        sourceScenario: {
          confidence: 1,
          startIndex: 10,
          endIndex: 20,
          startPrice: 84_000,
          endPrice: 86_000,
          evidence: [],
          limitations: [],
        },
      }),
      evaluationBar: BAR,
    }).plan!;
    assert.equal(stopGeometryValid("BULLISH", 82_900, 84_000, 86_000), true);
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan,
    });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(ref.stopPrice, 82_900);
  });

  it("NONE source: no scenario invalidation → stop unavailable", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup14H({ referenceLevels: [] }),
      evaluationBar: BAR,
    }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan,
    });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(ref.stopPrice, undefined);
  });

  it("enumerateScenarioInvalidationCandidates preserves track precedence over focus", () => {
    const focus: FocusView = {
      structure: "IMPULSE",
      scenario: "SELECTED",
      wave: "3",
      status: "CONFIRMED",
      confidence: 80,
      startIndex: 1,
      endIndex: 5,
      invalidationPrice: 82_900,
      selectionReason: "test",
    };
    const presentation = {
      primary: focus,
      alternative: null,
      tracks: {
        selectedImpulse: {
          invalidation: {
            structure: "IMPULSE",
            scenario: "SELECTED",
            wave: "2",
            price: 83_674,
            reason: "WAVE2_BREAK",
          },
          legs: [],
        },
        corrective: null,
        rivalImpulse: null,
      },
      engine: { flatWaves: [] },
    } as unknown as WavePresentationState;

    const selected = resolveScenarioInvalidation(presentation, focus, null);
    assert.equal(selected.source, "TRACK_SCOPE");
    assert.equal(selected.price, 83_674);

    const candidates = enumerateScenarioInvalidationCandidates(
      presentation,
      focus,
      null
    );
    assert.equal(candidates.length, 2);
    const track = candidates.find((c) => c.source === "TRACK_SCOPE");
    const leg = candidates.find((c) => c.source === "FOCUS_LEG");
    assert.equal(track?.selectedByPolicy, true);
    assert.equal(leg?.selectedByPolicy, false);
    assert.equal(leg?.price, 82_900);
  });

  it("buildInvalidationScopeSummary counts scanner sources", () => {
    const scanReport: WaveScanReport = {
      scenarioCount: 2,
      results: [
        {
          symbol: "BTCUSDT",
          timeframe: "1H",
          scenarioId: "a",
          role: "CANDIDATE",
          structure: "IMPULSE",
          waveLabel: "3",
          scenarioStatus: "ACTIVE",
          confidence: 1,
          startIndex: 0,
          endIndex: 1,
          startPrice: 1,
          endPrice: 2,
          invalidation: {
            available: true,
            price: 83_674,
            source: "TRACK_SCOPE",
            rule: "r",
          },
          evidence: [],
          limitations: [],
        },
        {
          symbol: "ETHUSDT",
          timeframe: "1H",
          scenarioId: "b",
          role: "CANDIDATE",
          structure: "CORRECTIVE",
          waveLabel: "B",
          scenarioStatus: "ACTIVE",
          confidence: 1,
          startIndex: 0,
          endIndex: 1,
          startPrice: 1,
          endPrice: 2,
          invalidation: { available: false, source: "NONE", rule: "none" },
          evidence: [],
          limitations: [],
        },
      ],
      errors: [],
    };
    const summary = buildInvalidationScopeSummary(scanReport);
    assert.equal(summary.bySource.TRACK_SCOPE, 1);
    assert.equal(summary.bySource.NONE, 1);
    assert.equal(summary.bySourceDetails.TRACK_SCOPE[0].waveLabel, "3");
  });
});
