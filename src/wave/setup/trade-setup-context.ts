import { analyzeWaveWithDiagnostics } from "../analysis-pipeline";
import { analyzeWaveAtEvaluationBar } from "../evaluation-scoped-analysis";
import type { Candle, WaveEngineOptions } from "../types";
import type { WaveScanReport } from "../wave-scanner";
import { buildTradeSetupEvaluationContextWithScopedAnalysis } from "./evaluation-scoped-trade-context";
import { resolveTradeSetupEvaluationBoundary } from "./trade-setup-evaluation-bar";
import type {
  SymbolEvaluationBundle,
  TradeSetupEvaluationContext,
  TradeSetupSymbolBuildInput,
} from "./trade-setup-types";

/**
 * Composition-layer snapshot builder. Not used inside per-condition evaluation.
 */
export function buildSymbolEvaluationBundle(
  candles: Candle[],
  timeframeId: string,
  input: Pick<
    TradeSetupSymbolBuildInput,
    "evaluationBarIndex" | "closedSeriesOnly"
  >,
  engineOptions?: WaveEngineOptions
): SymbolEvaluationBundle {
  const { diagnostics, presentation } = analyzeWaveWithDiagnostics(
    candles,
    engineOptions
  );
  const resolved = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly,
  });
  return {
    timeframeId,
    evaluationBarIndex: resolved.evaluationBarIndex,
    evaluationBarBoundaryEstablished: resolved.boundaryEstablished,
    evaluationBarContractDetail: resolved.contractDetail,
    candleCount: candles.length,
    diagnostics,
    presentation,
  };
}

/**
 * Evaluation-scoped bundle: wave engine runs on candles[0..evaluationBarIndex] only.
 */
export function buildSymbolEvaluationBundleAtEvaluationBar(
  candles: Candle[],
  timeframeId: string,
  input: Pick<
    TradeSetupSymbolBuildInput,
    "evaluationBarIndex" | "closedSeriesOnly"
  >,
  engineOptions?: WaveEngineOptions
): SymbolEvaluationBundle {
  const scoped = analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly,
    engineOptions,
  });
  const resolved = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly,
  });
  if (
    scoped.status !== "OK" ||
    !scoped.diagnostics ||
    !scoped.presentation
  ) {
    throw new Error(
      `Evaluation-scoped analysis failed: ${scoped.detail} (${scoped.status})`
    );
  }
  return {
    timeframeId,
    evaluationBarIndex: scoped.evaluationBarIndex,
    evaluationBarBoundaryEstablished: scoped.evidence.boundaryEstablished,
    evaluationBarContractDetail: scoped.evidence.contractDetail,
    candleCount: candles.length,
    diagnostics: scoped.diagnostics,
    presentation: scoped.presentation,
  };
}

export function buildTradeSetupEvaluationContext(
  scanReport: WaveScanReport,
  symbols: Record<string, TradeSetupSymbolBuildInput>,
  engineOptions?: WaveEngineOptions
): TradeSetupEvaluationContext {
  const usesEvaluationBoundary = Object.values(symbols).some((input) => {
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly,
    });
    return boundary.boundaryEstablished && boundary.evaluationBarIndex >= 0;
  });

  if (usesEvaluationBoundary) {
    return buildTradeSetupEvaluationContextWithScopedAnalysis(
      scanReport,
      symbols,
      engineOptions
    );
  }

  const bundlesBySymbol: Record<string, SymbolEvaluationBundle> = {};
  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    bundlesBySymbol[symbol] = {
      ...buildSymbolEvaluationBundle(
        input.candles,
        scanReport.timeframe,
        {
          evaluationBarIndex: input.evaluationBarIndex,
          closedSeriesOnly: input.closedSeriesOnly,
        },
        engineOptions
      ),
      evaluationAnalysisScope: "FULL_SERIES",
    };
  }
  return {
    scanReport,
    bundlesBySymbol:
      Object.keys(bundlesBySymbol).length > 0 ? bundlesBySymbol : undefined,
  };
}
