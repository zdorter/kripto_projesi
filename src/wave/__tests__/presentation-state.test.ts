import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapToPresentationState } from "../presentation-state";
import { WaveAnalysis, WaveCandidate, WaveLabel } from "../types";

function leg(
  label: WaveLabel,
  startIndex: number,
  endIndex: number,
  status: WaveCandidate["status"],
  confidence: number,
  extra?: Partial<WaveCandidate>
): WaveCandidate {
  return {
    label,
    startIndex,
    endIndex,
    confidence,
    status,
    ...extra,
  };
}

function impulseSet(
  overrides: Partial<Record<WaveLabel, Partial<WaveCandidate>>> = {}
): WaveCandidate[] {
  const defaults: WaveCandidate[] = [
    leg("1", 0, 2, "CONFIRMED", 70),
    leg("2", 2, 4, "CONFIRMED", 70),
    leg("3", 4, 6, "CONFIRMED", 70),
    leg("4", 6, 8, "CONFIRMED", 70),
    leg("5", 8, 10, "CONFIRMED", 70),
  ];
  return defaults.map((w) => ({ ...w, ...overrides[w.label] }));
}

function correctiveSet(
  overrides: Partial<Record<WaveLabel, Partial<WaveCandidate>>> = {}
): WaveCandidate[] {
  const defaults: WaveCandidate[] = [
    leg("A", 10, 12, "CONFIRMED", 65),
    leg("B", 12, 14, "CONFIRMED", 65),
    leg("C", 14, 16, "CONFIRMED", 65),
  ];
  return defaults.map((w) => ({ ...w, ...overrides[w.label] }));
}

function baseAnalysis(
  partial: Partial<WaveAnalysis> & { waves: WaveCandidate[] }
): WaveAnalysis {
  return {
    trend: "NEUTRAL",
    confidence: 68,
    alternativeScenarios: [],
    currentWave: "C",
    ...partial,
  };
}

describe("presentation-state", () => {
  it("Test 1: IMPULSE primary, CORRECTIVE alternative focus", () => {
    const analysis = baseAnalysis({
      waves: [
        ...impulseSet({ "5": { endIndex: 30, confidence: 80 } }),
        ...correctiveSet({ C: { endIndex: 12, confidence: 50 } }),
      ],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.primary?.structure, "IMPULSE");
    assert.equal(state.primary?.wave, "5");
    assert.equal(state.alternative?.structure, "CORRECTIVE");
    assert.equal(state.alternative?.scenario, "SELECTED_ALTERNATIVE");
  });

  it("Test 2: CORRECTIVE primary, IMPULSE alternative focus", () => {
    const analysis = baseAnalysis({
      waves: [
        ...impulseSet({
          "5": {
            startIndex: 16,
            endIndex: 18,
            status: "POTENTIAL",
            confidence: 48,
          },
        }),
        ...correctiveSet({
          C: {
            startIndex: 16,
            endIndex: 18,
            status: "CONFIRMED",
            confidence: 68,
          },
        }),
      ],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.primary?.structure, "CORRECTIVE");
    assert.equal(state.primary?.wave, "C");
    assert.equal(state.alternative?.structure, "IMPULSE");
    assert.equal(state.alternative?.wave, "5");
  });

  it("Test 3: shared segment creates overlaps entry", () => {
    const analysis = baseAnalysis({
      waves: [
        ...impulseSet({
          "5": { startIndex: 16, endIndex: 18, status: "POTENTIAL", confidence: 48 },
        }),
        ...correctiveSet({
          C: { startIndex: 16, endIndex: 18, status: "CONFIRMED", confidence: 68 },
        }),
      ],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.overlaps.length, 1);
    assert.equal(state.overlaps[0].startIndex, 16);
    assert.equal(state.overlaps[0].endIndex, 18);
    assert.equal(state.overlaps[0].legs.length, 2);
  });

  it("Test 4: leading-leg rules pick C over legacy currentWave preference", () => {
    const analysis = baseAnalysis({
      currentWave: "C",
      waves: [
        ...impulseSet({
          "5": { startIndex: 16, endIndex: 18, status: "POTENTIAL", confidence: 48 },
        }),
        ...correctiveSet({
          C: { startIndex: 16, endIndex: 18, status: "CONFIRMED", confidence: 68 },
        }),
      ],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.engine.currentWaveLegacy, "C");
    assert.equal(state.primary?.wave, "C");
    assert.equal(state.primary?.status, "CONFIRMED");
    assert.notEqual(state.primary?.selectionReason.toLowerCase(), "");
    assert.ok(!state.primary?.selectionReason.includes("currentWaveLabel"));
  });

  it("Test 5: BEARISH trend with corrective C primary is valid", () => {
    const analysis = baseAnalysis({
      trend: "BEARISH",
      waves: [
        ...impulseSet({
          "5": { startIndex: 16, endIndex: 18, status: "POTENTIAL", confidence: 48 },
        }),
        ...correctiveSet({
          C: { startIndex: 16, endIndex: 18, status: "CONFIRMED", confidence: 68 },
        }),
      ],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.marketTrend, "BEARISH");
    assert.equal(state.primary?.wave, "C");
    assert.equal(state.scoreDisclaimer, "RULE_CONFORMANCE_NOT_PROBABILITY");
  });

  it("Test 6: trend vs impulse direction yields CONFLICTING, not invalid", () => {
    const analysis = baseAnalysis({
      trend: "BEARISH",
      waves: impulseSet(),
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.equal(state.trendContext.alignment, "CONFLICTING");
    assert.equal(state.primary?.structure, "IMPULSE");
    assert.equal(state.ruleConformanceScore, 68);
  });

  it("Test 7: invalidation keeps structure/scenario scope", () => {
    const analysis = baseAnalysis({
      waves: impulseSet({
        "2": {
          status: "INVALIDATED",
          invalidationPrice: 100,
          confidence: 24,
        },
      }),
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    const inv = state.tracks.selectedImpulse.invalidation;
    assert.ok(inv);
    assert.equal(inv.structure, "IMPULSE");
    assert.equal(inv.scenario, "SELECTED");
    assert.equal(inv.wave, "2");
    assert.equal(inv.price, 100);
    assert.equal(inv.reason, "WAVE2_BREAK");
  });

  it("Test 8: rival impulse isolated from primary/alternative focus", () => {
    const rival = impulseSet().map((w) => ({
      ...w,
      confidence: Math.round(68 * 0.85),
    }));
    const analysis = baseAnalysis({
      waves: [
        ...impulseSet({ "5": { endIndex: 30, confidence: 80 } }),
        ...correctiveSet({ C: { endIndex: 12 } }),
      ],
      alternativeScenarios: [rival],
    });
    const state = mapToPresentationState(analysis, { impulseBullish: true });
    assert.ok(state.tracks.rivalImpulse);
    assert.equal(state.tracks.rivalImpulse?.scenario, "RIVAL");
    assert.equal(state.tracks.rivalImpulse?.countDirection, "BEARISH");
    assert.equal(state.primary?.structure, "IMPULSE");
    assert.notEqual(state.primary?.scenario, "RIVAL");
    assert.notEqual(state.alternative?.scenario, "RIVAL");
  });
});
