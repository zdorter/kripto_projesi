import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import { evaluateObjectiveTargetSource } from "../wave/setup/objective-target-candidate-sources";
import {
  extractW1LegAnchorsFromFibonacciDiagnostic,
  resolveFibonacciProjectionPolicy,
} from "../wave/setup/fibonacci-projection-policy";
import { buildObjectiveTargetSourceContextForPlan } from "../wave/setup/objective-target-production-context";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";
import type { TradeSetupEvaluationSnapshot } from "../wave/setup/trade-setup-evaluation-types";

export interface RealMarketFibonacciProjectionPolicyDiagnostic {
  setupId: string;
  waveLabel: string;
  direction: string | null;
  evaluationBarIndex: number;
  anchorsAvailable: boolean;
  w1RangeStart: number | null;
  w1RangeEnd: number | null;
  wave1StartIndex: number | null;
  wave1EndIndex: number | null;
  wave2EndIndex: number | null;
  projectionFormulaAvailable: boolean;
  ratioPolicyAvailable: boolean;
  policyApplicableToWave: boolean;
  policyId: string | null;
  policyStatus: string;
  allowedRatios: number[];
  selectedRatio: number | null;
  projectionPrice: number | null;
  projectionCandidateOutcome: string;
  projectionCandidateReason: string;
  targetModelOutcome: string | null;
  targetModelPrice: number | null;
  rrOutcome: string | null;
}

export function buildFibonacciProjectionPolicyDiagnostic(input: {
  plan: EntryPlanCandidate;
  bundle: SymbolEvaluationBundle;
  snapshot?: TradeSetupEvaluationSnapshot | null;
}): RealMarketFibonacciProjectionPolicyDiagnostic {
  const { plan, bundle, snapshot } = input;
  const context = buildObjectiveTargetSourceContextForPlan(plan, bundle);
  const fib = context.diagnostics?.fibonacci;
  const anchors = extractW1LegAnchorsFromFibonacciDiagnostic(fib);
  const resolution = resolveFibonacciProjectionPolicy(plan, context);
  const candidate = evaluateObjectiveTargetSource("FIBONACCI_PROJECTION", {
    plan,
    sourceContext: context,
  });

  const policyApplicable =
    resolution.status !== "POLICY_NOT_APPLICABLE" &&
    resolution.status !== "TARGET_RATIO_POLICY_MISSING";

  return {
    setupId: plan.setupRef.setupId,
    waveLabel: plan.scenarioRef.waveLabel,
    direction: plan.directionalBias,
    evaluationBarIndex: plan.evaluationBar.evaluationBarIndex,
    anchorsAvailable: anchors !== null,
    w1RangeStart: anchors?.rangeStartPrice ?? fib?.rangeStart ?? null,
    w1RangeEnd: anchors?.rangeEndPrice ?? fib?.rangeEnd ?? null,
    wave1StartIndex: fib?.wave1StartIndex ?? null,
    wave1EndIndex: fib?.wave1EndIndex ?? null,
    wave2EndIndex: fib?.wave2EndIndex ?? null,
    projectionFormulaAvailable: true,
    ratioPolicyAvailable: resolution.status === "POLICY_READY",
    policyApplicableToWave: policyApplicable,
    policyId: resolution.policyId,
    policyStatus: resolution.status,
    allowedRatios: [...(resolution.policy?.allowedRatios ?? [])],
    selectedRatio: resolution.selectedRatio,
    projectionPrice: resolution.projectionPrice,
    projectionCandidateOutcome: candidate.outcome,
    projectionCandidateReason: candidate.rationale,
    targetModelOutcome: snapshot?.selectedTargetReference?.outcome ?? null,
    targetModelPrice: snapshot?.selectedTargetReference?.targetPrice ?? null,
    rrOutcome: snapshot?.selectedRiskRewardReference?.outcome ?? null,
  };
}

export function summarizeProjectionPolicyDiagnostics(
  rows: RealMarketFibonacciProjectionPolicyDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.policyStatus] = (summary[row.policyStatus] ?? 0) + 1;
  }
  return summary;
}
