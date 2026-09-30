import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import { resolveWaveProjectionContext } from "../wave/setup/wave-projection-context";
import type { WaveProjectionContext } from "../wave/setup/wave-projection-relationship-types";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";

export type RealMarketWaveProjectionContextDiagnostic = WaveProjectionContext;

export function buildWaveProjectionContextDiagnostic(input: {
  plan: EntryPlanCandidate;
  bundle: SymbolEvaluationBundle;
}): RealMarketWaveProjectionContextDiagnostic {
  return resolveWaveProjectionContext(input.plan, input.bundle);
}

export function summarizeWaveProjectionContextDiagnostics(
  rows: RealMarketWaveProjectionContextDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
  }
  return summary;
}
