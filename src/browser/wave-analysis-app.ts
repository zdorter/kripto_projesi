import {
  analyzeMultiTimeframe,
  analyzeWaveWithDiagnostics,
  buildCandidateWaveHierarchy,
  buildWaveStabilityFromCalibration,
  runSwingCalibration,
} from "../wave/index";
import { BinanceFuturesOhlcvProvider } from "../providers/binance-ohlcv";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "./demo-ohlcv";
import {
  renderMultiTimeframe,
  renderSwingCalibration,
  renderWaveAnalysis,
  renderWaveHierarchy,
  renderWaveStability,
  type WaveAnalysisRenderMeta,
} from "./wave-analysis-page";

function renderMtfAndHierarchy(
  higherCandles: typeof DEMO_OHLCV,
  lowerCandles: typeof DEMO_OHLCV,
  symbol?: string
): void {
  const demoOpts =
    symbol === "MOCK"
      ? {
          higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
          lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        }
      : {};
  const mtf = analyzeMultiTimeframe(higherCandles, lowerCandles, undefined, {
    symbol,
    ...demoOpts,
  });
  renderMultiTimeframe(mtf);
  renderWaveHierarchy(
    buildCandidateWaveHierarchy(mtf, higherCandles, lowerCandles)
  );
}

function renderCalibrationAndStability(candles: typeof DEMO_OHLCV): void {
  const calibration = runSwingCalibration(candles);
  renderSwingCalibration(calibration);
  renderWaveStability(buildWaveStabilityFromCalibration(calibration, candles));
}

const BINANCE_SYMBOL = "BTCUSDT";
const BINANCE_INTERVAL = "1h";
const BINANCE_INTERVAL_LOWER = "15m";
const BINANCE_LIMIT = 500;

const binanceProvider = new BinanceFuturesOhlcvProvider();

function setBanner(text: string): void {
  const el = document.getElementById("data-banner");
  if (el) {
    el.textContent = text;
  }
}

function setStatus(message: string, isError = false): void {
  const el = document.getElementById("load-status");
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.color = isError ? "#f07178" : "";
}

function getDataSource(): "DEMO" | "BINANCE" {
  const select = document.getElementById("data-source") as HTMLSelectElement | null;
  return select?.value === "BINANCE" ? "BINANCE" : "DEMO";
}

export async function loadAndRenderWaveAnalysis(): Promise<void> {
  const source = getDataSource();

  if (source === "DEMO") {
    setBanner("DEMO · deterministic mock OHLCV");
    setStatus("");
    const { analysis, presentation, diagnostics } = analyzeWaveWithDiagnostics(
      DEMO_OHLCV,
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const meta: WaveAnalysisRenderMeta = {
      dataSource: "DEMO",
      symbol: "MOCK",
      timeframe: "SYNTHETIC",
      candleCount: DEMO_OHLCV.length,
    };
    renderWaveAnalysis(analysis, presentation, meta, diagnostics);
    renderCalibrationAndStability(DEMO_OHLCV);
    renderMtfAndHierarchy(DEMO_OHLCV, DEMO_OHLCV, "MOCK");
    return;
  }

  setBanner(
    `${BINANCE_SYMBOL} · 1H primary + 1H/15M multi-timeframe · LIVE REST`
  );
  setStatus("Loading...");

  try {
    const [candles, candles15m] = await Promise.all([
      binanceProvider.getCandles(
        BINANCE_SYMBOL,
        BINANCE_INTERVAL,
        BINANCE_LIMIT
      ),
      binanceProvider.getCandles(
        BINANCE_SYMBOL,
        BINANCE_INTERVAL_LOWER,
        BINANCE_LIMIT
      ),
    ]);
    const { analysis, presentation, diagnostics } =
      analyzeWaveWithDiagnostics(candles);
    const meta: WaveAnalysisRenderMeta = {
      dataSource: "BINANCE_FUTURES_REST",
      symbol: BINANCE_SYMBOL,
      timeframe: "1H",
      candleCount: candles.length,
    };
    setStatus("");
    renderWaveAnalysis(analysis, presentation, meta, diagnostics);
    renderCalibrationAndStability(candles);
    renderMtfAndHierarchy(candles, candles15m, BINANCE_SYMBOL);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load Binance OHLCV: ${message}`, true);
    throw err;
  }
}

function bindDataSourceSelect(): void {
  const select = document.getElementById("data-source");
  select?.addEventListener("change", () => {
    void loadAndRenderWaveAnalysis();
  });
}

bindDataSourceSelect();
void loadAndRenderWaveAnalysis();
