import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";

export const HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION = "1.0" as const;

/**
 * Canonical kaynak (B-12l freeze):
 * HistoricalMeasurementArtifactEntry.evaluation.tradeEvaluation.firstFailure
 * ← TradeEvaluationResult üretildiği anda (backtest/measurement assembly, bar E).
 *
 * B-12b lifecycle bu değeri kopyalar; B-12l+ asla yeniden hesaplamaz.
 */
export const EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH =
  "evaluation.tradeEvaluation.firstFailure" as const;

export const EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD =
  "evaluatorFirstFailure" as const;

export const EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED =
  "FAILED_WITH_MISSING_FAILURE_REASON" as const;

export const EVALUATOR_FAILURE_REASON_INSUFFICIENT_CONTEXT_BUCKET =
  "INSUFFICIENT_CONTEXT_NO_FAILURE_REASON" as const;

export type EvaluatorFailureReasonAnalysisBucket =
  | TradeEvaluationFirstFailureCode
  | typeof EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED;

export const EVALUATOR_FAILURE_REASON_CONTRACT_NOTES = {
  frozenAtEvaluationBarE:
    "firstFailure, measurement artifact içindeki tradeEvaluation sonucundan kopyalanır (evaluateTradeEvaluation yeniden çağrılmaz).",
  neverRecomputed:
    "Tarihsel analiz katmanları firstFailure türetmez; RR, geometry veya path outcome kullanılmaz.",
  passedExpectation:
    "Evaluator contract: PASSED durumunda firstFailure genelde null; lifecycle aynen kopyalar.",
  failedExpectation:
    "FAILED durumunda firstFailure mevcut TradeEvaluationFirstFailureCode değeridir; yoksa FAILED_WITH_MISSING_FAILURE_REASON olarak raporlanır.",
  insufficientContext:
    "INSUFFICIENT_CONTEXT için failure reason icat edilmez.",
  noOutcomeMutation:
    "firstFailure path outcome, B-10d policy classification, WIN/LOSS veya B-12g theoretical R değiştirmez.",
  diagnosticOnly: "Yalnızca teşhis metadata; nedensellik veya evaluator doğruluk hükmü değildir.",
} as const;
