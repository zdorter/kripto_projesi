import {
  getStopLossModelDefinition,
  listStopLossModelsForSetupType,
} from "./stop-loss-model-catalog";
import type {
  StopLossModelBuildResult,
  StopLossModelEvaluateInput,
  StopLossModelId,
  StopLossReference,
  StopLossReferenceOutcome,
} from "./stop-loss-model-types";
import { STOP_LOSS_MODEL_SCHEMA_VERSION } from "./stop-loss-model-types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SetupDirectionalBias } from "./setup-types";

const REPORT_LIMITATIONS = [
  "Stop reference maps structural scenario invalidation; it is not an executable stop order.",
  "Structural invalidation and stop reference are related but not identical concepts.",
  "No price buffer, tick-size, spread, fee, or risk-percent adjustment is applied.",
  "Stop reference availability is independent of entry reference availability.",
];

function baseReference(
  plan: EntryPlanCandidate,
  modelId: StopLossModelId,
  modelLabel: string,
  outcome: StopLossReferenceOutcome,
  referenceSource: string,
  rationale: string,
  limitations: string[],
  extra?: Pick<
    StopLossReference,
    | "stopPrice"
    | "referenceKind"
    | "scopeSemantics"
    | "requiredInvalidationSource"
  >
): StopLossReference {
  return {
    schemaVersion: STOP_LOSS_MODEL_SCHEMA_VERSION,
    modelId,
    modelLabel,
    outcome,
    entryPlanId: plan.id,
    setupTypeId: plan.setupTypeId,
    directionalBias: plan.directionalBias,
    referenceSource,
    rationale,
    limitations,
    ...extra,
  };
}

function planReadyForStopModel(
  plan: EntryPlanCandidate
): { ok: true } | { ok: false; detail: string } {
  if (!plan.eligibility.eligible) {
    return {
      ok: false,
      detail: `Entry Plan not eligible: ${plan.eligibility.reason}.`,
    };
  }
  if (plan.setupRef.sourceSetupStatus !== "CONFIRMED") {
    return {
      ok: false,
      detail: `Setup status is ${plan.setupRef.sourceSetupStatus}; stop mapping requires CONFIRMED.`,
    };
  }
  if (
    !plan.evaluationBar.boundaryEstablished ||
    plan.evaluationBar.evaluationBarIndex < 0
  ) {
    return {
      ok: false,
      detail: plan.evaluationBar.contractDetail,
    };
  }
  const triggered = plan.invalidation.conditions.some(
    (c) =>
      c.conditionId === "setup-invalidation-triggered" && c.outcome === "MET"
  );
  if (triggered) {
    return {
      ok: false,
      detail: "Setup invalidation already triggered; stop reference not mapped.",
    };
  }
  return { ok: true };
}

function invalidationLevelFromPlan(plan: EntryPlanCandidate) {
  return plan.referenceLevels.find((l) => l.kind === "SCENARIO_INVALIDATION");
}

function geometryConsistent(
  bias: SetupDirectionalBias,
  invalidationPrice: number,
  startPrice: number,
  endPrice: number
): { ok: true } | { ok: false; detail: string } {
  const envelopeLow = Math.min(startPrice, endPrice);
  const envelopeHigh = Math.max(startPrice, endPrice);
  if (bias === "BULLISH") {
    if (invalidationPrice >= envelopeLow) {
      return {
        ok: false,
        detail: `BULLISH geometry: invalidation ${invalidationPrice} is not below segment envelope low ${envelopeLow}.`,
      };
    }
    return { ok: true };
  }
  if (bias === "BEARISH") {
    if (invalidationPrice <= envelopeHigh) {
      return {
        ok: false,
        detail: `BEARISH geometry: invalidation ${invalidationPrice} is not above segment envelope high ${envelopeHigh}.`,
      };
    }
    return { ok: true };
  }
  return { ok: false, detail: "Unknown directional bias." };
}

const SEGMENT_SCOPE_SEMANTICS =
  "SEGMENT_ENVELOPE_SCENARIO_INVALIDATION_REFERENCE";
const TRACK_SCOPE_SEMANTICS = "TRACK_SCOPE_STRUCTURAL_STOP_REFERENCE";

function evaluateScenarioInvalidationReference(
  plan: EntryPlanCandidate
): StopLossReference {
  const def = getStopLossModelDefinition("SCENARIO_INVALIDATION_REFERENCE")!;
  const limitations = [
    "Stop price equals scenario invalidation price from snapshot; not adjusted for execution.",
    "Segment-envelope geometry applies; track-scope risk-side geometry does not.",
    "This is a stop-loss reference model output, not an exchange stop order.",
  ];
  const scopeExtra = { scopeSemantics: SEGMENT_SCOPE_SEMANTICS };
  const ready = planReadyForStopModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      ready.detail,
      limitations,
      scopeExtra
    );
  }
  if (!plan.invalidation.usesScenarioInvalidation) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      "Scenario invalidation not marked available on Entry Plan.",
      limitations,
      scopeExtra
    );
  }
  const level = invalidationLevelFromPlan(plan);
  if (!level || level.price === undefined) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      "SCENARIO_INVALIDATION reference level missing from Entry Plan snapshot.",
      limitations,
      scopeExtra
    );
  }
  const stopPrice = level.price;
  if (!Number.isFinite(stopPrice)) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "scenario-invalidation",
      "Invalidation price is not finite.",
      limitations,
      scopeExtra
    );
  }
  if (plan.directionalBias === null) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "scenario-invalidation",
      "Directional bias is null; stop side cannot be validated without guessing.",
      limitations,
      scopeExtra
    );
  }
  const geom = geometryConsistent(
    plan.directionalBias,
    stopPrice,
    plan.sourceScenario.startPrice,
    plan.sourceScenario.endPrice
  );
  if (!geom.ok) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "scenario-invalidation",
      geom.detail,
      limitations,
      scopeExtra
    );
  }
  const referenceSource = level.note ?? plan.invalidation.summary;
  return baseReference(
    plan,
    "SCENARIO_INVALIDATION_REFERENCE",
    def.label,
    "STOP_REFERENCE_AVAILABLE",
    referenceSource,
    `Structural scenario invalidation price ${stopPrice} mapped to stop reference (segment envelope satisfied).`,
    limitations,
    {
      stopPrice,
      referenceKind: "SCENARIO_INVALIDATION",
      ...scopeExtra,
    }
  );
}

function trackRiskSideConsistent(
  bias: SetupDirectionalBias,
  invalidationPrice: number,
  entryReferencePrice: number
): { ok: true } | { ok: false; detail: string } {
  if (bias === "BULLISH") {
    if (invalidationPrice >= entryReferencePrice) {
      return {
        ok: false,
        detail: `BULLISH track geometry: invalidation ${invalidationPrice} is not below entry reference ${entryReferencePrice}.`,
      };
    }
    return { ok: true };
  }
  if (bias === "BEARISH") {
    if (invalidationPrice <= entryReferencePrice) {
      return {
        ok: false,
        detail: `BEARISH track geometry: invalidation ${invalidationPrice} is not above entry reference ${entryReferencePrice}.`,
      };
    }
    return { ok: true };
  }
  return { ok: false, detail: "Unknown directional bias." };
}

function evaluateTrackScopeInvalidationReference(
  plan: EntryPlanCandidate,
  selectedEntryReference: StopLossModelEvaluateInput["selectedEntryReference"]
): StopLossReference {
  const def = getStopLossModelDefinition("TRACK_SCOPE_INVALIDATION_REFERENCE")!;
  const limitations = [
    "Track-scope structural invalidation mapped to stop reference; not an exchange stop order.",
    "Risk-side geometry uses selected entry reference only; segment envelope is not applied.",
    "Not a recommended, optimal, or ranked stop — structural reference only.",
  ];
  const scopeExtra = {
    scopeSemantics: TRACK_SCOPE_SEMANTICS,
    requiredInvalidationSource: "TRACK_SCOPE" as const,
  };

  const ready = planReadyForStopModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      ready.detail,
      limitations,
      scopeExtra
    );
  }
  const level = invalidationLevelFromPlan(plan);
  if (!level || level.price === undefined) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      "SCENARIO_INVALIDATION reference level missing from Entry Plan snapshot.",
      limitations,
      scopeExtra
    );
  }
  if (level.invalidationSource !== "TRACK_SCOPE") {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "NOT_APPLICABLE",
      level.invalidationSource ?? "unknown",
      `Model requires invalidation source TRACK_SCOPE; snapshot has ${level.invalidationSource ?? "none"}.`,
      limitations,
      scopeExtra
    );
  }
  if (!plan.invalidation.usesScenarioInvalidation) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      "Scenario invalidation not marked available on Entry Plan.",
      limitations,
      scopeExtra
    );
  }
  const stopPrice = level.price;
  if (!Number.isFinite(stopPrice)) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "TRACK_SCOPE",
      "Invalidation price is not finite.",
      limitations,
      scopeExtra
    );
  }
  if (plan.directionalBias === null) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "TRACK_SCOPE",
      "Directional bias is null; stop side cannot be validated without guessing.",
      limitations,
      scopeExtra
    );
  }
  const entryRef = selectedEntryReference;
  if (
    !entryRef ||
    entryRef.outcome !== "ENTRY_REFERENCE_AVAILABLE" ||
    entryRef.referencePrice === undefined ||
    !Number.isFinite(entryRef.referencePrice)
  ) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "TRACK_SCOPE",
      "Selected entry reference unavailable; track stop requires entry reference for risk-side geometry.",
      limitations,
      scopeExtra
    );
  }
  const trackGeom = trackRiskSideConsistent(
    plan.directionalBias,
    stopPrice,
    entryRef.referencePrice
  );
  if (!trackGeom.ok) {
    return baseReference(
      plan,
      "TRACK_SCOPE_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "TRACK_SCOPE",
      trackGeom.detail,
      limitations,
      scopeExtra
    );
  }
  return baseReference(
    plan,
    "TRACK_SCOPE_INVALIDATION_REFERENCE",
    def.label,
    "STOP_REFERENCE_AVAILABLE",
    "TRACK_SCOPE",
    `Track-scope structural invalidation ${stopPrice} on risk side of entry reference ${entryRef.referencePrice} (no buffer).`,
    limitations,
    {
      stopPrice,
      referenceKind: "SCENARIO_INVALIDATION",
      ...scopeExtra,
    }
  );
}

export function evaluateStopLossModel(
  modelId: StopLossModelId,
  input: StopLossModelEvaluateInput
): StopLossReference {
  const def = getStopLossModelDefinition(modelId);
  const plan = input.plan;
  if (!def) {
    return baseReference(
      plan,
      modelId,
      modelId,
      "NOT_APPLICABLE",
      "none",
      "Unknown stop-loss model id.",
      []
    );
  }
  if (modelId === "SCENARIO_INVALIDATION_REFERENCE") {
    return evaluateScenarioInvalidationReference(plan);
  }
  if (modelId === "TRACK_SCOPE_INVALIDATION_REFERENCE") {
    return evaluateTrackScopeInvalidationReference(
      plan,
      input.selectedEntryReference
    );
  }
  return baseReference(
    plan,
    modelId,
    def.label,
    "NOT_APPLICABLE",
    "none",
    "Model not implemented.",
    []
  );
}

export function buildStopLossReport(
  input: StopLossModelEvaluateInput
): StopLossModelBuildResult {
  const plan = input.plan;
  const modelIds = listStopLossModelsForSetupType(plan.setupTypeId);
  if (!plan.eligibility.eligible) {
    return {
      report: {
        schemaVersion: STOP_LOSS_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          "Ineligible Entry Plan: no stop references produced.",
        ],
      },
    };
  }
  if (modelIds.length === 0) {
    return {
      report: {
        schemaVersion: STOP_LOSS_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          `No stop-loss models for setup type ${plan.setupTypeId}.`,
        ],
      },
    };
  }
  const references = modelIds.map((id) => evaluateStopLossModel(id, input));
  return {
    report: {
      schemaVersion: STOP_LOSS_MODEL_SCHEMA_VERSION,
      entryPlanId: plan.id,
      symbol: plan.symbol,
      timeframe: plan.timeframe,
      planEligibility: plan.eligibility,
      references,
      limitations: REPORT_LIMITATIONS,
    },
  };
}

export function stopReferencesAvailable(
  report: StopLossModelBuildResult["report"]
): StopLossReference[] {
  return report.references.filter(
    (r) => r.outcome === "STOP_REFERENCE_AVAILABLE"
  );
}
