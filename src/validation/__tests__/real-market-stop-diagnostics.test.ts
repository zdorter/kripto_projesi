import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntryPlanFromSetup } from "../../wave/setup/entry-plan";
import { evaluateStopLossModel } from "../../wave/setup/stop-loss-model";
import { SETUP_SCHEMA_VERSION } from "../../wave/setup/setup-types";
import type { SetupCandidate } from "../../wave/setup/setup-types";
import {
  buildStopPlanDiagnostic,
  classifyStopFailureReason,
  stopGeometryValid,
} from "../real-market-stop-diagnostics";

const TF = "1H";
const BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test closed bar",
};

function setup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTC:1H:impulse-continuation:sc",
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioRef: {
      scenarioId: "sc",
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
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

describe("stop reference diagnostics (14H)", () => {
  it("valid BULLISH geometry per stop contract", () => {
    assert.equal(stopGeometryValid("BULLISH", 82_900, 84_000, 86_000), true);
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(ref.stopPrice, 82_900);
  });

  it("valid BEARISH geometry per stop contract", () => {
    assert.equal(stopGeometryValid("BEARISH", 86_000, 84_000, 82_000), true);
    const plan = buildEntryPlanFromSetup({
      setup: setup({
        directionalBias: "BEARISH",
        sourceScenario: {
          confidence: 1,
          startIndex: 10,
          endIndex: 20,
          startPrice: 84_000,
          endPrice: 82_000,
          evidence: [],
          limitations: [],
        },
        referenceLevels: [
          {
            kind: "SCENARIO_INVALIDATION",
            label: "inv",
            price: 86_000,
          },
        ],
      }),
      evaluationBar: BAR,
    }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(ref.stopPrice, 86_000);
  });

  it("invalid BULLISH geometry → INSUFFICIENT_CONTEXT", () => {
    assert.equal(stopGeometryValid("BULLISH", 84_500, 84_000, 86_000), false);
    const plan = buildEntryPlanFromSetup({
      setup: setup({
        referenceLevels: [
          { kind: "SCENARIO_INVALIDATION", label: "inv", price: 84_500 },
        ],
      }),
      evaluationBar: BAR,
    }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(ref.stopPrice, undefined);
    const reason = classifyStopFailureReason(plan, ref.rationale, ref.outcome);
    assert.equal(reason, "STOP_GEOMETRY_INVALID");
  });

  it("exact price preservation on AVAILABLE stop", () => {
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const diag = buildStopPlanDiagnostic({
      plan,
      setupId: setup().id,
      scanRow: {
        symbol: "BTCUSDT",
        timeframe: TF,
        scenarioId: "sc",
        role: "CANDIDATE",
        structure: "IMPULSE",
        waveLabel: "3",
        scenarioStatus: "ACTIVE",
        confidence: 1,
        startIndex: 10,
        endIndex: 20,
        startPrice: 84_000,
        endPrice: 86_000,
        invalidation: {
          available: true,
          price: 82_900,
          source: "TRACK_SCOPE",
          rule: "test",
        },
        evidence: [],
        limitations: [],
      },
    });
    assert.equal(diag.stopPrice, 82_900);
    assert.equal(diag.invalidationPrice, 82_900);
    assert.equal(diag.failureReason, "STOP_REFERENCE_AVAILABLE");
  });

  it("missing invalidation level → STOP_SOURCE_MISSING classification", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup({ referenceLevels: [] }),
      evaluationBar: BAR,
    }).plan!;
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(
      classifyStopFailureReason(plan, ref.rationale, ref.outcome),
      "STOP_SOURCE_MISSING"
    );
  });
});
