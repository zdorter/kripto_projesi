import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";

export type RealMarketTransitionSemanticsDiagnostics = ReturnType<
  typeof buildTransitionSemanticsDiagnostics
>;

export function buildTransitionSemanticsDiagnostics(
  candidates: ProspectiveSetupProductionCandidate[]
) {
  const byLevel: Record<string, number> = {};
  let transitionObserved = 0;
  let openMovementOnly = 0;
  let lagSamples = 0;
  let lagSum = 0;

  for (const c of candidates) {
    const level = c.contract.transitionEvidence.transitionEvidenceLevel;
    byLevel[level] = (byLevel[level] ?? 0) + 1;
    if (c.contract.structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED") {
      transitionObserved += 1;
    }
    if (level === "OPEN_MOVEMENT_ONLY") {
      openMovementOnly += 1;
    }
    const lag = c.contract.transitionEvidence.swingConfirmationLagBars;
    if (lag !== null && Number.isFinite(lag)) {
      lagSamples += 1;
      lagSum += lag;
    }
  }

  return {
    schemaVersion: "1.0" as const,
    transitionRuleId: "CONFIRMED_SWING_AFTER_COMPLETED_ENDPOINT",
    byEvidenceLevel: byLevel,
    structuralTransitionObserved: transitionObserved,
    openMovementOnly,
    meanSwingConfirmationLagBars:
      lagSamples > 0 ? lagSum / lagSamples : null,
  };
}
