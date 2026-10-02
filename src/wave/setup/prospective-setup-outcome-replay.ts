import {
  PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS,
  PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
} from "./prospective-setup-outcome-replay-contract";
import type {
  ProspectiveSetupOutcomeReplayInput,
  ProspectiveSetupOutcomeReplayResult,
  ProspectiveSetupOutcomeReplayStatus,
} from "./prospective-setup-outcome-replay-types";

function finite(n: number | null | undefined): boolean {
  return n !== null && n !== undefined && Number.isFinite(n);
}

export function candleTouchesTarget(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  targetPrice: number
): boolean {
  if (direction === "BULLISH") {
    return candle.high >= targetPrice;
  }
  return candle.low <= targetPrice;
}

export function candleTouchesInvalidation(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  invalidationPrice: number
): boolean {
  if (direction === "BULLISH") {
    return candle.low <= invalidationPrice;
  }
  return candle.high >= invalidationPrice;
}

function emptyResult(
  outcome: ProspectiveSetupOutcomeReplayStatus,
  input: ProspectiveSetupOutcomeReplayInput,
  horizonBars: number
): ProspectiveSetupOutcomeReplayResult {
  return {
    schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
    outcome,
    evaluationBarIndex: input.evaluationBarIndex,
    resolutionBarIndex: null,
    barsAfterEvaluation: null,
    targetPrice: finite(input.targetReferencePrice)
      ? input.targetReferencePrice
      : null,
    invalidationPrice: finite(input.invalidationReferencePrice)
      ? input.invalidationReferencePrice
      : null,
    direction:
      input.direction === "BULLISH" || input.direction === "BEARISH"
        ? input.direction
        : null,
    horizonBars,
    targetTouched: false,
    invalidationTouched: false,
    prospectiveSetupId: input.prospectiveSetupId ?? null,
  };
}

/**
 * Deterministic post-evaluation replay. Does not alter trade evaluation or references.
 * Replay window: [evaluationBarIndex + 1, evaluationBarIndex + horizonBars] inclusive.
 */
export function replayProspectiveSetupOutcome(
  input: ProspectiveSetupOutcomeReplayInput
): ProspectiveSetupOutcomeReplayResult {
  const horizonBars =
    input.horizonBars ?? PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS;

  if (!finite(input.evaluationBarIndex)) {
    return emptyResult("INSUFFICIENT_CONTEXT", input, horizonBars);
  }
  if (input.direction !== "BULLISH" && input.direction !== "BEARISH") {
    return emptyResult("INSUFFICIENT_CONTEXT", input, horizonBars);
  }
  if (!finite(input.targetReferencePrice)) {
    return emptyResult("INSUFFICIENT_CONTEXT", input, horizonBars);
  }
  if (!finite(input.invalidationReferencePrice)) {
    return emptyResult("INSUFFICIENT_CONTEXT", input, horizonBars);
  }

  const evalIdx = Math.floor(input.evaluationBarIndex!);
  const start = evalIdx + 1;
  const lastIndex = input.candles.length - 1;
  const end = Math.min(evalIdx + horizonBars, lastIndex);

  if (start > lastIndex) {
    return emptyResult("NO_FUTURE_DATA", input, horizonBars);
  }

  const targetPrice = input.targetReferencePrice!;
  const invalidationPrice = input.invalidationReferencePrice!;
  const direction = input.direction;

  for (let i = start; i <= end; i++) {
    const candle = input.candles[i];
    if (!candle) {
      continue;
    }
    const targetHit = candleTouchesTarget(direction, candle, targetPrice);
    const invHit = candleTouchesInvalidation(
      direction,
      candle,
      invalidationPrice
    );
    if (targetHit && invHit) {
      return {
        schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
        outcome: "AMBIGUOUS",
        evaluationBarIndex: evalIdx,
        resolutionBarIndex: i,
        barsAfterEvaluation: i - evalIdx,
        targetPrice,
        invalidationPrice,
        direction,
        horizonBars,
        targetTouched: true,
        invalidationTouched: true,
        prospectiveSetupId: input.prospectiveSetupId ?? null,
      };
    }
    if (targetHit) {
      return {
        schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
        outcome: "TARGET_TOUCHED",
        evaluationBarIndex: evalIdx,
        resolutionBarIndex: i,
        barsAfterEvaluation: i - evalIdx,
        targetPrice,
        invalidationPrice,
        direction,
        horizonBars,
        targetTouched: true,
        invalidationTouched: false,
        prospectiveSetupId: input.prospectiveSetupId ?? null,
      };
    }
    if (invHit) {
      return {
        schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
        outcome: "INVALIDATION_TOUCHED",
        evaluationBarIndex: evalIdx,
        resolutionBarIndex: i,
        barsAfterEvaluation: i - evalIdx,
        targetPrice,
        invalidationPrice,
        direction,
        horizonBars,
        targetTouched: false,
        invalidationTouched: true,
        prospectiveSetupId: input.prospectiveSetupId ?? null,
      };
    }
  }

  return {
    schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
    outcome: "NO_TOUCH",
    evaluationBarIndex: evalIdx,
    resolutionBarIndex: null,
    barsAfterEvaluation: end - evalIdx,
    targetPrice,
    invalidationPrice,
    direction,
    horizonBars,
    targetTouched: false,
    invalidationTouched: false,
    prospectiveSetupId: input.prospectiveSetupId ?? null,
  };
}
