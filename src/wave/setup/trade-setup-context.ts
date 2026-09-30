import { analyzeWaveWithDiagnostics } from "../analysis-pipeline";
import { analyzeWaveAtEvaluationBar } from "../evaluation-scoped-analysis";
import type { Candle, WaveEngineOptions } from "../types";
import type { WaveScanReport } from "../wave-scanner";
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
    if (
      resolved.boundaryEstablished &&
      resolved.evaluationBarIndex >= 0
    ) {
      return buildSymbolEvaluationBundle(
        candles.slice(0, resolved.evaluationBarIndex + 1),
        timeframeId,
        {
          evaluationBarIndex: resolved.evaluationBarIndex,
          closedSeriesOnly: input.closedSeriesOnly,
        },
        engineOptions
      );
    }
    return buildSymbolEvaluationBundle(candles, timeframeId, input, engineOptions);
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
  const bundlesBySymbol: Record<string, SymbolEvaluationBundle> = {};
  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    bundlesBySymbol[symbol] = buildSymbolEvaluationBundle(
      input.candles,
      scanReport.timeframe,
      {
        evaluationBarIndex: input.evaluationBarIndex,
        closedSeriesOnly: input.closedSeriesOnly,
      },
      engineOptions
    );
  }
  return {
    scanReport,
    bundlesBySymbol:
      Object.keys(bundlesBySymbol).length > 0 ? bundlesBySymbol : undefined,
  };
}
