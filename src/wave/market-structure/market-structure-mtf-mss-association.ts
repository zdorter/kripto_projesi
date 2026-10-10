import {
  buildMarketStructureMtfEventOrderingContext,
  type BuildMarketStructureMtfEventOrderingContextInput,
} from "./market-structure-mtf-event-ordering";
import type { CrossTfEventOrderingRelation } from "./market-structure-mtf-event-ordering-types";
import { MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID } from "./market-structure-mtf-event-ordering-types";
import type { MarketStructureMtfEventOrderingContext } from "./market-structure-mtf-event-ordering-types";
import type { MtfOrderingEventFamily } from "./market-structure-mtf-event-ordering-types";
import type { NormalizedMtfOrderingEvent } from "./market-structure-mtf-event-ordering-types";
import {
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
  type MarketStructureMtfMssAssociation,
  type MarketStructureMtfMssAssociationContext,
  type MtfMssAssociationType,
  type MtfMssAssociationUnresolvedReason,
} from "./market-structure-mtf-mss-association-types";

export {
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
} from "./market-structure-mtf-mss-association-types";

export type {
  MarketStructureMtfMssAssociation,
  MarketStructureMtfMssAssociationContext,
  MtfMssAssociationType,
  MtfMssAssociationUnresolvedReason,
} from "./market-structure-mtf-mss-association-types";

export interface BuildMarketStructureMtfMssAssociationContextInput
  extends BuildMarketStructureMtfEventOrderingContextInput {
  /** When set, 9C context is reused and not rebuilt from candle inputs. */
  prebuiltOrderingContext?: MarketStructureMtfEventOrderingContext;
}

const STRUCTURE_EVENT_FAMILIES: ReadonlySet<MtfOrderingEventFamily> = new Set([
  "BOS",
  "CHoCH",
  "MSS",
]);

const ELIGIBLE_ORDERING_RELATIONS = new Set(["BEFORE", "SAME_TIME"] as const);

const STANDARD_LIMITATIONS = [
  "research_only",
  "descriptive_association_only",
  "temporal_association_only",
  "no_prediction",
  "no_causality",
  "no_confirmation",
  "no_production_signal",
  "no_confluence_score",
  "no_msl9c_ordering_duplicate",
  "consumes_msl9c_ordering_context_only",
  "no_msl9d_duplication",
  "no_htf_liquidity_to_ltf_structure_rebuild",
  "no_msl7d_duplication",
  "no_liquidity_endpoints",
  "mss_centric_structure_matrix_only",
  "ordering_eligibility_before_and_same_time_only",
  "cross_tf_timestamp_only",
  "no_cross_tf_index_ordering",
  "no_msl9a_state_as_eligibility",
  "no_msl9b_state_as_eligibility",
  "derived_htf_research_track",
  "native_htf_parity_not_established",
  `association_rule_id=${MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID}`,
] as const;

export function buildMtfMssAssociationId(
  htfEventId: string,
  ltfEventId: string
): string {
  return `ctssa:${htfEventId}:${ltfEventId}`;
}

export function isEligibleMssAssociationMatrixCell(
  htfEventFamily: MtfOrderingEventFamily,
  ltfEventFamily: MtfOrderingEventFamily
): boolean {
  if (!STRUCTURE_EVENT_FAMILIES.has(htfEventFamily)) {
    return false;
  }
  if (!STRUCTURE_EVENT_FAMILIES.has(ltfEventFamily)) {
    return false;
  }
  if (htfEventFamily === "BOS" || htfEventFamily === "CHoCH") {
    return ltfEventFamily === "MSS";
  }
  if (htfEventFamily === "MSS") {
    return (
      ltfEventFamily === "BOS" ||
      ltfEventFamily === "CHoCH" ||
      ltfEventFamily === "MSS"
    );
  }
  return false;
}

export function associationTypeForMatrixCell(
  htfEventFamily: MtfOrderingEventFamily,
  ltfEventFamily: MtfOrderingEventFamily
): MtfMssAssociationType | null {
  if (!isEligibleMssAssociationMatrixCell(htfEventFamily, ltfEventFamily)) {
    return null;
  }
  if (htfEventFamily === "MSS" && ltfEventFamily === "MSS") {
    return "MSS_TO_MSS";
  }
  if (htfEventFamily === "MSS") {
    return "MSS_TO_STRUCTURE";
  }
  return "STRUCTURE_TO_MSS";
}

function isStructureFamily(family: MtfOrderingEventFamily): boolean {
  return STRUCTURE_EVENT_FAMILIES.has(family);
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
  a: MarketStructureMtfMssAssociation,
  b: MarketStructureMtfMssAssociation
): number {
  if (a.htfTriggerTimestamp !== b.htfTriggerTimestamp) {
    return a.htfTriggerTimestamp - b.htfTriggerTimestamp;
  }
  if (a.ltfTriggerTimestamp !== b.ltfTriggerTimestamp) {
    return a.ltfTriggerTimestamp - b.ltfTriggerTimestamp;
  }
  const htf = a.htfEventId.localeCompare(b.htfEventId);
  if (htf !== 0) {
    return htf;
  }
  return a.ltfEventId.localeCompare(b.ltfEventId);
}

function buildAssociationFromRelation(
  relation: CrossTfEventOrderingRelation,
  htf: NormalizedMtfOrderingEvent,
  ltf: NormalizedMtfOrderingEvent
): MarketStructureMtfMssAssociation | null {
  const associationType = associationTypeForMatrixCell(
    relation.htfEventFamily,
    relation.ltfEventFamily
  );
  if (!associationType) {
    return null;
  }
  return {
    associationId: buildMtfMssAssociationId(htf.eventId, ltf.eventId),
    associationType,
    ruleId: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
    orderingRuleId: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
    comparisonRuleId: MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
    htfEventId: htf.eventId,
    ltfEventId: ltf.eventId,
    htfEventFamily: htf.eventFamily,
    ltfEventFamily: ltf.eventFamily,
    orderingRelation: relation.ordering,
    htfTriggerTimestamp: htf.orderingTimestamp,
    ltfTriggerTimestamp: ltf.orderingTimestamp,
    htfKnowabilityTimestamp: htf.knowabilityTimestamp,
    ltfKnowabilityTimestamp: ltf.knowabilityTimestamp,
    knownAtTimestamp: ltf.knowabilityTimestamp,
    crossTfRelationId: relation.relationId,
    visibleAtEvaluation: relation.visibleAtEvaluation,
    evidence: "DIRECT_OBSERVATION",
    descriptiveOnly: true,
  };
}

function associationsFromRelations(
  relations: readonly CrossTfEventOrderingRelation[],
  htfById: Map<string, NormalizedMtfOrderingEvent>,
  ltfById: Map<string, NormalizedMtfOrderingEvent>
): MarketStructureMtfMssAssociation[] {
  const seen = new Set<string>();
  const out: MarketStructureMtfMssAssociation[] = [];

  for (const relation of relations) {
    if (!isStructureFamily(relation.htfEventFamily)) {
      continue;
    }
    if (!isStructureFamily(relation.ltfEventFamily)) {
      continue;
    }
    if (
      !isEligibleMssAssociationMatrixCell(
        relation.htfEventFamily,
        relation.ltfEventFamily
      )
    ) {
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
    const associationId = buildMtfMssAssociationId(htf.eventId, ltf.eventId);
    if (seen.has(associationId)) {
      continue;
    }
    const row = buildAssociationFromRelation(relation, htf, ltf);
    if (!row) {
      continue;
    }
    seen.add(associationId);
    out.push(row);
  }

  out.sort(compareAssociations);
  return out;
}

function emptyContext(
  input: BuildMarketStructureMtfMssAssociationContextInput,
  horizonBars: number,
  unresolved: MtfMssAssociationUnresolvedReason[],
  ltfEvaluationBarIndex: number,
  ltfEvaluationTimestamp: number
): MarketStructureMtfMssAssociationContext {
  return {
    schemaVersion: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
    ruleIds: {
      association: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
      ordering: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
    },
    ltfTimeframeId: input.ltfTimeframeId ?? "1H",
    htfTimeframeId: input.htfTimeframeId ?? "4H",
    ltfEvaluationBarIndex,
    ltfEvaluationTimestamp,
    htfEvaluationBarIndex: null,
    htfEvaluationTimestamp: null,
    horizonBars,
    htfSourceTrack: input.htfSourceTrack ?? "UNSPECIFIED",
    associations: [],
    evaluationAssociations: [],
    unresolved,
    limitations: [...STANDARD_LIMITATIONS],
  };
}

/**
 * MSL-9E: descriptive MTF structure/MSS association (HTF structure → LTF MSS, HTF MSS → LTF structure/MSS).
 */
export function buildMarketStructureMtfMssAssociationContext(
  input: BuildMarketStructureMtfMssAssociationContextInput
): MarketStructureMtfMssAssociationContext {
  const orderingCtx =
    input.prebuiltOrderingContext ??
    buildMarketStructureMtfEventOrderingContext(input);

  const unresolved: MtfMssAssociationUnresolvedReason[] = [];
  for (const u of orderingCtx.unresolved) {
    unresolved.push({ code: u.code, message: u.message });
  }

  const htfById = indexEventsById(orderingCtx.htfEvents);
  const ltfById = indexEventsById(orderingCtx.ltfEvents);

  const associations = associationsFromRelations(
    orderingCtx.relations,
    htfById,
    ltfById
  );

  const evaluationAssociations = associationsFromRelations(
    orderingCtx.evaluationRelations,
    htfById,
    ltfById
  );

  const limitations: string[] = [...STANDARD_LIMITATIONS];
  if (orderingCtx.htfSourceTrack === "NATIVE_HTF") {
    limitations.push("native_htf_input_declared_not_parity_validated");
  }

  if (orderingCtx.htfEvaluationBarIndex === null) {
    return emptyContext(
      input,
      orderingCtx.horizonBars,
      unresolved,
      orderingCtx.ltfEvaluationBarIndex,
      orderingCtx.ltfEvaluationTimestamp
    );
  }

  return {
    schemaVersion: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
    ruleIds: {
      association: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
      ordering: MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
    },
    ltfTimeframeId: orderingCtx.ltfTimeframeId,
    htfTimeframeId: orderingCtx.htfTimeframeId,
    ltfEvaluationBarIndex: orderingCtx.ltfEvaluationBarIndex,
    ltfEvaluationTimestamp: orderingCtx.ltfEvaluationTimestamp,
    htfEvaluationBarIndex: orderingCtx.htfEvaluationBarIndex,
    htfEvaluationTimestamp: orderingCtx.htfEvaluationTimestamp,
    horizonBars: orderingCtx.horizonBars,
    htfSourceTrack: orderingCtx.htfSourceTrack,
    associations,
    evaluationAssociations,
    unresolved,
    limitations,
  };
}
