import { BinanceFuturesOhlcvProvider } from "../providers/binance-ohlcv";
import { runProductionWaveScanner } from "../wave/production-wave-scanner";
import { DEFAULT_WATCHLIST_SYMBOLS } from "./default-watchlist";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "./demo-ohlcv";
import {
  renderWaveScannerReport,
  setScannerLoading,
  updateScannerSourceBanner,
} from "./wave-scanner-page";
import {
  initWaveScannerAlarmUi,
  renderWaveScannerAlarmList,
  setAlarmFeedback,
} from "./wave-scanner-alarm-ui";
import { WaveScannerAlarmMonitor } from "./wave-scanner-alarm-monitor";
import type { WaveScannerAlarmSourceMode } from "./crypto-dashboard-alarm-types";

const SCANNER_TIMEFRAME = "1H";
const BINANCE_INTERVAL = "1h";
const BINANCE_LIMIT = 500;

const provider = new BinanceFuturesOhlcvProvider();

const alarmMonitor = new WaveScannerAlarmMonitor((alert, desc) => {
  setAlarmFeedback(`Alarm: ${alert.name} — ${desc}`);
});

function getDataSource(): "DEMO" | "BINANCE" {
  const select = document.getElementById("data-source") as HTMLSelectElement | null;
  return select?.value === "BINANCE" ? "BINANCE" : "DEMO";
}

function getSourceMode(): WaveScannerAlarmSourceMode {
  return getDataSource() === "DEMO" ? "DEMO" : "LIVE";
}

async function fetchClosedCandles(symbol: string) {
  return provider.getCandles(symbol, BINANCE_INTERVAL, BINANCE_LIMIT);
}

export async function loadAndRenderWaveScanner(): Promise<void> {
  setScannerLoading(true);
  const source = getDataSource();
  updateScannerSourceBanner(source);
  try {
    const candlesBySymbol: Record<string, typeof DEMO_OHLCV> = {};
    const liveErrors: string[] = [];

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
          liveErrors.push(`${symbol}: ${message}`);
          candlesBySymbol[symbol] = [];
        }
      }
      const loaded = DEFAULT_WATCHLIST_SYMBOLS.filter(
        (s) => (candlesBySymbol[s]?.length ?? 0) > 0
      );
      if (loaded.length === 0) {
        const statusEl = document.getElementById("scanner-status");
        if (statusEl) {
          statusEl.textContent =
            "LIVE veri alınamadı (Binance REST / CORS / ağ). Demo moduna otomatik geçilmedi.";
        }
        return;
      }
      if (liveErrors.length > 0) {
        const statusEl = document.getElementById("scanner-status");
        if (statusEl) {
          statusEl.textContent = `LIVE kısmi hata: ${liveErrors.join("; ")}`;
        }
      }
    }

    const report = runProductionWaveScanner({
      symbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      candlesBySymbol,
      timeframeId: SCANNER_TIMEFRAME,
      engineOptions: source === "DEMO" ? DEMO_WAVE_ENGINE_OPTIONS : undefined,
    });
    renderWaveScannerReport(
      report,
      source === "DEMO" ? { demoRepresentativeSymbol: "BTCUSDT" } : undefined
    );
  } finally {
    setScannerLoading(false);
  }
}

let uiBound = false;

function bindUi(): void {
  if (uiBound) {
    return;
  }
  uiBound = true;
  initWaveScannerAlarmUi({
    getSourceMode,
    getMonitor: () => alarmMonitor,
    onStoreChanged: () => renderWaveScannerAlarmList(alarmMonitor),
  });

  document.getElementById("scanner-refresh")?.addEventListener("click", () => {
    void loadAndRenderWaveScanner();
  });
  document.getElementById("data-source")?.addEventListener("change", () => {
    void loadAndRenderWaveScanner();
  });
  window.addEventListener("beforeunload", () => {
    alarmMonitor.stop();
  });
}

bindUi();
void alarmMonitor.reloadStore().then(() => {
  renderWaveScannerAlarmList(alarmMonitor);
  alarmMonitor.start(4000);
});
void loadAndRenderWaveScanner();
