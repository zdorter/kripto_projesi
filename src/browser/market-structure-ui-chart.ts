import type { Candle } from "../wave/types";
import type {
  ChartOverlayMarkerV1,
  ChartOverlayPriceLineV1,
  ChartOverlayVisibilityV1,
  MarketStructureChartOverlayProjectionV1,
} from "../wave/market-structure/market-structure-chart-overlay-types";
import {
  cullStructureLabelMarkersForViewport,
  prioritizePriceLinesNearPrice,
} from "../wave/market-structure/market-structure-chart-overlay";

declare global {
  interface Window {
    LightweightCharts?: {
      createChart: (
        container: HTMLElement,
        options: Record<string, unknown>
      ) => LwcChart;
      CrosshairMode: { Normal: number };
    };
  }
}

interface LwcChart {
  addCandlestickSeries: (options: Record<string, unknown>) => LwcCandleSeries;
  timeScale: () => {
    fitContent: () => void;
    timeToCoordinate: (time: LwcTime) => number | null;
    subscribeVisibleTimeRangeChange: (cb: () => void) => void;
  };
  subscribeCrosshairMove: (
    cb: (param: { time?: LwcTime; point?: { x: number; y: number } }) => void
  ) => void;
  remove: () => void;
  resize: (w: number, h: number) => void;
}

interface LwcCandleSeries {
  setData: (data: LwcCandle[]) => void;
  setMarkers: (markers: LwcMarker[]) => void;
  createPriceLine: (options: Record<string, unknown>) => { applyOptions: (o: unknown) => void };
}

type LwcTime = number;
type LwcCandle = {
  time: LwcTime;
  open: number;
  high: number;
  low: number;
  close: number;
};

type LwcMarker = {
  time: LwcTime;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text?: string;
};

export interface MarketStructureUiChartVisibility extends ChartOverlayVisibilityV1 {}

const COLORS = {
  structure: "#8b98a8",
  protected: "#5b9cf5",
  breakUp: "#26a69a",
  breakDown: "#ef5350",
  liquidity: "#c9a227",
  htfLiquidity: "#9b87f5",
  mss: "#7c8699",
  touch: "#8b98a8",
  sweep: "#e8b84a",
  taken: "#ef5350",
  reclaim: "#5b9cf5",
  evalLine: "#9b87f5",
};

let chart: LwcChart | null = null;
let candleSeries: LwcCandleSeries | null = null;
let evalCanvas: HTMLCanvasElement | null = null;
let priceLineHandles: ReturnType<LwcCandleSeries["createPriceLine"]>[] = [];
let lastProjection: MarketStructureChartOverlayProjectionV1 | null = null;
let lastVisibility: MarketStructureUiChartVisibility | null = null;
let lastCandles: readonly Candle[] = [];

function lwcTimeMsToSec(timeMs: number): LwcTime {
  return Math.floor(timeMs / 1000);
}

function candleToLwc(c: Candle): LwcCandle {
  return {
    time: lwcTimeMsToSec(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function ensureChart(container: HTMLElement, overlayCanvasHost: HTMLElement): void {
  if (chart && candleSeries) {
    return;
  }
  const LWC = window.LightweightCharts;
  if (!LWC) {
    throw new Error("LightweightCharts not loaded");
  }
  chart = LWC.createChart(container, {
    layout: {
      background: { color: "#1a222d" },
      textColor: "#8b98a8",
    },
    grid: {
      vertLines: { color: "#2a3544" },
      horzLines: { color: "#2a3544" },
    },
    crosshair: { mode: LWC.CrosshairMode.Normal },
    rightPriceScale: { borderColor: "#2a3544" },
    timeScale: {
      borderColor: "#2a3544",
      timeVisible: true,
      secondsVisible: false,
    },
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderVisible: false,
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  evalCanvas = document.createElement("canvas");
  evalCanvas.style.position = "absolute";
  evalCanvas.style.left = "0";
  evalCanvas.style.top = "0";
  evalCanvas.style.pointerEvents = "none";
  evalCanvas.style.width = "100%";
  evalCanvas.style.height = "100%";
  overlayCanvasHost.style.position = "relative";
  overlayCanvasHost.appendChild(evalCanvas);

  chart.timeScale().subscribeVisibleTimeRangeChange(() => {
    drawEvalVerticalLine();
  });
}

function clearPriceLines(): void {
  for (const h of priceLineHandles) {
    h.applyOptions({ lineVisible: false, axisLabelVisible: false });
  }
  priceLineHandles = [];
}

function markerColor(m: ChartOverlayMarkerV1): string {
  if (m.category === "BREAK") {
    return m.metadata.direction === "UP" ? COLORS.breakUp : COLORS.breakDown;
  }
  if (m.category === "MSS") {
    return COLORS.mss;
  }
  if (m.category === "LIQUIDITY_EVENT") {
    if (m.kind === "Sweep") return COLORS.sweep;
    if (m.kind === "Taken") return COLORS.taken;
    if (m.kind === "Reclaim") return COLORS.reclaim;
    return COLORS.touch;
  }
  return COLORS.structure;
}

function markerShape(m: ChartOverlayMarkerV1): LwcMarker["shape"] {
  if (m.category === "BREAK") {
    return m.metadata.direction === "UP" ? "arrowUp" : "arrowDown";
  }
  if (m.category === "LIQUIDITY_EVENT") {
    if (m.kind === "Sweep" || m.kind === "Taken") {
      return m.kind === "Taken" ? "arrowDown" : "arrowUp";
    }
    return "circle";
  }
  if (m.kind === "SH" || m.kind === "SL") {
    return "circle";
  }
  return "square";
}

function markerPosition(m: ChartOverlayMarkerV1): LwcMarker["position"] {
  if (m.kind === "SH" || m.metadata.direction === "DOWN") {
    return "aboveBar";
  }
  if (m.kind === "SL" || m.metadata.direction === "UP") {
    return "belowBar";
  }
  return "inBar";
}

function applyVisibilityFilter(
  projection: MarketStructureChartOverlayProjectionV1,
  visibility: MarketStructureUiChartVisibility
): {
  markers: ChartOverlayMarkerV1[];
  priceLines: ChartOverlayPriceLineV1[];
} {
  let markers = [...projection.markers];
  let priceLines = [...projection.priceLines];

  if (!visibility.structure) {
    markers = markers.filter((m) => m.category !== "STRUCTURE");
  }
  if (!visibility.protected) {
    priceLines = priceLines.filter((p) => p.category !== "PROTECTED");
  }
  if (!visibility.breakEvents) {
    markers = markers.filter((m) => m.category !== "BREAK");
    priceLines = priceLines.filter(
      (p) => p.category !== "BREAK" && p.kind !== "BREAK_REFERENCE"
    );
  }
  if (!visibility.liquidity) {
    priceLines = priceLines.filter((p) => p.category !== "LIQUIDITY");
  }
  if (!visibility.liquidityEvents) {
    markers = markers.filter((m) => m.category !== "LIQUIDITY_EVENT");
  }
  if (!visibility.mss) {
    markers = markers.filter((m) => m.category !== "MSS");
  }
  if (!visibility.htfContext) {
    priceLines = priceLines.filter((p) => p.category !== "HTF_CONTEXT");
  }

  const last = lastCandles[lastCandles.length - 1];
  const mid =
    last !== undefined ? (last.high + last.low) / 2 : markers[0]?.price ?? 0;
  priceLines = prioritizePriceLinesNearPrice(priceLines, mid, 120);

  const from = lastCandles[0]?.time ?? 0;
  const to = last?.time ?? from;
  markers = cullStructureLabelMarkersForViewport(markers, from, to, 80);

  return { markers, priceLines };
}

function drawEvalVerticalLine(): void {
  if (!chart || !evalCanvas || !lastProjection?.verticalLines.length) {
    return;
  }
  const wrap = evalCanvas.parentElement;
  if (!wrap) {
    return;
  }
  const rect = wrap.getBoundingClientRect();
  evalCanvas.width = rect.width * devicePixelRatio;
  evalCanvas.height = rect.height * devicePixelRatio;
  const ctx = evalCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, evalCanvas.width, evalCanvas.height);
  const line = lastProjection.verticalLines[0]!;
  const x = chart.timeScale().timeToCoordinate(lwcTimeMsToSec(line.time));
  if (x === null) {
    return;
  }
  ctx.strokeStyle = COLORS.evalLine;
  ctx.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(x * devicePixelRatio, 0);
  ctx.lineTo(x * devicePixelRatio, evalCanvas.height);
  ctx.stroke();
}

export function clearChartOverlay(): void {
  clearPriceLines();
  candleSeries?.setMarkers([]);
  lastProjection = null;
  if (evalCanvas) {
    const ctx = evalCanvas.getContext("2d");
    ctx?.clearRect(0, 0, evalCanvas.width, evalCanvas.height);
  }
}

export function renderChartOverlay(options: {
  container: HTMLElement;
  overlayCanvasHost: HTMLElement;
  statusEl: HTMLElement;
  tooltipEl: HTMLElement;
  candles: readonly Candle[];
  projection: MarketStructureChartOverlayProjectionV1;
  visibility: MarketStructureUiChartVisibility;
}): void {
  const { container, overlayCanvasHost, statusEl, tooltipEl, candles, projection, visibility } =
    options;
  lastCandles = candles;
  lastProjection = projection;
  lastVisibility = visibility;

  if (projection.availability !== "ACTIVE") {
    clearChartOverlay();
    ensureChart(container, overlayCanvasHost);
    candleSeries?.setData(candles.map(candleToLwc));
    chart?.timeScale().fitContent();
    statusEl.textContent = projection.statusMessage ?? projection.availability;
    tooltipEl.textContent = "";
    drawEvalVerticalLine();
    return;
  }

  ensureChart(container, overlayCanvasHost);
  candleSeries!.setData(candles.map(candleToLwc));
  clearPriceLines();

  const { markers, priceLines } = applyVisibilityFilter(projection, visibility);

  const lwcMarkers: LwcMarker[] = markers.map((m) => ({
    time: lwcTimeMsToSec(m.time),
    position: markerPosition(m),
    color: markerColor(m),
    shape: markerShape(m),
    text: m.label.length <= 6 ? m.label : undefined,
  }));
  candleSeries!.setMarkers(lwcMarkers);

  for (const pl of priceLines) {
    const color =
      pl.category === "PROTECTED"
        ? COLORS.protected
        : pl.category === "HTF_CONTEXT"
          ? COLORS.htfLiquidity
          : pl.category === "BREAK"
            ? COLORS.structure
            : COLORS.liquidity;
    const handle = candleSeries!.createPriceLine({
      price: pl.price,
      color,
      lineWidth: pl.kind === "BREAK_REFERENCE" ? 1 : 2,
      lineStyle: pl.kind === "BREAK_REFERENCE" ? 2 : 0,
      axisLabelVisible: pl.kind !== "BREAK_REFERENCE",
      title: pl.label,
    });
    priceLineHandles.push(handle);
  }

  statusEl.textContent = projection.verticalLines[0]?.label ?? "";
  chart!.timeScale().fitContent();
  drawEvalVerticalLine();

  chart!.subscribeCrosshairMove((param) => {
    if (!param.time) {
      tooltipEl.textContent = "";
      return;
    }
    const tSec = param.time;
    const match = projection.tooltipItems.find(
      (item) => lwcTimeMsToSec(item.time) === tSec
    );
    if (!match) {
      tooltipEl.textContent = "";
      return;
    }
    tooltipEl.textContent = `${match.label} · ${match.sourceTimeframe} · ${match.price ?? ""}`;
  });
}

export function readChartVisibilityFromDom(): MarketStructureUiChartVisibility {
  const chk = (id: string, fallback: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    return el ? el.checked : fallback;
  };
  return {
    structure: chk("msl-vis-structure", true),
    internalStructureLabels: chk("msl-vis-internal", false),
    protected: chk("msl-vis-protected", true),
    breakEvents: chk("msl-vis-break", true),
    liquidity: chk("msl-vis-liquidity", true),
    liquidityEvents: chk("msl-vis-events", false),
    mss: chk("msl-vis-mss", false),
    htfContext: chk("msl-vis-htf", false),
  };
}

export function getChartTimeframeFromDom(): string {
  const sel = document.getElementById("chart-timeframe") as HTMLSelectElement | null;
  return sel?.value ?? "1H";
}
