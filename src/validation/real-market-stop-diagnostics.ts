import type { EntryPriceReference } from "../wave/setup/entry-model-types";
import {
  buildStopLossReport,
  evaluateStopLossModel,
  stopReferencesAvailable,
} from "../wave/setup/stop-loss-model";
import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import type {
  StopLossModelId,
  StopLossReference,
} from "../wave/setup/stop-loss-model-types";
import type { SetupDirectionalBias } from "../wave/setup/setup-types";
import type { WaveScanResult } from "../wave/wave-scanner";
import type {
  RealMarketStopFailureReason,
  RealMarketStopPlanDiagnostic,
} from "./real-market-validation-types";

const SEGMENT_STOP_MODEL_ID: StopLossModelId =
  "SCENARIO_INVALIDATION_REFERENCE";

export interface RealMarketStopModelOutcomeRow {
  modelId: StopLossModelId;
  scopeSemantics: string | null;
  outcome: string;
  stopPrice: number | null;
  rationale: string;
}

function entryReferenceFromPrice(
  plan: EntryPlanCandidate,
  price: number
): EntryPriceReference {
  return {
    schemaVersion: "1.0",
    modelId: "EVALUATION_CLOSE",
    modelLabel: "validation diagnostic",
    outcome: "ENTRY_REFERENCE_AVAILABLE",
    entryPlanId: plan.id,
    setupTypeId: plan.setupTypeId,
    directionalBias: plan.directionalBias,
    referencePrice: price,
    rationale: "From evaluation snapshot selected entry reference.",
    limitations: [],
  };
}

export function segmentEnvelope(startPrice: number, endPrice: number): {
  envelopeLow: number;
  envelopeHigh: number;
} {
  return {
    envelopeLow: Math.min(startPrice, endPrice),
    envelopeHigh: Math.max(startPrice, endPrice),
  };
}

export function stopGeometryValid(
  bias: SetupDirectionalBias,
  invalidationPrice: number,
  startPrice: number,
  endPrice: number
): boolean {
  const { envelopeLow, envelopeHigh } = segmentEnvelope(startPrice, endPrice);
  if (bias === "BULLISH") {
    return invalidationPrice < envelopeLow;
  }
  if (bias === "BEARISH") {
    return invalidationPrice > envelopeHigh;
  }
  return false;
}

export function classifyStopFailureReason(
  plan: EntryPlanCandidate,
  rationale: string,
  outcome: string
): RealMarketStopFailureReason {
  if (outcome === "STOP_REFERENCE_AVAILABLE") {
    return "STOP_REFERENCE_AVAILABLE";
  }
  if (!plan.eligibility.eligible) {
    return "STOP_PLAN_INELIGIBLE";
  }
  if (rationale.includes("requires CONFIRMED")) {
    return "STOP_SETUP_NOT_CONFIRMED";
  }
  if (
    rationale.includes("boundaryEstablished") ||
    rationale.includes("closedSeriesOnly") ||
    rationale.includes("evaluationBarIndex")
  ) {
    return "STOP_CLOSED_BAR_MISSING";
  }
  if (rationale.includes("already triggered")) {
    return "STOP_INVALIDATION_ALREADY_TRIGGERED";
  }
  if (rationale.includes("not marked available")) {
    return "STOP_SOURCE_SCOPE_UNAVAILABLE";
  }
  if (rationale.includes("reference level missing")) {
    return "STOP_SOURCE_MISSING";
  }
  if (rationale.includes("Directional bias is null")) {
    return "STOP_DIRECTION_MISSING";
  }
  if (
    rationale.includes("geometry") ||
    rationale.includes("not below segment") ||
    rationale.includes("not above segment")
  ) {
    return "STOP_GEOMETRY_INVALID";
  }
  return "OTHER_CONTRACT_FAILURE";
}

export function buildStopPlanDiagnostic(input: {
  plan: EntryPlanCandidate;
  setupId: string;
  scanRow?: WaveScanResult;
  entryReferencePrice?: number;
}): RealMarketStopPlanDiagnostic {
  const { plan, setupId, scanRow, entryReferencePrice } = input;
  const selectedEntryReference =
    entryReferencePrice !== undefined && Number.isFinite(entryReferencePrice)
      ? entryReferenceFromPrice(plan, entryReferencePrice)
      : null;
  const stopReport = buildStopLossReport({
    plan,
    selectedEntryReference,
  }).report;
  const ref =
    stopReport.references.find(
      (r) => r.modelId === SEGMENT_STOP_MODEL_ID
    ) ??
    evaluateStopLossModel(SEGMENT_STOP_MODEL_ID, { plan });
  const stopModelOutcomes: RealMarketStopModelOutcomeRow[] =
    stopReport.references.map((r) => ({
      modelId: r.modelId,
      scopeSemantics: r.scopeSemantics ?? null,
      outcome: r.outcome,
      stopPrice: r.stopPrice ?? null,
      rationale: r.rationale,
    }));
  const selectedStopReference: StopLossReference | null =
    stopReferencesAvailable(stopReport)[0] ?? null;
  const invLevel = plan.referenceLevels.find(
    (l) => l.kind === "SCENARIO_INVALIDATION"
  );
  const invPrice = invLevel?.price;
  const { envelopeLow, envelopeHigh } = segmentEnvelope(
    plan.sourceScenario.startPrice,
    plan.sourceScenario.endPrice
  );
  const geometryValid =
    plan.directionalBias !== null &&
    invPrice !== undefined &&
    Number.isFinite(invPrice)
      ? stopGeometryValid(
          plan.directionalBias,
          invPrice,
          plan.sourceScenario.startPrice,
          plan.sourceScenario.endPrice
        )
      : null;

  let entryVsInvalidation: string | null = null;
  if (
    entryReferencePrice !== undefined &&
    invPrice !== undefined &&
    plan.directionalBias
  ) {
    if (plan.directionalBias === "BULLISH") {
      entryVsInvalidation = `invalidation ${invPrice} < entry ${entryReferencePrice}: ${invPrice < entryReferencePrice}`;
    } else {
      entryVsInvalidation = `invalidation ${invPrice} > entry ${entryReferencePrice}: ${invPrice > entryReferencePrice}`;
    }
  }

  const outcomeRef = selectedStopReference ?? ref;
  const failureReason = classifyStopFailureReason(
    plan,
    outcomeRef.rationale,
    outcomeRef.outcome
  );

  return {
    symbol: plan.symbol,
    timeframe: plan.timeframe,
    setupId,
    entryPlanId: plan.id,
    setupTypeId: plan.setupTypeId,
    directionalBias: plan.directionalBias,
    directionalBasis: plan.directionalBasis,
    scenarioWaveLabel: plan.scenarioRef.waveLabel,
    segmentStartIndex: plan.sourceScenario.startIndex,
    segmentEndIndex: plan.sourceScenario.endIndex,
    segmentStartPrice: plan.sourceScenario.startPrice,
    segmentEndPrice: plan.sourceScenario.endPrice,
    envelopeLow,
    envelopeHigh,
    evaluationBarIndex: plan.evaluationBar.evaluationBarIndex,
    evaluationBarBoundaryEstablished: plan.evaluationBar.boundaryEstablished,
    invalidationSource: scanRow?.invalidation.source ?? null,
    invalidationPrice: invPrice ?? null,
    usesScenarioInvalidation: plan.invalidation.usesScenarioInvalidation,
    scenarioInvalidationAvailable: scanRow?.invalidation.available ?? null,
    stopModelId: outcomeRef.modelId,
    stopOutcome: outcomeRef.outcome,
    stopRationale: outcomeRef.rationale,
    stopPrice: outcomeRef.stopPrice ?? null,
    failureReason,
    geometryValid,
    entryReferencePrice: entryReferencePrice ?? null,
    entryVsInvalidationNote: entryVsInvalidation,
    stopLimitations: ref.limitations,
    stopModelOutcomes,
    selectedStopModelId: selectedStopReference?.modelId ?? null,
    selectedStopPrice: selectedStopReference?.stopPrice ?? null,
  };
}

export function buildStopModelSummary(
  diagnostics: RealMarketStopPlanDiagnostic[]
): Record<
  string,
  {
    available: number;
    insufficient: number;
    notApplicable: number;
  }
> {
  const summary: Record<
    string,
    { available: number; insufficient: number; notApplicable: number }
  > = {};
  for (const d of diagnostics) {
    for (const row of d.stopModelOutcomes ?? []) {
      if (!summary[row.modelId]) {
        summary[row.modelId] = {
          available: 0,
          insufficient: 0,
          notApplicable: 0,
        };
      }
      if (row.outcome === "STOP_REFERENCE_AVAILABLE") {
        summary[row.modelId].available++;
      } else if (row.outcome === "NOT_APPLICABLE") {
        summary[row.modelId].notApplicable++;
      } else {
        summary[row.modelId].insufficient++;
      }
    }
  }
  return summary;
}

export function buildStopDiagnosticsFromPipeline(input: {
  plans: EntryPlanCandidate[];
  setupIdByPlanId: Map<string, string>;
  scanRowBySetupId: Map<string, WaveScanResult>;
  entryPriceByPlanId: Map<string, number>;
}): {
  stopDiagnostics: RealMarketStopPlanDiagnostic[];
  stopFailureSummary: Record<string, number>;
} {
  const stopDiagnostics: RealMarketStopPlanDiagnostic[] = [];
  const stopFailureSummary: Record<string, number> = {};

  for (const plan of input.plans) {
    const setupId = input.setupIdByPlanId.get(plan.id) ?? plan.setupRef.setupId;
    const scanRow = input.scanRowBySetupId.get(setupId);
    const diag = buildStopPlanDiagnostic({
      plan,
      setupId,
      scanRow,
      entryReferencePrice: input.entryPriceByPlanId.get(plan.id),
    });
    stopDiagnostics.push(diag);
    stopFailureSummary[diag.failureReason] =
      (stopFailureSummary[diag.failureReason] ?? 0) + 1;
  }

  stopDiagnostics.sort((a, b) =>
    a.symbol.localeCompare(b.symbol) || a.setupId.localeCompare(b.setupId)
  );
  return { stopDiagnostics, stopFailureSummary };
}
