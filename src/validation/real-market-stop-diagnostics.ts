import { evaluateStopLossModel } from "../wave/setup/stop-loss-model";
import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import type { StopLossModelId } from "../wave/setup/stop-loss-model-types";
import type { SetupDirectionalBias } from "../wave/setup/setup-types";
import type { WaveScanResult } from "../wave/wave-scanner";
import type {
  RealMarketStopFailureReason,
  RealMarketStopPlanDiagnostic,
} from "./real-market-validation-types";

const STOP_MODEL_ID: StopLossModelId = "SCENARIO_INVALIDATION_REFERENCE";

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
  const ref = evaluateStopLossModel(STOP_MODEL_ID, { plan });
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

  const failureReason = classifyStopFailureReason(
    plan,
    ref.rationale,
    ref.outcome
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
    stopModelId: STOP_MODEL_ID,
    stopOutcome: ref.outcome,
    stopRationale: ref.rationale,
    stopPrice: ref.stopPrice ?? null,
    failureReason,
    geometryValid,
    entryReferencePrice: entryReferencePrice ?? null,
    entryVsInvalidationNote: entryVsInvalidation,
    stopLimitations: ref.limitations,
  };
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
