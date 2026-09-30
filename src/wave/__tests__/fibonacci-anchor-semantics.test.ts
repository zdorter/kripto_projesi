import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fibExtensionPrice } from "../fibonacci";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { buildObjectiveTargetSourceContextForPlan } from "../setup/objective-target-production-context";
import {
  auditFibonacciAnchorLookahead,
  diagnosticProjectModelA,
  diagnosticProjectModelB,
  extractW1W2FibonacciAnchors,
} from "../setup/fibonacci-anchor-semantics";
import { anchorModelSupportVerdict } from "../setup/fibonacci-anchor-semantics";
import {
  PRODUCTION_FIBONACCI_PROJECTION_POLICIES,
  resolveFibonacciProjectionPolicy,
} from "../setup/fibonacci-projection-policy";
import type { FibonacciObjectiveTargetProjectionPolicy } from "../setup/fibonacci-projection-policy-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";
import type { SymbolEvaluationBundle } from "../setup/trade-setup-types";

const BAR = {
  evaluationBarIndex: 10,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "test",
};

const fibDiagnostic = {
  available: true,
  impulseBullish: true,
  wave1StartIndex: 1,
  wave1EndIndex: 3,
  wave2EndIndex: 5,
  rangeStart: 78_337,
  rangeEnd: 84_000,
  actualRetracePrice: 82_000,
  conformanceScore: 0.5,
};

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
      scenarioId: "sc1",
      role: "CANDIDATE",
      structure: "IMPULSE",
      waveLabel: "3",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
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

function testPolicyModelA(): FibonacciObjectiveTargetProjectionPolicy {
  return {
    schemaVersion: "1.1",
    policyId: "TEST_MODEL_A",
    policyVersion: "test-only",
    provenance: "CALLER_POLICY",
    applicableSetupTypes: ["impulse-continuation"],
    anchorModel: "DIAGNOSTICS_W1_LEG_RANGE",
    allowedRatios: [1.618],
    selectionRule: { kind: "SINGLE_EXPLICIT", ratio: 1.618 },
  };
}

function testPolicyModelB(): FibonacciObjectiveTargetProjectionPolicy {
  return {
    ...testPolicyModelA(),
    policyId: "TEST_MODEL_B",
    anchorModel: "W2_END_BASED_W1_DELTA",
    allowedRatios: [1.618],
  };
}

function minimalBundle(
  confirmedSwings: SymbolEvaluationBundle["diagnostics"]["confirmedSwings"]
): SymbolEvaluationBundle {
  return {
    timeframeId: "1H",
    evaluationBarIndex: 10,
    evaluationBarBoundaryEstablished: true,
    evaluationBarContractDetail: "test",
    candleCount: 100,
    diagnostics: {
      confirmedSwings,
      confirmedSwingCount: confirmedSwings.length,
      swingConfig: {} as never,
      structurePairs: [],
      allStructures: [],
      trendSource: {} as never,
      waveLegs: [],
      fibonacci: fibDiagnostic,
      focus: { primary: null, alternative: null },
      overlaps: [],
      presentation: {} as never,
    },
    presentation: {} as never,
  };
}

describe("fibonacci anchor semantics (14M)", () => {
  it("MODEL A test policy uses fibExtensionPrice exact price", () => {
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: testPolicyModelA(),
    });
    assert.equal(res.status, "POLICY_READY");
    assert.equal(
      res.projectionPrice,
      fibExtensionPrice(78_337, 84_000, 1.618)
    );
  });

  it("MODEL B test policy uses W2 end + W1 delta × ratio", () => {
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const anchors = extractW1W2FibonacciAnchors(fibDiagnostic)!;
    const expected = diagnosticProjectModelB(anchors, 1.618);
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: testPolicyModelB(),
    });
    assert.equal(res.status, "POLICY_READY");
    assert.equal(res.projectionPrice, expected);
    assert.notEqual(res.projectionPrice, fibExtensionPrice(78_337, 84_000, 1.618));
  });

  it("support verdicts: A supported, B requires domain policy", () => {
    assert.equal(
      anchorModelSupportVerdict("DIAGNOSTICS_W1_LEG_RANGE"),
      "SUPPORTED_BY_EXISTING_CONTRACT"
    );
    assert.equal(
      anchorModelSupportVerdict("W2_END_BASED_W1_DELTA"),
      "REQUIRES_DOMAIN_POLICY"
    );
  });

  it("production registry remains empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });

  it("ANCHOR_TEMPORALLY_INVALID when fib indices beyond evaluation bar", () => {
    const plan = buildEntryPlanFromSetup({
      setup: setup(),
      evaluationBar: { ...BAR, evaluationBarIndex: 4 },
    }).plan!;
    const res = resolveFibonacciProjectionPolicy(plan, {
      diagnostics: { fibonacci: fibDiagnostic } as never,
      fibonacciProjectionPolicy: testPolicyModelA(),
    });
    assert.equal(res.status, "ANCHOR_TEMPORALLY_INVALID");
    assert.equal(res.projectionPrice, null);
  });

  it("historical fixture: confirmedSwings after evaluation bar excluded from context", () => {
    const plan = buildEntryPlanFromSetup({ setup: setup(), evaluationBar: BAR }).plan!;
    const bundle = minimalBundle([
      { index: 5, type: "LOW", price: 95, time: 0, strength: 1 },
      { index: 20, type: "HIGH", price: 99, time: 0, strength: 1 },
    ]);
    const ctx = buildObjectiveTargetSourceContextForPlan(plan, bundle);
    assert.ok(ctx.diagnostics!.confirmedSwings.every((s) => s.index <= 10));
    assert.equal(ctx.diagnostics!.confirmedSwings.length, 1);
  });

  it("lookahead audit flags future fib indices", () => {
    const audit = auditFibonacciAnchorLookahead({
      evaluationBarIndex: 4,
      fib: fibDiagnostic,
      confirmedSwingsAtBar: [],
    });
    assert.equal(audit.safe, false);
    assert.ok(audit.findings.some((f) => f.includes("POTENTIAL_LOOKAHEAD_RISK")));
  });

  it("deterministic MODEL A diagnostic math", () => {
    const anchors = extractW1W2FibonacciAnchors(fibDiagnostic)!;
    assert.equal(
      diagnosticProjectModelA(anchors, 1.272),
      fibExtensionPrice(78_337, 84_000, 1.272)
    );
  });
});
