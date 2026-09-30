import { applyObjectiveTargetSelectionPolicy } from "../wave/setup/objective-target-selection";
import { buildObjectiveTargetCandidateReport } from "../wave/setup/objective-target-candidate-sources";
import { buildTargetModelReport, targetReferencesAvailable } from "../wave/setup/target-model";
import { buildRiskRewardReport, riskRewardReferencesAvailable } from "../wave/setup/risk-reward-model";
import { buildObjectiveTargetSourceContextForPlan } from "../wave/setup/objective-target-production-context";
import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import type { TradeSetupEvaluationSnapshot } from "../wave/setup/trade-setup-evaluation-types";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";
import type { ObjectiveTargetSourceId } from "../wave/setup/objective-target-candidate-types";

export interface RealMarketObjectiveTargetSourceDiagnosticRow {
  sourceId: ObjectiveTargetSourceId;
  outcome: string;
  provenance: string | null;
  targetPrice: number | null;
  reason: string;
  inputsUsed: string[];
}

export interface RealMarketObjectiveTargetProductionDiagnostic {
  setupId: string;
  setupTypeId: string;
  symbol: string;
  scenarioWaveLabel: string;
  directionalBias: string | null;
  evaluationBarIndex: number;
  entryReferencePrice: number | null;
  stopReferencePrice: number | null;
  stopModelId: string | null;
  sources: RealMarketObjectiveTargetSourceDiagnosticRow[];
  selectionOutcome: string | null;
  selectedSource: string | null;
  selectedPrice: number | null;
  targetModelOutcome: string | null;
  targetModelPrice: number | null;
  rrOutcome: string | null;
  rrRatio: number | null;
  fibonacciDiagnosticAvailable: boolean;
  confirmedSwingCountAtBar: number;
  segmentOriginIndex: number;
}

function inputsUsedForSource(
  sourceId: ObjectiveTargetSourceId,
  provenance: string | null
): string[] {
  switch (sourceId) {
    case "FIBONACCI_PROJECTION":
      return provenance === "ENGINE_DIAGNOSTICS"
        ? ["diagnostics.fibonacci (retracement conformance only)"]
        : ["attestedFibonacciProjection"];
    case "PREVIOUS_SWING":
      return ["diagnostics.confirmedSwings", "sourceScenario.startIndex"];
    case "WAVE_STRUCTURE":
      return ["attestedWaveStructureTarget"];
    case "ABC_PROJECTION":
      return ["attestedAbcProjection"];
    default:
      return [];
  }
}

export function buildObjectiveTargetProductionDiagnostic(input: {
  plan: EntryPlanCandidate;
  bundle: SymbolEvaluationBundle;
  snapshot?: TradeSetupEvaluationSnapshot | null;
  entryReferencePrice?: number;
  stopReferencePrice?: number;
  stopModelId?: string | null;
}): RealMarketObjectiveTargetProductionDiagnostic {
  const { plan, bundle, snapshot } = input;
  const context = buildObjectiveTargetSourceContextForPlan(plan, bundle);
  const candidateReport = buildObjectiveTargetCandidateReport({
    plan,
    sourceContext: context,
  });
  const selection = applyObjectiveTargetSelectionPolicy({
    report: candidateReport,
  });

  let targetModelOutcome: string | null = null;
  let targetModelPrice: number | null = null;
  let rrOutcome: string | null = null;
  let rrRatio: number | null = null;

  if (snapshot) {
    const targetRef = snapshot.selectedTargetReference;
    targetModelOutcome = targetRef?.outcome ?? null;
    targetModelPrice = targetRef?.targetPrice ?? null;
    const rr = snapshot.selectedRiskRewardReference;
    rrOutcome = rr?.outcome ?? null;
    rrRatio = rr?.riskRewardRatio ?? null;
  } else if (selection.outcome === "SELECTED" && selection.selectedCandidate) {
    const targetReport = buildTargetModelReport({ plan }).report;
    const targetRef = targetReferencesAvailable(targetReport)[0];
    targetModelOutcome = targetRef?.outcome ?? null;
    targetModelPrice = targetRef?.targetPrice ?? null;
  }

  const sources: RealMarketObjectiveTargetSourceDiagnosticRow[] =
    candidateReport.candidates.map((c) => ({
      sourceId: c.sourceId,
      outcome: c.outcome,
      provenance: context.sourceProvenance ?? null,
      targetPrice: c.targetPrice ?? null,
      reason: c.rationale,
      inputsUsed: inputsUsedForSource(
        c.sourceId,
        context.sourceProvenance ?? null
      ),
    }));

  const fib = context.diagnostics?.fibonacci;

  return {
    setupId: plan.setupRef.setupId,
    setupTypeId: plan.setupTypeId,
    symbol: plan.symbol,
    scenarioWaveLabel: plan.scenarioRef.waveLabel,
    directionalBias: plan.directionalBias,
    evaluationBarIndex: plan.evaluationBar.evaluationBarIndex,
    entryReferencePrice: input.entryReferencePrice ?? null,
    stopReferencePrice: input.stopReferencePrice ?? null,
    stopModelId: input.stopModelId ?? null,
    sources,
    selectionOutcome: selection.outcome,
    selectedSource: selection.selectedCandidate?.sourceId ?? null,
    selectedPrice: selection.selectedCandidate?.targetPrice ?? null,
    targetModelOutcome,
    targetModelPrice,
    rrOutcome,
    rrRatio,
    fibonacciDiagnosticAvailable: fib?.available === true,
    confirmedSwingCountAtBar: context.diagnostics?.confirmedSwings.length ?? 0,
    segmentOriginIndex: plan.sourceScenario.startIndex,
  };
}

export function summarizeObjectiveTargetSources(
  diagnostics: RealMarketObjectiveTargetProductionDiagnostic[]
): Record<
  string,
  { available: number; insufficient: number; notApplicable: number }
> {
  const summary: Record<
    string,
    { available: number; insufficient: number; notApplicable: number }
  > = {};
  for (const d of diagnostics) {
    for (const row of d.sources) {
      if (!summary[row.sourceId]) {
        summary[row.sourceId] = {
          available: 0,
          insufficient: 0,
          notApplicable: 0,
        };
      }
      if (row.outcome === "AVAILABLE") {
        summary[row.sourceId].available++;
      } else if (row.outcome === "NOT_APPLICABLE") {
        summary[row.sourceId].notApplicable++;
      } else {
        summary[row.sourceId].insufficient++;
      }
    }
  }
  return summary;
}

export function summarizeSelectedTargetSources(
  diagnostics: RealMarketObjectiveTargetProductionDiagnostic[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of diagnostics) {
    if (d.selectedSource) {
      out[d.selectedSource] = (out[d.selectedSource] ?? 0) + 1;
    }
  }
  return out;
}
