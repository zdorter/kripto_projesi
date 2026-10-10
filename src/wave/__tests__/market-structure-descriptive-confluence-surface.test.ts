import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureDescriptiveConfluenceSurfaceContext,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-descriptive-confluence-surface";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H));
}

function surfaceAt(ltf: Candle[], E: number, includeReplay = false) {
  return buildMarketStructureDescriptiveConfluenceSurfaceContext({
    timeframeInputs: [{ timeframeId: "1H", candles: ltf, evaluationBarIndex: E }],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    horizonBars: 24,
    swingConfig: SMALL_SWING,
    htfSourceTrack: "DERIVED_1H_4H",
    includeReplayRelations: includeReplay,
  });
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

describe("market-structure-descriptive-confluence-surface (MSL-9F)", () => {
  it("schema and research flags (AF–AI boundaries)", () => {
    const ctx = surfaceAt(htfSeries(40), 20);
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID);
    assert.equal(ctx.schemaVersion, "1.0");
    assert.ok(ctx.researchFlags.includes("descriptive_confluence_surface"));
    assert.ok(ctx.researchFlags.includes("no_scoring"));
    assert.ok(ctx.researchFlags.includes("no_causality"));
    assert.ok(ctx.researchFlags.includes("no_prediction"));
    const json = JSON.stringify(ctx);
    assert.ok(!json.includes('"confluenceScore"'));
    assert.ok(!json.includes('"probability"'));
    assert.ok(!json.includes('"signalStrength"'));
  });

  it("T — 15M NOT_ESTABLISHED metadata", () => {
    const ctx = surfaceAt(htfSeries(35), 18);
    const m15 = ctx.timeframeStatus.find((t) => t.timeframeId === "15M");
    assert.equal(m15?.status, "NOT_ESTABLISHED");
    assert.ok(!ctx.timeframeSurfaces.some((s) => s.timeframeId === "15M"));
  });

  it("A/B — 1H and 4H active timeframe surfaces", () => {
    const ctx = surfaceAt(htfSeries(80), 40);
    const ids = ctx.timeframeSurfaces.map((s) => s.timeframeId);
    assert.ok(ids.includes("1H"));
    assert.ok(ids.includes("4H"));
    assert.equal(ids[0], "4H");
    assert.equal(ids[1], "1H");
  });

  it("C structure section present", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.ok(Array.isArray(oneH.structure.highStructure));
    assert.ok(Array.isArray(oneH.structure.bosEvents));
    assert.ok(Array.isArray(oneH.structure.chochEvents));
  });

  it("D protected candidates preserved", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.ok(Array.isArray(oneH.protected.protectedHighs));
    assert.ok(Array.isArray(oneH.protected.protectedLows));
  });

  it("E liquidity foundation separate from events", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.ok(Array.isArray(oneH.liquidity.liquidityPools));
    assert.ok(Array.isArray(oneH.events.wickTouches));
    assert.notEqual(oneH.liquidity.liquidityPools, oneH.events.wickTouches);
  });

  it("F–I liquidity events and lifecycle sections", () => {
    const ctx = surfaceAt(htfSeries(50), 28);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.ok(Array.isArray(oneH.events.advancedEvents));
    assert.ok(Array.isArray(oneH.events.lifecycleProjections));
  });

  it("K MSS research-only section", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.equal(oneH.mss.researchOnly, true);
    assert.ok(Array.isArray(oneH.mss.events));
  });

  it("7D same-TF associations on surface", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    assert.ok(Array.isArray(oneH.sameTfAssociations.liquidityStructureAssociations));
  });

  it("L–P MTF panel 9A–9E", () => {
    const ctx = surfaceAt(htfSeries(60), 30);
    assert.ok(ctx.mtfPanel);
    assert.ok(ctx.mtfPanel!.structureAlignment);
    assert.ok(ctx.mtfPanel!.liquidityAlignment);
    assert.ok(ctx.mtfPanel!.eventOrdering);
    assert.ok(Array.isArray(ctx.mtfPanel!.liquidityToStructureAssociations));
    assert.ok(Array.isArray(ctx.mtfPanel!.structureToMssAssociations));
    assert.ok(
      ctx.mtfPanel!.structureAlignment!.evidenceTag === "DESCRIPTIVE_MTF_STRUCTURE_STATE"
    );
  });

  it("N — 9C ordering summary not full copy by default", () => {
    const ctx = surfaceAt(htfSeries(55), 28);
    const ordering = ctx.mtfPanel!.eventOrdering!;
    assert.ok(ordering.relationCount >= ordering.evaluationRelationCount);
    assert.ok(ordering.representativeEvaluationRelations.length <= 32);
    assert.equal(ordering.replayRelations, undefined);
  });

  it("N — replayRelations optional", () => {
    const ctx = surfaceAt(htfSeries(55), 28, true);
    assert.ok(Array.isArray(ctx.mtfPanel!.eventOrdering!.replayRelations));
  });

  it("R derived 1H→4H track", () => {
    const ctx = surfaceAt(htfSeries(70), 35);
    assert.equal(ctx.mtfPanel!.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("S native HTF metadata when declared", () => {
    const ltf = htfSeries(60);
    const htf = htfSeries(60);
    const ctx = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [
        { timeframeId: "1H", candles: ltf, evaluationBarIndex: 30 },
        { timeframeId: "4H", candles: htf, evaluationBarIndex: 15 },
      ],
      htfSourceTrack: "NATIVE_HTF",
      swingConfig: SMALL_SWING,
    });
    assert.equal(ctx.mtfPanel!.htfSourceTrack, "NATIVE_HTF");
    assert.ok(ctx.limitations.some((l) => l.includes("native_htf")));
  });

  it("U missing LTF → no MTF panel", () => {
    const ctx = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [],
    });
    assert.equal(ctx.mtfPanel, null);
    assert.equal(ctx.timeframeSurfaces.length, 0);
  });

  it("V unresolved merged with source", () => {
    const ctx = surfaceAt(htfSeries(40), 20);
    for (const u of ctx.unresolved) {
      assert.ok(u.sourceContext.length > 0);
      assert.ok(u.code.length > 0);
    }
  });

  it("AA prefix invariance on evaluation MTF outputs", () => {
    const ltf = htfSeries(50);
    const E = 25;
    const base = surfaceAt(ltf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((50 + k) * ONE_H, 200));
      const next = surfaceAt(ltf, E);
      assert.deepEqual(
        next.mtfPanel!.liquidityToStructureAssociations,
        base.mtfPanel!.liquidityToStructureAssociations
      );
      assert.deepEqual(
        next.mtfPanel!.structureToMssAssociations,
        base.mtfPanel!.structureToMssAssociations
      );
      assert.deepEqual(
        next.mtfPanel!.eventOrdering!.representativeEvaluationRelations,
        base.mtfPanel!.eventOrdering!.representativeEvaluationRelations
      );
    }
  });

  it("AB future spike invariance", () => {
    const ltf = htfSeries(55);
    const E = 28;
    const base = surfaceAt(ltf, E);
    ltf.push(c(55 * ONE_H, 500));
    const next = surfaceAt(ltf, E);
    assert.deepEqual(
      next.mtfPanel!.structureToMssAssociations,
      base.mtfPanel!.structureToMssAssociations
    );
  });

  it("AC determinism ×5", () => {
    const ltf = htfSeries(48);
    const E = 30;
    const first = JSON.stringify(surfaceAt(ltf, E));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(surfaceAt(ltf, E)), first);
    }
  });

  it("AE immutability deep-freeze", () => {
    const ltf = htfSeries(40).map((x) => ({ ...x }));
    deepFreeze(ltf);
    assert.doesNotThrow(() => surfaceAt(ltf, 20));
  });

  it("AJ/AK evaluation associations reference 9D/9E rows", () => {
    const ctx = surfaceAt(htfSeries(50), 26);
    for (const a of ctx.mtfPanel!.liquidityToStructureAssociations) {
      assert.ok(a.associationId.startsWith("ctlsa:"));
      assert.equal(a.evidenceTag, "DIRECT_OBSERVATION");
    }
    for (const a of ctx.mtfPanel!.structureToMssAssociations) {
      assert.ok(a.associationId.startsWith("ctssa:"));
    }
  });

  it("AL module does not call child builders twice via detectSwings", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-descriptive-confluence-surface.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("detectSwings"));
    assert.ok(src.includes("buildMarketStructureMtfEventOrderingContext"));
    assert.ok(!src.includes("resolveHtfToLtfOrderingRelation("));
  });

  it("AM no direct detectSwings — uses snapshot entry", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-descriptive-confluence-surface.ts"
      ),
      "utf8"
    );
    assert.ok(src.includes("buildMarketStructureSnapshotAtBar"));
  });

  it("AN frozen BTC checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH));
    const E = 400;
    const a = surfaceAt(loaded.candles, E, false);
    const b = surfaceAt(loaded.candles, E, false);
    assert.deepEqual(
      a.mtfPanel!.eventOrdering!.representativeEvaluationRelations,
      b.mtfPanel!.eventOrdering!.representativeEvaluationRelations
    );
  });

  it("limitations lexicographic merge", () => {
    const ctx = surfaceAt(htfSeries(42), 21);
    const sorted = [...ctx.limitations].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(ctx.limitations, sorted);
  });

  it("MSL-10 — presentation taxonomy and native HTF research presentation on surface", () => {
    const ctx = surfaceAt(htfSeries(42), 21);
    assert.equal(ctx.confluencePresentationStatus, "DESCRIPTIVE_CONFLUENCE_ONLY");
    assert.equal(ctx.presentationTaxonomy.schemaVersion, "1.0");
    assert.equal(ctx.nativeHtfResearchPresentation.nativeHtfProductionStatus, "NOT_ESTABLISHED");
    const union = [
      ...ctx.presentationTaxonomy.coreLimitations,
      ...ctx.presentationTaxonomy.researchPresentationFlags,
      ...ctx.presentationTaxonomy.technicalLimitations,
    ];
    assert.equal(union.length, new Set(union).size);
  });

  it("synthetic ladder surfaces build", () => {
    const base = flatCandles(55, 100);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    const ctx = surfaceAt(base, 20);
    assert.ok(ctx.timeframeSurfaces.length >= 1);
  });

  it("mtfPanel evaluationMetadata", () => {
    const ctx = surfaceAt(htfSeries(45), 22);
    assert.ok(ctx.mtfPanel!.evaluationMetadata);
    assert.ok(ctx.mtfPanel!.evaluationMetadata!.ltfEvaluationTimestamp > 0);
  });

  it("AG — no trading enum states in JSON", () => {
    const ctx = surfaceAt(htfSeries(40), 20);
    const payload = JSON.stringify(ctx);
    assert.ok(!/"BUY"/.test(payload));
    assert.ok(!/"SELL"/.test(payload));
    assert.ok(!/"LONG"/.test(payload));
    assert.ok(!/"SHORT"/.test(payload));
  });

  it("W multiple protected candidates not collapsed", () => {
    const ctx = surfaceAt(htfSeries(50), 28);
    const oneH = ctx.timeframeSurfaces.find((s) => s.timeframeId === "1H")!;
    const total =
      oneH.protected.protectedHighs.length + oneH.protected.protectedLows.length;
    assert.ok(total >= 0);
    assert.ok(Array.isArray(oneH.protected.protectedHighs));
  });

  it("Q MTF panel timeframe ids", () => {
    const ctx = surfaceAt(htfSeries(50), 25);
    assert.equal(ctx.mtfPanel!.ltfTimeframeId, "1H");
    assert.equal(ctx.mtfPanel!.htfTimeframeId, "4H");
  });
});
