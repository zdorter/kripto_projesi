import type { Candle } from "../types";
import type {
  MarketStructureScope,
  MarketStructureSwingLabel,
} from "./market-structure-types";
import type { SwingType } from "../types";
import type { MarketStructureDescriptiveConfluenceSurfaceContext } from "./market-structure-descriptive-confluence-surface-types";

export const MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_SCHEMA_VERSION = "1.0" as const;

export const MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_RULE_ID =
  "MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_V1" as const;

export const CHART_OVERLAY_PROJECTION_SCHEMA_VERSION = "1.0" as const;

export const CHART_OVERLAY_PROJECTION_RULE_ID = "CHART_OVERLAY_PROJECTION_V1" as const;

export type ChartOverlayObjectCategory =
  | "STRUCTURE"
  | "PROTECTED"
  | "BREAK"
  | "LIQUIDITY"
  | "LIQUIDITY_EVENT"
  | "MSS"
  | "EVALUATION"
  | "HTF_CONTEXT";

export type ChartOverlayAvailability = "ACTIVE" | "NOT_ESTABLISHED" | "UNSUPPORTED";

export interface ChartStructureSpinePointV1 {
  time: number;
  price: number;
  structureLabel: MarketStructureSwingLabel;
  scope: MarketStructureScope;
  swingType: SwingType;
  pivotIndex: number;
  confirmationBarIndex: number;
  knownAtBarIndex: number;
}

export interface ChartOverlayTimeframeSliceV1 {
  timeframeId: string;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  candles: readonly Candle[];
  externalSpine: readonly ChartStructureSpinePointV1[];
  internalSpine: readonly ChartStructureSpinePointV1[];
}

export interface MarketStructureChartOverlaySourceV1 {
  schemaVersion: typeof MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_RULE_ID;
  ltfTimeframeId: string;
  htfTimeframeId: string;
  timeframes: Readonly<Record<string, ChartOverlayTimeframeSliceV1>>;
}

export interface ChartOverlayVisibilityV1 {
  structure: boolean;
  internalStructureLabels: boolean;
  protected: boolean;
  breakEvents: boolean;
  liquidity: boolean;
  liquidityEvents: boolean;
  mss: boolean;
  htfContext: boolean;
}

export const DEFAULT_CHART_OVERLAY_VISIBILITY_V1: ChartOverlayVisibilityV1 = {
  structure: true,
  internalStructureLabels: false,
  protected: true,
  breakEvents: true,
  liquidity: true,
  liquidityEvents: false,
  mss: false,
  htfContext: false,
};

export type ChartOverlayMetadataValue = string | number | boolean | null;

export interface ChartOverlayMarkerV1 {
  id: string;
  category: ChartOverlayObjectCategory;
  kind: string;
  time: number;
  price: number;
  label: string;
  sourceTimeframe: string;
  metadata: Readonly<Record<string, ChartOverlayMetadataValue>>;
}

export interface ChartOverlayPriceLineV1 {
  id: string;
  category: ChartOverlayObjectCategory;
  kind: string;
  price: number;
  priceBandHigh?: number;
  priceBandLow?: number;
  label: string;
  sourceTimeframe: string;
  metadata: Readonly<Record<string, ChartOverlayMetadataValue>>;
}

export interface ChartOverlayVerticalLineV1 {
  id: string;
  category: "EVALUATION";
  time: number;
  label: string;
  sourceTimeframe: string;
}

export interface ChartOverlayTooltipItemV1 {
  id: string;
  category: ChartOverlayObjectCategory;
  kind: string;
  label: string;
  time: number;
  price: number | null;
  sourceTimeframe: string;
  metadata: Readonly<Record<string, ChartOverlayMetadataValue>>;
}

export interface MarketStructureChartOverlayProjectionV1 {
  schemaVersion: typeof CHART_OVERLAY_PROJECTION_SCHEMA_VERSION;
  ruleId: typeof CHART_OVERLAY_PROJECTION_RULE_ID;
  chartTimeframeId: string;
  availability: ChartOverlayAvailability;
  statusMessage?: string;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  markers: readonly ChartOverlayMarkerV1[];
  priceLines: readonly ChartOverlayPriceLineV1[];
  verticalLines: readonly ChartOverlayVerticalLineV1[];
  tooltipItems: readonly ChartOverlayTooltipItemV1[];
  visibilityDefaults: ChartOverlayVisibilityV1;
  researchFlags: readonly string[];
}

export interface BuildMarketStructureChartOverlayProjectionInput {
  surface: MarketStructureDescriptiveConfluenceSurfaceContext;
  chartSource: MarketStructureChartOverlaySourceV1;
  chartTimeframeId: string;
  visibility?: Partial<ChartOverlayVisibilityV1>;
}
