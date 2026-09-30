import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fibExtensionPrice } from "../fibonacci";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildEntryModelReport,
  entryReferencesAvailable,
  evaluateEntryModel,
} from "../setup/entry-model";
import { evaluateStopLossModel } from "../setup/stop-loss-model";
import {
  buildObjectiveTargetCandidateReport,
  evaluateObjectiveTargetSource,
} from "../setup/objective-target-candidate-sources";
import { applyObjectiveTargetSelectionPolicy } from "../setup/objective-target-selection";
import { buildTradeSetupEvaluationSnapshot } from "../setup/trade-setup-evaluation";
import { buildTradeSetupEvaluationPipeline } from "../setup/trade-setup-evaluation-pipeline";
import { detectSetups } from "../setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "../setup/trade-setup-context";
import { runWaveScan } from "../wave-scanner";
import {
  MVP_CLOSED_BAR,
  MVP_ENTRY_CANDLES,
  MVP_RR,
  MVP_TF,
  buildMvpPipeline,
  correctionEndSetup,
  correctionObjectiveContextAbcOnly,
  entryPlanFromSetup,
  impulseContinuationSetup,
  impulseObjectiveContextComplete,
  impulseObjectiveContextMultiAvailable,
  mvpSetupReport,
} from "./fixtures/mvp-e2e-fixtures";

const OPTS = { timeframe: MVP_TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS };

describe("14D.11 TEST_ONLY realistic E2E fixture validation", () => {
  describe("impulse-continuation complete chain", () => {
    it("reaches READY_FOR_FURTHER_EVALUATION with policy-selected Fib target (not a trade signal)", () => {
      const result = buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: [impulseContinuationSetup("BTCUSDT")],
        objectiveBySymbol: {
          BTCUSDT: impulseObjectiveContextComplete(),
        },
      });
      const snap = result.snapshots[0].snapshot;
      assert.equal(snap.evaluationState, "READY_FOR_FURTHER_EVALUATION");
      assert.equal(snap.objectiveTargetSelection?.outcome, "SELECTED");
      assert.equal(
        snap.objectiveTargetSelection?.selectedCandidate?.sourceId,
        "FIBONACCI_PROJECTION"
      );
      assert.equal(snap.selectedEntryReference?.referencePrice, MVP_RR.entry);
      assert.equal(snap.selectedStopLossReference?.stopPrice, MVP_RR.stop);
      assert.equal(snap.selectedTargetReference?.targetPrice, MVP_RR.target);
      assert.equal(snap.selectedRiskRewardReference?.riskAmount, MVP_RR.risk);
      assert.equal(snap.selectedRiskRewardReference?.rewardAmount, MVP_RR.reward);
      assert.ok(
        Math.abs(
          (snap.selectedRiskRewardReference?.riskRewardRatio ?? 0) - MVP_RR.ratio
        ) < 1e-9
      );
    });

    it("deterministic repeat on same fixture", () => {
      const input = {
        symbols: ["BTCUSDT"],
        candidates: [impulseContinuationSetup("BTCUSDT")],
        objectiveBySymbol: { BTCUSDT: impulseObjectiveContextComplete() },
      };
      const a = buildMvpPipeline(input);
      const b = buildMvpPipeline(input);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
    });

    it("trace chain: scenario → selection → target → RR", () => {
      const snap = buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: [impulseContinuationSetup("BTCUSDT")],
        objectiveBySymbol: { BTCUSDT: impulseObjectiveContextComplete() },
      }).snapshots[0].snapshot;
      assert.equal(snap.entryPlan.scenarioRef.scenarioId, "sc-imp");
      assert.equal(snap.objectiveTargetSelection?.policyId, "SOURCE_PRECEDENCE");
      assert.equal(
        snap.selectedTargetReference?.targetPrice,
        snap.objectiveTargetSelection?.selectedCandidate?.targetPrice
      );
    });
  });

  describe("correction-end fixture", () => {
    it("ABC attestation → SELECTED → target/RR when entry+stop geometry valid (TEST_ONLY)", () => {
      const bearishCandles = [
        { time: 0, open: 84_000, high: 84_100, low: 83_900, close: 82_000, volume: 1 },
        { time: 1, open: 82_000, high: 82_100, low: 81_900, close: 82_000, volume: 1 },
        { time: 2, open: 82_000, high: 82_100, low: 81_900, close: 82_000, volume: 1 },
      ];
      const result = buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: [correctionEndSetup("BTCUSDT")],
        objectiveBySymbol: { BTCUSDT: correctionObjectiveContextAbcOnly() },
        candlesBySymbol: { BTCUSDT: bearishCandles },
      });
      const snap = result.snapshots[0].snapshot;
      assert.equal(snap.objectiveTargetSelection?.outcome, "SELECTED");
      assert.equal(
        snap.objectiveTargetSelection?.selectedCandidate?.sourceId,
        "ABC_PROJECTION"
      );
      assert.equal(snap.entryPlan.directionalBias, "BEARISH");
      assert.equal(snap.entryPlan.directionalBasis, "LEG_PRICE_DELTA");
      assert.equal(snap.selectedTargetReference?.outcome, "TARGET_REFERENCE_AVAILABLE");
      assert.equal(
        snap.selectedTargetReference?.targetPrice,
        78_500
      );
    });
  });

  describe("entry references (fixture plan)", () => {
    const plan = entryPlanFromSetup(impulseContinuationSetup("BTCUSDT"));

    it("EVALUATION_CLOSE AVAILABLE with closed bar + candles", () => {
      const ref = evaluateEntryModel("EVALUATION_CLOSE", {
        plan,
        priceContext: { candles: MVP_ENTRY_CANDLES },
      });
      assert.equal(ref.outcome, "ENTRY_REFERENCE_AVAILABLE");
      assert.equal(ref.referencePrice, MVP_RR.entry);
    });

    it("SEGMENT_ENDPOINT AVAILABLE at evaluation bar", () => {
      const ref = evaluateEntryModel("SEGMENT_ENDPOINT", { plan });
      assert.equal(ref.outcome, "ENTRY_REFERENCE_AVAILABLE");
    });

    it("segment end after evaluation bar → INSUFFICIENT_CONTEXT", () => {
      const late = entryPlanFromSetup(
        impulseContinuationSetup("BTCUSDT", {
          referenceLevels: [
            { kind: "SEGMENT_END", label: "end", price: 84_500, index: 5 },
            { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
          ],
          sourceScenario: {
            confidence: 1,
            startIndex: 0,
            endIndex: 5,
            startPrice: 83_000,
            endPrice: 84_500,
            evidence: [],
            limitations: [],
          },
        })
      );
      const ref = evaluateEntryModel("SEGMENT_ENDPOINT", { plan: late });
      assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    });

    it("entry reference is not an executable order label", () => {
      const { report } = buildEntryModelReport({
        plan,
        priceContext: { candles: MVP_ENTRY_CANDLES },
      });
      const blob = JSON.stringify(entryReferencesAvailable(report));
      assert.ok(!blob.includes("MARKET"));
      assert.ok(!blob.includes("LIMIT"));
    });
  });

  describe("stop references", () => {
    const plan = entryPlanFromSetup(impulseContinuationSetup("BTCUSDT"));

    it("bullish SCENARIO_INVALIDATION_REFERENCE AVAILABLE", () => {
      const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
        plan,
      });
      assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
      assert.equal(ref.stopPrice, 82_900);
    });

    it("bearish geometry valid stop", () => {
      const bear = entryPlanFromSetup(correctionEndSetup("BTCUSDT"));
      const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
        plan: bear,
      });
      assert.equal(ref.outcome, "STOP_REFERENCE_AVAILABLE");
      assert.equal(ref.stopPrice, 85_500);
    });

    it("invalid bullish geometry → INSUFFICIENT_CONTEXT", () => {
      const bad = entryPlanFromSetup(
        impulseContinuationSetup("BTCUSDT", {
          referenceLevels: [
            { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
            { kind: "SCENARIO_INVALIDATION", label: "inv", price: 90_000 },
          ],
        })
      );
      const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
        plan: bad,
      });
      assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    });

    it("missing invalidation level", () => {
      const noInv = entryPlanFromSetup(
        impulseContinuationSetup("BTCUSDT", {
          referenceLevels: [
            { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
          ],
        })
      );
      const ref = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
        plan: noInv,
      });
      assert.equal(ref.outcome, "INSUFFICIENT_CONTEXT");
    });
  });

  describe("objective target candidates", () => {
    const plan = entryPlanFromSetup(impulseContinuationSetup("BTCUSDT"));

    it("Fib AVAILABLE via attestation", () => {
      const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
        plan,
        sourceContext: impulseObjectiveContextComplete(),
      });
      assert.equal(c.outcome, "AVAILABLE");
      assert.equal(c.targetPrice, MVP_RR.target);
    });

    it("Previous Swing AVAILABLE at segment origin", () => {
      const c = evaluateObjectiveTargetSource("PREVIOUS_SWING", {
        plan,
        sourceContext: impulseObjectiveContextMultiAvailable(),
      });
      assert.equal(c.outcome, "AVAILABLE");
    });

    it("Wave Structure AVAILABLE with attestation", () => {
      const c = evaluateObjectiveTargetSource("WAVE_STRUCTURE", {
        plan,
        sourceContext: impulseObjectiveContextMultiAvailable(),
      });
      assert.equal(c.outcome, "AVAILABLE");
    });

    it("ABC AVAILABLE on correction-end with attestation", () => {
      const corr = entryPlanFromSetup(correctionEndSetup("BTCUSDT"));
      const c = evaluateObjectiveTargetSource("ABC_PROJECTION", {
        plan: corr,
        sourceContext: correctionObjectiveContextAbcOnly(),
      });
      assert.equal(c.outcome, "AVAILABLE");
    });

    it("no attestation → no AVAILABLE on impulse", () => {
      const report = buildObjectiveTargetCandidateReport({ plan });
      assert.ok(
        report.candidates.every(
          (c) => c.outcome !== "AVAILABLE" || c.sourceId === "NOT_APPLICABLE"
        )
      );
      assert.equal(
        report.candidates.filter((c) => c.outcome === "AVAILABLE").length,
        0
      );
    });

    it("direction null → selection INSUFFICIENT_CONTEXT", () => {
      const nullBias = entryPlanFromSetup(
        impulseContinuationSetup("BTCUSDT", {
          directionalBias: null,
          directionalBasis: null,
        })
      );
      const report = buildObjectiveTargetCandidateReport({
        plan: nullBias,
        sourceContext: impulseObjectiveContextComplete(),
      });
      const sel = applyObjectiveTargetSelectionPolicy({ report });
      assert.equal(sel.outcome, "INSUFFICIENT_CONTEXT");
    });

    it("duplicate source → NO_SELECTION", () => {
      const report = buildObjectiveTargetCandidateReport({
        plan,
        sourceContext: impulseObjectiveContextComplete(),
      });
      const fib = report.candidates.find(
        (c) => c.sourceId === "FIBONACCI_PROJECTION"
      );
      assert.ok(fib);
      report.candidates.push({ ...fib!, referenceSource: "dup" });
      const sel = applyObjectiveTargetSelectionPolicy({ report });
      assert.equal(sel.outcome, "NO_SELECTION");
    });
  });

  describe("selection precedence (not quality)", () => {
    it("Fib selected before Previous Swing when both AVAILABLE", () => {
      const snap = buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: [impulseContinuationSetup("BTCUSDT")],
        objectiveBySymbol: { BTCUSDT: impulseObjectiveContextMultiAvailable() },
      }).snapshots[0].snapshot;
      assert.equal(
        snap.objectiveTargetSelection?.selectedCandidate?.sourceId,
        "FIBONACCI_PROJECTION"
      );
      assert.ok(
        snap.objectiveTargetSelection?.selectionReason.includes("policy precedence")
      );
      assert.ok(
        !snap.objectiveTargetSelection?.selectionReason.toLowerCase().includes(
          "better"
        )
      );
    });
  });

  describe("negative cases", () => {
    it("A: no objective context → insufficient evaluation", () => {
      const snap = buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: [impulseContinuationSetup("BTCUSDT")],
        objectiveBySymbol: {},
      }).snapshots[0].snapshot;
      assert.equal(snap.evaluationState, "INSUFFICIENT_CONTEXT");
      assert.equal(snap.objectiveTargetSelection, undefined);
    });

    it("B: missing stop → RR insufficient", () => {
      const snap = buildTradeSetupEvaluationSnapshot({
        plan: entryPlanFromSetup(
          impulseContinuationSetup("BTCUSDT", {
            referenceLevels: [
              { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
            ],
          })
        ),
        priceContext: { candles: MVP_ENTRY_CANDLES },
        objectiveTargetSourceContext: impulseObjectiveContextComplete(),
      });
      assert.equal(snap.selectedRiskRewardReference, null);
    });

    it("C: missing entry price context → evaluation-close insufficient (no live close fallback)", () => {
      const plan = entryPlanFromSetup(
        impulseContinuationSetup("BTCUSDT", {
          referenceLevels: [
            { kind: "SEGMENT_END", label: "end", price: 84_500, index: 5 },
            { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
          ],
          sourceScenario: {
            confidence: 1,
            startIndex: 0,
            endIndex: 5,
            startPrice: 83_000,
            endPrice: 84_500,
            evidence: [],
            limitations: [],
          },
        })
      );
      const snap = buildTradeSetupEvaluationSnapshot({
        plan,
        objectiveTargetSourceContext: impulseObjectiveContextComplete(),
      });
      const evalClose = snap.entryModel.references.find(
        (r) => r.modelId === "EVALUATION_CLOSE"
      );
      assert.equal(evalClose?.outcome, "INSUFFICIENT_CONTEXT");
      assert.equal(snap.selectedEntryReference, null);
      assert.equal(snap.selectedRiskRewardReference, null);
    });

    it("F: closed bar not established → no entry plans", () => {
      const scan = {
        timeframe: MVP_TF,
        symbols: ["BTCUSDT"],
        results: [],
        errors: [],
        limitations: [],
      };
      const result = buildTradeSetupEvaluationPipeline({
        scanReport: scan,
        tradeContext: {
          scanReport: scan,
          bundlesBySymbol: {
            BTCUSDT: {
              ...mvpBundleFromFixtures(),
              evaluationBarBoundaryEstablished: false,
              evaluationBarIndex: -1,
            },
          },
        },
        candlesBySymbol: { BTCUSDT: MVP_ENTRY_CANDLES },
        setupDetectionReport: mvpSetupReport([impulseContinuationSetup("BTCUSDT")]),
        objectiveTargetSourceContextBySymbol: {
          BTCUSDT: impulseObjectiveContextComplete(),
        },
      });
      assert.equal(result.entryPlanReport.planCount, 0);
      assert.equal(result.snapshotCount, 0);
    });

    it("G: invalidated setup → evaluation INVALID", () => {
      const base = entryPlanFromSetup(impulseContinuationSetup("BTCUSDT"));
      const plan = {
        ...base,
        setupRef: { ...base.setupRef, sourceSetupStatus: "INVALID" as const },
        invalidation: {
          ...base.invalidation,
          conditions: [
            {
              conditionId: "setup-invalidation-triggered",
              outcome: "MET" as const,
              detail: "broken",
            },
          ],
        },
      };
      const snap = buildTradeSetupEvaluationSnapshot({ plan });
      assert.equal(snap.evaluationState, "INVALID");
    });
  });

  describe("multi-symbol and multi-setup", () => {
    it("BTC and ETH independent objective context", () => {
      const result = buildMvpPipeline({
        symbols: ["BTCUSDT", "ETHUSDT"],
        candidates: [
          impulseContinuationSetup("BTCUSDT"),
          impulseContinuationSetup("ETHUSDT", { id: "ETHUSDT:1H:impulse-continuation:sc-imp" }),
        ],
        objectiveBySymbol: {
          BTCUSDT: impulseObjectiveContextComplete(),
        },
      });
      const btc = result.snapshots.find((s) => s.symbol === "BTCUSDT")!;
      const eth = result.snapshots.find((s) => s.symbol === "ETHUSDT")!;
      assert.equal(btc.snapshot.evaluationState, "READY_FOR_FURTHER_EVALUATION");
      assert.equal(eth.snapshot.evaluationState, "INSUFFICIENT_CONTEXT");
      assert.equal(eth.snapshot.objectiveTargetSelection, undefined);
    });

    it("impulse + correction as separate symbols (context not shared)", () => {
      const bearishCandles = [
        { time: 0, open: 84_000, high: 84_100, low: 81_900, close: 82_000, volume: 1 },
        { time: 1, open: 82_000, high: 82_100, low: 81_900, close: 82_000, volume: 1 },
        { time: 2, open: 82_000, high: 82_100, low: 81_900, close: 82_000, volume: 1 },
      ];
      const result = buildMvpPipeline({
        symbols: ["BTCUSDT", "ETHUSDT"],
        candidates: [
          impulseContinuationSetup("BTCUSDT"),
          correctionEndSetup("ETHUSDT"),
        ],
        objectiveBySymbol: {
          BTCUSDT: impulseObjectiveContextComplete(),
          ETHUSDT: correctionObjectiveContextAbcOnly(),
        },
        candlesBySymbol: {
          BTCUSDT: MVP_ENTRY_CANDLES,
          ETHUSDT: bearishCandles,
        },
      });
      assert.equal(result.snapshotCount, 2);
      const impulse = result.snapshots.find((s) => s.symbol === "BTCUSDT")!;
      const corr = result.snapshots.find((s) => s.symbol === "ETHUSDT")!;
      assert.equal(
        impulse.snapshot.objectiveTargetSelection?.selectedCandidate?.sourceId,
        "FIBONACCI_PROJECTION"
      );
      assert.equal(
        corr.snapshot.objectiveTargetSelection?.selectedCandidate?.sourceId,
        "ABC_PROJECTION"
      );
    });
  });

  describe("immutability", () => {
    it("setup report unchanged after pipeline", () => {
      const report = mvpSetupReport([impulseContinuationSetup("BTCUSDT")]);
      const before = JSON.stringify(report);
      buildMvpPipeline({
        symbols: ["BTCUSDT"],
        candidates: report.candidates,
        objectiveBySymbol: { BTCUSDT: impulseObjectiveContextComplete() },
      });
      assert.equal(JSON.stringify(report), before);
    });
  });

  describe("wave scan smoke (does not force CONFIRMED trade setup)", () => {
    it("DEMO candles → scan + detect without bypassing setup contract", () => {
      const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], OPTS);
      const ctx = buildTradeSetupEvaluationContext(scan, {
        BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true },
      }, DEMO_WAVE_ENGINE_OPTIONS);
      const setups = detectSetups({ scanReport: scan, tradeContext: ctx });
      assert.ok(setups.candidateCount >= 0);
    });
  });

  describe("fixture module contract", () => {
    it("fib attestation produces exact TEST_ONLY target 87500", () => {
      const start = 84_000 - 3_500 / 0.618;
      assert.ok(Math.abs(fibExtensionPrice(start, 84_000, 1.618) - 87_500) < 1e-6);
    });

    it("fixture file is TEST_ONLY not production prediction", () => {
      const text = fs.readFileSync(
        path.join(
          process.cwd(),
          "src/wave/__tests__/fixtures/mvp-e2e-fixtures.ts"
        ),
        "utf8"
      );
      assert.ok(text.includes("TEST_ONLY"));
      assert.ok(!text.includes("binance"));
    });
  });
});

function mvpBundleFromFixtures() {
  return {
    timeframeId: MVP_TF,
    evaluationBarIndex: MVP_CLOSED_BAR.evaluationBarIndex,
    evaluationBarBoundaryEstablished: MVP_CLOSED_BAR.evaluationBarBoundaryEstablished,
    evaluationBarContractDetail: MVP_CLOSED_BAR.evaluationBarContractDetail,
    candleCount: MVP_ENTRY_CANDLES.length,
    diagnostics: {} as never,
    presentation: {} as never,
  };
}
