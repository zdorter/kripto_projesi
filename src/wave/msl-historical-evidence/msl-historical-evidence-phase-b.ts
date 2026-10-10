import { buildMarketStructureMssContext } from "../market-structure/market-structure-mss";
import { buildMarketStructureCrossTfLiquidityInteractionContext } from "../market-structure/market-structure-cross-tf-liquidity-interaction";
import type { CrossTfLiquidityInteractionEvent } from "../market-structure/market-structure-cross-tf-liquidity-interaction-types";
import { buildMarketStructureLiquidityAdvancedInteractionContext } from "../market-structure/market-structure-liquidity-advanced-interaction";
import type { AdvancedLiquidityInteractionEvent } from "../market-structure/market-structure-liquidity-advanced-interaction-types";
import { buildMarketStructureLiquidityInteractionContext } from "../market-structure/market-structure-liquidity-interaction";
import type { LiquidityInteractionEvent } from "../market-structure/market-structure-liquidity-interaction-types";
import { buildMarketStructureLiquidityStructureAssociationContext } from "../market-structure/market-structure-liquidity-structure-association";
import type { LiquidityStructureAssociation } from "../market-structure/market-structure-liquidity-structure-association-types";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import type { Candle, SwingConfig } from "../types";
import {
  classifyKnownAtCohort,
  passesStrictKnownAtGate,
} from "./msl-historical-evidence-cohort";
import { extractStrictSnapshotAtE } from "./msl-historical-evidence-strict";
import type {
  MslHistoricalEvidenceDisclosureObservation,
  MslHistoricalEvidenceEventObservation,
  MslHistoricalEvidenceFirstSubsequentEventRef,
  MslHistoricalEvidenceObservationMode,
  MslHistoricalEvidencePhaseBObservations,
  MslHistoricalEvidencePrimaryDisclosureRef,
  MslHistoricalEvidenceStrictEventRef,
} from "./msl-historical-evidence-types";

export interface BuildPhaseBObservationsInput {
  candles: readonly Candle[];
  evaluationBarIndex: number;
  observationHorizonBars: number;
  evaluationTimestamp: number;
  swingConfig?: SwingConfig;
  timeframeId?: string;
  /** Optional HTF series for MSL-7C (derived 1H→4H research path only). */
  htfCandles?: readonly Candle[];
  htfTimeframeId?: string;
}

function mapLiquidityFamily(
  eventType: string
): MslHistoricalEvidencePrimaryDisclosureRef["eventFamily"] | null {
  switch (eventType) {
    case "LIQUIDITY_WICK_TOUCH":
      return "LIQUIDITY_WICK_TOUCH";
    case "LIQUIDITY_SWEEP":
      return "LIQUIDITY_SWEEP";
    case "LIQUIDITY_TAKEN":
      return "LIQUIDITY_TAKEN";
    case "LIQUIDITY_RECLAIM":
      return "LIQUIDITY_RECLAIM";
    default:
      return null;
  }
}

function toEventObservation(
  input: {
    eventId: string;
    eventFamily: MslHistoricalEvidenceEventObservation["eventFamily"];
    eventBarIndex: number;
    eventTimestamp: number;
    knownAtBarIndex: number;
    knownAtTimestamp: number;
    observationMode: MslHistoricalEvidenceObservationMode;
    eventDirection: string | null;
  },
  E: number
): MslHistoricalEvidenceEventObservation {
  return {
    eventId: input.eventId,
    eventFamily: input.eventFamily,
    eventBarIndex: input.eventBarIndex,
    eventTimestamp: input.eventTimestamp,
    barsAfterEvaluation: input.eventBarIndex - E,
    knownAtBarIndex: input.knownAtBarIndex,
    knownAtTimestamp: input.knownAtTimestamp,
    observationMode: input.observationMode,
    eventDirection: input.eventDirection,
  };
}

function barIndexFromTimestamp(
  candles: readonly Candle[],
  ts: number
): number | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i]!.time === ts) {
      return i;
    }
    if (candles[i]!.time < ts) {
      return i;
    }
  }
  return null;
}

function sortEventObservations(
  a: MslHistoricalEvidenceEventObservation,
  b: MslHistoricalEvidenceEventObservation
): number {
  if (a.eventBarIndex !== b.eventBarIndex) {
    return a.eventBarIndex - b.eventBarIndex;
  }
  return a.eventId.localeCompare(b.eventId);
}

function deriveFirstSubsequent(
  events: readonly MslHistoricalEvidenceEventObservation[]
): MslHistoricalEvidenceFirstSubsequentEventRef | null {
  if (events.length === 0) {
    return null;
  }
  const sorted = [...events].sort(sortEventObservations);
  const first = sorted[0]!;
  return {
    eventId: first.eventId,
    eventFamily: first.eventFamily,
    eventBarIndex: first.eventBarIndex,
    barsAfterEvaluation: first.barsAfterEvaluation,
  };
}

function liquidityEventDirection(_ev: LiquidityInteractionEvent): string | null {
  return _ev.side;
}

function advancedEventDirection(_ev: AdvancedLiquidityInteractionEvent): string | null {
  return _ev.side;
}

function classifyLiquidityEvent(
  input: BuildPhaseBObservationsInput,
  ev: {
    eventId: string;
    eventType: string;
    triggerBarIndex: number;
    triggerTimestamp: number;
    knownAtBarIndex: number;
    side?: string;
  },
  E: number,
  H: number,
  evaluationTimestamp: number
): {
  cohort: ReturnType<typeof classifyKnownAtCohort>;
  observation: MslHistoricalEvidenceEventObservation | null;
} {
  const family = mapLiquidityFamily(ev.eventType);
  if (!family) {
    return { cohort: "EXCLUDED", observation: null };
  }
  const knownAtTimestamp =
    input.candles[ev.knownAtBarIndex]?.time ?? ev.triggerTimestamp;
  const cohort = classifyKnownAtCohort({
    knownAtBarIndex: ev.knownAtBarIndex,
    knownAtTimestamp,
    evaluationBarIndex: E,
    evaluationTimestamp,
    observationHorizonBars: H,
    candles: input.candles,
  });
  if (cohort === "EXCLUDED") {
    return { cohort, observation: null };
  }
  const observationMode: MslHistoricalEvidenceObservationMode =
    cohort === "STRICT_AT_E" ? "STRICT_AT_E" : "DISCLOSURE_HORIZON";
  if (ev.triggerBarIndex > E && observationMode === "STRICT_AT_E") {
    return { cohort: "EXCLUDED", observation: null };
  }
  return {
    cohort,
    observation: toEventObservation(
      {
        eventId: ev.eventId,
        eventFamily: family,
        eventBarIndex: ev.triggerBarIndex,
        eventTimestamp: ev.triggerTimestamp,
        knownAtBarIndex: ev.knownAtBarIndex,
        knownAtTimestamp,
        observationMode:
          ev.triggerBarIndex > E ? "OBSERVATION_ONLY" : observationMode,
        eventDirection: ev.side ?? null,
      },
      E
    ),
  };
}

function crossTfToObservation(
  input: BuildPhaseBObservationsInput,
  ev: CrossTfLiquidityInteractionEvent,
  E: number,
  H: number,
  evaluationTimestamp: number
): MslHistoricalEvidenceEventObservation | null {
  const knownAtBarIndex =
    barIndexFromTimestamp(input.candles, ev.knownAtTimestamp) ??
    ev.ltfTriggerBarIndex;
  const cohort = classifyKnownAtCohort({
    knownAtBarIndex,
    knownAtTimestamp: ev.knownAtTimestamp,
    evaluationBarIndex: E,
    evaluationTimestamp,
    observationHorizonBars: H,
    candles: input.candles,
  });
  if (cohort === "EXCLUDED") {
    return null;
  }
  const mode: MslHistoricalEvidenceObservationMode =
    cohort === "STRICT_AT_E" ? "STRICT_AT_E" : "DISCLOSURE_HORIZON";
  if (ev.ltfTriggerBarIndex > E && mode === "STRICT_AT_E") {
    return null;
  }
  return toEventObservation(
    {
      eventId: ev.eventId,
      eventFamily: "CROSS_TF_LIQUIDITY_WICK_TOUCH",
      eventBarIndex: ev.ltfTriggerBarIndex,
      eventTimestamp: ev.ltfTriggerTimestamp,
      knownAtBarIndex,
      knownAtTimestamp: ev.knownAtTimestamp,
      observationMode:
        ev.ltfTriggerBarIndex > E ? "OBSERVATION_ONLY" : mode,
      eventDirection: ev.side,
    },
    E
  );
}

function associationToDisclosure(
  input: BuildPhaseBObservationsInput,
  assoc: LiquidityStructureAssociation,
  E: number,
  H: number,
  evaluationTimestamp: number,
  structureEvaluationBarIndex: number
): MslHistoricalEvidenceDisclosureObservation | null {
  const knownAtBarIndex = assoc.structureTriggerBarIndex;
  const cohort = classifyKnownAtCohort({
    knownAtBarIndex,
    knownAtTimestamp: assoc.knownAtTimestamp,
    evaluationBarIndex: E,
    evaluationTimestamp,
    observationHorizonBars: H,
    candles: input.candles,
  });
  if (cohort === "EXCLUDED") {
    return null;
  }
  if (assoc.structureTriggerBarIndex > structureEvaluationBarIndex) {
    return null;
  }
  const observationMode: MslHistoricalEvidenceObservationMode =
    cohort === "STRICT_AT_E" ? "STRICT_AT_E" : "DISCLOSURE_HORIZON";
  return {
    eventId: assoc.associationId,
    eventFamily:
      assoc.associationType === "LIQUIDITY_TO_BOS"
        ? "LIQUIDITY_TO_BOS"
        : "LIQUIDITY_TO_CHOCH",
    eventBarIndex: assoc.structureTriggerBarIndex,
    eventTimestamp: assoc.structureTriggerTimestamp,
    barsAfterEvaluation: assoc.structureTriggerBarIndex - E,
    knownAtBarIndex,
    knownAtTimestamp: assoc.knownAtTimestamp,
    observationMode,
    eventDirection: assoc.structureEventType,
    structureEvaluationBarIndex,
    sourceLiquidityEventId: assoc.sourceLiquidityEventId,
    targetStructureEventId: assoc.targetStructureEventId,
  };
}

export function buildMslHistoricalEvidencePhaseBObservations(
  input: BuildPhaseBObservationsInput
): MslHistoricalEvidencePhaseBObservations {
  const E = input.evaluationBarIndex;
  const H = input.observationHorizonBars;
  const candles = input.candles;
  const lastIndex = candles.length - 1;
  const effectiveEnd = Math.min(E + H, lastIndex);
  const evaluationTimestamp = input.evaluationTimestamp;

  const strictAtE = extractStrictSnapshotAtE({
    candles,
    evaluationBarIndex: E,
    swingConfig: input.swingConfig,
  });

  const snapshotAtE = strictAtE.snapshot;
  const limitations = [...strictAtE.limitations, "msl_historical_evidence_phase_b_v1"];
  const unresolved = [...strictAtE.unresolved];

  const disclosureObservations: MslHistoricalEvidenceDisclosureObservation[] = [];
  const subsequentStructureEvents: MslHistoricalEvidenceEventObservation[] = [];
  const subsequentLiquidityEvents: MslHistoricalEvidenceEventObservation[] = [];
  const subsequentMssEvents: MslHistoricalEvidenceEventObservation[] = [];
  const disclosurePrimaryRefs: MslHistoricalEvidencePrimaryDisclosureRef[] = [];

  const strictEventIds = new Set(strictAtE.strictEventRecords.map((r) => r.eventId));

  const liquidityCtx = buildMarketStructureLiquidityInteractionContext({
    snapshot: snapshotAtE,
    candles,
    horizonBars: H,
  });
  for (const u of liquidityCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  for (const ev of liquidityCtx.events) {
    const { cohort, observation } = classifyLiquidityEvent(
      input,
      ev,
      E,
      H,
      evaluationTimestamp
    );
    if (!observation) {
      continue;
    }
    if (ev.triggerBarIndex > E) {
      subsequentLiquidityEvents.push({
        ...observation,
        observationMode:
          cohort === "DISCLOSURE_HORIZON"
            ? "DISCLOSURE_HORIZON"
            : "OBSERVATION_ONLY",
      });
    }
    if (cohort === "DISCLOSURE_HORIZON" && !strictEventIds.has(ev.eventId)) {
      disclosureObservations.push({ ...observation, observationMode: "DISCLOSURE_HORIZON" });
      disclosurePrimaryRefs.push({
        eventFamily: "LIQUIDITY_WICK_TOUCH",
        eventId: ev.eventId,
        eventDirection: liquidityEventDirection(ev),
        knownAtBarIndex: ev.knownAtBarIndex,
        knownAtTimestamp: candles[ev.knownAtBarIndex]?.time ?? ev.triggerTimestamp,
        triggerBarIndex: ev.triggerBarIndex,
        poolId: ev.poolId,
        poolKind: ev.poolKind,
      });
    }
  }

  const advancedCtx = buildMarketStructureLiquidityAdvancedInteractionContext({
    snapshot: snapshotAtE,
    candles,
    horizonBars: H,
  });
  for (const u of advancedCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  for (const ev of advancedCtx.events) {
    const { cohort, observation } = classifyLiquidityEvent(
      input,
      ev,
      E,
      H,
      evaluationTimestamp
    );
    if (!observation) {
      continue;
    }
    if (ev.triggerBarIndex > E) {
      subsequentLiquidityEvents.push({
        ...observation,
        observationMode:
          cohort === "DISCLOSURE_HORIZON"
            ? "DISCLOSURE_HORIZON"
            : "OBSERVATION_ONLY",
      });
    }
    if (cohort === "DISCLOSURE_HORIZON" && !strictEventIds.has(ev.eventId)) {
      disclosureObservations.push({ ...observation, observationMode: "DISCLOSURE_HORIZON" });
      disclosurePrimaryRefs.push({
        eventFamily: mapLiquidityFamily(ev.eventType)!,
        eventId: ev.eventId,
        eventDirection: advancedEventDirection(ev),
        knownAtBarIndex: ev.knownAtBarIndex,
        knownAtTimestamp: candles[ev.knownAtBarIndex]?.time ?? ev.triggerTimestamp,
        triggerBarIndex: ev.triggerBarIndex,
        poolId: ev.poolId,
        poolKind: ev.poolKind,
      });
    }
  }

  if (input.htfCandles && input.htfCandles.length > 0) {
    const crossTf = buildMarketStructureCrossTfLiquidityInteractionContext({
      ltfCandles: candles,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: input.timeframeId ?? "1H",
      htfCandles: input.htfCandles,
      htfTimeframeId: input.htfTimeframeId ?? "4H",
      horizonBars: H,
      swingConfig: input.swingConfig,
    });
    for (const u of crossTf.unresolved) {
      unresolved.push({ code: u.code, message: u.message });
    }
    for (const ev of crossTf.events) {
      const obs = crossTfToObservation(input, ev, E, H, evaluationTimestamp);
      if (!obs) {
        continue;
      }
      if (ev.ltfTriggerBarIndex > E) {
        subsequentLiquidityEvents.push({
          ...obs,
          observationMode:
            obs.observationMode === "DISCLOSURE_HORIZON"
              ? "DISCLOSURE_HORIZON"
              : "OBSERVATION_ONLY",
        });
      }
      if (
        obs.observationMode === "DISCLOSURE_HORIZON" &&
        !strictEventIds.has(ev.eventId)
      ) {
        disclosureObservations.push({
          ...obs,
          observationMode: "DISCLOSURE_HORIZON",
        });
        disclosurePrimaryRefs.push({
          eventFamily: "CROSS_TF_LIQUIDITY_WICK_TOUCH",
          eventId: ev.eventId,
          eventDirection: ev.side,
          knownAtBarIndex: obs.knownAtBarIndex,
          knownAtTimestamp: ev.knownAtTimestamp,
          triggerBarIndex: ev.ltfTriggerBarIndex,
          poolId: ev.htfPoolId,
          poolKind: ev.htfPoolKind,
        });
      }
    }
  } else {
    limitations.push("msl_7c_cross_tf_not_supplied");
  }

  const assocCtx = buildMarketStructureLiquidityStructureAssociationContext({
    candles,
    evaluationBarIndex: E,
    horizonBars: H,
    swingConfig: input.swingConfig,
    timeframeId: input.timeframeId ?? "1H",
  });
  for (const u of assocCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }
  for (const assoc of assocCtx.associations) {
    const row = associationToDisclosure(
      input,
      assoc,
      E,
      H,
      evaluationTimestamp,
      assocCtx.structureEvaluationBarIndex
    );
    if (!row) {
      continue;
    }
    if (row.observationMode === "DISCLOSURE_HORIZON") {
      disclosureObservations.push(row);
      if (
        !strictEventIds.has(assoc.associationId) &&
        (row.eventFamily === "LIQUIDITY_TO_BOS" || row.eventFamily === "LIQUIDITY_TO_CHOCH")
      ) {
        disclosurePrimaryRefs.push({
          eventFamily: row.eventFamily,
          eventId: assoc.associationId,
          eventDirection: assoc.structureEventType,
          knownAtBarIndex: row.knownAtBarIndex,
          knownAtTimestamp: row.knownAtTimestamp,
          triggerBarIndex: assoc.structureTriggerBarIndex,
          sourceLiquidityEventId: assoc.sourceLiquidityEventId,
          targetStructureEventId: assoc.targetStructureEventId,
          structureEvaluationBarIndex: assocCtx.structureEvaluationBarIndex,
        });
      }
    }
  }

  const snapAtHorizonEnd = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: effectiveEnd,
    swingConfig: input.swingConfig,
  });
  const mssAtHorizonEnd = buildMarketStructureMssContext({ snapshot: snapAtHorizonEnd });

  for (const e of snapAtHorizonEnd.break.classifiedEvents) {
    if (e.triggerBarIndex <= E || e.triggerBarIndex > effectiveEnd) {
      continue;
    }
    const knownAtTimestamp = candles[e.knownAtBarIndex]?.time;
    if (knownAtTimestamp === undefined) {
      continue;
    }
    if (
      passesStrictKnownAtGate({
        knownAtBarIndex: e.knownAtBarIndex,
        knownAtTimestamp,
        evaluationBarIndex: E,
        evaluationTimestamp,
      })
    ) {
      continue;
    }
    subsequentStructureEvents.push(
      toEventObservation(
        {
          eventId: e.eventId,
          eventFamily: e.eventType,
          eventBarIndex: e.triggerBarIndex,
          eventTimestamp: candles[e.triggerBarIndex]!.time,
          knownAtBarIndex: e.knownAtBarIndex,
          knownAtTimestamp,
          observationMode: "OBSERVATION_ONLY",
          eventDirection: e.direction,
        },
        E
      )
    );
  }

  for (const e of mssAtHorizonEnd.events) {
    if (e.triggerBarIndex <= E || e.triggerBarIndex > effectiveEnd) {
      continue;
    }
    const knownAtTimestamp = candles[e.knownAtBarIndex]?.time;
    if (knownAtTimestamp === undefined) {
      continue;
    }
    if (
      passesStrictKnownAtGate({
        knownAtBarIndex: e.knownAtBarIndex,
        knownAtTimestamp,
        evaluationBarIndex: E,
        evaluationTimestamp,
      })
    ) {
      continue;
    }
    subsequentMssEvents.push(
      toEventObservation(
        {
          eventId: e.eventId,
          eventFamily: "MSS",
          eventBarIndex: e.triggerBarIndex,
          eventTimestamp: candles[e.triggerBarIndex]!.time,
          knownAtBarIndex: e.knownAtBarIndex,
          knownAtTimestamp,
          observationMode: "OBSERVATION_ONLY",
          eventDirection: e.mssDirection,
        },
        E
      )
    );
  }

  subsequentStructureEvents.sort(sortEventObservations);
  subsequentLiquidityEvents.sort(sortEventObservations);
  subsequentMssEvents.sort(sortEventObservations);
  disclosureObservations.sort(sortEventObservations);
  disclosurePrimaryRefs.sort((a, b) => {
    if (a.knownAtBarIndex !== b.knownAtBarIndex) {
      return a.knownAtBarIndex - b.knownAtBarIndex;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  const allSubsequent = [
    ...subsequentStructureEvents,
    ...subsequentLiquidityEvents,
    ...subsequentMssEvents,
  ];
  const firstSubsequentEvent = deriveFirstSubsequent(allSubsequent);

  limitations.push(
    "overlapping_horizon_windows_may_yield_statistically_dependent_observations"
  );

  return {
    disclosureObservations,
    subsequentStructureEvents,
    subsequentLiquidityEvents,
    subsequentMssEvents,
    disclosurePrimaryRefs,
    firstSubsequentEvent,
    strictEventRecords: strictAtE.strictEventRecords,
    structureObservations: strictAtE.structureObservations,
    liquidityObservations: strictAtE.liquidityObservations,
    mssObservations: strictAtE.mssObservations,
    evaluationTimestamp: snapshotAtE.evaluationTimestamp,
    limitations: [...new Set(limitations)].sort((a, b) => a.localeCompare(b)),
    unresolved: [...unresolved].sort((a, b) => {
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    }),
  };
}
