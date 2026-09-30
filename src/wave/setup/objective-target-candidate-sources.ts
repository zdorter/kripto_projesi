import { fibExtensionPrice } from "../fibonacci";
import {
  getObjectiveTargetSourceDefinition,
  isObjectiveTargetSourceApplicable,
  listObjectiveTargetSourcesForSetupType,
  OBJECTIVE_TARGET_SOURCE_DEFINITIONS,
} from "./objective-target-source-catalog";
import type {
  ObjectiveTargetCandidate,
  ObjectiveTargetCandidateEvaluateInput,
  ObjectiveTargetCandidateOutcome,
  ObjectiveTargetCandidateReport,
  ObjectiveTargetSourceId,
} from "./objective-target-candidate-types";
import { OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION } from "./objective-target-candidate-types";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { SetupDirectionalBias } from "./setup-types";

const REPORT_LIMITATIONS = [
  "Objective target candidates are not selected targets, take-profit orders, or trade signals.",
  "Multiple AVAILABLE candidates may coexist; this layer does not rank or choose among them.",
  "Wave labels (e.g. 5, C) do not implicitly produce targets without attested geometry.",
  "Diagnostics fibonacci snapshot exposes W1–W2 retracement conformance only, not projection targets.",
];

function baseCandidate(
  plan: EntryPlanCandidate,
  sourceId: ObjectiveTargetSourceId,
  sourceLabel: string,
  outcome: ObjectiveTargetCandidateOutcome,
  referenceSource: string,
  rationale: string,
  limitations: string[],
  targetPrice?: number
): ObjectiveTargetCandidate {
  return {
    schemaVersion: OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION,
    sourceId,
    sourceLabel,
    outcome,
    entryPlanId: plan.id,
    setupId: plan.setupRef.setupId,
    setupTypeId: plan.setupTypeId,
    symbol: plan.symbol,
    timeframe: plan.timeframe,
    scenarioId: plan.scenarioRef.scenarioId,
    directionalBias: plan.directionalBias,
    referenceSource,
    rationale,
    limitations,
    targetPrice,
  };
}

function targetGeometryConsistent(
  bias: SetupDirectionalBias,
  targetPrice: number,
  startPrice: number,
  endPrice: number
): { ok: true } | { ok: false; detail: string } {
  const envelopeHigh = Math.max(startPrice, endPrice);
  const envelopeLow = Math.min(startPrice, endPrice);
  if (bias === "BULLISH") {
    if (targetPrice <= envelopeHigh) {
      return {
        ok: false,
        detail: `BULLISH geometry: candidate ${targetPrice} is not above segment envelope high ${envelopeHigh}.`,
      };
    }
    return { ok: true };
  }
  if (bias === "BEARISH") {
    if (targetPrice >= envelopeLow) {
      return {
        ok: false,
        detail: `BEARISH geometry: candidate ${targetPrice} is not below segment envelope low ${envelopeLow}.`,
      };
    }
    return { ok: true };
  }
  return { ok: false, detail: "Directional bias required for geometry check." };
}

function evaluateFibonacciProjection(
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidate {
  const plan = input.plan;
  const def = getObjectiveTargetSourceDefinition("FIBONACCI_PROJECTION")!;
  if (!isObjectiveTargetSourceApplicable(plan.setupTypeId, "FIBONACCI_PROJECTION")) {
    return baseCandidate(
      plan,
      "FIBONACCI_PROJECTION",
      def.label,
      "NOT_APPLICABLE",
      "catalog",
      `Source not listed for setup type ${plan.setupTypeId}.`,
      []
    );
  }
  const attested = input.sourceContext?.attestedFibonacciProjection;
  if (!attested) {
    const fib = input.sourceContext?.diagnostics?.fibonacci;
    const note = fib?.available
      ? "Diagnostics expose W1–W2 retracement conformance only; extension projection anchors are not in the snapshot contract."
      : "Fibonacci projection requires attested leg anchors or a future diagnostics projection contract.";
    return baseCandidate(
      plan,
      "FIBONACCI_PROJECTION",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "diagnostics.fibonacci",
      note,
      []
    );
  }
  const targetPrice = fibExtensionPrice(
    attested.rangeStartPrice,
    attested.rangeEndPrice,
    attested.extensionLevel
  );
  if (plan.directionalBias) {
    const geom = targetGeometryConsistent(
      plan.directionalBias,
      targetPrice,
      plan.sourceScenario.startPrice,
      plan.sourceScenario.endPrice
    );
    if (!geom.ok) {
      return baseCandidate(
        plan,
        "FIBONACCI_PROJECTION",
        def.label,
        "INSUFFICIENT_CONTEXT",
        "attestedFibonacciProjection",
        geom.detail,
        []
      );
    }
  }
  return baseCandidate(
    plan,
    "FIBONACCI_PROJECTION",
    def.label,
    "AVAILABLE",
    "attestedFibonacciProjection",
    `Fibonacci extension level ${attested.extensionLevel} from attested leg anchors.`,
    [
      "Computed with fibExtensionPrice from attested anchors; not inferred from wave labels.",
    ],
    targetPrice
  );
}

function evaluatePreviousSwing(
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidate {
  const plan = input.plan;
  const def = getObjectiveTargetSourceDefinition("PREVIOUS_SWING")!;
  if (!isObjectiveTargetSourceApplicable(plan.setupTypeId, "PREVIOUS_SWING")) {
    return baseCandidate(
      plan,
      "PREVIOUS_SWING",
      def.label,
      "NOT_APPLICABLE",
      "catalog",
      `Source not listed for setup type ${plan.setupTypeId}.`,
      []
    );
  }
  const swings = input.sourceContext?.diagnostics?.confirmedSwings;
  const originIndex = plan.sourceScenario.startIndex;
  if (!swings || swings.length === 0) {
    return baseCandidate(
      plan,
      "PREVIOUS_SWING",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "diagnostics.confirmedSwings",
      "Confirmed swings snapshot required.",
      []
    );
  }
  const evalBarIndex = plan.evaluationBar.evaluationBarIndex;
  if (originIndex > evalBarIndex) {
    return baseCandidate(
      plan,
      "PREVIOUS_SWING",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "diagnostics.confirmedSwings",
      `Segment origin index ${originIndex} is after evaluation bar ${evalBarIndex}.`,
      []
    );
  }
  const swing = swings.find((s) => s.index === originIndex);
  if (!swing) {
    return baseCandidate(
      plan,
      "PREVIOUS_SWING",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "diagnostics.confirmedSwings",
      `No confirmed swing at scenario segment start index ${originIndex}.`,
      []
    );
  }
  if (swing.index > evalBarIndex) {
    return baseCandidate(
      plan,
      "PREVIOUS_SWING",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "diagnostics.confirmedSwings",
      `Confirmed swing index ${swing.index} is after evaluation bar ${evalBarIndex}.`,
      []
    );
  }
  const targetPrice = swing.price;
  if (plan.directionalBias) {
    const geom = targetGeometryConsistent(
      plan.directionalBias,
      targetPrice,
      plan.sourceScenario.startPrice,
      plan.sourceScenario.endPrice
    );
    if (!geom.ok) {
      return baseCandidate(
        plan,
        "PREVIOUS_SWING",
        def.label,
        "INSUFFICIENT_CONTEXT",
        "diagnostics.confirmedSwings",
        geom.detail,
        []
      );
    }
  }
  return baseCandidate(
    plan,
    "PREVIOUS_SWING",
    def.label,
    "AVAILABLE",
    `diagnostics.confirmedSwings[index=${originIndex}]`,
    `Confirmed ${swing.type} swing at segment origin index ${originIndex}.`,
    [
      "Uses segment start index anchor only; does not select nearest or latest swing.",
    ],
    targetPrice
  );
}

function evaluateWaveStructure(
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidate {
  const plan = input.plan;
  const def = getObjectiveTargetSourceDefinition("WAVE_STRUCTURE")!;
  if (!isObjectiveTargetSourceApplicable(plan.setupTypeId, "WAVE_STRUCTURE")) {
    return baseCandidate(
      plan,
      "WAVE_STRUCTURE",
      def.label,
      "NOT_APPLICABLE",
      "catalog",
      `Source not listed for setup type ${plan.setupTypeId}.`,
      []
    );
  }
  const attested = input.sourceContext?.attestedWaveStructureTarget;
  if (!attested) {
    return baseCandidate(
      plan,
      "WAVE_STRUCTURE",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "attestedWaveStructureTarget",
      `Wave label ${plan.scenarioRef.waveLabel} does not produce a target without attested structure geometry.`,
      []
    );
  }
  const targetPrice = attested.targetPrice;
  if (plan.directionalBias) {
    const geom = targetGeometryConsistent(
      plan.directionalBias,
      targetPrice,
      plan.sourceScenario.startPrice,
      plan.sourceScenario.endPrice
    );
    if (!geom.ok) {
      return baseCandidate(
        plan,
        "WAVE_STRUCTURE",
        def.label,
        "INSUFFICIENT_CONTEXT",
        "attestedWaveStructureTarget",
        geom.detail,
        []
      );
    }
  }
  return baseCandidate(
    plan,
    "WAVE_STRUCTURE",
    def.label,
    "AVAILABLE",
    "attestedWaveStructureTarget",
    attested.evidenceRef,
    ["Structure target is attested upstream; not inferred from wave label alone."],
    targetPrice
  );
}

function evaluateAbcProjection(
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidate {
  const plan = input.plan;
  const def = getObjectiveTargetSourceDefinition("ABC_PROJECTION")!;
  if (!isObjectiveTargetSourceApplicable(plan.setupTypeId, "ABC_PROJECTION")) {
    return baseCandidate(
      plan,
      "ABC_PROJECTION",
      def.label,
      "NOT_APPLICABLE",
      "catalog",
      `ABC projection applies to correction-end; setup type is ${plan.setupTypeId}.`,
      []
    );
  }
  const attested = input.sourceContext?.attestedAbcProjection;
  if (!attested) {
    return baseCandidate(
      plan,
      "ABC_PROJECTION",
      def.label,
      "INSUFFICIENT_CONTEXT",
      "attestedAbcProjection",
      "ABC projection requires attested A/B/C geometry; Wave C label alone is insufficient.",
      []
    );
  }
  const targetPrice = attested.targetPrice;
  if (plan.directionalBias) {
    const geom = targetGeometryConsistent(
      plan.directionalBias,
      targetPrice,
      plan.sourceScenario.startPrice,
      plan.sourceScenario.endPrice
    );
    if (!geom.ok) {
      return baseCandidate(
        plan,
        "ABC_PROJECTION",
        def.label,
        "INSUFFICIENT_CONTEXT",
        "attestedAbcProjection",
        geom.detail,
        []
      );
    }
  }
  return baseCandidate(
    plan,
    "ABC_PROJECTION",
    def.label,
    "AVAILABLE",
    "attestedAbcProjection",
    attested.attestationDetail,
    ["ABC target price is attested; not derived from label or heuristic C-leg math in this layer."],
    targetPrice
  );
}

export function evaluateObjectiveTargetSource(
  sourceId: ObjectiveTargetSourceId,
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidate {
  switch (sourceId) {
    case "FIBONACCI_PROJECTION":
      return evaluateFibonacciProjection(input);
    case "PREVIOUS_SWING":
      return evaluatePreviousSwing(input);
    case "WAVE_STRUCTURE":
      return evaluateWaveStructure(input);
    case "ABC_PROJECTION":
      return evaluateAbcProjection(input);
    default:
      return baseCandidate(
        input.plan,
        sourceId,
        sourceId,
        "NOT_APPLICABLE",
        "unknown",
        "Unknown objective target source id.",
        []
      );
  }
}

function compareCandidates(
  a: ObjectiveTargetCandidate,
  b: ObjectiveTargetCandidate
): number {
  return a.sourceId.localeCompare(b.sourceId);
}

/**
 * Lists objective target candidates for an Entry Plan from all catalog sources.
 * Does not select, rank, or map to TargetReference.
 */
export function buildObjectiveTargetCandidateReport(
  input: ObjectiveTargetCandidateEvaluateInput
): ObjectiveTargetCandidateReport {
  const plan = input.plan;
  const sourceIds = listObjectiveTargetSourcesForSetupType(plan.setupTypeId);
  const candidates: ObjectiveTargetCandidate[] = [];

  for (const sourceId of sourceIds) {
    candidates.push(evaluateObjectiveTargetSource(sourceId, input));
  }

  const catalogOrder = OBJECTIVE_TARGET_SOURCE_DEFINITIONS.map((d) => d.sourceId);
  candidates.sort(
    (a, b) =>
      catalogOrder.indexOf(a.sourceId) - catalogOrder.indexOf(b.sourceId) ||
      compareCandidates(a, b)
  );

  return {
    schemaVersion: OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION,
    entryPlanId: plan.id,
    setupId: plan.setupRef.setupId,
    setupTypeId: plan.setupTypeId,
    symbol: plan.symbol,
    timeframe: plan.timeframe,
    scenarioId: plan.scenarioRef.scenarioId,
    candidates,
    limitations: REPORT_LIMITATIONS,
  };
}

export function objectiveTargetCandidatesAvailable(
  report: ObjectiveTargetCandidateReport
): ObjectiveTargetCandidate[] {
  return report.candidates.filter((c) => c.outcome === "AVAILABLE");
}
