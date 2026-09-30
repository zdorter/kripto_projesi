import type { ProspectiveSetupProductionCandidate } from "./setup/prospective-setup-production-types";
import type { ProspectiveReferenceEvaluation } from "./setup/prospective-reference-evaluation";
import { normalizeProspectiveTargetPolicyId } from "./setup/prospective-open-leg-displacement-equality-policy";
import type { SetupCandidate } from "./setup/setup-types";
import {
  WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION,
  type WaveScannerLayerStatus,
  type WaveScannerReferencePresentation,
  type WaveScannerRowPresentation,
} from "./wave-scanner-presentation-types";

export interface ProductionWaveScannerComposedRow {
  symbol: string;
  timeframe: string;
  loadError: string | null;
  historicalSetup: SetupCandidate | null;
  production: ProspectiveSetupProductionCandidate | null;
  references: ProspectiveReferenceEvaluation;
  evaluationBarTime: number | null;
  evaluationBarIndex: number | null;
  candleCount: number;
}

function layerStatus(
  outcome: "AVAILABLE" | "INSUFFICIENT_CONTEXT"
): WaveScannerLayerStatus {
  return outcome === "AVAILABLE" ? "AVAILABLE" : "INSUFFICIENT_CONTEXT";
}

function refField(
  outcome: "AVAILABLE" | "INSUFFICIENT_CONTEXT",
  price: number | null,
  source: string | null
): WaveScannerReferencePresentation {
  return {
    status: layerStatus(outcome),
    price,
    source,
  };
}

function displayStatusForRow(row: ProductionWaveScannerComposedRow): string {
  if (row.loadError) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (row.references.readyForFurtherEvaluation) {
    return "READY FOR EVALUATION";
  }
  if (row.production?.status) {
    return row.production.status;
  }
  return "INSUFFICIENT_CONTEXT";
}

export function presentWaveScannerRow(
  row: ProductionWaveScannerComposedRow
): WaveScannerRowPresentation {
  const production = row.production;
  const contract = production?.contract;
  const setup = row.historicalSetup;

  const entryReference = refField(
    row.references.entry.outcome,
    row.references.entry.referencePrice,
    row.references.entry.modelId
  );
  const stopReference = refField(
    row.references.stop.outcome,
    row.references.stop.referencePrice,
    row.references.stop.modelId
  );
  const targetReference = refField(
    row.references.target.outcome,
    row.references.target.referencePrice,
    row.references.target.policyId
  );
  const rr = {
    status: layerStatus(row.references.rr.outcome),
    value: row.references.rr.ratio,
  };

  const prospectiveSetup = production
    ? {
        family: production.familyId,
        status: production.status,
        temporalState: contract?.phaseStatus ?? "NOT_ESTABLISHED",
      }
    : null;

  const structure =
    setup?.scenarioRef.structure ??
    contract?.transitionEvidence.completedStructure ??
    null;
  const scenarioLabel = setup
    ? `${setup.scenarioRef.structure} · wave ${setup.scenarioRef.waveLabel}`
    : null;

  const blockerStage = production?.funnelFirstFailure ?? null;
  const blockerReason = production?.funnelReasonCode ?? row.loadError;

  const trace = {
    anchorIndex: production?.openLegResolution.leg?.anchorIndex ?? null,
    anchorPrice: production?.openLegResolution.leg?.anchorPrice ?? null,
    anchorSources: production?.openLegResolution.leg?.selectedAnchorSources ?? [],
    anchorResolutionMode:
      production?.openLegResolution.anchorResolutionMode ?? null,
    completedEndpointIndex: contract?.transitionEvidence.completedAtIndex ?? null,
    completedEndpointPrice: setup?.sourceScenario.endPrice ?? null,
    observedDirection: production?.observedDirection ?? null,
    transitionEvidenceLevel:
      contract?.transitionEvidence.transitionEvidenceLevel ?? null,
    swingConfirmationLagBars:
      contract?.transitionEvidence.swingConfirmationLagBars ?? null,
    subsequentSwingIndex:
      contract?.transitionEvidence.subsequentSwingIndex ?? null,
    invalidationSource: setup?.invalidation.usesScenarioInvalidation
      ? "SCENARIO_INVALIDATION"
      : "SETUP_INVALIDATION",
    invalidationAvailable: contract?.invalidationAvailable ?? false,
    targetPolicyId: normalizeProspectiveTargetPolicyId(row.references.target.policyId),
    transitionRuleId: contract?.transitionEvidence.transitionRuleId ?? null,
  };

  const technicalDiagnostics = production
    ? {
        prospectiveId: production.id,
        funnel: {
          firstFailure: production.funnelFirstFailure,
          reason: production.funnelReasonCode,
        },
        openLeg: production.openLegResolution,
        contractPhase: contract?.phaseStatus,
        targetGate: production.targetGateOutcome,
      }
    : { loadError: row.loadError };

  return {
    schemaVersion: WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION,
    symbol: row.symbol,
    timeframe: row.timeframe,
    evaluationBarTime: row.evaluationBarTime,
    structure,
    scenario: scenarioLabel,
    prospectiveSetup,
    entryReference,
    stopReference,
    targetReference,
    rr,
    readyForFurtherEvaluation: row.references.readyForFurtherEvaluation,
    displayStatus: displayStatusForRow(row),
    blockerStage,
    blockerReason,
    futureSafe: production?.futureSafe ?? false,
    loadError: row.loadError,
    details: {
      market: {
        symbol: row.symbol,
        timeframe: row.timeframe,
        evaluationBarIndex: row.evaluationBarIndex,
        evaluationBarTime: row.evaluationBarTime,
        candleCount: row.candleCount,
      },
      structure,
      scenario: {
        scenarioId: setup?.scenarioRef.scenarioId ?? null,
        waveLabel: setup?.scenarioRef.waveLabel ?? null,
        structure: setup?.scenarioRef.structure ?? null,
        engineStatus: setup?.scenarioRef.engineStatus ?? null,
      },
      prospectiveSetup,
      historicalSetupStatus: setup?.status ?? null,
      anchor: {
        selection: production?.openLegResolution.anchorSelection ?? null,
        status: production?.openLegResolution.status ?? null,
      },
      openStructuralLeg: {
        status: production?.openLegResolution.status ?? null,
        observationEndIndex:
          production?.openLegResolution.leg?.observationEndIndex ?? null,
        observationSpanBars:
          production?.openLegResolution.leg?.observationSpanBars ?? null,
      },
      transition: {
        verdict: contract?.structuralTransitionVerdict ?? null,
        evidenceLevel: contract?.transitionEvidence.transitionEvidenceLevel ?? null,
      },
      invalidation: {
        available: contract?.invalidationAvailable ?? false,
        triggered: setup?.status === "INVALID",
      },
      entryReference,
      stopReference,
      targetReference,
      rr,
      structuralTrace: trace,
      technicalDiagnosticsJson: JSON.stringify(technicalDiagnostics, null, 2),
    },
  };
}

/** Labels for UI copy tests — must not imply trade instructions. */
export const WAVE_SCANNER_UI_LABELS = {
  entryColumn: "Entry Ref",
  stopColumn: "SL Ref",
  targetColumn: "Target Ref",
  readyDisplay: "READY FOR EVALUATION",
  targetPolicyDescription: "Anchor → evaluation displacement equality",
} as const;

export const WAVE_SCANNER_FORBIDDEN_UI_TOKENS = [
  "BUY",
  "SELL",
  "LONG",
  "SHORT",
  "TRADE NOW",
  "EXECUTE",
  "BEST SETUP",
] as const;
