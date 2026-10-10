import type { TrendDirection } from "../types";
import type { ClassifiedStructureEvent } from "./market-structure-break-types";
import type {
  ConfluenceSurfaceTimeframeSurface,
  MarketStructureDescriptiveConfluenceSurfaceContext,
} from "./market-structure-descriptive-confluence-surface-types";
import type {
  BuildMarketStructureScenarioInterpretationContextInput,
  MarketStructureScenarioInterpretation,
  MarketStructureScenarioInterpretationContext,
  ScenarioInterpretationFamily,
  ScenarioInterpretationStatus,
  ScenarioLiquidityContext,
  ScenarioMtfReadModelContext,
  ScenarioRequiredTransitionCode,
  ScenarioStructuralInvalidationReference,
} from "./market-structure-scenario-interpretation-types";
import {
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID,
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_SCHEMA_VERSION,
} from "./market-structure-scenario-interpretation-types";

const HTF_ID = "4H" as const;
const LTF_ID = "1H" as const;

function findSurface(
  ctx: MarketStructureDescriptiveConfluenceSurfaceContext,
  tf: string
): ConfluenceSurfaceTimeframeSurface | null {
  return ctx.timeframeSurfaces.find((s) => s.timeframeId === tf) ?? null;
}

function countDirectionEvents(
  events: readonly ClassifiedStructureEvent[],
  direction: ClassifiedStructureEvent["direction"]
): number {
  return events.filter((e) => e.direction === direction).length;
}

function hasBearishStructureTransition(surface: ConfluenceSurfaceTimeframeSurface): boolean {
  const bos = countDirectionEvents(surface.structure.bosEvents, "DOWN");
  const choch = countDirectionEvents(surface.structure.chochEvents, "DOWN");
  return bos + choch > 0;
}

function hasBullishStructureTransition(surface: ConfluenceSurfaceTimeframeSurface): boolean {
  const bos = countDirectionEvents(surface.structure.bosEvents, "UP");
  const choch = countDirectionEvents(surface.structure.chochEvents, "UP");
  return bos + choch > 0;
}

function buildInvalidationForBearishContinuation(
  htf: ConfluenceSurfaceTimeframeSurface | null
): ScenarioStructuralInvalidationReference {
  if (!htf) {
    return {
      status: "NOT_ESTABLISHED",
      side: "NONE",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: 0,
      descriptiveNote: "HTF surface unavailable for protected high reference.",
    };
  }
  const highs = htf.protected.protectedHighs;
  if (highs.length === 0) {
    return {
      status: "NOT_ESTABLISHED",
      side: "PROTECTED_HIGH",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: 0,
      descriptiveNote: "No protected high candidates at evaluation.",
    };
  }
  if (highs.length > 1) {
    return {
      status: "AMBIGUOUS",
      side: "PROTECTED_HIGH",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: highs.length,
      descriptiveNote: "Multiple protected high candidates; no single structural invalidation reference selected.",
    };
  }
  const c = highs[0]!;
  return {
    status: "SINGLE_REFERENCE",
    side: "PROTECTED_HIGH",
    referencePrice: c.price,
    pivotIndex: c.pivotIndex,
    candidateCount: 1,
    descriptiveNote: "Descriptive structural reference from HTF protected high candidate at evaluation.",
  };
}

function buildInvalidationForBullishContinuation(
  htf: ConfluenceSurfaceTimeframeSurface | null
): ScenarioStructuralInvalidationReference {
  if (!htf) {
    return {
      status: "NOT_ESTABLISHED",
      side: "NONE",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: 0,
      descriptiveNote: "HTF surface unavailable for protected low reference.",
    };
  }
  const lows = htf.protected.protectedLows;
  if (lows.length === 0) {
    return {
      status: "NOT_ESTABLISHED",
      side: "PROTECTED_LOW",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: 0,
      descriptiveNote: "No protected low candidates at evaluation.",
    };
  }
  if (lows.length > 1) {
    return {
      status: "AMBIGUOUS",
      side: "PROTECTED_LOW",
      referencePrice: null,
      pivotIndex: null,
      candidateCount: lows.length,
      descriptiveNote: "Multiple protected low candidates; no single structural invalidation reference selected.",
    };
  }
  const c = lows[0]!;
  return {
    status: "SINGLE_REFERENCE",
    side: "PROTECTED_LOW",
    referencePrice: c.price,
    pivotIndex: c.pivotIndex,
    candidateCount: 1,
    descriptiveNote: "Descriptive structural reference from HTF protected low candidate at evaluation.",
  };
}

function buildLiquidityContext(ltf: ConfluenceSurfaceTimeframeSurface | null): ScenarioLiquidityContext {
  if (!ltf) {
    return {
      bslCandidateCount: 0,
      sslCandidateCount: 0,
      eqhObservationCount: 0,
      eqlObservationCount: 0,
      wickTouchCount: 0,
      sweepCount: 0,
      takenCount: 0,
      reclaimCount: 0,
      observedInteractionFamilies: [],
      descriptiveNote: "LTF surface unavailable.",
    };
  }
  const adv = ltf.events.advancedEvents;
  const sweep = adv.filter((e) => e.eventType === "LIQUIDITY_SWEEP").length;
  const taken = adv.filter((e) => e.eventType === "LIQUIDITY_TAKEN").length;
  const reclaim = adv.filter((e) => e.eventType === "LIQUIDITY_RECLAIM").length;
  const touch = ltf.events.wickTouches.length;
  const observed: string[] = [];
  if (touch > 0) observed.push("LIQUIDITY_WICK_TOUCH");
  if (sweep > 0) observed.push("LIQUIDITY_SWEEP");
  if (taken > 0) observed.push("LIQUIDITY_TAKEN");
  if (reclaim > 0) observed.push("LIQUIDITY_RECLAIM");
  return {
    bslCandidateCount: ltf.liquidity.bslCandidates.length,
    sslCandidateCount: ltf.liquidity.sslCandidates.length,
    eqhObservationCount: ltf.liquidity.equalHighObservations.length,
    eqlObservationCount: ltf.liquidity.equalLowObservations.length,
    wickTouchCount: touch,
    sweepCount: sweep,
    takenCount: taken,
    reclaimCount: reclaim,
    observedInteractionFamilies: observed.sort((a, b) => a.localeCompare(b)),
    descriptiveNote:
      observed.length > 0
        ? "Liquidity interaction events observed at LTF evaluation."
        : "Liquidity foundation present; no wick/sweep/taken/reclaim interaction counted at evaluation.",
  };
}

function buildMtfReadModel(
  ctx: MarketStructureDescriptiveConfluenceSurfaceContext
): ScenarioMtfReadModelContext | null {
  const panel = ctx.mtfPanel;
  if (!panel) {
    return null;
  }
  return {
    structureAlignment: panel.structureAlignment?.state ?? null,
    liquiditySideAlignment: panel.liquidityAlignment?.sideAlignment ?? null,
    liquidityLifecycleAlignment: panel.liquidityAlignment?.lifecycleAlignment ?? null,
    eventOrderingRelationCount: panel.eventOrdering?.relationCount ?? 0,
    evaluationOrderingRelationCount: panel.eventOrdering?.evaluationRelationCount ?? 0,
    liquidityToStructureAssociationCount: panel.liquidityToStructureAssociations.length,
    structureToMssAssociationCount: panel.structureToMssAssociations.length,
    htfSourceTrack: panel.htfSourceTrack,
    evidenceTag: "DESCRIPTIVE_MTF_READ_MODEL_PASSTHROUGH",
  };
}

function baseEvidence(
  htf: ConfluenceSurfaceTimeframeSurface | null,
  ltf: ConfluenceSurfaceTimeframeSurface | null,
  mtf: ScenarioMtfReadModelContext | null
): string[] {
  const ev: string[] = [];
  if (htf) {
    ev.push(`HTF_TREND_${htf.protected.trendContext}`);
    if (htf.protected.protectedHighs.length > 1) ev.push("HTF_MULTIPLE_PROTECTED_HIGH");
    if (htf.protected.protectedHighs.length === 1) ev.push("HTF_PROTECTED_HIGH_PRESENT");
    if (htf.protected.protectedLows.length > 1) ev.push("HTF_MULTIPLE_PROTECTED_LOW");
    if (htf.protected.protectedLows.length === 1) ev.push("HTF_PROTECTED_LOW_PRESENT");
  } else {
    ev.push("HTF_SURFACE_MISSING");
  }
  if (ltf) {
    ev.push(`LTF_TREND_${ltf.protected.trendContext}`);
    if (ltf.structure.bosEvents.length === 0) ev.push("LTF_NO_BOS");
    else ev.push("LTF_BOS_PRESENT");
    if (ltf.structure.chochEvents.length === 0) ev.push("LTF_NO_CHOCH");
    else ev.push("LTF_CHOCH_PRESENT");
    if (hasBearishStructureTransition(ltf)) ev.push("LTF_BEARISH_STRUCTURE_TRANSITION_OBSERVED");
    if (hasBullishStructureTransition(ltf)) ev.push("LTF_BULLISH_STRUCTURE_TRANSITION_OBSERVED");
    if (ltf.mss.events.length === 0) ev.push("LTF_NO_MSS");
    else ev.push("LTF_MSS_PRESENT");
  } else {
    ev.push("LTF_SURFACE_MISSING");
  }
  if (mtf?.structureAlignment) {
    ev.push(`MTF_STRUCTURE_ALIGNMENT_${mtf.structureAlignment}`);
  }
  return ev.sort((a, b) => a.localeCompare(b));
}

function continuationStatus(
  ltf: ConfluenceSurfaceTimeframeSurface | null,
  bearish: boolean
): ScenarioInterpretationStatus {
  if (!ltf) {
    return "UNRESOLVED";
  }
  const observed = bearish
    ? hasBearishStructureTransition(ltf)
    : hasBullishStructureTransition(ltf);
  return observed ? "ACTIVE_CONTEXT" : "WAITING_FOR_TRANSITION";
}

function reversalStatus(ltf: ConfluenceSurfaceTimeframeSurface | null, bullish: boolean): ScenarioInterpretationStatus {
  if (!ltf) {
    return "UNRESOLVED";
  }
  const observed = bullish
    ? hasBullishStructureTransition(ltf)
    : hasBearishStructureTransition(ltf);
  return observed ? "ACTIVE_CONTEXT" : "WAITING_FOR_TRANSITION";
}

function buildScenario(
  type: ScenarioInterpretationFamily,
  status: ScenarioInterpretationStatus,
  htf: ConfluenceSurfaceTimeframeSurface | null,
  ltf: ConfluenceSurfaceTimeframeSurface | null,
  mtf: ScenarioMtfReadModelContext | null,
  required: readonly ScenarioRequiredTransitionCode[],
  invalidation: ScenarioStructuralInvalidationReference,
  extraEvidence: readonly string[] = []
): MarketStructureScenarioInterpretation {
  const liquidity = buildLiquidityContext(ltf);
  const evidence = [...new Set([...baseEvidence(htf, ltf, mtf), ...extraEvidence])].sort((a, b) =>
    a.localeCompare(b)
  );
  return {
    scenarioType: type,
    status,
    timeframeContext: {
      htfTimeframeId: HTF_ID,
      ltfTimeframeId: LTF_ID,
      htfTrendContext: htf?.protected.trendContext ?? null,
      ltfTrendContext: ltf?.protected.trendContext ?? null,
      fifteenMStatus: "NOT_ESTABLISHED",
    },
    observedEvidence: evidence,
    requiredTransitions: [...required],
    structuralInvalidation: invalidation,
    liquidityContext: liquidity,
    mtfContext: mtf,
    interpretation:
      "Descriptive scenario interpretation only. Observed structure and liquidity context at evaluation; not a trading signal, entry, exit, or prediction.",
    limitations: [
      "scenario_interpretation_descriptive_v1",
      "no_probability_no_score",
      "required_transition_not_equivalent_to_forecast",
    ],
  };
}

function primaryFamily(htfTrend: TrendDirection | null): ScenarioInterpretationFamily {
  if (htfTrend === "BEARISH") return "BEARISH_CONTINUATION";
  if (htfTrend === "BULLISH") return "BULLISH_CONTINUATION";
  if (htfTrend === "NEUTRAL") return "RANGE_OR_UNRESOLVED";
  return "UNRESOLVED";
}

function alternativeFamily(htfTrend: TrendDirection | null): ScenarioInterpretationFamily | null {
  if (htfTrend === "BEARISH") return "BULLISH_REVERSAL";
  if (htfTrend === "BULLISH") return "BEARISH_REVERSAL";
  return null;
}

export function buildMarketStructureScenarioInterpretationContext(
  input: BuildMarketStructureScenarioInterpretationContextInput
): MarketStructureScenarioInterpretationContext {
  const ctx = input.surface;
  const htf = findSurface(ctx, HTF_ID);
  const ltf = findSurface(ctx, LTF_ID);
  const mtf = buildMtfReadModel(ctx);
  const htfTrend = htf?.protected.trendContext ?? null;
  const evalTs =
    ctx.mtfPanel?.evaluationMetadata?.ltfEvaluationTimestamp ??
    ltf?.researchMetadata.evaluationTimestamp ??
    null;

  const unresolved: { code: string; message: string }[] = [];
  if (!htf) {
    unresolved.push({ code: "HTF_SURFACE_MISSING", message: "4H confluence surface not available." });
  }
  if (!ltf) {
    unresolved.push({ code: "LTF_SURFACE_MISSING", message: "1H confluence surface not available." });
  }
  if (!ctx.mtfPanel) {
    unresolved.push({
      code: "MTF_PANEL_MISSING",
      message: "MTF read-model panel unavailable; 9A–9E passthrough limited.",
    });
  }

  const limitations = [
    "MSL-16 descriptive scenario interpretation",
    "canonical_MTF_4H_1H",
    "15M_NOT_ESTABLISHED",
    "native_HTF_production_not_established",
    "no_trading_signal",
    "no_prediction",
    ...ctx.limitations.filter((l) => l.includes("DERIVED") || l.includes("native")),
  ];

  const researchFlags = [
    "scenario_interpretation_research_only",
    "msl15_historical_descriptive_measurements_catalogued_separately",
    "no_msl15_weighting_in_scenario_selection",
  ];

  let primary: MarketStructureScenarioInterpretation | null = null;
  let alternative: MarketStructureScenarioInterpretation | null = null;

  const pFamily = primaryFamily(htfTrend);
  const aFamily = alternativeFamily(htfTrend);

  if (pFamily === "BEARISH_CONTINUATION") {
    primary = buildScenario(
      pFamily,
      continuationStatus(ltf, true),
      htf,
      ltf,
      mtf,
      ["LTF_BEARISH_STRUCTURE_TRANSITION"],
      buildInvalidationForBearishContinuation(htf)
    );
  } else if (pFamily === "BULLISH_CONTINUATION") {
    primary = buildScenario(
      pFamily,
      continuationStatus(ltf, false),
      htf,
      ltf,
      mtf,
      ["LTF_BULLISH_STRUCTURE_TRANSITION"],
      buildInvalidationForBullishContinuation(htf)
    );
  } else if (pFamily === "RANGE_OR_UNRESOLVED") {
    primary = buildScenario(
      pFamily,
      "UNRESOLVED",
      htf,
      ltf,
      mtf,
      ["NONE"],
      {
        status: "UNRESOLVED",
        side: "NONE",
        referencePrice: null,
        pivotIndex: null,
        candidateCount: 0,
        descriptiveNote: "HTF trend neutral or insufficient directional context.",
      }
    );
  } else {
    primary = buildScenario(
      "UNRESOLVED",
      "UNRESOLVED",
      htf,
      ltf,
      mtf,
      ["NONE"],
      {
        status: "UNRESOLVED",
        side: "NONE",
        referencePrice: null,
        pivotIndex: null,
        candidateCount: 0,
        descriptiveNote: "Could not establish HTF trend context.",
      }
    );
  }

  if (aFamily === "BULLISH_REVERSAL") {
    alternative = buildScenario(
      aFamily,
      reversalStatus(ltf, true),
      htf,
      ltf,
      mtf,
      ["LTF_BULLISH_STRUCTURE_TRANSITION"],
      buildInvalidationForBearishContinuation(htf),
      ltf && hasBullishStructureTransition(ltf)
        ? ["COUNTER_HTF_BEARISH_LTF_BULLISH_TRANSITION_OBSERVED"]
        : ["COUNTER_HTF_BEARISH_LTF_BULLISH_TRANSITION_NOT_OBSERVED"]
    );
  } else if (aFamily === "BEARISH_REVERSAL") {
    alternative = buildScenario(
      aFamily,
      reversalStatus(ltf, false),
      htf,
      ltf,
      mtf,
      ["LTF_BEARISH_STRUCTURE_TRANSITION"],
      buildInvalidationForBullishContinuation(htf),
      ltf && hasBearishStructureTransition(ltf)
        ? ["COUNTER_HTF_BULLISH_LTF_BEARISH_TRANSITION_OBSERVED"]
        : ["COUNTER_HTF_BULLISH_LTF_BEARISH_TRANSITION_NOT_OBSERVED"]
    );
  }

  const globalEvidence = baseEvidence(htf, ltf, mtf);

  return {
    schemaVersion: MARKET_STRUCTURE_SCENARIO_INTERPRETATION_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID,
    evaluationTimestamp: evalTs,
    htfTimeframeId: HTF_ID,
    ltfTimeframeId: LTF_ID,
    primaryScenario: primary,
    alternativeScenario: alternative,
    observedEvidence: globalEvidence,
    unresolved: unresolved.sort((a, b) => a.code.localeCompare(b.code)),
    limitations: [...new Set(limitations)].sort((a, b) => a.localeCompare(b)),
    researchFlags,
  };
}

export {
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID,
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_SCHEMA_VERSION,
} from "./market-structure-scenario-interpretation-types";

export function assertNoForbiddenScenarioInterpretationTokens(json: string): void {
  const forbidden = [
    '"BUY"',
    '"SELL"',
    '"LONG"',
    '"SHORT"',
    '"ENTRY_SIGNAL"',
    '"EXIT_SIGNAL"',
    '"TRADE_SIGNAL"',
    '"probability"',
    '"confidence"',
    '"expectancy"',
    '"edge"',
    '"stopLoss"',
    '"takeProfit"',
    '"SL"',
    '"TP"',
    '"prediction"',
    '"recommendation"',
    '"score"',
  ];
  for (const token of forbidden) {
    if (json.includes(token)) {
      throw new Error(`forbidden token in scenario interpretation: ${token}`);
    }
  }
}
