import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../../browser/demo-ohlcv";
import { buildTradeSetupEvaluationContext } from "../../../wave/setup/trade-setup-context";
import { detectSetups } from "../../../wave/setup/setup-detector";
import { buildTradeSetupEvaluationPipeline } from "../../../wave/setup/trade-setup-evaluation-pipeline";
import { runWaveScan } from "../../../wave/wave-scanner";
import {
  impulseContinuationSetup,
  mvpScan,
  mvpSetupReport,
  MVP_ENTRY_CANDLES,
  MVP_TF,
} from "../../../wave/__tests__/fixtures/mvp-e2e-fixtures";
import type { RealMarketValidationRunConfig } from "../../real-market-validation";
import {
  buildRealMarketValidationReport,
  type RealMarketValidationInputs,
} from "../../real-market-validation";

export const FIXTURE_TF = MVP_TF;

export function buildFixtureReportFromMvpCandidates(): ReturnType<
  typeof buildRealMarketValidationReport
> {
  const symbols = ["BTCUSDT", "ETHUSDT"];
  const candidates = [
    impulseContinuationSetup("BTCUSDT", { status: "CONFIRMED" }),
    impulseContinuationSetup("ETHUSDT", {
      status: "CANDIDATE",
      id: "ETHUSDT:1H:impulse-continuation:sc-imp",
    }),
  ];
  const scan = mvpScan(symbols);
  const setupDetection = mvpSetupReport(candidates);
  const candlesBySymbol: Record<string, typeof MVP_ENTRY_CANDLES> = {
    BTCUSDT: MVP_ENTRY_CANDLES,
    ETHUSDT: MVP_ENTRY_CANDLES,
  };
  const tradeContext = {
    scanReport: scan,
    bundlesBySymbol: {
      BTCUSDT: {
        timeframeId: MVP_TF,
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "fixture closedSeriesOnly",
        candleCount: MVP_ENTRY_CANDLES.length,
        diagnostics: { trendSource: { marketTrend: "BULLISH" } } as never,
        presentation: {} as never,
      },
      ETHUSDT: {
        timeframeId: MVP_TF,
        evaluationBarIndex: 2,
        evaluationBarBoundaryEstablished: true,
        evaluationBarContractDetail: "fixture closedSeriesOnly",
        candleCount: MVP_ENTRY_CANDLES.length,
        diagnostics: { trendSource: { marketTrend: "BEARISH" } } as never,
        presentation: {} as never,
      },
    },
  };
  const pipelineReport = buildTradeSetupEvaluationPipeline({
    scanReport: scan,
    tradeContext,
    candlesBySymbol,
    setupDetectionReport: setupDetection,
    objectiveTargetSourceContextBySymbol: {
      BTCUSDT: { diagnostics: tradeContext.bundlesBySymbol.BTCUSDT.diagnostics },
      ETHUSDT: { diagnostics: tradeContext.bundlesBySymbol.ETHUSDT.diagnostics },
    },
  });
  const config: RealMarketValidationRunConfig = {
    symbols,
    interval: "1h",
    limit: 500,
    timeframeId: FIXTURE_TF,
    fetchedAt: "2020-01-01T00:00:00.000Z",
  };
  const input: RealMarketValidationInputs = {
    config,
    candlesBySymbol,
    scanReport: scan,
    tradeContext,
    setupDetection,
    pipelineReport,
  };
  return buildRealMarketValidationReport(input);
}

export function buildFixtureReportFromDemoScan(): ReturnType<
  typeof buildRealMarketValidationReport
> {
  const symbols = ["BTCUSDT"];
  const scan = runWaveScan(
    [{ symbol: "BTCUSDT", candles: DEMO_OHLCV }],
    { timeframe: FIXTURE_TF, engineOptions: DEMO_WAVE_ENGINE_OPTIONS }
  );
  const symbolInputs = {
    BTCUSDT: { candles: DEMO_OHLCV, closedSeriesOnly: true as const },
  };
  const tradeContext = buildTradeSetupEvaluationContext(
    scan,
    symbolInputs,
    DEMO_WAVE_ENGINE_OPTIONS
  );
  const setupDetection = detectSetups({ scanReport: scan, tradeContext });
  const pipelineReport = buildTradeSetupEvaluationPipeline({
    scanReport: scan,
    tradeContext,
    candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    setupDetectionReport: setupDetection,
    objectiveTargetSourceContextBySymbol: {
      BTCUSDT: {
        diagnostics: tradeContext.bundlesBySymbol!.BTCUSDT.diagnostics,
      },
    },
  });
  const config: RealMarketValidationRunConfig = {
    symbols,
    interval: "1h",
    limit: DEMO_OHLCV.length,
    timeframeId: FIXTURE_TF,
    fetchedAt: "2020-01-01T00:00:00.000Z",
  };
  return buildRealMarketValidationReport({
    config,
    candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
    scanReport: scan,
    tradeContext,
    setupDetection,
    pipelineReport,
  });
}
