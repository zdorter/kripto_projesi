import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  buildEntryModelReport,
  entryReferencesAvailable,
} from "../setup/entry-model";
import {
  buildStopLossReport,
  evaluateStopLossModel,
  stopReferencesAvailable,
} from "../setup/stop-loss-model";
import type { EntryPlanCandidate } from "../setup/entry-plan-types";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { Candle } from "../types";

const TF = "1H";
const CLOSED_BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "closedSeriesOnly attestation",
};

function candle(i: number, close: number): Candle {
  return { time: i * 60_000, open: close, high: close + 1, low: close - 1, close, volume: 1 };
}

function baseSetup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc1",
    symbol: "BTCUSDT",
    timeframe: TF,
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
      summary: "structural invalidation view",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_START", label: "start", price: 100, index: 0 },
      { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
      {
        kind: "SCENARIO_INVALIDATION",
        label: "Scenario invalidation",
        price: 95,
        note: "FOCUS_LEG",
      },
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

const PRICE_CTX = {
  candles: [candle(0, 100), candle(1, 105), candle(2, 108)],
};

describe("stop-loss-model 14D.3 contract", () => {
  it("A: eligible confirmed setup + exact invalidation → STOP_REFERENCE_AVAILABLE", () => {
    const plan = eligiblePlan();
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(ref.stopPrice, 95);
    assert.equal(ref.referenceKind, "SCENARIO_INVALIDATION");
  });

  it("B: invalidation missing → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
      ],
      invalidation: {
        conditions: [],
        summary: "none",
        usesScenarioInvalidation: false,
      },
    });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(ref.stopPrice, undefined);
  });

  it("C: setup not CONFIRMED → no stop reference", () => {
    const plan = {
      ...eligiblePlan(),
      setupRef: {
        ...eligiblePlan().setupRef,
        sourceSetupStatus: "CANDIDATE" as const,
      },
      eligibility: {
        eligible: false,
        reason: "SETUP_NOT_CONFIRMED" as const,
        detail: "x",
      },
    };
    const { report } = buildStopLossReport({ plan });
    assert.equal(stopReferencesAvailable(report).length, 0);
  });

  it("D: setup INVALID → stop reference not produced", () => {
    const plan = eligiblePlan();
    const invalidated = {
      ...plan,
      setupRef: { ...plan.setupRef, sourceSetupStatus: "INVALID" as const },
      invalidation: {
        ...plan.invalidation,
        conditions: [
          {
            conditionId: "setup-invalidation-triggered",
            outcome: "MET",
            detail: "triggered",
          },
        ],
      },
    };
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan: invalidated,
    });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("E: structural invalidation view distinct from stop reference outcome", () => {
    const plan = eligiblePlan();
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(plan.invalidation.summary, "structural invalidation view");
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.ok(
      ref.limitations.some((l) =>
        l.includes("not structural invalidation redefinition")
      )
    );
  });

  it("F: BULLISH directional geometry", () => {
    const plan = eligiblePlan({ directionalBias: "BULLISH" });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.ok(ref.stopPrice! < plan.sourceScenario.startPrice);
  });

  it("G: BEARISH directional geometry", () => {
    const plan = eligiblePlan({
      directionalBias: "BEARISH",
      sourceScenario: {
        confidence: 80,
        startIndex: 0,
        endIndex: 2,
        startPrice: 110,
        endPrice: 100,
        evidence: [],
        limitations: [],
      },
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 100, index: 2 },
        {
          kind: "SCENARIO_INVALIDATION",
          label: "inv",
          price: 115,
          note: "track",
        },
      ],
    });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.ok(ref.stopPrice! > 110);
  });

  it("H: null directional bias → no guessing", () => {
    const plan = eligiblePlan({ directionalBias: null, directionalBasis: null });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(ref.stopPrice, undefined);
  });

  it("I: non-finite invalidation price → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        {
          kind: "SCENARIO_INVALIDATION",
          label: "inv",
          price: Number.NaN,
        },
      ],
    });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("J: stop model does not read candles or external snapshot", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("priceContext"));
    assert.ok(!text.includes("candles"));
  });

  it("K: no candles.length - 1 assumption in stop-loss module", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("length - 1"));
  });

  it("L: no buffer/ATR/tick hidden calculations", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts"),
      "utf8"
    );
    const forbidden = ["tickSize", "riskPercent", "computeAtr", "averageTrueRange"];
    for (const token of forbidden) {
      assert.ok(!text.includes(token), token);
    }
  });

  it("M: entry model and stop model are independent", () => {
    const plan = eligiblePlan();
    const entry = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    const stop = buildStopLossReport({ plan });
    assert.equal(entryReferencesAvailable(entry.report).length, 2);
    assert.equal(stopReferencesAvailable(stop.report).length, 1);
    assert.equal(entryReferencesAvailable(entry.report)[0].referencePrice, 108);
    assert.equal(stopReferencesAvailable(stop.report)[0].stopPrice, 95);
  });

  it("N/O: deterministic output", () => {
    const plan = eligiblePlan();
    const a = buildStopLossReport({ plan });
    const b = buildStopLossReport({ plan });
    assert.deepEqual(a, b);
  });

  it("P: no ranking fields on stop references", () => {
    const { report } = buildStopLossReport({ plan: eligiblePlan() });
    for (const r of report.references) {
      assert.ok(!("rank" in r));
      assert.ok(!("best" in r));
      assert.ok(!("probability" in r));
    }
  });

  it("bullish geometry fail → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        {
          kind: "SCENARIO_INVALIDATION",
          label: "inv",
          price: 101,
        },
      ],
    });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("does not use segment start/end as stop price", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        { kind: "SEGMENT_START", label: "start", price: 100, index: 0 },
        { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
      ],
      invalidation: {
        conditions: [],
        summary: "x",
        usesScenarioInvalidation: true,
      },
    });
    const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("source Entry Plan unchanged after stop report", () => {
    const plan = eligiblePlan();
    const before = JSON.stringify(plan);
    buildStopLossReport({ plan });
    assert.equal(JSON.stringify(plan), before);
  });
});
