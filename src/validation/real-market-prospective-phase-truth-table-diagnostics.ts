import { evaluateProspectivePhaseTruth } from "../wave/setup/prospective-phase-semantics";
import { resolveProspectiveStructuralInvalidation } from "../wave/setup/prospective-structural-invalidation";
import { evaluateProspectiveSourcePolicy } from "../wave/setup/prospective-setup-source-policy";
import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";

export type RealMarketProspectivePhaseTruthTableDiagnostics = ReturnType<
  typeof buildProspectivePhaseTruthTableDiagnostics
>;

export function buildProspectivePhaseTruthTableDiagnostics(input: {
  candidates: ProspectiveSetupProductionCandidate[];
  tradeContext: TradeSetupEvaluationContext;
  setupsById: Map<string, SetupCandidate>;
}) {
  const blockingHistogram: Record<string, number> = {};
  let productionConfirmed = 0;
  const sampleRows: Array<{
    prospectiveId: string;
    phaseStatus: string;
    productionConfirmed: boolean;
    blockingReasons: string[];
  }> = [];

  for (const c of input.candidates) {
    const setup = input.setupsById.get(c.sourceSetupId);
    const bundle = input.tradeContext.bundlesBySymbol?.[c.symbol];
    const sourceOk =
      setup !== undefined &&
      bundle !== undefined &&
      evaluateProspectiveSourcePolicy({ setup, bundle }).verdict ===
        "ACCEPTED_HISTORICAL_TRADE_SETUP";

    const transitionObserved =
      c.contract.structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED";
    const structuralInvalidation = setup
      ? resolveProspectiveStructuralInvalidation(setup)
      : { available: false, triggered: true };
    const completedAtIndex = c.contract.transitionEvidence.completedAtIndex;
    const anchorAtCompleted =
      c.openLegResolution.leg !== null &&
      completedAtIndex !== null &&
      c.openLegResolution.leg.anchorIndex === completedAtIndex;

    const truth = evaluateProspectivePhaseTruth({
      sourceAccepted: sourceOk,
      anchorMatchesCompletedEndpoint: anchorAtCompleted,
      openLegAvailable: c.openLegResolution.status === "AVAILABLE",
      anchorSelected: c.openLegResolution.anchorSelection === "SELECTED",
      transitionObserved,
      invalidationAvailable: structuralInvalidation.available,
      invalidationTriggered:
        setup?.status === "INVALID" || structuralInvalidation.triggered,
      futureSafe: c.futureSafe,
      phaseStatus: c.contract.phaseStatus,
    });

    if (truth.productionConfirmed) {
      productionConfirmed += 1;
    }
    for (const r of truth.blockingReasons) {
      blockingHistogram[r] = (blockingHistogram[r] ?? 0) + 1;
    }
    if (sampleRows.length < 12) {
      sampleRows.push({
        prospectiveId: c.id,
        phaseStatus: c.contract.phaseStatus,
        productionConfirmed: truth.productionConfirmed,
        blockingReasons: truth.blockingReasons,
      });
    }
  }

  return {
    schemaVersion: "1.0" as const,
    productionConfirmed,
    blockingHistogram,
    sampleRows,
    circularDependencyNote:
      "Phase truth uses contract phaseStatus; production CONFIRMED does not require prior CONFIRMED.",
  };
}
