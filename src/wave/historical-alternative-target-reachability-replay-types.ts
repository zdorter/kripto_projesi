import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { AlternativeTargetModelId } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalMeasurementArtifactEntry } from "./setup/historical-measurement-artifact-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { HistoricalMeasurementRRBucketRow } from "./historical-measurement-rr-statistics-types";
import type { OpenStructuralLegAnchorSource } from "./setup/open-structural-leg-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { Candle } from "./types";

export const HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION =
  "1.0" as const;

export type CounterfactualReplayEvent =
  | "TARGET_REACHED"
  | "INVALIDATION_REACHED"
  | "AMBIGUOUS_SAME_BAR"
  | "NOT_REACHED_WITHIN_HORIZON"
  | "INSUFFICIENT_FUTURE"
  | "NOT_REPLAYABLE";

export interface BuildHistoricalAlternativeTargetReachabilityReplayInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  artifactMeasurements: readonly HistoricalMeasurementArtifactEntry[];
  candles: readonly Candle[];
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
  horizonBars?: number;
}

export interface CounterfactualReachabilityRow {
  tradeId: string;
  modelId: AlternativeTargetModelId;
  evaluationBarIndex: number;
  entryPrice: number | null;
  counterfactualTargetPrice: number | null;
  invalidationPrice: number | null;
  grossTargetMovePercentage: number | null;
  counterfactualTargetRr: number | null;
  replayEvent: CounterfactualReplayEvent;
  barsToTarget: number | null;
  mfePercentage: number | null;
  mfeToTargetDistanceRatio: number | null;
  canonicalHistoricalPathOutcome: ProspectiveSetupOutcomeReplayStatus;
  canonicalHistoricalPolicyClassification: string;
  counterfactualReplayOutcome: CounterfactualReplayEvent;
  targetBeforeInvalidation: boolean;
  prefixExtremeObservedAtE: boolean;
  netReward: null;
  roundTripCost: null;
  alternativeTheoreticalR: null;
}

export interface ModelReachabilityAggregate {
  modelId: AlternativeTargetModelId;
  totalTrades: number;
  classifiableTrades: number;
  targetReached: number;
  invalidationReached: number;
  ambiguousSameBar: number;
  notReachedWithinHorizon: number;
  insufficientFuture: number;
  notReplayable: number;
  targetReachRate: number | null;
  targetBeforeInvalidationRate: number | null;
  ambiguousRate: number | null;
  medianBarsToTarget: number | null;
  meanBarsToTarget: number | null;
  meanMfePercentage: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface HistoricalAlternativeTargetReachabilityReplayReport {
  schemaVersion: typeof HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  population: {
    independentTrades: number;
    lifecycleSummary: IndependentTradeLifecycleReport["summary"];
  };
  replayPolicy: {
    replayStart: "E_PLUS_1";
    replayEnd: "E_PLUS_HORIZON_INCLUSIVE";
    horizonSource: string;
    horizonBars: number;
    semantics: string;
  };
  canonicalReference: {
    entrySource: string;
    targetSource: string;
    invalidationSource: string;
  };
  modelResults: readonly ModelReachabilityAggregate[];
  modelComparison: readonly {
    modelId: AlternativeTargetModelId;
    meanRewardPercentage: number | null;
    meanCounterfactualRr: number | null;
    targetReachRate: number | null;
    targetBeforeInvalidationRate: number | null;
    medianBarsToTarget: number | null;
    meanMfePercentage: number | null;
  }[];
  targetReachability: { byModel: readonly ModelReachabilityAggregate[] };
  targetFirstAnalysis: { byModel: readonly ModelReachabilityAggregate[] };
  timeToTarget: readonly {
    modelId: AlternativeTargetModelId;
    mean: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
    bucket_1_3: number;
    bucket_4_6: number;
    bucket_7_12: number;
    bucket_13_24: number;
  }[];
  mfeAnalysis: readonly {
    modelId: AlternativeTargetModelId;
    meanMfePercentage: number | null;
    meanMfeToTargetRatio: number | null;
  }[];
  largeTargetAnalysis: readonly {
    rewardThresholdPercent: number;
    modelId: AlternativeTargetModelId;
    count: number;
    targetReached: number;
    targetReachRate: number | null;
    targetBeforeInvalidation: number;
  }[];
  failedFavorableAnalysis: {
    trades: number;
    byModel: readonly ModelReachabilityAggregate[];
    note: string;
  };
  passedAdverseAnalysis: {
    trades: number;
    byModel: readonly ModelReachabilityAggregate[];
    note: string;
  };
  rrCross: readonly {
    rrBucket: HistoricalMeasurementRRBucketRow | "NOT_APPLICABLE";
    modelId: AlternativeTargetModelId;
    trades: number;
    targetReached: number;
  }[];
  rewardCross: readonly {
    rewardBucket: string;
    modelId: AlternativeTargetModelId;
    trades: number;
    targetReached: number;
  }[];
  directionCross: readonly {
    direction: string;
    modelId: AlternativeTargetModelId;
    targetReachRate: number | null;
    trades: number;
  }[];
  setupFamilyCross: readonly {
    setupFamilyId: string;
    modelId: AlternativeTargetModelId;
    targetReachRate: number | null;
    trades: number;
  }[];
  waveContextCross: readonly {
    waveLabel: string;
    modelId: AlternativeTargetModelId;
    targetReachRate: number | null;
    trades: number;
  }[];
  anchorSourceCross: readonly {
    anchorSource: OpenStructuralLegAnchorSource | "UNKNOWN" | "MIXED";
    modelId: AlternativeTargetModelId;
    targetReachRate: number | null;
    trades: number;
  }[];
  canonicalParity: {
    canonicalModelReplayComparable: number;
    matchesProductionPathOutcome: number;
    mismatches: number;
    mismatchSamples: readonly {
      tradeId: string;
      productionPathOutcome: ProspectiveSetupOutcomeReplayStatus;
      b12wMappedOutcome: ProspectiveSetupOutcomeReplayStatus | null;
      b12wReplayEvent: CounterfactualReplayEvent;
      note: string;
    }[];
  };
  perTrade: readonly CounterfactualReachabilityRow[];
  warnings: readonly string[];
  diagnosticSummary: readonly { finding: string; note: string }[];
  consumedReports: {
    lifecycleReport: true;
    artifactMeasurements: true;
    alternativeTargetModelAnalysisReport: boolean;
  };
}
