import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import { HISTORICAL_POSITION_PATH_SCHEMA_VERSION } from "../historical-position-path-contract";
import { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "../historical-position-path-contract";
import type { HistoricalPositionPathResult } from "../historical-position-path-types";
import {
  classifyHistoricalPositionOutcomePolicy,
  HistoricalPositionOutcomePolicyMapperError,
} from "../historical-position-outcome-policy";
import {
  isHistoricalPositionPolicyDecisiveClassification,
  isHistoricalPositionPolicyMeasuredClassification,
  isHistoricalPositionPolicyUnmeasuredClassification,
} from "../historical-position-outcome-policy-contract";
import {
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
  type HistoricalPositionOutcomePolicyId,
  type HistoricalPositionPolicyClassification,
} from "../historical-position-outcome-policy-types";

function pathResult(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  overrides: Partial<HistoricalPositionPathResult> = {}
): HistoricalPositionPathResult {
  return {
    schemaVersion: HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
    positionModelId: HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
    snapshotId: "snap:test",
    outcome,
    b6ReplayOutcome: outcome,
    evaluationBarIndex: 10,
    horizonBars: 24,
    futureBarsAvailable: 20,
    resolutionBarIndex: outcome === "NO_TOUCH" ? null : 12,
    barsAfterEvaluation: outcome === "NO_TOUCH" ? 24 : 2,
    targetTouched: outcome === "TARGET_TOUCHED" || outcome === "AMBIGUOUS",
    invalidationTouched:
      outcome === "INVALIDATION_TOUCHED" || outcome === "AMBIGUOUS",
    direction: "BULLISH",
    entryReferencePrice: 100,
    targetReferencePrice: 110,
    invalidationReferencePrice: 95,
    limitations: [],
    ...overrides,
  };
}

function expectClassification(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  classification: HistoricalPositionPolicyClassification,
  overrides?: Partial<HistoricalPositionPathResult>
): void {
  const result = classifyHistoricalPositionOutcomePolicy(
    pathResult(outcome, overrides)
  );
  assert.equal(result.classification, classification);
  assert.equal(
    result.policyId,
    POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
  );
}

describe("historical position outcome policy mapper (B-10d)", () => {
  it("A–F: canonical path outcome → classification", () => {
    expectClassification("TARGET_TOUCHED", "FAVORABLE_RESOLUTION");
    expectClassification("INVALIDATION_TOUCHED", "ADVERSE_RESOLUTION");
    expectClassification("AMBIGUOUS", "INCONCLUSIVE_SAME_BAR");
    expectClassification("NO_TOUCH", "UNRESOLVED_AT_HORIZON");
    expectClassification("NO_FUTURE_DATA", "UNMEASURED_NO_FUTURE");
    expectClassification("INSUFFICIENT_CONTEXT", "UNMEASURED_INSUFFICIENT");
  });

  it("G–H: default and explicit DECISIVE_V1 policy", () => {
    const path = pathResult("TARGET_TOUCHED");
    const defaultResult = classifyHistoricalPositionOutcomePolicy(path);
    const explicitResult = classifyHistoricalPositionOutcomePolicy(
      path,
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
    );
    assert.deepEqual(explicitResult, defaultResult);
    assert.equal(
      defaultResult.policyId,
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
    );
  });

  it("I: unsupported policy → explicit failure", () => {
    const unsupported =
      "POSITION_OUTCOME_POLICY_UNKNOWN" as HistoricalPositionOutcomePolicyId;
    assert.throws(
      () =>
        classifyHistoricalPositionOutcomePolicy(
          pathResult("TARGET_TOUCHED"),
          unsupported
        ),
      (err: unknown) => {
        assert.ok(err instanceof HistoricalPositionOutcomePolicyMapperError);
        assert.equal(err.code, "UNSUPPORTED_POLICY_ID");
        assert.equal(err.policyId, unsupported);
        return true;
      }
    );
  });

  it("J–M: direction does not flip favorable/adverse mapping", () => {
    expectClassification("TARGET_TOUCHED", "FAVORABLE_RESOLUTION", {
      direction: "BULLISH",
    });
    expectClassification("TARGET_TOUCHED", "FAVORABLE_RESOLUTION", {
      direction: "BEARISH",
    });
    expectClassification("INVALIDATION_TOUCHED", "ADVERSE_RESOLUTION", {
      direction: "BULLISH",
    });
    expectClassification("INVALIDATION_TOUCHED", "ADVERSE_RESOLUTION", {
      direction: "BEARISH",
    });
  });

  it("N–P: non-decisive and unmeasured classifications", () => {
    for (const c of [
      "INCONCLUSIVE_SAME_BAR",
      "UNRESOLVED_AT_HORIZON",
    ] as const) {
      assert.ok(isHistoricalPositionPolicyMeasuredClassification(c));
      assert.ok(!isHistoricalPositionPolicyDecisiveClassification(c));
    }
    for (const c of [
      "UNMEASURED_NO_FUTURE",
      "UNMEASURED_INSUFFICIENT",
    ] as const) {
      assert.ok(isHistoricalPositionPolicyUnmeasuredClassification(c));
      assert.ok(!isHistoricalPositionPolicyDecisiveClassification(c));
    }
    assert.ok(
      isHistoricalPositionPolicyDecisiveClassification("FAVORABLE_RESOLUTION")
    );
    assert.ok(
      isHistoricalPositionPolicyDecisiveClassification("ADVERSE_RESOLUTION")
    );
  });

  it("Q: direction field does not alter classification for same outcome", () => {
    const bullish = classifyHistoricalPositionOutcomePolicy(
      pathResult("NO_TOUCH", { direction: "BULLISH" })
    );
    const bearish = classifyHistoricalPositionOutcomePolicy(
      pathResult("NO_TOUCH", { direction: "BEARISH" })
    );
    assert.equal(bullish.classification, bearish.classification);
  });

  it("R–S: reference prices and direction do not alter classification", () => {
    const favorableLowRr = classifyHistoricalPositionOutcomePolicy(
      pathResult("TARGET_TOUCHED", {
        targetReferencePrice: 50,
        invalidationReferencePrice: 200,
        entryReferencePrice: 1,
        direction: "BEARISH",
      })
    );
    const favorableHighRr = classifyHistoricalPositionOutcomePolicy(
      pathResult("TARGET_TOUCHED", {
        targetReferencePrice: 999,
        invalidationReferencePrice: 1,
        entryReferencePrice: 500,
        direction: "BULLISH",
      })
    );
    assert.equal(
      favorableLowRr.classification,
      "FAVORABLE_RESOLUTION"
    );
    assert.equal(
      favorableHighRr.classification,
      "FAVORABLE_RESOLUTION"
    );

    const adverse = classifyHistoricalPositionOutcomePolicy(
      pathResult("INVALIDATION_TOUCHED", {
        targetReferencePrice: 999,
        invalidationReferencePrice: 1,
      })
    );
    assert.equal(adverse.classification, "ADVERSE_RESOLUTION");
  });

  it("T: mapper does not mutate pathResult", () => {
    const path = pathResult("AMBIGUOUS");
    const frozen = JSON.stringify(path);
    classifyHistoricalPositionOutcomePolicy(path);
    assert.equal(JSON.stringify(path), frozen);
  });

  it("U: deterministic repeated mapping", () => {
    const path = pathResult("TARGET_TOUCHED");
    assert.deepEqual(
      classifyHistoricalPositionOutcomePolicy(path),
      classifyHistoricalPositionOutcomePolicy(path)
    );
  });

  it("V: exactly one classification per path", () => {
    const result = classifyHistoricalPositionOutcomePolicy(
      pathResult("TARGET_TOUCHED")
    );
    assert.equal(typeof result.classification, "string");
    assert.equal(Object.keys(result).sort().join(","), "classification,policyId");
  });
});
