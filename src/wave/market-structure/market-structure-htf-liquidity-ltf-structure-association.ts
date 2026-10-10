import {
  buildMarketStructureMtfEventOrderingContext,
  type BuildMarketStructureMtfEventOrderingContextInput,
} from "./market-structure-mtf-event-ordering";
import type { CrossTfEventOrderingRelation } from "./market-structure-mtf-event-ordering-types";
import { MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID } from "./market-structure-mtf-event-ordering-types";
import type { MtfOrderingEventFamily } from "./market-structure-mtf-event-ordering-types";
import type { NormalizedMtfOrderingEvent } from "./market-structure-mtf-event-ordering-types";
import {
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
  type HtfLiquidityLtfStructureAssociation,
  type HtfLiquidityLtfStructureAssociationType,
  type HtfLiquidityLtfStructureAssociationUnresolvedReason,
  type MarketStructureHtfLiquidityLtfStructureAssociationContext,
} from "./market-structure-htf-liquidity-ltf-structure-association-types";

export {
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
} from "./market-structure-htf-liquidity-ltf-structure-association-types";

export type {
  HtfLiquidityLtfStructureAssociation,
  HtfLiquidityLtfStructureAssociationType,
  HtfLiquidityLtfStructureAssociationUnresolvedReason,
  MarketStructureHtfLiquidityLtfStructureAssociationContext,
} from "./market-structure-htf-liquidity-ltf-structure-association-types";

export interface BuildMarketStructureHtfLiquidityLtfStructureAssociationContextInput
  extends BuildMarketStructureMtfEventOrderingContextInput {}

const HTF_LIQUIDITY_EVENT_FAMILIES: ReadonlySet<MtfOrderingEventFamily> =
  new Set([
    "LIQUIDITY_WICK_TOUCH",
    "LIQUIDITY_SWEEP",
    "LIQUIDITY_TAKEN",
    "LIQUIDITY_RECLAIM",
  ]);

const LTF_STRUCTURE_EVENT_FAMILIES: ReadonlySet<MtfOrderingEventFamily> =
  new Set(["BOS", "CHoCH", "MSS"]);

const ELIGIBLE_ORDERING_RELATIONS = new Set(["BEFORE", "SAME_TIME"] as const);

const LIQUIDITY_EVENT_ID_MARKERS = [
  "LIQUIDITY_WICK_TOUCH",
  "LIQUIDITY_SWEEP",
  "LIQUIDITY_TAKEN",
  "LIQUIDITY_RECLAIM",
] as const;

const STANDARD_LIMITATIONS = [
  "research_only",
  "descriptive_association_only",
  "temporal_association_only",
  "no_causal_inference",
  "no_prediction",
  "no_signal",
  "no_confluence_score",
  "no_production_rule",
  "no_msl7d_rebuild",
  "no_msl9c_ordering_duplicate",
  "consumes_msl9c_ordering_context_only",
  "directed_htf_liquidity_to_ltf_structure",
  "ordering_eligibility_before_and_same_time_only",
  "cross_tf_timestamp_only",
  "no_cross_tf_index_ordering",
  "no_msl9a_state_as_eligibility",
  "no_msl9b_state_as_eligibility",
  "derived_htf_research_track",
  "native_htf_parity_not_established",
  `association_rule_id=${MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID}`,
] as const;

export function buildHtfLiquidityLtfStructureAssociationId(
  htfLiquidityEventId: string,
  ltfStructureEventId: string
): string {
  return `ctlsa:${htfLiquidityEventId}:${ltfStructureEventId}`;
}

export function parsePoolIdFromLiquidityEventId(
  liquidityEventId: string
): string | null {
  if (!liquidityEventId.startsWith("li:")) {
    return null;
  }
  for (const marker of LIQUIDITY_EVENT_ID_MARKERS) {
    const needle = `:${marker}:`;
    const idx = liquidityEventId.indexOf(needle);
    if (idx >= 0) {
      return liquidityEventId.slice(3, idx);
    }
  }
  return null;
}

function associationTypeForStructureFamily(
  family: MtfOrderingEventFamily
): HtfLiquidityLtfStructureAssociationType | null {
  if (family === "BOS") return "LIQUIDITY_TO_BOS";
  if (family === "CHoCH") return "LIQUIDITY_TO_CHoCH";
  if (family === "MSS") return "LIQUIDITY_TO_MSS";
  return null;
}

function isHtfLiquidityRelation(relation: CrossTfEventOrderingRelation): boolean {
  return HTF_LIQUIDITY_EVENT_FAMILIES.has(relation.htfEventFamily);
}

function isLtfStructureRelation(relation: CrossTfEventOrderingRelation): boolean {
  return LTF_STRUCTURE_EVENT_FAMILIES.has(relation.ltfEventFamily);
}

function isEligibleOrderingRelation(relation: CrossTfEventOrderingRelation): boolean {
  return ELIGIBLE_ORDERING_RELATIONS.has(
    relation.ordering as "BEFORE" | "SAME_TIME"
  );
}

function indexEventsById(
  events: readonly NormalizedMtfOrderingEvent[]
): Map<string, NormalizedMtfOrderingEvent> {
  const map = new Map<string, NormalizedMtfOrderingEvent>();
  for (const ev of events) {
    map.set(ev.eventId, ev);
  }
  return map;
}

function compareAssociations(
  a: HtfLiquidityLtfStructureAssociation,
  b: HtfLiquidityLtfStructureAssociation
): number {
  if (a.htfOrderingTimestamp !== b.htfOrderingTimestamp) {
    return a.htfOrderingTimestamp - b.htfOrderingTimestamp;
  }
  if (a.ltfOrderingTimestamp !== b.ltfOrderingTimestamp) {
    return a.ltfOrderingTimestamp - b.ltfOrderingTimestamp;
  }
  const liq = a.sourceLiquidityEventId.localeCompare(b.sourceLiquidityEventId);
  if (liq !== 0) {
    return liq;
  }
  return a.targetStructureEventId.localeCompare(b.targetStructureEventId);
}

function buildAssociationFromRelation(
  relation: CrossTfEventOrderingRelation,
  htf: NormalizedMtfOrderingEvent,
  ltf: NormalizedMtfOrderingEvent,
  htfTimeframeId: string,
  ltfTimeframeId: string
): HtfLiquidityLtfStructureAssociation | null {
  const associationType = associationTypeForStructureFamily(ltf.eventFamily);
  if (!associationType) {
    return null;
  }
  const associationId = buildHtfLiquidityLtfStructureAssociationId(
    htf.eventId,
    ltf.eventId
  );
  return {
    associationId,
    associationType,
    ruleId: MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
    orderingRuleId:
      MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
    comparisonRuleId: MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
    sourceLiquidityEventId: htf.eventId,
    targetStructureEventId: ltf.eventId,
    htfLiquidityEventFamily: htf.eventFamily,
    ltfStructureEventFamily: ltf.eventFamily,
    htfTimeframeId,
    ltfTimeframeId,
    htfOrderingTimestamp: htf.orderingTimestamp,
    ltfOrderingTimestamp: ltf.orderingTimestamp,
    htfKnowabilityTimestamp: htf.knowabilityTimestamp,
    ltfKnowabilityTimestamp: ltf.knowabilityTimestamp,
    knownAtTimestamp: ltf.knowabilityTimestamp,
    orderingRelation: relation.ordering,
    htfPoolId: parsePoolIdFromLiquidityEventId(htf.eventId),
    crossTfRelationId: relation.relationId,
    visibleAtEvaluation: relation.visibleAtEvaluation,
    evidenceTag: "DIRECT_OBSERVATION",
  };
}

function associationsFromRelations(
  relations: readonly CrossTfEventOrderingRelation[],
  htfById: Map<string, NormalizedMtfOrderingEvent>,
  ltfById: Map<string, NormalizedMtfOrderingEvent>,
  htfTimeframeId: string,
  ltfTimeframeId: string
): HtfLiquidityLtfStructureAssociation[] {
  const seen = new Set<string>();
  const out: HtfLiquidityLtfStructureAssociation[] = [];

  for (const relation of relations) {
    if (!isHtfLiquidityRelation(relation)) {
      continue;
    }
    if (!isLtfStructureRelation(relation)) {
      continue;
    }
    if (!isEligibleOrderingRelation(relation)) {
      continue;
    }
    const htf = htfById.get(relation.htfEventId);
    const ltf = ltfById.get(relation.ltfEventId);
    if (!htf || !ltf) {
      continue;
    }
    if (htf.leg !== "HTF" || ltf.leg !== "LTF") {
      continue;
    }
    const associationId = buildHtfLiquidityLtfStructureAssociationId(
      htf.eventId,
      ltf.eventId
    );
    if (seen.has(associationId)) {
      continue;
    }
    const row = buildAssociationFromRelation(
      relation,
      htf,
      ltf,
      htfTimeframeId,
      ltfTimeframeId
    );
    if (!row) {
      continue;
    }
    seen.add(associationId);
    out.push(row);
  }

  out.sort(compareAssociations);
  return out;
}

function emptyAssociationContext(
  input: BuildMarketStructureHtfLiquidityLtfStructureAssociationContextInput,
  horizonBars: number,
  unresolved: HtfLiquidityLtfStructureAssociationUnresolvedReason[],
  ltfEvaluationBarIndex: number,
  ltfEvaluationTimestamp: number
): MarketStructureHtfLiquidityLtfStructureAssociationContext {
  const ltfTf = input.ltfTimeframeId ?? "1H";
  const htfTf = input.htfTimeframeId ?? "4H";
  return {
    schemaVersion:
      MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
    ruleIds: {
      association:
        MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
      ordering: MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
    },
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    ltfEvaluationBarIndex,
    ltfEvaluationTimestamp,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    horizonBars,
    htfSourceTrack: input.htfSourceTrack ?? "UNSPECIFIED",
    associations: [],
    replayAssociations: [],
    evaluationAssociations: [],
    unresolved,
    limitations: [...STANDARD_LIMITATIONS],
  };
}

/**
 * MSL-9D: descriptive cross-TF association HTF liquidity events → LTF structure events (MSL-9C ordering).
 */
export function buildMarketStructureHtfLiquidityLtfStructureAssociationContext(
  input: BuildMarketStructureHtfLiquidityLtfStructureAssociationContextInput
): MarketStructureHtfLiquidityLtfStructureAssociationContext {
  const orderingCtx = buildMarketStructureMtfEventOrderingContext(input);
  const unresolved: HtfLiquidityLtfStructureAssociationUnresolvedReason[] = [];
  for (const u of orderingCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const htfById = indexEventsById(orderingCtx.htfEvents);
  const ltfById = indexEventsById(orderingCtx.ltfEvents);

  const replayAssociations = associationsFromRelations(
    orderingCtx.relations,
    htfById,
    ltfById,
    orderingCtx.htfTimeframeId,
    orderingCtx.ltfTimeframeId
  );

  const evaluationAssociations = associationsFromRelations(
    orderingCtx.evaluationRelations,
    htfById,
    ltfById,
    orderingCtx.htfTimeframeId,
    orderingCtx.ltfTimeframeId
  );

  const limitations: string[] = [...STANDARD_LIMITATIONS];
  if (orderingCtx.htfSourceTrack === "NATIVE_HTF") {
    limitations.push("native_htf_input_declared_not_parity_validated");
  }

  if (orderingCtx.htfEvaluationBarIndex === null) {
    return emptyAssociationContext(
      input,
      orderingCtx.horizonBars,
      unresolved,
      orderingCtx.ltfEvaluationBarIndex,
      orderingCtx.ltfEvaluationTimestamp
    );
  }

  return {
    schemaVersion:
      MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
    ruleIds: {
      association:
        MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
      ordering: MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
    },
    ltfTimeframeId: orderingCtx.ltfTimeframeId,
    htfTimeframeId: orderingCtx.htfTimeframeId,
    ltfEvaluationBarIndex: orderingCtx.ltfEvaluationBarIndex,
    ltfEvaluationTimestamp: orderingCtx.ltfEvaluationTimestamp,
    htfEvaluationBarIndex: orderingCtx.htfEvaluationBarIndex,
    htfEvaluationTimestamp: orderingCtx.htfEvaluationTimestamp,
    horizonBars: orderingCtx.horizonBars,
    htfSourceTrack: orderingCtx.htfSourceTrack,
    associations: replayAssociations,
    replayAssociations,
    evaluationAssociations,
    unresolved,
    limitations,
  };
}
