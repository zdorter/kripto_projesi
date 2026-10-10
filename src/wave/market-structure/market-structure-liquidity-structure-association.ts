import type { Candle } from "../types";
import { buildMarketStructureBreakContext } from "./market-structure-break";
import type { ClassifiedStructureEvent } from "./market-structure-break-types";
import { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
import { buildMarketStructureLiquidityInteractionContext } from "./market-structure-liquidity-interaction";
import type { LiquidityInteractionEvent } from "./market-structure-liquidity-interaction-types";
import {
  knownAtTimestampFromBarIndex,
  normalizeTimeframeId,
} from "./market-structure-mtf-alignment";
import { buildMarketStructureSnapshotAtBar } from "./market-structure-snapshot";
import { MarketStructureInvalidEvaluationBarIndexError } from "./market-structure-types";
import {
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
  type LiquidityStructureAssociation,
  type LiquidityStructureAssociationType,
  type LiquidityStructureAssociationUnresolvedReason,
  type MarketStructureLiquidityStructureAssociationContext,
} from "./market-structure-liquidity-structure-association-types";

export { DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS } from "./market-structure-liquidity-interaction-types";
export {
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
} from "./market-structure-liquidity-structure-association-types";

export type {
  LiquidityStructureAssociation,
  LiquidityStructureAssociationType,
  LiquidityStructureAssociationUnresolvedReason,
  MarketStructureLiquidityStructureAssociationContext,
} from "./market-structure-liquidity-structure-association-types";

export interface BuildMarketStructureLiquidityStructureAssociationContextInput {
  candles: readonly Candle[];
  evaluationBarIndex: number;
  timeframeId?: string;
  horizonBars?: number;
  swingConfig?: Parameters<typeof buildMarketStructureSnapshotAtBar>[0]["swingConfig"];
}

const STANDARD_LIMITATIONS = [
  "research_only",
  "descriptive_association_only",
  "no_predictive_claim",
  "no_sweep",
  "no_taken",
  "no_grab",
  "no_reclaim",
  "no_mss",
  "no_production_signal",
  "liquidity_frozen_at_E",
  "structure_observation_extends_past_liquidity_evaluation",
  "bos_choch_classification_unchanged",
  `association_rule_id=${MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID}`,
] as const;

function resolveHorizonBars(
  horizonBars: number | undefined
): { horizon: number; invalid: boolean } {
  const raw = horizonBars ?? DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
  if (!Number.isInteger(raw) || raw <= 0) {
    return { horizon: raw, invalid: true };
  }
  return { horizon: raw, invalid: false };
}

function associationTypeForStructure(
  eventType: ClassifiedStructureEvent["eventType"]
): LiquidityStructureAssociationType | null {
  if (eventType === "BOS") return "LIQUIDITY_TO_BOS";
  if (eventType === "CHoCH") return "LIQUIDITY_TO_CHOCH";
  return null;
}

function buildAssociationId(
  liquidityEventId: string,
  structureEventId: string
): string {
  return `lsa:${liquidityEventId}:${structureEventId}`;
}

function orderingValid(
  touchBar: number,
  touchTs: number,
  structureBar: number,
  structureTs: number
): boolean {
  if (structureBar < touchBar) {
    return false;
  }
  if (structureBar === touchBar) {
    return structureTs >= touchTs;
  }
  return structureTs >= touchTs;
}

/**
 * MSL-7D V1: descriptive research association between MSL-6 liquidity touches and MSL-4 BOS/CHoCH.
 */
export function buildMarketStructureLiquidityStructureAssociationContext(
  input: BuildMarketStructureLiquidityStructureAssociationContextInput
): MarketStructureLiquidityStructureAssociationContext {
  const tf = normalizeTimeframeId(input.timeframeId ?? "1H");
  const candles = input.candles;
  const E = input.evaluationBarIndex;
  const count = candles.length;
  const { horizon, invalid: invalidHorizon } = resolveHorizonBars(input.horizonBars);
  const unresolved: LiquidityStructureAssociationUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  if (
    count === 0 ||
    !Number.isInteger(E) ||
    E < 0 ||
    E >= count
  ) {
    throw new MarketStructureInvalidEvaluationBarIndexError(E, count);
  }

  const T_E = candles[E].time;
  const lastIndex = count - 1;
  const E_struct = Math.min(E + horizon, lastIndex);
  const T_struct = candles[E_struct].time;

  if (invalidHorizon) {
    unresolved.push({
      code: "INVALID_HORIZON_BARS",
      message: `horizonBars must be a positive integer; received ${String(input.horizonBars)}.`,
    });
    return {
      schemaVersion: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
      ruleIds: {
        association: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
        ordering: MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
      },
      evaluationBarIndex: E,
      evaluationTimestamp: T_E,
      horizonBars: horizon,
      structureEvaluationBarIndex: E_struct,
      structureEvaluationTimestamp: T_struct,
      associations: [],
      unresolved,
      limitations,
    };
  }

  const snapshotAtE = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig: input.swingConfig,
  });

  const liquidityCtx = buildMarketStructureLiquidityInteractionContext({
    snapshot: snapshotAtE,
    candles,
    horizonBars: horizon,
  });

  for (const u of liquidityCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const snapshotAtEStruct = buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E_struct,
    swingConfig: input.swingConfig,
  });

  const breakCtx = buildMarketStructureBreakContext({
    snapshot: snapshotAtEStruct,
    candles,
  });

  for (const u of breakCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const liquidityEvents = liquidityCtx.events.filter(
    (ev) => ev.eventType === "LIQUIDITY_WICK_TOUCH"
  );
  const structureEvents = breakCtx.classifiedEvents;

  const seen = new Set<string>();
  const associations: LiquidityStructureAssociation[] = [];

  for (const liq of liquidityEvents) {
    for (const structure of structureEvents) {
      const assocType = associationTypeForStructure(structure.eventType);
      if (!assocType) {
        continue;
      }
      const touchBar = liq.triggerBarIndex;
      const structureBar = structure.triggerBarIndex;
      const structureTs = candles[structureBar]?.time;
      if (structureTs === undefined) {
        continue;
      }
      if (
        !orderingValid(
          touchBar,
          liq.triggerTimestamp,
          structureBar,
          structureTs
        )
      ) {
        continue;
      }
      const associationId = buildAssociationId(liq.eventId, structure.eventId);
      if (seen.has(associationId)) {
        continue;
      }
      seen.add(associationId);
      const knownAtTs =
        knownAtTimestampFromBarIndex(candles, structureBar, tf) ??
        structureTs;
      associations.push({
        associationId,
        associationType: assocType,
        ruleId: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
        orderingRuleId: MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
        sourceLiquidityEventId: liq.eventId,
        targetStructureEventId: structure.eventId,
        structureEventType: structure.eventType,
        timeframeId: tf,
        liquidityTriggerBarIndex: touchBar,
        structureTriggerBarIndex: structureBar,
        barsBetween: structureBar - touchBar,
        liquidityTriggerTimestamp: liq.triggerTimestamp,
        structureTriggerTimestamp: structureTs,
        knownAtTimestamp: knownAtTs,
        evidenceTag: "DIRECT_OBSERVATION",
      });
    }
  }

  associations.sort((a, b) => {
    if (a.liquidityTriggerBarIndex !== b.liquidityTriggerBarIndex) {
      return a.liquidityTriggerBarIndex - b.liquidityTriggerBarIndex;
    }
    if (a.structureTriggerBarIndex !== b.structureTriggerBarIndex) {
      return a.structureTriggerBarIndex - b.structureTriggerBarIndex;
    }
    return a.associationId.localeCompare(b.associationId);
  });

  return {
    schemaVersion: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
    ruleIds: {
      association: MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
      ordering: MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
    },
    evaluationBarIndex: E,
    evaluationTimestamp: T_E,
    horizonBars: horizon,
    structureEvaluationBarIndex: E_struct,
    structureEvaluationTimestamp: T_struct,
    associations,
    unresolved,
    limitations,
  };
}
