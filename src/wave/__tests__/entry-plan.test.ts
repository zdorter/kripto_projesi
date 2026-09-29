import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildEntryPlanFromSetup,
  buildEntryPlansFromSetupReport,
  evaluationBarSourceFromBundle,
  resolveEntryPlanEligibility,
} from "../setup/entry-plan";
import { isEntryPlanEligibleSetup } from "../setup/setup-catalog";
import { detectSetups } from "../setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { runWaveScan } from "../wave-scanner";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

const CLOSED_BAR = {
  evaluationBarIndex: 42,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test closed boundary",
};

function baseSetup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:primary-impulse-5",
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioRef: {
      scenarioId: "primary-impulse-5",
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
      summary: "invalidation ok",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_START", label: "start", price: 100, index: 1 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 95 },
    ],
    sourceScenario: {
      confidence: 80,
      startIndex: 1,
      endIndex: 10,
      startPrice: 100,
      endPrice: 110,
      evidence: ["e1"],
      limitations: ["l1"],
    },
    context: { mtfRelationshipKind: "ALIGNED" },
    setupLimitations: ["setup lim"],
    evaluationNotes: ["note"],
    ...overrides,
  };
}

describe("entry-plan 14D.1 contract", () => {
  it("A: confirmed trade setup → eligible Entry Plan", () => {
    const setup = baseSetup();
    const { eligibility, plan } = buildEntryPlanFromSetup({
      setup,
      evaluationBar: CLOSED_BAR,
    });
    assert.equal(eligibility.reason, "ENTRY_PLAN_ELIGIBLE");
    assert.ok(plan);
    assert.equal(plan!.setupRef.sourceSetupStatus, "CONFIRMED");
    assert.equal(plan!.setupRef.setupId, setup.id);
  });

  it("B: candidate trade setup → no Entry Plan", () => {
    const setup = baseSetup({ status: "CANDIDATE" });
    const r = buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(r.plan, null);
    assert.equal(r.eligibility.reason, "SETUP_NOT_CONFIRMED");
  });

  it("C: invalid trade setup → no Entry Plan", () => {
    const setup = baseSetup({ status: "INVALID" });
    const r = buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(r.plan, null);
    assert.equal(r.eligibility.reason, "SETUP_INVALID");
  });

  it("D: insufficient-context setup → no Entry Plan", () => {
    const setup = baseSetup({ status: "INSUFFICIENT_CONTEXT" });
    const r = buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(r.plan, null);
    assert.equal(r.eligibility.reason, "INSUFFICIENT_CONTEXT");
  });

  it("E: structural setup → no Entry Plan", () => {
    const setup = baseSetup({
      isTradeSetup: false,
      category: "STRUCTURAL_CONTEXT",
      setupTypeId: "impulse-wave-segment",
      status: "CONFIRMED",
    });
    const r = buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(r.plan, null);
    assert.equal(r.eligibility.reason, "NOT_TRADE_SETUP");
  });

  it("F: direction preserved BULLISH / BEARISH / null", () => {
    for (const bias of ["BULLISH", "BEARISH", null] as const) {
      const setup = baseSetup({ directionalBias: bias });
      const plan = buildEntryPlanFromSetup({
        setup,
        evaluationBar: CLOSED_BAR,
      }).plan;
      assert.equal(plan!.directionalBias, bias);
    }
  });

  it("G: Wave 5 label does not add direction beyond setup", () => {
    const setup = baseSetup({
      scenarioRef: {
        ...baseSetup().scenarioRef,
        waveLabel: "5",
      },
      directionalBias: null,
      directionalBasis: null,
    });
    const plan = buildEntryPlanFromSetup({
      setup,
      evaluationBar: CLOSED_BAR,
    }).plan;
    assert.equal(plan!.directionalBias, null);
    assert.equal(plan!.scenarioRef.waveLabel, "5");
  });

  it("H: Wave C label does not add direction beyond setup", () => {
    const setup = baseSetup({
      setupTypeId: "correction-end",
      scenarioRef: {
        ...baseSetup().scenarioRef,
        structure: "CORRECTIVE",
        waveLabel: "C",
      },
      directionalBias: null,
      directionalBasis: null,
    });
    const plan = buildEntryPlanFromSetup({
      setup,
      evaluationBar: CLOSED_BAR,
    }).plan;
    assert.equal(plan!.directionalBias, null);
    assert.equal(plan!.scenarioRef.waveLabel, "C");
  });

  it("I: evaluation bar preserved on plan", () => {
    const plan = buildEntryPlanFromSetup({
      setup: baseSetup(),
      evaluationBar: CLOSED_BAR,
    }).plan;
    assert.equal(plan!.evaluationBar.evaluationBarIndex, 42);
    assert.equal(plan!.evaluationBar.boundaryEstablished, true);
  });

  it("J: missing closed evaluation boundary → not eligible", () => {
    const setup = baseSetup();
    assert.equal(
      resolveEntryPlanEligibility(setup, undefined).reason,
      "CLOSED_BAR_NOT_ESTABLISHED"
    );
    assert.equal(
      buildEntryPlanFromSetup({ setup }).plan,
      null
    );
    assert.equal(
      resolveEntryPlanEligibility(setup, {
        evaluationBarIndex: 5,
        evaluationBarBoundaryEstablished: false,
        evaluationBarContractDetail: "open tail",
      }).reason,
      "CLOSED_BAR_NOT_ESTABLISHED"
    );
  });

  it("K: invalidation reference preserved", () => {
    const setup = baseSetup({
      invalidation: {
        conditions: [
          { conditionId: "setup-invalidation-triggered", outcome: "NOT_MET", detail: "ok" },
        ],
        summary: "structural inv",
        usesScenarioInvalidation: true,
      },
    });
    const plan = buildEntryPlanFromSetup({
      setup,
      evaluationBar: CLOSED_BAR,
    }).plan;
    assert.equal(plan!.invalidation.summary, "structural inv");
    assert.equal(plan!.invalidation.usesScenarioInvalidation, true);
    assert.equal(plan!.invalidation.conditions.length, 1);
  });

  it("L: scenario reference preserved", () => {
    const setup = baseSetup();
    const plan = buildEntryPlanFromSetup({
      setup,
      evaluationBar: CLOSED_BAR,
    }).plan;
    assert.deepEqual(plan!.scenarioRef, setup.scenarioRef);
  });

  it("M: multiple confirmed setups → multiple Entry Plans", () => {
    const s1 = baseSetup({ id: "a:1H:impulse-continuation:x1", setupTypeId: "impulse-continuation" });
    const s2 = baseSetup({
      id: "a:1H:correction-end:x2",
      setupTypeId: "correction-end",
      scenarioRef: { ...s1.scenarioRef, scenarioId: "alt-c", waveLabel: "C", structure: "CORRECTIVE" },
    });
    const report = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [s1, s2],
      candidateCount: 2,
      errors: [],
      limitations: [],
    };
    const built = buildEntryPlansFromSetupReport(report, {
      BTCUSDT: {
        timeframeId: TF,
        evaluationBarIndex: 10,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "closed",
        candleCount: 100,
        diagnostics: {} as never,
        presentation: {} as never,
      },
    });
    assert.equal(built.planCount, 2);
    assert.equal(built.plans.length, 2);
  });

  it("N: no ranking — plan order is deterministic lexicographic, not score", () => {
    const s1 = baseSetup({ id: "z:1H:impulse-continuation:z", setupTypeId: "impulse-continuation" });
    const s2 = baseSetup({ id: "a:1H:correction-end:a", setupTypeId: "correction-end" });
    const built = buildEntryPlansFromSetupReport(
      {
        schemaVersion: SETUP_SCHEMA_VERSION,
        timeframe: TF,
        symbols: ["BTCUSDT"],
        candidates: [s1, s2],
        candidateCount: 2,
        errors: [],
        limitations: [],
      },
      {
        BTCUSDT: {
          timeframeId: TF,
          evaluationBarIndex: 1,
          evaluationBarBoundaryEstablished: true,
          evaluationBarContractDetail: "c",
          candleCount: 2,
          diagnostics: {} as never,
          presentation: {} as never,
        },
      }
    );
    assert.equal(built.plans[0].setupTypeId, "correction-end");
    assert.ok(!("rank" in built.plans[0]));
    assert.ok(!("probability" in built.plans[0]));
  });

  it("O: source setup unchanged after Entry Plan creation", () => {
    const setup = baseSetup();
    const before = JSON.stringify(setup);
    buildEntryPlanFromSetup({ setup, evaluationBar: CLOSED_BAR });
    assert.equal(JSON.stringify(setup), before);
  });

  it("P: deterministic output", () => {
    const input = { setup: baseSetup(), evaluationBar: CLOSED_BAR };
    const a = buildEntryPlanFromSetup(input);
    const b = buildEntryPlanFromSetup(input);
    assert.deepEqual(a, b);
  });

  it("isEntryPlanEligibleSetup unchanged — bar gate is separate", () => {
    const setup = baseSetup();
    assert.equal(isEntryPlanEligibleSetup(setup), true);
    assert.equal(
      resolveEntryPlanEligibility(setup, undefined).eligible,
      false
    );
  });

  it("integration: demo detection produces zero plans when no CONFIRMED trade setup", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({ scanReport: scan, tradeContext: tradeCtx });
    const bundles = tradeCtx.bundlesBySymbol;
    const entry = buildEntryPlansFromSetupReport(report, bundles);
    const confirmed = report.candidates.filter(
      (c) => c.isTradeSetup && c.status === "CONFIRMED"
    );
    if (confirmed.length === 0) {
      assert.equal(entry.planCount, 0);
    } else {
      assert.equal(entry.planCount, confirmed.length);
    }
  });

  it("integration: structural candidates never appear in entry report", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const report = detectSetups({ scanReport: scan });
    const entry = buildEntryPlansFromSetupReport(report);
    assert.equal(entry.planCount, 0);
    assert.ok(report.candidates.some((c) => !c.isTradeSetup));
  });

  it("Q: entry-plan layer does not import wave engine or diagnostics", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/entry-plan.ts"),
      "utf8"
    );
    assert.ok(!text.includes("analyzeWaveWithDiagnostics"));
    assert.ok(!text.includes("runWaveScan"));
  });

  it("R: buildEntryPlansFromSetupReport does not recompute diagnostics", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const report = detectSetups({ scanReport: scan, tradeContext: tradeCtx });
    const a = buildEntryPlansFromSetupReport(report, tradeCtx.bundlesBySymbol);
    const b = buildEntryPlansFromSetupReport(report, tradeCtx.bundlesBySymbol);
    assert.deepEqual(a, b);
  });

  it("evaluationBarSourceFromBundle maps bundle fields", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const bundle = tradeCtx.bundlesBySymbol!.BTCUSDT;
    const src = evaluationBarSourceFromBundle(bundle);
    assert.ok(src?.evaluationBarBoundaryEstablished);
    assert.equal(src?.evaluationBarIndex, bundle.evaluationBarIndex);
  });
});
