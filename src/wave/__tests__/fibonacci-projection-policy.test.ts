import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FIB_EXTENSION_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  fibExtensionPrice,
  fibRetracementPrice,
} from "../fibonacci";
import { evaluateObjectiveTargetSource } from "../setup/objective-target-candidate-sources";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  extractW1LegAnchorsFromFibonacciDiagnostic,
  PRODUCTION_FIBONACCI_PROJECTION_POLICIES,
  resolveFibonacciProjectionPolicy,
} from "../setup/fibonacci-projection-policy";
import type { FibonacciObjectiveTargetProjectionPolicy } from "../setup/fibonacci-projection-policy-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";

const BAR = {
  evaluationBarIndex: 10,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

function testPolicySingle1618(): FibonacciObjectiveTargetProjectionPolicy {
  return {
    schemaVersion: "1.1",
    policyId: "TEST_SINGLE_1618",
    policyVersion: "test-only",
    provenance: "CALLER_POLICY",
    applicableSetupTypes: ["impulse-continuation"],
    anchorModel: "DIAGNOSTICS_W1_LEG_RANGE",
    allowedRatios: [1.618],
    selectionRule: { kind: "SINGLE_EXPLICIT", ratio: 1.618 },
  };
}

function testPolicyMultiNoRule(): FibonacciObjectiveTargetProjectionPolicy {
  return {
    schemaVersion: "1.1",
    policyId: "TEST_MULTI_AMBIGUOUS",
    policyVersion: "test-only",
    provenance: "CALLER_POLICY",
    applicableSetupTypes: ["impulse-continuation"],
    anchorModel: "DIAGNOSTICS_W1_LEG_RANGE",
    allowedRatios: [1.0, 1.618],
    selectionRule: { kind: "SINGLE_EXPLICIT", ratio: 1.618 },
  };
}

function setup(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: "BTCUSDT:1H:impulse-continuation:sc1",
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioRef: {
      scenarioId: "sc1",
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel: "3",
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
      startIndex: 5,
      endIndex: 8,
      startPrice: 84_000,
      endPrice: 86_000,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
    scenarioRef: {
      ...{
        scenarioId: "sc1",
        role: "CANDIDATE",
        structure: "IMPULSE",
        waveLabel: "3",
        scenarioStatus: "ACTIVE",
        engineStatus: "CONFIRMED",
      },
      ...overrides.scenarioRef,
    },
    sourceScenario: {
      confidence: 1,
      startIndex: 5,
      endIndex: 8,
      startPrice: 84_000,
      endPrice: 86_000,
      evidence: [],
      limitations: [],
      ...overrides.sourceScenario,
    },
  };
}

const fibDiagnostic = {
  available: true,
  impulseBullish: true,
  wave1StartIndex: 1,
  wave1EndIndex: 3,
  wave2EndIndex: 5,
  rangeStart: 78_337,
  rangeEnd: 84_000,
  conformanceScore: 0.5,
};

describe("fibonacci projection policy (14L)", () => {
  it("A: catalogs existing ratios", () => {
    assert.deepEqual([...FIB_RETRACEMENT_LEVELS], [0.382, 0.5, 0.618, 0.786]);
    assert.deepEqual([...FIB_EXTENSION_LEVELS], [1.0, 1.272, 1.618]);
  });

  it("B/C: extension helper bullish and bearish math", () => {
    assert.equal(fibExtensionPrice(100, 110, 1.618), 110 + 10 * 0.618);
    assert.equal(fibExtensionPrice(110, 100, 1.618), 100 + -10 * 0.618);
    assert.equal(fibRetracementPrice(100, 110, 0.618), 110 - 10 * 0.618);
  });

  it("I: production missing policy → TARGET_RATIO_POLICY_MISSING", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      sourceProvenance: "ENGINE_DIAGNOSTICS",
    });
    assert.equal(res.status, "TARGET_RATIO_POLICY_MISSING");
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: {
        diagnostics: { fibonacci: fibDiagnostic } as never,
        sourceProvenance: "ENGINE_DIAGNOSTICS",
      },
    });
    assert.equal(c.outcome, "INSUFFICIENT_CONTEXT");
    assert.ok(c.rationale.includes("TARGET_RATIO_POLICY_MISSING"));
  });

  it("J: explicit single-ratio test policy → AVAILABLE", () => {
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const c = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
      plan,
      sourceContext: {
        diagnostics: { fibonacci: fibDiagnostic } as never,
        fibonacciProjectionPolicy: testPolicySingle1618(),
      },
    });
    assert.equal(c.outcome, "AVAILABLE");
    assert.equal(c.projectionPolicyId, "TEST_SINGLE_1618");
    assert.equal(c.projectionRatio, 1.618);
    assert.equal(c.targetPrice, fibExtensionPrice(78_337, 84_000, 1.618));
  });

  it("K: multi allowedRatios without valid selection → ambiguous", () => {
    const bad: FibonacciObjectiveTargetProjectionPolicy = {
      ...testPolicyMultiNoRule(),
      allowedRatios: [1.0, 1.272],
      selectionRule: { kind: "SINGLE_EXPLICIT", ratio: 1.618 },
    };
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: bad,
    });
    assert.equal(res.status, "AMBIGUOUS_PROJECTION_POLICY");
  });

  it("L: policy not applicable to setup type", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup({ setupTypeId: "correction-end" }),
      evaluationBar: BAR,
    }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      fibonacciProjectionPolicy: testPolicySingle1618(),
    });
    assert.equal(res.status, "POLICY_NOT_APPLICABLE");
  });

  it("M: wave label mapping only when explicit in policy", () => {
    const policy: FibonacciObjectiveTargetProjectionPolicy = {
      ...testPolicySingle1618(),
      policyId: "TEST_BY_LABEL",
      selectionRule: {
        kind: "BY_WAVE_LABEL",
        mapping: { "3": 1.272 },
        fallback: "NONE",
      },
      allowedRatios: [1.272],
    };
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: policy,
    });
    assert.equal(res.status, "POLICY_READY");
    assert.equal(res.selectedRatio, 1.272);
    const plan5 = buildEntryPlanFromSetup({
      setup: setup({
        scenarioRef: { ...setup().scenarioRef, waveLabel: "5" },
      }),
      evaluationBar: BAR,
    }).plan!;
    const res5 = resolveFibonacciProjectionPolicy(plan5, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: policy,
    });
    assert.equal(res5.status, "AMBIGUOUS_PROJECTION_POLICY");
  });

  it("N: production registry has no implicit 1.618", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
      "utf8"
    );
    assert.ok(!text.includes("DEFAULT"));
    assert.ok(!text.includes("nearestFibMatch"));
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });

  it("E: anchors from diagnostics snapshot", () => {
    const anchors = extractW1LegAnchorsFromFibonacciDiagnostic(fibDiagnostic);
    assert.deepEqual(anchors, { rangeStartPrice: 78_337, rangeEndPrice: 84_000 });
  });

  it("H: policy module has no network or engine rerun", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
      "utf8"
    );
    assert.ok(!text.includes("fetch("));
    assert.ok(!text.includes("analyzeWave"));
    assert.ok(!text.includes("runWaveScan"));
  });
});
