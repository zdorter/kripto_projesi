import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { evaluateObjectiveTargetSource } from "../setup/objective-target-candidate-sources";
import {
  buildObjectiveTargetSourceContextForPlan,
  buildObjectiveTargetSourceContextBySetupId,
} from "../setup/objective-target-production-context";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";

const BAR = {
  evaluationBarIndex: 10,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

function bundle(swings: Array<{ index: number; type: "HIGH" | "LOW"; price: number }>): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex: 10,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    candleCount: 20,
    diagnostics: {
      confirmedSwings: swings.map((s) => ({
        ...s,
        time: s.index * 60_000,
        strength: 1,
      })),
      fibonacci: { available: true, rangeStart: 100, rangeEnd: 110 },
      trendSource: { marketTrend: "BULLISH", trendRuleSummary: "test" },
    } as SymbolEvaluationBundle["diagnostics"],
    presentation: {} as SymbolEvaluationBundle["presentation"],
  };
}

function setup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "sc1",
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
      conditions: [],
      summary: "x",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 5,
      endIndex: 8,
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

describe("objective target production context (14K)", () => {
  it("A: deterministic context from bundle", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup(),
      evaluationBar: BAR,
    }).plan!;
    const b = bundle([
      { index: 5, type: "LOW", price: 95 },
      { index: 12, type: "HIGH", price: 120 },
    ]);
    const ctx = buildObjectiveTargetSourceContextForPlan(plan, b);
    assert.equal(ctx.sourceProvenance, "ENGINE_DIAGNOSTICS");
    assert.equal(ctx.diagnostics?.confirmedSwings.length, 1);
    assert.equal(ctx.diagnostics?.confirmedSwings[0].index, 5);
  });

  it("E: no future swing in context", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup(),
      evaluationBar: BAR,
    }).plan!;
    const ctx = buildObjectiveTargetSourceContextForPlan(
      plan,
      bundle([{ index: 5, type: "LOW", price: 95 }])
    );
    assert.ok(
      ctx.diagnostics!.confirmedSwings.every((s) => s.index <= 10)
    );
  });

  it("F: fib projection insufficient without attestation", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup(),
      evaluationBar: BAR,
    }).plan!;
    const ctx = buildObjectiveTargetSourceContextForPlan(
      plan,
      bundle([{ index: 5, type: "LOW", price: 95 }])
    );
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: ctx,
    });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
    assert.ok(c.rationale.includes("attested") || c.rationale.includes("extension"));
  });

  it("H: previous swing exact index contract", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup(),
      evaluationBar: BAR,
    }).plan!;
    const ctx = buildObjectiveTargetSourceContextForPlan(
      plan,
      bundle([{ index: 5, type: "LOW", price: 120 }])
    );
    const c = evaluateObjectiveTargetSource("PREVIOUS_SWING", {
      plan,
      sourceContext: ctx,
    });
    assert.equal(c.outcome, "AVAILABLE");
    assert.equal(c.targetPrice, 120);
  });

  it("I: rejects swing after evaluation bar in source evaluator", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup({ sourceScenario: { ...setup().sourceScenario, startIndex: 12 } }),
      evaluationBar: BAR,
    }).plan!;
    const ctx = buildObjectiveTargetSourceContextForPlan(
      plan,
      bundle([{ index: 12, type: "HIGH", price: 120 }])
    );
    const c = evaluateObjectiveTargetSource("PREVIOUS_SWING", {
      plan,
      sourceContext: ctx,
    });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("R: per-setup context map isolation", () => {
    const p1 = buildEntryPlanFromSetup({
      setup: setup({ id: "a", sourceScenario: { ...setup().sourceScenario, startIndex: 5 } }),
      evaluationBar: BAR,
    }).plan!;
    const p2 = buildEntryPlanFromSetup({
      setup: setup({
        id: "b",
        symbol: "ETHUSDT",
        sourceScenario: { ...setup().sourceScenario, startIndex: 7 },
      }),
      evaluationBar: BAR,
    }).plan!;
    const map = buildObjectiveTargetSourceContextBySetupId(
      [p1, p2],
      {
        BTCUSDT: bundle([{ index: 5, type: "LOW", price: 90 }]),
        ETHUSDT: bundle([{ index: 7, type: "LOW", price: 80 }]),
      }
    );
    assert.ok(map[p1.setupRef.setupId]);
    assert.ok(map[p2.setupRef.setupId]);
    assert.notEqual(
      map[p1.setupRef.setupId].diagnostics?.confirmedSwings[0]?.price,
      map[p2.setupRef.setupId].diagnostics?.confirmedSwings[0]?.price
    );
  });

  it("B/C: production context module has no engine/binance", () => {
    const file = path.join(
      process.cwd(),
      "src/wave/setup/objective-target-production-context.ts"
    );
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!text.includes("analyzeWave"));
    assert.ok(!text.includes("runWaveScan"));
    assert.ok(!text.includes("binance"));
    assert.ok(!text.includes("fetch("));
  });
});
