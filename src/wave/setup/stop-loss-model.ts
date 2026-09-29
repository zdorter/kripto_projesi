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
  extra?: Pick<StopLossReference, "stopPrice" | "referenceKind">
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

function evaluateScenarioInvalidationReference(
  plan: EntryPlanCandidate
): StopLossReference {
  const def = getStopLossModelDefinition("SCENARIO_INVALIDATION_REFERENCE")!;
  const limitations = [
    "Stop price equals scenario invalidation price from snapshot; not adjusted for execution.",
    "This is a stop-loss reference model output, not structural invalidation redefinition.",
  ];
  const ready = planReadyForStopModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "SCENARIO_INVALIDATION_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      ready.detail,
      limitations
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
      limitations
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
      limitations
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
      limitations
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
      limitations
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
      limitations
    );
  }
  const referenceSource = level.note ?? plan.invalidation.summary;
  return baseReference(
    plan,
    "SCENARIO_INVALIDATION_REFERENCE",
    def.label,
    "STOP_REFERENCE_AVAILABLE",
    referenceSource,
    `Structural scenario invalidation price ${stopPrice} mapped to stop reference (no buffer).`,
    limitations,
    {
      stopPrice,
      referenceKind: "SCENARIO_INVALIDATION",
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

function compareReferences(a: StopLossReference, b: StopLossReference): number {
  return a.modelId.localeCompare(b.modelId);
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
  references.sort(compareReferences);
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
