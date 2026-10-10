import type {
  ConfluenceSurfaceTimeframeSurface,
  MarketStructureDescriptiveConfluenceSurfaceContext,
} from "../wave/market-structure/market-structure-descriptive-confluence-surface-types";
import type { ClassifiedStructureEvent } from "../wave/market-structure/market-structure-break-types";
import type { AdvancedLiquidityInteractionEvent } from "../wave/market-structure/market-structure-liquidity-advanced-interaction-types";
import type { HtfLiquidityLtfStructureAssociation } from "../wave/market-structure/market-structure-htf-liquidity-ltf-structure-association-types";
import type { MarketStructureMtfMssAssociation } from "../wave/market-structure/market-structure-mtf-mss-association-types";
import type { CrossTfEventOrderingRelation } from "../wave/market-structure/market-structure-mtf-event-ordering-types";
import type { MarketStructureMssEvent } from "../wave/market-structure/market-structure-mss-types";
import type { ProtectedLevelCandidate } from "../wave/market-structure/market-structure-types";
import type { LiquidityStructureAssociation } from "../wave/market-structure/market-structure-liquidity-structure-association-types";
import { buildMarketStructureScenarioInterpretationContext } from "../wave/market-structure/market-structure-scenario-interpretation";
import type { MarketStructureScenarioInterpretation } from "../wave/market-structure/market-structure-scenario-interpretation-types";
import {
  assertNoForbiddenTradingTokens,
  type MarketStructureUiCompactRow,
  type MarketStructureUiMtfSummary,
  type MarketStructureUiMtfTier1Summary,
  type MarketStructureUiMtfTier2Summary,
  type MarketStructureUiScenarioCard,
  type MarketStructureUiScenarioInterpretationPanel,
  type MarketStructureUiProtectedCandidateRow,
  type MarketStructureUiTier1Presentation,
  type MarketStructureUiTier2Presentation,
  type MarketStructureUiTimeframeCard,
  type MarketStructureUiTimeframeTier1Card,
  type MarketStructureUiTimeframeTier2Card,
  type MarketStructureUiViewModel,
  type PresentMarketStructureUiInput,
} from "./market-structure-ui-presenter-types";

const DEMO_UNAVAILABLE_DEFAULT =
  "DEMO MSL data unavailable: 1H-aligned research fixture required";

const CORE_RESEARCH_DISCLAIMER =
  "Observational co-occurrence only. Not a trading signal, entry, exit, stop, target, or production rule.";

const SCENARIO_GLOBAL_DISCLAIMER =
  "Scenario interpretation only. Descriptive structure context at evaluation — not a trading signal, prediction, or entry/exit.";

function formatScenarioTypeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function formatScenarioStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function presentScenarioCard(
  role: MarketStructureUiScenarioCard["role"],
  scenario: MarketStructureScenarioInterpretation
): MarketStructureUiScenarioCard {
  const inv = scenario.structuralInvalidation;
  const liq = scenario.liquidityContext;
  const liqParts: string[] = [];
  if (liq.bslCandidateCount > 0) {
    liqParts.push(`BSL candidates ${liq.bslCandidateCount}`);
  }
  if (liq.sslCandidateCount > 0) {
    liqParts.push(`SSL candidates ${liq.sslCandidateCount}`);
  }
  if (liq.eqhObservationCount > 0) {
    liqParts.push(`EQH ${liq.eqhObservationCount}`);
  }
  if (liq.eqlObservationCount > 0) {
    liqParts.push(`EQL ${liq.eqlObservationCount}`);
  }
  return {
    role,
    scenarioTypeLabel: formatScenarioTypeLabel(scenario.scenarioType),
    statusLabel: formatScenarioStatusLabel(scenario.status),
    htfTrend: scenario.timeframeContext.htfTrendContext,
    ltfTrend: scenario.timeframeContext.ltfTrendContext,
    observedEvidence: [...scenario.observedEvidence],
    requiredTransitions: scenario.requiredTransitions.map((t) => t.replace(/_/g, " ")),
    structuralInvalidationLabel: inv.status.replace(/_/g, " "),
    structuralInvalidationNote: inv.descriptiveNote,
    liquiditySummary: liqParts.length ? liqParts.join(" · ") : "No BSL/SSL candidates counted at LTF",
    liquidityInteractionFamilies: [...liq.observedInteractionFamilies],
    interpretation: scenario.interpretation,
  };
}

function presentScenarioInterpretationPanel(
  surface: MarketStructureDescriptiveConfluenceSurfaceContext
): MarketStructureUiScenarioInterpretationPanel {
  const ctx = buildMarketStructureScenarioInterpretationContext({ surface });
  const primary = ctx.primaryScenario ? presentScenarioCard("PRIMARY", ctx.primaryScenario) : null;
  const alternative = ctx.alternativeScenario
    ? presentScenarioCard("ALTERNATIVE", ctx.alternativeScenario)
    : null;
  const globalInterpretation =
    primary?.statusLabel === "WAITING FOR TRANSITION" && alternative
      ? "Current HTF/LTF relationship does not establish a directional execution condition. Scenario interpretation only."
      : "Descriptive scenario read-model at evaluation. No trading signal.";
  return {
    schemaVersion: ctx.schemaVersion,
    globalDisclaimer: SCENARIO_GLOBAL_DISCLAIMER,
    researchOnlyBanner: "RESEARCH ONLY · No trading signal · No prediction · No entry/exit",
    primary,
    alternative,
    globalInterpretation,
    limitations: [...ctx.limitations],
  };
}

export function formatUtcTimestamp(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function structureEventRow(e: ClassifiedStructureEvent): MarketStructureUiCompactRow {
  return {
    id: e.eventId,
    summary: `${e.eventType} ${e.direction} ref@${formatPrice(e.referencePrice)} bar ${e.triggerBarIndex}`,
  };
}

function protectedRow(
  index: number,
  c: ProtectedLevelCandidate
): MarketStructureUiProtectedCandidateRow {
  return {
    index,
    price: formatPrice(c.price),
    pivotIndex: c.pivotIndex,
    statusAtE: c.statusAtE,
    type: c.type,
  };
}

function countAdvanced(
  events: readonly AdvancedLiquidityInteractionEvent[],
  type: AdvancedLiquidityInteractionEvent["eventType"]
): number {
  return events.filter((e) => e.eventType === type).length;
}

function lifecycleCounts(
  phases: readonly { phase: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of phases) {
    counts[p.phase] = (counts[p.phase] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
}

function mssRow(e: MarketStructureMssEvent): MarketStructureUiCompactRow {
  return {
    id: e.eventId,
    summary: `${e.mssDirection} ${e.primaryReferenceKind} @ ${formatPrice(e.referencePrice)} scope ${e.referenceScope} pivot ${e.referencePivotIndex} trigger ${e.triggerBarIndex}`,
  };
}

function sameTfRow(a: LiquidityStructureAssociation): MarketStructureUiCompactRow {
  return {
    id: a.associationId,
    summary: `${a.associationType} liq ${a.sourceLiquidityEventId} → struct ${a.targetStructureEventId}`,
  };
}

function orderingRow(r: CrossTfEventOrderingRelation): MarketStructureUiCompactRow {
  return {
    id: r.relationId,
    summary: `${r.htfEventFamily} / ${r.ltfEventFamily} · ${r.orderingRelation}`,
  };
}

function assoc9dRow(a: HtfLiquidityLtfStructureAssociation): MarketStructureUiCompactRow {
  return {
    id: a.associationId,
    summary: `${a.associationType} · ${a.orderingRelation} · ${a.htfLiquidityEventFamily}→${a.ltfStructureEventFamily}`,
  };
}

function assoc9eRow(a: MarketStructureMtfMssAssociation): MarketStructureUiCompactRow {
  return {
    id: a.associationId,
    summary: `${a.associationType} · ${a.orderingRelation} · ${a.htfEventFamily}→${a.ltfEventFamily}`,
  };
}

function presentTimeframeCard(
  surface: ConfluenceSurfaceTimeframeSurface
): MarketStructureUiTimeframeCard {
  const { structure, protected: prot, liquidity, events, mss, sameTfAssociations, researchMetadata } =
    surface;
  return {
    timeframeId: surface.timeframeId,
    trendContext: prot.trendContext,
    highStructure: [...structure.highStructure],
    lowStructure: [...structure.lowStructure],
    structurePairCount: structure.structurePairCount,
    zigzagSpineCount: structure.zigzagSpineCount,
    internalStructureCount: structure.internalStructureCount,
    externalStructureCount: structure.externalStructureCount,
    structureEvents: {
      bosCount: structure.bosEvents.length,
      chochCount: structure.chochEvents.length,
      bosRows: structure.bosEvents.map(structureEventRow),
      chochRows: structure.chochEvents.map(structureEventRow),
    },
    protectedHighs: prot.protectedHighs.map((c, i) => protectedRow(i + 1, c)),
    protectedLows: prot.protectedLows.map((c, i) => protectedRow(i + 1, c)),
    multipleProtectedHighs: prot.protectedHighs.length > 1,
    multipleProtectedLows: prot.protectedLows.length > 1,
    bslCount: liquidity.bslCandidates.length,
    sslCount: liquidity.sslCandidates.length,
    eqhCount: liquidity.equalHighObservations.length,
    eqlCount: liquidity.equalLowObservations.length,
    poolCount: liquidity.liquidityPools.length,
    wickTouchCount: events.wickTouches.length,
    sweepCount: countAdvanced(events.advancedEvents, "LIQUIDITY_SWEEP"),
    takenCount: countAdvanced(events.advancedEvents, "LIQUIDITY_TAKEN"),
    reclaimCount: countAdvanced(events.advancedEvents, "LIQUIDITY_RECLAIM"),
    lifecycleCounts: lifecycleCounts(events.lifecycleProjections),
    mssEventRows: mss.events.map(mssRow),
    mssCount: mss.events.length,
    sameTfAssociationCount: sameTfAssociations.liquidityStructureAssociations.length,
    sameTfAssociationRows: sameTfAssociations.liquidityStructureAssociations.map(sameTfRow),
    evaluationBarIndex: researchMetadata.evaluationBarIndex,
    evaluationTimestampUtc: formatUtcTimestamp(researchMetadata.evaluationTimestamp) ?? "—",
  };
}

function presentTimeframeTier1Card(
  card: MarketStructureUiTimeframeCard
): MarketStructureUiTimeframeTier1Card {
  return {
    timeframeId: card.timeframeId,
    trendContext: card.trendContext,
    highStructure: card.highStructure,
    lowStructure: card.lowStructure,
    structurePairCount: card.structurePairCount,
    bosCount: card.structureEvents.bosCount,
    chochCount: card.structureEvents.chochCount,
    protectedHighs: card.protectedHighs,
    protectedLows: card.protectedLows,
    multipleProtectedHighs: card.multipleProtectedHighs,
    multipleProtectedLows: card.multipleProtectedLows,
    bslCount: card.bslCount,
    sslCount: card.sslCount,
    eqhCount: card.eqhCount,
    eqlCount: card.eqlCount,
    poolCount: card.poolCount,
  };
}

function presentTimeframeTier2Card(
  card: MarketStructureUiTimeframeCard
): MarketStructureUiTimeframeTier2Card {
  return {
    timeframeId: card.timeframeId,
    zigzagSpineCount: card.zigzagSpineCount,
    internalStructureCount: card.internalStructureCount,
    externalStructureCount: card.externalStructureCount,
    structureEvents: card.structureEvents,
    wickTouchCount: card.wickTouchCount,
    sweepCount: card.sweepCount,
    takenCount: card.takenCount,
    reclaimCount: card.reclaimCount,
    lifecycleCounts: card.lifecycleCounts,
    mssPresentationNote: "MSS_RESEARCH_ONLY_NOT_SIGNAL",
    mssEventRows: card.mssEventRows,
    mssCount: card.mssCount,
    sameTfAssociationCount: card.sameTfAssociationCount,
    sameTfAssociationRows: card.sameTfAssociationRows,
    evaluationBarIndex: card.evaluationBarIndex,
    evaluationTimestampUtc: card.evaluationTimestampUtc,
  };
}

function presentMtfTier1(mtf: MarketStructureUiMtfSummary): MarketStructureUiMtfTier1Summary {
  return {
    htfTimeframeId: mtf.htfTimeframeId,
    ltfTimeframeId: mtf.ltfTimeframeId,
    htfSourceTrack: mtf.htfSourceTrack,
    structureAlignment: mtf.structureAlignment,
    liquiditySideAlignment: mtf.liquiditySideAlignment,
    liquidityLifecycleAlignment: mtf.liquidityLifecycleAlignment,
    ltfEvaluationTimestampUtc: mtf.ltfEvaluationTimestampUtc,
    htfEvaluationTimestampUtc: mtf.htfEvaluationTimestampUtc,
  };
}

function presentMtfTier2(mtf: MarketStructureUiMtfSummary): MarketStructureUiMtfTier2Summary {
  return {
    relationCount: mtf.relationCount,
    evaluationRelationCount: mtf.evaluationRelationCount,
    htfEventFamilyCounts: mtf.htfEventFamilyCounts,
    ltfEventFamilyCounts: mtf.ltfEventFamilyCounts,
    representativeRelationRows: mtf.representativeRelationRows,
    replayRelationRows: mtf.replayRelationRows,
    liquidityToStructureCount: mtf.liquidityToStructureCount,
    liquidityToStructureRows: mtf.liquidityToStructureRows,
    structureToMssCount: mtf.structureToMssCount,
    structureToMssRows: mtf.structureToMssRows,
    orderingPresentationNote: "TEMPORAL_ORDERING_ONLY",
    associationPresentationNote: "DESCRIPTIVE_ASSOCIATION_ONLY",
  };
}

function findSurface(
  ctx: MarketStructureDescriptiveConfluenceSurfaceContext,
  tf: string
): ConfluenceSurfaceTimeframeSurface | null {
  return ctx.timeframeSurfaces.find((s) => s.timeframeId === tf) ?? null;
}

function presentMtfSummary(
  ctx: MarketStructureDescriptiveConfluenceSurfaceContext,
  includeReplay: boolean
): MarketStructureUiMtfSummary | null {
  const panel = ctx.mtfPanel;
  if (!panel) {
    return null;
  }
  const ordering = panel.eventOrdering;
  return {
    htfTimeframeId: panel.htfTimeframeId,
    ltfTimeframeId: panel.ltfTimeframeId,
    htfSourceTrack: panel.htfSourceTrack,
    structureAlignment: panel.structureAlignment?.state ?? null,
    liquiditySideAlignment: panel.liquidityAlignment?.sideAlignment ?? null,
    liquidityLifecycleAlignment: panel.liquidityAlignment?.lifecycleAlignment ?? null,
    relationCount: ordering?.relationCount ?? 0,
    evaluationRelationCount: ordering?.evaluationRelationCount ?? 0,
    htfEventFamilyCounts: ordering?.htfEventFamilyCounts ?? {},
    ltfEventFamilyCounts: ordering?.ltfEventFamilyCounts ?? {},
    representativeRelationRows: (ordering?.representativeEvaluationRelations ?? []).map(orderingRow),
    replayRelationRows:
      includeReplay && ordering?.replayRelations
        ? ordering.replayRelations.map(orderingRow)
        : null,
    liquidityToStructureCount: panel.liquidityToStructureAssociations.length,
    liquidityToStructureRows: panel.liquidityToStructureAssociations.map(assoc9dRow),
    structureToMssCount: panel.structureToMssAssociations.length,
    structureToMssRows: panel.structureToMssAssociations.map(assoc9eRow),
    ltfEvaluationTimestampUtc: formatUtcTimestamp(
      panel.evaluationMetadata?.ltfEvaluationTimestamp
    ),
    htfEvaluationTimestampUtc: formatUtcTimestamp(
      panel.evaluationMetadata?.htfEvaluationTimestamp ?? null
    ),
  };
}

function collectDebugLines(
  ctx: MarketStructureDescriptiveConfluenceSurfaceContext
): string[] {
  const lines: string[] = [];
  for (const s of ctx.timeframeSurfaces) {
    lines.push(
      `${s.timeframeId} evalBar=${s.researchMetadata.evaluationBarIndex} evalTs=${s.researchMetadata.evaluationTimestamp}`
    );
  }
  if (ctx.mtfPanel?.evaluationMetadata) {
    const m = ctx.mtfPanel.evaluationMetadata;
    lines.push(`MTF horizonBars=${m.horizonBars}`);
  }
  for (const a of ctx.mtfPanel?.liquidityToStructureAssociations ?? []) {
    lines.push(
      `9D ${a.associationId} knownAt=${a.knownAtTimestamp} visibleAtEval=${a.visibleAtEvaluation}`
    );
  }
  for (const a of ctx.mtfPanel?.structureToMssAssociations ?? []) {
    lines.push(
      `9E ${a.associationId} knownAt=${a.knownAtTimestamp} visibleAtEval=${a.visibleAtEvaluation}`
    );
  }
  for (const s of ctx.timeframeSurfaces) {
    for (const e of s.mss.events) {
      lines.push(`MSS ${e.eventId} knownAtBar=${e.knownAtBarIndex} trigger=${e.triggerBarIndex}`);
    }
  }
  return lines.sort((a, b) => a.localeCompare(b));
}

/**
 * Pure presenter: MSL-9F DTO → research UI view-model (no MSL builders).
 */
export function presentMarketStructureUiViewModel(
  input: PresentMarketStructureUiInput
): MarketStructureUiViewModel {
  const includeReplay = input.includeReplayRelations === true;
  const demoMsg =
    input.loadStatus === "demo_unavailable"
      ? input.demoUnavailableMessage ?? DEMO_UNAVAILABLE_DEFAULT
      : null;

  if (input.loadStatus !== "ready" || !input.surface) {
    const vm: MarketStructureUiViewModel = {
      loadStatus: input.loadStatus,
      symbol: input.symbol,
      dataMode: input.dataMode,
      demoUnavailableMessage: demoMsg,
      errorMessage: input.errorMessage ?? null,
      researchFlags: [],
      limitations: [],
      presentationTaxonomy: null,
      evaluationLtfUtc: null,
      evaluationHtfUtc: null,
      fifteenMStatus: "NOT_ESTABLISHED",
      timeframeCards: { fourH: null, oneH: null },
      mtfSummary: null,
      tier1: null,
      tier2: null,
      scenarioInterpretation: null,
      unresolved: [],
      debugDetailLines: [],
      forbiddenTokenScan: { ok: true },
    };
    const json = JSON.stringify(vm);
    assertNoForbiddenTradingTokens(json);
    return vm;
  }

  const ctx = input.surface;
  const fourH = findSurface(ctx, "4H");
  const oneH = findSurface(ctx, "1H");
  const mtf = presentMtfSummary(ctx, includeReplay);

  const unresolved = [...ctx.unresolved]
    .map((u) => ({
      sourceContext: u.sourceContext,
      code: u.code,
      message: u.message,
    }))
    .sort((a, b) => {
      if (a.sourceContext !== b.sourceContext) {
        return a.sourceContext.localeCompare(b.sourceContext);
      }
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    });

  const fourHCard = fourH ? presentTimeframeCard(fourH) : null;
  const oneHCard = oneH ? presentTimeframeCard(oneH) : null;
  const debugDetailLines = collectDebugLines(ctx);
  const taxonomy = ctx.presentationTaxonomy;

  const scenarioInterpretation = presentScenarioInterpretationPanel(ctx);

  const tier1: MarketStructureUiTier1Presentation = {
    timeframeCards: {
      fourH: fourHCard ? presentTimeframeTier1Card(fourHCard) : null,
      oneH: oneHCard ? presentTimeframeTier1Card(oneHCard) : null,
    },
    mtfSummary: mtf ? presentMtfTier1(mtf) : null,
    scenarioInterpretation,
    coreLimitations: [...taxonomy.coreLimitations],
    coreResearchDisclaimer: CORE_RESEARCH_DISCLAIMER,
    unresolved,
    nativeHtfResearchPresentation: ctx.nativeHtfResearchPresentation,
    confluencePresentationStatus: ctx.confluencePresentationStatus,
  };

  const tier2: MarketStructureUiTier2Presentation = {
    timeframeCards: {
      fourH: fourHCard ? presentTimeframeTier2Card(fourHCard) : null,
      oneH: oneHCard ? presentTimeframeTier2Card(oneHCard) : null,
    },
    mtfSummary: mtf ? presentMtfTier2(mtf) : null,
    researchPresentationFlags: [...taxonomy.researchPresentationFlags],
    technicalLimitations: [...taxonomy.technicalLimitations],
    limitations: [...ctx.limitations],
    debugDetailLines,
  };

  const vm: MarketStructureUiViewModel = {
    loadStatus: "ready",
    symbol: input.symbol,
    dataMode: input.dataMode,
    demoUnavailableMessage: null,
    errorMessage: null,
    researchFlags: [...ctx.researchFlags],
    limitations: [...ctx.limitations],
    presentationTaxonomy: taxonomy,
    evaluationLtfUtc: mtf?.ltfEvaluationTimestampUtc ?? oneH?.evaluationTimestampUtc ?? null,
    evaluationHtfUtc: mtf?.htfEvaluationTimestampUtc ?? fourH?.evaluationTimestampUtc ?? null,
    fifteenMStatus: "NOT_ESTABLISHED",
    timeframeCards: {
      fourH: fourHCard,
      oneH: oneHCard,
    },
    mtfSummary: mtf,
    tier1,
    tier2,
    scenarioInterpretation,
    unresolved,
    debugDetailLines,
    forbiddenTokenScan: { ok: true },
  };

  const json = JSON.stringify(vm);
  assertNoForbiddenTradingTokens(json);
  return vm;
}
