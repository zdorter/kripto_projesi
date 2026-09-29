import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  buildEntryModelReport,
  entryReferencesAvailable,
  evaluateEntryModel,
} from "../setup/entry-model";
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
      conditions: [],
      summary: "inv",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_START", label: "start", price: 100, index: 0 },
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

const PRICE_CTX = {
  candles: [candle(0, 100), candle(1, 105), candle(2, 108)],
};

describe("entry-model 14D.2 contract", () => {
  it("A: eligible Entry Plan + price context → entry references", () => {
    const plan = eligiblePlan();
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    const available = entryReferencesAvailable(report);
    assert.equal(available.length, 2);
    assert.ok(available.some((r) => r.modelId === "EVALUATION_CLOSE"));
    assert.ok(available.some((r) => r.modelId === "SEGMENT_ENDPOINT"));
  });

  it("B: ineligible Entry Plan → no entry references", () => {
    const setup = baseSetup({ status: "CANDIDATE" });
    const { plan } = buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(plan, null);
    const patched = {
      ...eligiblePlan(),
      eligibility: {
        eligible: false,
        reason: "SETUP_NOT_CONFIRMED" as const,
        detail: "x",
      },
    };
    const { report } = buildEntryModelReport({ plan: patched, priceContext: PRICE_CTX });
    assert.equal(report.references.length, 0);
  });

  it("C: missing closed-bar boundary → INSUFFICIENT_CONTEXT on models", () => {
    const plan = eligiblePlan();
    const broken = {
      ...plan,
      evaluationBar: {
        ...plan.evaluationBar,
        boundaryEstablished: false,
        evaluationBarIndex: -1,
      },
    };
    const { report } = buildEntryModelReport({ plan: broken, priceContext: PRICE_CTX });
    assert.equal(entryReferencesAvailable(report).length, 0);
    for (const r of report.references) {
      assert.equal(r.outcome, "INSUFFICIENT_CONTEXT");
    }
  });

  it("D: evaluation-close uses established evaluation bar index", () => {
    const plan = eligiblePlan();
    const ref = evaluateEntryModel("EVALUATION_CLOSE", {
      plan,
      priceContext: PRICE_CTX,
    });
    assert.equal(ref.outcome, "ENTRY_REFERENCE_AVAILABLE");
    assert.equal(ref.referenceBarIndex, 2);
    assert.equal(ref.referencePrice, 108);
  });

  it("E: evaluation-close does not use open tail beyond evaluation bar", () => {
    const candles = [candle(0, 100), candle(1, 105), candle(2, 108)];
    const plan = eligiblePlan();
    const ref = evaluateEntryModel("EVALUATION_CLOSE", {
      plan,
      priceContext: { candles },
    });
    assert.equal(ref.referenceBarIndex, 2);
    assert.notEqual(ref.referencePrice, candles[candles.length - 1].close + 999);
    const planAt1 = buildEntryPlanFromSetup({
      setup: baseSetup(),
      evaluationBar: {
        evaluationBarIndex: 1,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "explicit before open tail",
      },
    }).plan!;
    const ref1 = evaluateEntryModel("EVALUATION_CLOSE", {
      plan: planAt1,
      priceContext: { candles },
    });
    assert.equal(ref1.referenceBarIndex, 1);
    assert.equal(ref1.referencePrice, 105);
  });

  it("F: segment endpoint model is deterministic", () => {
    const plan = eligiblePlan();
    const a = evaluateEntryModel("SEGMENT_ENDPOINT", { plan });
    const b = evaluateEntryModel("SEGMENT_ENDPOINT", { plan });
    assert.deepEqual(a, b);
    assert.equal(a.referencePrice, 110);
    assert.equal(a.referenceLevelKind, "SEGMENT_END");
  });

  it("G: missing price context → evaluation-close INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan();
    const ref = evaluateEntryModel("EVALUATION_CLOSE", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("H: direction preserved on references", () => {
    const plan = eligiblePlan({ directionalBias: "BEARISH" });
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.ok(report.references.every((r) => r.directionalBias === "BEARISH"));
  });

  it("I: Wave 5 does not create direction on references", () => {
    const plan = eligiblePlan({
      scenarioRef: {
        ...baseSetup().scenarioRef,
        waveLabel: "5",
      },
      directionalBias: null,
      directionalBasis: null,
    });
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.ok(report.references.every((r) => r.directionalBias === null));
  });

  it("J: Wave C does not create direction on references", () => {
    const plan = eligiblePlan({
      setupTypeId: "correction-end",
      scenarioRef: {
        ...baseSetup().scenarioRef,
        structure: "CORRECTIVE",
        waveLabel: "C",
      },
      directionalBias: null,
      directionalBasis: null,
    });
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.ok(report.references.every((r) => r.directionalBias === null));
  });

  it("K: invalidation level is not used as entry reference", () => {
    const plan = eligiblePlan();
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    for (const r of entryReferencesAvailable(report)) {
      assert.notEqual(r.referencePrice, 95);
    }
    const seg = evaluateEntryModel("SEGMENT_ENDPOINT", { plan });
    assert.notEqual(seg.referencePrice, 95);
  });

  it("L: no Fibonacci entry model in catalog", () => {
    const plan = eligiblePlan();
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.ok(report.references.every((r) => r.modelId !== "FIBONACCI_REFERENCE"));
    assert.equal(report.references.length, 2);
  });

  it("M: entry-model module does not import providers", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/entry-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("binance"));
    assert.ok(!text.includes("fetchBinance"));
    assert.ok(!text.includes("ohlcv"));
  });

  it("N: no wave engine import in entry-model", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/entry-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("analyzeWave"));
    assert.ok(!text.includes("runWaveScan"));
  });

  it("O/P: no scanner/diagnostics import", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/entry-model.ts"),
      "utf8"
    );
    assert.ok(!text.includes("wave-scanner"));
    assert.ok(!text.includes("wave-diagnostics"));
    assert.ok(!text.includes("analysis-pipeline"));
  });

  it("Q: deterministic repeated evaluation", () => {
    const plan = eligiblePlan();
    const input = { plan, priceContext: PRICE_CTX };
    assert.deepEqual(buildEntryModelReport(input), buildEntryModelReport(input));
  });

  it("R: multiple models coexist without ranking fields", () => {
    const plan = eligiblePlan();
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.equal(report.references.length, 2);
    assert.equal(report.references[0].modelId, "EVALUATION_CLOSE");
    assert.equal(report.references[1].modelId, "SEGMENT_ENDPOINT");
    for (const r of report.references) {
      assert.ok(!("rank" in r));
      assert.ok(!("probability" in r));
      assert.ok(!("score" in r));
    }
  });

  it("S: source Entry Plan unchanged after entry model build", () => {
    const plan = eligiblePlan();
    const before = JSON.stringify(plan);
    buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.equal(JSON.stringify(plan), before);
  });

  it("segment end after evaluation bar → INSUFFICIENT_CONTEXT", () => {
    const plan = eligiblePlan({
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 110, index: 5 },
      ],
      sourceScenario: { ...baseSetup().sourceScenario, endIndex: 5 },
    });
    const ref = evaluateEntryModel("SEGMENT_ENDPOINT", { plan });
    assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("correction-end setup type uses same model catalog", () => {
    const plan = eligiblePlan({ setupTypeId: "correction-end" });
    const { report } = buildEntryModelReport({ plan, priceContext: PRICE_CTX });
    assert.equal(report.references.length, 2);
  });
});
