import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import { resolveObjectiveWaveContext } from "../wave/setup/objective-wave-resolution";
import type { ObjectiveWaveResolutionContext } from "../wave/setup/objective-wave-resolution-types";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";

export type RealMarketObjectiveWaveResolutionDiagnostic =
  ObjectiveWaveResolutionContext & {
    symbol: string;
  };

export function buildObjectiveWaveResolutionDiagnostic(input: {
  plan: EntryPlanCandidate;
  bundle: SymbolEvaluationBundle;
}): RealMarketObjectiveWaveResolutionDiagnostic {
  const base = resolveObjectiveWaveContext(input.plan, input.bundle);
  return {
    ...base,
    symbol: input.plan.symbol,
  };
}

export function summarizeObjectiveWaveResolutionDiagnostics(
  rows: RealMarketObjectiveWaveResolutionDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
    if (row.temporalCompatibility.startsWith("TEMPORALLY_LATE")) {
      summary.TEMPORALLY_LATE = (summary.TEMPORALLY_LATE ?? 0) + 1;
    }
  }
  return summary;
}
