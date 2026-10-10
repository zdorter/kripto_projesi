import type {
  MarketStructureSwingLabel,
  MarketStructureSnapshot,
  ProtectedLevelCandidate,
} from "./market-structure-types";
import type { BreakObservation } from "./market-structure-break-types";
import type { TrendDirection } from "../types";
import {
  MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID,
  MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID,
  MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
  type MarketStructureMssContext,
  type MarketStructureMssEvent,
  type MssDirection,
  type MssPrimaryReferenceKind,
  type MssUnresolvedReason,
} from "./market-structure-mss-types";

export {
  MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID,
  MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID,
  MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
} from "./market-structure-mss-types";

export type {
  MarketStructureMssContext,
  MarketStructureMssEvent,
  MssDirection,
  MssPrimaryReferenceKind,
  MssUnresolvedReason,
} from "./market-structure-mss-types";

const STANDARD_LIMITATIONS = [
  "research_only",
  "not_production_signal",
  "not_changing_msl4",
  "not_bos",
  "not_choch",
  "no_liquidity_causality",
  "no_mtf_mss",
  "no_mss_invalidation",
  "no_grab",
  "no_consumed",
  "no_future_data",
  "protected_ambiguity_can_remain_unresolved",
  "choch_does_not_imply_mss",
  `mss_rule_id=${MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID}`,
] as const;

export type MarketStructureSnapshotForMss = Pick<
  MarketStructureSnapshot,
  | "evaluationBarIndex"
  | "protected"
  | "break"
  | "highStructure"
  | "lowStructure"
  | "zigzag"
  | "structurePairs"
  | "confirmedSwings"
>;

export interface BuildMarketStructureMssContextInput {
  snapshot: MarketStructureSnapshotForMss;
}

function referenceId(
  pivotIndex: number,
  referenceType: BreakObservation["referenceType"]
): string {
  return `${pivotIndex}:${referenceType}`;
}

function buildMssEventId(
  mssDirection: MssDirection,
  pivotIndex: number,
  referenceType: BreakObservation["referenceType"],
  triggerBarIndex: number
): string {
  return `mss:${mssDirection}:${referenceId(pivotIndex, referenceType)}:${triggerBarIndex}`;
}

function protectedCandidateForObservation(
  snapshot: MarketStructureSnapshotForMss,
  obs: BreakObservation
): ProtectedLevelCandidate | null {
  const list =
    obs.referenceType === "HIGH"
      ? snapshot.protected.protectedHighs
      : snapshot.protected.protectedLows;
  return (
    list.find(
      (c) => c.pivotIndex === obs.referencePivotIndex && c.type === obs.referenceType
    ) ?? null
  );
}

function structureTransitionConsistent(
  preTransition: Exclude<TrendDirection, "NEUTRAL">,
  mssDirection: MssDirection,
  candidate: ProtectedLevelCandidate
): boolean {
  const label: MarketStructureSwingLabel =
    candidate.structureLabelAtSelection ?? "UNKNOWN";
  if (label === "UNKNOWN") {
    return false;
  }
  if (preTransition === "BULLISH" && mssDirection === "BEARISH") {
    return candidate.type === "LOW" && (label === "HL" || label === "LL");
  }
  if (preTransition === "BEARISH" && mssDirection === "BULLISH") {
    return candidate.type === "HIGH" && (label === "LH" || label === "HH");
  }
  return false;
}

function classifyMssFromObservation(
  trendContext: TrendDirection,
  obs: BreakObservation,
  candidate: ProtectedLevelCandidate,
  E: number
): MssDirection | null {
  if (trendContext === "NEUTRAL") {
    return null;
  }
  if (!obs.referenceSources.includes("PROTECTED")) {
    return null;
  }
  if (obs.referenceKnownAtBarIndex > E || obs.triggerBarIndex > E) {
    return null;
  }
  if (candidate.protectedStatusKnownAtBarIndex > E) {
    return null;
  }

  let mssDirection: MssDirection | null = null;
  if (
    trendContext === "BULLISH" &&
    obs.direction === "DOWN" &&
    obs.referenceType === "LOW"
  ) {
    mssDirection = "BEARISH";
  } else if (
    trendContext === "BEARISH" &&
    obs.direction === "UP" &&
    obs.referenceType === "HIGH"
  ) {
    mssDirection = "BULLISH";
  } else {
    return null;
  }

  if (
    !structureTransitionConsistent(trendContext, mssDirection, candidate)
  ) {
    return null;
  }

  return mssDirection;
}

function primaryReferenceKind(
  referenceType: BreakObservation["referenceType"]
): MssPrimaryReferenceKind {
  return referenceType === "HIGH" ? "PROTECTED_HIGH" : "PROTECTED_LOW";
}

function collectProtectedAmbiguityBlocks(
  snapshot: MarketStructureSnapshotForMss
): { blockBearishMss: boolean; blockBullishMss: boolean } {
  const unresolved = snapshot.protected.unresolved;
  return {
    blockBearishMss: unresolved.some(
      (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
    ),
    blockBullishMss: unresolved.some(
      (u) => u.code === "MULTIPLE_PROTECTED_HIGH_CANDIDATES_NO_SINGLE_SELECTION"
    ),
  };
}

function toMssEvent(
  obs: BreakObservation,
  mssDirection: MssDirection,
  preTransition: Exclude<TrendDirection, "NEUTRAL">
): MarketStructureMssEvent {
  return {
    eventId: buildMssEventId(
      mssDirection,
      obs.referencePivotIndex,
      obs.referenceType,
      obs.triggerBarIndex
    ),
    ruleId: MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
    classificationRuleId: MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID,
    referenceRuleId: MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID,
    mssDirection,
    preTransitionDirectionalState: preTransition,
    primaryReferenceKind: primaryReferenceKind(obs.referenceType),
    derivedFromObservationId: obs.observationId,
    referencePivotIndex: obs.referencePivotIndex,
    referencePrice: obs.referencePrice,
    referenceType: obs.referenceType,
    referenceKnownAtBarIndex: obs.referenceKnownAtBarIndex,
    referenceScope: obs.referenceScope,
    breakDirection: obs.direction,
    triggerBarIndex: obs.triggerBarIndex,
    knownAtBarIndex: obs.triggerBarIndex,
    confirmationBarIndex: null,
    evidenceTag: "DERIVED_STRUCTURE_TRANSITION",
  };
}

/**
 * MSL-8 research MSS derived context (consumes snapshot.break observations; does not rebuild MSL-4).
 */
export function buildMarketStructureMssContext(
  input: BuildMarketStructureMssContextInput
): MarketStructureMssContext {
  const { snapshot } = input;
  const E = snapshot.evaluationBarIndex;
  const trendContext = snapshot.protected.trendContext;
  const unresolved: MssUnresolvedReason[] = [];
  const events: MarketStructureMssEvent[] = [];
  const seenEventIds = new Set<string>();

  if (trendContext === "NEUTRAL") {
    unresolved.push({
      code: "TREND_CONTEXT_NEUTRAL_NO_MSS",
      message:
        "trendContext is NEUTRAL; canonical MSL-8 V1 does not emit MSS for neutral directional state.",
    });
    return {
      schemaVersion: MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
      evaluationBarIndex: E,
      trendContext,
      events: [],
      unresolved,
      limitations: [...STANDARD_LIMITATIONS],
    };
  }

  const preTransition = trendContext;
  const { blockBearishMss, blockBullishMss } =
    collectProtectedAmbiguityBlocks(snapshot);

  const bearishCandidates: MarketStructureMssEvent[] = [];
  const bullishCandidates: MarketStructureMssEvent[] = [];

  for (const obs of snapshot.break.breakObservations) {
    const candidate = protectedCandidateForObservation(snapshot, obs);
    if (!candidate) {
      continue;
    }
    const mssDirection = classifyMssFromObservation(
      trendContext,
      obs,
      candidate,
      E
    );
    if (!mssDirection) {
      continue;
    }
    const event = toMssEvent(obs, mssDirection, preTransition);
    if (mssDirection === "BEARISH") {
      bearishCandidates.push(event);
    } else {
      bullishCandidates.push(event);
    }
  }

  if (blockBearishMss && bearishCandidates.length > 0) {
    unresolved.push({
      code: "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION",
      message:
        "Multiple protected LOW candidates; MSS classification on protected LOW breaks remains UNRESOLVED.",
    });
  } else {
    for (const event of bearishCandidates) {
      if (seenEventIds.has(event.eventId)) {
        continue;
      }
      seenEventIds.add(event.eventId);
      events.push(event);
    }
  }

  if (blockBullishMss && bullishCandidates.length > 0) {
    unresolved.push({
      code: "MULTIPLE_PROTECTED_HIGH_CANDIDATES_NO_SINGLE_SELECTION",
      message:
        "Multiple protected HIGH candidates; MSS classification on protected HIGH breaks remains UNRESOLVED.",
    });
  } else {
    for (const event of bullishCandidates) {
      if (seenEventIds.has(event.eventId)) {
        continue;
      }
      seenEventIds.add(event.eventId);
      events.push(event);
    }
  }

  events.sort((a, b) => {
    if (a.triggerBarIndex !== b.triggerBarIndex) {
      return a.triggerBarIndex - b.triggerBarIndex;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  return {
    schemaVersion: MARKET_STRUCTURE_MSS_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    trendContext,
    events,
    unresolved,
    limitations: [...STANDARD_LIMITATIONS],
  };
}
