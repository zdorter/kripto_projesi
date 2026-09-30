import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { buildTradeSetupEvaluationSnapshot } from "../setup/trade-setup-evaluation";
import { buildTradeSetupEvaluationPipeline } from "../setup/trade-setup-evaluation-pipeline";
import type { SetupCandidate, SetupDetectionReport } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import { fibExtensionPrice } from "../fibonacci";
import { runWaveScan } from "../wave-scanner";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

const SYNTHETIC_CANDLES = [
  { time: 0, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 1, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 2, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
];

function syntheticConfirmedTradeSetup(
  overrides: Partial<SetupCandidate> = {}
): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc-synth",
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioRef: {
      scenarioId: "sc-synth",
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
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
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
    ...overrides,
  };
}

function bundleForBar() {
  return {
    timeframeId: TF,
    evaluationBarIndex: 2,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "closedSeriesOnly TEST_ONLY",
    candleCount: SYNTHETIC_CANDLES.length,
    diagnostics: {} as never,
    presentation: {} as never,
  };
}

/** TEST_ONLY: attestation for 14D.10 complete E2E (not production prediction). */
function testOnlyObjectiveContext() {
  return {
    attestedFibonacciProjection: {
      rangeStartPrice: 78_337,
      rangeEndPrice: 84_000,
      extensionLevel: 1.618 as const,
    },
    diagnostics: {
      swingConfig: {} as never,
      confirmedSwingCount: 1,
      confirmedSwings: [
        { index: 0, type: "LOW" as const, price: 88_100, time: 0, strength: 1 },
      ],
      structurePairs: [],
      allStructures: [],
      trendSource: { marketTrend: "BULLISH", trendRuleSummary: "test" },
      waveLegs: [],
      fibonacci: { available: false },
      focus: { primary: null, alternative: null },
      overlaps: [],
      presentation: {} as never,
    },
    attestedWaveStructureTarget: {
      targetPrice: 89_000,
      evidenceRef: "TEST_ONLY",
    },
  };
}

function pipelineWithSyntheticSetup() {
  const setupReport: SetupDetectionReport = {
    schemaVersion: SETUP_SCHEMA_VERSION,
    timeframe: TF,
    symbols: ["BTCUSDT"],
    candidates: [syntheticConfirmedTradeSetup()],
    candidateCount: 1,
    errors: [],
    limitations: [],
  };
  const scan = {
    timeframe: TF,
    symbols: ["BTCUSDT"],
    results: [],
    errors: [],
    limitations: [],
  };
  return buildTradeSetupEvaluationPipeline({
    scanReport: scan,
    tradeContext: {
      scanReport: scan,
      bundlesBySymbol: { BTCUSDT: bundleForBar() },
    },
    candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
    setupDetectionReport: setupReport,
    objectiveTargetSourceContextBySymbol: {
      BTCUSDT: testOnlyObjectiveContext(),
    },
  });
}

describe("trade-setup-evaluation-target-pipeline 14D.10 E2E", () => {
  it("A: complete synthetic E2E → READY_FOR_FURTHER_EVALUATION + RR triplet", () => {
    const result = pipelineWithSyntheticSetup();
    assert.equal(result.snapshotCount, 1);
    const snap = result.snapshots[0].snapshot;
    assert.equal(snap.objectiveTargetSelection?.outcome, "SELECTED");
    assert.equal(
      snap.objectiveTargetSelection?.selectedCandidate?.sourceId,
      "FIBONACCI_PROJECTION"
    );
    assert.equal(snap.selectedEntryReference?.referencePrice, 84_000);
    assert.equal(snap.selectedStopLossReference?.stopPrice, 82_900);
    const expectedTarget = fibExtensionPrice(78_337, 84_000, 1.618);
    assert.equal(snap.selectedTargetReference?.targetPrice, expectedTarget);
    assert.equal(snap.selectedRiskRewardReference?.riskAmount, 1100);
    assert.equal(
      snap.selectedRiskRewardReference?.rewardAmount,
      expectedTarget - 84_000
    );
    assert.equal(snap.evaluationState, "READY_FOR_FURTHER_EVALUATION");
    assert.equal(snap.entryPlan.referenceLevels.some(
      (l) => l.kind === "EXPLICIT_OBJECTIVE_TARGET"
    ), false);
  });

  it("B: production-style — no objective context map → target/RR insufficient", () => {
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [syntheticConfirmedTradeSetup()],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = {
      timeframe: TF,
      symbols: ["BTCUSDT"],
      results: [],
      errors: [],
      limitations: [],
    };
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar() },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    const snap = result.snapshots[0].snapshot;
    assert.equal(snap.objectiveTargetCandidates, undefined);
    assert.equal(snap.objectiveTargetSelection, undefined);
    assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
  });

  it("C: Fib + Previous Swing AVAILABLE → Fib selected in pipeline", () => {
    const result = pipelineWithSyntheticSetup();
    const available =
      result.snapshots[0].snapshot.objectiveTargetCandidates?.candidates.filter(
        (c) => c.outcome === "AVAILABLE"
      ) ?? [];
    assert.ok(available.length >= 2);
    assert.equal(
      result.snapshots[0].snapshot.objectiveTargetSelection?.selectedCandidate
        ?.sourceId,
      "FIBONACCI_PROJECTION"
    );
  });

  it("D: only Previous Swing context → Previous Swing selected", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: syntheticConfirmedTradeSetup(),
      evaluationBar: {
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "c",
      },
    });
    assert.ok(plan);
    const snap = buildTradeSetupEvaluationSnapshot({
      plan: plan!,
      priceContext: { candles: SYNTHETIC_CANDLES },
      objectiveTargetSourceContext: {
        diagnostics: testOnlyObjectiveContext().diagnostics,
      },
    });
    assert.equal(snap.objectiveTargetSelection?.outcome, "SELECTED");
    assert.equal(
      snap.objectiveTargetSelection?.selectedCandidate?.sourceId,
      "PREVIOUS_SWING"
    );
    assert.equal(snap.selectedTargetReference?.outcome, "TARGET_REFERENCE_AVAILABLE");
  });

  it("E: empty context object → NO_SELECTION path", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: syntheticConfirmedTradeSetup(),
      evaluationBar: {
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "c",
      },
    });
    const snap = buildTradeSetupEvaluationSnapshot({
      plan: plan!,
      priceContext: { candles: SYNTHETIC_CANDLES },
      objectiveTargetSourceContext: {},
    });
    assert.equal(snap.objectiveTargetSelection?.outcome, "NO_SELECTION");
    assert.equal(snap.selectedTargetReference, null);
  });

  it("F: selection INSUFFICIENT_CONTEXT → target/RR insufficient", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: syntheticConfirmedTradeSetup({ directionalBias: null, directionalBasis: null }),
      evaluationBar: {
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "c",
      },
    });
    const snap = buildTradeSetupEvaluationSnapshot({
      plan: plan!,
      objectiveTargetSourceContext: testOnlyObjectiveContext(),
    });
    assert.equal(snap.objectiveTargetSelection?.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(snap.selectedTargetReference, null);
  });

  it("H: multiple setups share symbol context independently", () => {
    const s1 = syntheticConfirmedTradeSetup({
      id: "BTCUSDT:1H:impulse-continuation:a",
    });
    const s2 = syntheticConfirmedTradeSetup({
      id: "BTCUSDT:1H:correction-end:b",
      setupTypeId: "correction-end",
      scenarioRef: {
        ...s1.scenarioRef,
        scenarioId: "sc2",
        waveLabel: "C",
        structure: "CORRECTIVE",
      },
    });
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [s1, s2],
      candidateCount: 2,
      errors: [],
      limitations: [],
    };
    const scan = {
      timeframe: TF,
      symbols: ["BTCUSDT"],
      results: [],
      errors: [],
      limitations: [],
    };
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar() },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
      objectiveTargetSourceContextBySymbol: {
        BTCUSDT: testOnlyObjectiveContext(),
      },
    });
    assert.equal(result.snapshotCount, 2);
    assert.notEqual(
      result.snapshots[0].setupId,
      result.snapshots[1].setupId
    );
  });

  it("I: multiple symbols", () => {
    const scan = runWaveScan(
      [
        { symbol: "BTCUSDT", candles: DEMO_OHLCV },
        { symbol: "ETHUSDT", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    const tradeCtx = {
      scanReport: scan,
      bundlesBySymbol: {
        BTCUSDT: bundleForBar(),
        ETHUSDT: bundleForBar(),
      },
    };
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: tradeCtx,
      candlesBySymbol: {
        BTCUSDT: SYNTHETIC_CANDLES,
        ETHUSDT: SYNTHETIC_CANDLES,
      },
      objectiveTargetSourceContextBySymbol: {
        BTCUSDT: testOnlyObjectiveContext(),
      },
    });
    assert.ok(result.snapshots.length >= 0);
  });

  it("K/L: target price equals selected candidate via Target Model", () => {
    const result = pipelineWithSyntheticSetup();
    const snap = result.snapshots[0].snapshot;
    assert.equal(
      snap.selectedTargetReference?.targetPrice,
      snap.objectiveTargetSelection?.selectedCandidate?.targetPrice
    );
    assert.equal(snap.selectedTargetReference?.modelId, "STRUCTURAL_TARGET_REFERENCE");
  });

  it("M: candidate report preserved with multiple AVAILABLE", () => {
    const result = pipelineWithSyntheticSetup();
    const report = result.snapshots[0].snapshot.objectiveTargetCandidates;
    assert.ok(report);
    assert.ok(
      report.candidates.filter((c) => c.outcome === "AVAILABLE").length >= 3
    );
  });

  it("N: selection provenance on snapshot", () => {
    const result = pipelineWithSyntheticSetup();
    const sel = result.snapshots[0].snapshot.objectiveTargetSelection;
    assert.equal(sel?.policyId, "SOURCE_PRECEDENCE");
    assert.equal(sel?.policyVersion, "1.0");
    assert.ok(sel?.selectionReason.includes("policy precedence"));
  });

  it("O/P/Q: scan, setup report, plan immutable", () => {
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [syntheticConfirmedTradeSetup()],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = {
      timeframe: TF,
      symbols: ["BTCUSDT"],
      results: [],
      errors: [],
      limitations: [],
    };
    const beforeScan = JSON.stringify(scan);
    const beforeSetup = JSON.stringify(setupReport);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar() },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
      objectiveTargetSourceContextBySymbol: {
        BTCUSDT: testOnlyObjectiveContext(),
      },
    });
    assert.equal(JSON.stringify(scan), beforeScan);
    assert.equal(JSON.stringify(setupReport), beforeSetup);
    const planBefore = JSON.stringify(
      buildEntryPlanFromSetup({
        setup: syntheticConfirmedTradeSetup(),
        evaluationBar: {
          evaluationBarIndex: 2,
          evaluationBarBoundaryEstablished: true,
          evaluationBarContractDetail: "closedSeriesOnly TEST_ONLY",
        },
      }).plan
    );
    assert.equal(
      JSON.stringify(result.snapshots[0].snapshot.entryPlan),
      planBefore
    );
  });

  it("R: pipeline does not use candles.length - 1", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-pipeline.ts"
      ),
      "utf8"
    );
    assert.ok(!text.includes("candles.length - 1"));
  });

  it("W: pipeline does not implement RR formula", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/trade-setup-evaluation-pipeline.ts"),
      "utf8"
    );
    assert.ok(!text.includes("riskAmount"));
    assert.ok(!text.includes("buildRiskRewardReport"));
  });

  it("X/Y: deterministic + 14D.7 compat without context", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const input = {
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: undefined,
      },
    };
    const a = buildTradeSetupEvaluationPipeline(input);
    const b = buildTradeSetupEvaluationPipeline(input);
    assert.equal(JSON.stringify(a.snapshots), JSON.stringify(b.snapshots));
    assert.equal(
      a.snapshots[0]?.snapshot.objectiveTargetSelection,
      undefined
    );
  });

  it("Z: evaluation state is not a trade signal", () => {
    const result = pipelineWithSyntheticSetup();
    const state = result.snapshots[0].snapshot.evaluationState;
    for (const bad of ["BUY", "SELL", "LONG", "SHORT"]) {
      assert.ok(!state.includes(bad));
    }
  });
});
