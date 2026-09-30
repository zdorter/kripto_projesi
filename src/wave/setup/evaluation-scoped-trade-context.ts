import type { Candle, WaveEngineOptions } from "../types";
import {
  compareWaveScanResults,
  runWaveScan,
  type WaveScanReport,
} from "../wave-scanner";
import { resolveTradeSetupEvaluationBoundary } from "./trade-setup-evaluation-bar";
import {
  buildSymbolEvaluationBundle,
  buildSymbolEvaluationBundleAtEvaluationBar,
} from "./trade-setup-context";
import type {
  SymbolEvaluationBundle,
  TradeSetupEvaluationContext,
  TradeSetupSymbolBuildInput,
} from "./trade-setup-types";

export function buildEvaluationScopedWaveScanReport(
  baseReport: WaveScanReport,
  symbols: Record<string, TradeSetupSymbolBuildInput>,
  engineOptions?: WaveEngineOptions
): WaveScanReport {
  const results: typeof baseReport.results = [];
  const errors = [...baseReport.errors];

  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly,
    });
    if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
      continue;
    }
    try {
      const effective = input.candles.slice(0, boundary.evaluationBarIndex + 1);
      const symbolReport = runWaveScan(
        [{ symbol, candles: effective }],
        {
          timeframe: baseReport.timeframe,
          engineOptions,
        }
      );
      results.push(...symbolReport.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, timeframe: baseReport.timeframe, message });
    }
  }

  const sorted = [...results].sort(compareWaveScanResults);
  return {
    ...baseReport,
    results: sorted,
    scenarioCount: sorted.length,
    errors,
  };
}

export function buildTradeSetupEvaluationContextWithScopedAnalysis(
  scanReport: WaveScanReport,
  symbols: Record<string, TradeSetupSymbolBuildInput>,
  engineOptions?: WaveEngineOptions
): TradeSetupEvaluationContext {
  const bundlesBySymbol: Record<string, SymbolEvaluationBundle> = {};
  let anyScoped = false;

  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly,
    });
    if (boundary.boundaryEstablished && boundary.evaluationBarIndex >= 0) {
      anyScoped = true;
      bundlesBySymbol[symbol] = {
        ...buildSymbolEvaluationBundleAtEvaluationBar(
          input.candles,
          scanReport.timeframe,
          {
            evaluationBarIndex: input.evaluationBarIndex,
            closedSeriesOnly: input.closedSeriesOnly,
          },
          engineOptions
        ),
        evaluationAnalysisScope: "EVALUATION_SCOPED",
      };
    } else {
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
  }

  const scopedScan = anyScoped
    ? buildEvaluationScopedWaveScanReport(scanReport, symbols, engineOptions)
    : scanReport;

  return {
    scanReport: scopedScan,
    bundlesBySymbol:
      Object.keys(bundlesBySymbol).length > 0 ? bundlesBySymbol : undefined,
  };
}

export function effectiveCandlesForSymbol(
  candles: Candle[],
  bundle: SymbolEvaluationBundle
): Candle[] {
  if (bundle.evaluationBarIndex < 0) {
    return candles;
  }
  return candles.slice(0, bundle.evaluationBarIndex + 1);
}
