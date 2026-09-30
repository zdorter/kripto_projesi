import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  characterizeImpulseLegAtBar,
  resolveObjectiveWaveContext,
} from "../setup/objective-wave-resolution";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";

function impulseSetup(
  waveLabel: "3" | "4" | "5",
  status: "CONFIRMED" | "CANDIDATE" = "CONFIRMED"
): SetupCandidate {
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
    status,
    directionalBias: "BULLISH",
    directionalBasis: "IMPULSE_COUNT_DIRECTION",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: { conditions: [], summary: "x", usesScenarioInvalidation: true },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 30,
      endIndex: 40,
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

function bundleWithFlatWaves(
  waves: {
    label: "1" | "2" | "3" | "4" | "5";
    startIndex: number;
    endIndex: number;
    status: "CONFIRMED" | "POTENTIAL";
  }[],
  evaluationBarIndex: number
): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    candleCount: 200,
    diagnostics: {
      confirmedSwings: [],
      confirmedSwingCount: 0,
      swingConfig: {} as never,
      structurePairs: [],
      allStructures: [],
      trendSource: {} as never,
      waveLegs: [],
      fibonacci: { available: false },
      focus: { primary: null, alternative: null },
      overlaps: [],
      presentation: {} as never,
    },
    presentation: {
      engine: {
        flatWaves: waves.map((w) => ({
          label: w.label,
          startIndex: w.startIndex,
          endIndex: w.endIndex,
          confidence: 1,
          status: w.status,
        })),
        impulseBullish: true,
      },
    } as never,
  };
}

const BAR = (n: number) => ({
  evaluationBarIndex: n,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
});

describe("objective wave resolution (14N-C)", () => {
  it("setup CONFIRMED != objective resolved", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR(50),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(
      plan,
      bundleWithFlatWaves(
        [
          { label: "1", startIndex: 10, endIndex: 20, status: "CONFIRMED" },
          { label: "2", startIndex: 20, endIndex: 25, status: "CONFIRMED" },
          { label: "3", startIndex: 25, endIndex: 40, status: "CONFIRMED" },
          { label: "4", startIndex: 40, endIndex: 55, status: "POTENTIAL" },
        ],
        50
      )
    );
    assert.equal(plan.setupRef.sourceSetupStatus, "CONFIRMED");
    assert.equal(ctx.objectiveWaveLabel, null);
    assert.notEqual(ctx.status, "OBJECTIVE_WAVE_RESOLVED");
  });

  it("no objectiveWave = current+1 default", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("4"),
      evaluationBar: BAR(60),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(
      plan,
      bundleWithFlatWaves(
        [
          { label: "4", startIndex: 40, endIndex: 50, status: "CONFIRMED" },
          { label: "5", startIndex: 50, endIndex: 70, status: "CONFIRMED" },
        ],
        60
      )
    );
    assert.equal(ctx.objectiveWaveLabel, null);
    assert.ok(!ctx.evidence.some((e) => e.includes("objectiveWave = 5")));
  });

  it("W4 confirmed does not auto-resolve W5 as objective", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("4"),
      evaluationBar: BAR(50),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(
      plan,
      bundleWithFlatWaves(
        [
          { label: "4", startIndex: 30, endIndex: 45, status: "CONFIRMED" },
          { label: "5", startIndex: 60, endIndex: 70, status: "POTENTIAL" },
        ],
        50
      )
    );
    assert.equal(ctx.currentWaveState, "ENDPOINT_CONFIRMED");
    assert.equal(ctx.status, "NEXT_WAVE_NOT_ESTABLISHED");
    assert.equal(ctx.objectiveWaveLabel, null);
    assert.equal(ctx.nextStructuralEvidence.nextImpulseLegLabel, "5");
    assert.equal(ctx.nextStructuralEvidence.nextLegStartIndexAtOrBeforeBar, false);
  });

  it("W3 endpoint confirmed → CURRENT_WAVE_ALREADY_COMPLETED / temporally late", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR(45),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(plan, bundleWithFlatWaves(
      [
        { label: "3", startIndex: 25, endIndex: 40, status: "CONFIRMED" },
        { label: "4", startIndex: 40, endIndex: 55, status: "POTENTIAL" },
      ],
      45
    ));
    assert.equal(ctx.currentWaveState, "ENDPOINT_CONFIRMED");
    assert.equal(ctx.status, "CURRENT_WAVE_ALREADY_COMPLETED");
    assert.equal(ctx.temporalCompatibility, "TEMPORALLY_LATE_FOR_OBJECTIVE_W3");
  });

  it("W5 endpoint confirmed → temporally late for W5 objective", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("5"),
      evaluationBar: BAR(80),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(plan, bundleWithFlatWaves(
      [{ label: "5", startIndex: 60, endIndex: 75, status: "CONFIRMED" }],
      80
    ));
    assert.equal(ctx.status, "CURRENT_WAVE_ALREADY_COMPLETED");
    assert.equal(ctx.temporalCompatibility, "TEMPORALLY_LATE_FOR_OBJECTIVE_W5");
    assert.equal(ctx.nextStructuralEvidence.nextImpulseLegLabel, null);
  });

  it("historical evaluation: bar at p3 excludes p4/p5 for next evidence", () => {
    const bar = 35;
    const bundle = bundleWithFlatWaves(
      [
        { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
        { label: "4", startIndex: 40, endIndex: 50, status: "CONFIRMED" },
        { label: "5", startIndex: 50, endIndex: 60, status: "CONFIRMED" },
      ],
      bar
    );
    const w4State = characterizeImpulseLegAtBar(bundle, "4", bar);
    assert.equal(w4State.state, "NOT_STARTED");
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR(bar),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(plan, bundle);
    assert.equal(ctx.nextStructuralEvidence.nextLegStartIndexAtOrBeforeBar, false);
    assert.equal(ctx.objectiveWaveLabel, null);
  });

  it("W3 in progress: not temporally late", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR(35),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(plan, bundleWithFlatWaves(
      [{ label: "3", startIndex: 25, endIndex: 45, status: "POTENTIAL" }],
      35
    ));
    assert.equal(ctx.currentWaveState, "IN_PROGRESS");
    assert.equal(ctx.temporalCompatibility, "CURRENT_LEG_IN_PROGRESS");
    assert.equal(ctx.status, "OBJECTIVE_WAVE_UNRESOLVED");
  });

  it("relationship templates should be objective-wave keyed", () => {
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("3"),
      evaluationBar: BAR(50),
    }).plan!;
    const ctx = resolveObjectiveWaveContext(plan, bundleWithFlatWaves(
      [{ label: "3", startIndex: 25, endIndex: 40, status: "CONFIRMED" }],
      50
    ));
    assert.equal(ctx.relationshipTemplateKeyingVerdict, "OBJECTIVE_WAVE_KEYED_REQUIRED");
  });

  it("production fib registry empty; deterministic resolver", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
    const plan = buildEntryPlanFromSetup({
      setup: impulseSetup("4"),
      evaluationBar: BAR(50),
    }).plan!;
    const b = bundleWithFlatWaves(
      [{ label: "4", startIndex: 30, endIndex: 45, status: "CONFIRMED" }],
      50
    );
    const a = resolveObjectiveWaveContext(plan, b);
    const c = resolveObjectiveWaveContext(plan, b);
    assert.deepEqual(a, c);
  });
});
