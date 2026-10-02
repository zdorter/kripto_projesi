import type { Candle } from "../types";
import type { ProductionWaveScannerComposedRow } from "../wave-scanner-presentation";
import type { WaveScannerOutcomeReplayPresentation } from "../wave-scanner-presentation-types";
import { buildProspectiveSetupOutcomeReplayInput } from "./prospective-setup-outcome-replay-input";
import { replayProspectiveSetupOutcome } from "./prospective-setup-outcome-replay";
import {
  futureBarsAvailableAfterEvaluation,
  mapProspectiveSetupOutcomeReplayPresentation,
} from "./prospective-setup-outcome-replay-presentation";

export interface ProspectiveSetupOutcomeReplayEnrichmentOptions {
  horizonBars?: number;
}

/**
 * Opt-in enrichment: composed row + candles → outcome replay presentation.
 * Does not mutate trade evaluation or MVP references.
 */
export function enrichProspectiveSetupOutcomeReplay(
  composed: ProductionWaveScannerComposedRow,
  candles: Candle[],
  options?: ProspectiveSetupOutcomeReplayEnrichmentOptions
): WaveScannerOutcomeReplayPresentation | null {
  const replayInput = buildProspectiveSetupOutcomeReplayInput(
    composed,
    candles,
    { horizonBars: options?.horizonBars }
  );
  if (!replayInput) {
    return null;
  }
  const evalIdx = composed.evaluationBarIndex!;
  const futureBarsAvailable = futureBarsAvailableAfterEvaluation(
    evalIdx,
    candles.length
  );
  const result = replayProspectiveSetupOutcome(replayInput);
  return mapProspectiveSetupOutcomeReplayPresentation(
    result,
    futureBarsAvailable
  );
}
