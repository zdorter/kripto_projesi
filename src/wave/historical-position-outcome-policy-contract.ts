import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  HISTORICAL_POSITION_POLICY_CLASSIFICATIONS,
  type HistoricalPositionOutcomePolicyPathOutcomeMap,
  type HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";

const PATH_OUTCOME_STATUSES: readonly ProspectiveSetupOutcomeReplayStatus[] = [
  "NO_FUTURE_DATA",
  "NO_TOUCH",
  "TARGET_TOUCHED",
  "INVALIDATION_TOUCHED",
  "AMBIGUOUS",
  "INSUFFICIENT_CONTEXT",
];

/**
 * Canonical DECISIVE_V1 mapping: B-6 path outcome → policy classification.
 * FAVORABLE_RESOLUTION / ADVERSE_RESOLUTION correspond to WIN / LOSS reporting
 * terminology in later performance layers — not account PnL or execution profit.
 */
export const POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP: HistoricalPositionOutcomePolicyPathOutcomeMap =
  {
    TARGET_TOUCHED: "FAVORABLE_RESOLUTION",
    INVALIDATION_TOUCHED: "ADVERSE_RESOLUTION",
    AMBIGUOUS: "INCONCLUSIVE_SAME_BAR",
    NO_TOUCH: "UNRESOLVED_AT_HORIZON",
    NO_FUTURE_DATA: "UNMEASURED_NO_FUTURE",
    INSUFFICIENT_CONTEXT: "UNMEASURED_INSUFFICIENT",
  };

export const HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING: Readonly<
  Record<HistoricalPositionPolicyClassification, string>
> = {
  FAVORABLE_RESOLUTION: "WIN (favorable reference-path resolution; not account profit)",
  ADVERSE_RESOLUTION: "LOSS (adverse reference-path resolution; not account loss)",
  INCONCLUSIVE_SAME_BAR: "neither",
  UNRESOLVED_AT_HORIZON: "neither",
  UNMEASURED_NO_FUTURE: "unmeasured",
  UNMEASURED_INSUFFICIENT: "unmeasured",
};

export const HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_DEFINITIONS: Readonly<
  Record<
    | "FILTERED_SNAPSHOTS"
    | "MEASURED_PATHS"
    | "DECISIVE_RESOLUTIONS"
    | "MEASURED_NON_DECISIVE"
    | "UNMEASURED",
    string
  >
> = {
  FILTERED_SNAPSHOTS: "Selected historical measurement population (B-9b filter).",
  MEASURED_PATHS:
    "FAVORABLE + ADVERSE + INCONCLUSIVE_SAME_BAR + UNRESOLVED_AT_HORIZON.",
  DECISIVE_RESOLUTIONS: "FAVORABLE_RESOLUTION + ADVERSE_RESOLUTION only.",
  MEASURED_NON_DECISIVE:
    "INCONCLUSIVE_SAME_BAR + UNRESOLVED_AT_HORIZON.",
  UNMEASURED: "UNMEASURED_NO_FUTURE + UNMEASURED_INSUFFICIENT.",
};

/**
 * Future primary rate (B-10e): FAVORABLE / (FAVORABLE + ADVERSE);
 * denominatorId DECISIVE_RESOLUTIONS; zero denominator → null value.
 */
export const HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT = {
  rateId: "winRate_decisive" as const,
  numeratorClassification: "FAVORABLE_RESOLUTION" as const,
  denominatorId: "DECISIVE_RESOLUTIONS" as const,
  zeroDenominatorValue: null,
} as const;

/** One artifact entry → one path result → one policy classification (B-10d mapper). */
export const HISTORICAL_POSITION_OUTCOME_POLICY_SINGLE_RESULT_RULE =
  "Each HistoricalPositionPathResult yields exactly one policy classification; no dual WIN+LOSS labels.";

export const HISTORICAL_POSITION_OUTCOME_POLICY_DIRECTION_SEMANTICS =
  "BULLISH and BEARISH do not change TARGET→FAVORABLE or INVALIDATION→ADVERSE mapping; direction is a future reporting dimension only.";

export const HISTORICAL_POSITION_OUTCOME_POLICY_RR_INDEPENDENCE =
  "Policy does not read entry.evaluation.references.rr.ratio or apply TRADE_EVALUATION_MIN_RR; RR remains trade-evaluation scope.";

export const HISTORICAL_POSITION_OUTCOME_POLICY_TRADE_EVALUATION_INDEPENDENCE =
  "Policy does not read tradeEvaluation.status; FAILED+TARGET_TOUCHED and PASSED+INVALIDATION_TOUCHED remain valid path→policy pairs.";

export const HISTORICAL_POSITION_OUTCOME_POLICY_PATH_IMMUTABILITY =
  "Policy treats HistoricalPositionPathResult as read-only input; no mutation, entry/target/invalidation, or RR calculation.";

export const HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS: readonly string[] = [
  "No execution simulation.",
  "No fill price.",
  "No intrabar ordering guess.",
  "No AMBIGUOUS split into WIN/LOSS.",
  "No position sizing.",
  "No leverage.",
  "No fees.",
  "No slippage.",
  "No PnL.",
  "No account simulation.",
  "No overlapping-position resolution.",
  "No re-entry logic.",
  "No WIN/LOSS statistics in this policy layer.",
  "No win rate or loss rate calculation here.",
  "No equity curve.",
  "Policy does not read RR or trade evaluation status.",
  "TARGET_TOUCHED is not defined as profitable trade; INVALIDATION_TOUCHED is not account loss.",
];

const DECISIVE_CLASSIFICATIONS: ReadonlySet<HistoricalPositionPolicyClassification> =
  new Set(["FAVORABLE_RESOLUTION", "ADVERSE_RESOLUTION"]);

const MEASURED_CLASSIFICATIONS: ReadonlySet<HistoricalPositionPolicyClassification> =
  new Set([
    "FAVORABLE_RESOLUTION",
    "ADVERSE_RESOLUTION",
    "INCONCLUSIVE_SAME_BAR",
    "UNRESOLVED_AT_HORIZON",
  ]);

const UNMEASURED_CLASSIFICATIONS: ReadonlySet<HistoricalPositionPolicyClassification> =
  new Set(["UNMEASURED_NO_FUTURE", "UNMEASURED_INSUFFICIENT"]);

export function isHistoricalPositionPolicyDecisiveClassification(
  classification: HistoricalPositionPolicyClassification
): boolean {
  return DECISIVE_CLASSIFICATIONS.has(classification);
}

export function isHistoricalPositionPolicyMeasuredClassification(
  classification: HistoricalPositionPolicyClassification
): boolean {
  return MEASURED_CLASSIFICATIONS.has(classification);
}

export function isHistoricalPositionPolicyUnmeasuredClassification(
  classification: HistoricalPositionPolicyClassification
): boolean {
  return UNMEASURED_CLASSIFICATIONS.has(classification);
}

/** Contract completeness: every B-6 path outcome has a policy bucket. */
export function assertHistoricalPositionOutcomePolicyMapComplete(): void {
  for (const outcome of PATH_OUTCOME_STATUSES) {
    const classification =
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP[outcome];
    if (!HISTORICAL_POSITION_POLICY_CLASSIFICATIONS.includes(classification)) {
      throw new Error(
        `Policy map missing valid classification for path outcome ${outcome}`
      );
    }
  }
}
