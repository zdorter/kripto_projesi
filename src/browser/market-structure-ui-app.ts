import { BinanceFuturesOhlcvProvider } from "../providers/binance-ohlcv";
import { buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource } from "../wave/market-structure/market-structure-descriptive-confluence-surface";
import type { MarketStructureDescriptiveConfluenceSurfaceContext } from "../wave/market-structure/market-structure-descriptive-confluence-surface-types";
import type { MarketStructureChartOverlaySourceV1 } from "../wave/market-structure/market-structure-chart-overlay-types";
import { buildMarketStructureChartOverlayProjection } from "../wave/market-structure/market-structure-chart-overlay";
import type { Candle } from "../wave/types";
import { normalizeTimeframeId } from "../wave/market-structure/market-structure-bar-timestamp";
import {
  getChartTimeframeFromDom,
  readChartVisibilityFromDom,
  renderChartOverlay,
} from "./market-structure-ui-chart";
import {
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
} from "../wave/market-structure/market-structure-descriptive-confluence-surface-types";
import {
  DEFAULT_WATCHLIST_SYMBOLS,
  normalizeWatchlistSymbol,
} from "./default-watchlist";
import { presentMarketStructureUiViewModel } from "./market-structure-ui-presenter";
import {
  renderMarketStructureUiPage,
  setMarketStructureUiLoading,
} from "./market-structure-ui-page";
import {
  buildMarketStructureUiCacheKey,
  closedEvaluationBarIndex,
} from "./market-structure-ui-data";

const BINANCE_INTERVAL = "1h";
const BINANCE_LIMIT = 500;
const SWING_CONFIG = {
  leftBars: 2,
  rightBars: 2,
  atrPeriod: 14,
  minAtrMultiplier: 0.3,
};

const provider = new BinanceFuturesOhlcvProvider();

export { buildMarketStructureUiCacheKey, closedEvaluationBarIndex } from "./market-structure-ui-data";
export type { MarketStructureUiCacheKeyInput } from "./market-structure-ui-data";

interface MarketStructureUiDataBundle {
  surface: MarketStructureDescriptiveConfluenceSurfaceContext;
  chartSource: MarketStructureChartOverlaySourceV1;
  ltfCandles: readonly Candle[];
}

const surfaceCache = new Map<string, MarketStructureUiDataBundle>();
let lastLoadedBundle: MarketStructureUiDataBundle | null = null;

function getDataSource(): "DEMO" | "LIVE" {
  const select = document.getElementById("data-source") as HTMLSelectElement | null;
  return select?.value === "DEMO" ? "DEMO" : "LIVE";
}

function getSymbol(): string {
  const select = document.getElementById("symbol-select") as HTMLSelectElement | null;
  const raw = select?.value ?? DEFAULT_WATCHLIST_SYMBOLS[0];
  return normalizeWatchlistSymbol(raw);
}

export function isReplayRelationsEnabled(): boolean {
  const el = document.getElementById("replay-relations-toggle") as HTMLInputElement | null;
  return el?.checked === true;
}

async function fetchAndBuildSurface(
  symbol: string,
  includeReplay: boolean,
  skipCache: boolean
): Promise<MarketStructureUiDataBundle> {
  const candles = await provider.getCandles(symbol, BINANCE_INTERVAL, BINANCE_LIMIT);
  if (!candles.length) {
    throw new Error("no closed 1H candles returned");
  }
  const evaluationBarIndex = closedEvaluationBarIndex(candles.length);
  const ltfEvalTs = candles[evaluationBarIndex]?.time ?? 0;

  const provisionalKey = buildMarketStructureUiCacheKey({
    symbol,
    schemaVersion: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
    ltfEvalTs,
    ltfLen: candles.length,
    htfSourceTrack: "DERIVED_1H_4H",
    includeReplay,
  });
  if (!skipCache && surfaceCache.has(provisionalKey)) {
    return surfaceCache.get(provisionalKey)!;
  }

  const bundle = buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource({
    timeframeInputs: [
      {
        timeframeId: "1H",
        candles,
        evaluationBarIndex,
      },
    ],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    htfSourceTrack: "DERIVED_1H_4H",
    horizonBars: 24,
    swingConfig: SWING_CONFIG,
    includeReplayRelations: includeReplay,
  });

  const packed: MarketStructureUiDataBundle = {
    surface: bundle.surface,
    chartSource: bundle.chartSource,
    ltfCandles: candles,
  };
  surfaceCache.set(provisionalKey, packed);
  return packed;
}

function renderResearchChart(bundle: MarketStructureUiDataBundle): void {
  const container = document.getElementById("msl-chart");
  const overlayHost = document.getElementById("msl-chart-overlay");
  const statusEl = document.getElementById("msl-chart-status");
  const tooltipEl = document.getElementById("msl-chart-tooltip");
  if (!container || !overlayHost || !statusEl || !tooltipEl) {
    return;
  }

  const chartTf = getChartTimeframeFromDom();
  const visibility = readChartVisibilityFromDom();
  const projection = buildMarketStructureChartOverlayProjection({
    surface: bundle.surface,
    chartSource: bundle.chartSource,
    chartTimeframeId: chartTf,
    visibility,
  });

  const slice = bundle.chartSource.timeframes[normalizeTimeframeId(chartTf)];
  const candles = slice?.candles ?? bundle.ltfCandles;

  renderChartOverlay({
    container,
    overlayCanvasHost: overlayHost,
    statusEl,
    tooltipEl,
    candles,
    projection,
    visibility,
  });
}

export async function loadAndRenderMarketStructureUi(options?: {
  forceRefresh?: boolean;
}): Promise<void> {
  const symbol = getSymbol();
  const dataSource = getDataSource();
  const includeReplay = isReplayRelationsEnabled();
  setMarketStructureUiLoading("Loading…");

  if (dataSource === "DEMO") {
    const vm = presentMarketStructureUiViewModel({
      surface: null,
      symbol,
      dataMode: "DEMO",
      loadStatus: "demo_unavailable",
    });
    renderMarketStructureUiPage(vm);
    return;
  }

  try {
    const bundle = await fetchAndBuildSurface(symbol, includeReplay, options?.forceRefresh === true);
    const vm = presentMarketStructureUiViewModel({
      surface: bundle.surface,
      symbol,
      dataMode: "LIVE",
      loadStatus: "ready",
      includeReplayRelations: includeReplay,
    });
    renderMarketStructureUiPage(vm);
    lastLoadedBundle = bundle;
    renderResearchChart(bundle);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const vm = presentMarketStructureUiViewModel({
      surface: null,
      symbol,
      dataMode: "LIVE",
      loadStatus: "error",
      errorMessage: message,
    });
    renderMarketStructureUiPage(vm);
  }
}

function populateSymbolSelect(): void {
  const select = document.getElementById("symbol-select") as HTMLSelectElement | null;
  if (!select || select.options.length > 0) {
    return;
  }
  for (const sym of DEFAULT_WATCHLIST_SYMBOLS) {
    const opt = document.createElement("option");
    opt.value = sym;
    opt.textContent = sym;
    select.appendChild(opt);
  }
}

let uiBound = false;

function bindUi(): void {
  if (uiBound) {
    return;
  }
  uiBound = true;
  populateSymbolSelect();
  document.getElementById("msl-refresh")?.addEventListener("click", () => {
    void loadAndRenderMarketStructureUi({ forceRefresh: true });
  });
  document.getElementById("data-source")?.addEventListener("change", () => {
    surfaceCache.clear();
    void loadAndRenderMarketStructureUi({ forceRefresh: true });
  });
  document.getElementById("symbol-select")?.addEventListener("change", () => {
    void loadAndRenderMarketStructureUi({ forceRefresh: true });
  });
  document.getElementById("replay-relations-toggle")?.addEventListener("change", () => {
    void loadAndRenderMarketStructureUi({ forceRefresh: true });
  });
  for (const id of [
    "chart-timeframe",
    "msl-vis-structure",
    "msl-vis-internal",
    "msl-vis-protected",
    "msl-vis-break",
    "msl-vis-liquidity",
    "msl-vis-events",
    "msl-vis-mss",
    "msl-vis-htf",
  ]) {
    document.getElementById(id)?.addEventListener("change", () => {
      if (lastLoadedBundle) {
        renderResearchChart(lastLoadedBundle);
      }
    });
  }
}

if (typeof document !== "undefined") {
  bindUi();
  void loadAndRenderMarketStructureUi();
}
