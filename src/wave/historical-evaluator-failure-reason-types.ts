import type { HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION } from "./historical-evaluator-failure-reason-contract";
import {
  EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
  EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
} from "./historical-evaluator-failure-reason-contract";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";

export type {
  HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
  EvaluatorFailureReasonAnalysisBucket,
} from "./historical-evaluator-failure-reason-contract";

export {
  EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
  EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
  EVALUATOR_FAILURE_REASON_CONTRACT_NOTES,
} from "./historical-evaluator-failure-reason-contract";

/** B-12b IndependentTradeUnit üzerinde donmuş evaluator firstFailure. */
export type FrozenEvaluatorFirstFailure = TradeEvaluationFirstFailureCode;
