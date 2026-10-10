import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";
import {
  assertHistoricalPositionOutcomePolicyMapComplete,
  HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING,
  HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_DEFINITIONS,
  HISTORICAL_POSITION_OUTCOME_POLICY_DIRECTION_SEMANTICS,
  HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS,
  HISTORICAL_POSITION_OUTCOME_POLICY_PATH_IMMUTABILITY,
  HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT,
  HISTORICAL_POSITION_OUTCOME_POLICY_RR_INDEPENDENCE,
  HISTORICAL_POSITION_OUTCOME_POLICY_SINGLE_RESULT_RULE,
  HISTORICAL_POSITION_OUTCOME_POLICY_TRADE_EVALUATION_INDEPENDENCE,
  isHistoricalPositionPolicyDecisiveClassification,
  isHistoricalPositionPolicyMeasuredClassification,
  isHistoricalPositionPolicyUnmeasuredClassification,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP,
} from "../historical-position-outcome-policy-contract";
import {
  HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_IDS,
  HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION,
  HISTORICAL_POSITION_OUTCOME_POLICY_IDS,
  HISTORICAL_POSITION_POLICY_CLASSIFICATIONS,
  POSITION_OUTCOME_POLICY_DECISIVE_V1_SHORT_NAME,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_MODEL_ID,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
} from "../historical-position-outcome-policy-types";
import { HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1 } from "../historical-position-path-contract";
import { TRADE_EVALUATION_MIN_RR } from "../setup/trade-evaluation-contract";

const ALL_PATH_OUTCOMES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

describe("historical position outcome policy contract (B-10c)", () => {
  it("A: canonical policy ID and short name", () => {
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
      "POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0"
    );
    assert.equal(POSITION_OUTCOME_POLICY_DECISIVE_V1_SHORT_NAME, "DECISIVE_V1");
    assert.deepEqual(HISTORICAL_POSITION_OUTCOME_POLICY_IDS, [
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
    ]);
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_MODEL_ID,
      HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1
    );
  });

  it("B: policy schema version 1.0", () => {
    assert.equal(HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION, "1.0");
  });

  it("C: classification enum completeness", () => {
    assert.equal(HISTORICAL_POSITION_POLICY_CLASSIFICATIONS.length, 6);
    for (const c of HISTORICAL_POSITION_POLICY_CLASSIFICATIONS) {
      assert.ok(
        HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING[c]
      );
    }
  });

  it("D: path → classification mapping table completeness", () => {
    assertHistoricalPositionOutcomePolicyMapComplete();
    for (const outcome of ALL_PATH_OUTCOMES) {
      assert.ok(
        POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP[outcome]
      );
    }
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP
        .TARGET_TOUCHED,
      "FAVORABLE_RESOLUTION"
    );
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP
        .INVALIDATION_TOUCHED,
      "ADVERSE_RESOLUTION"
    );
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP.AMBIGUOUS,
      "INCONCLUSIVE_SAME_BAR"
    );
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP.NO_TOUCH,
      "UNRESOLVED_AT_HORIZON"
    );
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP
        .NO_FUTURE_DATA,
      "UNMEASURED_NO_FUTURE"
    );
    assert.equal(
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP
        .INSUFFICIENT_CONTEXT,
      "UNMEASURED_INSUFFICIENT"
    );
  });

  it("E: denominator IDs", () => {
    assert.deepEqual(HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_IDS, [
      "FILTERED_SNAPSHOTS",
      "MEASURED_PATHS",
      "DECISIVE_RESOLUTIONS",
      "MEASURED_NON_DECISIVE",
    ]);
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_DEFINITIONS.MEASURED_PATHS.includes(
        "FAVORABLE"
      )
    );
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_DEFINITIONS.UNMEASURED.includes(
        "UNMEASURED_NO_FUTURE"
      )
    );
  });

  it("F–H: decisive, measured, unmeasured membership", () => {
    assert.ok(
      isHistoricalPositionPolicyDecisiveClassification("FAVORABLE_RESOLUTION")
    );
    assert.ok(
      isHistoricalPositionPolicyDecisiveClassification("ADVERSE_RESOLUTION")
    );
    assert.ok(!isHistoricalPositionPolicyDecisiveClassification("AMBIGUOUS"));

    for (const c of [
      "FAVORABLE_RESOLUTION",
      "ADVERSE_RESOLUTION",
      "INCONCLUSIVE_SAME_BAR",
      "UNRESOLVED_AT_HORIZON",
    ] as const) {
      assert.ok(isHistoricalPositionPolicyMeasuredClassification(c));
    }
    assert.ok(
      !isHistoricalPositionPolicyMeasuredClassification("UNMEASURED_NO_FUTURE")
    );

    assert.ok(
      isHistoricalPositionPolicyUnmeasuredClassification("UNMEASURED_NO_FUTURE")
    );
    assert.ok(
      isHistoricalPositionPolicyUnmeasuredClassification(
        "UNMEASURED_INSUFFICIENT"
      )
    );
    assert.ok(
      !isHistoricalPositionPolicyUnmeasuredClassification("FAVORABLE_RESOLUTION")
    );
  });

  it("I–J: AMBIGUOUS and NO_TOUCH are measured but non-decisive", () => {
    const ambiguous =
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP.AMBIGUOUS;
    const noTouch =
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP.NO_TOUCH;
    assert.ok(isHistoricalPositionPolicyMeasuredClassification(ambiguous));
    assert.ok(isHistoricalPositionPolicyMeasuredClassification(noTouch));
    assert.ok(!isHistoricalPositionPolicyDecisiveClassification(ambiguous));
    assert.ok(!isHistoricalPositionPolicyDecisiveClassification(noTouch));
  });

  it("K–L: NO_FUTURE_DATA and INSUFFICIENT_CONTEXT are unmeasured", () => {
    for (const outcome of ["NO_FUTURE_DATA", "INSUFFICIENT_CONTEXT"] as const) {
      const c =
        POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP[outcome];
      assert.ok(isHistoricalPositionPolicyUnmeasuredClassification(c));
      assert.ok(!isHistoricalPositionPolicyMeasuredClassification(c));
      assert.ok(!isHistoricalPositionPolicyDecisiveClassification(c));
    }
  });

  it("M–O: direction, RR, and trade evaluation independence documented", () => {
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_DIRECTION_SEMANTICS.includes("BULLISH")
    );
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_RR_INDEPENDENCE.includes(
        "TRADE_EVALUATION_MIN_RR"
      )
    );
    assert.equal(TRADE_EVALUATION_MIN_RR, 1.5);
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_TRADE_EVALUATION_INDEPENDENCE.includes(
        "tradeEvaluation"
      )
    );
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_PATH_IMMUTABILITY.includes("read-only")
    );
  });

  it("P: non-goals documented", () => {
    assert.ok(HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS.length >= 10);
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS.some((g) =>
        g.includes("PnL")
      )
    );
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS.some((g) =>
        g.includes("win rate")
      )
    );
  });

  it("primary success rate contract (no calculation)", () => {
    assert.equal(
      HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT.rateId,
      "winRate_decisive"
    );
    assert.equal(
      HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT
        .denominatorId,
      "DECISIVE_RESOLUTIONS"
    );
    assert.equal(
      HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT
        .zeroDenominatorValue,
      null
    );
  });

  it("single result rule", () => {
    assert.ok(
      HISTORICAL_POSITION_OUTCOME_POLICY_SINGLE_RESULT_RULE.includes("exactly one")
    );
  });

  it("WIN/LOSS wording is reporting semantics only", () => {
    assert.match(
      HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING
        .FAVORABLE_RESOLUTION,
      /WIN/
    );
    assert.match(
      HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING
        .ADVERSE_RESOLUTION,
      /LOSS/
    );
  });
});
