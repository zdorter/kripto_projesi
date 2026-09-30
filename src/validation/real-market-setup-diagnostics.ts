import { buildEntryPlanFromSetup } from "../wave/setup/entry-plan";
import type {
  ConditionOutcome,
  SetupCandidate,
  SetupDetectionReport,
} from "../wave/setup/setup-types";
import { TRADE_SETUP_CATALOG } from "../wave/setup/trade-setup-catalog";
import {
  evaluateSharedTradePrerequisites,
  evaluateTradeCondition,
} from "../wave/setup/trade-setup-rules";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";
import type { WaveScanReport, WaveScanResult } from "../wave/wave-scanner";
import type {
  ConditionOutcomeCounts,
  RealMarketConditionSummary,
  RealMarketInvalidationFlowSummary,
} from "./real-market-validation-types";

const OUTCOMES: ConditionOutcome[] = [
  "MET",
  "NOT_MET",
  "INSUFFICIENT_DATA",
  "NOT_APPLICABLE",
];

function emptyCounts(): ConditionOutcomeCounts {
  return {
    MET: 0,
    NOT_MET: 0,
    INSUFFICIENT_DATA: 0,
    NOT_APPLICABLE: 0,
  };
}

function bump(
  map: Record<string, ConditionOutcomeCounts>,
  conditionId: string,
  outcome: ConditionOutcome
): void {
  if (!map[conditionId]) {
    map[conditionId] = emptyCounts();
  }
  map[conditionId][outcome]++;
}

function catalogEntryFor(setupTypeId: string) {
  return TRADE_SETUP_CATALOG.find((e) => e.setupTypeId === setupTypeId);
}

function scanRowForSetup(
  scanReport: WaveScanReport,
  setup: SetupCandidate
): WaveScanResult | undefined {
  return scanReport.results.find(
    (r) =>
      r.symbol === setup.symbol &&
      r.scenarioId === setup.scenarioRef.scenarioId
  );
}

export function collectTradeSetupConditionEvaluations(
  setup: SetupCandidate,
  scanReport: WaveScanReport,
  tradeContext: TradeSetupEvaluationContext
): {
  prerequisite: Array<{ conditionId: string; outcome: ConditionOutcome }>;
  trigger: Array<{ conditionId: string; outcome: ConditionOutcome }>;
  confirmation: Array<{ conditionId: string; outcome: ConditionOutcome }>;
  invalidation: Array<{ conditionId: string; outcome: ConditionOutcome }>;
} {
  const row = scanRowForSetup(scanReport, setup);
  if (!row) {
    return {
      prerequisite: [],
      trigger: [],
      confirmation: [],
      invalidation: [],
    };
  }
  const entry = catalogEntryFor(setup.setupTypeId);
  const bundle = tradeContext.bundlesBySymbol?.[setup.symbol];
  const ctxRow = {
    scanRow: row,
    bundle,
    symbolContext: undefined,
  };
  const baseCtx = { scanRow: row, symbolContext: undefined };

  const prerequisite = entry
    ? [
        ...evaluateSharedTradePrerequisites(ctxRow),
        ...entry.prerequisiteConditions.map((id) =>
          evaluateTradeCondition(id, ctxRow)
        ),
      ]
    : evaluateSharedTradePrerequisites(ctxRow);

  const trigger =
    entry?.triggerConditions.map((id) =>
      evaluateTradeCondition(
        id as import("../wave/setup/trade-setup-types").TradeSetupConditionId,
        ctxRow
      )
    ) ?? [];

  const confirmation =
    entry?.tradeConfirmationConditions.map((id) =>
      evaluateTradeCondition(id, ctxRow)
    ) ?? setup.confirmation.conditions;

  const invalidation = setup.invalidation.conditions;

  return {
    prerequisite: prerequisite.map((e) => ({
      conditionId: e.conditionId,
      outcome: e.outcome,
    })),
    trigger: trigger.map((e) => ({
      conditionId: e.conditionId,
      outcome: e.outcome,
    })),
    confirmation: confirmation.map((e) => ({
      conditionId: e.conditionId,
      outcome: e.outcome,
    })),
    invalidation: invalidation.map((e) => ({
      conditionId: e.conditionId,
      outcome: e.outcome,
    })),
  };
}

export function buildConditionSummary(
  setupDetection: SetupDetectionReport,
  scanReport: WaveScanReport,
  tradeContext: TradeSetupEvaluationContext
): RealMarketConditionSummary {
  const byType: RealMarketConditionSummary["bySetupType"] = {};

  for (const setup of setupDetection.candidates) {
    if (!setup.isTradeSetup) {
      continue;
    }
    if (!byType[setup.setupTypeId]) {
      byType[setup.setupTypeId] = {
        prerequisite: {},
        trigger: {},
        confirmation: {},
        invalidation: {},
      };
    }
    const bucket = byType[setup.setupTypeId];
    const evals = collectTradeSetupConditionEvaluations(
      setup,
      scanReport,
      tradeContext
    );
    for (const e of evals.prerequisite) {
      bump(bucket.prerequisite, e.conditionId, e.outcome);
    }
    for (const e of evals.trigger) {
      bump(bucket.trigger, e.conditionId, e.outcome);
    }
    for (const e of evals.confirmation) {
      bump(bucket.confirmation, e.conditionId, e.outcome);
    }
    for (const e of evals.invalidation) {
      bump(bucket.invalidation, e.conditionId, e.outcome);
    }
  }

  return { bySetupType: byType };
}

export function buildInvalidationFlowSummary(input: {
  scanReport: WaveScanReport;
  tradeContext: TradeSetupEvaluationContext;
  setupDetection: SetupDetectionReport;
}): RealMarketInvalidationFlowSummary {
  const { scanReport, tradeContext, setupDetection } = input;

  let waveCandidateInvalidationAvailable = 0;
  for (const bundle of Object.values(tradeContext.bundlesBySymbol ?? {})) {
    const flatWaves = bundle.presentation?.engine?.flatWaves;
    if (!flatWaves) {
      continue;
    }
    for (const w of flatWaves) {
      if (w.invalidationPrice !== undefined) {
        waveCandidateInvalidationAvailable++;
      }
    }
  }

  const scenarioInvalidationAvailable = scanReport.results.filter(
    (r) => r.invalidation.available && r.invalidation.price !== undefined
  ).length;

  const tradeSetups = setupDetection.candidates.filter((c) => c.isTradeSetup);
  const setupReferenceAvailable = tradeSetups.filter((c) =>
    c.referenceLevels.some((l) => l.kind === "SCENARIO_INVALIDATION")
  ).length;

  let entryPlanInvalidationAvailable = 0;
  for (const setup of tradeSetups) {
    if (setup.status !== "CONFIRMED") {
      continue;
    }
    const bundle = tradeContext.bundlesBySymbol?.[setup.symbol];
    if (!bundle) {
      continue;
    }
    const { plan } = buildEntryPlanFromSetup({
      setup,
      evaluationBar: {
        evaluationBarIndex: bundle.evaluationBarIndex,
        evaluationBarBoundaryEstablished:
          bundle.evaluationBarBoundaryEstablished,
        evaluationBarContractDetail: bundle.evaluationBarContractDetail,
      },
    });
    if (
      plan?.referenceLevels.some((l) => l.kind === "SCENARIO_INVALIDATION")
    ) {
      entryPlanInvalidationAvailable++;
    }
  }

  const scannerInvalidationAvailable = scenarioInvalidationAvailable;

  let scannerAvailableSetupReferenceMissing = 0;
  for (const setup of tradeSetups) {
    const row = scanRowForSetup(scanReport, setup);
    if (
      row?.invalidation.available &&
      row.invalidation.price !== undefined &&
      !setup.referenceLevels.some((l) => l.kind === "SCENARIO_INVALIDATION")
    ) {
      scannerAvailableSetupReferenceMissing++;
    }
  }

  return {
    waveCandidateInvalidationAvailable,
    scenarioInvalidationAvailable,
    scannerInvalidationAvailable,
    setupScenarioInvalidationReferenceAvailable: setupReferenceAvailable,
    entryPlanScenarioInvalidationAvailable: entryPlanInvalidationAvailable,
    scannerAvailableSetupReferenceMissing,
    tradeSetupCount: tradeSetups.length,
    scanResultCount: scanReport.results.length,
  };
}

export function summarizeZeroConfirmedRootCause(
  summary: RealMarketConditionSummary
): Record<string, string[]> {
  const notes: Record<string, string[]> = {};
  for (const [setupTypeId, groups] of Object.entries(summary.bySetupType)) {
    const lines: string[] = [];
    const allGroups = [
      ["prerequisite", groups.prerequisite],
      ["trigger", groups.trigger],
      ["confirmation", groups.confirmation],
    ] as const;
    for (const [groupName, condMap] of allGroups) {
      for (const [conditionId, counts] of Object.entries(condMap)) {
        if (counts.NOT_MET > 0) {
          lines.push(
            `${groupName}:${conditionId} NOT_MET on ${counts.NOT_MET} setup(s) (rule not satisfied on snapshot).`
          );
        }
        if (counts.INSUFFICIENT_DATA > 0) {
          lines.push(
            `${groupName}:${conditionId} INSUFFICIENT_DATA on ${counts.INSUFFICIENT_DATA} setup(s) (required production context missing).`
          );
        }
      }
    }
    const inv = groups.prerequisite["invalidation-available"];
    if (inv && inv.NOT_MET > 0) {
      lines.push(
        `prerequisite:invalidation-available NOT_MET on ${inv.NOT_MET} setup(s) → UPSTREAM_INVALIDATION_UNAVAILABLE at scenario/scanner layer.`
      );
    }
    notes[setupTypeId] = lines;
  }
  return notes;
}
