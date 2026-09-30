import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  buildTradeSetupEvaluationSnapshot,
  resolveTradeSetupEvaluationState,
} from "../setup/trade-setup-evaluation";
import type { EntryPlanCandidate } from "../setup/entry-plan-types";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";

const CLOSED_BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "closedSeriesOnly attestation",
};

function baseSetup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "sc1",
      role: "PRIMARY",
      structure: "IMPULSE",
      waveLabel: "5",
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
      summary: "structural",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 95 },
    ],
    sourceScenario: {
      confidence: 80,
      startIndex: 0,
      endIndex: 2,
      startPrice: 100,
      endPrice: 110,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

function eligiblePlan(overrides: Partial<SetupCandidate> = {}): EntryPlanCandidate {
  const { plan } = buildEntryPlanFromSetup({
    setup: baseSetup(overrides),
    evaluationBar: CLOSED_BAR,
  });
  assert.ok(plan);
  return plan!;
}

/** Test-only synthetic triplet — not production pipeline output. */
function syntheticFullTripletPlan(): EntryPlanCandidate {
  return eligiblePlan({
    referenceLevels: [
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      {
        kind: "SCENARIO_INVALIDATION",
        label: "inv",
        price: 82_900,
      },
      {
        kind: "EXPLICIT_OBJECTIVE_TARGET",
        label: "Objective target (synthetic test fixture)",
        price: 87_500,
        note: "TEST_ONLY_OBJECTIVE_TARGET",
      },
    ],
    sourceScenario: {
      confidence: 1,
      startIndex: 0,
      endIndex: 2,
      startPrice: 83_000,
      endPrice: 84_500,
      evidence: [],
      limitations: [],
    },
  });
}

const SYNTHETIC_CANDLES = [
  { time: 0, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 1, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 2, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
];

describe("trade-setup-evaluation 14D.6 composition", () => {
  it("A: synthetic full triplet → RR AVAILABLE and READY_FOR_FURTHER_EVALUATION", () => {
    const plan = syntheticFullTripletPlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.selectedEntryReference?.outcome, "ENTRY_REFERENCE_AVAILABLE");
    assert.equal(snap.selectedEntryReference?.referencePrice, 84_000);
    assert.equal(snap.selectedStopLossReference?.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(snap.selectedStopLossReference?.stopPrice, 82_900);
    assert.equal(snap.selectedTargetReference?.outcome, "TARGET_REFERENCE_AVAILABLE");
    assert.equal(snap.selectedTargetReference?.targetPrice, 87_500);
    assert.equal(
      snap.selectedRiskRewardReference?.outcome,
      "RR_REFERENCE_AVAILABLE"
    );
    assert.equal(snap.selectedRiskRewardReference?.riskAmount, 1100);
    assert.equal(snap.selectedRiskRewardReference?.rewardAmount, 3500);
    assert.equal(snap.selectedRiskRewardReference?.riskRewardRatio, 3500 / 1100);
    assert.equal(snap.evaluationState, "READY_FOR_FURTHER_EVALUATION");
  });

  it("B: entry+stop AVAILABLE, target INSUFFICIENT → RR INSUFFICIENT, aggregate INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.selectedEntryReference?.outcome, "ENTRY_REFERENCE_AVAILABLE");
    assert.equal(snap.selectedStopLossReference?.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(
      snap.targetModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(
      snap.riskRewardModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
  });

  it("C: evaluation-close INSUFFICIENT without price context — orchestrator does not synthesize close", () => {
    const plan = eligiblePlan();
    const snap = buildTradeSetupEvaluationSnapshot({ plan });
    const evalClose = snap.entryModel.references.find(
      (r) => r.modelId === "EVALUATION_CLOSE"
    );
    assert.equal(evalClose?.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(evalClose?.referencePrice, undefined);
    assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
  });

  it("D: stop INSUFFICIENT_CONTEXT preserved (missing invalidation level)", () => {
    const plan = eligiblePlan({
      referenceLevels: [{ kind: "SEGMENT_END", label: "end", price: 110, index: 2 }],
    });
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(
      snap.stopLossModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(snap.selectedStopLossReference, null);
  });

  it("E: target INSUFFICIENT_CONTEXT — no fallback target in snapshot", () => {
    const plan = eligiblePlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(
      snap.targetModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(snap.selectedTargetReference, null);
  });

  it("F: RR INSUFFICIENT — orchestrator does not fabricate RR", () => {
    const plan = eligiblePlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.selectedRiskRewardReference, null);
    assert.equal(
      snap.riskRewardModel.references[0]?.riskRewardRatio,
      undefined
    );
  });

  it("G: setup INVALID → aggregate INVALID, empty producer outputs", () => {
    const base = eligiblePlan();
    const plan: EntryPlanCandidate = {
      ...base,
      setupRef: { ...base.setupRef, sourceSetupStatus: "INVALID" },
      invalidation: {
        ...base.invalidation,
        conditions: [
          {
            conditionId: "setup-invalidation-triggered",
            outcome: "MET",
            detail: "broken",
          },
        ],
      },
    };
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.evaluationState, "INVALID");
    assert.equal(snap.selectedStopLossReference, null);
    assert.equal(snap.selectedRiskRewardReference, null);
  });

  it("H: ineligible entry plan — no bypass", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: baseSetup({ isTradeSetup: false, category: "STRUCTURAL_CONTEXT" }),
      evaluationBar: CLOSED_BAR,
    });
    assert.equal(plan, null);
    const ineligible = eligiblePlan();
    const patched: EntryPlanCandidate = {
      ...ineligible,
      eligibility: {
        eligible: false,
        reason: "NOT_TRADE_SETUP",
        detail: "test",
      },
    };
    const snap = buildTradeSetupEvaluationSnapshot({
      plan: patched,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.entryModel.references.length, 0);
    assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
  });

  it("I: closed evaluation bar from entry plan preserved", () => {
    const plan = eligiblePlan();
    const snap = buildTradeSetupEvaluationSnapshot({ plan });
    assert.equal(snap.entryPlan.evaluationBar.evaluationBarIndex, 2);
    assert.equal(snap.entryPlan.evaluationBar.boundaryEstablished, true);
  });

  it("J: composition module does not use candles.length - 1 fallback", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/trade-setup-evaluation.ts"),
      "utf8"
    );
    assert.ok(!text.includes("candles.length - 1"));
  });

  it("K: same input → same snapshot", () => {
    const plan = syntheticFullTripletPlan();
    const a = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    const b = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("L: upstream plan and references not mutated", () => {
    const plan = syntheticFullTripletPlan();
    const beforePlan = JSON.stringify(plan);
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    const refsBefore = JSON.stringify({
      entry: snap.selectedEntryReference,
      stop: snap.selectedStopLossReference,
      target: snap.selectedTargetReference,
    });
    buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(JSON.stringify(plan), beforePlan);
    assert.equal(
      JSON.stringify({
        entry: snap.selectedEntryReference,
        stop: snap.selectedStopLossReference,
        target: snap.selectedTargetReference,
      }),
      refsBefore
    );
  });

  it("M: trace IDs preserved on selected references", () => {
    const plan = syntheticFullTripletPlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(snap.selectedEntryReference?.entryPlanId, plan.id);
    assert.equal(snap.selectedEntryReference?.setupTypeId, plan.setupTypeId);
    assert.equal(snap.selectedStopLossReference?.entryPlanId, plan.id);
    assert.equal(snap.selectedTargetReference?.setupTypeId, plan.setupTypeId);
    assert.equal(snap.entryPlan.scenarioRef.scenarioId, "sc1");
  });

  it("N–S: aggregate state is non-signal vocabulary only", () => {
    const plan = syntheticFullTripletPlan();
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    const states = [
      "READY_FOR_FURTHER_EVALUATION",
      "INSUFFICIENT_CONTEXT",
      "INVALID",
    ];
    assert.ok(states.includes(snap.evaluationState));
    assert.equal(
      typeof snap.evaluationState,
      "string"
    );
    for (const forbidden of ["BUY", "SELL", "LONG", "SHORT"]) {
      assert.ok(!snap.evaluationState.includes(forbidden));
    }
  });

  it("T: orchestrator does not reimplement RR formula", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/trade-setup-evaluation.ts"),
      "utf8"
    );
    assert.ok(!text.includes("riskAmount"));
    assert.ok(!text.includes("rewardAmount"));
    assert.ok(!text.includes("riskRewardRatio"));
    assert.ok(text.includes("buildRiskRewardReport"));
  });

  it("integration: real pipeline without objective target → target and RR INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
        {
          kind: "SCENARIO_INVALIDATION",
          label: "inv",
          price: 82_900,
        },
      ],
    });
    const snap = buildTradeSetupEvaluationSnapshot({
      plan,
      priceContext: { candles: SYNTHETIC_CANDLES },
    });
    assert.equal(
      snap.targetModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(
      snap.riskRewardModel.references[0]?.outcome,
      "INSUFFICIENT_CONTEXT"
    );
    assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
  });

  it("resolveTradeSetupEvaluationState respects INVALID plan", () => {
    const base = eligiblePlan();
    const plan: EntryPlanCandidate = {
      ...base,
      setupRef: { ...base.setupRef, sourceSetupStatus: "INVALID" },
    };
    assert.equal(
      resolveTradeSetupEvaluationState(plan, true),
      "INVALID"
    );
  });
});
