import type { Candle } from "../types";
import { evaluateObjectiveTargetEligibilityGate } from "./objective-target-eligibility-gate";
import { resolveOpenStructuralLeg } from "./open-structural-leg";
import { resolveProspectiveSetupContract } from "./prospective-setup-contract";
import { evaluateProspectiveSourcePolicy } from "./prospective-setup-source-policy";
import type { SetupCandidate } from "./setup-types";
import type { SymbolEvaluationBundle, TradeSetupEvaluationContext } from "./trade-setup-types";
import type {
  ProspectiveFunnelReasonCode,
  ProspectiveFunnelStage,
  ProspectiveSetupProductionCandidate,
  ProspectiveSetupProductionReport,
  ProspectiveSetupProductionStatus,
} from "./prospective-setup-production-types";
import {
  PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
} from "./prospective-setup-production-types";

import { PRODUCTION_TRANSITION_RULE_ID } from "./structural-transition-semantics";
import { resolveProspectiveStructuralInvalidation } from "./prospective-structural-invalidation";
import { evaluateProspectivePhaseTruth } from "./prospective-phase-semantics";

/** @deprecated Use PRODUCTION_TRANSITION_RULE_ID */
export const PRODUCTION_STRUCTURAL_TRANSITION_RULE =
  PRODUCTION_TRANSITION_RULE_ID;

function scopedCandles(
  candles: Candle[],
  evaluationBarIndex: number
): Candle[] {
  return candles.slice(0, evaluationBarIndex + 1);
}

function resolveFunnel(input: {
  sourceOk: boolean;
  openLegStatus: string;
  anchorSelection: string;
  transitionObserved: boolean;
  openMovementOnly: boolean;
  invalidationOk: boolean;
  invalidationTriggered: boolean;
  futureSafe: boolean;
  productionConfirmed: boolean;
  objectiveEligible: boolean;
  targetGatePass: boolean;
}): { stage: ProspectiveFunnelStage; code: ProspectiveFunnelReasonCode | null } {
  if (!input.sourceOk) {
    return { stage: "SOURCE", code: "SOURCE_NOT_HISTORICAL_STRUCTURE" };
  }
  if (input.openLegStatus !== "AVAILABLE") {
    if (input.anchorSelection === "CONFLICT" || input.openLegStatus === "ANCHOR_CONFLICT") {
      return { stage: "ANCHOR", code: "ANCHOR_CONFLICT" };
    }
    if (input.anchorSelection === "AMBIGUOUS") {
      return { stage: "ANCHOR", code: "ANCHOR_AMBIGUOUS" };
    }
    if (input.openLegStatus === "NO_OBSERVED_SPAN") {
      return { stage: "OPEN_LEG", code: "NO_OBSERVED_SPAN" };
    }
    return { stage: "OPEN_LEG", code: "OPEN_LEG_UNAVAILABLE" };
  }
  if (input.anchorSelection !== "SELECTED") {
    return {
      stage: "ANCHOR",
      code:
        input.anchorSelection === "AMBIGUOUS"
          ? "ANCHOR_AMBIGUOUS"
          : "ANCHOR_NOT_SELECTED",
    };
  }
  if (!input.transitionObserved) {
    return {
      stage: "TRANSITION",
      code: input.openMovementOnly
        ? "OPEN_MOVEMENT_ONLY"
        : "TRANSITION_NOT_OBSERVED",
    };
  }
  if (input.invalidationTriggered) {
    return { stage: "INVALIDATION", code: "INVALIDATION_TRIGGERED" };
  }
  if (!input.invalidationOk) {
    return { stage: "INVALIDATION", code: "INVALIDATION_UNAVAILABLE" };
  }
  if (!input.futureSafe) {
    return { stage: "PROSPECTIVE_CONFIRMED", code: "NOT_FUTURE_SAFE" };
  }
  if (!input.productionConfirmed) {
    return { stage: "PROSPECTIVE_CONFIRMED", code: "PROSPECTIVE_NOT_CONFIRMED" };
  }
  if (!input.objectiveEligible) {
    return { stage: "OBJECTIVE_ELIGIBLE", code: "OBJECTIVE_NOT_ELIGIBLE" };
  }
  if (!input.targetGatePass) {
    return { stage: "TARGET_GATE", code: "TARGET_GATE_FAIL" };
  }
  return { stage: "COMPLETE", code: null };
}

function productionStatus(input: {
  sourceOk: boolean;
  invalidationTriggered: boolean;
  productionConfirmed: boolean;
}): ProspectiveSetupProductionStatus {
  if (!input.sourceOk) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (input.invalidationTriggered) {
    return "INVALIDATED";
  }
  if (input.productionConfirmed) {
    return "CONFIRMED";
  }
  return "CANDIDATE";
}

export function evaluateProspectiveSetupProduction(input: {
  historicalSetup: SetupCandidate;
  bundle: SymbolEvaluationBundle;
  candles: Candle[];
}): ProspectiveSetupProductionCandidate {
  const { historicalSetup, bundle, candles } = input;
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const effective = scopedCandles(candles, evaluationBarIndex);

  const sourcePolicy = evaluateProspectiveSourcePolicy({
    setup: historicalSetup,
    bundle,
  });
  const sourceOk = sourcePolicy.verdict === "ACCEPTED_HISTORICAL_TRADE_SETUP";

  const openLegResolution = resolveOpenStructuralLeg({
    bundle,
    candles: effective,
    historicalSetup: sourceOk ? historicalSetup : null,
  });

  const contract = resolveProspectiveSetupContract({
    historicalSetup,
    bundle,
    candles: effective,
  });

  const transitionObserved =
    contract.structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED";
  const openMovementOnly =
    contract.openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" &&
    !transitionObserved;

  const structuralInvalidation =
    resolveProspectiveStructuralInvalidation(historicalSetup);
  const invalidationTriggered =
    historicalSetup.status === "INVALID" || structuralInvalidation.triggered;
  const invalidationOk = structuralInvalidation.available;

  const completedAtIndex = contract.transitionEvidence.completedAtIndex;
  const anchorAtCompleted =
    openLegResolution.leg !== null &&
    completedAtIndex !== null &&
    openLegResolution.leg.anchorIndex === completedAtIndex;

  const phaseTruth = evaluateProspectivePhaseTruth({
    sourceAccepted: sourceOk,
    anchorMatchesCompletedEndpoint: anchorAtCompleted,
    openLegAvailable: openLegResolution.status === "AVAILABLE",
    anchorSelected: openLegResolution.anchorSelection === "SELECTED",
    transitionObserved,
    invalidationAvailable: invalidationOk,
    invalidationTriggered,
    futureSafe:
      openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    phaseStatus: contract.phaseStatus,
  });

  const productionConfirmed = phaseTruth.productionConfirmed;

  const objectiveEligibility = productionConfirmed
    ? "ELIGIBLE"
    : contract.objectiveEligibility;

  const contractForGate = productionConfirmed
    ? {
        ...contract,
        supportVerdict: "SUPPORTED_BY_CONTRACT" as const,
        phaseStatus: "PHASE_IN_PROGRESS" as const,
        objectiveEligibility: "ELIGIBLE" as const,
      }
    : contract;

  const targetGate = evaluateObjectiveTargetEligibilityGate(contractForGate);
  const targetGatePass = targetGate.outcome === "PASS";

  const funnel = resolveFunnel({
    sourceOk,
    openLegStatus: openLegResolution.status,
    anchorSelection: openLegResolution.anchorSelection,
    transitionObserved,
    openMovementOnly,
    invalidationOk,
    invalidationTriggered,
    futureSafe:
      openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    productionConfirmed,
    objectiveEligible: objectiveEligibility === "ELIGIBLE",
    targetGatePass,
  });

  const status = productionStatus({
    sourceOk,
    invalidationTriggered,
    productionConfirmed,
  });

  const id = `${historicalSetup.symbol}:${historicalSetup.timeframe}:prospective:${PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT}:${historicalSetup.id}`;

  return {
    schemaVersion: "1.0",
    id,
    symbol: historicalSetup.symbol,
    timeframe: historicalSetup.timeframe,
    familyId: PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    semanticCategory: "PROSPECTIVE_TRADE_SETUP",
    sourceKind: "HISTORICAL_TRADE_SETUP",
    sourceSetupId: historicalSetup.id,
    sourceSetupTypeId: historicalSetup.setupTypeId,
    status,
    evaluationBarIndex,
    prospectiveWaveLabel: null,
    observedDirection: openLegResolution.leg?.observedDirection ?? null,
    openLegResolution,
    contract,
    objectiveEligibility,
    targetGateOutcome: targetGate.outcome,
    funnelFirstFailure: funnel.stage,
    funnelReasonCode: funnel.code,
    futureSafe:
      openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    usesLegacyPotentialAsProductionEvidence: false,
  };
}

export function detectProspectiveSetupProduction(input: {
  historicalTradeSetups: SetupCandidate[];
  tradeContext: TradeSetupEvaluationContext;
  candlesBySymbol: Record<string, Candle[]>;
}): ProspectiveSetupProductionReport {
  const candidates: ProspectiveSetupProductionCandidate[] = [];

  for (const setup of input.historicalTradeSetups) {
    const bundle = input.tradeContext.bundlesBySymbol?.[setup.symbol];
    const candles = input.candlesBySymbol[setup.symbol];
    if (!bundle || !candles?.length) {
      continue;
    }
    if (
      setup.setupTypeId !== "impulse-continuation" &&
      setup.setupTypeId !== "correction-end"
    ) {
      continue;
    }
    candidates.push(
      evaluateProspectiveSetupProduction({
        historicalSetup: setup,
        bundle,
        candles,
      })
    );
  }

  candidates.sort((a, b) => a.id.localeCompare(b.id));

  const summary: Record<string, number> = {
    candidates: candidates.length,
    confirmed: 0,
    objectiveEligible: 0,
    targetGatePass: 0,
  };
  for (const c of candidates) {
    summary[`status:${c.status}`] = (summary[`status:${c.status}`] ?? 0) + 1;
    summary[`funnel:${c.funnelFirstFailure}`] =
      (summary[`funnel:${c.funnelFirstFailure}`] ?? 0) + 1;
    if (c.funnelReasonCode) {
      summary[`reason:${c.funnelReasonCode}`] =
        (summary[`reason:${c.funnelReasonCode}`] ?? 0) + 1;
    }
    if (c.status === "CONFIRMED") {
      summary.confirmed += 1;
    }
    if (c.objectiveEligibility === "ELIGIBLE") {
      summary.objectiveEligible += 1;
    }
    if (c.targetGateOutcome === "PASS") {
      summary.targetGatePass += 1;
    }
  }

  return {
    schemaVersion: "1.0",
    candidates,
    summary,
  };
}
