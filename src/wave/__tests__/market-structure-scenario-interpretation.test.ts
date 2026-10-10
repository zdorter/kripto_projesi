import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClassifiedStructureEvent } from "../market-structure/market-structure-break-types";
import type {
  ConfluenceSurfaceTimeframeSurface,
  MarketStructureDescriptiveConfluenceSurfaceContext,
} from "../market-structure/market-structure-descriptive-confluence-surface-types";
import {
  buildMarketStructureDescriptiveConfluenceSurfaceContext,
} from "../market-structure/market-structure-descriptive-confluence-surface";
import {
  assertNoForbiddenScenarioInterpretationTokens,
  buildMarketStructureScenarioInterpretationContext,
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID,
} from "../market-structure/market-structure-scenario-interpretation";
import { MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID } from "../market-structure/market-structure-break-types";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";
import type { LiquiditySweepEvent } from "../market-structure/market-structure-liquidity-advanced-interaction-types";
import { MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID } from "../market-structure/market-structure-liquidity-advanced-interaction-types";
import { MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID } from "../market-structure/market-structure-liquidity-advanced-interaction-types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H));
}

function surfaceAt(ltf: Candle[], E: number) {
  return buildMarketStructureDescriptiveConfluenceSurfaceContext({
    timeframeInputs: [{ timeframeId: "1H", candles: ltf, evaluationBarIndex: E }],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    horizonBars: 24,
    swingConfig: SMALL_SWING,
    htfSourceTrack: "DERIVED_1H_4H",
  });
}

function classifiedEvent(
  id: string,
  eventType: ClassifiedStructureEvent["eventType"],
  direction: ClassifiedStructureEvent["direction"]
): ClassifiedStructureEvent {
  return {
    eventId: id,
    eventType,
    classificationRuleId: MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
    derivedFromObservationId: `obs:${id}`,
    evidenceTag: "RULE_CLASSIFICATION",
    direction,
    referencePivotIndex: 1,
    referencePrice: 100,
    referenceType: "HIGH",
    referenceScope: "EXTERNAL",
    triggerBarIndex: 10,
    knownAtBarIndex: 10,
    trendContextAtClassification: "NEUTRAL",
  };
}

function emptyStructure(): ConfluenceSurfaceTimeframeSurface["structure"] {
  return {
    highStructure: [],
    lowStructure: [],
    structurePairCount: 0,
    zigzagSpineCount: 0,
    internalStructureCount: 0,
    externalStructureCount: 0,
    bosEvents: [],
    chochEvents: [],
  };
}

function protectedHigh(price: number, pivotIndex: number) {
  return {
    pivotIndex,
    type: "HIGH" as const,
    price,
    sourceSwingConfirmationBarIndex: pivotIndex,
    protectedStatusKnownAtBarIndex: pivotIndex,
    selectionReasonCodes: ["C5_EXTERNAL_SPINE"] as const,
    statusAtE: "ACTIVE" as const,
  };
}

function makeTfSurface(
  timeframeId: "4H" | "1H",
  trend: "BULLISH" | "BEARISH" | "NEUTRAL",
  opts: {
    bos?: ClassifiedStructureEvent[];
    choch?: ClassifiedStructureEvent[];
    protectedHighs?: ReturnType<typeof protectedHigh>[];
    protectedLows?: ReturnType<typeof protectedHigh>[];
    bsl?: number;
    ssl?: number;
    advanced?: ConfluenceSurfaceTimeframeSurface["events"]["advancedEvents"];
  } = {}
): ConfluenceSurfaceTimeframeSurface {
  const bslN = opts.bsl ?? 1;
  const sslN = opts.ssl ?? 1;
  return {
    timeframeId,
    status: "ACTIVE",
    structure: {
      ...emptyStructure(),
      bosEvents: opts.bos ?? [],
      chochEvents: opts.choch ?? [],
    },
    protected: {
      protectedHighs: opts.protectedHighs ?? [protectedHigh(101_000, 5)],
      protectedLows: opts.protectedLows ?? [protectedHigh(99_000, 3)],
      unresolved: [],
      trendContext: trend,
    },
    liquidity: {
      bslCandidates: Array.from({ length: bslN }, (_, i) => ({ candidateId: `bsl:${i}` })) as ConfluenceSurfaceTimeframeSurface["liquidity"]["bslCandidates"],
      sslCandidates: Array.from({ length: sslN }, (_, i) => ({ candidateId: `ssl:${i}` })) as ConfluenceSurfaceTimeframeSurface["liquidity"]["sslCandidates"],
      equalHighObservations: [],
      equalLowObservations: [],
      liquidityPools: [],
    },
    events: {
      wickTouches: [],
      advancedEvents: opts.advanced ?? [],
      lifecycleProjections: [],
    },
    mss: { researchOnly: true, events: [], trendContext: trend },
    sameTfAssociations: { liquidityStructureAssociations: [] },
    researchMetadata: { evaluationBarIndex: 20, evaluationTimestamp: 1_700_000_000_000, limitationCount: 0 },
  };
}

function mockSurface(
  htfTrend: "BULLISH" | "BEARISH" | "NEUTRAL",
  ltfTrend: "BULLISH" | "BEARISH" | "NEUTRAL",
  opts: Parameters<typeof makeTfSurface>[2] & { htfProtectedHighs?: ReturnType<typeof protectedHigh>[] } = {}
): MarketStructureDescriptiveConfluenceSurfaceContext {
  const htf = makeTfSurface("4H", htfTrend, {
    ...opts,
    protectedHighs: opts.htfProtectedHighs ?? opts.protectedHighs,
  });
  const ltf = makeTfSurface("1H", ltfTrend, opts);
  return {
    schemaVersion: "1.0",
    ruleId: "MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_V1",
    timeframeStatus: [
      { timeframeId: "4H", status: "ACTIVE" },
      { timeframeId: "1H", status: "ACTIVE" },
      { timeframeId: "15M", status: "NOT_ESTABLISHED" },
    ],
    timeframeSurfaces: [htf, ltf],
    mtfPanel: {
      htfTimeframeId: "4H",
      ltfTimeframeId: "1H",
      htfSourceTrack: "DERIVED_1H_4H",
      structureAlignment: {
        state: "NEUTRAL",
        ltfTrendContext: ltfTrend,
        htfTrendContext: htfTrend,
        evidenceTag: "DESCRIPTIVE_MTF_STRUCTURE_STATE",
      },
      liquidityAlignment: null,
      eventOrdering: {
        relationCount: 0,
        evaluationRelationCount: 0,
        htfEventFamilyCounts: {},
        ltfEventFamilyCounts: {},
        representativeEvaluationRelations: [],
      },
      liquidityToStructureAssociations: [],
      structureToMssAssociations: [],
      evaluationMetadata: { ltfEvaluationTimestamp: 1_700_000_000_000, htfEvaluationTimestamp: null, horizonBars: 24 },
      unresolved: [],
    },
    researchFlags: ["descriptive_confluence_surface"],
    limitations: [],
    unresolved: [],
    presentationTaxonomy: {
      schemaVersion: "1.0",
      coreLimitations: [],
      researchPresentationFlags: [],
      technicalLimitations: [],
    },
    nativeHtfResearchPresentation: {
      nativeHtfProductionStatus: "NOT_ESTABLISHED",
      descriptiveNote: "research",
    },
    confluencePresentationStatus: "DESCRIPTIVE_CONFLUENCE_ONLY",
  };
}

describe("market-structure-scenario-interpretation (MSL-16)", () => {
  it("schema and rule id", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.equal(ctx.schemaVersion, "1.0");
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID);
  });

  it("MSL-16-A: HTF bearish + LTF neutral → bearish continuation waiting", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.scenarioType, "BEARISH_CONTINUATION");
    assert.equal(ctx.primaryScenario?.status, "WAITING_FOR_TRANSITION");
    assert.ok(ctx.primaryScenario?.requiredTransitions.includes("LTF_BEARISH_STRUCTURE_TRANSITION"));
  });

  it("MSL-16-B: HTF bullish + LTF neutral → bullish continuation waiting", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BULLISH", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.scenarioType, "BULLISH_CONTINUATION");
    assert.equal(ctx.primaryScenario?.status, "WAITING_FOR_TRANSITION");
  });

  it("MSL-16-C: HTF bearish + LTF bullish transition", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", {
        choch: [classifiedEvent("c1", "CHoCH", "UP")],
      }),
    });
    assert.equal(ctx.primaryScenario?.scenarioType, "BEARISH_CONTINUATION");
    assert.equal(ctx.alternativeScenario?.scenarioType, "BULLISH_REVERSAL");
    assert.ok(
      ctx.alternativeScenario?.observedEvidence.includes("COUNTER_HTF_BEARISH_LTF_BULLISH_TRANSITION_OBSERVED")
    );
  });

  it("MSL-16-D: HTF bullish + LTF bearish transition", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BULLISH", "NEUTRAL", {
        bos: [classifiedEvent("b1", "BOS", "DOWN")],
      }),
    });
    assert.equal(ctx.primaryScenario?.scenarioType, "BULLISH_CONTINUATION");
    assert.equal(ctx.alternativeScenario?.scenarioType, "BEARISH_REVERSAL");
  });

  it("MSL-16-E: HTF neutral → RANGE_OR_UNRESOLVED", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("NEUTRAL", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.scenarioType, "RANGE_OR_UNRESOLVED");
    assert.equal(ctx.primaryScenario?.status, "UNRESOLVED");
    assert.equal(ctx.alternativeScenario, null);
  });

  it("MSL-16-F: multiple protected high → AMBIGUOUS invalidation", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", {
        htfProtectedHighs: [protectedHigh(101_000, 5), protectedHigh(102_000, 7)],
      }),
    });
    assert.equal(ctx.primaryScenario?.structuralInvalidation.status, "AMBIGUOUS");
  });

  it("MSL-16-G: multiple protected low → AMBIGUOUS invalidation (bullish primary)", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BULLISH", "NEUTRAL", {
        protectedLows: [protectedHigh(98_000, 2), protectedHigh(97_000, 4)],
      }),
    });
    assert.equal(ctx.primaryScenario?.structuralInvalidation.status, "AMBIGUOUS");
  });

  it("MSL-16-H: no liquidity pools → scenario still builds", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", { bsl: 0, ssl: 0 }),
    });
    assert.ok(ctx.primaryScenario);
    assert.equal(ctx.primaryScenario?.liquidityContext.bslCandidateCount, 0);
    assert.equal(ctx.primaryScenario?.liquidityContext.sslCandidateCount, 0);
  });

  it("MSL-16-I: liquidity present, no interaction", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", { bsl: 2, ssl: 1 }),
    });
    assert.equal(ctx.primaryScenario?.liquidityContext.observedInteractionFamilies.length, 0);
    assert.match(ctx.primaryScenario!.liquidityContext.descriptiveNote, /foundation present/i);
  });

  it("MSL-16-J: sweep observed only", () => {
    const adv: LiquiditySweepEvent = {
      eventId: "sweep:1",
      eventType: "LIQUIDITY_SWEEP",
      ruleId: MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
      poolId: "pool:1",
      poolKind: "BSL",
      side: "ABOVE",
      referencePrice: 102_000,
      referenceScope: "EXTERNAL",
      sourcePivotIndices: [3],
      triggerBarIndex: 12,
      triggerTimestamp: 1_700_000_000_000,
      knownAtBarIndex: 12,
      evidenceTag: "DIRECT_OBSERVATION",
    };
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", { advanced: [adv] }),
    });
    assert.ok(ctx.primaryScenario?.liquidityContext.observedInteractionFamilies.includes("LIQUIDITY_SWEEP"));
  });

  it("MSL-16-K: reclaim observed only", () => {
    const adv = {
      eventId: "reclaim:1",
      eventType: "LIQUIDITY_RECLAIM",
      ruleId: MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
      poolId: "pool:2",
      poolKind: "SSL",
      side: "BELOW",
      referencePrice: 98_000,
      referenceScope: "EXTERNAL",
      sourcePivotIndices: [2],
      triggerBarIndex: 14,
      triggerTimestamp: 1_700_000_000_000,
      knownAtBarIndex: 14,
      evidenceTag: "DIRECT_OBSERVATION",
      precedingSweepEventId: "sweep:0",
      precedingSweepTriggerBarIndex: 10,
    } as const;
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL", { advanced: [adv] }),
    });
    assert.ok(ctx.primaryScenario?.liquidityContext.observedInteractionFamilies.includes("LIQUIDITY_RECLAIM"));
  });

  it("MSL-16-L: MTF panel passthrough not recomputed", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.mtfContext?.structureAlignment, "NEUTRAL");
    assert.equal(ctx.primaryScenario?.mtfContext?.evidenceTag, "DESCRIPTIVE_MTF_READ_MODEL_PASSTHROUGH");
  });

  it("MSL-16-M: 15M NOT_ESTABLISHED on scenario timeframe context", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.timeframeContext.fifteenMStatus, "NOT_ESTABLISHED");
  });

  it("MSL-16-N: native HTF track preserved in MTF passthrough", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.equal(ctx.primaryScenario?.mtfContext?.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("MSL-16-O: prefix invariance at fixed E", () => {
    const ltf = htfSeries(50);
    const E = 25;
    const baseSurface = surfaceAt(ltf, E);
    const baseScenario = buildMarketStructureScenarioInterpretationContext({ surface: baseSurface });
    for (let k = 0; k < 3; k++) {
      ltf.push(c((50 + k) * ONE_H, 200));
      const nextScenario = buildMarketStructureScenarioInterpretationContext({
        surface: surfaceAt(ltf, E),
      });
      assert.deepEqual(nextScenario, baseScenario);
    }
  });

  it("MSL-16-P: determinism ×5", () => {
    const surface = mockSurface("BEARISH", "NEUTRAL");
    const first = JSON.stringify(buildMarketStructureScenarioInterpretationContext({ surface }));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(buildMarketStructureScenarioInterpretationContext({ surface })), first);
    }
  });

  it("MSL-16-Q: forbidden keys", () => {
    const ctx = buildMarketStructureScenarioInterpretationContext({
      surface: mockSurface("BEARISH", "NEUTRAL"),
    });
    assert.doesNotThrow(() => assertNoForbiddenScenarioInterpretationTokens(JSON.stringify(ctx)));
  });

  it("MSL-16-R: frozen BTC checksum unchanged", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH));
    const E = 400;
    const scenario = buildMarketStructureScenarioInterpretationContext({
      surface: surfaceAt(loaded.candles, E),
    });
    assert.equal(scenario.htfTimeframeId, "4H");
    assert.equal(scenario.ltfTimeframeId, "1H");
    assert.doesNotThrow(() => assertNoForbiddenScenarioInterpretationTokens(JSON.stringify(scenario)));
  });

  it("architecture — scenario module read-only on 9F input", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-scenario-interpretation.ts"),
      "utf8"
    );
    assert.ok(src.includes("buildMarketStructureScenarioInterpretationContext"));
    assert.ok(!src.includes("buildMarketStructureDescriptiveConfluenceSurfaceContext"));
    assert.ok(!src.includes("detectSwings"));
    assert.ok(!src.includes("fetch("));
    assert.ok(!src.includes("trade-evaluation"));
    assert.ok(!src.includes("buildMarketStructureMtfStructureAlignmentContext"));
  });
});
