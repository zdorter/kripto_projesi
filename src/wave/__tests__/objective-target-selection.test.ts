import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import {
  buildObjectiveTargetCandidateReport,
  objectiveTargetCandidatesAvailable,
} from "../setup/objective-target-candidate-sources";
import { entryPlanWithSelectedObjectiveTarget } from "../setup/objective-target-selection-bridge";
import { DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY } from "../setup/objective-target-selection-policy";
import { applyObjectiveTargetSelectionPolicy } from "../setup/objective-target-selection";
import type {
  ObjectiveTargetCandidate,
  ObjectiveTargetCandidateReport,
} from "../setup/objective-target-candidate-types";
import { evaluateTargetModel } from "../setup/target-model";
import type { SetupCandidate } from "../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";

const TF = "1H";
const CLOSED_BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "closed",
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
    setupTypeLabel: "Impulse",
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
      summary: "x",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
    ],
    sourceScenario: {
      confidence: 1,
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

function candidate(
  sourceId: ObjectiveTargetCandidate["sourceId"],
  outcome: ObjectiveTargetCandidate["outcome"],
  targetPrice?: number,
  bias: ObjectiveTargetCandidate["directionalBias"] = "BULLISH"
): ObjectiveTargetCandidate {
  return {
    schemaVersion: "1.0",
    sourceId,
    sourceLabel: sourceId,
    outcome,
    entryPlanId: "p1",
    setupId: "s1",
    setupTypeId: "impulse-continuation",
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioId: "sc1",
    directionalBias: bias,
    targetPrice,
    referenceSource: `test:${sourceId}`,
    rationale: "test",
    limitations: [],
  };
}

function reportFrom(
  candidates: ObjectiveTargetCandidate[]
): ObjectiveTargetCandidateReport {
  return {
    schemaVersion: "1.0",
    entryPlanId: "p1",
    setupId: "s1",
    setupTypeId: "impulse-continuation",
    symbol: "BTCUSDT",
    timeframe: TF,
    scenarioId: "sc1",
    candidates,
    limitations: [],
  };
}

describe("objective-target-selection 14D.9 policy", () => {
  it("A: Fib and Previous Swing AVAILABLE → Fib SELECTED", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
      ]),
    });
    assert.equal(sel.outcome, "SELECTED");
    assert.equal(sel.selectedCandidate?.sourceId, "FIBONACCI_PROJECTION");
    assert.equal(sel.selectedCandidate?.targetPrice, 87_500);
    assert.ok(sel.selectionReason.includes("first AVAILABLE source in policy precedence"));
    assert.ok(!sel.selectionReason.toLowerCase().includes("better"));
  });

  it("B: Fib INSUFFICIENT, Previous Swing AVAILABLE → Previous Swing SELECTED", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "INSUFFICIENT_CONTEXT"),
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
      ]),
    });
    assert.equal(sel.selectedCandidate?.sourceId, "PREVIOUS_SWING");
  });

  it("C: Fib NOT_APPLICABLE, ABC AVAILABLE (correction-end report)", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: {
        ...reportFrom([
          candidate("FIBONACCI_PROJECTION", "NOT_APPLICABLE"),
          candidate("ABC_PROJECTION", "AVAILABLE", 81_000),
        ]),
        setupTypeId: "correction-end",
      },
    });
    assert.equal(sel.selectedCandidate?.sourceId, "ABC_PROJECTION");
  });

  it("D: no AVAILABLE → NO_SELECTION", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "INSUFFICIENT_CONTEXT"),
        candidate("PREVIOUS_SWING", "INSUFFICIENT_CONTEXT"),
      ]),
    });
    assert.equal(sel.outcome, "NO_SELECTION");
    assert.equal(sel.selectedCandidate, null);
  });

  it("E: all sources AVAILABLE → precedence order", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("WAVE_STRUCTURE", "AVAILABLE", 89_000),
        candidate("ABC_PROJECTION", "AVAILABLE", 81_000),
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    });
    assert.equal(sel.selectedCandidate?.sourceId, "FIBONACCI_PROJECTION");
  });

  it("F: deterministic repeat", () => {
    const input = {
      report: reportFrom([
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    };
    const a = applyObjectiveTargetSelectionPolicy(input);
    const b = applyObjectiveTargetSelectionPolicy(input);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("G: candidate report unchanged", () => {
    const report = reportFrom([
      candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
    ]);
    const before = JSON.stringify(report);
    applyObjectiveTargetSelectionPolicy({ report });
    assert.equal(JSON.stringify(report), before);
  });

  it("H: BULLISH preserved on selection", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500, "BULLISH"),
      ]),
    });
    assert.equal(sel.selectedCandidate?.directionalBias, "BULLISH");
  });

  it("I: BEARISH preserved on selection", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 81_000, "BEARISH"),
      ]),
    });
    assert.equal(sel.selectedCandidate?.directionalBias, "BEARISH");
  });

  it("J: direction null with requiresDirectionalBias → INSUFFICIENT_CONTEXT", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500, null),
      ]),
    });
    assert.equal(sel.outcome, "INSUFFICIENT_CONTEXT");
    assert.equal(sel.selectedCandidate, null);
  });

  it("K: duplicate AVAILABLE same source → NO_SELECTION", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_600),
      ]),
    });
    assert.equal(sel.outcome, "NO_SELECTION");
  });

  it("L/M: no ranking or bestTarget APIs", () => {
    const dir = path.join(process.cwd(), "src/wave/setup");
    for (const file of [
      "objective-target-selection.ts",
      "objective-target-selection-types.ts",
      "objective-target-selection-policy.ts",
    ]) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      for (const token of [
        "bestTarget",
        "rankTargets",
        "selectBest",
        "probability",
        "optimalTarget",
      ]) {
        assert.ok(!text.includes(token), `${file}: ${token}`);
      }
    }
  });

  it("N/O: no trade signal vocabulary in selection types", () => {
    const text = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/wave/setup/objective-target-selection-types.ts"
      ),
      "utf8"
    );
    for (const token of ["BUY", "SELL", "LONG", "SHORT"]) {
      assert.ok(!text.includes(token), token);
    }
  });

  it("P: selection does not compute target prices", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/setup/objective-target-selection.ts"),
      "utf8"
    );
    assert.ok(!text.includes("fibExtensionPrice"));
    assert.ok(!text.includes("fibRetracementPrice"));
    assert.ok(!text.includes("evaluateObjectiveTargetSource"));
  });

  it("Q: policy id/version preserved", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    });
    assert.equal(sel.policyId, DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY.policyId);
    assert.equal(
      sel.policyVersion,
      DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY.policyVersion
    );
  });

  it("R: selection reason is stable", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    });
    assert.match(sel.selectionReason, /FIBONACCI_PROJECTION/);
    assert.match(sel.selectionReason, /policy precedence/);
  });

  it("S: trace fields on result", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    });
    assert.equal(sel.entryPlanId, "p1");
    assert.equal(sel.scenarioId, "sc1");
    assert.equal(sel.setupTypeId, "impulse-continuation");
  });

  it("T: bridge maps selected price to target model without inventing price", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: baseSetup(),
      evaluationBar: CLOSED_BAR,
    });
    assert.ok(plan);
    const report = buildObjectiveTargetCandidateReport({
      plan: plan!,
      sourceContext: {
        attestedFibonacciProjection: {
          rangeStartPrice: 83_000,
          rangeEndPrice: 84_000,
          extensionLevel: 1.618,
        },
      },
    });
    const sel = applyObjectiveTargetSelectionPolicy({ report });
    assert.equal(sel.outcome, "SELECTED");
    const bridged = entryPlanWithSelectedObjectiveTarget(plan!, sel);
    assert.ok(bridged);
    const ref = evaluateTargetModel("STRUCTURAL_TARGET_REFERENCE", {
      plan: bridged!,
    });
    assert.equal(ref.outcome, "TARGET_REFERENCE_AVAILABLE");
    assert.equal(ref.targetPrice, sel.selectedCandidate?.targetPrice);
  });

  it("synthetic: three AVAILABLE → Fib selected (not quality)", () => {
    const sel = applyObjectiveTargetSelectionPolicy({
      report: reportFrom([
        candidate("WAVE_STRUCTURE", "AVAILABLE", 89_000),
        candidate("PREVIOUS_SWING", "AVAILABLE", 88_100),
        candidate("FIBONACCI_PROJECTION", "AVAILABLE", 87_500),
      ]),
    });
    assert.equal(sel.selectedCandidate?.sourceId, "FIBONACCI_PROJECTION");
  });

  it("production-style report → NO_SELECTION", () => {
    const { plan } = buildEntryPlanFromSetup({
      setup: baseSetup(),
      evaluationBar: CLOSED_BAR,
    });
    assert.ok(plan);
    const report = buildObjectiveTargetCandidateReport({ plan: plan! });
    assert.equal(objectiveTargetCandidatesAvailable(report).length, 0);
    const sel = applyObjectiveTargetSelectionPolicy({ report });
    assert.equal(sel.outcome, "NO_SELECTION");
  });
});
