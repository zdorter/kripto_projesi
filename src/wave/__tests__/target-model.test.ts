import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { buildEntryModelReport } from "../setup/entry-model";
import {
  buildStopLossReport,
  stopReferencesAvailable,
} from "../setup/stop-loss-model";
import {
  buildTargetModelReport,
  evaluateTargetModel,
  targetReferencesAvailable,
} from "../setup/target-model";
import type { EntryPlanCandidate } from "../setup/entry-plan-types";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";

const TF = "1H";
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

function planWithObjectiveTarget(
  targetPrice: number,
  overrides: Partial<SetupCandidate> = {}
): EntryPlanCandidate {
  return eligiblePlan({
    ...overrides,
    referenceLevels: [
      ...baseSetup().referenceLevels,
      {
        kind: "EXPLICIT_OBJECTIVE_TARGET",
        label: "Objective target",
        price: targetPrice,
        note: "SCAN_OBJECTIVE_TARGET",
      },
    ],
  });
}

describe("target-model 14D.4 contract", () => {
  it("A: eligible setup + EXPLICIT_OBJECTIVE_TARGET → TARGET_REFERENCE_AVAILABLE", () => {
    const plan = planWithObjectiveTarget(120);
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "TARGET_REFERENCE_AVAILABLE");
    assert.equal(ref.targetPrice, 120);
  });

  it("B: no objective target level → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan();
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(ref.targetPrice, undefined);
  });

  it("C: setup not CONFIRMED → no target reference", () => {
    const patched = {
      ...eligiblePlan(),
      eligibility: {
        eligible: false,
        reason: "SETUP_NOT_CONFIRMED" as const,
        detail: "x",
      },
    };
    assert.equal(targetReferencesAvailable(buildTargetModelReport({ plan: patched }).report).length, 0);
  });

  it("D: setup INVALID / triggered → INSUFFICIENT_CONTEXT", () => {
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
            detail: "t",
          },
        ],
      },
    };
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", {
      plan: invalidated,
    });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("E: segment end is not promoted to target", () => {
    const plan = eligiblePlan({
      referenceLevels: [{ kind: "SEGMENT_END", label: "end", price: 110, index: 2 }],
    });
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("F: BULLISH geometry", () => {
    const plan = planWithObjectiveTarget(115);
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "TARGET_REFERENCE_AVAILABLE");
    assert.ok(ref.targetPrice! > 110);
  });

  it("G: BEARISH geometry", () => {
    const plan = planWithObjectiveTarget(90, {
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
    });
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "TARGET_REFERENCE_AVAILABLE");
    assert.ok(ref.targetPrice! < 100);
  });

  it("H: null directional bias → no guessing", () => {
    const plan = planWithObjectiveTarget(120, {
      directionalBias: null,
      directionalBasis: null,
    });
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("I: non-finite target → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        {
          kind: "EXPLICIT_OBJECTIVE_TARGET",
          label: "t",
          price: Number.NaN,
        },
      ],
    });
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("J: no candles / external fetch in target module", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/target-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("candles"));
    assert.ok(!text.includes("binance"));
  });

  it("K: no candles.length - 1 in target module", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/target-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("length - 1"));
  });

  it("L: no RR / Fib projection / percent target math", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/target-model.ts"),
      "utf8"
    );
    const forbidden = ["riskReward", "fibonacci", "1R", "2R", "percentTarget", "computeAtr"];
    for (const token of forbidden) {
      assert.ok(!text.toLowerCase().includes(token.toLowerCase()), token);
    }
  });

  it("M: independent of entry model", () => {
    const plan = planWithObjectiveTarget(120);
    const targetBefore = buildTargetModelReport({ plan });
    buildEntryModelReport({ plan, priceContext: { candles: [] } });
    const targetAfter = buildTargetModelReport({ plan });
    assert.deepEqual(targetBefore, targetAfter);
  });

  it("N: independent of stop loss model", () => {
    const plan = planWithObjectiveTarget(120);
    const target = buildTargetModelReport({ plan });
    const stop = buildStopLossReport({ plan });
    assert.equal(targetReferencesAvailable(target.report)[0].targetPrice, 120);
    assert.equal(stopReferencesAvailable(stop.report)[0]?.stopPrice, 95);
  });

  it("O/P: deterministic output", () => {
    const plan = planWithObjectiveTarget(120);
    const a = buildTargetModelReport({ plan });
    const b = buildTargetModelReport({ plan });
    assert.deepEqual(a, b);
  });

  it("Q/R: no ranking or best target fields", () => {
    const { report } = buildTargetModelReport({ plan: planWithObjectiveTarget(120) });
    for (const r of report.references) {
      assert.ok(!("rank" in r));
      assert.ok(!("best" in r));
      assert.ok(!("probability" in r));
    }
  });

  it("S: limitations state not executable TP order", () => {
    const { report } = buildTargetModelReport({ plan: planWithObjectiveTarget(120) });
    assert.ok(
      report.limitations.some((l) => l.includes("not an executable take-profit"))
    );
  });

  it("bullish geometry fail → INSUFFICIENT_CONTEXT", () => {
    const plan = planWithObjectiveTarget(105);
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("invalidation level is not used as target", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        { kind: "SCENARIO_INVALIDATION", label: "inv", price: 200 },
      ],
    });
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });
});
