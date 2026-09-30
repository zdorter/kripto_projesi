import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { evaluateProspectiveSourcePolicy } from "../setup/prospective-setup-source-policy";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { detectSetups } from "../setup/setup-detector";
import {
  detectProspectiveSetupProduction,
  evaluateProspectiveSetupProduction,
} from "../setup/prospective-setup-production";
import { PRODUCTION_TRANSITION_RULE_ID } from "../setup/structural-transition-semantics";
import { runWaveScan } from "../wave-scanner";
import type { Candle } from "../types";
import {
  discoverNaturalReplayMilestones,
  naturalPipelineCandles,
  runProspectiveProductionPipelineAtBar,
} from "../setup/prospective-natural-pipeline-replay";

function demoPipelineAtBar(bar: number) {
  const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], {
    timeframe: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  const tradeContext = buildTradeSetupEvaluationContext(
    scan,
    {
      BTCUSDT: {
        candles: DEMO_OHLCV,
        closedSeriesOnly: true,
        evaluationBarIndex: bar,
      },
    },
    DEMO_WAVE_ENGINE_OPTIONS
  );
  const setupDetection = detectSetups({ scanReport: scan, tradeContext });
  return { tradeContext, setupDetection };
}

describe("prospective natural production pipeline (14N-I / 14N-J)", () => {
  it("I: full pipeline from candles without low-level transition patches", () => {
    const candles = naturalPipelineCandles();
    const milestones = discoverNaturalReplayMilestones(candles);
    assert.ok(milestones.length >= 1);
    assert.ok(
      milestones.some((m) => m.label === "N1_HISTORICAL_SOURCE" || m.label === "N3_SWING_TRANSITION")
    );
  });

  it("J-K: DEMO replay shows transition swing after endpoint with confirmation lag", () => {
    const bar = 22;
    const { tradeContext, setupDetection } = demoPipelineAtBar(bar);
    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const setup = setupDetection.candidates.find(
      (c) =>
        c.isTradeSetup &&
        c.setupTypeId === "impulse-continuation" &&
        c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const policy = evaluateProspectiveSourcePolicy({ setup, bundle });
    assert.equal(policy.verdict, "ACCEPTED_HISTORICAL_TRADE_SETUP");
    const prod = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(
      prod.contract.transitionEvidence.transitionRuleId,
      PRODUCTION_TRANSITION_RULE_ID
    );
    assert.ok(
      (prod.contract.transitionEvidence.subsequentSwingIndex ?? 0) >
        (prod.contract.transitionEvidence.completedAtIndex ?? 0)
    );
    assert.ok(prod.contract.transitionEvidence.swingConfirmationLagBars !== null);
    assert.ok(
      prod.contract.transitionEvidence.transitionEvidenceLevel ===
        "STRUCTURAL_TRANSITION_CONFIRMED" ||
        prod.contract.transitionEvidence.transitionEvidenceLevel ===
          "SWING_TRANSITION_OBSERVED"
    );
    if (prod.status === "CONFIRMED") {
      assert.equal(
        prod.contract.transitionEvidence.transitionEvidenceLevel,
        "STRUCTURAL_TRANSITION_CONFIRMED"
      );
    }
  });

  it("J-hard: demo pipeline produces at least one CONFIRMED prospective", () => {
    const bar = 22;
    const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], {
      timeframe: "1H",
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      {
        BTCUSDT: {
          candles: DEMO_OHLCV,
          closedSeriesOnly: true,
          evaluationBarIndex: bar,
        },
      },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const production = detectProspectiveSetupProduction({
      historicalTradeSetups: detectSetups({
        scanReport: scan,
        tradeContext,
      }).candidates.filter((c) => c.isTradeSetup),
      tradeContext,
      candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    });
    assert.ok(production.summary.confirmed >= 1);
    assert.ok(production.summary.targetGatePass >= 1);
  });

  it("F-G-H: CONFIRMED requires structural transition rule, not open movement alone", () => {
    const { tradeContext, setupDetection } = demoPipelineAtBar(22);
    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const setup = setupDetection.candidates.find(
      (c) => c.isTradeSetup && c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const prod = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.equal(prod.contract.structuralTransitionVerdict, "STRUCTURAL_TRANSITION_OBSERVED");
    assert.equal(
      prod.contract.transitionEvidence.transitionRuleId,
      PRODUCTION_TRANSITION_RULE_ID
    );
    assert.notEqual(
      prod.contract.transitionEvidence.transitionEvidenceLevel,
      "OPEN_MOVEMENT_ONLY"
    );
  });

  it("M-N-O: gate PASS is not a target; Fib registry stays empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
    const { tradeContext, setupDetection } = demoPipelineAtBar(22);
    const setup = setupDetection.candidates.find(
      (c) => c.isTradeSetup && c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const prod = evaluateProspectiveSetupProduction({
      historicalSetup: setup!,
      bundle: tradeContext.bundlesBySymbol!.BTCUSDT,
      candles: DEMO_OHLCV,
    });
    assert.equal(prod.targetGateOutcome, "PASS");
    assert.equal(prod.status, "CONFIRMED");
    assert.ok(!("objectiveTarget" in prod) || prod.objectiveTarget == null);
  });

  it("R: prefix invariance on natural pipeline evaluation bar", () => {
    const base = naturalPipelineCandles();
    const bar = 55;
    const a = runProspectiveProductionPipelineAtBar(base, bar).production;
    const extended: Candle[] = [
      ...base,
      {
        time: base.at(-1)!.time + 3_600_000,
        open: 120,
        high: 125,
        low: 115,
        close: 122,
        volume: 1,
      },
    ];
    const b = runProspectiveProductionPipelineAtBar(extended, bar).production;
    assert.deepEqual(a, b);
  });

  it("P: prospective production does not emit EntryPlan (historical entry boundary unchanged)", () => {
    const { tradeContext, setupDetection } = demoPipelineAtBar(22);
    const setup = setupDetection.candidates.find(
      (c) => c.isTradeSetup && c.id.endsWith("candidate-impulse-1")
    );
    assert.ok(setup);
    const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
    const prod = evaluateProspectiveSetupProduction({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV,
    });
    assert.ok(!("entryPlan" in prod));
    const { plan } = buildEntryPlanFromSetup({
      setup: { ...setup!, status: "CONFIRMED" },
      evaluationBar: {
        evaluationBarIndex: bundle.evaluationBarIndex,
        evaluationBarBoundaryEstablished: bundle.evaluationBarBoundaryEstablished,
        evaluationBarContractDetail: bundle.evaluationBarContractDetail,
      },
    });
    assert.ok(plan === null || plan.semanticRole !== "PROSPECTIVE_TRADE_SETUP");
  });
});
