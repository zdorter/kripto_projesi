import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateObjectiveTargetEligibilityGate } from "../setup/objective-target-eligibility-gate";
import { resolveProspectiveSetupContract } from "../setup/prospective-setup-contract";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { resolveTradeSetupTemporalContext } from "../setup/trade-setup-temporal-semantics";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";

function historicalImpulse(waveLabel: "3" | "4"): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: `BTCUSDT:1H:impulse-continuation:imp-${waveLabel}`,
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: `imp-${waveLabel}`,
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
      conditions: [{ conditionId: "x", outcome: "MET", detail: "" }],
      summary: "x",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [],
    sourceScenario: {
      confidence: 1,
      startIndex: 20,
      endIndex: 30,
      startPrice: 100,
      endPrice: 110,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
  };
}

function bundleAt(
  bar: number,
  waves: {
    label: string;
    startIndex: number;
    endIndex: number;
    status: "CONFIRMED" | "POTENTIAL";
  }[],
  swings: { index: number; type: "HIGH" | "LOW"; price: number }[] = []
): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex: bar,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    candleCount: 200,
    diagnostics: {
      confirmedSwings: swings.map((s) => ({
        index: s.index,
        type: s.type,
        price: s.price,
        time: 0,
        strength: 1,
      })),
      confirmedSwingCount: swings.length,
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

describe("prospective setup contract (14N-E)", () => {
  it("completed structure alone is not PHASE_IN_PROGRESS", () => {
    const setup = historicalImpulse("3");
    const b = bundleAt(50, [
      { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
    ]);
    const r = resolveProspectiveSetupContract({ historicalSetup: setup, bundle: b });
    assert.notEqual(r.phaseStatus, "PHASE_IN_PROGRESS");
    assert.equal(r.prospectiveWaveLabel, null);
  });

  it("PHASE_IN_PROGRESS when open WaveCandidate leg spans past bar", () => {
    const setup = historicalImpulse("3");
    const b = bundleAt(35, [
      { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
      { label: "4", startIndex: 32, endIndex: 45, status: "POTENTIAL" },
    ]);
    const r = resolveProspectiveSetupContract({ historicalSetup: setup, bundle: b });
    assert.equal(r.phaseStatus, "PHASE_IN_PROGRESS");
    assert.ok(r.openLeg);
    assert.equal(r.prospectiveWaveLabel, null);
    assert.equal(r.labelFreeVerdict, "SUPPORTED");
  });

  it("future swing excluded at bar N", () => {
    const setup = historicalImpulse("3");
    const b = bundleAt(35, [
      { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
      { label: "4", startIndex: 50, endIndex: 60, status: "CONFIRMED" },
    ]);
    const r = resolveProspectiveSetupContract({ historicalSetup: setup, bundle: b });
    assert.notEqual(r.phaseStatus, "PHASE_IN_PROGRESS");
    assert.equal(r.transitionEvidence.candidateLegStartIndex, null);
  });

  it("no current+1 prospectiveWaveLabel", () => {
    const setup = historicalImpulse("4");
    const b = bundleAt(55, [
      { label: "4", startIndex: 30, endIndex: 45, status: "CONFIRMED" },
      { label: "5", startIndex: 46, endIndex: 70, status: "POTENTIAL" },
    ]);
    const r = resolveProspectiveSetupContract({ historicalSetup: setup, bundle: b });
    assert.equal(r.prospectiveWaveLabel, null);
  });

  it("replay N vs N+5 deterministic and may differ", () => {
    const setup = historicalImpulse("3");
    const waves = [
      { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" as const },
      { label: "4", startIndex: 32, endIndex: 45, status: "POTENTIAL" as const },
    ];
    const r35a = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: bundleAt(35, waves),
    });
    const r35b = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: bundleAt(35, waves),
    });
    assert.deepEqual(r35a, r35b);
    const r46 = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: bundleAt(46, [
        { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
        { label: "4", startIndex: 32, endIndex: 45, status: "CONFIRMED" },
      ]),
    });
    assert.equal(r35a.phaseStatus, "PHASE_IN_PROGRESS");
    assert.equal(r46.phaseStatus, "PHASE_ALREADY_COMPLETED");
  });

  it("target gate prep: ELIGIBLE only with phase in progress + invalidation", () => {
    const setup = historicalImpulse("3");
    const r = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: bundleAt(35, [
        { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
        { label: "4", startIndex: 32, endIndex: 45, status: "POTENTIAL" },
      ]),
    });
    const gate = evaluateObjectiveTargetEligibilityGate(r);
    if (r.objectiveEligibility === "ELIGIBLE") {
      assert.equal(gate.outcome, "PASS");
    } else {
      assert.equal(gate.outcome, "FAIL");
    }
  });

  it("existing historical setup lifecycle unchanged", () => {
    const setup = historicalImpulse("3");
    const b = bundleAt(50, [
      { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
    ]);
    const temporal = resolveTradeSetupTemporalContext(setup, b);
    assert.equal(temporal.temporalClass, "HISTORICAL_STRUCTURE");
    assert.equal(setup.setupTypeId, "impulse-continuation");
  });

  it("registry empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });

  it("TRANSITION_OBSERVED without open leg → engine cannot represent open objective leg", () => {
    const setup = historicalImpulse("3");
    const r = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle: bundleAt(
        35,
        [{ label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" }],
        [{ index: 32, type: "LOW", price: 105 }]
      ),
    });
    assert.equal(r.phaseStatus, "TRANSITION_OBSERVED");
    assert.equal(r.supportVerdict, "ENGINE_CANNOT_REPRESENT_OPEN_OBJECTIVE_LEG");
  });
});
