import type { HistoricalBacktestReport } from "./historical-backtest-types";
import type { HistoricalMeasurementCohort } from "./setup/historical-measurement-contract";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";

export const HISTORICAL_BACKTEST_ROBUSTNESS_AUDIT_SCHEMA_VERSION = "1.0" as const;

export interface RobustnessDecisiveSummary {
  totalSnapshots: number;
  measuredPaths: number;
  unmeasuredPaths: number;
  wins: number;
  losses: number;
  decisiveResolutions: number;
  winRate_decisive: number | null;
  inconclusiveSameBar: number;
  unresolvedAtHorizon: number;
  unmeasuredInsufficient: number;
  unmeasuredNoFuture: number;
}

export interface CandidateMultiplicityAudit {
  evaluationBarsWithSnapshots: number;
  totalSnapshots: number;
  averageCandidatesPerE: number;
  medianCandidatesPerE: number;
  minCandidatesPerE: number;
  maxCandidatesPerE: number;
  barsWithExactlyOneCandidate: number;
  barsWithMoreThanOneCandidate: number;
  /** Keys are candidate counts as strings; values are bar counts. */
  candidateCountHistogram: Record<string, number>;
}

export interface TemporalCorrelationAudit {
  uniqueProspectiveSetupIds: number;
  prospectiveIdsSeenOnMultipleE: number;
  uniqueSourceSetupIds: number;
  sourceIdsSeenOnMultipleE: number;
  maxEvaluationBarsForSingleSourceSetupId: number;
  maxEvaluationBarsForSingleProspectiveSetupId: number;
  maxConsecutiveEBarsSameFamilyDirection: number;
}

export interface DisplayPickComparisonAudit {
  displayPickDecisive: RobustnessDecisiveSummary;
  nonDisplayPickDecisive: RobustnessDecisiveSummary;
  evaluationBarsWithDisplayPick: number;
  /** At bars with display pick: display vs sibling candidates decisive rates. */
  atDisplayBarsDisplayWinRate: number | null;
  atDisplayBarsNonDisplayWinRate: number | null;
  selectionUsesFutureCandles: false;
  selectionRankSummary: string;
}

export interface CohortDecisiveComparison {
  cohort: HistoricalMeasurementCohort;
  summary: RobustnessDecisiveSummary;
}

export interface HorizonRobustnessRow {
  horizonBars: number;
  summary: RobustnessDecisiveSummary;
  pathAmbiguous: number;
  pathNoTouch: number;
  pathInsufficientContext: number;
}

export interface PeriodStabilityRow {
  periodId: "EARLY" | "MIDDLE" | "LATE";
  startEvaluationBar: number;
  endEvaluationBar: number;
  summary: RobustnessDecisiveSummary;
  displayPickWinRate_decisive: number | null;
}

export interface LookaheadSelectionAuditResult {
  evaluationBarsChecked: number;
  displayPickIdMismatches: number;
  readyFlagMismatches: number;
  tradeEvaluationStatusMismatches: number;
  issues: string[];
}

export interface HistoricalBacktestRobustnessAuditReport {
  schemaVersion: typeof HISTORICAL_BACKTEST_ROBUSTNESS_AUDIT_SCHEMA_VERSION;
  symbol: string;
  timeframeId: string;
  horizonBars: number;
  evaluationRange: { start: number; end: number };
  populationModelSummary: string;
  snapshotIndependenceSummary: string;
  candidateMultiplicity: CandidateMultiplicityAudit;
  temporalCorrelation: TemporalCorrelationAudit;
  displayPick: DisplayPickComparisonAudit;
  cohortComparisons: CohortDecisiveComparison[];
  tradeEvaluationPolicyCross: HistoricalBacktestReport["outcomeStatistics"]["evaluationCross"];
  directionByRrFromExistingStats: {
    note: string;
  };
  rrCohortBucketCounts: Record<
    string,
    Record<string, number>
  >;
  horizonComparison: HorizonRobustnessRow[];
  periodStability: PeriodStabilityRow[];
  sampleSizeNotes: string[];
  lookahead: LookaheadSelectionAuditResult | null;
}
