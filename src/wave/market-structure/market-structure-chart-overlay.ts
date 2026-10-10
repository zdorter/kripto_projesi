import type { Candle } from "../types";
import type { ConfluenceSurfaceTimeframeSurface } from "./market-structure-descriptive-confluence-surface-types";
import type { ClassifiedStructureEvent } from "./market-structure-break-types";
import type { LiquidityInteractionEvent } from "./market-structure-liquidity-interaction-types";
import type { AdvancedLiquidityInteractionEvent } from "./market-structure-liquidity-advanced-interaction-types";
import type { LiquidityPoolCandidate } from "./market-structure-liquidity-types";
import type { ProtectedLevelCandidate } from "./market-structure-types";
import type { MarketStructureMssEvent } from "./market-structure-mss-types";
import { normalizeTimeframeId } from "./market-structure-bar-timestamp";
import {
  CHART_OVERLAY_PROJECTION_RULE_ID,
  CHART_OVERLAY_PROJECTION_SCHEMA_VERSION,
  DEFAULT_CHART_OVERLAY_VISIBILITY_V1,
  type BuildMarketStructureChartOverlayProjectionInput,
  type ChartOverlayMarkerV1,
  type ChartOverlayObjectCategory,
  type ChartOverlayPriceLineV1,
  type ChartOverlayTimeframeSliceV1,
  type ChartOverlayTooltipItemV1,
  type ChartOverlayVerticalLineV1,
  type ChartOverlayVisibilityV1,
  type ChartStructureSpinePointV1,
  type MarketStructureChartOverlayProjectionV1,
} from "./market-structure-chart-overlay-types";

export {
  CHART_OVERLAY_PROJECTION_RULE_ID,
  CHART_OVERLAY_PROJECTION_SCHEMA_VERSION,
  DEFAULT_CHART_OVERLAY_VISIBILITY_V1,
  MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_RULE_ID,
  MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_SCHEMA_VERSION,
} from "./market-structure-chart-overlay-types";

export type {
  BuildMarketStructureChartOverlayProjectionInput,
  ChartOverlayMarkerV1,
  ChartOverlayPriceLineV1,
  ChartOverlayTimeframeSliceV1,
  ChartOverlayTooltipItemV1,
  ChartOverlayVerticalLineV1,
  ChartOverlayVisibilityV1,
  ChartStructureSpinePointV1,
  MarketStructureChartOverlayProjectionV1,
  MarketStructureChartOverlaySourceV1,
} from "./market-structure-chart-overlay-types";

const RESEARCH_FLAGS = [
  "research_only",
  "chart_overlay_projection",
  "descriptive_visualization_only",
  "no_production_signal",
  "no_causality",
  "no_prediction",
  "no_scoring",
] as const;

const V1_CHART_TIMEFRAMES = new Set(["1H", "4H"]);
const NOT_ESTABLISHED_CHART_TIMEFRAMES = new Set(["15M"]);

const FORBIDDEN_LABEL_TOKENS = [
  "BUY",
  "SELL",
  "LONG",
  "SHORT",
  "ENTRY",
  "EXIT",
] as const;

export function formatChartEvalUtcLabel(evaluationTimestampMs: number): string {
  const d = new Date(evaluationTimestampMs);
  const iso = d.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `Eval @ ${date} ${time} UTC`;
}

function mergeVisibility(partial?: Partial<ChartOverlayVisibilityV1>): ChartOverlayVisibilityV1 {
  return { ...DEFAULT_CHART_OVERLAY_VISIBILITY_V1, ...partial };
}

function barTime(candles: readonly Candle[], barIndex: number): number | null {
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= candles.length) {
    return null;
  }
  return candles[barIndex]!.time;
}

export function passesClosedContextClip(
  evaluationBarIndex: number,
  triggerBarIndex?: number,
  knownAtBarIndex?: number
): boolean {
  if (triggerBarIndex !== undefined && triggerBarIndex > evaluationBarIndex) {
    return false;
  }
  if (knownAtBarIndex !== undefined && knownAtBarIndex > evaluationBarIndex) {
    return false;
  }
  return true;
}

function findTfSurface(
  surfaces: readonly ConfluenceSurfaceTimeframeSurface[],
  timeframeId: string
): ConfluenceSurfaceTimeframeSurface | undefined {
  const want = normalizeTimeframeId(timeframeId);
  return surfaces.find((s) => normalizeTimeframeId(s.timeframeId) === want);
}

function meta(
  entries: Record<string, string | number | boolean | null>
): Readonly<Record<string, string | number | boolean | null>> {
  return Object.freeze({ ...entries });
}

function pushTooltip(
  out: ChartOverlayTooltipItemV1[],
  item: ChartOverlayTooltipItemV1
): void {
  out.push(item);
}

function breakLabel(ev: ClassifiedStructureEvent): string {
  const dir = ev.direction === "UP" ? "UP" : "DOWN";
  return ev.eventType === "BOS" ? `BOS ${dir}` : `CHoCH ${dir}`;
}

function mssLabel(ev: MarketStructureMssEvent): string {
  const dir = ev.breakDirection === "UP" ? "UP" : "DOWN";
  return `MSS ${dir}`;
}

function poolKindShort(kind: LiquidityPoolCandidate["poolKind"]): string {
  switch (kind) {
    case "SINGLE_HIGH":
      return "BSL";
    case "SINGLE_LOW":
      return "SSL";
    case "EQH_CLUSTER":
      return "EQH";
    case "EQL_CLUSTER":
      return "EQL";
    default:
      return kind;
  }
}

function assertNoForbiddenTradingLabels(projection: MarketStructureChartOverlayProjectionV1): void {
  const blob = JSON.stringify(projection);
  for (const token of FORBIDDEN_LABEL_TOKENS) {
    if (blob.includes(`"${token}"`) || blob.includes(` ${token} `)) {
      throw new Error(`forbidden trading label token: ${token}`);
    }
  }
}

function addSpineMarkers(
  markers: ChartOverlayMarkerV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  slice: ChartOverlayTimeframeSliceV1,
  visibility: ChartOverlayVisibilityV1,
  category: ChartOverlayObjectCategory
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;
  const external = slice.externalSpine;
  const internal = slice.internalSpine;

  const addPoint = (p: ChartStructureSpinePointV1, layer: "external" | "internal") => {
    if (!passesClosedContextClip(E, undefined, p.knownAtBarIndex)) {
      return;
    }
    if (p.confirmationBarIndex > E) {
      return;
    }
    const isHigh = p.swingType === "HIGH";
    const shSlKind = isHigh ? "SH" : "SL";
    const shSlId = `structure:${tf}:${layer}:pivot:${p.pivotIndex}:${shSlKind}`;
    markers.push({
      id: shSlId,
      category,
      kind: shSlKind,
      time: p.time,
      price: p.price,
      label: shSlKind,
      sourceTimeframe: tf,
      metadata: meta({
        pivotIndex: p.pivotIndex,
        scope: p.scope,
        structureLabel: p.structureLabel,
        layer,
      }),
    });
    pushTooltip(tooltip, {
      id: shSlId,
      category,
      kind: shSlKind,
      label: shSlKind,
      time: p.time,
      price: p.price,
      sourceTimeframe: tf,
      metadata: meta({
        pivotIndex: p.pivotIndex,
        scope: p.scope,
        structureLabel: p.structureLabel,
      }),
    });

    const label = p.structureLabel;
    const showLabel =
      layer === "external" ||
      (layer === "internal" && visibility.internalStructureLabels);
    if (
      showLabel &&
      label !== "UNKNOWN" &&
      (label === "HH" || label === "HL" || label === "LH" || label === "LL")
    ) {
      const labelId = `structure:${tf}:${layer}:label:${p.pivotIndex}:${label}`;
      markers.push({
        id: labelId,
        category,
        kind: label,
        time: p.time,
        price: p.price,
        label,
        sourceTimeframe: tf,
        metadata: meta({
          pivotIndex: p.pivotIndex,
          scope: p.scope,
          compact: true,
          layer,
        }),
      });
      pushTooltip(tooltip, {
        id: labelId,
        category,
        kind: label,
        label,
        time: p.time,
        price: p.price,
        sourceTimeframe: tf,
        metadata: meta({ pivotIndex: p.pivotIndex, scope: p.scope }),
      });
    }
  };

  if (visibility.structure) {
    for (const p of external) {
      addPoint(p, "external");
    }
    if (visibility.internalStructureLabels) {
      for (const p of internal) {
        addPoint(p, "internal");
      }
    }
  }
}

function addProtectedLines(
  priceLines: ChartOverlayPriceLineV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  slice: ChartOverlayTimeframeSliceV1,
  category: ChartOverlayObjectCategory,
  highIndex: number,
  lowIndex: number
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;
  const candles = slice.candles;

  const addOne = (
    c: ProtectedLevelCandidate,
    side: "HIGH" | "LOW",
    ordinal: number
  ) => {
    if (
      !passesClosedContextClip(
        E,
        undefined,
        c.protectedStatusKnownAtBarIndex
      )
    ) {
      return;
    }
    const t = barTime(candles, c.pivotIndex) ?? 0;
    const label =
      side === "HIGH"
        ? `Protected High #${ordinal}`
        : `Protected Low #${ordinal}`;
    const id = `protected:${tf}:${side}:${c.pivotIndex}:${ordinal}`;
    priceLines.push({
      id,
      category,
      kind: side === "HIGH" ? "PROTECTED_HIGH" : "PROTECTED_LOW",
      price: c.price,
      label,
      sourceTimeframe: tf,
      metadata: meta({
        pivotIndex: c.pivotIndex,
        statusAtE: c.statusAtE,
        ordinal,
      }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind: side === "HIGH" ? "PROTECTED_HIGH" : "PROTECTED_LOW",
      label,
      time: t,
      price: c.price,
      sourceTimeframe: tf,
      metadata: meta({ pivotIndex: c.pivotIndex, statusAtE: c.statusAtE }),
    });
  };

  tfSurface.protected.protectedHighs.forEach((c, i) =>
    addOne(c, "HIGH", highIndex + i + 1)
  );
  tfSurface.protected.protectedLows.forEach((c, i) =>
    addOne(c, "LOW", lowIndex + i + 1)
  );
}

function addBreakMarkers(
  markers: ChartOverlayMarkerV1[],
  priceLines: ChartOverlayPriceLineV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  slice: ChartOverlayTimeframeSliceV1,
  category: ChartOverlayObjectCategory
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;
  const candles = slice.candles;
  const events = [
    ...tfSurface.structure.bosEvents,
    ...tfSurface.structure.chochEvents,
  ];

  for (const ev of events) {
    if (!passesClosedContextClip(E, ev.triggerBarIndex, ev.knownAtBarIndex)) {
      continue;
    }
    const t = barTime(candles, ev.triggerBarIndex);
    if (t === null) {
      continue;
    }
    const label = breakLabel(ev);
    const id = `break:${tf}:${ev.eventId}`;
    markers.push({
      id,
      category,
      kind: ev.eventType,
      time: t,
      price: ev.referencePrice,
      label,
      sourceTimeframe: tf,
      metadata: meta({
        eventId: ev.eventId,
        direction: ev.direction,
        triggerBarIndex: ev.triggerBarIndex,
        referencePrice: ev.referencePrice,
      }),
    });
    priceLines.push({
      id: `${id}:ref`,
      category,
      kind: "BREAK_REFERENCE",
      price: ev.referencePrice,
      label: `${label} ref`,
      sourceTimeframe: tf,
      metadata: meta({
        eventId: ev.eventId,
        referencePrice: ev.referencePrice,
        shortReference: true,
      }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind: ev.eventType,
      label,
      time: t,
      price: ev.referencePrice,
      sourceTimeframe: tf,
      metadata: meta({ eventId: ev.eventId, direction: ev.direction }),
    });
  }
}

function addLiquidityPools(
  priceLines: ChartOverlayPriceLineV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  slice: ChartOverlayTimeframeSliceV1,
  category: ChartOverlayObjectCategory
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;
  const seen = new Set<string>();
  const lifecycleByPool = new Map(
    tfSurface.events.lifecycleProjections.map((l) => [l.poolId, l.phase])
  );

  for (const pool of tfSurface.liquidity.liquidityPools) {
    if (!passesClosedContextClip(E, undefined, pool.knownAtBarIndex)) {
      continue;
    }
    if (seen.has(pool.poolId)) {
      continue;
    }
    seen.add(pool.poolId);
    const kind = poolKindShort(pool.poolKind);
    const band = pool.priceBand;
    const id = `liquidity:${tf}:${pool.poolId}`;
    priceLines.push({
      id,
      category,
      kind,
      price: pool.price,
      priceBandHigh: band?.upperBound,
      priceBandLow: band?.lowerBound,
      label: kind,
      sourceTimeframe: tf,
      metadata: meta({
        poolId: pool.poolId,
        poolKind: pool.poolKind,
        memberCount: pool.memberCount,
      }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind,
      label: kind,
      time: slice.evaluationTimestamp,
      price: pool.price,
      sourceTimeframe: tf,
      metadata: meta({
        poolId: pool.poolId,
        lifecyclePhase: lifecycleByPool.get(pool.poolId) ?? null,
      }),
    });
  }
}

function addLiquidityEvents(
  markers: ChartOverlayMarkerV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  slice: ChartOverlayTimeframeSliceV1,
  category: ChartOverlayObjectCategory
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;

  const touchEvents: readonly LiquidityInteractionEvent[] = tfSurface.events.wickTouches;
  for (const ev of touchEvents) {
    if (!passesClosedContextClip(E, ev.triggerBarIndex, ev.knownAtBarIndex)) {
      continue;
    }
    const id = `liq-event:${tf}:${ev.eventId}`;
    markers.push({
      id,
      category,
      kind: "Touch",
      time: ev.triggerTimestamp,
      price: ev.referencePrice,
      label: "Touch",
      sourceTimeframe: tf,
      metadata: meta({ eventId: ev.eventId, poolId: ev.poolId }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind: "Touch",
      label: "Touch",
      time: ev.triggerTimestamp,
      price: ev.referencePrice,
      sourceTimeframe: tf,
      metadata: meta({ poolId: ev.poolId, eventId: ev.eventId }),
    });
  }

  const advanced: readonly AdvancedLiquidityInteractionEvent[] =
    tfSurface.events.advancedEvents;
  for (const ev of advanced) {
    if (!passesClosedContextClip(E, ev.triggerBarIndex, ev.knownAtBarIndex)) {
      continue;
    }
    const kind =
      ev.eventType === "LIQUIDITY_SWEEP"
        ? "Sweep"
        : ev.eventType === "LIQUIDITY_TAKEN"
          ? "Taken"
          : "Reclaim";
    const id = `liq-event:${tf}:${ev.eventId}`;
    markers.push({
      id,
      category,
      kind,
      time: ev.triggerTimestamp,
      price: ev.referencePrice,
      label: kind,
      sourceTimeframe: tf,
      metadata: meta({ eventId: ev.eventId, poolId: ev.poolId }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind,
      label: kind,
      time: ev.triggerTimestamp,
      price: ev.referencePrice,
      sourceTimeframe: tf,
      metadata: meta({ poolId: ev.poolId, eventId: ev.eventId }),
    });
  }
}

function addMssMarkers(
  markers: ChartOverlayMarkerV1[],
  tooltip: ChartOverlayTooltipItemV1[],
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  slice: ChartOverlayTimeframeSliceV1,
  category: ChartOverlayObjectCategory
): void {
  const E = slice.evaluationBarIndex;
  const tf = slice.timeframeId;
  const candles = slice.candles;

  for (const ev of tfSurface.mss.events) {
    if (!passesClosedContextClip(E, ev.triggerBarIndex, ev.knownAtBarIndex)) {
      continue;
    }
    const t = barTime(candles, ev.triggerBarIndex);
    if (t === null) {
      continue;
    }
    const label = mssLabel(ev);
    const id = `mss:${tf}:${ev.eventId}`;
    markers.push({
      id,
      category,
      kind: "MSS",
      time: t,
      price: ev.referencePrice,
      label,
      sourceTimeframe: tf,
      metadata: meta({
        eventId: ev.eventId,
        mssDirection: ev.mssDirection,
        breakDirection: ev.breakDirection,
      }),
    });
    pushTooltip(tooltip, {
      id,
      category,
      kind: "MSS",
      label,
      time: t,
      price: ev.referencePrice,
      sourceTimeframe: tf,
      metadata: meta({ eventId: ev.eventId }),
    });
  }
}

function buildActiveProjection(
  chartTf: string,
  visibility: ChartOverlayVisibilityV1,
  slice: ChartOverlayTimeframeSliceV1,
  tfSurface: ConfluenceSurfaceTimeframeSurface,
  htfSurface: ConfluenceSurfaceTimeframeSurface | undefined,
  htfSlice: ChartOverlayTimeframeSliceV1 | undefined
): MarketStructureChartOverlayProjectionV1 {
  const markers: ChartOverlayMarkerV1[] = [];
  const priceLines: ChartOverlayPriceLineV1[] = [];
  const tooltipItems: ChartOverlayTooltipItemV1[] = [];
  const verticalLines: ChartOverlayVerticalLineV1[] = [
    {
      id: `eval:${chartTf}:${slice.evaluationBarIndex}`,
      category: "EVALUATION",
      time: slice.evaluationTimestamp,
      label: formatChartEvalUtcLabel(slice.evaluationTimestamp),
      sourceTimeframe: chartTf,
    },
  ];

  const primaryCategory: ChartOverlayObjectCategory = "STRUCTURE";
  if (visibility.structure) {
    addSpineMarkers(markers, tooltipItems, slice, visibility, primaryCategory);
  }
  if (visibility.protected) {
    addProtectedLines(
      priceLines,
      tooltipItems,
      tfSurface,
      slice,
      "PROTECTED",
      0,
      0
    );
  }
  if (visibility.breakEvents) {
    addBreakMarkers(
      markers,
      priceLines,
      tooltipItems,
      tfSurface,
      slice,
      "BREAK"
    );
  }
  if (visibility.liquidity) {
    addLiquidityPools(priceLines, tooltipItems, tfSurface, slice, "LIQUIDITY");
  }
  if (visibility.liquidityEvents) {
    addLiquidityEvents(markers, tooltipItems, tfSurface, slice, "LIQUIDITY_EVENT");
  }
  if (visibility.mss) {
    addMssMarkers(markers, tooltipItems, tfSurface, slice, "MSS");
  }

  if (visibility.htfContext && htfSurface && htfSlice && chartTf === "1H") {
    addProtectedLines(
      priceLines,
      tooltipItems,
      htfSurface,
      htfSlice,
      "HTF_CONTEXT",
      0,
      0
    );
    addLiquidityPools(
      priceLines,
      tooltipItems,
      htfSurface,
      htfSlice,
      "HTF_CONTEXT"
    );
  }

  const projection: MarketStructureChartOverlayProjectionV1 = {
    schemaVersion: CHART_OVERLAY_PROJECTION_SCHEMA_VERSION,
    ruleId: CHART_OVERLAY_PROJECTION_RULE_ID,
    chartTimeframeId: chartTf,
    availability: "ACTIVE",
    evaluationBarIndex: slice.evaluationBarIndex,
    evaluationTimestamp: slice.evaluationTimestamp,
    markers: Object.freeze(markers),
    priceLines: Object.freeze(priceLines),
    verticalLines: Object.freeze(verticalLines),
    tooltipItems: Object.freeze(tooltipItems),
    visibilityDefaults: visibility,
    researchFlags: [...RESEARCH_FLAGS],
  };

  assertNoForbiddenTradingLabels(projection);
  return projection;
}

function emptyProjection(
  chartTf: string,
  availability: MarketStructureChartOverlayProjectionV1["availability"],
  statusMessage: string,
  visibility: ChartOverlayVisibilityV1
): MarketStructureChartOverlayProjectionV1 {
  return {
    schemaVersion: CHART_OVERLAY_PROJECTION_SCHEMA_VERSION,
    ruleId: CHART_OVERLAY_PROJECTION_RULE_ID,
    chartTimeframeId: chartTf,
    availability,
    statusMessage,
    evaluationBarIndex: -1,
    evaluationTimestamp: 0,
    markers: [],
    priceLines: [],
    verticalLines: [],
    tooltipItems: [],
    visibilityDefaults: visibility,
    researchFlags: [...RESEARCH_FLAGS],
  };
}

export function buildMarketStructureChartOverlayProjection(
  input: BuildMarketStructureChartOverlayProjectionInput
): MarketStructureChartOverlayProjectionV1 {
  const visibility = mergeVisibility(input.visibility);
  const chartTf = normalizeTimeframeId(input.chartTimeframeId);

  if (NOT_ESTABLISHED_CHART_TIMEFRAMES.has(chartTf)) {
    return emptyProjection(
      chartTf,
      "NOT_ESTABLISHED",
      "MSL NOT ESTABLISHED",
      visibility
    );
  }

  if (!V1_CHART_TIMEFRAMES.has(chartTf)) {
    return emptyProjection(
      chartTf,
      "UNSUPPORTED",
      "RESEARCH OVERLAY UNSUPPORTED",
      visibility
    );
  }

  const slice = input.chartSource.timeframes[chartTf];
  const tfSurface = findTfSurface(input.surface.timeframeSurfaces, chartTf);
  if (!slice || !tfSurface) {
    return emptyProjection(
      chartTf,
      "UNSUPPORTED",
      "RESEARCH OVERLAY UNSUPPORTED",
      visibility
    );
  }

  const htfId = normalizeTimeframeId(input.chartSource.htfTimeframeId);
  const htfSlice = input.chartSource.timeframes[htfId];
  const htfSurface = findTfSurface(input.surface.timeframeSurfaces, htfId);

  return buildActiveProjection(
    chartTf,
    visibility,
    slice,
    tfSurface,
    htfSurface,
    htfSlice
  );
}

/** Viewport culling for spine structure labels (render layer; projection data unchanged). */
export function cullStructureLabelMarkersForViewport(
  markers: readonly ChartOverlayMarkerV1[],
  viewportTimeFrom: number,
  viewportTimeTo: number,
  maxExternalLabels = 80
): ChartOverlayMarkerV1[] {
  const structureKinds = new Set(["HH", "HL", "LH", "LL"]);
  const spineKinds = new Set(["SH", "SL", ...structureKinds]);

  const inViewport = markers.filter((m) => {
    if (m.category !== "STRUCTURE" || !spineKinds.has(m.kind)) {
      return true;
    }
    if (m.time < viewportTimeFrom || m.time > viewportTimeTo) {
      return m.kind === "SH" || m.kind === "SL";
    }
    return true;
  });

  const externalLabels = inViewport.filter(
    (m) => structureKinds.has(m.kind) && m.metadata.layer === "external"
  );
  if (externalLabels.length <= maxExternalLabels) {
    return inViewport;
  }
  const keep = new Set(
    externalLabels
      .slice(-maxExternalLabels)
      .map((m) => m.id)
  );
  return inViewport.filter((m) => {
    if (!structureKinds.has(m.kind) || m.metadata.layer !== "external") {
      return true;
    }
    return keep.has(m.id);
  });
}

/** Nearest-to-midprice priority for price lines (render layer). */
export function prioritizePriceLinesNearPrice(
  lines: readonly ChartOverlayPriceLineV1[],
  midPrice: number,
  maxLines: number
): ChartOverlayPriceLineV1[] {
  if (lines.length <= maxLines) {
    return [...lines];
  }
  return [...lines]
    .sort(
      (a, b) =>
        Math.abs(a.price - midPrice) - Math.abs(b.price - midPrice)
    )
    .slice(0, maxLines);
}
