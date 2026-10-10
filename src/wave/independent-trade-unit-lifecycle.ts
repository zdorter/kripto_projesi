import type { HistoricalBacktestReport } from "./historical-backtest-types";
import {
  INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DEFAULT,
  INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_SCHEMA_VERSION,
  snapshotPassesIndependentTradeEntryEventPolicy,
  type IndependentTradeEntryEventPolicyId,
} from "./independent-trade-entry-event-policy-contract";
import { HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY } from "./historical-measurement-dimension-statistics-types";
import { resolveHistoricalMeasurementCanonicalRrRatio } from "./historical-measurement-rr-statistics";
import { resolveHistoricalMeasurementSetupFamily } from "./historical-measurement-dimension-statistics";
import { classifyHistoricalPositionOutcomePolicy } from "./historical-position-outcome-policy";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "./historical-position-outcome-policy-types";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "./historical-position-outcome-statistics";
import type { HistoricalPositionPathResult } from "./historical-position-path-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import {
  INDEPENDENT_TRADE_POSITION_MUTEX_POLICY_DEFAULT,
  INDEPENDENT_TRADE_RE_ENTRY_POLICY_DEFAULT,
  INDEPENDENT_TRADE_SIBLING_CANDIDATE_POLICY_DEFAULT,
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  type BuildIndependentTradeLifecycleInput,
  type IndependentTradeEntryRejectionReason,
  type IndependentTradeLifecycleReport,
  type IndependentTradeLifecycleStatus,
  type IndependentTradeLifecycleSummary,
  type IndependentTradeSiblingCandidatePolicyId,
  type IndependentTradeUnit,
  type IndependentTradeUnitConfiguration,
} from "./independent-trade-unit-lifecycle-types";

function isPathMeasuredForLifecycle(
  outcome: ProspectiveSetupOutcomeReplayStatus
): boolean {
  return (
    outcome !== "NO_FUTURE_DATA" && outcome !== "INSUFFICIENT_CONTEXT"
  );
}

/**
 * Exit bar for mutex (B-12b). Does not simulate fills.
 * NO_TOUCH: last bar of the forward observation window at E.
 */
export function resolveIndependentTradeExitBarIndex(
  pathResult: HistoricalPositionPathResult
): number | null {
  const e = pathResult.evaluationBarIndex;
  if (e === null || e < 0) {
    return null;
  }
  switch (pathResult.outcome) {
    case "TARGET_TOUCHED":
    case "INVALIDATION_TOUCHED":
    case "AMBIGUOUS":
      return pathResult.resolutionBarIndex;
    case "NO_TOUCH": {
      const span = Math.min(pathResult.horizonBars, pathResult.futureBarsAvailable);
      if (span <= 0) {
        return null;
      }
      return e + span;
    }
    case "NO_FUTURE_DATA":
    case "INSUFFICIENT_CONTEXT":
      return null;
    default:
      return null;
  }
}

function resolveLifecycleStatus(
  pathOutcome: ProspectiveSetupOutcomeReplayStatus
): IndependentTradeLifecycleStatus {
  switch (pathOutcome) {
    case "TARGET_TOUCHED":
    case "INVALIDATION_TOUCHED":
      return "OPEN_RESOLVED";
    case "AMBIGUOUS":
      return "AMBIGUOUS_EXIT";
    case "NO_TOUCH":
      return "UNRESOLVED_AT_HORIZON_EXIT";
    default:
      return "PATH_UNMEASURED";
  }
}

function selectSiblingAtE(
  observations: ReturnType<typeof pairHistoricalPositionOutcomeObservationsWithBatch>,
  policyId: IndependentTradeSiblingCandidatePolicyId
): (typeof observations)[number] | null {
  if (!observations.length) {
    return null;
  }
  if (policyId === "SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID") {
    const sorted = [...observations].sort((a, b) =>
      a.entry.prospectiveSetupId.localeCompare(b.entry.prospectiveSetupId)
    );
    return sorted[0]!;
  }
  return null;
}

function buildTradeId(
  symbol: string,
  timeframe: string,
  sequence: number,
  evaluationBarIndex: number,
  prospectiveSetupId: string
): string {
  return `${symbol}:${timeframe}:trade:${sequence}:${evaluationBarIndex}:${prospectiveSetupId}`;
}

/**
 * B-12b: derive non-overlapping independent trade units from a B-10f report (no PnL).
 */
export function buildIndependentTradeLifecycleReport(
  input: BuildIndependentTradeLifecycleInput
): IndependentTradeLifecycleReport {
  const { report } = input;
  const entryEventPolicyId =
    input.entryEventPolicyId ?? INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DEFAULT;
  const siblingCandidatePolicyId =
    input.siblingCandidatePolicyId ??
    INDEPENDENT_TRADE_SIBLING_CANDIDATE_POLICY_DEFAULT;
  const outcomePolicyId =
    report.configuration.policyId ??
    POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0;

  const configuration: IndependentTradeUnitConfiguration = {
    lifecycleSchemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
    entryEventPolicyId,
    entryEventPolicySchemaVersion:
      INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_SCHEMA_VERSION,
    siblingCandidatePolicyId,
    reEntryPolicyId:
      input.reEntryPolicyId ?? INDEPENDENT_TRADE_RE_ENTRY_POLICY_DEFAULT,
    positionMutexPolicyId:
      input.positionMutexPolicyId ??
      INDEPENDENT_TRADE_POSITION_MUTEX_POLICY_DEFAULT,
    outcomePolicyId,
    horizonBars: report.configuration.horizonBars,
  };

  const emptySummary = (): IndependentTradeLifecycleSummary => ({
    totalSnapshots: 0,
    eligibleEntrySnapshots: 0,
    rejectedByMutex: 0,
    rejectedSiblingNotSelected: 0,
    rejectedPathUnmeasured: 0,
    independentTrades: 0,
    measuredTrades: 0,
    unmeasuredSnapshots: 0,
    overlappingSnapshotsEliminated: 0,
    firstEvaluationBar: null,
    lastEvaluationBar: null,
    minLifecycleDurationBars: null,
    maxLifecycleDurationBars: null,
  });

  if (report.configuration.rangeError !== null) {
    return {
      schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
      configuration,
      summary: emptySummary(),
      trades: [],
      entryRejections: [],
    };
  }

  const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
    report.artifact,
    report.pathBatch
  );

  const totalSnapshots = observations.length;
  let eligibleEntrySnapshots = 0;
  let rejectedByMutex = 0;
  let rejectedSiblingNotSelected = 0;
  let rejectedPathUnmeasured = 0;
  let unmeasuredSnapshots = 0;
  let overlappingSnapshotsEliminated = 0;

  const entryRejections: Array<{
    snapshotId: string;
    evaluationBarIndex: number;
    reason: IndependentTradeEntryRejectionReason;
  }> = [];

  const byE = new Map<number, typeof observations>();
  for (const obs of observations) {
    const e = obs.entry.evaluationBarIndex;
    const list = byE.get(e) ?? [];
    list.push(obs);
    byE.set(e, list);
  }

  const evaluationBars = [...byE.keys()].sort((a, b) => a - b);
  const trades: IndependentTradeUnit[] = [];
  const lastExitBarBySymbol = new Map<string, number>();
  const sequenceBySymbol = new Map<string, number>();

  for (const e of evaluationBars) {
    const atE = byE.get(e)!;
    const eligibleAtE = atE.filter((obs) =>
      snapshotPassesIndependentTradeEntryEventPolicy(
        obs.entry,
        entryEventPolicyId
      )
    );
    eligibleEntrySnapshots += eligibleAtE.length;

    for (const obs of atE) {
      if (!eligibleAtE.includes(obs)) {
        entryRejections.push({
          snapshotId: obs.entry.snapshotId,
          evaluationBarIndex: e,
          reason: "NOT_ENTRY_ELIGIBLE",
        });
      }
    }

    if (!eligibleAtE.length) {
      continue;
    }

    const selected = selectSiblingAtE(eligibleAtE, siblingCandidatePolicyId);
    if (!selected) {
      continue;
    }

    for (const obs of eligibleAtE) {
      if (obs.entry.snapshotId !== selected.entry.snapshotId) {
        rejectedSiblingNotSelected += 1;
        overlappingSnapshotsEliminated += 1;
        entryRejections.push({
          snapshotId: obs.entry.snapshotId,
          evaluationBarIndex: e,
          reason: "SIBLING_NOT_SELECTED",
        });
      }
    }

    const { entry, pathResult } = selected;
    const symbol = entry.symbol;

    if (!isPathMeasuredForLifecycle(pathResult.outcome)) {
      rejectedPathUnmeasured += 1;
      unmeasuredSnapshots += 1;
      entryRejections.push({
        snapshotId: entry.snapshotId,
        evaluationBarIndex: e,
        reason: "PATH_UNMEASURED",
      });
      continue;
    }

    const lastExit = lastExitBarBySymbol.get(symbol);
    if (lastExit !== undefined && e <= lastExit) {
      rejectedByMutex += 1;
      overlappingSnapshotsEliminated += 1;
      entryRejections.push({
        snapshotId: entry.snapshotId,
        evaluationBarIndex: e,
        reason: "MUTEX_POSITION_OPEN",
      });
      continue;
    }

    const exitBar = resolveIndependentTradeExitBarIndex(pathResult);
    if (exitBar === null) {
      rejectedPathUnmeasured += 1;
      entryRejections.push({
        snapshotId: entry.snapshotId,
        evaluationBarIndex: e,
        reason: "PATH_UNMEASURED",
      });
      continue;
    }

    const seq = (sequenceBySymbol.get(symbol) ?? 0) + 1;
    sequenceBySymbol.set(symbol, seq);

    const { classification } = classifyHistoricalPositionOutcomePolicy(
      pathResult,
      outcomePolicyId
    );

    const lifecycleDurationBars = exitBar - e;
    const trade: IndependentTradeUnit = {
      tradeId: buildTradeId(
        entry.symbol,
        entry.timeframe,
        seq,
        e,
        entry.prospectiveSetupId
      ),
      lifecycleSequence: seq,
      snapshotId: entry.snapshotId,
      symbol: entry.symbol,
      timeframe: entry.timeframe,
      evaluationBarIndex: e,
      evaluationBarTime: entry.evaluationBarTime,
      prospectiveSetupId: entry.prospectiveSetupId,
      sourceSetupId: entry.evaluation.production?.sourceSetupId ?? null,
      direction: pathResult.direction,
      entryReferencePrice: entry.evaluation.references.entry.referencePrice,
      targetReferencePrice: entry.evaluation.references.target.referencePrice,
      invalidationReferencePrice: pathResult.invalidationReferencePrice,
      canonicalRrRatio: resolveHistoricalMeasurementCanonicalRrRatio(entry),
      snapshotCohorts: [...entry.cohorts],
      setupFamilyId: resolveHistoricalMeasurementSetupFamily(entry),
      tradeEvaluationStatus: entry.evaluation.tradeEvaluation.status,
      evaluatorFirstFailure: entry.evaluation.tradeEvaluation.firstFailure,
      pathOutcome: pathResult.outcome,
      policyClassification: classification,
      lifecycleStatus: resolveLifecycleStatus(pathResult.outcome),
      exitBarIndex: exitBar,
      resolutionBarIndex: pathResult.resolutionBarIndex,
      barsAfterEvaluation: pathResult.barsAfterEvaluation,
      lifecycleDurationBars,
    };
    trades.push(trade);
    lastExitBarBySymbol.set(symbol, exitBar);
  }

  const durations = trades
    .map((t) => t.lifecycleDurationBars)
    .filter((d): d is number => d !== null);
  const summary: IndependentTradeLifecycleSummary = {
    totalSnapshots,
    eligibleEntrySnapshots,
    rejectedByMutex,
    rejectedSiblingNotSelected,
    rejectedPathUnmeasured,
    independentTrades: trades.length,
    measuredTrades: trades.filter((t) =>
      isPathMeasuredForLifecycle(t.pathOutcome)
    ).length,
    unmeasuredSnapshots,
    overlappingSnapshotsEliminated,
    firstEvaluationBar: trades.length ? trades[0].evaluationBarIndex : null,
    lastEvaluationBar: trades.length
      ? trades[trades.length - 1].evaluationBarIndex
      : null,
    minLifecycleDurationBars: durations.length ? Math.min(...durations) : null,
    maxLifecycleDurationBars: durations.length ? Math.max(...durations) : null,
  };

  return {
    schemaVersion: INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
    configuration,
    summary,
    trades,
    entryRejections,
  };
}
