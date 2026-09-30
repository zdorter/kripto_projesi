import type { FibExtensionLevel } from "../fibonacci";
import type { FibonacciDiagnostic } from "../wave-diagnostics";
import type { WaveLabel } from "../types";
import {
  computeProjectionForAnchorModel,
  extractW1W2FibonacciAnchors,
} from "./fibonacci-anchor-semantics";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { ObjectiveTargetSourceContext } from "./objective-target-candidate-types";
import type {
  FibonacciObjectiveTargetProjectionPolicy,
  FibonacciProjectionPolicyResolution,
  FibonacciProjectionRatioSelectionRule,
} from "./fibonacci-projection-policy-types";

/**
 * Production registry — empty by design until explicit ENGINE_CONTRACT policy is approved.
 * No implicit 1.618, anchor model, or default ratio.
 */
export const PRODUCTION_FIBONACCI_PROJECTION_POLICIES: readonly FibonacciObjectiveTargetProjectionPolicy[] =
  [];

/** @deprecated Use extractW1W2FibonacciAnchors — kept for 14L diagnostics call sites. */
export function extractW1LegAnchorsFromFibonacciDiagnostic(
  fib: FibonacciDiagnostic | undefined
): { rangeStartPrice: number; rangeEndPrice: number } | null {
  const anchors = extractW1W2FibonacciAnchors(fib);
  if (!anchors) {
    return null;
  }
  return {
    rangeStartPrice: anchors.w1StartPriceCandleExtreme,
    rangeEndPrice: anchors.w1EndPriceCandleExtreme,
  };
}

function policyAppliesToPlan(
  policy: FibonacciObjectiveTargetProjectionPolicy,
  setupTypeId: string,
  waveLabel: WaveLabel
): boolean {
  if (!policy.applicableSetupTypes.includes(setupTypeId)) {
    return false;
  }
  if (
    policy.applicableWaveLabels &&
    !policy.applicableWaveLabels.includes(waveLabel)
  ) {
    return false;
  }
  return true;
}

function selectRatioFromRule(
  rule: FibonacciProjectionRatioSelectionRule,
  waveLabel: WaveLabel,
  allowedRatios: readonly FibExtensionLevel[]
): { ok: true; ratio: FibExtensionLevel } | { ok: false; reason: string } {
  if (rule.kind === "SINGLE_EXPLICIT") {
    if (!allowedRatios.includes(rule.ratio)) {
      return {
        ok: false,
        reason: `Explicit ratio ${rule.ratio} is not in policy allowedRatios.`,
      };
    }
    return { ok: true, ratio: rule.ratio };
  }
  const mapped = rule.mapping[waveLabel];
  if (mapped !== undefined) {
    if (!allowedRatios.includes(mapped)) {
      return {
        ok: false,
        reason: `Mapped ratio ${mapped} for wave ${waveLabel} is not in allowedRatios.`,
      };
    }
    return { ok: true, ratio: mapped };
  }
  return {
    ok: false,
    reason: `No explicit ratio mapping for wave label ${waveLabel}; fallback is NONE.`,
  };
}

function anchorsWithinEvaluationBar(
  anchors: ReturnType<typeof extractW1W2FibonacciAnchors>,
  evaluationBarIndex: number
): boolean {
  if (!anchors) {
    return false;
  }
  return (
    anchors.w1StartIndex <= evaluationBarIndex &&
    anchors.w1EndIndex <= evaluationBarIndex &&
    anchors.w2EndIndex <= evaluationBarIndex
  );
}

function resolveWithPolicy(
  policy: FibonacciObjectiveTargetProjectionPolicy,
  plan: EntryPlanCandidate,
  fib: FibonacciDiagnostic | undefined
): FibonacciProjectionPolicyResolution {
  if (!policyAppliesToPlan(policy, plan.setupTypeId, plan.scenarioRef.waveLabel)) {
    return {
      status: "POLICY_NOT_APPLICABLE",
      policyId: policy.policyId,
      selectedRatio: null,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail: `Policy ${policy.policyId} does not apply to ${plan.setupTypeId} wave ${plan.scenarioRef.waveLabel}.`,
      policy,
    };
  }
  if (!policy.anchorModel) {
    return {
      status: "ANCHOR_MODEL_UNSUPPORTED",
      policyId: policy.policyId,
      selectedRatio: null,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail: "Policy missing required anchorModel.",
      policy,
    };
  }
  if (policy.allowedRatios.length === 0) {
    return {
      status: "AMBIGUOUS_PROJECTION_POLICY",
      policyId: policy.policyId,
      selectedRatio: null,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail: "Policy allows no extension ratios.",
      policy,
    };
  }
  if (policy.allowedRatios.length > 1 && policy.selectionRule.kind === "SINGLE_EXPLICIT") {
    return {
      status: "AMBIGUOUS_PROJECTION_POLICY",
      policyId: policy.policyId,
      selectedRatio: null,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail:
        "Multiple allowedRatios with SINGLE_EXPLICIT rule; explicit selectionRule required.",
      policy,
    };
  }
  const ratioPick = selectRatioFromRule(
    policy.selectionRule,
    plan.scenarioRef.waveLabel,
    policy.allowedRatios
  );
  if (!ratioPick.ok) {
    return {
      status: "AMBIGUOUS_PROJECTION_POLICY",
      policyId: policy.policyId,
      selectedRatio: null,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail: ratioPick.reason,
      policy,
    };
  }
  const anchors = extractW1W2FibonacciAnchors(fib);
  if (!anchors) {
    return {
      status: "ANCHORS_UNAVAILABLE",
      policyId: policy.policyId,
      selectedRatio: ratioPick.ratio,
      rangeStartPrice: null,
      rangeEndPrice: null,
      projectionPrice: null,
      detail:
        "W1–W2 fibonacci diagnostic anchors unavailable on diagnostics.fibonacci snapshot.",
      policy,
    };
  }
  if (
    !anchorsWithinEvaluationBar(anchors, plan.evaluationBar.evaluationBarIndex)
  ) {
    return {
      status: "ANCHOR_TEMPORALLY_INVALID",
      policyId: policy.policyId,
      selectedRatio: ratioPick.ratio,
      rangeStartPrice: anchors.w1StartPriceCandleExtreme,
      rangeEndPrice: anchors.w1EndPriceCandleExtreme,
      projectionPrice: null,
      detail:
        "Fibonacci anchor indices exceed evaluationBarIndex; future pivot leakage rejected.",
      policy,
    };
  }
  const projectionPrice = computeProjectionForAnchorModel(
    policy.anchorModel,
    anchors,
    ratioPick.ratio
  );
  if (projectionPrice === null || !Number.isFinite(projectionPrice)) {
    return {
      status: "PROJECTION_FORMULA_UNAVAILABLE",
      policyId: policy.policyId,
      selectedRatio: ratioPick.ratio,
      rangeStartPrice: anchors.w1StartPriceCandleExtreme,
      rangeEndPrice: anchors.w1EndPriceCandleExtreme,
      projectionPrice: null,
      detail: `Projection formula unavailable for anchorModel ${policy.anchorModel}.`,
      policy,
    };
  }
  return {
    status: "POLICY_READY",
    policyId: policy.policyId,
    selectedRatio: ratioPick.ratio,
    rangeStartPrice: anchors.w1StartPriceCandleExtreme,
    rangeEndPrice: anchors.w1EndPriceCandleExtreme,
    projectionPrice,
    detail: `Projection via explicit anchorModel ${policy.anchorModel} and policy ${policy.policyId}.`,
    policy,
  };
}

export function resolveFibonacciProjectionPolicy(
  plan: EntryPlanCandidate,
  sourceContext?: ObjectiveTargetSourceContext
): FibonacciProjectionPolicyResolution {
  const fib = sourceContext?.diagnostics?.fibonacci;
  const callerPolicy = sourceContext?.fibonacciProjectionPolicy;
  if (callerPolicy) {
    return resolveWithPolicy(callerPolicy, plan, fib);
  }
  for (const policy of PRODUCTION_FIBONACCI_PROJECTION_POLICIES) {
    const result = resolveWithPolicy(policy, plan, fib);
    if (result.status !== "POLICY_NOT_APPLICABLE") {
      return result;
    }
  }
  return {
    status: "TARGET_RATIO_POLICY_MISSING",
    policyId: null,
    selectedRatio: null,
    rangeStartPrice: null,
    rangeEndPrice: null,
    projectionPrice: null,
    detail:
      "No production Fibonacci objective target projection policy is registered (TARGET_RATIO_POLICY_MISSING).",
  };
}
