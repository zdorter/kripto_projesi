import { detectTrend } from "../trend-detector";
import type { SwingPoint, SwingType, TrendDirection } from "../types";
import type {
  MarketStructurePairSnapshot,
  MarketStructureProtectedContext,
  MarketStructureScope,
  MarketStructureSnapshot,
  MarketStructureSwingAnnotation,
  MarketStructureSwingLabel,
  ProtectedLevelCandidate,
  ProtectedLevelCandidateStatusAtE,
  ProtectedLevelSelectionReasonCode,
  UnresolvedProtectedReason,
} from "./market-structure-types";
import { MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID } from "./market-structure-types";

export { MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID } from "./market-structure-types";

const STANDARD_PROTECTED_LIMITATIONS = [
  "protected_rule_is_research_only",
  "not_bos_choch",
  "not_liquidity",
  "not_production_invalidation",
  "protected_not_equal_hh_hl",
  "no_future_data_for_status",
  "multiple_candidates_may_remain_unresolved",
  "protected_rule_id=MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_V1",
  `protected_rule_id=${MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID}`,
] as const;

export type MarketStructureSnapshotForProtected = Omit<
  MarketStructureSnapshot,
  "protected" | "break" | "liquidity"
>;

export interface BuildMarketStructureProtectedContextInput {
  snapshot: MarketStructureSnapshotForProtected;
}

function swingByIndex(
  swings: readonly SwingPoint[],
  index: number,
  type: SwingType
): SwingPoint | null {
  return swings.find((s) => s.index === index && s.type === type) ?? null;
}

function allAnnotations(
  snapshot: MarketStructureSnapshotForProtected
): MarketStructureSwingAnnotation[] {
  return [
    ...snapshot.zigzag.externalStructure,
    ...snapshot.zigzag.internalStructure,
  ];
}

function annotationForPivot(
  snapshot: MarketStructureSnapshotForProtected,
  pivotIndex: number,
  type: SwingType
): MarketStructureSwingAnnotation | null {
  return (
    allAnnotations(snapshot).find(
      (a) => a.pivotIndex === pivotIndex && a.type === type
    ) ?? null
  );
}

function candidateKey(type: SwingType, pivotIndex: number): string {
  return `${type}:${pivotIndex}`;
}

function mergeCandidate(
  map: Map<string, ProtectedLevelCandidate>,
  next: ProtectedLevelCandidate
): void {
  const key = candidateKey(next.type, next.pivotIndex);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, next);
    return;
  }
  const codes = [
    ...new Set([...existing.selectionReasonCodes, ...next.selectionReasonCodes]),
  ].sort() as ProtectedLevelSelectionReasonCode[];
  map.set(key, {
    ...existing,
    selectionReasonCodes: codes,
    protectedStatusKnownAtBarIndex: Math.max(
      existing.protectedStatusKnownAtBarIndex,
      next.protectedStatusKnownAtBarIndex
    ),
    scope: existing.scope === "UNRESOLVED" ? next.scope : existing.scope,
    structureLabelAtSelection:
      existing.structureLabelAtSelection === "UNKNOWN"
        ? next.structureLabelAtSelection
        : existing.structureLabelAtSelection,
  });
}

function buildCandidateFromSwing(
  swing: SwingPoint,
  rightBars: number,
  evaluationBarIndex: number,
  protectedStatusKnownAtBarIndex: number,
  reasonCodes: ProtectedLevelSelectionReasonCode[],
  snapshot: MarketStructureSnapshotForProtected,
  statusAtE: ProtectedLevelCandidateStatusAtE = "CANDIDATE"
): ProtectedLevelCandidate | null {
  const confirmation = swing.index + rightBars;
  if (confirmation > evaluationBarIndex) {
    return null;
  }
  if (protectedStatusKnownAtBarIndex > evaluationBarIndex) {
    return null;
  }
  const ann = annotationForPivot(snapshot, swing.index, swing.type);
  const scope: MarketStructureScope = ann?.scope ?? "UNRESOLVED";
  const structureLabel: MarketStructureSwingLabel =
    ann?.structureLabel ?? "UNKNOWN";
  return {
    pivotIndex: swing.index,
    type: swing.type,
    price: swing.price,
    sourceSwingConfirmationBarIndex: confirmation,
    protectedStatusKnownAtBarIndex,
    selectionReasonCodes: [...reasonCodes].sort(),
    scope,
    structureLabelAtSelection: structureLabel,
    statusAtE,
  };
}

function lastLowPair(
  pairs: readonly MarketStructurePairSnapshot[],
  structure: "HL" | "LL"
): MarketStructurePairSnapshot | null {
  let found: MarketStructurePairSnapshot | null = null;
  for (const p of pairs) {
    if (p.kind === "LOW" && p.structure === structure) {
      found = p;
    }
  }
  return found;
}

function lastHighPair(
  pairs: readonly MarketStructurePairSnapshot[],
  structure: "LH" | "HH"
): MarketStructurePairSnapshot | null {
  let found: MarketStructurePairSnapshot | null = null;
  for (const p of pairs) {
    if (p.kind === "HIGH" && p.structure === structure) {
      found = p;
    }
  }
  return found;
}

function lastExternalSpineSwing(
  snapshot: MarketStructureSnapshotForProtected,
  type: SwingType
): MarketStructureSwingAnnotation | null {
  const spine = snapshot.zigzag.externalStructure.filter((s) => s.type === type);
  return spine.length > 0 ? spine[spine.length - 1] : null;
}

function emitC3Candidates(
  map: Map<string, ProtectedLevelCandidate>,
  snapshot: MarketStructureSnapshotForProtected,
  trend: TrendDirection
): void {
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  const swings = snapshot.confirmedSwings;

  if (trend === "BULLISH") {
    const pair = lastLowPair(snapshot.structurePairs, "HL");
    if (!pair) {
      return;
    }
    const toSwing = swingByIndex(swings, pair.toIndex, "LOW");
    if (!toSwing) {
      return;
    }
    const c = buildCandidateFromSwing(
      toSwing,
      rightBars,
      E,
      pair.knownAtBarIndex,
      ["C3_STRUCTURE_LABEL"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  } else if (trend === "BEARISH") {
    const pair = lastHighPair(snapshot.structurePairs, "LH");
    if (!pair) {
      return;
    }
    const toSwing = swingByIndex(swings, pair.toIndex, "HIGH");
    if (!toSwing) {
      return;
    }
    const c = buildCandidateFromSwing(
      toSwing,
      rightBars,
      E,
      pair.knownAtBarIndex,
      ["C3_STRUCTURE_LABEL"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  }
}

function emitC5Candidates(
  map: Map<string, ProtectedLevelCandidate>,
  snapshot: MarketStructureSnapshotForProtected,
  trend: TrendDirection
): void {
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  const swings = snapshot.confirmedSwings;

  if (trend === "BULLISH") {
    const ann = lastExternalSpineSwing(snapshot, "LOW");
    if (!ann || ann.knownAtBarIndex > E) {
      return;
    }
    const swing = swingByIndex(swings, ann.pivotIndex, "LOW");
    if (!swing) {
      return;
    }
    const c = buildCandidateFromSwing(
      swing,
      rightBars,
      E,
      ann.knownAtBarIndex,
      ["C5_EXTERNAL_SPINE"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  } else if (trend === "BEARISH") {
    const ann = lastExternalSpineSwing(snapshot, "HIGH");
    if (!ann || ann.knownAtBarIndex > E) {
      return;
    }
    const swing = swingByIndex(swings, ann.pivotIndex, "HIGH");
    if (!swing) {
      return;
    }
    const c = buildCandidateFromSwing(
      swing,
      rightBars,
      E,
      ann.knownAtBarIndex,
      ["C5_EXTERNAL_SPINE"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  }
}

function emitC6Candidates(
  map: Map<string, ProtectedLevelCandidate>,
  snapshot: MarketStructureSnapshotForProtected,
  trend: TrendDirection
): void {
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  const swings = snapshot.confirmedSwings;

  if (trend === "BULLISH") {
    const pair = lastLowPair(snapshot.structurePairs, "HL");
    if (!pair) {
      return;
    }
    const fromSwing = swingByIndex(swings, pair.fromIndex, "LOW");
    if (!fromSwing) {
      return;
    }
    const c = buildCandidateFromSwing(
      fromSwing,
      rightBars,
      E,
      pair.knownAtBarIndex,
      ["C6_STRUCTURE_PAIR_FROM"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  } else if (trend === "BEARISH") {
    const pair = lastHighPair(snapshot.structurePairs, "LH");
    if (!pair) {
      return;
    }
    const fromSwing = swingByIndex(swings, pair.fromIndex, "HIGH");
    if (!fromSwing) {
      return;
    }
    const c = buildCandidateFromSwing(
      fromSwing,
      rightBars,
      E,
      pair.knownAtBarIndex,
      ["C6_STRUCTURE_PAIR_FROM"],
      snapshot
    );
    if (c) {
      mergeCandidate(map, c);
    }
  }
}

function collectUnresolved(
  snapshot: MarketStructureSnapshotForProtected,
  trend: TrendDirection,
  lowCandidates: ProtectedLevelCandidate[],
  highCandidates: ProtectedLevelCandidate[]
): UnresolvedProtectedReason[] {
  const unresolved: UnresolvedProtectedReason[] = [];
  const E = snapshot.evaluationBarIndex;

  if (snapshot.confirmedSwings.length === 0) {
    unresolved.push({
      code: "NO_CONFIRMED_SWINGS",
      message: "No confirmed swings at evaluation bar; no protected candidates emitted.",
    });
  } else if (snapshot.confirmedSwings.length === 1) {
    unresolved.push({
      code: "SINGLE_CONFIRMED_SWING_ONLY",
      message: "Single confirmed swing; insufficient structure for protected research candidates.",
    });
  }

  if (trend === "NEUTRAL") {
    unresolved.push({
      code: "TREND_NEUTRAL",
      message:
        "Trend is NEUTRAL; C3/C5/C6 low/high side candidates are not emitted (read-only trend context).",
    });
  }

  if (trend === "BULLISH" && lowCandidates.length === 0 && snapshot.confirmedSwings.length >= 2) {
    unresolved.push({
      code: "INSUFFICIENT_BULLISH_LOW_CANDIDATES",
      message:
        "Bullish context but no causal HL low / external spine / pair-from candidates at E.",
    });
  }

  if (trend === "BEARISH" && highCandidates.length === 0 && snapshot.confirmedSwings.length >= 2) {
    unresolved.push({
      code: "INSUFFICIENT_BEARISH_HIGH_CANDIDATES",
      message:
        "Bearish context but no causal LH high / external spine / pair-from candidates at E.",
    });
  }

  if (trend === "BULLISH" && lowCandidates.length > 1) {
    unresolved.push({
      code: "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION",
      message: `${lowCandidates.length} distinct protected low candidates at E=${E}; no deterministic tie-break applied.`,
    });
  }

  if (trend === "BEARISH" && highCandidates.length > 1) {
    unresolved.push({
      code: "MULTIPLE_PROTECTED_HIGH_CANDIDATES_NO_SINGLE_SELECTION",
      message: `${highCandidates.length} distinct protected high candidates at E=${E}; no deterministic tie-break applied.`,
    });
  }

  return unresolved;
}

/**
 * MSL-3 research-only protected level candidates (consumes MSL-1/MSL-2 snapshot only).
 */
export function buildMarketStructureProtectedContext(
  input: BuildMarketStructureProtectedContextInput
): MarketStructureProtectedContext {
  const snapshot = input.snapshot;
  const trend = detectTrend([...snapshot.confirmedSwings]);
  return buildProtectedContextInner(snapshot, trend);
}

function buildProtectedContextInner(
  snapshot: MarketStructureSnapshotForProtected,
  trend: TrendDirection
): MarketStructureProtectedContext {
  const E = snapshot.evaluationBarIndex;
  const lowMap = new Map<string, ProtectedLevelCandidate>();
  const highMap = new Map<string, ProtectedLevelCandidate>();

  if (trend === "BULLISH") {
    const bullishLow = new Map<string, ProtectedLevelCandidate>();
    emitC3Candidates(bullishLow, snapshot, trend);
    emitC5Candidates(bullishLow, snapshot, trend);
    emitC6Candidates(bullishLow, snapshot, trend);
    for (const c of bullishLow.values()) {
      mergeCandidate(lowMap, c);
    }
  } else if (trend === "BEARISH") {
    const bearishHigh = new Map<string, ProtectedLevelCandidate>();
    emitC3Candidates(bearishHigh, snapshot, trend);
    emitC5Candidates(bearishHigh, snapshot, trend);
    emitC6Candidates(bearishHigh, snapshot, trend);
    for (const c of bearishHigh.values()) {
      mergeCandidate(highMap, c);
    }
  }

  const protectedLows = [...lowMap.values()].sort((a, b) => a.pivotIndex - b.pivotIndex);
  const protectedHighs = [...highMap.values()].sort((a, b) => a.pivotIndex - b.pivotIndex);

  const limitations: string[] = [...STANDARD_PROTECTED_LIMITATIONS];
  limitations.push(`trend_context_read_only=${trend}`);

  const unresolved = collectUnresolved(snapshot, trend, protectedLows, protectedHighs);

  return {
    ruleId: MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    trendContext: trend,
    protectedHighs,
    protectedLows,
    unresolved,
    limitations,
  };
}
