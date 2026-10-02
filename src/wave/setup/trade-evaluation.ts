import {
  TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE,
  TRADE_EVALUATION_MIN_RR,
  TRADE_EVALUATION_SCHEMA_VERSION,
} from "./trade-evaluation-contract";
import type {
  TradeEvaluationCheckOutcome,
  TradeEvaluationFirstFailureCode,
  TradeEvaluationInput,
  TradeEvaluationResult,
  TradeEvaluationSetupValidity,
  TradeEvaluationStatus,
} from "./trade-evaluation-types";

function finite(n: number | null | undefined): boolean {
  return n !== null && n !== undefined && Number.isFinite(n);
}

/** Same RR math as prospective-reference-evaluation (reward/risk magnitudes). */
export function tradeEvaluationCanonicalRr(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number
): number | null {
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  if (risk <= 0 || !Number.isFinite(risk) || !Number.isFinite(reward)) {
    return null;
  }
  const ratio = reward / risk;
  return Number.isFinite(ratio) ? ratio : null;
}

export function evaluateEntryFreshness(
  entryReference: number | null,
  liveMarketPrice: number | null
): {
  outcome: TradeEvaluationCheckOutcome;
  deviationRatio: number | null;
} {
  if (
    !finite(entryReference) ||
    !finite(liveMarketPrice) ||
    entryReference === 0
  ) {
    return { outcome: "INSUFFICIENT_CONTEXT", deviationRatio: null };
  }
  const deviationRatio =
    Math.abs(liveMarketPrice! - entryReference!) / Math.abs(entryReference!);
  if (deviationRatio <= TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE) {
    return { outcome: "VALID", deviationRatio };
  }
  return { outcome: "STALE", deviationRatio };
}

export function evaluateStopGeometry(
  direction: TradeEvaluationInput["direction"],
  entryPrice: number | null,
  stopPrice: number | null
): { outcome: TradeEvaluationCheckOutcome; risk: number | null } {
  if (!finite(entryPrice) || !finite(stopPrice)) {
    return { outcome: "INSUFFICIENT_CONTEXT", risk: null };
  }
  if (direction !== "BULLISH" && direction !== "BEARISH") {
    return { outcome: "INSUFFICIENT_CONTEXT", risk: null };
  }
  const risk = Math.abs(entryPrice! - stopPrice!);
  if (risk <= 0) {
    return { outcome: "INVALID", risk };
  }
  if (direction === "BULLISH") {
    return {
      outcome: stopPrice! < entryPrice! ? "VALID" : "INVALID",
      risk,
    };
  }
  return {
    outcome: stopPrice! > entryPrice! ? "VALID" : "INVALID",
    risk,
  };
}

export function evaluateTargetGeometry(
  direction: TradeEvaluationInput["direction"],
  entryPrice: number | null,
  targetPrice: number | null
): { outcome: TradeEvaluationCheckOutcome; reward: number | null } {
  if (!finite(entryPrice) || !finite(targetPrice)) {
    return { outcome: "INSUFFICIENT_CONTEXT", reward: null };
  }
  if (direction !== "BULLISH" && direction !== "BEARISH") {
    return { outcome: "INSUFFICIENT_CONTEXT", reward: null };
  }
  const reward = Math.abs(targetPrice! - entryPrice!);
  if (reward <= 0) {
    return { outcome: "INVALID", reward };
  }
  if (direction === "BULLISH") {
    return {
      outcome: targetPrice! > entryPrice! ? "VALID" : "INVALID",
      reward,
    };
  }
  return {
    outcome: targetPrice! < entryPrice! ? "VALID" : "INVALID",
    reward,
  };
}

export function evaluateRrCheck(
  entryPrice: number | null,
  stopPrice: number | null,
  targetPrice: number | null
): { outcome: TradeEvaluationCheckOutcome; rrRatio: number | null } {
  if (!finite(entryPrice) || !finite(stopPrice) || !finite(targetPrice)) {
    return { outcome: "INSUFFICIENT_CONTEXT", rrRatio: null };
  }
  const rrRatio = tradeEvaluationCanonicalRr(
    entryPrice!,
    stopPrice!,
    targetPrice!
  );
  if (rrRatio === null) {
    return { outcome: "INSUFFICIENT_CONTEXT", rrRatio: null };
  }
  if (rrRatio >= TRADE_EVALUATION_MIN_RR) {
    return { outcome: "VALID", rrRatio };
  }
  return { outcome: "INVALID", rrRatio };
}

export function isStructuralInvalidationBreached(
  direction: "BULLISH" | "BEARISH",
  invalidationPrice: number,
  liveMarketPrice: number
): boolean {
  if (direction === "BULLISH") {
    return liveMarketPrice < invalidationPrice;
  }
  return liveMarketPrice > invalidationPrice;
}

export function evaluateSetupValidity(input: {
  direction: TradeEvaluationInput["direction"];
  liveMarketPrice: number | null;
  structuralInvalidationReferencePrice: number | null;
  setupLifecycleStatus: TradeEvaluationInput["setupLifecycleStatus"];
  structuralInvalidationTriggered: boolean;
}): TradeEvaluationSetupValidity {
  if (input.setupLifecycleStatus === null) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (input.setupLifecycleStatus === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (
    input.setupLifecycleStatus === "INVALID" ||
    input.structuralInvalidationTriggered
  ) {
    return "INVALID";
  }
  if (input.direction !== "BULLISH" && input.direction !== "BEARISH") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (!finite(input.liveMarketPrice)) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (
    !finite(input.structuralInvalidationReferencePrice) ||
    input.structuralInvalidationReferencePrice === 0
  ) {
    return "INSUFFICIENT_CONTEXT";
  }
  const breached = isStructuralInvalidationBreached(
    input.direction,
    input.structuralInvalidationReferencePrice!,
    input.liveMarketPrice!
  );
  return breached ? "INVALID" : "VALID";
}

function failureForCheck(
  check: keyof TradeEvaluationResult["checks"],
  outcome: string
): TradeEvaluationFirstFailureCode | null {
  if (outcome === "VALID") {
    return null;
  }
  if (check === "entry") {
    if (outcome === "STALE") {
      return "ENTRY_STALE";
    }
    return "ENTRY_INSUFFICIENT_CONTEXT";
  }
  if (check === "stop") {
    return outcome === "INVALID" ? "STOP_INVALID" : "STOP_INSUFFICIENT_CONTEXT";
  }
  if (check === "target") {
    return outcome === "INVALID"
      ? "TARGET_INVALID"
      : "TARGET_INSUFFICIENT_CONTEXT";
  }
  if (check === "rr") {
    return outcome === "INVALID"
      ? "RR_BELOW_MINIMUM"
      : "RR_INSUFFICIENT_CONTEXT";
  }
  if (check === "setupValidity") {
    return outcome === "INVALID"
      ? "SETUP_INVALIDATED"
      : "SETUP_INSUFFICIENT_CONTEXT";
  }
  return null;
}

function resolveFirstFailure(
  checks: TradeEvaluationResult["checks"]
): TradeEvaluationFirstFailureCode {
  const order: Array<keyof TradeEvaluationResult["checks"]> = [
    "entry",
    "stop",
    "target",
    "rr",
    "setupValidity",
  ];
  for (const key of order) {
    const outcome = checks[key];
    const code = failureForCheck(key, outcome);
    if (code) {
      return code;
    }
  }
  return null;
}

function resolveStatus(checks: TradeEvaluationResult["checks"]): TradeEvaluationStatus {
  const passed =
    checks.entry === "VALID" &&
    checks.stop === "VALID" &&
    checks.target === "VALID" &&
    checks.rr === "VALID" &&
    checks.setupValidity === "VALID";
  if (passed) {
    return "PASSED";
  }
  const geometryInsufficient =
    checks.entry === "INSUFFICIENT_CONTEXT" &&
    checks.stop === "INSUFFICIENT_CONTEXT" &&
    checks.target === "INSUFFICIENT_CONTEXT" &&
    checks.rr === "INSUFFICIENT_CONTEXT";
  if (geometryInsufficient && checks.setupValidity === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (geometryInsufficient && checks.setupValidity === "VALID") {
    return "INSUFFICIENT_CONTEXT";
  }
  return "FAILED";
}

function resolveStatusWithLiveTicker(
  checks: TradeEvaluationResult["checks"],
  entryRef: number | null,
  liveMarketPrice: number | null
): TradeEvaluationStatus {
  const status = resolveStatus(checks);
  if (
    finite(entryRef) &&
    !finite(liveMarketPrice) &&
    checks.entry === "INSUFFICIENT_CONTEXT"
  ) {
    return "INSUFFICIENT_CONTEXT";
  }
  return status;
}

export function evaluateTradeEvaluation(
  input: TradeEvaluationInput
): TradeEvaluationResult {
  const entryRef = input.entryReferencePrice;
  const entryForGeometry = finite(entryRef) ? entryRef : input.evaluationPrice;

  const entryFresh = evaluateEntryFreshness(entryRef, input.liveMarketPrice);
  const stop = evaluateStopGeometry(
    input.direction,
    entryForGeometry,
    input.stopReferencePrice
  );
  const target = evaluateTargetGeometry(
    input.direction,
    entryForGeometry,
    input.targetReferencePrice
  );
  const rr = evaluateRrCheck(
    entryForGeometry,
    input.stopReferencePrice,
    input.targetReferencePrice
  );
  const setupValidity = evaluateSetupValidity({
    direction: input.direction,
    liveMarketPrice: input.liveMarketPrice,
    structuralInvalidationReferencePrice:
      input.structuralInvalidationReferencePrice,
    setupLifecycleStatus: input.setupLifecycleStatus,
    structuralInvalidationTriggered: input.structuralInvalidationTriggered,
  });

  const checks = {
    entry: entryFresh.outcome,
    stop: stop.outcome,
    target: target.outcome,
    rr: rr.outcome,
    setupValidity,
  };

  const firstFailure = resolveFirstFailure(checks);
  const status = resolveStatusWithLiveTicker(
    checks,
    entryRef,
    input.liveMarketPrice
  );
  const passed = status === "PASSED";

  return {
    schemaVersion: TRADE_EVALUATION_SCHEMA_VERSION,
    status,
    passed,
    checks,
    firstFailure,
    diagnostics: {
      entryReferencePrice: entryRef,
      liveMarketPrice: input.liveMarketPrice,
      entryDeviationRatio: entryFresh.deviationRatio,
      entryDeviationPercent:
        entryFresh.deviationRatio !== null
          ? entryFresh.deviationRatio * 100
          : null,
      risk: stop.risk,
      reward: target.reward,
      rrRatio: rr.rrRatio,
      minimumRr: TRADE_EVALUATION_MIN_RR,
      entryFreshnessTolerance: TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE,
      direction: input.direction,
      structuralInvalidationReferencePrice:
        input.structuralInvalidationReferencePrice,
    },
    evaluationBarIndex: input.evaluationBarIndex,
    evaluationPrice: input.evaluationPrice,
    futureSafe: input.futureSafe,
  };
}
