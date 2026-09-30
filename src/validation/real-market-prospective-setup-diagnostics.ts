import type { SetupCandidate } from "../wave/setup/setup-types";
import { evaluateObjectiveTargetEligibilityGate } from "../wave/setup/objective-target-eligibility-gate";
import { resolveProspectiveSetupContract } from "../wave/setup/prospective-setup-contract";
import type { ProspectiveSetupContractResult } from "../wave/setup/prospective-setup-contract-types";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";
import type { Candle } from "../wave/types";

export type RealMarketProspectiveSetupDiagnostic = ProspectiveSetupContractResult & {
  symbol: string;
  targetGateOutcome: string;
};

export function buildProspectiveSetupDiagnostic(input: {
  historicalSetup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
  candles?: Candle[];
}): RealMarketProspectiveSetupDiagnostic {
  const contract = resolveProspectiveSetupContract(input);
  const gate = evaluateObjectiveTargetEligibilityGate(contract);
  return {
    ...contract,
    symbol: input.historicalSetup.symbol,
    targetGateOutcome: gate.outcome,
  };
}

export function summarizeProspectiveSetupDiagnostics(
  rows: RealMarketProspectiveSetupDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {
    historicalSources: rows.length,
    prospectiveSupported: 0,
    objectiveEligible: 0,
  };
  for (const row of rows) {
    summary[row.supportVerdict] = (summary[row.supportVerdict] ?? 0) + 1;
    summary[`phase:${row.phaseStatus}`] = (summary[`phase:${row.phaseStatus}`] ?? 0) + 1;
    if (row.supportVerdict === "SUPPORTED_BY_CONTRACT") {
      summary.prospectiveSupported += 1;
    }
    if (row.objectiveEligibility === "ELIGIBLE") {
      summary.objectiveEligible += 1;
    }
  }
  return summary;
}
