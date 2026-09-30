import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { projectBasePlusReferenceWaveDelta } from "../setup/wave-projection-relationship-math";
import { resolveWaveProjectionContext } from "../setup/wave-projection-context";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";
import type { WaveLegDiagnostic } from "../wave-diagnostics";

const BAR = {
  evaluationBarIndex: 100,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

function impulseSetup(waveLabel: "3" | "4" | "5"): SetupCandidate {
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
    invalidation: { conditions: [], summary: "x", usesScenarioInvalidation: true },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 40,
      endIndex: 50,
      startPrice: 84_000,
      endPrice: 86_000,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
  };
}

function leg(
  label: "1" | "2" | "3" | "4" | "5",
  startIndex: number,
  endIndex: number,
  startPrice: number,
  endPrice: number
): WaveLegDiagnostic {
  return {
    structure: "IMPULSE",
    scenario: "SELECTED",
    label,
    status: "CONFIRMED",
    confidence: 1,
    startIndex,
    endIndex,
    startPrice,
    endPrice,
    startTime: 0,
    endTime: 0,
  };
}

function bundleWithLegs(waveLegs: WaveLegDiagnostic[]): SymbolEvaluationBundle {
  const flatWaves = waveLegs.map((l) => ({
    label: l.label,
    startIndex: l.startIndex,
    endIndex: l.endIndex,
    confidence: 1,
    status: "CONFIRMED" as const,
  }));
  return {
    timeframeId: "1H",
    evaluationBarIndex: 100,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    candleCount: 120,
    diagnostics: {
      confirmedSwings: [],
      confirmedSwingCount: 0,
      swingConfig: {} as never,
      structurePairs: [],
      allStructures: [],
      trendSource: {} as never,
      waveLegs,
      fibonacci: { available: false },
      focus: { primary: null, alternative: null },
      overlaps: [],
      presentation: {} as never,
    },
    presentation: {
      engine: { flatWaves, impulseBullish: true },
    } as never,
  };
}

describe("wave projection context (14N-B)", () => {
  it("BASE_PLUS_REFERENCE_WAVE_DELTA pure math", () => {
    assert.equal(projectBasePlusReferenceWaveDelta(82_000, 208.4, 1.618), 82_000 + 208.4 * 1.618);
  });

  it("W3: ref W1 base W2_END relationship characterized", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR,
    }).plan!;
    const ctx = resolveWaveProjectionContext(
      plan,
      bundleWithLegs([
        leg("1", 10, 20, 78_337, 84_000),
        leg("2", 20, 30, 84_000, 82_000),
        leg("3", 30, 40, 82_000, 86_000),
      ])
    );
    assert.equal(ctx.currentWaveLabel, "3");
    assert.equal(ctx.objectiveWaveLabel, null);
    assert.equal(ctx.status, "RELATIONSHIPS_AVAILABLE");
    assert.equal(ctx.availableRelationships.length, 1);
    assert.equal(ctx.availableRelationships[0].referenceWave, "1");
    assert.equal(ctx.availableRelationships[0].baseAnchor, "W2_END");
    assert.equal(ctx.availableRelationships[0].referenceDelta, 84_000 - 78_337);
    assert.equal(ctx.availableRelationships[0].basePrice, 82_000);
  });

  it("W5: two reference candidates, base W4_END", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("5"),
      evaluationBar: BAR,
    }).plan!;
    const ctx = resolveWaveProjectionContext(
      plan,
      bundleWithLegs([
        leg("1", 10, 20, 78_337, 84_000),
        leg("2", 20, 30, 84_000, 82_000),
        leg("3", 30, 40, 82_000, 90_000),
        leg("4", 40, 50, 90_000, 88_000),
        leg("5", 50, 60, 88_000, 95_000),
      ])
    );
    assert.equal(ctx.availableRelationships.length, 2);
    assert.ok(
      ctx.availableRelationships.every((r) => r.baseAnchor === "W4_END")
    );
    const refs = ctx.availableRelationships.map((r) => r.referenceWave).sort();
    assert.deepEqual(refs, ["1", "3"]);
  });

  it("W4: no W3-shared templates; objective unresolved", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("4"),
      evaluationBar: BAR,
    }).plan!;
    const ctx = resolveWaveProjectionContext(
      plan,
      bundleWithLegs([
        leg("1", 10, 20, 78_337, 84_000),
        leg("2", 20, 30, 84_000, 82_000),
        leg("3", 30, 40, 82_000, 90_000),
        leg("4", 40, 50, 90_000, 88_000),
      ])
    );
    assert.equal(ctx.currentWaveLabel, "4");
    assert.equal(ctx.objectiveWaveLabel, null);
    assert.equal(ctx.availableRelationships.length, 0);
    assert.equal(ctx.status, "OBJECTIVE_WAVE_UNRESOLVED");
    assert.ok(ctx.semanticsNote.includes("W4"));
  });

  it("W3 and W4 contexts are not forced to same relationships", () => {
    const w3 = resolveWaveProjectionContext(
      buildEntryPlanFromSetup({ setup: impulseSetup("3"), evaluationBar: BAR }).plan!,
      bundleWithLegs([
        leg("1", 10, 20, 1, 2),
        leg("2", 20, 30, 2, 1.5),
        leg("3", 30, 40, 1.5, 3),
      ])
    );
    const w4 = resolveWaveProjectionContext(
      buildEntryPlanFromSetup({ setup: impulseSetup("4"), evaluationBar: BAR }).plan!,
      bundleWithLegs([
        leg("1", 10, 20, 1, 2),
        leg("2", 20, 30, 2, 1.5),
        leg("3", 30, 40, 1.5, 3),
        leg("4", 40, 50, 3, 2.8),
      ])
    );
    assert.notDeepEqual(
      w3.availableRelationships.map((r) => r.relationshipId),
      w4.availableRelationships.map((r) => r.relationshipId)
    );
  });

  it("production fib policy registry remains empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });
});
