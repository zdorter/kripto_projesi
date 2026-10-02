import type { ProspectiveSetupOutcomeReplayResult } from "./prospective-setup-outcome-replay-types";
import type { WaveScannerOutcomeReplayPresentation } from "../wave-scanner-presentation-types";

export function futureBarsAvailableAfterEvaluation(
  evaluationBarIndex: number,
  candleCount: number
): number {
  if (candleCount <= 0 || evaluationBarIndex < 0) {
    return 0;
  }
  return Math.max(0, candleCount - 1 - evaluationBarIndex);
}

/** Maps B-6 domain result to scanner presentation DTO (no domain math). */
export function mapProspectiveSetupOutcomeReplayPresentation(
  result: ProspectiveSetupOutcomeReplayResult,
  futureBarsAvailable: number
): WaveScannerOutcomeReplayPresentation {
  return {
    outcome: result.outcome,
    horizonBars: result.horizonBars,
    futureBarsAvailable,
    resolutionBarIndex: result.resolutionBarIndex,
    barsAfterEvaluation: result.barsAfterEvaluation,
    targetTouched: result.targetTouched,
    invalidationTouched: result.invalidationTouched,
    prospectiveSetupId: result.prospectiveSetupId,
  };
}

function dash(n: number | null | undefined): string {
  return n !== null && n !== undefined && Number.isFinite(n) ? String(n) : "—";
}

/** Scanner details HTML — render only (domain precomputed). */
export function formatOutcomeReplayDetailsSection(
  outcome: WaveScannerOutcomeReplayPresentation | null | undefined
): string {
  if (!outcome) {
    return "";
  }
  return `
    <section class="detail-section">
      <h3>Outcome Replay</h3>
      <p>Outcome Replay: ${outcome.outcome}</p>
      <p>Horizon: ${outcome.horizonBars} bars</p>
      <p>Future Bars Available: ${outcome.futureBarsAvailable}</p>
      <p>Resolution Bar: ${dash(outcome.resolutionBarIndex)}</p>
      <p>Bars After Evaluation: ${dash(outcome.barsAfterEvaluation)}</p>
      <p>Target Touched: ${outcome.targetTouched}</p>
      <p>Invalidation Touched: ${outcome.invalidationTouched}</p>
      <p class="muted">Outcome replay is historical price-path evaluation, not a trade signal.</p>
    </section>`;
}
