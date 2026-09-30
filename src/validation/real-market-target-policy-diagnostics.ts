import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../wave/setup/fibonacci-projection-policy";
import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";

export type RealMarketTargetPolicyDiagnostics = ReturnType<
  typeof buildTargetPolicyDiagnostics
>;

export function buildTargetPolicyDiagnostics(
  candidates: ProspectiveSetupProductionCandidate[]
) {
  let targetGatePass = 0;
  let targetGateFail = 0;
  for (const c of candidates) {
    if (c.targetGateOutcome === "PASS") {
      targetGatePass += 1;
    } else {
      targetGateFail += 1;
    }
  }
  return {
    schemaVersion: "1.0" as const,
    targetGatePass,
    targetGateFail,
    productionFibonacciPolicyCount: PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length,
    explicitPolicyOnlyNote:
      "Target gate PASS permits objective evaluation; targets require explicit production policy.",
  };
}
