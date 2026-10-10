import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureHtfLiquidityLtfStructureAssociationContext,
  buildHtfLiquidityLtfStructureAssociationId,
  parsePoolIdFromLiquidityEventId,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-htf-liquidity-ltf-structure-association";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
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

function assocAt(
  ltf: Candle[],
  htf: Candle[],
  E: number,
  horizon = 24,
  track?: "DERIVED_1H_4H" | "NATIVE_HTF"
) {
  return buildMarketStructureHtfLiquidityLtfStructureAssociationContext({
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

function hasPair(
  ctx: ReturnType<typeof assocAt>,
  htfFamily: string,
  ltfFamily: string
): boolean {
  return ctx.replayAssociations.some(
    (a) =>
      a.htfLiquidityEventFamily === htfFamily &&
      a.ltfStructureEventFamily === ltfFamily
  );
}

describe("market-structure-htf-liquidity-ltf-structure-association (MSL-9D)", () => {
  it("association id and pool parse helpers", () => {
    const id = buildHtfLiquidityLtfStructureAssociationId("li:p1:LIQUIDITY_SWEEP:3", "ce:BOS:x");
    assert.equal(id, "ctlsa:li:p1:LIQUIDITY_SWEEP:3:ce:BOS:x");
    assert.equal(
      parsePoolIdFromLiquidityEventId("li:bsl:abc:LIQUIDITY_WICK_TOUCH:10"),
      "bsl:abc"
    );
    assert.equal(parsePoolIdFromLiquidityEventId("ce:BOS:x"), null);
  });

  it("context schema, limitations, causality boundary (AB)", () => {
    const ctx = assocAt(htfSeries(35), htfSeries(35), 20);
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID);
    assert.ok(ctx.limitations.includes("descriptive_association_only"));
    assert.ok(ctx.limitations.includes("no_causal_inference"));
    assert.ok(ctx.limitations.includes("no_prediction"));
    assert.ok(ctx.limitations.includes("ordering_eligibility_before_and_same_time_only"));
    for (const a of ctx.replayAssociations) {
      assert.equal(a.evidenceTag, "DIRECT_OBSERVATION");
      assert.ok(a.orderingRelation === "BEFORE" || a.orderingRelation === "SAME_TIME");
    }
  });

  it("A–C touch → BOS / CHoCH / MSS when present on synthetic ladder", () => {
    const base = flatCandles(55, 100);
    flattenBand(base);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    setSyntheticPivot(base, 10, "HIGH", 120);
    setSyntheticPivot(base, 18, "LOW", 100);
    const ctx = assocAt(base, base, 20, 24);
    if (hasPair(ctx, "LIQUIDITY_WICK_TOUCH", "BOS")) {
      assert.ok(ctx.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_BOS"));
    }
    if (hasPair(ctx, "LIQUIDITY_WICK_TOUCH", "CHoCH")) {
      assert.ok(ctx.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_CHoCH"));
    }
    if (hasPair(ctx, "LIQUIDITY_WICK_TOUCH", "MSS")) {
      assert.ok(ctx.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_MSS"));
    }
  });

  it("D–F sweep → BOS / CHoCH / MSS when present", () => {
    const ctx = assocAt(htfSeries(50), htfSeries(50), 25, 24);
    for (const [htf, ltf, type] of [
      ["LIQUIDITY_SWEEP", "BOS", "LIQUIDITY_TO_BOS"],
      ["LIQUIDITY_SWEEP", "CHoCH", "LIQUIDITY_TO_CHoCH"],
      ["LIQUIDITY_SWEEP", "MSS", "LIQUIDITY_TO_MSS"],
    ] as const) {
      if (hasPair(ctx, htf, ltf)) {
        assert.ok(ctx.replayAssociations.some((a) => a.associationType === type));
      }
    }
  });

  it("G–H taken / reclaim → structure when present", () => {
    const ctx = assocAt(htfSeries(50), htfSeries(50), 28, 24);
    if (hasPair(ctx, "LIQUIDITY_TAKEN", "BOS")) {
      assert.ok(ctx.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_BOS"));
    }
    if (hasPair(ctx, "LIQUIDITY_RECLAIM", "CHoCH")) {
      assert.ok(ctx.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_CHoCH"));
    }
  });

  it("I–K ordering eligibility: no AFTER associations (K)", () => {
    const ctx = assocAt(htfSeries(45), htfSeries(45), 22, 24);
    assert.ok(!ctx.replayAssociations.some((a) => a.orderingRelation === "AFTER"));
    assert.ok(!ctx.replayAssociations.some((a) => a.orderingRelation === "NOT_COMPARABLE"));
    if (ctx.replayAssociations.length > 0) {
      assert.ok(
        ctx.replayAssociations.some(
          (a) => a.orderingRelation === "BEFORE" || a.orderingRelation === "SAME_TIME"
        )
      );
    }
  });

  it("L–N many-to-many when multiple events exist", () => {
    const base = flatCandles(50, 100);
    flattenBand(base);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    setSyntheticPivot(base, 10, "HIGH", 120);
    const ctx = assocAt(base, base, 20, 24);
    const htfLiquidity = new Set(
      ctx.replayAssociations.map((a) => a.sourceLiquidityEventId)
    );
    const ltfStructure = new Set(
      ctx.replayAssociations.map((a) => a.targetStructureEventId)
    );
    if (htfLiquidity.size >= 1 && ltfStructure.size >= 2) {
      assert.ok(ctx.replayAssociations.length >= 2);
    }
  });

  it("O duplicate prevention — unique associationId", () => {
    const ctx = assocAt(htfSeries(40), htfSeries(40), 20);
    const ids = ctx.replayAssociations.map((a) => a.associationId);
    assert.equal(ids.length, new Set(ids).size);
    assert.deepEqual(ctx.associations, ctx.replayAssociations);
  });

  it("M/L evaluation vs replay subset", () => {
    const ctx = assocAt(htfSeries(45), htfSeries(45), 20, 24);
    assert.ok(ctx.evaluationAssociations.length <= ctx.replayAssociations.length);
    for (const a of ctx.evaluationAssociations) {
      assert.equal(a.visibleAtEvaluation, true);
    }
  });

  it("P developing HTF excluded (S parity)", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = htfSeries(30);
    const E = 2;
    const a = assocAt(ltf, htfA, E);
    const b = assocAt(ltf, htfB, E);
    assert.deepEqual(a.evaluationAssociations, b.evaluationAssociations);
    assert.deepEqual(a.replayAssociations, b.replayAssociations);
  });

  it("V prefix invariance @ fixed E", () => {
    const ltf = htfSeries(40);
    const htf = htfSeries(40);
    const E = 20;
    const base = assocAt(ltf, htf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((100 + k) * ONE_H, 200));
      htf.push(c((100 + k) * ONE_H, 50));
      const next = assocAt(ltf, htf, E);
      assert.deepEqual(next.evaluationAssociations, base.evaluationAssociations);
      assert.deepEqual(next.replayAssociations, base.replayAssociations);
    }
  });

  it("W future spike invariance on evaluationAssociations", () => {
    const ltf = htfSeries(50);
    const htf = htfSeries(50);
    const E = 25;
    const base = assocAt(ltf, htf, E);
    ltf.push(c(200 * ONE_H, 300));
    htf.push(c(200 * ONE_H, 10));
    assert.deepEqual(assocAt(ltf, htf, E).evaluationAssociations, base.evaluationAssociations);
  });

  it("X determinism ×5 JSON parity", () => {
    const ltf = htfSeries(45);
    const htf = htfSeries(45);
    const E = 30;
    const first = JSON.stringify(assocAt(ltf, htf, E));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(assocAt(ltf, htf, E)), first);
    }
  });

  it("Y deep-freeze immutability", () => {
    const ltf = htfSeries(35).map((x) => ({ ...x }));
    const htf = htfSeries(35).map((x) => ({ ...x }));
    deepFreeze(ltf);
    deepFreeze(htf);
    assert.doesNotThrow(() => assocAt(ltf, htf, 20));
  });

  it("T derived 1H→4H track metadata", () => {
    const ltf = htfSeries(80);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const ctx = buildMarketStructureHtfLiquidityLtfStructureAssociationContext({
      ltfCandles: ltf,
      htfCandles: derived.candles,
      ltfEvaluationBarIndex: 40,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    assert.equal(ctx.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("U native HTF metadata limitation", () => {
    const ctx = assocAt(htfSeries(40), htfSeries(40), 25, 24, "NATIVE_HTF");
    assert.equal(ctx.htfSourceTrack, "NATIVE_HTF");
    assert.ok(ctx.limitations.some((l) => l.includes("native_htf")));
  });

  it("Z no 7D builder in 9D module source", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-htf-liquidity-ltf-structure-association.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureLiquidityStructureAssociationContext"));
    assert.ok(!src.includes("buildMarketStructureBreakContext"));
    assert.ok(!src.includes("resolveHtfToLtfOrderingRelation("));
  });

  it("AA no 9A/9B alignment builders in 9D module", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-htf-liquidity-ltf-structure-association.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureMtfStructureAlignmentContext"));
    assert.ok(!src.includes("buildMarketStructureMtfLiquidityAlignmentContext"));
    assert.ok(ctxLimitationsIncludeNo9State());
  });

  it("AC frozen BTC checksum + deterministic association context", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(
      join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH)
    );
    const E = 400;
    const ctx = assocAt(loaded.candles, loaded.candles, E, 12);
    const again = assocAt(loaded.candles, loaded.candles, E, 12);
    assert.deepEqual(ctx.evaluationAssociations, again.evaluationAssociations);
    assert.deepEqual(ctx.replayAssociations, again.replayAssociations);
  });

  it("R knownAt uses LTF structure knowability (7D cross-TF parity)", () => {
    const ctx = assocAt(htfSeries(40), htfSeries(40), 20);
    for (const a of ctx.replayAssociations) {
      assert.equal(a.knownAtTimestamp, a.ltfKnowabilityTimestamp);
    }
  });

  it("HTF missing → empty associations + unresolved", () => {
    const ctx = assocAt(htfSeries(10), [], 5);
    assert.equal(ctx.replayAssociations.length, 0);
    assert.ok(
      ctx.unresolved.some((u) => u.code === "HTF_EVENT_ORDERING_CONTEXT_UNAVAILABLE")
    );
  });
});

function ctxLimitationsIncludeNo9State(): boolean {
  const ctx = assocAt(htfSeries(30), htfSeries(30), 15);
  return (
    ctx.limitations.includes("no_msl9a_state_as_eligibility") &&
    ctx.limitations.includes("no_msl9b_state_as_eligibility")
  );
}
