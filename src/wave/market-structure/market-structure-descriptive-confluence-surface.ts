import type { Candle } from "../types";
import { deriveHtfCandlesFromLtf } from "./market-structure-htf-derivation";
import { buildMarketStructureLiquidityAdvancedInteractionContext } from "./market-structure-liquidity-advanced-interaction";
import { buildMarketStructureLiquidityInteractionContext } from "./market-structure-liquidity-interaction";
import { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
import { deriveMarketStructureLiquidityLifecycle } from "./market-structure-liquidity-lifecycle-derivation";
import { buildMarketStructureLiquidityStructureAssociationContext } from "./market-structure-liquidity-structure-association";
import { buildMarketStructureHtfLiquidityLtfStructureAssociationContext } from "./market-structure-htf-liquidity-ltf-structure-association";
import { getTimeframeDurationMs, normalizeTimeframeId } from "./market-structure-bar-timestamp";
import { buildMarketStructureMssContext } from "./market-structure-mss";
import { buildMarketStructureMtfEventOrderingContext } from "./market-structure-mtf-event-ordering";
import type { CrossTfEventOrderingRelation, MarketStructureMtfEventOrderingContext } from "./market-structure-mtf-event-ordering-types";
import { buildMarketStructureMtfLiquidityAlignmentContext } from "./market-structure-mtf-liquidity-alignment";
import type { MarketStructureMtfLiquidityAlignmentContext } from "./market-structure-mtf-liquidity-alignment-types";
import { buildMarketStructureMtfMssAssociationContext } from "./market-structure-mtf-mss-association";
import type { MarketStructureMtfMssAssociationContext } from "./market-structure-mtf-mss-association-types";
import { buildMarketStructureMtfStructureAlignmentContext } from "./market-structure-mtf-structure-alignment";
import type { MarketStructureMtfStructureAlignmentContext } from "./market-structure-mtf-structure-alignment-types";
import { buildMarketStructureSnapshotAtBar } from "./market-structure-snapshot";
import {
  buildPresentationTaxonomy,
  NATIVE_HTF_RESEARCH_PRESENTATION_V1,
} from "./market-structure-presentation-taxonomy";
import type { BuildMarketStructureSnapshotAtBarInput } from "./market-structure-types";
import {
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
  type ConfluenceSurfaceEventOrderingSummary,
  type ConfluenceSurfaceLiquidityAlignmentView,
  type ConfluenceSurfaceMtfPanel,
  type ConfluenceSurfaceSourcedUnresolved,
  type ConfluenceSurfaceStructureAlignmentView,
  type ConfluenceSurfaceTimeframeSurface,
  type ConfluenceSurfaceTimeframeStatus,
  type MarketStructureDescriptiveConfluenceSurfaceContext,
  type TimeframeEstablishmentStatus,
} from "./market-structure-descriptive-confluence-surface-types";

export {
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
} from "./market-structure-descriptive-confluence-surface-types";

export type {
  BuildMarketStructureDescriptiveConfluenceSurfaceContextInput,
  ConfluenceSurfaceMtfPanel,
  ConfluenceSurfaceTimeframeSurface,
  DescriptiveConfluencePrebuiltContexts,
  DescriptiveConfluenceTimeframeInput,
  MarketStructureDescriptiveConfluenceSurfaceContext,
} from "./market-structure-descriptive-confluence-surface-types";

export type { MarketStructureChartOverlaySourceV1 } from "./market-structure-chart-overlay-types";

import type { BuildMarketStructureDescriptiveConfluenceSurfaceContextInput } from "./market-structure-descriptive-confluence-surface-types";
import type { DescriptiveConfluencePrebuiltContexts } from "./market-structure-descriptive-confluence-surface-types";
import type { DescriptiveConfluenceTimeframeInput } from "./market-structure-descriptive-confluence-surface-types";
import type { MarketStructureSwingAnnotation } from "./market-structure-types";
import {
  MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_RULE_ID,
  MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_SCHEMA_VERSION,
  type ChartOverlayTimeframeSliceV1,
  type ChartStructureSpinePointV1,
  type MarketStructureChartOverlaySourceV1,
} from "./market-structure-chart-overlay-types";

const V1_ACTIVE_TIMEFRAMES = ["4H", "1H"] as const;
const V1_NOT_ESTABLISHED_TIMEFRAMES = ["15M"] as const;
const REPRESENTATIVE_EVAL_RELATION_CAP = 32;

const SURFACE_RESEARCH_FLAGS = [
  "research_only",
  "descriptive_confluence_surface",
  "observational_co_occurrence_only",
  "no_production_signal",
  "no_causality",
  "no_prediction",
  "no_scoring",
  "native_htf_parity_not_established",
] as const;

const SURFACE_LIMITATIONS = [
  ...SURFACE_RESEARCH_FLAGS,
  `surface_rule_id=${MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID}`,
] as const;

function resolveHorizon(horizonBars: number | undefined): number {
  const raw = horizonBars ?? DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
}

function sortTimeframeIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const da = getTimeframeDurationMs(a) ?? 0;
    const db = getTimeframeDurationMs(b) ?? 0;
    if (da !== db) {
      return db - da;
    }
    return a.localeCompare(b);
  });
}

function mergeLimitations(...groups: readonly (readonly string[])[]): string[] {
  const set = new Set<string>(SURFACE_LIMITATIONS);
  for (const g of groups) {
    for (const item of g) {
      set.add(item);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function pushUnresolved(
  out: ConfluenceSurfaceSourcedUnresolved[],
  sourceContext: string,
  items: readonly { code: string; message: string }[]
): void {
  for (const u of items) {
    out.push({ sourceContext, code: u.code, message: u.message });
  }
}

function sortUnresolved(
  a: ConfluenceSurfaceSourcedUnresolved,
  b: ConfluenceSurfaceSourcedUnresolved
): number {
  if (a.sourceContext !== b.sourceContext) {
    return a.sourceContext.localeCompare(b.sourceContext);
  }
  if (a.code !== b.code) {
    return a.code.localeCompare(b.code);
  }
  return a.message.localeCompare(b.message);
}

function familyCounts(
  relations: readonly CrossTfEventOrderingRelation[],
  leg: "htf" | "ltf"
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of relations) {
    const family = leg === "htf" ? r.htfEventFamily : r.ltfEventFamily;
    counts[family] = (counts[family] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function spinePointFromAnnotation(
  ann: MarketStructureSwingAnnotation
): ChartStructureSpinePointV1 {
  return {
    time: ann.time,
    price: ann.price,
    structureLabel: ann.structureLabel,
    scope: ann.scope,
    swingType: ann.type,
    pivotIndex: ann.pivotIndex,
    confirmationBarIndex: ann.confirmationBarIndex,
    knownAtBarIndex: ann.knownAtBarIndex,
  };
}

function spineFromAnnotations(
  anns: readonly MarketStructureSwingAnnotation[]
): ChartStructureSpinePointV1[] {
  return anns.map(spinePointFromAnnotation);
}

function buildOrderingSummary(
  ordering: MarketStructureMtfEventOrderingContext,
  includeReplayRelations: boolean
): ConfluenceSurfaceEventOrderingSummary {
  const summary: ConfluenceSurfaceEventOrderingSummary = {
    relationCount: ordering.relations.length,
    evaluationRelationCount: ordering.evaluationRelations.length,
    htfEventFamilyCounts: familyCounts(ordering.evaluationRelations, "htf"),
    ltfEventFamilyCounts: familyCounts(ordering.evaluationRelations, "ltf"),
    representativeEvaluationRelations: ordering.evaluationRelations.slice(
      0,
      REPRESENTATIVE_EVAL_RELATION_CAP
    ),
  };
  if (includeReplayRelations) {
    summary.replayRelations = ordering.relations;
  }
  return summary;
}

function buildTimeframeSurface(
  tfInput: DescriptiveConfluenceTimeframeInput,
  horizon: number,
  swingConfig: BuildMarketStructureSnapshotAtBarInput["swingConfig"]
): {
  surface: ConfluenceSurfaceTimeframeSurface;
  chartSlice: ChartOverlayTimeframeSliceV1;
  limitations: string[];
  unresolved: ConfluenceSurfaceSourcedUnresolved[];
} {
  const tf = normalizeTimeframeId(tfInput.timeframeId);
  const candles = tfInput.candles;
  const E = tfInput.evaluationBarIndex;
  const snapshot = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig,
  });

  const interaction = buildMarketStructureLiquidityInteractionContext({
    snapshot,
    candles,
    horizonBars: horizon,
  });
  const advanced = buildMarketStructureLiquidityAdvancedInteractionContext({
    snapshot,
    candles,
    horizonBars: horizon,
  });
  const lifecycle = deriveMarketStructureLiquidityLifecycle({
    pools: snapshot.liquidity.liquidityPools,
    events: advanced.events,
  });
  const mssCtx = buildMarketStructureMssContext({ snapshot });
  const sameTfAssoc = buildMarketStructureLiquidityStructureAssociationContext({
    candles,
    evaluationBarIndex: E,
    timeframeId: tf,
    horizonBars: horizon,
    swingConfig,
  });

  const bos = snapshot.break.classifiedEvents.filter((e) => e.eventType === "BOS");
  const choch = snapshot.break.classifiedEvents.filter((e) => e.eventType === "CHoCH");

  const limitations = mergeLimitations(
    snapshot.limitations,
    interaction.limitations,
    advanced.limitations,
    mssCtx.limitations,
    sameTfAssoc.limitations
  );

  const unresolved: ConfluenceSurfaceSourcedUnresolved[] = [];
  pushUnresolved(unresolved, `MSL-3:${tf}`, snapshot.protected.unresolved);
  pushUnresolved(unresolved, `MSL-6:${tf}`, interaction.unresolved);
  pushUnresolved(unresolved, `MSL-7E:${tf}`, advanced.unresolved);
  pushUnresolved(unresolved, `MSL-8:${tf}`, mssCtx.unresolved);
  pushUnresolved(unresolved, `MSL-7D:${tf}`, sameTfAssoc.unresolved);
  unresolved.sort(sortUnresolved);

  const surface: ConfluenceSurfaceTimeframeSurface = {
    timeframeId: tf,
    status: "ACTIVE",
    structure: {
      highStructure: snapshot.highStructure,
      lowStructure: snapshot.lowStructure,
      structurePairCount: snapshot.structurePairs.length,
      zigzagSpineCount: snapshot.zigzag.zigzagSpine.length,
      internalStructureCount: snapshot.zigzag.internalStructure.length,
      externalStructureCount: snapshot.zigzag.externalStructure.length,
      bosEvents: bos,
      chochEvents: choch,
    },
    protected: {
      protectedHighs: snapshot.protected.protectedHighs,
      protectedLows: snapshot.protected.protectedLows,
      unresolved: snapshot.protected.unresolved,
      trendContext: snapshot.protected.trendContext,
    },
    liquidity: {
      bslCandidates: snapshot.liquidity.bslCandidates,
      sslCandidates: snapshot.liquidity.sslCandidates,
      equalHighObservations: snapshot.liquidity.equalHighObservations,
      equalLowObservations: snapshot.liquidity.equalLowObservations,
      liquidityPools: snapshot.liquidity.liquidityPools,
    },
    events: {
      wickTouches: interaction.events,
      advancedEvents: advanced.events,
      lifecycleProjections: lifecycle,
    },
    mss: {
      researchOnly: true,
      events: mssCtx.events,
      trendContext: mssCtx.trendContext,
    },
    sameTfAssociations: {
      liquidityStructureAssociations: sameTfAssoc.associations,
    },
    researchMetadata: {
      evaluationBarIndex: E,
      evaluationTimestamp: snapshot.evaluationTimestamp,
      limitationCount: limitations.length,
    },
  };

  const chartSlice: ChartOverlayTimeframeSliceV1 = {
    timeframeId: tf,
    evaluationBarIndex: E,
    evaluationTimestamp: snapshot.evaluationTimestamp,
    candles,
    externalSpine: spineFromAnnotations(snapshot.zigzag.externalStructure),
    internalSpine: spineFromAnnotations(snapshot.zigzag.internalStructure),
  };

  return { surface, chartSlice, limitations, unresolved };
}

function findTfInput(
  inputs: readonly DescriptiveConfluenceTimeframeInput[],
  timeframeId: string
): DescriptiveConfluenceTimeframeInput | undefined {
  const want = normalizeTimeframeId(timeframeId);
  return inputs.find((i) => normalizeTimeframeId(i.timeframeId) === want);
}

function structureAlignmentView(
  ctx: MarketStructureMtfStructureAlignmentContext
): ConfluenceSurfaceStructureAlignmentView {
  return {
    state: ctx.alignment,
    ltfTrendContext: ctx.ltfTrendContext,
    htfTrendContext: ctx.htfTrendContext,
    evidenceTag: "DESCRIPTIVE_MTF_STRUCTURE_STATE",
  };
}

function liquidityAlignmentView(
  ctx: MarketStructureMtfLiquidityAlignmentContext
): ConfluenceSurfaceLiquidityAlignmentView {
  return {
    sideAlignment: ctx.sideAlignment,
    lifecycleAlignment: ctx.lifecycleAlignment,
    ltfSideProfile: ctx.ltfFoundation?.sideProfile ?? null,
    htfSideProfile: ctx.htfFoundation?.sideProfile ?? null,
    evidenceTag: "DESCRIPTIVE_MTF_LIQUIDITY_STATE",
  };
}

export interface MarketStructureDescriptiveConfluenceSurfaceBundle {
  surface: MarketStructureDescriptiveConfluenceSurfaceContext;
  chartSource: MarketStructureChartOverlaySourceV1;
}

/**
 * MSL-9F + chart overlay source (single snapshot pass; 9F DTO unchanged).
 */
export function buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource(
  input: BuildMarketStructureDescriptiveConfluenceSurfaceContextInput
): MarketStructureDescriptiveConfluenceSurfaceBundle {
  const horizon = resolveHorizon(input.horizonBars);
  const swingConfig = input.swingConfig;
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId ?? "1H");
  const htfTf = normalizeTimeframeId(input.htfTimeframeId ?? "4H");
  const includeReplay = input.includeReplayRelations === true;

  const timeframeStatus: ConfluenceSurfaceTimeframeStatus[] = [
    ...V1_ACTIVE_TIMEFRAMES.map((tf) => ({
      timeframeId: tf,
      status: "ACTIVE" as TimeframeEstablishmentStatus,
    })),
    ...V1_NOT_ESTABLISHED_TIMEFRAMES.map((tf) => ({
      timeframeId: tf,
      status: "NOT_ESTABLISHED" as TimeframeEstablishmentStatus,
    })),
  ];

  const ltfInput = findTfInput(input.timeframeInputs, ltfTf);
  const htfInputDirect = findTfInput(input.timeframeInputs, htfTf);

  let htfCandles: readonly Candle[] | null = htfInputDirect?.candles ?? null;
  if (!htfCandles && ltfInput && ltfTf === "1H" && htfTf === "4H") {
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltfInput.candles,
      ltfTimeframeId: ltfTf,
      htfTimeframeId: htfTf,
    });
    htfCandles = derived.candles;
  }

  const limitationGroups: (readonly string[])[] = [];
  const allUnresolved: ConfluenceSurfaceSourcedUnresolved[] = [];
  const surfaces: ConfluenceSurfaceTimeframeSurface[] = [];
  const chartTimeframes: Record<string, ChartOverlayTimeframeSliceV1> = {};
  let mtfPanel: ConfluenceSurfaceMtfPanel | null = null;
  const prebuilt: DescriptiveConfluencePrebuiltContexts = input.prebuiltContexts ?? {};

  let htfEvalIndex: number | null = htfInputDirect?.evaluationBarIndex ?? null;

  if (ltfInput && htfCandles) {
    const mtfBase = {
      ltfCandles: ltfInput.candles,
      htfCandles,
      ltfEvaluationBarIndex: ltfInput.evaluationBarIndex,
      ltfTimeframeId: ltfTf,
      htfTimeframeId: htfTf,
      horizonBars: horizon,
      swingConfig,
      htfSourceTrack: input.htfSourceTrack,
    };

    const structureAlignment =
      prebuilt.mtfStructureAlignment ??
      buildMarketStructureMtfStructureAlignmentContext(mtfBase);
    const liquidityAlignment =
      prebuilt.mtfLiquidityAlignment ??
      buildMarketStructureMtfLiquidityAlignmentContext(mtfBase);
    const ordering =
      prebuilt.mtfEventOrdering ?? buildMarketStructureMtfEventOrderingContext(mtfBase);
    const liqToStructure =
      prebuilt.htfLiquidityLtfStructure ??
      buildMarketStructureHtfLiquidityLtfStructureAssociationContext(mtfBase);
    const structureToMss =
      prebuilt.mtfMssAssociation ??
      buildMarketStructureMtfMssAssociationContext(mtfBase);

    if (htfEvalIndex === null && structureAlignment.htfEvaluationBarIndex !== null) {
      htfEvalIndex = structureAlignment.htfEvaluationBarIndex;
    }
    if (htfEvalIndex === null) {
      htfEvalIndex = Math.max(0, htfCandles.length - 1);
    }

    limitationGroups.push(
      structureAlignment.limitations,
      liquidityAlignment.limitations,
      ordering.limitations,
      liqToStructure.limitations,
      structureToMss.limitations
    );

    pushUnresolved(allUnresolved, "MSL-9A", structureAlignment.unresolved);
    pushUnresolved(allUnresolved, "MSL-9B", liquidityAlignment.unresolved);
    pushUnresolved(allUnresolved, "MSL-9C", ordering.unresolved);
    pushUnresolved(allUnresolved, "MSL-9D", liqToStructure.unresolved);
    pushUnresolved(allUnresolved, "MSL-9E", structureToMss.unresolved);

    mtfPanel = {
      htfTimeframeId: htfTf,
      ltfTimeframeId: ltfTf,
      htfSourceTrack: ordering.htfSourceTrack,
      structureAlignment: structureAlignmentView(structureAlignment),
      liquidityAlignment: liquidityAlignmentView(liquidityAlignment),
      eventOrdering: buildOrderingSummary(ordering, includeReplay),
      liquidityToStructureAssociations: liqToStructure.evaluationAssociations,
      structureToMssAssociations: structureToMss.evaluationAssociations,
      evaluationMetadata: {
        ltfEvaluationTimestamp: ordering.ltfEvaluationTimestamp,
        htfEvaluationTimestamp: ordering.htfEvaluationTimestamp,
        horizonBars: horizon,
      },
      unresolved: [],
    };
  }

  const tfInputsForSurfaces: DescriptiveConfluenceTimeframeInput[] = [];
  if (htfCandles && htfEvalIndex !== null) {
    tfInputsForSurfaces.push({
      timeframeId: htfTf,
      candles: htfCandles,
      evaluationBarIndex: htfEvalIndex,
    });
  }
  if (ltfInput) {
    tfInputsForSurfaces.push(ltfInput);
  }

  const sortedTfInputs = sortTimeframeIds(
    tfInputsForSurfaces.map((t) => normalizeTimeframeId(t.timeframeId))
  ).map((id) => tfInputsForSurfaces.find((t) => normalizeTimeframeId(t.timeframeId) === id)!);

  for (const tfIn of sortedTfInputs) {
    const built = buildTimeframeSurface(tfIn, horizon, swingConfig);
    surfaces.push(built.surface);
    chartTimeframes[built.chartSlice.timeframeId] = built.chartSlice;
    limitationGroups.push(built.limitations);
    allUnresolved.push(...built.unresolved);
  }

  allUnresolved.sort(sortUnresolved);
  const limitations = mergeLimitations(...limitationGroups);
  const researchFlags = [...SURFACE_RESEARCH_FLAGS];
  const presentationTaxonomy = buildPresentationTaxonomy({ limitations, researchFlags });

  const surface: MarketStructureDescriptiveConfluenceSurfaceContext = {
    schemaVersion: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
    timeframeStatus,
    timeframeSurfaces: surfaces,
    mtfPanel,
    researchFlags,
    limitations,
    unresolved: allUnresolved,
    presentationTaxonomy,
    nativeHtfResearchPresentation: NATIVE_HTF_RESEARCH_PRESENTATION_V1,
    confluencePresentationStatus: "DESCRIPTIVE_CONFLUENCE_ONLY",
  };

  const chartSource: MarketStructureChartOverlaySourceV1 = {
    schemaVersion: MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_CHART_OVERLAY_SOURCE_RULE_ID,
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    timeframes: chartTimeframes,
  };

  return { surface, chartSource };
}

/**
 * MSL-9F: integrated descriptive confluence surface (read-model orchestration over MSL-1..9E).
 */
export function buildMarketStructureDescriptiveConfluenceSurfaceContext(
  input: BuildMarketStructureDescriptiveConfluenceSurfaceContextInput
): MarketStructureDescriptiveConfluenceSurfaceContext {
  return buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource(input).surface;
}
