import type { SetupCandidate } from "./setup-types";
import { resolveTradeSetupTemporalContext } from "./trade-setup-temporal-semantics";
import type { SymbolEvaluationBundle } from "./trade-setup-types";
import type { ProspectiveSetupSourceKind } from "./prospective-setup-production-types";

export type ProspectiveSourcePolicyVerdict =
  | "ACCEPTED_HISTORICAL_TRADE_SETUP"
  | "REJECTED_NOT_TRADE_SETUP"
  | "REJECTED_NOT_HISTORICAL_STRUCTURE"
  | "REJECTED_ENDPOINT_NOT_CONFIRMED";

export function evaluateProspectiveSourcePolicy(input: {
  setup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
}): {
  verdict: ProspectiveSourcePolicyVerdict;
  sourceKind: ProspectiveSetupSourceKind | null;
  detail: string;
} {
  if (!input.setup.isTradeSetup) {
    return {
      verdict: "REJECTED_NOT_TRADE_SETUP",
      sourceKind: null,
      detail: "Prospective production accepts trade setups only.",
    };
  }
  const temporal = resolveTradeSetupTemporalContext(input.setup, input.bundle);
  if (temporal.temporalClass !== "HISTORICAL_STRUCTURE") {
    return {
      verdict: "REJECTED_NOT_HISTORICAL_STRUCTURE",
      sourceKind: null,
      detail: `Temporal class ${temporal.temporalClass} is not completed historical structure.`,
    };
  }
  if (temporal.focusWaveState !== "ENDPOINT_CONFIRMED") {
    return {
      verdict: "REJECTED_ENDPOINT_NOT_CONFIRMED",
      sourceKind: null,
      detail: "Completed structural endpoint not confirmed at evaluation bar.",
    };
  }
  return {
    verdict: "ACCEPTED_HISTORICAL_TRADE_SETUP",
    sourceKind: "HISTORICAL_TRADE_SETUP",
    detail:
      "Historical trade setup with HISTORICAL_STRUCTURE and confirmed endpoint (lifecycle CONFIRMED not required).",
  };
}
