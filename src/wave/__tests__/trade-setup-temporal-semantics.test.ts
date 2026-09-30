import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import {
  prospectiveSetupSupportVerdict,
  resolveTradeSetupTemporalContext,
} from "../setup/trade-setup-temporal-semantics";
import { TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT } from "../setup/trade-setup-temporal-types";
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
      endIndex: 45,
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

function correctionSetup(status: "CONFIRMED" | "CANDIDATE" = "CONFIRMED"): SetupCandidate {
  return {
    ...impulseSetup("3", status),
    id: "BTCUSDT:1H:correction-end:sc-c",
    setupTypeId: "correction-end",
    setupTypeLabel: "Correction end",
    scenarioRef: {
      scenarioId: "sc-c",
      role: "CANDIDATE",
      structure: "CORRECTIVE",
      waveLabel: "C",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
    },
  };
}

function bundle(
  waves: {
    label: string;
    startIndex: number;
    endIndex: number;
    status: "CONFIRMED" | "POTENTIAL";
  }[],
  evaluationBarIndex: number,
  waveLegs: SymbolEvaluationBundle["diagnostics"]["waveLegs"] = []
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
      waveLegs,
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

describe("trade setup temporal semantics (14N-D)", () => {
  it("CONFIRMED endpoint → HISTORICAL_STRUCTURE, not prospective objective", () => {
    const ctx = resolveTradeSetupTemporalContext(
      impulseSetup("3"),
      bundle([{ label: "3", startIndex: 25, endIndex: 40, status: "CONFIRMED" }], 50)
    );
    assert.equal(ctx.temporalClass, "HISTORICAL_STRUCTURE");
    assert.equal(ctx.objectiveEligibility, "OBJECTIVE_ALREADY_COMPLETED");
    assert.equal(ctx.prospectiveWave, null);
  });

  it("setup CONFIRMED != objective ELIGIBLE", () => {
    const setup = impulseSetup("4");
    assert.equal(setup.status, "CONFIRMED");
    const ctx = resolveTradeSetupTemporalContext(
      setup,
      bundle(
        [
          { label: "4", startIndex: 30, endIndex: 45, status: "CONFIRMED" },
          { label: "5", startIndex: 60, endIndex: 70, status: "POTENTIAL" },
        ],
        50
      )
    );
    assert.notEqual(ctx.objectiveEligibility, "ELIGIBLE");
  });

  it("W4 complete does not auto prospective W5", () => {
    const ctx = resolveTradeSetupTemporalContext(
      impulseSetup("4"),
      bundle(
        [
          { label: "4", startIndex: 30, endIndex: 45, status: "CONFIRMED" },
          { label: "5", startIndex: 60, endIndex: 70, status: "CONFIRMED" },
        ],
        50
      )
    );
    assert.equal(ctx.prospectiveWave, null);
    assert.equal(ctx.transitionEvidence.nextLegStartAtOrBeforeBar, false);
  });

  it("correction-end C confirmed is historical; not new impulse", () => {
    const ctx = resolveTradeSetupTemporalContext(
      correctionSetup(),
      bundle(
        [{ label: "C", startIndex: 40, endIndex: 55, status: "CONFIRMED" }],
        60,
        [
          {
            structure: "CORRECTIVE",
            scenario: "SELECTED",
            label: "C",
            status: "CONFIRMED",
            confidence: 1,
            startIndex: 40,
            endIndex: 55,
            startPrice: 1,
            endPrice: 2,
            startTime: 0,
            endTime: 0,
          },
        ]
      )
    );
    assert.equal(ctx.semanticKind, "CORRECTIVE_C_LEG_ENDPOINT_CONFIRMATION");
    assert.equal(ctx.objectiveEligibility, "OBJECTIVE_ALREADY_COMPLETED");
    assert.ok(
      ctx.transitionEvidence.notes.some((n) => n.includes("correction ended"))
    );
  });

  it("in-progress focus → CURRENT_STRUCTURE", () => {
    const ctx = resolveTradeSetupTemporalContext(
      impulseSetup("3", "CANDIDATE"),
      bundle([{ label: "3", startIndex: 25, endIndex: 55, status: "POTENTIAL" }], 40)
    );
    assert.equal(ctx.focusWaveState, "IN_PROGRESS");
    assert.equal(ctx.temporalClass, "CURRENT_STRUCTURE");
    assert.equal(ctx.objectiveEligibility, "OBJECTIVE_UNRESOLVED");
  });

  it("historical bar excludes future wave for transition evidence", () => {
    const ctx = resolveTradeSetupTemporalContext(
      impulseSetup("3"),
      bundle(
        [
          { label: "3", startIndex: 20, endIndex: 30, status: "CONFIRMED" },
          { label: "4", startIndex: 50, endIndex: 60, status: "CONFIRMED" },
        ],
        35
      )
    );
    assert.equal(ctx.transitionEvidence.nextLegStartAtOrBeforeBar, false);
  });

  it("target gate verdict REQUIRED; registry empty", () => {
    assert.equal(TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT, "REQUIRED");
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
    assert.equal(prospectiveSetupSupportVerdict(), "NO_PROSPECTIVE_SETUP_SUPPORTED");
  });

  it("deterministic classification", () => {
    const setup = impulseSetup("5");
    const b = bundle([{ label: "5", startIndex: 50, endIndex: 70, status: "CONFIRMED" }], 80);
    assert.deepEqual(
      resolveTradeSetupTemporalContext(setup, b),
      resolveTradeSetupTemporalContext(setup, b)
    );
  });
});
