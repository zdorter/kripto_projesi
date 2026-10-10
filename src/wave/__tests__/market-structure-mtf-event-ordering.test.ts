import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureMtfEventOrderingContext,
  buildCrossTfRelationId,
  resolveHtfToLtfOrderingRelation,
  compareNormalizedEvents,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-mtf-event-ordering";
import { buildMarketStructureLiquidityStructureAssociationContext } from "../market-structure/market-structure-liquidity-structure-association";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";
import type { NormalizedMtfOrderingEvent } from "../market-structure/market-structure-mtf-event-ordering-types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H));
}

function flattenBand(candles: Candle[]): void {
  for (const bar of candles) {
    bar.open = 100;
    bar.high = 105;
    bar.low = 95;
    bar.close = 100;
  }
}

function setSyntheticPivot(
  base: Candle[],
  index: number,
  type: "LOW" | "HIGH",
  price: number
): void {
  for (let j = index - 2; j <= index + 2; j++) {
    if (j < 0 || j >= base.length || j === index) continue;
    base[j].low = type === "LOW" ? price + 5 : price - 15;
    base[j].high = type === "LOW" ? price + 15 : price - 5;
    base[j].close = (base[j].high + base[j].low) / 2;
  }
  if (type === "LOW") {
    base[index].low = price;
    base[index].high = price + 4;
    base[index].close = price + 2;
  } else {
    base[index].high = price;
    base[index].low = price - 4;
    base[index].close = price - 2;
  }
}

function orderAt(
  ltf: Candle[],
  htf: Candle[],
  E: number,
  horizon = 24,
  track?: "DERIVED_1H_4H" | "NATIVE_HTF"
) {
  return buildMarketStructureMtfEventOrderingContext({
    ltfCandles: ltf,
    htfCandles: htf,
    ltfEvaluationBarIndex: E,
    ltfTimeframeId: "1H",
    htfTimeframeId: htf === ltf ? "1H" : "4H",
    horizonBars: horizon,
    swingConfig: SMALL_SWING,
    htfSourceTrack: track,
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

function mockNorm(
  partial: Partial<NormalizedMtfOrderingEvent> & Pick<NormalizedMtfOrderingEvent, "eventId" | "orderingTimestamp">
): NormalizedMtfOrderingEvent {
  return {
    eventFamily: "LIQUIDITY_SWEEP",
    timeframeId: "1H",
    knowabilityTimestamp: partial.orderingTimestamp + ONE_H - 1,
    triggerBarIndex: 10,
    sourceContext: "MSL-7E",
    leg: "HTF",
    inReplayWindow: true,
    visibleAtEvaluation: true,
    ...partial,
  };
}

describe("market-structure-mtf-event-ordering (MSL-9C)", () => {
  it("A–E pure ordering taxonomy", () => {
    assert.equal(resolveHtfToLtfOrderingRelation(100, 200), "BEFORE");
    assert.equal(resolveHtfToLtfOrderingRelation(300, 200), "AFTER");
    assert.equal(resolveHtfToLtfOrderingRelation(500, 500), "SAME_TIME");
    assert.equal(resolveHtfToLtfOrderingRelation(null, 100), "NOT_COMPARABLE");
    assert.equal(resolveHtfToLtfOrderingRelation(100, NaN), "NOT_COMPARABLE");
  });

  it("AA relation id deterministic dedupe", () => {
    const id = buildCrossTfRelationId("ce:BOS:x", "li:pool:SWEEP:5");
    assert.equal(id, "ctfo:ce:BOS:x:li:pool:SWEEP:5");
  });

  it("AB multiple SAME_TIME pairs", () => {
    const htfA = mockNorm({ eventId: "a", orderingTimestamp: 1000, leg: "HTF" });
    const htfB = mockNorm({ eventId: "b", orderingTimestamp: 1000, leg: "HTF" });
    const ltfA = mockNorm({ eventId: "c", orderingTimestamp: 1000, leg: "LTF" });
    const ltfB = mockNorm({ eventId: "d", orderingTimestamp: 1000, leg: "LTF" });
    assert.equal(
      resolveHtfToLtfOrderingRelation(htfA.orderingTimestamp, ltfA.orderingTimestamp),
      "SAME_TIME"
    );
    assert.equal(
      resolveHtfToLtfOrderingRelation(htfB.orderingTimestamp, ltfB.orderingTimestamp),
      "SAME_TIME"
    );
  });

  it("context schema and limitations", () => {
    const ctx = orderAt(htfSeries(30), htfSeries(30), 20);
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID);
    assert.ok(ctx.limitations.includes("temporal_order_only"));
    assert.ok(ctx.limitations.includes("no_causal_inference"));
    assert.ok(ctx.limitations.includes("no_mtf_mss"));
  });

  it("D UNRESOLVED when HTF missing", () => {
    const ctx = orderAt(htfSeries(10), [], 5);
    assert.ok(
      ctx.unresolved.some((u) => u.code === "HTF_EVENT_ORDERING_CONTEXT_UNAVAILABLE")
    );
    assert.equal(ctx.relations.length, 0);
  });

  it("P developing HTF bar excluded (7A parity)", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = htfSeries(30);
    const E = 2;
    const a = orderAt(ltf, htfA, E);
    const b = orderAt(ltf, htfB, E);
    assert.deepEqual(a.evaluationRelations, b.evaluationRelations);
    assert.deepEqual(a.htfEvents, b.htfEvents);
  });

  it("S prefix invariance @ fixed E", () => {
    const ltf = htfSeries(40);
    const htf = htfSeries(40);
    const E = 20;
    const base = orderAt(ltf, htf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((100 + k) * ONE_H, 200));
      htf.push(c((100 + k) * ONE_H, 50));
      const next = orderAt(ltf, htf, E);
      assert.deepEqual(next.evaluationRelations, base.evaluationRelations);
    }
  });

  it("T future spike invariance on evaluationRelations", () => {
    const ltf = htfSeries(50);
    const htf = htfSeries(50);
    const E = 25;
    const base = orderAt(ltf, htf, E);
    ltf.push(c(200 * ONE_H, 300));
    htf.push(c(200 * ONE_H, 10));
    assert.deepEqual(orderAt(ltf, htf, E).evaluationRelations, base.evaluationRelations);
  });

  it("U determinism ×5 JSON parity", () => {
    const ltf = htfSeries(45);
    const htf = htfSeries(45);
    const E = 30;
    const first = JSON.stringify(orderAt(ltf, htf, E));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(orderAt(ltf, htf, E)), first);
    }
  });

  it("V immutability deep-freeze inputs", () => {
    const ltf = htfSeries(35).map((x) => ({ ...x }));
    const htf = htfSeries(35).map((x) => ({ ...x }));
    deepFreeze(ltf);
    deepFreeze(htf);
    assert.doesNotThrow(() => orderAt(ltf, htf, 20));
  });

  it("Q derived 1H→4H track metadata", () => {
    const ltf = htfSeries(80);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.ok(derived.candles.length > 0);
    const ctx = buildMarketStructureMtfEventOrderingContext({
      ltfCandles: ltf,
      htfCandles: derived.candles,
      ltfEvaluationBarIndex: 40,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    assert.equal(ctx.htfSourceTrack, "DERIVED_1H_4H");
    assert.ok(ctx.limitations.includes("native_htf_parity_not_established"));
  });

  it("R native HTF track limitation", () => {
    const ctx = orderAt(htfSeries(40), htfSeries(40), 25, 24, "NATIVE_HTF");
    assert.equal(ctx.htfSourceTrack, "NATIVE_HTF");
    assert.ok(
      ctx.limitations.some((l) => l.includes("native_htf"))
    );
  });

  it("W no 7D duplication in ordering module source", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-mtf-event-ordering.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureLiquidityStructureAssociationContext"));
    assert.ok(!src.includes("LIQUIDITY_TO_BOS"));
  });

  it("X no 9A/9B state-as-event in ordering module", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-mtf-event-ordering.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureMtfStructureAlignmentContext"));
    assert.ok(!src.includes("buildMarketStructureMtfLiquidityAlignmentContext"));
    assert.ok(!src.includes("sideAlignment"));
  });

  it("Y/Z pools and protected are not event families in output", () => {
    const ctx = orderAt(htfSeries(35), htfSeries(35), 20);
    const families = new Set([
      ...ctx.htfEvents.map((e) => e.eventFamily),
      ...ctx.ltfEvents.map((e) => e.eventFamily),
    ]);
    for (const f of families) {
      assert.ok(
        f === "BOS" ||
          f === "CHoCH" ||
          f === "MSS" ||
          f === "LIQUIDITY_WICK_TOUCH" ||
          f === "CROSS_TF_LIQUIDITY_WICK_TOUCH" ||
          f === "LIQUIDITY_SWEEP" ||
          f === "LIQUIDITY_TAKEN" ||
          f === "LIQUIDITY_RECLAIM"
      );
    }
  });

  it("I/J many-to-many relations when events exist", () => {
    const base = flatCandles(50, 100);
    flattenBand(base);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    setSyntheticPivot(base, 10, "HIGH", 120);
    const ctx = orderAt(base, base, 20, 24);
    if (ctx.htfEvents.length >= 1 && ctx.ltfEvents.length >= 2) {
      const htfId = ctx.htfEvents[0]!.eventId;
      const matches = ctx.relations.filter((r) => r.htfEventId === htfId);
      assert.ok(matches.length >= 2);
    }
  });

  it("evaluationRelations subset of relations", () => {
    const ctx = orderAt(htfSeries(40), htfSeries(40), 22);
    assert.ok(ctx.evaluationRelations.length <= ctx.relations.length);
    for (const r of ctx.evaluationRelations) {
      assert.equal(r.visibleAtEvaluation, true);
    }
  });

  it("M/L replay vs evaluation visibility flags", () => {
    const ctx = orderAt(htfSeries(45), htfSeries(45), 20, 24);
    const replayOnly = ctx.relations.filter((r) => !r.visibleAtEvaluation);
    if (replayOnly.length > 0) {
      assert.ok(ctx.relations.length > ctx.evaluationRelations.length);
    }
  });

  it("compareNormalizedEvents sort order", () => {
    const a = mockNorm({ eventId: "z", orderingTimestamp: 100, eventFamily: "BOS" });
    const b = mockNorm({ eventId: "a", orderingTimestamp: 100, eventFamily: "CHoCH" });
    const sorted = [b, a].sort(compareNormalizedEvents);
    assert.equal(sorted[0]!.eventFamily, "BOS");
  });

  it("frozen BTC checksum + deterministic ordering context", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(
      join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH)
    );
    const E = 400;
    const ctx = orderAt(loaded.candles, loaded.candles, E, 12);
    const again = orderAt(loaded.candles, loaded.candles, E, 12);
    assert.deepEqual(ctx.evaluationRelations, again.evaluationRelations);
  });

  it("7D association builder remains separate (W integration)", () => {
    const candles = htfSeries(40);
    const assoc = buildMarketStructureLiquidityStructureAssociationContext({
      candles,
      evaluationBarIndex: 20,
    });
    assert.ok(assoc.associations.length >= 0);
    const ordering = orderAt(candles, candles, 20);
    assert.ok(!ordering.relations.some((r) => r.relationId.startsWith("lsa:")));
  });
});
