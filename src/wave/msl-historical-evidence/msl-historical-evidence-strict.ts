import { buildMarketStructureMssContext } from "../market-structure/market-structure-mss";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import type { ClassifiedStructureEvent } from "../market-structure/market-structure-break-types";
import type { MarketStructureMssEvent } from "../market-structure/market-structure-mss-types";
import type { MarketStructureSnapshot } from "../market-structure/market-structure-types";
import type {
  MslHistoricalEvidenceLiquidityObservations,
  MslHistoricalEvidenceStrictEventRef,
  MslHistoricalEvidenceStructureObservations,
  MslHistoricalEvidenceMssObservations,
  MslHistoricalEvidenceUnresolved,
} from "./msl-historical-evidence-types";

export function isStrictKnownAtBarIndex(
  knownAtBarIndex: number,
  evaluationBarIndex: number
): boolean {
  return (
    Number.isInteger(knownAtBarIndex) &&
    Number.isInteger(evaluationBarIndex) &&
    knownAtBarIndex <= evaluationBarIndex
  );
}

export function isStrictKnownAtTimestamp(
  knownAtTimestamp: number,
  evaluationTimestamp: number
): boolean {
  return (
    Number.isFinite(knownAtTimestamp) &&
    Number.isFinite(evaluationTimestamp) &&
    knownAtTimestamp <= evaluationTimestamp
  );
}

export function passesStrictKnownAtGate(input: {
  knownAtBarIndex: number;
  knownAtTimestamp: number;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
}): boolean {
  return (
    isStrictKnownAtBarIndex(input.knownAtBarIndex, input.evaluationBarIndex) &&
    isStrictKnownAtTimestamp(input.knownAtTimestamp, input.evaluationTimestamp)
  );
}

function filterBreakEventStrict(
  e: ClassifiedStructureEvent,
  E: number,
  evaluationTimestamp: number,
  candles: readonly { time: number }[]
): MslHistoricalEvidenceStrictEventRef | null {
  const knownAtTimestamp = candles[e.knownAtBarIndex]?.time;
  if (knownAtTimestamp === undefined) {
    return null;
  }
  if (e.triggerBarIndex > E) {
    return null;
  }
  if (
    !passesStrictKnownAtGate({
      knownAtBarIndex: e.knownAtBarIndex,
      knownAtTimestamp,
      evaluationBarIndex: E,
      evaluationTimestamp,
    })
  ) {
    return null;
  }
  return {
    eventFamily: e.eventType,
    eventId: e.eventId,
    eventDirection: e.direction,
    knownAtBarIndex: e.knownAtBarIndex,
    knownAtTimestamp,
    triggerBarIndex: e.triggerBarIndex,
  };
}

function mssEventRef(
  e: MarketStructureMssEvent,
  E: number,
  evaluationTimestamp: number,
  candles: readonly { time: number }[]
): MslHistoricalEvidenceStrictEventRef | null {
  const knownAtTimestamp = candles[e.knownAtBarIndex]?.time;
  if (knownAtTimestamp === undefined) {
    return null;
  }
  if (e.triggerBarIndex > E) {
    return null;
  }
  if (
    !passesStrictKnownAtGate({
      knownAtBarIndex: e.knownAtBarIndex,
      knownAtTimestamp,
      evaluationBarIndex: E,
      evaluationTimestamp,
    })
  ) {
    return null;
  }
  return {
    eventFamily: "MSS",
    eventId: e.eventId,
    eventDirection: e.mssDirection,
    knownAtBarIndex: e.knownAtBarIndex,
    knownAtTimestamp,
    triggerBarIndex: e.triggerBarIndex,
  };
}

export interface StrictSnapshotExtraction {
  snapshot: MarketStructureSnapshot;
  structureObservations: MslHistoricalEvidenceStructureObservations;
  liquidityObservations: MslHistoricalEvidenceLiquidityObservations;
  mssObservations: MslHistoricalEvidenceMssObservations;
  strictEventRecords: readonly MslHistoricalEvidenceStrictEventRef[];
  limitations: readonly string[];
  unresolved: readonly MslHistoricalEvidenceUnresolved[];
}

export function extractStrictSnapshotAtE(input: {
  candles: readonly import("../types").Candle[];
  evaluationBarIndex: number;
  swingConfig?: import("../types").SwingConfig;
}): StrictSnapshotExtraction {
  const E = input.evaluationBarIndex;
  const snapshot = buildMarketStructureSnapshotAtBar({
    candles: input.candles,
    evaluationBarIndex: E,
    swingConfig: input.swingConfig,
  });
  const evaluationTimestamp = snapshot.evaluationTimestamp;
  const mssCtx = buildMarketStructureMssContext({ snapshot });

  const breakStrict: MslHistoricalEvidenceStrictEventRef[] = [];
  for (const e of snapshot.break.classifiedEvents) {
    const ref = filterBreakEventStrict(e, E, evaluationTimestamp, input.candles);
    if (ref) {
      breakStrict.push(ref);
    }
  }

  const mssStrict: MslHistoricalEvidenceStrictEventRef[] = [];
  for (const e of mssCtx.events) {
    const ref = mssEventRef(e, E, evaluationTimestamp, input.candles);
    if (ref) {
      mssStrict.push(ref);
    }
  }

  const bosCountAtE = breakStrict.filter((x) => x.eventFamily === "BOS").length;
  const chochCountAtE = breakStrict.filter((x) => x.eventFamily === "CHoCH").length;

  const protectedHighCount = snapshot.protected.protectedHighs.filter((p) =>
    isStrictKnownAtBarIndex(p.protectedStatusKnownAtBarIndex, E)
  ).length;
  const protectedLowCount = snapshot.protected.protectedLows.filter((p) =>
    isStrictKnownAtBarIndex(p.protectedStatusKnownAtBarIndex, E)
  ).length;

  const strictEventRecords = [...breakStrict, ...mssStrict].sort((a, b) => {
    if (a.eventId !== b.eventId) {
      return a.eventId.localeCompare(b.eventId);
    }
    return a.eventFamily.localeCompare(b.eventFamily);
  });

  const limitations = [
    ...snapshot.limitations,
    ...snapshot.break.limitations,
    ...snapshot.liquidity.limitations,
    ...snapshot.protected.limitations,
    ...mssCtx.limitations,
    "msl_historical_evidence_strict_at_e_v1",
    "no_disclosure_horizon_phase_a",
  ].sort((a, b) => a.localeCompare(b));

  const unresolved: MslHistoricalEvidenceUnresolved[] = [
    ...snapshot.protected.unresolved.map((u) => ({ code: u.code, message: u.message })),
    ...snapshot.break.unresolved.map((u) => ({ code: u.code, message: u.message })),
    ...mssCtx.unresolved.map((u) => ({ code: u.code, message: u.message })),
  ].sort((a, b) => {
    if (a.code !== b.code) {
      return a.code.localeCompare(b.code);
    }
    return a.message.localeCompare(b.message);
  });

  return {
    snapshot,
    structureObservations: {
      trendContext: snapshot.protected.trendContext,
      structurePairCount: snapshot.structurePairs.length,
      zigzagSpineCount: snapshot.zigzag.zigzagSpine.length,
      internalStructureCount: snapshot.zigzag.internalStructure.length,
      externalStructureCount: snapshot.zigzag.externalStructure.length,
      bosCountAtE,
      chochCountAtE,
      strictEvents: breakStrict,
      protectedHighCount,
      protectedLowCount,
    },
    liquidityObservations: {
      bslCount: snapshot.liquidity.bslCandidates.length,
      sslCount: snapshot.liquidity.sslCandidates.length,
      equalHighCount: snapshot.liquidity.equalHighObservations.length,
      equalLowCount: snapshot.liquidity.equalLowObservations.length,
      poolCount: snapshot.liquidity.liquidityPools.length,
    },
    mssObservations: { strictEvents: mssStrict },
    strictEventRecords,
    limitations,
    unresolved,
  };
}

/** @internal exported for unit tests — filter gate for synthetic known-at cases. */
export function filterStrictEventRefForTest(
  ref: MslHistoricalEvidenceStrictEventRef,
  E: number,
  evaluationTimestamp: number
): boolean {
  return passesStrictKnownAtGate({
    knownAtBarIndex: ref.knownAtBarIndex,
    knownAtTimestamp: ref.knownAtTimestamp,
    evaluationBarIndex: E,
    evaluationTimestamp,
  });
}
