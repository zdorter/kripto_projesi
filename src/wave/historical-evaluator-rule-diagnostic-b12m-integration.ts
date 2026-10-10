/**
 * Phase B-12m — integrate frozen B-12l evaluator failure-reason analysis into B-12k diagnostics.
 * Consumes `buildHistoricalEvaluatorFailureReasonAnalysis` only; does not call evaluateTradeEvaluation.
 * B-12l freezes `evaluatorFirstFailure`; B-12m exposes that data through the rule diagnostic report.
 */
import { buildHistoricalEvaluatorFailureReasonAnalysis } from "./historical-evaluator-failure-reason-analysis";
import type { HistoricalEvaluatorFailureReasonAnalysisReport } from "./historical-evaluator-failure-reason-analysis-types";
import type {
  EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis,
  EvaluatorRuleDiagnosticFailureReasonAnalysis,
  EvaluatorRuleDiagnosticFailureReasonUnavailable,
} from "./historical-evaluator-rule-diagnostic-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { HistoricalIndependentTradeEvaluatorDiagnosticReport } from "./historical-independent-trade-evaluator-diagnostic-types";

const FAILURE_REASON_UNAVAILABLE: EvaluatorRuleDiagnosticFailureReasonUnavailable = {
  available: false,
  reason: "lifecycle_report_not_supplied",
  canonicalNote:
    "Supply IndependentTradeLifecycleReport (B-12b) to enable failure-reason analysis from frozen evaluatorFirstFailure (B-12l). B-12m does not call evaluateTradeEvaluation.",
};

const FAILED_WIN_OBSERVATIONAL_NOTE =
  "Observational association only: among historically FAILED trades, which frozen failure-reason labels co-occur with favorable path outcomes. Not causal.";

export interface IntegrateB12lFailureReasonIntoRuleDiagnosticInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  statisticsReport?: IndependentTradeStatisticsReport;
  evaluatorDiagnosticReport?: HistoricalIndependentTradeEvaluatorDiagnosticReport;
  /** When provided, B-12l is not rebuilt (tests / callers with precomputed report). */
  failureReasonAnalysisReport?: HistoricalEvaluatorFailureReasonAnalysisReport;
}

export interface IntegrateB12lFailureReasonIntoRuleDiagnosticResult {
  failureReasonAnalysis: EvaluatorRuleDiagnosticFailureReasonAnalysis;
  failedWinFailureReasonAnalysis: EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis;
  failureReasonSchemaVersion: string;
}

function mapB12lReport(
  b12l: HistoricalEvaluatorFailureReasonAnalysisReport
): IntegrateB12lFailureReasonIntoRuleDiagnosticResult {
  return {
    failureReasonSchemaVersion: b12l.schemaVersion,
    failureReasonAnalysis: {
      available: true,
      sourcePhase: "B-12l",
      sourceSchemaVersion: b12l.schemaVersion,
      observationalNote:
        "Failure reasons are frozen metadata from HistoricalMeasurementArtifactEntry.evaluation.tradeEvaluation.firstFailure; they do not alter path outcome, policy classification, or WIN/LOSS.",
      canonicalSource: b12l.canonicalSource,
      overallByFailureReason: b12l.overallByFailureReason,
      failedTradeOutcomeByReason: b12l.failedTradeOutcomeAnalysis,
      passedTradeOutcomeSummary: b12l.passedTradeOutcomeAnalysis,
      failureReasonByOutcome: b12l.failureReasonByOutcome,
      byDirection: b12l.byDirection,
      byRrBucket: b12l.byRrBucket,
      bySetupFamily: b12l.bySetupFamily,
      byGeometry: b12l.byGeometry,
      byExitReason: b12l.byExitReason,
      byDuration: b12l.byDuration,
      missingFailureReasonCount:
        b12l.unknownPopulation.failedWithMissingFailureReason,
      insufficientContextNoFailureReason:
        b12l.unknownPopulation.insufficientContextNoFailureReason,
      unknownPopulationNotes: b12l.unknownPopulation.notes,
    },
    failedWinFailureReasonAnalysis: {
      available: true,
      observationalNote: FAILED_WIN_OBSERVATIONAL_NOTE,
      byFailureReason: b12l.failedTradeOutcomeAnalysis,
    },
  };
}

export function integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic(
  input: IntegrateB12lFailureReasonIntoRuleDiagnosticInput
): IntegrateB12lFailureReasonIntoRuleDiagnosticResult {
  const b12l =
    input.failureReasonAnalysisReport ??
    buildHistoricalEvaluatorFailureReasonAnalysis({
      lifecycleReport: input.lifecycleReport,
      statisticsReport: input.statisticsReport,
      evaluatorDiagnosticReport: input.evaluatorDiagnosticReport,
    });
  return mapB12lReport(b12l);
}

export function failureReasonAnalysisUnavailableWhenNoLifecycle(): EvaluatorRuleDiagnosticFailureReasonUnavailable {
  return FAILURE_REASON_UNAVAILABLE;
}

export function failedWinFailureReasonAnalysisUnavailable(): EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis {
  return {
    available: false,
    observationalNote: FAILED_WIN_OBSERVATIONAL_NOTE,
    byFailureReason: [],
  };
}
