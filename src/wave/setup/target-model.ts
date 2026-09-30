import {
  getTargetModelDefinition,
  isObjectiveTargetReferenceKind,
  listTargetModelsForSetupType,
} from "./target-model-catalog";
import type {
  TargetModelBuildResult,
  TargetModelEvaluateInput,
  TargetModelId,
  TargetReference,
  TargetReferenceOutcome,
} from "./target-model-types";
import { TARGET_MODEL_SCHEMA_VERSION } from "./target-model-types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SetupDirectionalBias } from "./setup-types";

const ARCHITECTURE_NO_TARGET_SOURCE =
  "Current architecture does not expose an objective target reference on typical scan snapshots; only EXPLICIT_OBJECTIVE_TARGET levels qualify.";

const REPORT_LIMITATIONS = [
  "Target reference is not an executable take-profit order or trade signal.",
  "Structural reference levels (segment, invalidation, MTF, hierarchy) are not auto-promoted to targets.",
  "No percent target, extension projection, ATR, RR, or entry/stop distance math is applied.",
  "Target reference availability is independent of entry and stop reference availability.",
  ARCHITECTURE_NO_TARGET_SOURCE,
];

function baseReference(
  plan: EntryPlanCandidate,
  modelId: TargetModelId,
  modelLabel: string,
  outcome: TargetReferenceOutcome,
  referenceSource: string,
  rationale: string,
  limitations: string[],
  extra?: Pick<TargetReference, "targetPrice" | "referenceKind">
): TargetReference {
  return {
    schemaVersion: TARGET_MODEL_SCHEMA_VERSION,
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

function planReadyForTargetModel(
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
      detail: `Setup status is ${plan.setupRef.sourceSetupStatus}; target mapping requires CONFIRMED.`,
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
      detail: "Setup invalidation triggered; target reference not mapped.",
    };
  }
  return { ok: true };
}

function targetGeometryConsistent(
  bias: SetupDirectionalBias,
  targetPrice: number,
  startPrice: number,
  endPrice: number
): { ok: true } | { ok: false; detail: string } {
  const envelopeLow = Math.min(startPrice, endPrice);
  const envelopeHigh = Math.max(startPrice, endPrice);
  if (bias === "BULLISH") {
    if (targetPrice <= envelopeHigh) {
      return {
        ok: false,
        detail: `BULLISH geometry: target ${targetPrice} is not above segment envelope high ${envelopeHigh}.`,
      };
    }
    return { ok: true };
  }
  if (bias === "BEARISH") {
    if (targetPrice >= envelopeLow) {
      return {
        ok: false,
        detail: `BEARISH geometry: target ${targetPrice} is not below segment envelope low ${envelopeLow}.`,
      };
    }
    return { ok: true };
  }
  return { ok: false, detail: "Unknown directional bias." };
}

function findObjectiveTargetLevel(plan: EntryPlanCandidate) {
  return plan.referenceLevels.find(
    (l) => isObjectiveTargetReferenceKind(l.kind) && l.price !== undefined
  );
}

function evaluateStructuralTargetReference(
  plan: EntryPlanCandidate
): TargetReference {
  const def = getTargetModelDefinition("STRUCTURAL_TARGET_REFERENCE")!;
  const limitations = [
    "Target price equals explicit objective reference level from snapshot; not a TP order.",
    "Segment end, invalidation, and MTF/hierarchy levels are not used as implicit targets.",
  ];
  const ready = planReadyForTargetModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "STRUCTURAL_TARGET_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      ready.detail,
      limitations
    );
  }
  const level = findObjectiveTargetLevel(plan);
  if (!level) {
    return baseReference(
      plan,
      "STRUCTURAL_TARGET_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "none",
      ARCHITECTURE_NO_TARGET_SOURCE,
      limitations
    );
  }
  const targetPrice = level.price!;
  if (!Number.isFinite(targetPrice)) {
    return baseReference(
      plan,
      "STRUCTURAL_TARGET_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "objective-target",
      "Target price is not finite.",
      limitations
    );
  }
  if (plan.directionalBias === null) {
    return baseReference(
      plan,
      "STRUCTURAL_TARGET_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "objective-target",
      "Directional bias is null; target side cannot be validated without guessing.",
      limitations
    );
  }
  const geom = targetGeometryConsistent(
    plan.directionalBias,
    targetPrice,
    plan.sourceScenario.startPrice,
    plan.sourceScenario.endPrice
  );
  if (!geom.ok) {
    return baseReference(
      plan,
      "STRUCTURAL_TARGET_REFERENCE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      level.note ?? "objective-target",
      geom.detail,
      limitations
    );
  }
  return baseReference(
    plan,
    "STRUCTURAL_TARGET_REFERENCE",
    def.label,
    "TARGET_REFERENCE_AVAILABLE",
    level.note ?? level.label,
    `Explicit objective target reference ${targetPrice} from ${level.kind}.`,
    limitations,
    {
      targetPrice,
      referenceKind: level.kind,
    }
  );
}

export function evaluateTargetModel(
  modelId: TargetModelId,
  input: TargetModelEvaluateInput
): TargetReference {
  const def = getTargetModelDefinition(modelId);
  const plan = input.plan;
  if (!def) {
    return baseReference(
      plan,
      modelId,
      modelId,
      "NOT_APPLICABLE",
      "none",
      "Unknown target model id.",
      []
    );
  }
  if (modelId === "STRUCTURAL_TARGET_REFERENCE") {
    return evaluateStructuralTargetReference(plan);
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

function compareReferences(a: TargetReference, b: TargetReference): number {
  return a.modelId.localeCompare(b.modelId);
}

export function buildTargetModelReport(
  input: TargetModelEvaluateInput
): TargetModelBuildResult {
  const plan = input.plan;
  const modelIds = listTargetModelsForSetupType(plan.setupTypeId);

  if (!plan.eligibility.eligible) {
    return {
      report: {
        schemaVersion: TARGET_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          "Ineligible Entry Plan: no target references produced.",
        ],
      },
    };
  }

  if (modelIds.length === 0) {
    return {
      report: {
        schemaVersion: TARGET_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          `No target models for setup type ${plan.setupTypeId}.`,
        ],
      },
    };
  }

  const references = modelIds.map((id) => evaluateTargetModel(id, input));
  references.sort(compareReferences);

  return {
    report: {
      schemaVersion: TARGET_MODEL_SCHEMA_VERSION,
      entryPlanId: plan.id,
      symbol: plan.symbol,
      timeframe: plan.timeframe,
      planEligibility: plan.eligibility,
      references,
      limitations: REPORT_LIMITATIONS,
    },
  };
}

export function targetReferencesAvailable(
  report: TargetModelBuildResult["report"]
): TargetReference[] {
  return report.references.filter(
    (r) => r.outcome === "TARGET_REFERENCE_AVAILABLE"
  );
}
