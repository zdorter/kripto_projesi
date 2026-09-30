import type { LayerAvailability } from "./real-market-validation-types";
import { resolveTradeSetupTemporalContext } from "../wave/setup/trade-setup-temporal-semantics";
import type { TradeSetupTemporalContext } from "../wave/setup/trade-setup-temporal-types";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";

export type RealMarketTradeSetupTemporalDiagnostic = TradeSetupTemporalContext & {
  symbol: string;
  entryAvailability: LayerAvailability | "NOT_APPLICABLE";
  stopAvailability: LayerAvailability | "NOT_APPLICABLE";
};

export function buildTradeSetupTemporalDiagnostic(input: {
  setup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
  entryAvailability?: LayerAvailability | "NOT_APPLICABLE";
  stopAvailability?: LayerAvailability | "NOT_APPLICABLE";
}): RealMarketTradeSetupTemporalDiagnostic {
  const base = resolveTradeSetupTemporalContext(input.setup, input.bundle);
  return {
    ...base,
    symbol: input.setup.symbol,
    entryAvailability: input.entryAvailability ?? "NOT_APPLICABLE",
    stopAvailability: input.stopAvailability ?? "NOT_APPLICABLE",
  };
}

export function summarizeTradeSetupTemporalDiagnostics(
  rows: RealMarketTradeSetupTemporalDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.temporalClass] = (summary[row.temporalClass] ?? 0) + 1;
    summary[`eligibility:${row.objectiveEligibility}`] =
      (summary[`eligibility:${row.objectiveEligibility}`] ?? 0) + 1;
  }
  return summary;
}
