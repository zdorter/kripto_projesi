import { isEntryPlanEligibleSetup } from "./setup-catalog";
import type {
  EntryPlanBuildInput,
  EntryPlanBuildResult,
  EntryPlanCandidate,
  EntryPlanEligibility,
  EntryPlanEvaluationBarSource,
  EntryPlanReport,
} from "./entry-plan-types";
import { ENTRY_PLAN_SCHEMA_VERSION } from "./entry-plan-types";
import type { SetupCandidate, SetupDetectionReport } from "./setup-types";
import type { SymbolEvaluationBundle } from "./trade-setup-types";

const ENTRY_PLAN_LIMITATIONS = [
  "Entry Plan is a snapshot for execution-plan construction (14D.2+); it is not a trade signal or profitability claim.",
  "CONFIRMED trade setup means catalog conditions are satisfied at the evaluation bar — not predicted market outcome.",
  "Invalidation reference is structural scenario invalidation, not stop-loss (14D.3).",
  "Multiple eligible setups may yield multiple Entry Plans; no ranking or winner selection.",
];

export function evaluationBarSourceFromBundle(
  bundle?: SymbolEvaluationBundle
): EntryPlanEvaluationBarSource | undefined {
  if (!bundle) {
    return undefined;
  }
  return {
    evaluationBarIndex: bundle.evaluationBarIndex,
    evaluationBarBoundaryEstablished: bundle.evaluationBarBoundaryEstablished,
    evaluationBarContractDetail: bundle.evaluationBarContractDetail,
  };
}

export function resolveEntryPlanEligibility(
  setup: Pick<SetupCandidate, "isTradeSetup" | "status">,
  evaluationBar?: EntryPlanEvaluationBarSource
): EntryPlanEligibility {
  if (!setup.isTradeSetup) {
    return {
      eligible: false,
      reason: "NOT_TRADE_SETUP",
      detail: "Structural context setups cannot cross the Entry Plan boundary.",
    };
  }
  if (setup.status === "INVALID") {
    return {
      eligible: false,
      reason: "SETUP_INVALID",
      detail: "Trade setup lifecycle is INVALID.",
    };
  }
  if (setup.status === "INSUFFICIENT_CONTEXT") {
    return {
      eligible: false,
      reason: "INSUFFICIENT_CONTEXT",
      detail: "Trade setup lifecycle is INSUFFICIENT_CONTEXT.",
    };
  }
  if (setup.status === "CANDIDATE") {
    return {
      eligible: false,
      reason: "SETUP_NOT_CONFIRMED",
      detail: "Trade setup is CANDIDATE; Entry Plan requires CONFIRMED.",
    };
  }
  if (setup.status !== "CONFIRMED") {
    return {
      eligible: false,
      reason: "SETUP_NOT_CONFIRMED",
      detail: `Unexpected setup status ${setup.status}.`,
    };
  }
  if (
    !evaluationBar ||
    !evaluationBar.evaluationBarBoundaryEstablished ||
    evaluationBar.evaluationBarIndex < 0
  ) {
    return {
      eligible: false,
      reason: "CLOSED_BAR_NOT_ESTABLISHED",
      detail:
        evaluationBar?.evaluationBarContractDetail ??
        "Closed evaluation-bar boundary not established for this symbol.",
    };
  }
  return {
    eligible: true,
    reason: "ENTRY_PLAN_ELIGIBLE",
    detail: `Confirmed trade setup at closed evaluation bar ${evaluationBar.evaluationBarIndex}.`,
  };
}

export function buildEntryPlanFromSetup(
  input: EntryPlanBuildInput
): EntryPlanBuildResult {
  const eligibility = resolveEntryPlanEligibility(
    input.setup,
    input.evaluationBar
  );
  if (!eligibility.eligible) {
    return { eligibility, plan: null };
  }
  const bar = input.evaluationBar!;
  const setup = input.setup;
  const plan: EntryPlanCandidate = {
    schemaVersion: ENTRY_PLAN_SCHEMA_VERSION,
    id: `${setup.id}:entry-plan`,
    symbol: setup.symbol,
    timeframe: setup.timeframe,
    setupRef: {
      setupId: setup.id,
      setupTypeId: setup.setupTypeId,
      setupTypeLabel: setup.setupTypeLabel,
      sourceSetupStatus: setup.status,
    },
    scenarioRef: { ...setup.scenarioRef },
    setupTypeId: setup.setupTypeId,
    directionalBias: setup.directionalBias,
    directionalBasis: setup.directionalBasis,
    evaluationBar: {
      evaluationBarIndex: bar.evaluationBarIndex,
      boundaryEstablished: bar.evaluationBarBoundaryEstablished,
      contractDetail: bar.evaluationBarContractDetail,
    },
    invalidation: {
      usesScenarioInvalidation: setup.invalidation.usesScenarioInvalidation,
      summary: setup.invalidation.summary,
      conditions: [...setup.invalidation.conditions],
    },
    referenceLevels: setup.referenceLevels.map((r) => ({ ...r })),
    sourceScenario: { ...setup.sourceScenario, evidence: [...setup.sourceScenario.evidence], limitations: [...setup.sourceScenario.limitations] },
    context: { ...setup.context },
    eligibility: { ...eligibility },
    limitations: [
      ...ENTRY_PLAN_LIMITATIONS,
      ...setup.setupLimitations,
    ],
    evaluationNotes: [...setup.evaluationNotes],
  };
  return { eligibility, plan };
}

function compareEntryPlans(a: EntryPlanCandidate, b: EntryPlanCandidate): number {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const type = a.setupTypeId.localeCompare(b.setupTypeId);
  if (type !== 0) {
    return type;
  }
  return a.setupRef.setupId.localeCompare(b.setupRef.setupId);
}

/**
 * Builds Entry Plans for all eligible confirmed trade setups in a detection report.
 * Does not re-run scanner, engine, or diagnostics.
 */
export function buildEntryPlansFromSetupReport(
  report: SetupDetectionReport,
  bundlesBySymbol?: Record<string, SymbolEvaluationBundle>
): EntryPlanReport {
  const plans: EntryPlanCandidate[] = [];
  for (const setup of report.candidates) {
    if (!isEntryPlanEligibleSetup(setup)) {
      continue;
    }
    const bar = evaluationBarSourceFromBundle(bundlesBySymbol?.[setup.symbol]);
    const { plan } = buildEntryPlanFromSetup({ setup, evaluationBar: bar });
    if (plan) {
      plans.push(plan);
    }
  }
  plans.sort(compareEntryPlans);
  const symbols = [...new Set(plans.map((p) => p.symbol))].sort();
  return {
    schemaVersion: ENTRY_PLAN_SCHEMA_VERSION,
    timeframe: report.timeframe,
    symbols,
    plans,
    planCount: plans.length,
    limitations: [...ENTRY_PLAN_LIMITATIONS, ...report.limitations],
  };
}
