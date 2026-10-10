import type { Candle, SwingType } from "../types";
import type {
  MarketStructureProtectedContext,
  MarketStructureSnapshot,
  MarketStructureSwingAnnotation,
  ProtectedLevelCandidate,
} from "./market-structure-types";
import {
  MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_PRICE_EPS,
  MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID,
  MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
  MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
  MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_RULE_ID,
  MARKET_STRUCTURE_BREAK_CONTEXT_SCHEMA_VERSION,
  type BreakDirection,
  type BreakObservation,
  type BreakReferenceRegistryEntry,
  type BreakReferenceSourceKind,
  type BreakUnresolvedReason,
  type ClassifiedStructureEvent,
  type MarketStructureBreakContext,
} from "./market-structure-break-types";

export {
  MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_BREAK_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_PRICE_EPS,
  MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID,
  MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
  MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
  MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_RULE_ID,
} from "./market-structure-break-types";

export type {
  BreakObservation,
  BreakReferenceRegistryEntry,
  BreakUnresolvedReason,
  ClassifiedStructureEvent,
  MarketStructureBreakContext,
} from "./market-structure-break-types";

export type MarketStructureSnapshotForBreak = Omit<
  MarketStructureSnapshot,
  "break" | "liquidity"
>;

export interface BuildMarketStructureBreakContextInput {
  snapshot: MarketStructureSnapshotForBreak;
  /** Full series; only indices [0..evaluationBarIndex] are read. */
  candles: readonly Candle[];
}

const STANDARD_LIMITATIONS = [
  "break_rule_is_research_only",
  "not_production_invalidation",
  "mss_not_in_msl4_v1",
  `break_context_rule_id=${MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID}`,
] as const;

function registryKey(type: SwingType, pivotIndex: number): string {
  return `${type}:${pivotIndex}`;
}

function allAnnotations(
  snapshot: MarketStructureSnapshotForBreak
): MarketStructureSwingAnnotation[] {
  return [
    ...snapshot.zigzag.externalStructure,
    ...snapshot.zigzag.internalStructure,
  ];
}

function annotationForPivot(
  snapshot: MarketStructureSnapshotForBreak,
  pivotIndex: number,
  type: SwingType
): MarketStructureSwingAnnotation | null {
  return (
    allAnnotations(snapshot).find(
      (a) => a.pivotIndex === pivotIndex && a.type === type
    ) ?? null
  );
}

function metadataForPivot(
  snapshot: MarketStructureSnapshotForBreak,
  pivotIndex: number,
  type: SwingType,
  knownAtFallback: number
): Pick<
  BreakReferenceRegistryEntry,
  "referenceScope" | "referenceStructureLabel" | "referenceKnownAtBarIndex"
> {
  const ann = annotationForPivot(snapshot, pivotIndex, type);
  return {
    referenceScope: ann?.scope ?? "UNRESOLVED",
    referenceStructureLabel: ann?.structureLabel ?? "UNKNOWN",
    referenceKnownAtBarIndex: ann?.knownAtBarIndex ?? knownAtFallback,
  };
}

function mergeRegistryEntry(
  map: Map<string, BreakReferenceRegistryEntry>,
  partial: Omit<BreakReferenceRegistryEntry, "referenceSources"> & {
    addSource: BreakReferenceSourceKind;
  }
): void {
  const key = registryKey(partial.referenceType, partial.referencePivotIndex);
  const existing = map.get(key);
  const sources = existing
    ? [...new Set([...existing.referenceSources, partial.addSource])].sort()
    : [partial.addSource];
  const protectedCodes = [
    ...new Set([
      ...(existing?.sourceProtectedReasonCodes ?? []),
      ...(partial.sourceProtectedReasonCodes ?? []),
    ]),
  ].sort() as BreakReferenceRegistryEntry["sourceProtectedReasonCodes"];

  map.set(key, {
    referencePivotIndex: partial.referencePivotIndex,
    referencePrice: partial.referencePrice,
    referenceType: partial.referenceType,
    referenceKnownAtBarIndex: Math.max(
      existing?.referenceKnownAtBarIndex ?? 0,
      partial.referenceKnownAtBarIndex
    ),
    referenceScope:
      existing?.referenceScope === "UNRESOLVED"
        ? partial.referenceScope
        : existing?.referenceScope ?? partial.referenceScope,
    referenceStructureLabel:
      existing?.referenceStructureLabel === "UNKNOWN"
        ? partial.referenceStructureLabel
        : existing?.referenceStructureLabel ?? partial.referenceStructureLabel,
    referenceSources: sources,
    sourceProtectedReasonCodes:
      (protectedCodes?.length ?? 0) > 0 ? protectedCodes : undefined,
  });
}

function addProtectedToRegistry(
  map: Map<string, BreakReferenceRegistryEntry>,
  snapshot: MarketStructureSnapshotForBreak,
  candidate: ProtectedLevelCandidate
): void {
  const meta = metadataForPivot(
    snapshot,
    candidate.pivotIndex,
    candidate.type,
    candidate.protectedStatusKnownAtBarIndex
  );
  mergeRegistryEntry(map, {
    ...meta,
    referencePivotIndex: candidate.pivotIndex,
    referencePrice: candidate.price,
    referenceType: candidate.type,
    referenceKnownAtBarIndex: Math.max(
      meta.referenceKnownAtBarIndex,
      candidate.protectedStatusKnownAtBarIndex
    ),
    referenceScope: candidate.scope ?? meta.referenceScope,
    referenceStructureLabel:
      candidate.structureLabelAtSelection ?? meta.referenceStructureLabel,
    sourceProtectedReasonCodes: [...candidate.selectionReasonCodes],
    addSource: "PROTECTED",
  });
}

function buildReferenceRegistry(
  snapshot: MarketStructureSnapshotForBreak
): BreakReferenceRegistryEntry[] {
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  const map = new Map<string, BreakReferenceRegistryEntry>();

  for (const swing of snapshot.confirmedSwings) {
    if (swing.index + rightBars > E) {
      continue;
    }
    const knownAt = swing.index + rightBars;
    const meta = metadataForPivot(snapshot, swing.index, swing.type, knownAt);
    mergeRegistryEntry(map, {
      ...meta,
      referencePivotIndex: swing.index,
      referencePrice: swing.price,
      referenceType: swing.type,
      referenceKnownAtBarIndex: knownAt,
      addSource: "SWING",
    });
    const ann = annotationForPivot(snapshot, swing.index, swing.type);
    if (ann && ann.equalStructureDiagnostic !== "NONE") {
      mergeRegistryEntry(map, {
        ...meta,
        referencePivotIndex: swing.index,
        referencePrice: swing.price,
        referenceType: swing.type,
        referenceKnownAtBarIndex: knownAt,
        addSource: "EQUAL_DIAGNOSTIC",
      });
    }
  }

  for (const c of snapshot.protected.protectedHighs) {
    if (c.protectedStatusKnownAtBarIndex <= E) {
      addProtectedToRegistry(map, snapshot, c);
    }
  }
  for (const c of snapshot.protected.protectedLows) {
    if (c.protectedStatusKnownAtBarIndex <= E) {
      addProtectedToRegistry(map, snapshot, c);
    }
  }

  for (const pair of snapshot.structurePairs) {
    if (pair.knownAtBarIndex > E) {
      continue;
    }
    const kind = pair.kind;
    for (const [pivotIndex, price] of [
      [pair.fromIndex, pair.fromPrice],
      [pair.toIndex, pair.toPrice],
    ] as const) {
      const knownAt = pivotIndex + rightBars;
      if (knownAt > E) {
        continue;
      }
      const meta = metadataForPivot(snapshot, pivotIndex, kind, knownAt);
      mergeRegistryEntry(map, {
        ...meta,
        referencePivotIndex: pivotIndex,
        referencePrice: price,
        referenceType: kind,
        referenceKnownAtBarIndex: knownAt,
        addSource: "PAIR_ENDPOINT",
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.referencePivotIndex !== b.referencePivotIndex) {
      return a.referencePivotIndex - b.referencePivotIndex;
    }
    return a.referenceType.localeCompare(b.referenceType);
  });
}

function wickTriggers(
  referenceType: SwingType,
  referencePrice: number,
  candle: Candle
): boolean {
  if (referenceType === "HIGH") {
    return candle.high >= referencePrice - MARKET_STRUCTURE_BREAK_PRICE_EPS;
  }
  return candle.low <= referencePrice + MARKET_STRUCTURE_BREAK_PRICE_EPS;
}

function directionForType(referenceType: SwingType): BreakDirection {
  return referenceType === "HIGH" ? "UP" : "DOWN";
}

function scanBreakObservations(
  registry: readonly BreakReferenceRegistryEntry[],
  candles: readonly Candle[],
  E: number
): BreakObservation[] {
  const observations: BreakObservation[] = [];
  for (const ref of registry) {
    if (ref.referenceKnownAtBarIndex > E) {
      continue;
    }
    const direction = directionForType(ref.referenceType);
    let triggerBarIndex: number | null = null;
    for (
      let i = ref.referenceKnownAtBarIndex;
      i <= E && i < candles.length;
      i++
    ) {
      if (wickTriggers(ref.referenceType, ref.referencePrice, candles[i])) {
        triggerBarIndex = i;
        break;
      }
    }
    if (triggerBarIndex === null) {
      continue;
    }
    const observationId = `bo:${ref.referencePivotIndex}:${ref.referenceType}:${triggerBarIndex}:${direction}`;
    observations.push({
      observationId,
      ruleId: MARKET_STRUCTURE_BREAK_OBSERVATION_RULE_ID,
      referencePivotIndex: ref.referencePivotIndex,
      referencePrice: ref.referencePrice,
      referenceType: ref.referenceType,
      referenceKnownAtBarIndex: ref.referenceKnownAtBarIndex,
      referenceScope: ref.referenceScope,
      referenceStructureLabel: ref.referenceStructureLabel,
      referenceSources: ref.referenceSources,
      sourceProtectedReasonCodes: ref.sourceProtectedReasonCodes,
      direction,
      triggerBarIndex,
      triggerKind: "WICK_INCLUSIVE_V1",
      knownAtBarIndex: triggerBarIndex,
      confirmationBarIndex: null,
      evidenceTag: "DIRECT_OBSERVATION",
    });
  }
  observations.sort((a, b) => {
    if (a.triggerBarIndex !== b.triggerBarIndex) {
      return a.triggerBarIndex - b.triggerBarIndex;
    }
    if (a.referencePivotIndex !== b.referencePivotIndex) {
      return a.referencePivotIndex - b.referencePivotIndex;
    }
    return a.referenceType.localeCompare(b.referenceType);
  });
  return observations;
}

function classifyEvents(
  observations: readonly BreakObservation[],
  trendContext: MarketStructureProtectedContext["trendContext"]
): ClassifiedStructureEvent[] {
  const events: ClassifiedStructureEvent[] = [];
  for (const obs of observations) {
    let eventType: ClassifiedStructureEvent["eventType"] | null = null;
    let classificationRuleId: ClassifiedStructureEvent["classificationRuleId"] | null =
      null;

    if (
      trendContext === "BULLISH" &&
      obs.direction === "UP" &&
      obs.referenceType === "HIGH"
    ) {
      eventType = "BOS";
      classificationRuleId = MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID;
    } else if (
      trendContext === "BEARISH" &&
      obs.direction === "DOWN" &&
      obs.referenceType === "LOW"
    ) {
      eventType = "BOS";
      classificationRuleId = MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID;
    } else if (
      trendContext === "BULLISH" &&
      obs.direction === "DOWN" &&
      obs.referenceType === "LOW"
    ) {
      eventType = "CHoCH";
      classificationRuleId = MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID;
    } else if (
      trendContext === "BEARISH" &&
      obs.direction === "UP" &&
      obs.referenceType === "HIGH"
    ) {
      eventType = "CHoCH";
      classificationRuleId = MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID;
    }

    if (!eventType || !classificationRuleId) {
      continue;
    }

    events.push({
      eventId: `ce:${eventType}:${obs.observationId}`,
      eventType,
      classificationRuleId,
      derivedFromObservationId: obs.observationId,
      evidenceTag: "RULE_CLASSIFICATION",
      direction: obs.direction,
      referencePivotIndex: obs.referencePivotIndex,
      referencePrice: obs.referencePrice,
      referenceType: obs.referenceType,
      referenceScope: obs.referenceScope,
      triggerBarIndex: obs.triggerBarIndex,
      knownAtBarIndex: obs.knownAtBarIndex,
      trendContextAtClassification: trendContext,
    });
  }
  return events;
}

function collectProtectedAmbiguity(
  protectedCtx: MarketStructureProtectedContext,
  classifiedEvents: readonly ClassifiedStructureEvent[],
  observations: readonly BreakObservation[]
): BreakUnresolvedReason[] {
  const unresolved: BreakUnresolvedReason[] = [];
  const multiLow = protectedCtx.unresolved.some(
    (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
  );
  const multiHigh = protectedCtx.unresolved.some(
    (u) => u.code === "MULTIPLE_PROTECTED_HIGH_CANDIDATES_NO_SINGLE_SELECTION"
  );

  const protectedObsIds = new Set(
    observations
      .filter((o) => o.referenceSources.includes("PROTECTED"))
      .map((o) => o.observationId)
  );

  const chochFromProtected = classifiedEvents.filter(
    (e) =>
      e.eventType === "CHoCH" && protectedObsIds.has(e.derivedFromObservationId)
  );

  if (multiLow && trendLowChochCount(chochFromProtected, "DOWN") > 1) {
    unresolved.push({
      code: "CLASSIFICATION_PROTECTED_AMBIGUITY",
      message:
        "Multiple protected LOW references yield CHoCH classifications; no single selection applied.",
    });
  }
  if (multiHigh && trendHighChochCount(chochFromProtected, "UP") > 1) {
    unresolved.push({
      code: "CLASSIFICATION_PROTECTED_AMBIGUITY",
      message:
        "Multiple protected HIGH references yield CHoCH classifications; no single selection applied.",
    });
  }
  return unresolved;
}

function trendLowChochCount(
  events: readonly ClassifiedStructureEvent[],
  direction: BreakDirection
): number {
  return events.filter((e) => e.direction === direction).length;
}

function trendHighChochCount(
  events: readonly ClassifiedStructureEvent[],
  direction: BreakDirection
): number {
  return events.filter((e) => e.direction === direction).length;
}

function collectBreakLimitations(
  snapshot: MarketStructureSnapshotForBreak,
  registryCount: number
): string[] {
  const limitations: string[] = [...STANDARD_LIMITATIONS];
  limitations.push(
    `break_trigger_rule_id=${MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID}`
  );
  limitations.push(
    `break_reference_rule_id=${MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID}`
  );
  if (registryCount === 0 && snapshot.confirmedSwings.length === 0) {
    limitations.push("NO_REFERENCE_REGISTRY_ENTRIES");
  }
  return limitations;
}

/**
 * MSL-4 research break observations + BOS/CHoCH classification (consumes MSL-1/2/3 snapshot + OHLC slice).
 */
export function buildMarketStructureBreakContext(
  input: BuildMarketStructureBreakContextInput
): MarketStructureBreakContext {
  const { snapshot, candles } = input;
  const E = snapshot.evaluationBarIndex;
  if (E < 0 || E >= candles.length) {
    throw new Error(
      `evaluationBarIndex ${E} out of bounds for candle length ${candles.length}.`
    );
  }

  const trendContext = snapshot.protected.trendContext;
  const referenceRegistry = buildReferenceRegistry(snapshot);
  const effective = candles.slice(0, E + 1);
  const breakObservations = scanBreakObservations(referenceRegistry, effective, E);
  const classifiedEvents = classifyEvents(breakObservations, trendContext);

  const unresolved: BreakUnresolvedReason[] = [
    ...collectProtectedAmbiguity(
      snapshot.protected,
      classifiedEvents,
      breakObservations
    ),
  ];

  return {
    schemaVersion: MARKET_STRUCTURE_BREAK_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    trendContext,
    ruleIds: {
      trigger: MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
      reference: MARKET_STRUCTURE_BREAK_REFERENCE_REGISTRY_RULE_ID,
      bos: MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
      choch: MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
      protectedConsume: MARKET_STRUCTURE_PROTECTED_BREAK_CONSUME_RULE_ID,
    },
    referenceRegistry,
    breakObservations,
    classifiedEvents,
    unresolved,
    limitations: collectBreakLimitations(snapshot, referenceRegistry.length),
  };
}
