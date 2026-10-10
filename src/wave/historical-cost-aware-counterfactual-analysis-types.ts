import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEvaluatorFailureReasonAnalysisReport } from "./historical-evaluator-failure-reason-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { TargetMagnitudeRewardBucketId } from "./historical-target-provenance-structural-distance-analysis-types";

export const HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION =
  "1.0" as const;

export const DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT = [
  0,
  0.05,
  0.1,
  0.15,
  0.2,
  0.3,
  0.5,
] as const;

export type RoundTripCostScenarioPercent = number;

export type CostMarginState =
  | "NET_NEGATIVE_MARGIN"
  | "BREAK_EVEN_MARGIN"
  | "POSITIVE_GROSS_MARGIN"
  | "NOT_CLASSIFIABLE";

export interface BuildHistoricalCostAwareCounterfactualAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  reachabilityReplayReport: HistoricalAlternativeTargetReachabilityReplayReport;
  roundTripCostScenariosPercent?: readonly RoundTripCostScenarioPercent[];
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
  historicalEvaluatorFailureReasonAnalysisReport?: HistoricalEvaluatorFailureReasonAnalysisReport;
}

export interface ModelCostScenarioMetrics {
  modelId: AlternativeTargetModelId;
  roundTripCostPercentage: number;
  classifiableTrades: number;
  targetReached: number;
  targetReachRate: number | null;
  costCoveredTargetCount: number;
  costCoveredTargetRate: number | null;
  negativeMarginTargetCount: number;
  meanGrossRewardPercentageOnReached: number | null;
  meanNetMarginPercentageOnReached: number | null;
  medianBreakEvenCostPercentage: number | null;
  meanNetCounterfactualRrOnReached: number | null;
}

export interface HistoricalCostAwareCounterfactualAnalysisReport {
  schemaVersion: typeof HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION;
  datasetReference: {
    fixturePath: string;
    expectedDatasetChecksum: string;
  };
  population: {
    independentTrades: number;
    reachabilityRows: number;
    notReplayableRows: number;
    b12wReachabilityParityVerified: boolean;
  };
  costPolicy: {
    denomination: "ROUND_TRIP_PERCENTAGE";
    description: string;
    notActualExchangeFee: true;
    includesSlippage: false;
    includesFunding: false;
    executionAssumption: string;
  };
  costScenarios: readonly number[];
  canonicalReference: {
    grossRewardSource: "B-12w perTrade.grossTargetMovePercentage";
    grossRiskSource: "lifecycle entry/invalidation (B-12r semantics, read-only)";
    reachabilitySource: "B-12w replayEvent (unchanged)";
    theoreticalRReference: string;
  };
  modelResults: readonly ModelCostScenarioMetrics[];
  costSensitivity: readonly {
    modelId: AlternativeTargetModelId;
    curve: readonly {
      roundTripCostPercentage: number;
      costCoveredTargetRate: number | null;
    }[];
  }[];
  targetCostCoverage: readonly ModelCostScenarioMetrics[];
  breakEvenCost: readonly {
    modelId: AlternativeTargetModelId;
    meanBreakEvenCostPercentage: number | null;
    medianBreakEvenCostPercentage: number | null;
    p25BreakEvenCostPercentage: number | null;
    p75BreakEvenCostPercentage: number | null;
  }[];
  rewardBucketAnalysis: readonly {
    rewardBucket: TargetMagnitudeRewardBucketId | string;
    roundTripCostPercentage: number;
    tradeCount: number;
    targetReached: number;
    meanGrossRewardPercentage: number | null;
    meanNetMarginOnReached: number | null;
    costCoverageRate: number | null;
  }[];
  failedFavorableAnalysis: {
    trades: number;
    byModelAndCost: readonly ModelCostScenarioMetrics[];
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    byModelAndCost: readonly ModelCostScenarioMetrics[];
    note: string;
  };
  rrCross: readonly {
    rrBucket: HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE";
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    targetReached: number;
    costCoveredTargetCount: number;
    trades: number;
  }[];
  directionCross: readonly {
    direction: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  setupFamilyCross: readonly {
    setupFamilyId: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  waveContextCross: readonly {
    waveLabel: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  anchorSourceCross: readonly {
    anchorSource: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  evaluatorCross: readonly {
    evaluationStatus: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  failureReasonCross: readonly {
    failureReason: string;
    roundTripCostPercentage: number;
    modelId: AlternativeTargetModelId;
    costCoveredTargetRate: number | null;
    trades: number;
  }[];
  targetReachabilityCross: readonly ModelCostScenarioMetrics[];
  arithmeticExamples: {
    label: "ARITHMETIC_REFERENCE";
    rows: readonly { grossTargetPercent: number; costPercent: number; netMarginPercent: number }[];
  };
  warnings: readonly string[];
  diagnosticSummary: readonly { question: string; answer: string }[];
  consumedReports: {
    lifecycleReport: true;
    reachabilityReplayReport: true;
    alternativeTargetModelAnalysisReport: boolean;
    eligibilityAuditReport: boolean;
    historicalEvaluatorFailureReasonAnalysisReport: boolean;
  };
}

export type { CounterfactualReplayEvent };
