import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ENTRY_MODEL_SCHEMA_VERSION } from "../setup/entry-model-types";
import type { EntryPriceReference } from "../setup/entry-model-types";
import { STOP_LOSS_MODEL_SCHEMA_VERSION } from "../setup/stop-loss-model-types";
import type { StopLossReference } from "../setup/stop-loss-model-types";
import { TARGET_MODEL_SCHEMA_VERSION } from "../setup/target-model-types";
import type { TargetReference } from "../setup/target-model-types";
import {
  buildRiskRewardReport,
  evaluateRiskRewardModel,
  riskRewardReferencesAvailable,
} from "../setup/risk-reward-model";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { buildEntryModelReport } from "../setup/entry-model";
import { buildStopLossReport } from "../setup/stop-loss-model";
import { buildTargetModelReport } from "../setup/target-model";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";

function entryRef(
  price: number,
  bias: "BULLISH" | "BEARISH" = "BULLISH"
): EntryPriceReference {
  return {
    schemaVersion: ENTRY_MODEL_SCHEMA_VERSION,
    modelId: "EVALUATION_CLOSE",
    modelLabel: "Evaluation bar close",
    outcome: "ENTRY_REFERENCE_AVAILABLE",
    entryPlanId: "p:entry-plan",
    setupTypeId: "impulse-continuation",
    directionalBias: bias,
    referencePrice: price,
    rationale: "test",
    limitations: [],
  };
}

function stopRef(
  price: number,
  bias: "BULLISH" | "BEARISH" = "BULLISH"
): StopLossReference {
  return {
    schemaVersion: STOP_LOSS_MODEL_SCHEMA_VERSION,
    modelId: "SCENARIO_INVALIDATION_REFERENCE",
    modelLabel: "Stop",
    outcome: "STOP_REFERENCE_AVAILABLE",
    entryPlanId: "p:entry-plan",
    setupTypeId: "impulse-continuation",
    directionalBias: bias,
    stopPrice: price,
    referenceSource: "test",
    rationale: "test",
    limitations: [],
  };
}

function targetRef(
  price: number,
  bias: "BULLISH" | "BEARISH" = "BULLISH"
): TargetReference {
  return {
    schemaVersion: TARGET_MODEL_SCHEMA_VERSION,
    modelId: "STRUCTURAL_TARGET_REFERENCE",
    modelLabel: "Target",
    outcome: "TARGET_REFERENCE_AVAILABLE",
    entryPlanId: "p:entry-plan",
    setupTypeId: "impulse-continuation",
    directionalBias: bias,
    targetPrice: price,
    referenceSource: "test",
    rationale: "test",
    limitations: [],
  };
}

describe("risk-reward-model 14D.5 contract", () => {
  it("A: BULLISH valid references → RR_REFERENCE_AVAILABLE", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "RR_REFERENCE_AVAILABLE");
    assert.equal(rr.riskAmount, 1100);
    assert.equal(rr.rewardAmount, 3500);
    assert.equal(rr.riskRewardRatio, 3500 / 1100);
  });

  it("B: BEARISH valid references → RR_REFERENCE_AVAILABLE", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000, "BEARISH"),
      stop: stopRef(85_000, "BEARISH"),
      target: targetRef(81_000, "BEARISH"),
    });
    assert.equal(rr.outcome, "RR_REFERENCE_AVAILABLE");
    assert.equal(rr.riskAmount, 1000);
    assert.equal(rr.rewardAmount, 3000);
    assert.equal(rr.riskRewardRatio, 3);
  });

  it("C: entry missing → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("D: stop missing → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("E: target missing → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("F: entry outcome unavailable → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: { ...entryRef(84_000), outcome: "INSUFFICIENT_CONTEXT" },
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("G: stop outcome unavailable → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: { ...stopRef(82_900), outcome: "INSUFFICIENT_CONTEXT" },
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("H: target outcome unavailable → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: { ...targetRef(87_500), outcome: "INSUFFICIENT_CONTEXT" },
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("I: direction null → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: { ...entryRef(84_000), directionalBias: null },
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("J: BULLISH geometry invalid → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(85_000),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("K: BEARISH geometry invalid → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000, "BEARISH"),
      stop: stopRef(83_000, "BEARISH"),
      target: targetRef(81_000, "BEARISH"),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("L: risk zero → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(84_000),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("M: reward zero → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: targetRef(84_000),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("N: risk negative (implicit invalid geometry) → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(80_000),
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("O: reward negative (implicit) → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: targetRef(80_000),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("P: NaN prices → INSUFFICIENT_CONTEXT", () => {
    const rr = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", {
      entry: { ...entryRef(84_000), referencePrice: Number.NaN },
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    assert.equal(rr.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("Q/R/S: formula correctness and determinism", () => {
    const input = {
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: targetRef(87_500),
    };
    const a = buildRiskRewardReport(input);
    const b = buildRiskRewardReport(input);
    assert.deepEqual(a, b);
    assert.equal(a.report.references[0].riskRewardRatio, 3500 / 1100);
  });

  it("T: no quality/ranking fields on output", () => {
    const { report } = buildRiskRewardReport({
      entry: entryRef(84_000),
      stop: stopRef(82_900),
      target: targetRef(87_500),
    });
    for (const r of report.references) {
      assert.ok(!("rank" in r));
      assert.ok(!("good" in r));
      assert.ok(!("probability" in r));
    }
  });

  it("module does not import entry/stop/target model implementations", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/risk-reward-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("entry-model.ts"));
    assert.ok(!text.includes("stop-loss-model.ts"));
    assert.ok(!text.includes("target-model.ts"));
    assert.ok(!text.includes("evaluateEntryModel"));
    assert.ok(!text.includes("evaluateStopLossModel"));
    assert.ok(!text.includes("evaluateTargetModel"));
  });

  it("integration: real pipeline without target → RR INSUFFICIENT_CONTEXT", () => {
    const setup: SetupCandidate = {
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
      setupTypeLabel: "Impulse",
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
        summary: "x",
        usesScenarioInvalidation: true,
      },
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 110, index: 2 },
        {
          kind: "SCENARIO_INVALIDATION",
          label: "inv",
          price: 82_900,
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
      context: {},
      setupLimitations: [],
      evaluationNotes: [],
    };
    const { plan } = buildEntryPlanFromSetup({
      setup,
      evaluationBar: {
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "c",
      },
    });
    assert.ok(plan);
    const candles = [
      { time: 0, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
      { time: 1, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
      { time: 2, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
    ];
    const entryReport = buildEntryModelReport({
      plan: plan!,
      priceContext: { candles },
    });
    const stopReport = buildStopLossReport({ plan: plan! });
    const targetReport = buildTargetModelReport({ plan: plan! });
    const entry = entryReport.report.references.find(
      (r) => r.outcome === "ENTRY_REFERENCE_AVAILABLE"
    );
    const stop = stopReport.report.references.find(
      (r) => r.outcome === "STOP_REFERENCE_AVAILABLE"
    );
    const target = targetReport.report.references.find(
      (r) => r.outcome === "TARGET_REFERENCE_AVAILABLE"
    );
    assert.ok(entry);
    assert.equal(target, undefined);
    const rr = buildRiskRewardReport({ entry, stop, target });
    assert.equal(riskRewardReferencesAvailable(rr.report).length, 0);
  });

  it("Z/AA/AB: upstream model outputs unchanged after RR build", () => {
    const entry = entryRef(84_000);
    const stop = stopRef(82_900);
    const target = targetRef(87_500);
    const before = JSON.stringify({ entry, stop, target });
    buildRiskRewardReport({ entry, stop, target });
    assert.equal(JSON.stringify({ entry, stop, target }), before);
  });
});
