import type { HistoricalCostAwareCounterfactualAnalysisReport } from "./historical-cost-aware-counterfactual-analysis-types";
import type { HistoricalDisplacementEqualityTargetMechanicsAnalysisReport } from "./historical-displacement-equality-target-mechanics-analysis-types";
import type { HistoricalAlternativeTargetReachabilityReplayReport } from "./historical-alternative-target-reachability-replay-types";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";
import type { HistoricalEntryContextTargetResearchReport } from "./historical-entry-context-target-research-types";
import type { HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { HistoricalAlternativeTargetModelAnalysisReport } from "./historical-alternative-target-model-analysis-types";
import type { HistoricalIndependentTradeREligibilityAuditReport } from "./historical-independent-trade-r-eligibility-audit-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { TradeEvaluationFirstFailureCode } from "./setup/trade-evaluation-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import type { DisplacementContextBucketId } from "./historical-target-distance-structural-context-analysis-types";
import type { StructuralHeadroomBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { StructuralMoveBucketId } from "./historical-structural-extreme-vs-displacement-target-analysis-types";
import type { SameTargetBandHeadroomTier } from "./historical-entry-context-target-research-types";
import type { HeadroomPresence } from "./historical-entry-context-target-research-types";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { ResearchConclusionTag } from "./historical-entry-context-target-research-types";
import type { Candle } from "./types";

export const HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION = "1.0" as const;

export type FutureMoveOutcomeBucketId =
  | "FUTURE_MOVE_LT_1"
  | "FUTURE_MOVE_1_TO_2"
  | "FUTURE_MOVE_2_TO_3"
  | "FUTURE_MOVE_3_TO_5"
  | "FUTURE_MOVE_GTE_5"
  | "FUTURE_MOVE_NOT_APPLICABLE";

export type MovementOutcomeClass =
  | "TARGET_REACHED"
  | "TARGET_NOT_REACHED_MFE_GTE_TARGET"
  | "TARGET_NOT_REACHED_MFE_LT_TARGET"
  | "INVALIDATION_REACHED"
  | "NO_TOUCH_HORIZON_END"
  | "NOT_REPLAYABLE";

export type ProspectiveRrBucketId = "RR_LT_1" | "RR_1_TO_1_5" | "RR_GTE_1_5" | "RR_NOT_APPLICABLE";

export interface BuildHistoricalEntryContextFutureMoveAnalysisInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  candles: readonly Candle[];
  horizonBars?: number;
  reachabilityReplayReport?: HistoricalAlternativeTargetReachabilityReplayReport;
  costAwareCounterfactualAnalysisReport?: HistoricalCostAwareCounterfactualAnalysisReport;
  eligibilityAuditReport?: HistoricalIndependentTradeREligibilityAuditReport;
  entryContextTargetResearchReport?: HistoricalEntryContextTargetResearchReport;
  /** B-12t — consumed when supplied (no rebuild). */
  displacementEqualityTargetMechanicsAnalysisReport?: HistoricalDisplacementEqualityTargetMechanicsAnalysisReport;
  /** B-12u — consumed when supplied (no rebuild). */
  structuralExtremeVsDisplacementTargetAnalysisReport?: HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport;
  /** B-12v — reference only when supplied (no rebuild). */
  alternativeTargetModelAnalysisReport?: HistoricalAlternativeTargetModelAnalysisReport;
}

export interface FutureMoveThresholdReachRow {
  thresholdPercent: number;
  eligibleTrades: number;
  futureMoveReachedCount: number;
  futureMoveReachRate: number | null;
  medianBarsToReach: number | null;
  p25BarsToReach: number | null;
  p75BarsToReach: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
  wilson95: IndependentTradeWinRateConfidenceInterval;
}

export interface FutureMovePerTradeRow {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  entryReferencePrice: number | null;
  canonicalTargetPercent: number | null;
  canonicalRiskPercent: number | null;
  canonicalRrRatio: number | null;
  favorableMovePercentage: number | null;
  adverseMovePercentage: number | null;
  favorableMfePrice: number | null;
  adverseMaePrice: number | null;
  barsToMaxFavorableExcursion: number | null;
  barsToMaxAdverseExcursion: number | null;
  futureMfeToCanonicalTargetRatio: number | null;
  futureMfeBeyondCanonicalTargetPercentage: number | null;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: string;
  tradeEvaluationStatus: string;
  evaluatorFirstFailure: TradeEvaluationFirstFailureCode | null;
  theoreticalR: number | null;
  futureContextStatus: "CLASSIFIABLE" | "NOT_REPLAYABLE" | "INCOMPLETE_FUTURE_CONTEXT";
  movementOutcomeClass: MovementOutcomeClass;
}

export interface GteThresholdMetrics {
  thresholdPercent: number;
  rate: number | null;
  count: number;
  eligible: number;
  wilson95: IndependentTradeWinRateConfidenceInterval;
}

export interface FutureMoveContextCrossRow {
  trades: number;
  classifiable: number;
  meanMfe: number | null;
  medianMfe: number | null;
  medianBarsToMfe: number | null;
  targetReachRate: number | null;
  gte1: GteThresholdMetrics;
  gte2: GteThresholdMetrics;
  gte3: GteThresholdMetrics;
  gte5: GteThresholdMetrics;
  gte10: GteThresholdMetrics;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface HeadroomPresenceFutureMoveComparison {
  absent: FutureMoveContextCrossRow;
  present: FutureMoveContextCrossRow;
  gte3RateDeltaPercentagePoints: number | null;
  gte5RateDeltaPercentagePoints: number | null;
  note: string;
}

export interface FutureMoveTradeExample {
  tradeId: string;
  evaluationBarIndex: number;
  direction: string;
  movementOutcomeClass: MovementOutcomeClass;
  futureMoveBucket: FutureMoveOutcomeBucketId;
  mfePercentage: number | null;
  maePercentage: number | null;
  canonicalTargetPercent: number | null;
  canonicalRiskPercent: number | null;
  canonicalRrRatio: number | null;
  headroomPresence: HeadroomPresence;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: string;
  evaluatorStatus: string;
  firstFailure: TradeEvaluationFirstFailureCode | null;
  theoreticalR: number | null;
  barsToMaxMfe: number | null;
  barsToMaxMae: number | null;
  note: string;
}

export interface TargetVsFutureMoveRow {
  canonicalRewardBucket: PriceMoveRewardBucketId;
  trades: number;
  meanCanonicalReward: number | null;
  medianCanonicalReward: number | null;
  meanFavorableFutureMove: number | null;
  medianFavorableFutureMove: number | null;
  mfeGteCanonicalTargetCount: number;
  mfeGteCanonicalTargetRate: number | null;
  mfeGte2xCanonicalTargetCount: number;
  mfeGte2xCanonicalTargetRate: number | null;
  sampleSizeQuality: IndependentTradeSampleSizeQuality;
  interpretWithCaution: boolean;
}

export interface MfeBeyondTargetWithoutCanonicalTouchSummary {
  trades: number;
  meanFavorableMove: number | null;
  medianFavorableMove: number | null;
  note: string;
}

export interface HistoricalEntryContextFutureMoveAnalysisReport {
  schemaVersion: typeof HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION;
  datasetReference: { fixturePath: string; expectedDatasetChecksum: string };
  horizon: {
    horizonBars: number;
    source: string;
  };
  determinism: {
    reportBuilder: string;
    inputHashNote: string;
  };
  population: {
    independentTrades: number;
    totalSnapshots: number | null;
    eligibleEntrySnapshots: number | null;
    canonicalReplayClassifiable: number;
    canonicalNotReplayable: number;
    movementOutcomeCounts: Record<MovementOutcomeClass, number>;
  };
  perTrade: readonly FutureMovePerTradeRow[];
  thresholdAnalysis: readonly FutureMoveThresholdReachRow[];
  futureMoveBuckets: readonly (FutureMoveContextCrossRow & { bucket: FutureMoveOutcomeBucketId })[];
  gtePopulationThresholds: readonly GteThresholdMetrics[];
  largeMoveAnalysis: readonly GteThresholdMetrics[];
  targetVsFutureMove: readonly TargetVsFutureMoveRow[];
  evaluatorCross: readonly (FutureMoveContextCrossRow & { evaluatorStatus: string })[];
  evaluatorFailureCross: readonly (FutureMoveContextCrossRow & {
    failureReason: TradeEvaluationFirstFailureCode | "NONE";
  })[];
  mfeBeyondTargetWithoutCanonicalTouch: MfeBeyondTargetWithoutCanonicalTouchSummary;
  displacementCross: readonly (FutureMoveContextCrossRow & {
    displacementBucket: DisplacementContextBucketId;
  })[];
  headroomCross: readonly (FutureMoveContextCrossRow & {
    headroomTier: SameTargetBandHeadroomTier;
  })[];
  targetDistanceCross: readonly (FutureMoveContextCrossRow & {
    targetBand: PriceMoveRewardBucketId;
  })[];
  structuralMoveCross: readonly (FutureMoveContextCrossRow & {
    structuralMoveBucket: StructuralMoveBucketId;
  })[];
  prospectiveRrCross: readonly (FutureMoveContextCrossRow & { rrBucket: ProspectiveRrBucketId })[];
  /** Spec alias for prospectiveRrCross */
  rrCross: readonly (FutureMoveContextCrossRow & { rrBucket: ProspectiveRrBucketId })[];
  headroomPresenceComparison: HeadroomPresenceFutureMoveComparison;
  targetBandHeadroomCross: readonly (FutureMoveContextCrossRow & {
    targetBand: PriceMoveRewardBucketId;
    headroomTier: SameTargetBandHeadroomTier;
  })[];
  reachVsMfe: {
    targetReached: number;
    mfeGteTargetNotReached: number;
    mfeGte3NotReached: number;
    note: string;
  };
  costContext: readonly {
    mfeBandLabel: string;
    trades: number;
    fractionAboveRoundTrip0_20: number | null;
    note: string;
  }[];
  failedFavorableAnalysis: { trades: number; cross: FutureMoveContextCrossRow; note: string };
  passedAdverseAnalysis: { trades: number; cross: FutureMoveContextCrossRow; note: string };
  /** Spec alias for failedFavorableAnalysis */
  failedFavorableFutureMove: { trades: number; cross: FutureMoveContextCrossRow; note: string };
  /** Spec alias for passedAdverseAnalysis */
  passedAdverseFutureMove: { trades: number; cross: FutureMoveContextCrossRow; note: string };
  theoreticalRCross: readonly {
    theoreticalRBucket: string;
    cross: FutureMoveContextCrossRow;
  }[];
  directionCross: readonly { direction: string; cross: FutureMoveContextCrossRow }[];
  waveCross: readonly { waveLabel: string; cross: FutureMoveContextCrossRow }[];
  setupFamilyCross: readonly { setupFamilyId: string; cross: FutureMoveContextCrossRow }[];
  /** @deprecated use directionCross */
  secondaryDirection: readonly { direction: string; cross: FutureMoveContextCrossRow }[];
  /** @deprecated use waveCross */
  secondaryWave: readonly { waveLabel: string; cross: FutureMoveContextCrossRow }[];
  /** @deprecated use setupFamilyCross */
  secondaryFamily: readonly { setupFamilyId: string; cross: FutureMoveContextCrossRow }[];
  costComparison: readonly {
    mfeBandLabel: string;
    trades: number;
    fractionAboveRoundTrip0_20: number | null;
    note: string;
  }[];
  theoreticalRReference: {
    consumed: boolean;
    note: string;
    cross: readonly {
      theoreticalRBucket: string;
      cross: FutureMoveContextCrossRow;
    }[];
  };
  parity: {
    b12wCanonicalTargetReached: number | null;
    note: string;
  };
  directVsAssociational: { direct: readonly string[]; associational: readonly string[] };
  lookaheadAttestation: {
    entryContextUsesAnchorToEOnly: true;
    postEUsedForFutureOutcomesOnly: true;
    statement: string;
  };
  diagnosticSummary: readonly {
    question: string;
    answer: string;
    tag: ResearchConclusionTag;
  }[];
  tradeExamples: readonly FutureMoveTradeExample[];
  warnings: readonly string[];
  consumedReports: Record<string, boolean>;
}
