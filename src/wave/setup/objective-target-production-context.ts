import type { WaveDiagnostics } from "../wave-diagnostics";
import type { EntryPlanCandidate } from "./entry-plan-types";
import type { ObjectiveTargetSourceContext } from "./objective-target-candidate-types";
import type {
  SymbolEvaluationBundle,
  TradeSetupEvaluationContext,
} from "./trade-setup-types";

/**
 * Builds per-plan objective target context from an existing evaluation bundle.
 * Does not run wave engine, scanner, or network fetch.
 */
export function buildObjectiveTargetSourceContextForPlan(
  plan: EntryPlanCandidate,
  bundle: SymbolEvaluationBundle
): ObjectiveTargetSourceContext {
  const barIndex = plan.evaluationBar.evaluationBarIndex;
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const diagnostics: WaveDiagnostics = {
    ...bundle.diagnostics,
    confirmedSwings: swings.filter((s) => s.index <= barIndex),
  };
  return {
    diagnostics,
    sourceProvenance: "ENGINE_DIAGNOSTICS",
  };
}

export function buildObjectiveTargetSourceContextBySetupId(
  plans: readonly EntryPlanCandidate[],
  bundles: Record<string, SymbolEvaluationBundle>
): Record<string, ObjectiveTargetSourceContext> {
  const out: Record<string, ObjectiveTargetSourceContext> = {};
  for (const plan of plans) {
    const bundle = bundles[plan.symbol];
    if (!bundle) {
      continue;
    }
    out[plan.setupRef.setupId] = buildObjectiveTargetSourceContextForPlan(
      plan,
      bundle
    );
  }
  return out;
}

export function buildObjectiveTargetSourceContextBySetupIdFromTradeContext(
  plans: readonly EntryPlanCandidate[],
  tradeContext: TradeSetupEvaluationContext
): Record<string, ObjectiveTargetSourceContext> {
  const bundles = tradeContext.bundlesBySymbol;
  if (!bundles) {
    return {};
  }
  return buildObjectiveTargetSourceContextBySetupId(plans, bundles);
}
