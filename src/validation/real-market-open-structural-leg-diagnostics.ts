import { resolveTradeSetupEvaluationBoundary } from "../wave/setup/trade-setup-evaluation-bar";
import { buildSymbolEvaluationBundleAtEvaluationBar } from "../wave/setup/trade-setup-context";
import { resolveOpenStructuralLeg } from "../wave/setup/open-structural-leg";
import { resolveProspectiveSetupContract } from "../wave/setup/prospective-setup-contract";
import type { SetupCandidate } from "../wave/setup/setup-types";
import type { Candle } from "../wave/types";

export interface RealMarketOpenStructuralLegDiagnostic {
  symbol: string;
  setupId: string;
  evaluationBarIndex: number;
  historicalSourceCount: number;
  anchorCandidateCount: number;
  anchorSelectionStatus: string;
  selectedAnchorSource: string | null;
  anchorIndex: number | null;
  observationSpanBars: number;
  observedDirection: string | null;
  openLegStatus: string;
  transitionStatus: string;
  openMovementVerdict: string;
  objectiveEligibility: string;
  futureSafe: boolean;
  firstClassOpenLegAvailable: boolean;
  openLegPathVerdict: string | null;
}

export function buildOpenStructuralLegDiagnostic(input: {
  symbol: string;
  candles: Candle[];
  historicalSetup: SetupCandidate;
  timeframeId: string;
}): RealMarketOpenStructuralLegDiagnostic {
  const boundary = resolveTradeSetupEvaluationBoundary({
    candles: input.candles,
    closedSeriesOnly: true,
  }).evaluationBarIndex;
  const bundle = buildSymbolEvaluationBundleAtEvaluationBar(
    input.candles,
    input.timeframeId,
    { evaluationBarIndex: boundary, closedSeriesOnly: true }
  );
  const effective = input.candles.slice(0, bundle.evaluationBarIndex + 1);
  const resolution = resolveOpenStructuralLeg({
    bundle,
    candles: effective,
    historicalSetup: input.historicalSetup,
  });
  const prospective = resolveProspectiveSetupContract({
    historicalSetup: input.historicalSetup,
    bundle,
    candles: effective,
  });

  return {
    symbol: input.symbol,
    setupId: input.historicalSetup.id,
    evaluationBarIndex: bundle.evaluationBarIndex,
    historicalSourceCount: 1,
    anchorCandidateCount: resolution.anchorCandidates.length,
    anchorSelectionStatus: resolution.anchorSelection,
    selectedAnchorSource: resolution.selectedAnchorSource,
    anchorIndex: resolution.leg?.anchorIndex ?? null,
    observationSpanBars: resolution.observationSpanBars,
    observedDirection: resolution.leg?.observedDirection ?? null,
    openLegStatus: resolution.status,
    transitionStatus: prospective.structuralTransitionVerdict,
    openMovementVerdict: prospective.openMovementVerdict,
    objectiveEligibility: prospective.objectiveEligibility,
    futureSafe: resolution.futureSafe,
    firstClassOpenLegAvailable: resolution.status === "AVAILABLE",
    openLegPathVerdict: prospective.openLegPathComparison?.verdict ?? null,
  };
}

export function summarizeOpenStructuralLegDiagnostics(
  rows: RealMarketOpenStructuralLegDiagnostic[]
): Record<string, number> {
  const summary: Record<string, number> = {
    diagnosticRows: rows.length,
    firstClassOpenLegAvailable: 0,
  };
  for (const row of rows) {
    summary[`status:${row.openLegStatus}`] =
      (summary[`status:${row.openLegStatus}`] ?? 0) + 1;
    summary[`selection:${row.anchorSelectionStatus}`] =
      (summary[`selection:${row.anchorSelectionStatus}`] ?? 0) + 1;
    if (row.firstClassOpenLegAvailable) {
      summary.firstClassOpenLegAvailable += 1;
    }
  }
  return summary;
}
