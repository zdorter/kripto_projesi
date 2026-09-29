import {
  getEntryModelDefinition,
  listEntryModelsForSetupType,
} from "./entry-model-catalog";
import type {
  EntryModelBuildResult,
  EntryModelEvaluateInput,
  EntryModelId,
  EntryPriceReference,
  EntryReferenceOutcome,
} from "./entry-model-types";
import { ENTRY_MODEL_SCHEMA_VERSION } from "./entry-model-types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { ReferenceLevelKind } from "./setup-types";

const REPORT_LIMITATIONS = [
  "Entry references are deterministic price context for later execution planning (14D.3+); not trade signals.",
  "An available entry reference does not mean a trade should be entered.",
  "Reference price is not stop-loss, take-profit, or invalidation.",
];

function baseReference(
  plan: EntryPlanCandidate,
  modelId: EntryModelId,
  modelLabel: string,
  outcome: EntryReferenceOutcome,
  rationale: string,
  limitations: string[],
  extra?: Pick<
    EntryPriceReference,
    "referencePrice" | "referenceBarIndex" | "referenceLevelKind"
  >
): EntryPriceReference {
  return {
    schemaVersion: ENTRY_MODEL_SCHEMA_VERSION,
    modelId,
    modelLabel,
    outcome,
    entryPlanId: plan.id,
    setupTypeId: plan.setupTypeId,
    directionalBias: plan.directionalBias,
    rationale,
    limitations,
    ...extra,
  };
}

function planReadyForEntryModel(
  plan: EntryPlanCandidate
): { ok: true; barIndex: number } | { ok: false; detail: string } {
  if (!plan.eligibility.eligible) {
    return {
      ok: false,
      detail: `Entry Plan not eligible: ${plan.eligibility.reason}.`,
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
  return { ok: true, barIndex: plan.evaluationBar.evaluationBarIndex };
}

function evaluateEvaluationClose(
  plan: EntryPlanCandidate,
  input: EntryModelEvaluateInput
): EntryPriceReference {
  const def = getEntryModelDefinition("EVALUATION_CLOSE")!;
  const limitations = [
    "Close of evaluation bar is a reference only; not a market/limit order instruction.",
  ];
  const ready = planReadyForEntryModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "EVALUATION_CLOSE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      ready.detail,
      limitations
    );
  }
  const barIndex = ready.barIndex;
  const candles = input.priceContext?.candles;
  if (!candles || barIndex >= candles.length) {
    return baseReference(
      plan,
      "EVALUATION_CLOSE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "Evaluation bar close requires immutable priceContext.candles from the plan evaluation snapshot.",
      limitations
    );
  }
  const close = candles[barIndex].close;
  if (!Number.isFinite(close)) {
    return baseReference(
      plan,
      "EVALUATION_CLOSE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      `Non-finite close at evaluation bar index ${barIndex}.`,
      limitations
    );
  }
  return baseReference(
    plan,
    "EVALUATION_CLOSE",
    def.label,
    "ENTRY_REFERENCE_AVAILABLE",
    `Close price at established evaluation bar index ${barIndex}.`,
    limitations,
    {
      referencePrice: close,
      referenceBarIndex: barIndex,
    }
  );
}

function evaluateSegmentEndpoint(
  plan: EntryPlanCandidate
): EntryPriceReference {
  const def = getEntryModelDefinition("SEGMENT_ENDPOINT")!;
  const limitations = [
    "Scenario segment end price is structural context from scan snapshot; not an executable entry order.",
  ];
  const ready = planReadyForEntryModel(plan);
  if (!ready.ok) {
    return baseReference(
      plan,
      "SEGMENT_ENDPOINT",
      def.label,
      "INSUFFICIENT_CONTEXT",
      ready.detail,
      limitations
    );
  }
  const barIndex = ready.barIndex;
  const segmentEnd = plan.referenceLevels.find(
    (l) => l.kind === "SEGMENT_END"
  );
  if (!segmentEnd || segmentEnd.price === undefined) {
    return baseReference(
      plan,
      "SEGMENT_ENDPOINT",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "SEGMENT_END reference level missing from Entry Plan snapshot.",
      limitations
    );
  }
  if (!Number.isFinite(segmentEnd.price)) {
    return baseReference(
      plan,
      "SEGMENT_ENDPOINT",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "SEGMENT_END price is not finite.",
      limitations
    );
  }
  const endIndex =
    segmentEnd.index ?? plan.sourceScenario.endIndex;
  if (endIndex > barIndex) {
    return baseReference(
      plan,
      "SEGMENT_ENDPOINT",
      def.label,
      "INSUFFICIENT_CONTEXT",
      `Segment end index ${endIndex} is after evaluation bar ${barIndex}; endpoint not closed at evaluation boundary.`,
      limitations
    );
  }
  const levelKind: ReferenceLevelKind = "SEGMENT_END";
  return baseReference(
    plan,
    "SEGMENT_ENDPOINT",
    def.label,
    "ENTRY_REFERENCE_AVAILABLE",
    `Scenario segment end price at index ${endIndex} (≤ evaluation bar ${barIndex}).`,
    limitations,
    {
      referencePrice: segmentEnd.price,
      referenceBarIndex: endIndex,
      referenceLevelKind: levelKind,
    }
  );
}

export function evaluateEntryModel(
  modelId: EntryModelId,
  input: EntryModelEvaluateInput
): EntryPriceReference {
  const def = getEntryModelDefinition(modelId);
  const plan = input.plan;
  if (!def) {
    return baseReference(
      plan,
      modelId,
      modelId,
      "NOT_APPLICABLE",
      "Unknown entry model id.",
      []
    );
  }
  switch (modelId) {
    case "EVALUATION_CLOSE":
      return evaluateEvaluationClose(plan, input);
    case "SEGMENT_ENDPOINT":
      return evaluateSegmentEndpoint(plan);
    default:
      return baseReference(
        plan,
        modelId,
        def.label,
        "NOT_APPLICABLE",
        "Model not implemented.",
        []
      );
  }
}

function compareReferences(a: EntryPriceReference, b: EntryPriceReference): number {
  return a.modelId.localeCompare(b.modelId);
}

/**
 * Evaluates all catalog entry models for the plan's setup type.
 * Does not fetch data, run wave engine, scanner, or diagnostics.
 */
export function buildEntryModelReport(
  input: EntryModelEvaluateInput
): EntryModelBuildResult {
  const plan = input.plan;
  const modelIds = listEntryModelsForSetupType(plan.setupTypeId);
  const references: EntryPriceReference[] = [];

  if (modelIds.length === 0) {
    return {
      report: {
        schemaVersion: ENTRY_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          `No entry models defined for setup type ${plan.setupTypeId}.`,
        ],
      },
    };
  }

  if (!plan.eligibility.eligible) {
    return {
      report: {
        schemaVersion: ENTRY_MODEL_SCHEMA_VERSION,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        planEligibility: plan.eligibility,
        references: [],
        limitations: [
          ...REPORT_LIMITATIONS,
          "Ineligible Entry Plan: no entry references produced.",
        ],
      },
    };
  }

  for (const modelId of modelIds) {
    references.push(evaluateEntryModel(modelId, input));
  }
  references.sort(compareReferences);

  return {
    report: {
      schemaVersion: ENTRY_MODEL_SCHEMA_VERSION,
      entryPlanId: plan.id,
      symbol: plan.symbol,
      timeframe: plan.timeframe,
      planEligibility: plan.eligibility,
      references,
      limitations: REPORT_LIMITATIONS,
    },
  };
}

export function entryReferencesAvailable(
  report: EntryModelBuildResult["report"]
): EntryPriceReference[] {
  return report.references.filter(
    (r) => r.outcome === "ENTRY_REFERENCE_AVAILABLE"
  );
}
