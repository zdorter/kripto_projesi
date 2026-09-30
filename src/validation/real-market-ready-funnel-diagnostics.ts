import { evaluateProspectiveReferenceBundle } from "../wave/setup/prospective-reference-evaluation";
import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";
import type { Candle } from "../wave/types";

export type RealMarketReadyFunnelDiagnostics = ReturnType<
  typeof buildReadyFunnelDiagnostics
>;

export function buildReadyFunnelDiagnostics(input: {
  candidates: ProspectiveSetupProductionCandidate[];
  tradeContext: TradeSetupEvaluationContext;
  setupsById: Map<string, SetupCandidate>;
  candlesBySymbol: Record<string, Candle[]>;
}) {
  let prospectiveConfirmed = 0;
  let entryAvailable = 0;
  let stopAvailable = 0;
  let targetAvailable = 0;
  let rrAvailable = 0;
  let readyForFurtherEvaluation = 0;

  for (const c of input.candidates) {
    if (c.status === "CONFIRMED") {
      prospectiveConfirmed += 1;
    }
    if (c.status !== "CONFIRMED") {
      continue;
    }
    const setup = input.setupsById.get(c.sourceSetupId);
    const bundle = input.tradeContext.bundlesBySymbol?.[c.symbol];
    const candles = input.candlesBySymbol[c.symbol];
    if (!setup || !bundle || !candles?.length) {
      continue;
    }
    const refs = evaluateProspectiveReferenceBundle({
      production: c,
      historicalSetup: setup,
      bundle,
      candles,
    });
    if (refs.entry.outcome === "AVAILABLE") {
      entryAvailable += 1;
    }
    if (refs.stop.outcome === "AVAILABLE") {
      stopAvailable += 1;
    }
    if (refs.target.outcome === "AVAILABLE") {
      targetAvailable += 1;
    }
    if (refs.rr.outcome === "AVAILABLE") {
      rrAvailable += 1;
    }
    if (refs.readyForFurtherEvaluation) {
      readyForFurtherEvaluation += 1;
    }
  }

  return {
    schemaVersion: "1.0" as const,
    prospectiveConfirmed,
    entryAvailable,
    stopAvailable,
    targetAvailable,
    rrAvailable,
    readyForFurtherEvaluation,
    note: "READY_FOR_FURTHER_EVALUATION is not a trade signal.",
  };
}
