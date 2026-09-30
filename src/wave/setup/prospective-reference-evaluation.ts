import type { Candle } from "../types";
import type { ProspectiveSetupProductionCandidate } from "./prospective-setup-production-types";
import { resolveProspectiveStructuralInvalidation } from "./prospective-structural-invalidation";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type { SetupCandidate } from "./setup-types";

export type ProspectiveReferenceOutcome = "AVAILABLE" | "INSUFFICIENT_CONTEXT";

export interface ProspectiveReferenceEvaluation {
  schemaVersion: "1.0";
  prospectiveId: string;
  entry: {
    outcome: ProspectiveReferenceOutcome;
    referencePrice: number | null;
    modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE";
  };
  stop: {
    outcome: ProspectiveReferenceOutcome;
    referencePrice: number | null;
    modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE";
  };
  target: {
    outcome: ProspectiveReferenceOutcome;
    referencePrice: number | null;
    modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION";
    policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY";
  };
  rr: {
    outcome: ProspectiveReferenceOutcome;
    ratio: number | null;
  };
  readyForFurtherEvaluation: boolean;
  limitations: string[];
}

/**
 * Prospective reference bundle — not entry/stop/target orders or trade signals.
 */
export function evaluateProspectiveReferenceBundle(input: {
  production: ProspectiveSetupProductionCandidate;
  historicalSetup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
}): ProspectiveReferenceEvaluation {
  const limitations = [
    "Prospective reference evaluation is not a trade signal or execution instruction.",
    "Entry reference is evaluation-bar close only (no enter-now semantics).",
    "Stop reference maps structural invalidation when on risk side of entry.",
    "Target reference uses explicit open-leg range equality projection policy.",
  ];

  if (input.production.status !== "CONFIRMED") {
    return {
      schemaVersion: "1.0",
      prospectiveId: input.production.id,
      entry: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
      },
      stop: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
      },
      target: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
        policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY",
      },
      rr: { outcome: "INSUFFICIENT_CONTEXT", ratio: null },
      readyForFurtherEvaluation: false,
      limitations,
    };
  }

  const bar = input.bundle.evaluationBarIndex;
  const close = input.candles[bar]?.close;
  const leg = input.production.openLegResolution.leg;
  const inv = resolveProspectiveStructuralInvalidation(input.historicalSetup);

  const entryOk = Number.isFinite(close);
  const entryPrice = entryOk ? (close as number) : null;

  let stopOk = false;
  let stopPrice: number | null = null;
  if (entryOk && inv.invalidationPrice !== null && leg) {
    const dir = leg.observedDirection;
    if (dir === "BULLISH" && inv.invalidationPrice < entryPrice!) {
      stopOk = true;
      stopPrice = inv.invalidationPrice;
    }
    if (dir === "BEARISH" && inv.invalidationPrice > entryPrice!) {
      stopOk = true;
      stopPrice = inv.invalidationPrice;
    }
  }

  let targetOk = false;
  let targetPrice: number | null = null;
  if (entryOk && leg && leg.observedDirection !== "UNRESOLVED") {
    const move = entryPrice! - leg.anchorPrice;
    targetPrice = entryPrice! + move;
    targetOk = Number.isFinite(targetPrice);
  }

  let rrOk = false;
  let ratio: number | null = null;
  if (entryOk && stopOk && targetOk && stopPrice !== null && targetPrice !== null) {
    const risk = Math.abs(entryPrice! - stopPrice);
    const reward = Math.abs(targetPrice - entryPrice!);
    if (risk > 0) {
      ratio = reward / risk;
      rrOk = Number.isFinite(ratio);
    }
  }

  const ready =
    entryOk && stopOk && targetOk && rrOk && input.production.targetGateOutcome === "PASS";

  return {
    schemaVersion: "1.0",
    prospectiveId: input.production.id,
    entry: {
      outcome: entryOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: entryPrice,
      modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
    },
    stop: {
      outcome: stopOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: stopPrice,
      modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
    },
    target: {
      outcome: targetOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: targetPrice,
      modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
      policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY",
    },
    rr: {
      outcome: rrOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      ratio,
    },
    readyForFurtherEvaluation: ready,
    limitations,
  };
}
