import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fibExtensionPrice } from "../fibonacci";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  buildObjectiveTargetCandidateReport,
  evaluateObjectiveTargetSource,
  objectiveTargetCandidatesAvailable,
} from "../setup/objective-target-candidate-sources";
import type { ObjectiveTargetSourceContext } from "../setup/objective-target-candidate-types";
import type { EntryPlanCandidate } from "../setup/entry-plan-types";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { WaveDiagnostics } from "../wave-diagnostics";

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
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
    ],
    sourceScenario: {
      confidence: 80,
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

function eligiblePlan(overrides: Partial<SetupCandidate> = {}): EntryPlanCandidate {
  const { plan } = buildEntryPlanFromSetup({
    setup: baseSetup(overrides),
    evaluationBar: CLOSED_BAR,
  });
  assert.ok(plan);
  return plan!;
}

function minimalDiagnostics(
  swings: WaveDiagnostics["confirmedSwings"],
  fibPartial?: Partial<WaveDiagnostics["fibonacci"]>
): WaveDiagnostics {
  return {
    swingConfig: {} as never,
    confirmedSwingCount: swings.length,
    confirmedSwings: swings,
    structurePairs: [],
    allStructures: [],
    trendSource: {
      marketTrend: "BULLISH",
      trendRuleSummary: "test",
    },
    waveLegs: [],
    fibonacci: {
      available: false,
      note: "test",
      ...fibPartial,
    },
    focus: { primary: null, alternative: null },
    overlaps: [],
    presentation: {} as never,
  };
}

describe("objective-target-candidate 14D.8 contract", () => {
  it("A: Fibonacci projection AVAILABLE with attested anchors", () => {
    const plan = eligiblePlan();
    const anchors = {
      rangeStartPrice: 83_000,
      rangeEndPrice: 84_000,
      extensionLevel: 1.618 as const,
    };
    const expected = fibExtensionPrice(
      anchors.rangeStartPrice,
      anchors.rangeEndPrice,
      anchors.extensionLevel
    );
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: { attestedFibonacciProjection: anchors },
    });
    assert.equal(c.outcome, "AVAILABLE");
    assert.equal(c.targetPrice, expected);
  });

  it("B: Previous swing AVAILABLE at segment origin index", () => {
    const plan = eligiblePlan();
    const c = evaluateObjectiveTargetSource("PREVIOUS_SWING", {
      plan,
      sourceContext: {
        diagnostics: minimalDiagnostics([
          { index: 0, type: "LOW", price: 88_100, time: 0, strength: 1 },
          { index: 2, type: "HIGH", price: 84_500, time: 2, strength: 1 },
        ]),
      },
    });
    assert.equal(c.outcome, "AVAILABLE");
    assert.equal(c.targetPrice, 88_100);
  });

  it("C: multiple AVAILABLE candidates preserved (synthetic)", () => {
    const plan = eligiblePlan();
    const report = buildObjectiveTargetCandidateReport({
      plan,
      sourceContext: {
        attestedFibonacciProjection: {
          rangeStartPrice: 83_000,
          rangeEndPrice: 84_000,
          extensionLevel: 1.618,
        },
        diagnostics: minimalDiagnostics([
          { index: 0, type: "LOW", price: 88_100, time: 0, strength: 1 },
        ]),
        attestedWaveStructureTarget: {
          targetPrice: 89_000,
          evidenceRef: "TEST_ONLY structure attestation",
        },
      },
    });
    const available = objectiveTargetCandidatesAvailable(report);
    assert.equal(available.length, 3);
    assert.ok(!("selectedTarget" in report));
    assert.ok(!("selectedTargetReference" in report));
    const prices = available.map((a) => a.targetPrice).sort((a, b) => a! - b!);
    assert.deepEqual(prices, [
      fibExtensionPrice(83_000, 84_000, 1.618),
      88_100,
      89_000,
    ]);
  });

  it("D: ABC projection NOT_APPLICABLE on impulse-continuation", () => {
    const plan = eligiblePlan();
    const c = evaluateObjectiveTargetSource("ABC_PROJECTION", { plan });
    assert.equal(c.outcome, "NOT_APPLICABLE");
  });

  it("E: Fibonacci projection INSUFFICIENT without attestation", () => {
    const plan = eligiblePlan();
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: {
        diagnostics: minimalDiagnostics([], { available: true }),
      },
    });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(c.targetPrice, undefined);
  });

  it("F: Wave 5 label alone does not produce wave-structure target", () => {
    const plan = eligiblePlan({
      scenarioRef: {
        ...baseSetup().scenarioRef,
        waveLabel: "5",
      },
    });
    const c = evaluateObjectiveTargetSource("WAVE_STRUCTURE", { plan });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(c.targetPrice, undefined);
  });

  it("G: Wave C label alone does not produce ABC projection", () => {
    const plan = eligiblePlan({
      setupTypeId: "correction-end",
      scenarioRef: {
        ...baseSetup().scenarioRef,
        waveLabel: "C",
        structure: "CORRECTIVE",
      },
    });
    const c = evaluateObjectiveTargetSource("ABC_PROJECTION", { plan });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("H: directional bias null preserved on candidate", () => {
    const plan = eligiblePlan({ directionalBias: null, directionalBasis: null });
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: {
        attestedFibonacciProjection: {
          rangeStartPrice: 83_000,
          rangeEndPrice: 84_000,
          extensionLevel: 1.272,
        },
      },
    });
    assert.equal(c.outcome, "AVAILABLE");
    assert.equal(c.directionalBias, null);
  });

  it("I: deterministic catalog ordering (not ranking)", () => {
    const plan = eligiblePlan({ setupTypeId: "correction-end" });
    const report = buildObjectiveTargetCandidateReport({ plan });
    const ids = report.candidates.map((c) => c.sourceId);
    assert.deepEqual(ids, [
      "ABC_PROJECTION",
      "FIBONACCI_PROJECTION",
      "PREVIOUS_SWING",
      "WAVE_STRUCTURE",
    ]);
    assert.ok(!ids.includes("best"));
  });

  it("J: same input → same report", () => {
    const plan = eligiblePlan();
    const ctx: ObjectiveTargetSourceContext = {
      attestedFibonacciProjection: {
        rangeStartPrice: 1,
        rangeEndPrice: 2,
        extensionLevel: 1.618,
      },
    };
    const a = buildObjectiveTargetCandidateReport({ plan, sourceContext: ctx });
    const b = buildObjectiveTargetCandidateReport({ plan, sourceContext: ctx });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("K: diagnostics snapshot not mutated", () => {
    const plan = eligiblePlan();
    const diagnostics = minimalDiagnostics([
      { index: 0, type: "LOW", price: 88_100, time: 0, strength: 1 },
    ]);
    const before = JSON.stringify(diagnostics);
    buildObjectiveTargetCandidateReport({
      plan,
      sourceContext: { diagnostics },
    });
    assert.equal(JSON.stringify(diagnostics), before);
  });

  it("L: trace fields on candidates", () => {
    const plan = eligiblePlan();
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: {
        attestedFibonacciProjection: {
          rangeStartPrice: 83_000,
          rangeEndPrice: 84_000,
          extensionLevel: 1.618,
        },
      },
    });
    assert.equal(c.entryPlanId, plan.id);
    assert.equal(c.setupTypeId, plan.setupTypeId);
    assert.equal(c.scenarioId, "sc1");
    assert.equal(c.symbol, "BTCUSDT");
  });

  it("M: no target selection API in module", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/objective-target-candidate-sources.ts"
      ),
      "utf8"
    );
    const forbidden = [
      "selectBestTarget",
      "selectPreferredTarget",
      "rankTargets",
      "chooseTarget",
      "resolveBestTarget",
    ];
    for (const name of forbidden) {
      assert.ok(!text.includes(name), name);
    }
  });

  it("N: report types exclude ranking vocabulary", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/objective-target-candidate-types.ts"
      ),
      "utf8"
    );
    assert.ok(!text.includes("ranking"));
    assert.ok(!text.includes("preferred"));
    assert.ok(!text.includes("bestTarget"));
  });

  it("O: no fallback when swing missing at origin", () => {
    const plan = eligiblePlan();
    const c = evaluateObjectiveTargetSource("PREVIOUS_SWING", {
      plan,
      sourceContext: {
        diagnostics: minimalDiagnostics([
          { index: 5, type: "HIGH", price: 90_000, time: 5, strength: 1 },
        ]),
      },
    });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
  });

  it("P/Q: no TP or execution semantics in candidate types", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/objective-target-candidate-types.ts"
      ),
      "utf8"
    );
    for (const token of ["takeProfit", "MARKET", "LIMIT", "positionSize"]) {
      assert.ok(!text.includes(token), token);
    }
  });

  it("R: production-style plan without source context → no AVAILABLE candidates", () => {
    const plan = eligiblePlan();
    const report = buildObjectiveTargetCandidateReport({ plan });
    assert.equal(objectiveTargetCandidatesAvailable(report).length, 0);
    assert.ok(
      report.candidates.every(
        (c) =>
          c.outcome === "INSUFFICIENT_CONTEXT" || c.outcome === "NOT_APPLICABLE"
      )
    );
  });
});
