import { BinanceFuturesOhlcvProvider } from "../providers/binance-ohlcv";
import { runProductionWaveScanner } from "../wave/production-wave-scanner";
import { DEFAULT_WATCHLIST_SYMBOLS } from "./default-watchlist";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "./demo-ohlcv";
import {
  renderWaveScannerReport,
  setScannerLoading,
} from "./wave-scanner-page";

const SCANNER_TIMEFRAME = "1H";
const BINANCE_INTERVAL = "1h";
const BINANCE_LIMIT = 500;

const provider = new BinanceFuturesOhlcvProvider();

function getDataSource(): "DEMO" | "BINANCE" {
  const select = document.getElementById("data-source") as HTMLSelectElement | null;
  return select?.value === "BINANCE" ? "BINANCE" : "DEMO";
}

async function fetchClosedCandles(symbol: string) {
  return provider.getCandles(symbol, BINANCE_INTERVAL, BINANCE_LIMIT);
}

export async function loadAndRenderWaveScanner(): Promise<void> {
  setScannerLoading(true);
  try {
    const source = getDataSource();
    const candlesBySymbol: Record<string, typeof DEMO_OHLCV> = {};

    if (source === "DEMO") {
      for (const symbol of DEFAULT_WATCHLIST_SYMBOLS) {
        candlesBySymbol[symbol] = DEMO_OHLCV;
      }
    } else {
      for (const symbol of DEFAULT_WATCHLIST_SYMBOLS) {
        try {
          candlesBySymbol[symbol] = await fetchClosedCandles(symbol);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          candlesBySymbol[symbol] = [];
          console.warn(`Wave scanner: ${symbol} failed`, message);
        }
      }
    }

    const report = runProductionWaveScanner({
      symbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      candlesBySymbol,
      timeframeId: SCANNER_TIMEFRAME,
      engineOptions: source === "DEMO" ? DEMO_WAVE_ENGINE_OPTIONS : undefined,
    });
    renderWaveScannerReport(report);
  } finally {
    setScannerLoading(false);
  }
}

function bindUi(): void {
  const refresh = document.getElementById("scanner-refresh");
  refresh?.addEventListener("click", () => {
    void loadAndRenderWaveScanner();
  });
  const source = document.getElementById("data-source");
  source?.addEventListener("change", () => {
    void loadAndRenderWaveScanner();
  });
}

bindUi();
void loadAndRenderWaveScanner();
