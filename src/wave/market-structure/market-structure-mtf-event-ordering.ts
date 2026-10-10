import type { Candle } from "../types";
import { buildMarketStructureBreakContext } from "./market-structure-break";
import type { ClassifiedStructureEvent } from "./market-structure-break-types";
import { buildMarketStructureCrossTfLiquidityInteractionContext } from "./market-structure-cross-tf-liquidity-interaction";
import type { CrossTfLiquidityInteractionEvent } from "./market-structure-cross-tf-liquidity-interaction-types";
import { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
import { buildMarketStructureLiquidityInteractionContext } from "./market-structure-liquidity-interaction";
import type { LiquidityInteractionEvent } from "./market-structure-liquidity-interaction-types";
import { buildMarketStructureLiquidityAdvancedInteractionContext } from "./market-structure-liquidity-advanced-interaction";
import type { AdvancedLiquidityInteractionEvent } from "./market-structure-liquidity-advanced-interaction-types";
import { buildMarketStructureMssContext } from "./market-structure-mss";
import type { MarketStructureMssEvent } from "./market-structure-mss-types";
import {
  buildMarketStructureMtfAlignmentContext,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-mtf-alignment";
import type { BuildMarketStructureMtfAlignmentContextInput } from "./market-structure-mtf-alignment";
import { buildMarketStructureSnapshotAtBar } from "./market-structure-snapshot";
import {
  MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
  type CrossTfEventOrderingRelation,
  type CrossTfOrderingRelationKind,
  type MarketStructureMtfEventOrderingContext,
  type MtfEventOrderingHtfSourceTrack,
  type MtfEventOrderingUnresolvedReason,
  type NormalizedMtfOrderingEvent,
} from "./market-structure-mtf-event-ordering-types";

export {
  MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
} from "./market-structure-mtf-event-ordering-types";

export type {
  CrossTfEventOrderingRelation,
  CrossTfOrderingRelationKind,
  MarketStructureMtfEventOrderingContext,
  MtfEventOrderingHtfSourceTrack,
  MtfOrderingEventFamily,
  NormalizedMtfOrderingEvent,
} from "./market-structure-mtf-event-ordering-types";

const STANDARD_LIMITATIONS = [
  "research_only",
  "temporal_order_only",
  "no_causal_inference",
  "no_prediction",
  "no_signal",
  "no_confluence_score",
  "no_mtf_mss",
  "no_production_rule",
  "no_liquidity_structure_association_rebuild",
  "no_msl9a_state_as_event",
  "no_msl9b_state_as_event",
  "directed_htf_to_ltf_relation",
  "ordering_timestamp_bar_open",
  "knowability_bar_close",
  "cross_tf_timestamp_only",
  "derived_htf_research_track",
  "native_htf_parity_not_established",
  `event_ordering_rule_id=${MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID}`,
] as const;

export interface BuildMarketStructureMtfEventOrderingContextInput
  extends BuildMarketStructureMtfAlignmentContextInput {
  horizonBars?: number;
  htfSourceTrack?: MtfEventOrderingHtfSourceTrack;
}

export function buildCrossTfRelationId(
  htfEventId: string,
  ltfEventId: string
): string {
  return `ctfo:${htfEventId}:${ltfEventId}`;
}

export function resolveHtfToLtfOrderingRelation(
  htfOrderingTimestamp: number | null,
  ltfOrderingTimestamp: number | null
): CrossTfOrderingRelationKind {
  if (
    htfOrderingTimestamp === null ||
    ltfOrderingTimestamp === null ||
    !Number.isFinite(htfOrderingTimestamp) ||
    !Number.isFinite(ltfOrderingTimestamp)
  ) {
    return "NOT_COMPARABLE";
  }
  if (htfOrderingTimestamp < ltfOrderingTimestamp) {
    return "BEFORE";
  }
  if (htfOrderingTimestamp > ltfOrderingTimestamp) {
    return "AFTER";
  }
  return "SAME_TIME";
}

function resolveHorizonBars(horizonBars: number | undefined): number {
  const raw = horizonBars ?? DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
  if (!Number.isInteger(raw) || raw <= 0) {
    return DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
  }
  return raw;
}

function resolveHtfSourceTrack(
  input: BuildMarketStructureMtfEventOrderingContextInput
): MtfEventOrderingHtfSourceTrack {
  if (input.htfSourceTrack) {
    return input.htfSourceTrack;
  }
  const ltf = normalizeTimeframeId(input.ltfTimeframeId);
  const htf = normalizeTimeframeId(input.htfTimeframeId);
  if (ltf === "1H" && htf === "4H") {
    return "DERIVED_1H_4H";
  }
  return "UNSPECIFIED";
}

function orderingTimestampFromBar(
  candles: readonly Candle[],
  triggerBarIndex: number
): number | null {
  if (
    !Number.isInteger(triggerBarIndex) ||
    triggerBarIndex < 0 ||
    triggerBarIndex >= candles.length
  ) {
    return null;
  }
  return candles[triggerBarIndex]!.time;
}

function knowabilityTimestampFromBar(
  candles: readonly Candle[],
  knownAtBarIndex: number,
  timeframeId: string
): number | null {
  return knownAtTimestampFromBarIndex(candles, knownAtBarIndex, timeframeId);
}

function inReplayWindow(
  triggerBarIndex: number,
  E: number,
  horizon: number,
  lastIndex: number
): boolean {
  const start = E + 1;
  const end = Math.min(E + horizon, lastIndex);
  if (start > lastIndex) {
    return false;
  }
  return triggerBarIndex >= start && triggerBarIndex <= end;
}

function visibleAtEvaluation(
  knowabilityTimestamp: number | null,
  T_LTF: number
): boolean {
  if (knowabilityTimestamp === null || !Number.isFinite(knowabilityTimestamp)) {
    return false;
  }
  return isKnownAtOrBefore(knowabilityTimestamp, T_LTF);
}

function pushNormalized(
  out: NormalizedMtfOrderingEvent[],
  event: NormalizedMtfOrderingEvent
): void {
  out.push(event);
}

function normalizeStructureEvent(
  ev: ClassifiedStructureEvent,
  candles: readonly Candle[],
  timeframeId: string,
  leg: "HTF" | "LTF",
  E: number,
  horizon: number,
  T_LTF: number,
  visibleBreakIds: ReadonlySet<string> | null
): NormalizedMtfOrderingEvent | null {
  const orderingTimestamp = orderingTimestampFromBar(candles, ev.triggerBarIndex);
  const knowabilityTimestamp = knowabilityTimestampFromBar(
    candles,
    ev.knownAtBarIndex,
    timeframeId
  );
  if (orderingTimestamp === null || knowabilityTimestamp === null) {
    return null;
  }
  const last = candles.length - 1;
  const inWindow = inReplayWindow(ev.triggerBarIndex, E, horizon, last);
  if (!inWindow) {
    return null;
  }
  const evalVisible =
    leg === "LTF"
      ? visibleAtEvaluation(knowabilityTimestamp, T_LTF)
      : visibleBreakIds
        ? visibleBreakIds.has(ev.eventId) &&
          visibleAtEvaluation(knowabilityTimestamp, T_LTF)
        : visibleAtEvaluation(knowabilityTimestamp, T_LTF);
  return {
    eventId: ev.eventId,
    eventFamily: ev.eventType,
    timeframeId,
    orderingTimestamp,
    knowabilityTimestamp,
    triggerBarIndex: ev.triggerBarIndex,
    sourceContext: "MSL-4",
    leg,
    inReplayWindow: inWindow,
    visibleAtEvaluation: evalVisible,
  };
}

function normalizeMssEvent(
  ev: MarketStructureMssEvent,
  candles: readonly Candle[],
  timeframeId: string,
  leg: "HTF" | "LTF",
  E: number,
  horizon: number,
  T_LTF: number
): NormalizedMtfOrderingEvent | null {
  const orderingTimestamp = orderingTimestampFromBar(candles, ev.triggerBarIndex);
  const knowabilityTimestamp = knowabilityTimestampFromBar(
    candles,
    ev.knownAtBarIndex,
    timeframeId
  );
  if (orderingTimestamp === null || knowabilityTimestamp === null) {
    return null;
  }
  const last = candles.length - 1;
  const inWindow = inReplayWindow(ev.triggerBarIndex, E, horizon, last);
  if (!inWindow) {
    return null;
  }
  return {
    eventId: ev.eventId,
    eventFamily: "MSS",
    timeframeId,
    orderingTimestamp,
    knowabilityTimestamp,
    triggerBarIndex: ev.triggerBarIndex,
    sourceContext: "MSL-8",
    leg,
    inReplayWindow: inWindow,
    visibleAtEvaluation: visibleAtEvaluation(knowabilityTimestamp, T_LTF),
  };
}

function normalizeLiquidityInteraction(
  ev: LiquidityInteractionEvent,
  candles: readonly Candle[],
  timeframeId: string,
  leg: "HTF" | "LTF",
  E: number,
  horizon: number,
  T_LTF: number
): NormalizedMtfOrderingEvent | null {
  const orderingTimestamp = ev.triggerTimestamp;
  const knowabilityTimestamp = knowabilityTimestampFromBar(
    candles,
    ev.knownAtBarIndex,
    timeframeId
  );
  if (knowabilityTimestamp === null) {
    return null;
  }
  const last = candles.length - 1;
  const inWindow = inReplayWindow(ev.triggerBarIndex, E, horizon, last);
  if (!inWindow) {
    return null;
  }
  return {
    eventId: ev.eventId,
    eventFamily: "LIQUIDITY_WICK_TOUCH",
    timeframeId,
    orderingTimestamp,
    knowabilityTimestamp,
    triggerBarIndex: ev.triggerBarIndex,
    sourceContext: "MSL-6",
    leg,
    inReplayWindow: inWindow,
    visibleAtEvaluation: visibleAtEvaluation(knowabilityTimestamp, T_LTF),
  };
}

function normalizeAdvancedLiquidity(
  ev: AdvancedLiquidityInteractionEvent,
  candles: readonly Candle[],
  timeframeId: string,
  leg: "HTF" | "LTF",
  E: number,
  horizon: number,
  T_LTF: number
): NormalizedMtfOrderingEvent | null {
  const knowabilityTimestamp = knowabilityTimestampFromBar(
    candles,
    ev.knownAtBarIndex,
    timeframeId
  );
  if (knowabilityTimestamp === null) {
    return null;
  }
  const last = candles.length - 1;
  const inWindow = inReplayWindow(ev.triggerBarIndex, E, horizon, last);
  if (!inWindow) {
    return null;
  }
  return {
    eventId: ev.eventId,
    eventFamily: ev.eventType,
    timeframeId,
    orderingTimestamp: ev.triggerTimestamp,
    knowabilityTimestamp,
    triggerBarIndex: ev.triggerBarIndex,
    sourceContext: "MSL-7E",
    leg,
    inReplayWindow: inWindow,
    visibleAtEvaluation: visibleAtEvaluation(knowabilityTimestamp, T_LTF),
  };
}

function normalizeCrossTfTouch(
  ev: CrossTfLiquidityInteractionEvent,
  ltfTf: string,
  E_LTF: number,
  horizon: number,
  ltfLast: number,
  T_LTF: number
): NormalizedMtfOrderingEvent | null {
  const inWindow = inReplayWindow(
    ev.ltfTriggerBarIndex,
    E_LTF,
    horizon,
    ltfLast
  );
  if (!inWindow) {
    return null;
  }
  return {
    eventId: ev.eventId,
    eventFamily: "CROSS_TF_LIQUIDITY_WICK_TOUCH",
    timeframeId: ltfTf,
    orderingTimestamp: ev.ltfTriggerTimestamp,
    knowabilityTimestamp: ev.knownAtTimestamp,
    triggerBarIndex: ev.ltfTriggerBarIndex,
    sourceContext: "MSL-7C",
    leg: "LTF",
    inReplayWindow: inWindow,
    visibleAtEvaluation: visibleAtEvaluation(ev.knownAtTimestamp, T_LTF),
  };
}

function crossTfTouchDedupeKey(ev: CrossTfLiquidityInteractionEvent): string {
  return `${ev.htfPoolId}:${ev.ltfTriggerBarIndex}`;
}

function wickTouchDedupeKey(poolId: string, triggerBarIndex: number): string {
  return `${poolId}:${triggerBarIndex}`;
}

function collectLegEvents(input: {
  candles: readonly Candle[];
  timeframeId: string;
  leg: "HTF" | "LTF";
  E: number;
  horizon: number;
  T_LTF: number;
  swingConfig: BuildMarketStructureMtfEventOrderingContextInput["swingConfig"];
  visibleBreakIds: ReadonlySet<string> | null;
  skipWickTouchKeys: ReadonlySet<string>;
}): NormalizedMtfOrderingEvent[] {
  const {
    candles,
    timeframeId,
    leg,
    E,
    horizon,
    T_LTF,
    swingConfig,
    visibleBreakIds,
    skipWickTouchKeys,
  } = input;
  const events: NormalizedMtfOrderingEvent[] = [];
  const E_struct = Math.min(E + horizon, candles.length - 1);

  const snapshotAtE = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig,
  });

  const liquidityCtx = buildMarketStructureLiquidityInteractionContext({
    snapshot: snapshotAtE,
    candles,
    horizonBars: horizon,
  });

  for (const ev of liquidityCtx.events) {
    const key = wickTouchDedupeKey(ev.poolId, ev.triggerBarIndex);
    if (skipWickTouchKeys.has(key)) {
      continue;
    }
    const norm = normalizeLiquidityInteraction(
      ev,
      candles,
      timeframeId,
      leg,
      E,
      horizon,
      T_LTF
    );
    if (norm) {
      pushNormalized(events, norm);
    }
  }

  const advancedCtx = buildMarketStructureLiquidityAdvancedInteractionContext({
    snapshot: snapshotAtE,
    candles,
    horizonBars: horizon,
  });

  for (const ev of advancedCtx.events) {
    const norm = normalizeAdvancedLiquidity(
      ev,
      candles,
      timeframeId,
      leg,
      E,
      horizon,
      T_LTF
    );
    if (norm) {
      pushNormalized(events, norm);
    }
  }

  const snapshotExtended = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E_struct,
    swingConfig,
  });

  const breakCtx = buildMarketStructureBreakContext({
    snapshot: snapshotExtended,
    candles,
  });

  for (const ev of breakCtx.classifiedEvents) {
    const norm = normalizeStructureEvent(
      ev,
      candles,
      timeframeId,
      leg,
      E,
      horizon,
      T_LTF,
      visibleBreakIds
    );
    if (norm) {
      pushNormalized(events, norm);
    }
  }

  const mssCtx = buildMarketStructureMssContext({
    snapshot: snapshotExtended,
  });

  for (const ev of mssCtx.events) {
    const norm = normalizeMssEvent(
      ev,
      candles,
      timeframeId,
      leg,
      E,
      horizon,
      T_LTF
    );
    if (norm) {
      pushNormalized(events, norm);
    }
  }

  events.sort(compareNormalizedEvents);
  return events;
}

export function compareNormalizedEvents(
  a: NormalizedMtfOrderingEvent,
  b: NormalizedMtfOrderingEvent
): number {
  if (a.orderingTimestamp !== b.orderingTimestamp) {
    return a.orderingTimestamp - b.orderingTimestamp;
  }
  if (a.eventFamily !== b.eventFamily) {
    return a.eventFamily.localeCompare(b.eventFamily);
  }
  return a.eventId.localeCompare(b.eventId);
}

function compareRelations(
  a: CrossTfEventOrderingRelation,
  b: CrossTfEventOrderingRelation
): number {
  const htfTsA = a.htfOrderingTimestamp ?? 0;
  const htfTsB = b.htfOrderingTimestamp ?? 0;
  if (htfTsA !== htfTsB) {
    return htfTsA - htfTsB;
  }
  const ltfTsA = a.ltfOrderingTimestamp ?? 0;
  const ltfTsB = b.ltfOrderingTimestamp ?? 0;
  if (ltfTsA !== ltfTsB) {
    return ltfTsA - ltfTsB;
  }
  return a.relationId.localeCompare(b.relationId);
}

function buildRelations(
  htfEvents: readonly NormalizedMtfOrderingEvent[],
  ltfEvents: readonly NormalizedMtfOrderingEvent[]
): CrossTfEventOrderingRelation[] {
  const seen = new Set<string>();
  const relations: CrossTfEventOrderingRelation[] = [];

  for (const htf of htfEvents) {
    for (const ltf of ltfEvents) {
      const relationId = buildCrossTfRelationId(htf.eventId, ltf.eventId);
      if (seen.has(relationId)) {
        continue;
      }
      seen.add(relationId);
      const ordering = resolveHtfToLtfOrderingRelation(
        htf.orderingTimestamp,
        ltf.orderingTimestamp
      );
      relations.push({
        relationId,
        ruleId: MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
        comparisonRuleId: MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
        htfEventId: htf.eventId,
        ltfEventId: ltf.eventId,
        htfEventFamily: htf.eventFamily,
        ltfEventFamily: ltf.eventFamily,
        ordering,
        htfOrderingTimestamp: htf.orderingTimestamp,
        ltfOrderingTimestamp: ltf.orderingTimestamp,
        visibleAtEvaluation: htf.visibleAtEvaluation && ltf.visibleAtEvaluation,
        evidenceTag: "DESCRIPTIVE_TEMPORAL_ORDER",
      });
    }
  }

  relations.sort(compareRelations);
  return relations;
}

function emptyContext(
  input: BuildMarketStructureMtfEventOrderingContextInput,
  horizon: number,
  unresolved: MtfEventOrderingUnresolvedReason[],
  T_LTF: number,
  E_LTF: number
): MarketStructureMtfEventOrderingContext {
  const ltfTf = normalizeTimeframeId(input.ltfTimeframeId);
  const htfTf = normalizeTimeframeId(input.htfTimeframeId);
  return {
    schemaVersion: MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
    ruleIds: {
      ordering: MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    horizonBars: horizon,
    htfSourceTrack: resolveHtfSourceTrack(input),
    htfEvents: [],
    ltfEvents: [],
    relations: [],
    evaluationRelations: [],
    unresolved,
    limitations: [...STANDARD_LIMITATIONS],
  };
}

/**
 * MSL-9C: descriptive cross-TF temporal event ordering (HTF → LTF), no causation.
 */
export function buildMarketStructureMtfEventOrderingContext(
  input: BuildMarketStructureMtfEventOrderingContextInput
): MarketStructureMtfEventOrderingContext {
  const horizon = resolveHorizonBars(input.horizonBars);
  const mtf = buildMarketStructureMtfAlignmentContext(input);
  const E_LTF = mtf.ltf.evaluationBarIndex;
  const T_LTF = mtf.ltf.evaluationTimestamp;
  const ltfTf = mtf.ltf.timeframeId;
  const unresolved: MtfEventOrderingUnresolvedReason[] = [];

  for (const u of mtf.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  if (!mtf.htf || !mtf.visibility || !mtf.alignment.causal) {
    unresolved.push({
      code: "HTF_EVENT_ORDERING_CONTEXT_UNAVAILABLE",
      message:
        "HTF causal context unavailable; cross-TF event ordering incomplete.",
    });
    return emptyContext(input, horizon, unresolved, T_LTF, E_LTF);
  }

  const E_HTF = mtf.htf.evaluationBarIndex;
  const htfTf = mtf.htf.timeframeId;
  const htfPrefix = input.htfCandles.slice(0, E_HTF + 1);
  const visibleBreakIds = new Set(mtf.visibility.breakClassifiedEventIds);

  const crossTfCtx = buildMarketStructureCrossTfLiquidityInteractionContext({
    ltfCandles: input.ltfCandles,
    htfCandles: input.htfCandles,
    ltfTimeframeId: input.ltfTimeframeId,
    htfTimeframeId: input.htfTimeframeId,
    ltfEvaluationBarIndex: E_LTF,
    horizonBars: horizon,
    swingConfig: input.swingConfig,
  });

  const skipWickTouchKeys = new Set<string>();
  for (const ctf of crossTfCtx.events) {
    skipWickTouchKeys.add(crossTfTouchDedupeKey(ctf));
  }

  const ltfEvents = collectLegEvents({
    candles: input.ltfCandles,
    timeframeId: ltfTf,
    leg: "LTF",
    E: E_LTF,
    horizon,
    T_LTF,
    swingConfig: input.swingConfig,
    visibleBreakIds: null,
    skipWickTouchKeys,
  });

  for (const ctf of crossTfCtx.events) {
    const norm = normalizeCrossTfTouch(
      ctf,
      ltfTf,
      E_LTF,
      horizon,
      input.ltfCandles.length - 1,
      T_LTF
    );
    if (norm) {
      ltfEvents.push(norm);
    }
  }
  ltfEvents.sort(compareNormalizedEvents);

  const htfEvents = collectLegEvents({
    candles: htfPrefix,
    timeframeId: htfTf,
    leg: "HTF",
    E: E_HTF,
    horizon,
    T_LTF,
    swingConfig: input.swingConfig,
    visibleBreakIds,
    skipWickTouchKeys: new Set(),
  });

  const relations = buildRelations(htfEvents, ltfEvents);
  const evaluationRelations = relations.filter((r) => r.visibleAtEvaluation);

  const limitations: string[] = [...STANDARD_LIMITATIONS];
  if (resolveHtfSourceTrack(input) === "NATIVE_HTF") {
    limitations.push("native_htf_input_declared_not_parity_validated");
  }

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_EVENT_ORDERING_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
    ruleIds: {
      ordering: MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
      comparison: MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex: E_LTF,
    ltfEvaluationTimestamp: T_LTF,
    htfEvaluationBarIndex: E_HTF,
    htfEvaluationTimestamp: mtf.htf.evaluationTimestamp,
    horizonBars: horizon,
    htfSourceTrack: resolveHtfSourceTrack(input),
    htfEvents,
    ltfEvents,
    relations,
    evaluationRelations,
    unresolved,
    limitations,
  };
}
