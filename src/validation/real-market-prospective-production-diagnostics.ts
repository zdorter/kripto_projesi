import { detectProspectiveSetupProduction } from "../wave/setup/prospective-setup-production";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";
import type { Candle } from "../wave/types";

export function buildProspectiveProductionDiagnostics(input: {
  tradeSetups: SetupCandidate[];
  tradeContext: TradeSetupEvaluationContext;
  candlesBySymbol: Record<string, Candle[]>;
}) {
  const tradeSources = input.tradeSetups.filter((s) => s.isTradeSetup);
  const report = detectProspectiveSetupProduction({
    historicalTradeSetups: tradeSources,
    tradeContext: input.tradeContext,
    candlesBySymbol: input.candlesBySymbol,
  });
  return report;
}
