import {
  analyzeWaveAtEvaluationBar,
  compareFullVsScopedWaveAnalysis,
  evaluationScopedOpenLegVerdict,
} from "../wave/evaluation-scoped-analysis";
import { resolveProspectiveSetupContract } from "../wave/setup/prospective-setup-contract";
import type { SetupCandidate } from "../wave/setup/setup-types";
import { buildSymbolEvaluationBundleAtEvaluationBar } from "../wave/setup/trade-setup-context";
import type { Candle } from "../wave/types";

export interface RealMarketEvaluationScopedAnalysisDiagnostic {
  symbol: string;
  evaluationBarIndex: number;
  inputCandleCount: number;
  usedCandleCount: number;
  maxUsedIndex: number;
  prefixInvariant: boolean;
  fullVsScoped: {
    swingCount: { full: number; scoped: number };
    waveCount: { full: number; scoped: number };
    scenarioCount: { full: number; scoped: number };
    setupCount: { full: number; scoped: number };
  };
  futureSafe: boolean;
  invariantViolationCount: number;
  openLegVerdict: string;
  prospectivePhaseStatus: string | null;
  potentialLookaheadRisk: boolean | null;
  parityAtLastClosedBar: boolean;
  supportVerdict: "EVALUATION_SCOPED_ANALYSIS_SUPPORTED" | "EVALUATION_SCOPED_ANALYSIS_UNSUPPORTED";
}

export function buildEvaluationScopedAnalysisDiagnostic(input: {
  symbol: string;
  candles: Candle[];
  evaluationBarIndex: number;
  timeframeId: string;
  confirmedHistoricalSetup?: SetupCandidate | null;
  fullSetupCount: number;
  scopedSetupCount?: number;
}): RealMarketEvaluationScopedAnalysisDiagnostic {
  const scoped = analyzeWaveAtEvaluationBar({
    candles: input.candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: true,
  });

  const comparison = compareFullVsScopedWaveAnalysis(
    input.candles,
    input.evaluationBarIndex,
    {
      closedSeriesOnly: true,
      timeframeId: input.timeframeId,
      symbol: input.symbol,
    }
  );

  let prospectivePhaseStatus: string | null = null;
  let potentialLookaheadRisk: boolean | null = null;

  if (input.confirmedHistoricalSetup && scoped.status === "OK") {
    const bundle = buildSymbolEvaluationBundleAtEvaluationBar(
      input.candles,
      input.timeframeId,
      {
        evaluationBarIndex: input.evaluationBarIndex,
        closedSeriesOnly: true,
      }
    );
    const prospective = resolveProspectiveSetupContract({
      historicalSetup: input.confirmedHistoricalSetup,
      bundle,
      candles: input.candles.slice(0, input.evaluationBarIndex + 1),
    });
    prospectivePhaseStatus = prospective.phaseStatus;
    potentialLookaheadRisk = prospective.potentialLookaheadRisk;
  }

  const supportVerdict =
    scoped.status === "OK" && scoped.futureSafe
      ? "EVALUATION_SCOPED_ANALYSIS_SUPPORTED"
      : "EVALUATION_SCOPED_ANALYSIS_UNSUPPORTED";

  return {
    symbol: input.symbol,
    evaluationBarIndex: input.evaluationBarIndex,
    inputCandleCount: input.candles.length,
    usedCandleCount: scoped.evidence.usedCandleCount,
    maxUsedIndex: scoped.evidence.maxCandleIndexUsed,
    prefixInvariant: comparison.prefixInvariant,
    fullVsScoped: {
      swingCount: {
        full: comparison.full.swingCount,
        scoped: comparison.scoped.swingCount,
      },
      waveCount: {
        full: comparison.full.flatWaveCount,
        scoped: comparison.scoped.flatWaveCount,
      },
      scenarioCount: {
        full: comparison.full.scenarioCount,
        scoped: comparison.scoped.scenarioCount,
      },
      setupCount: {
        full: input.fullSetupCount,
        scoped: input.scopedSetupCount ?? 0,
      },
    },
    futureSafe: scoped.futureSafe,
    invariantViolationCount: scoped.invariantViolations.length,
    openLegVerdict: evaluationScopedOpenLegVerdict(scoped),
    prospectivePhaseStatus,
    potentialLookaheadRisk,
    parityAtLastClosedBar: comparison.parityAtLastClosedBar,
    supportVerdict,
  };
}
