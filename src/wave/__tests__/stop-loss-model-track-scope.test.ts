import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import type { EntryPriceReference } from "../setup/entry-model-types";
import {
  buildStopLossReport,
  evaluateStopLossModel,
  stopReferencesAvailable,
} from "../setup/stop-loss-model";
import { listStopLossModelsForSetupType } from "../setup/stop-loss-model-catalog";
import { buildReferenceLevels } from "../setup/setup-rules";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { WaveScanResult } from "../wave-scanner";

const BAR = {
  evaluationBarIndex: 498,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

function btcSetup(waveLabel: "3" | "4"): SetupCandidate {
  const segment =
    waveLabel === "3"
      ? { startPrice: 83_824.7, endPrice: 83_122.1, startIndex: 486, endIndex: 490 }
      : { startPrice: 83_122.1, endPrice: 83_487.4, startIndex: 490, endIndex: 492 };
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: `BTCUSDT:1H:impulse-continuation:candidate-impulse-${waveLabel}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: `candidate-impulse-${waveLabel}`,
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel,
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
      summary: "track",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      {
        kind: "SCENARIO_INVALIDATION",
        label: "Scenario invalidation",
        price: 83_674,
        invalidationSource: "TRACK_SCOPE",
      },
    ],
    sourceScenario: {
      confidence: 1,
      ...segment,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
  };
}

function entryRef(price: number): EntryPriceReference {
  return {
    schemaVersion: "1.0",
    modelId: "EVALUATION_CLOSE",
    modelLabel: "test",
    outcome: "ENTRY_REFERENCE_AVAILABLE",
    entryPlanId: "x",
    setupTypeId: "impulse-continuation",
    directionalBias: "BULLISH",
    referencePrice: price,
    rationale: "fixture",
    limitations: [],
  };
}

describe("TRACK_SCOPE stop reference (14J)", () => {
  it("A: scope propagation scenario → setup reference levels", () => {
    const row = {
      symbol: "BTCUSDT",
      timeframe: "1H",
      scenarioId: "sc",
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel: "3",
      scenarioStatus: "ACTIVE",
      confidence: 1,
      startIndex: 0,
      endIndex: 1,
      startPrice: 1,
      endPrice: 2,
      invalidation: {
        available: true,
        price: 83_674,
        source: "TRACK_SCOPE",
        rule: "track",
      },
      evidence: [],
      limitations: [],
    } as WaveScanResult;
    const levels = buildReferenceLevels(row, {});
    const inv = levels.find((l) => l.kind === "SCENARIO_INVALIDATION");
    assert.equal(inv?.invalidationSource, "TRACK_SCOPE");
    assert.equal(inv?.price, 83_674);
  });

  it("B: scope propagation setup → entry plan", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const inv = plan.referenceLevels.find(
      (l) => l.kind === "SCENARIO_INVALIDATION"
    );
    assert.equal(inv?.invalidationSource, "TRACK_SCOPE");
  });

  it("C: segment model unchanged on BTC fixture", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const seg = evaluateStopLossModel("SCENARIO_INVALIDATION_REFERENCE", {
      plan,
    });
    assert.equal(seg.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(seg.scopeSemantics, "SEGMENT_ENVELOPE_SCENARIO_INVALIDATION_REFERENCE");
  });

  it("D/E: bullish track stop AVAILABLE at exact price", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const track = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
      selectedEntryReference: entryRef(83_883),
    });
    assert.equal(track.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(track.stopPrice, 83_674);
  });

  it("F: bearish track stop AVAILABLE", () => {
    const setup = btcSetup("3");
    setup.directionalBias = "BEARISH";
    setup.referenceLevels = [
      {
        kind: "SCENARIO_INVALIDATION",
        label: "inv",
        price: 84_500,
        invalidationSource: "TRACK_SCOPE",
      },
    ];
    const plan = buildEntryPlanFromSetup({ setup, evaluationBar: BAR }).plan!;
    const track = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
      selectedEntryReference: {
        ...entryRef(84_000),
        directionalBias: "BEARISH",
      },
    });
    assert.equal(track.outcome, "STOP_REFERENCE_AVAILABLE");
    assert.equal(track.stopPrice, 84_500);
  });

  it("G/H: wrong-side bullish and bearish", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const bull = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
      selectedEntryReference: entryRef(83_000),
    });
    assert.equal(bull.outcome, "INSUFFICIENT_CONTEXT");
    const bearSetup = btcSetup("3");
    bearSetup.directionalBias = "BEARISH";
    bearSetup.referenceLevels = [
      {
        kind: "SCENARIO_INVALIDATION",
        label: "inv",
        price: 83_500,
        invalidationSource: "TRACK_SCOPE",
      },
    ];
    const bearPlan = buildEntryPlanFromSetup({
      setup: bearSetup,
      evaluationBar: BAR,
    }).plan!;
    const bear = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan: bearPlan,
      selectedEntryReference: {
        ...entryRef(84_000),
        directionalBias: "BEARISH",
      },
    });
    assert.equal(bear.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("I: wrong scope → NOT_APPLICABLE", () => {
    const setup = btcSetup("3");
    setup.referenceLevels = [
      {
        kind: "SCENARIO_INVALIDATION",
        label: "inv",
        price: 83_674,
        invalidationSource: "FOCUS_LEG",
      },
    ];
    const plan = buildEntryPlanFromSetup({ setup, evaluationBar: BAR }).plan!;
    const track = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
      selectedEntryReference: entryRef(83_883),
    });
    assert.equal(track.outcome, "NOT_APPLICABLE");
  });

  it("J: missing entry reference → insufficient", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const track = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
    });
    assert.equal(track.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("K: already-invalidated setup → no track stop", () => {
    const setup = btcSetup("3");
    setup.invalidation.conditions = [
      {
        conditionId: "setup-invalidation-triggered",
        outcome: "MET",
        detail: "triggered",
      },
    ];
    const plan = buildEntryPlanFromSetup({ setup, evaluationBar: BAR }).plan!;
    const track = evaluateStopLossModel("TRACK_SCOPE_INVALIDATION_REFERENCE", {
      plan,
      selectedEntryReference: entryRef(83_883),
    });
    assert.equal(track.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("L: both models evaluated independently", () => {
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const { report } = buildStopLossReport({
      plan,
      selectedEntryReference: entryRef(83_883),
    });
    assert.equal(report.references.length, 2);
    const seg = report.references[0];
    const trk = report.references[1];
    assert.equal(seg.modelId, "SCENARIO_INVALIDATION_REFERENCE");
    assert.equal(trk.modelId, "TRACK_SCOPE_INVALIDATION_REFERENCE");
    assert.equal(seg.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(trk.outcome, "STOP_REFERENCE_AVAILABLE");
  });

  it("M: catalog order preserved for selection", () => {
    const ids = listStopLossModelsForSetupType("impulse-continuation");
    assert.deepEqual(ids, [
      "SCENARIO_INVALIDATION_REFERENCE",
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
    ]);
    const plan = buildEntryPlanFromSetup({
      setup: btcSetup("4"),
      evaluationBar: BAR,
    }).plan!;
    const { report } = buildStopLossReport({
      plan,
      selectedEntryReference: entryRef(83_883),
    });
    const available = stopReferencesAvailable(report);
    assert.equal(available.length, 1);
    assert.equal(available[0].modelId, "TRACK_SCOPE_INVALIDATION_REFERENCE");
  });

  it("N/O: real BTC W3 and W4 semantics", () => {
    for (const wave of ["3", "4"] as const) {
      const plan = buildEntryPlanFromSetup({
        setup: btcSetup(wave),
        evaluationBar: BAR,
      }).plan!;
      const { report } = buildStopLossReport({
        plan,
        selectedEntryReference: entryRef(83_883),
      });
      const seg = report.references.find(
        (r) => r.modelId === "SCENARIO_INVALIDATION_REFERENCE"
      );
      const trk = report.references.find(
        (r) => r.modelId === "TRACK_SCOPE_INVALIDATION_REFERENCE"
      );
      assert.equal(seg?.outcome, "INSUFFICIENT_CONTEXT");
      assert.equal(trk?.outcome, "STOP_REFERENCE_AVAILABLE");
      assert.equal(trk?.stopPrice, 83_674);
    }
  });
});
