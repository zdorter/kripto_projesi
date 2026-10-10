import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";

export const INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_SCHEMA_VERSION = "1.0" as const;

/**
 * Versioned entry-event policies (B-12b). Selection uses only frozen evaluation at E
 * (cohorts, references, tradeEvaluation on the artifact entry). No path outcome fields.
 */
export const ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT =
  "ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT" as const;

export const ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT =
  "ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT" as const;

export const ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED =
  "ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED" as const;

export const ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES =
  "ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES" as const;

export type IndependentTradeEntryEventPolicyId =
  | typeof ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT
  | typeof ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT
  | typeof ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED
  | typeof ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES;

/**
 * Default for B-12b lifecycle runs: one DISPLAY_PICK snapshot per E (when present).
 * Documented explicitly — not chosen from historical win rate.
 */
export const INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DEFAULT: IndependentTradeEntryEventPolicyId =
  ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT;

export const INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DOCUMENTATION: Record<
  IndependentTradeEntryEventPolicyId,
  string
> = {
  [ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT]:
    "Entry when snapshot cohorts include DISPLAY_PICK (selectDisplayProspectiveCandidate at E).",
  [ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT]:
    "Entry when snapshot cohorts include READY_REFERENCES (readyForFurtherEvaluation at E).",
  [ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED]:
    "Entry when evaluation.tradeEvaluation.status === PASSED at E.",
  [ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES]:
    "Entry for every ALL_PRODUCTION_CANDIDATES snapshot (requires sibling selection).",
};

const COHORT_FOR_POLICY: Partial<
  Record<IndependentTradeEntryEventPolicyId, HistoricalMeasurementCohort>
> = {
  [ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT]: "DISPLAY_PICK",
  [ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT]: "READY_REFERENCES",
  [ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES]: "ALL_PRODUCTION_CANDIDATES",
};

export function snapshotPassesIndependentTradeEntryEventPolicy(
  entry: HistoricalMeasurementArtifactEntry,
  policyId: IndependentTradeEntryEventPolicyId
): boolean {
  if (policyId === ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED) {
    return entry.evaluation.tradeEvaluation.status === "PASSED";
  }
  const cohort = COHORT_FOR_POLICY[policyId];
  if (!cohort) {
    return false;
  }
  return entry.cohorts.includes(cohort);
}
