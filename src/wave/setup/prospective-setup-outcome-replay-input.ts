import type { Candle } from "../types";
import type { ProductionWaveScannerComposedRow } from "../wave-scanner-presentation";
import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS } from "./prospective-setup-outcome-replay-contract";
import type { ProspectiveSetupOutcomeReplayInput } from "./prospective-setup-outcome-replay-types";
import { resolveProspectiveStructuralInvalidation } from "./prospective-structural-invalidation";

export interface BuildProspectiveSetupOutcomeReplayInputOptions {
  horizonBars?: number;
}

/**
 * Maps scanner composition output to B-6 replay input. Does not compute refs or run replay.
 * Returns null when replay cannot be wired (missing composition); B-6 handles INSUFFICIENT_CONTEXT.
 */
export function buildProspectiveSetupOutcomeReplayInput(
  composed: ProductionWaveScannerComposedRow,
  candles: Candle[],
  options?: BuildProspectiveSetupOutcomeReplayInputOptions
): ProspectiveSetupOutcomeReplayInput | null {
  if (!candles.length) {
    return null;
  }
  if (composed.loadError) {
    return null;
  }
  if (!composed.production || !composed.historicalSetup) {
    return null;
  }
  if (
    composed.evaluationBarIndex === null ||
    composed.evaluationBarIndex < 0
  ) {
    return null;
  }

  const structuralInv = resolveProspectiveStructuralInvalidation(
    composed.historicalSetup
  );
  const observed = composed.production.observedDirection;

  return {
    direction:
      observed === "BULLISH" ||
      observed === "BEARISH" ||
      observed === "UNRESOLVED"
        ? observed
        : null,
    entryReferencePrice: composed.references.entry.referencePrice,
    targetReferencePrice: composed.references.target.referencePrice,
    invalidationReferencePrice: structuralInv.invalidationPrice,
    evaluationBarIndex: composed.evaluationBarIndex,
    candles,
    horizonBars:
      options?.horizonBars ??
      PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS,
    prospectiveSetupId: composed.production.id,
  };
}
