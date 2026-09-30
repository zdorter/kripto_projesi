import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { detectSetups } from "../setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { buildTradeSetupEvaluationPipeline } from "../setup/trade-setup-evaluation-pipeline";
import type { SetupCandidate, SetupDetectionReport } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import { runWaveScan, type WaveScanReport } from "../wave-scanner";

const TF = "1H";
const OPTS = { timeframe: TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

function pipelineInput(scan: WaveScanReport, symbols: Record<string, typeof DEMO_OHLCV>) {
  const tradeCtx = buildTradeSetupEvaluationContext(scan, symbols, DEMO_WAVE_ENGINE_OPTIONS);
  const candlesBySymbol: Record<string, typeof DEMO_OHLCV> = {};
  for (const sym of Object.keys(symbols)) {
    candlesBySymbol[sym] = symbols[sym].candles;
  }
  return {
    scanReport: scan,
    tradeContext: tradeCtx,
    candlesBySymbol,
  };
}

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
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
      {
        kind: "EXPLICIT_OBJECTIVE_TARGET",
        label: "TEST_ONLY objective target",
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
    context: { mtfRelationshipKind: "ALIGNED" },
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

const SYNTHETIC_CANDLES = [
  { time: 0, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 1, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
  { time: 2, open: 100, high: 101, low: 99, close: 84_000, volume: 1 },
];

function minimalScan(symbols: string[]): WaveScanReport {
  return {
    timeframe: TF,
    symbols,
    results: [],
    errors: [],
    limitations: [],
  };
}

function bundleForBar(index: number) {
  return {
    timeframeId: TF,
    evaluationBarIndex: index,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "closedSeriesOnly test attestation",
    candleCount: SYNTHETIC_CANDLES.length,
    diagnostics: {} as never,
    presentation: {} as never,
  };
}

describe("trade-setup-evaluation-pipeline 14D.7 E2E wiring", () => {
  it("A: single symbol runs scan → setup → entry plan → snapshots", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const result = buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    assert.equal(result.timeframe, TF);
    assert.ok(result.setupDetection.candidateCount >= 0);
    assert.equal(
      result.snapshotCount,
      result.entryPlanReport.planCount
    );
    assert.equal(result.snapshots.length, result.snapshotCount);
  });

  it("B: multiple symbols evaluated independently", () => {
    const scan = runWaveScan(
      [
        { symbol: "BTCUSDT", candles: DEMO_OHLCV },
        { symbol: "ETHUSDT", candles: DEMO_OHLCV },
      ],
      OPTS
    );
    const result = buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
        ETHUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    assert.deepEqual(result.setupDetection.symbols.sort(), ["BTCUSDT", "ETHUSDT"]);
    for (const snap of result.snapshots) {
      assert.ok(["BTCUSDT", "ETHUSDT"].includes(snap.symbol));
    }
  });

  it("C: multiple setups → multiple snapshots for same symbol", () => {
    const s1 = syntheticConfirmedTradeSetup({
      id: "BTCUSDT:1H:impulse-continuation:a",
      setupTypeId: "impulse-continuation",
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
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.entryPlanReport.planCount, 2);
    assert.equal(result.snapshotCount, 2);
    assert.notEqual(
      result.snapshots[0].setupId,
      result.snapshots[1].setupId
    );
  });

  it("D: invalid setup does not produce entry plan or snapshot", () => {
    const invalid = syntheticConfirmedTradeSetup({
      status: "INVALID",
      invalidation: {
        conditions: [
          {
            conditionId: "setup-invalidation-triggered",
            outcome: "MET",
            detail: "broken",
          },
        ],
        summary: "invalid",
        usesScenarioInvalidation: true,
      },
    });
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [invalid],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.entryPlanReport.planCount, 0);
    assert.equal(result.snapshotCount, 0);
  });

  it("E: insufficient-context setup → no entry plan", () => {
    const insuf = syntheticConfirmedTradeSetup({
      status: "INSUFFICIENT_CONTEXT",
    });
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [insuf],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.snapshotCount, 0);
  });

  it("F: production-style setup without objective target → target/RR insufficient", () => {
    const prod = syntheticConfirmedTradeSetup({
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
        { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
      ],
    });
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [prod],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.snapshotCount, 1);
    const snap = result.snapshots[0].snapshot;
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

  it("G: synthetic complete fixture → READY_FOR_FURTHER_EVALUATION (test-only target)", () => {
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [syntheticConfirmedTradeSetup()],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.snapshotCount, 1);
    const snap = result.snapshots[0].snapshot;
    assert.equal(snap.evaluationState, "READY_FOR_FURTHER_EVALUATION");
    assert.equal(
      snap.selectedRiskRewardReference?.outcome,
      "RR_REFERENCE_AVAILABLE"
    );
    assert.equal(snap.selectedRiskRewardReference?.riskRewardRatio, 3500 / 1100);
  });

  it("H: closed-bar contract via bundles — no plans without established boundary", () => {
    const prod = syntheticConfirmedTradeSetup();
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [prod],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: {
          BTCUSDT: {
            ...bundleForBar(2),
            evaluationBarBoundaryEstablished: false,
            evaluationBarIndex: -1,
          },
        },
      },
      setupDetectionReport: setupReport,
    });
    assert.equal(result.entryPlanReport.planCount, 0);
  });

  it("I: scan error on one symbol does not block pipeline for other symbol", () => {
    const scan = runWaveScan(
      [
        { symbol: "BTCUSDT", candles: DEMO_OHLCV },
        { symbol: "EMPTY", candles: [] },
      ],
      OPTS
    );
    assert.ok(scan.errors.some((e) => e.symbol === "EMPTY"));
    const result = buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    assert.ok(result.setupDetection.errors.length >= 0);
    assert.equal(result.timeframe, TF);
  });

  it("J: deterministic repeatability", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const input = pipelineInput(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    });
    const a = buildTradeSetupEvaluationPipeline(input);
    const b = buildTradeSetupEvaluationPipeline(input);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("K: no ranking fields on pipeline items", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const result = buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    for (const item of result.snapshots) {
      assert.ok(!("rank" in item));
      assert.ok(!("score" in item));
      assert.ok(!("probability" in item));
    }
  });

  it("L/M/N: pipeline does not add fallback target/stop/entry", () => {
    const prod = syntheticConfirmedTradeSetup({
      referenceLevels: [
        { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      ],
    });
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [prod],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    const snap = result.snapshots[0]?.snapshot;
    assert.ok(snap);
    assert.equal(snap.selectedTargetReference, null);
    assert.equal(snap.selectedStopLossReference, null);
  });

  it("O: scenario and setup trace preserved in snapshot", () => {
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [syntheticConfirmedTradeSetup()],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const scan = minimalScan(["BTCUSDT"]);
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      candlesBySymbol: { BTCUSDT: SYNTHETIC_CANDLES },
      setupDetectionReport: setupReport,
    });
    const snap = result.snapshots[0].snapshot;
    assert.equal(snap.entryPlan.scenarioRef.scenarioId, "sc-synth");
    assert.equal(snap.entryPlan.setupRef.setupTypeId, "impulse-continuation");
  });

  it("P: evaluation state propagates from orchestrator", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const result = buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    for (const item of result.snapshots) {
      const allowed = [
        "READY_FOR_FURTHER_EVALUATION",
        "INSUFFICIENT_CONTEXT",
        "INVALID",
      ];
      assert.ok(allowed.includes(item.snapshot.evaluationState));
    }
  });

  it("Q: scan report not mutated by pipeline", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const before = JSON.stringify(scan);
    buildTradeSetupEvaluationPipeline(
      pipelineInput(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      })
    );
    assert.equal(JSON.stringify(scan), before);
  });

  it("R: setup detection output not mutated when passed as override", () => {
    const setupReport: SetupDetectionReport = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      timeframe: TF,
      symbols: ["BTCUSDT"],
      candidates: [syntheticConfirmedTradeSetup()],
      candidateCount: 1,
      errors: [],
      limitations: [],
    };
    const before = JSON.stringify(setupReport);
    const scan = minimalScan(["BTCUSDT"]);
    buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: {
        scanReport: scan,
        bundlesBySymbol: { BTCUSDT: bundleForBar(2) },
      },
      setupDetectionReport: setupReport,
    });
    assert.equal(JSON.stringify(setupReport), before);
  });

  it("uses detectSetups when setupDetectionReport omitted", () => {
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
    const tradeCtx = buildTradeSetupEvaluationContext(scan, {
      BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
    }, DEMO_WAVE_ENGINE_OPTIONS);
    const expected = detectSetups({ scanReport: scan, tradeContext: tradeCtx });
    const result = buildTradeSetupEvaluationPipeline({
      scanReport: scan,
      tradeContext: tradeCtx,
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    });
    assert.equal(
      JSON.stringify(result.setupDetection.candidates),
      JSON.stringify(expected.candidates)
    );
  });

  it("pipeline module does not call reference models directly", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-pipeline.ts"
      ),
      "utf8"
    );
    assert.ok(!text.includes("buildEntryModelReport"));
    assert.ok(!text.includes("buildStopLossReport"));
    assert.ok(!text.includes("buildTargetModelReport"));
    assert.ok(!text.includes("buildRiskRewardReport"));
    assert.ok(text.includes("buildTradeSetupEvaluationSnapshot"));
  });
});
