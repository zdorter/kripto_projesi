import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureCrossTfLiquidityInteractionContext,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "../market-structure/market-structure-cross-tf-liquidity-interaction";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
import { knownAtTimestampFromBarIndex } from "../market-structure/market-structure-mtf-alignment";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const FOUR_H = 4 * ONE_H;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function hourSeries(startTime: number, count: number, price = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => c(startTime + i * ONE_H, price));
}

function setSyntheticPivot(
  base: Candle[],
  index: number,
  type: "LOW" | "HIGH",
  price: number
): void {
  for (let j = index - 2; j <= index + 2; j++) {
    if (j < 0 || j >= base.length) continue;
    if (j === index) continue;
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

function flatHours(count: number, price = 100): Candle[] {
  return hourSeries(0, count, price);
}

function htfBslOn1h(
  htf: Candle[],
  pivotIndex: number,
  highPrice: number,
  E_HTF: number
) {
  setSyntheticPivot(htf, pivotIndex, "HIGH", highPrice);
  const snap = buildMarketStructureSnapshotAtBar({
    candles: htf,
    evaluationBarIndex: E_HTF,
    swingConfig: SMALL_SWING,
  });
  const pool = snap.liquidity.liquidityPools.find(
    (p) => p.poolKind === "SINGLE_HIGH" && p.sourcePivotIndices[0] === pivotIndex
  );
  assert.ok(pool, "expected HTF BSL pool");
  return { snap, pool };
}

function crossTf(input: {
  ltf: Candle[];
  htf: Candle[];
  E_LTF: number;
  horizonBars?: number;
  ltfTf?: string;
  htfTf?: string;
}) {
  return buildMarketStructureCrossTfLiquidityInteractionContext({
    ltfCandles: input.ltf,
    htfCandles: input.htf,
    ltfTimeframeId: input.ltfTf ?? "1H",
    htfTimeframeId: input.htfTf ?? "1H",
    ltfEvaluationBarIndex: input.E_LTF,
    horizonBars: input.horizonBars,
    swingConfig: SMALL_SWING,
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

describe("market-structure-cross-tf-liquidity-interaction (MSL-7C)", () => {
  it("E — LTF touch after HTF pool known → event", () => {
    const htf = flatHours(80, 100);
    const { pool } = htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    ltf[E + 1].high = pool.price + 1;
    ltf[E + 1].close = pool.price - 2;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].eventType, "LIQUIDITY_WICK_TOUCH");
    assert.equal(ctx.events[0].htfPoolId, pool.poolId);
    assert.equal(ctx.events[0].ltfTriggerBarIndex, E + 1);
    assert.equal(ctx.events[0].side, "HIGH_SIDE");
    assert.ok(ctx.events[0].ltfTriggerTimestamp >= ctx.events[0].htfPoolKnownAtTimestamp);
  });

  it("Q — E bar touch does not create event", () => {
    const htf = flatHours(80, 100);
    const { pool } = htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    ltf[E].high = pool.price + 5;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    assert.equal(ctx.events.length, 0);
  });

  it("F — same HTF pool multiple LTF touches → multiple events", () => {
    const htf = flatHours(80, 100);
    const { pool } = htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    for (const bar of [E + 1, E + 3, E + 5]) {
      ltf[bar].high = pool.price;
      ltf[bar].close = pool.price - 1;
    }
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    assert.equal(ctx.events.length, 3);
    assert.ok(ctx.events.every((e) => e.htfPoolId === pool.poolId));
  });

  it("G — multiple HTF pools same LTF bar", () => {
    const htf = flatHours(90, 100);
    htfBslOn1h(htf, 25, 140, 55);
    htfBslOn1h(htf, 35, 160, 55);
    const snap = buildMarketStructureSnapshotAtBar({
      candles: htf,
      evaluationBarIndex: 55,
      swingConfig: SMALL_SWING,
    });
    const pools = snap.liquidity.liquidityPools.filter((p) => p.poolKind === "SINGLE_HIGH");
    assert.ok(pools.length >= 2);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 50;
    ltf[E + 1].high = 165;
    ltf[E + 1].close = 100;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    const atBar = ctx.events.filter((e) => e.ltfTriggerBarIndex === E + 1);
    assert.ok(atBar.length >= 2);
  });

  it("H — HTF BSL + SSL same LTF bar → two events", () => {
    const htf = flatHours(90, 100);
    setSyntheticPivot(htf, 28, "HIGH", 160);
    setSyntheticPivot(htf, 32, "LOW", 70);
    const snap = buildMarketStructureSnapshotAtBar({
      candles: htf,
      evaluationBarIndex: 55,
      swingConfig: SMALL_SWING,
    });
    const highPool = snap.liquidity.liquidityPools.find((p) => p.poolKind === "SINGLE_HIGH");
    const lowPool = snap.liquidity.liquidityPools.find((p) => p.poolKind === "SINGLE_LOW");
    assert.ok(highPool && lowPool);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 50;
    ltf[E + 1].high = highPool.price + 1;
    ltf[E + 1].low = lowPool.price - 1;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    const atBar = ctx.events.filter((e) => e.ltfTriggerBarIndex === E + 1);
    assert.equal(atBar.length, 2);
    assert.ok(atBar.some((e) => e.side === "HIGH_SIDE"));
    assert.ok(atBar.some((e) => e.side === "LOW_SIDE"));
  });

  it("D — LTF touch before HTF pool known → no event", () => {
    const htf = flatHours(80, 100);
    const pivot = 30;
    const highPrice = 150;
    setSyntheticPivot(htf, pivot, "HIGH", highPrice);
    const E_HTF = 50;
    const snap = buildMarketStructureSnapshotAtBar({
      candles: htf,
      evaluationBarIndex: E_HTF,
      swingConfig: SMALL_SWING,
    });
    const pool = snap.liquidity.liquidityPools.find(
      (p) => p.poolKind === "SINGLE_HIGH" && p.sourcePivotIndices[0] === pivot
    );
    assert.ok(pool);
    const poolKnownAt = knownAtTimestampFromBarIndex(htf, pool.knownAtBarIndex, "1H")!;
    const ltf = htf.map((x) => ({ ...x }));
    const E = pool.knownAtBarIndex - 1;
    assert.ok(E >= 0);
    const touchBar = E + 1;
    assert.ok(ltf[touchBar].time < poolKnownAt);
    ltf[touchBar].high = pool.price + 1;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    assert.equal(ctx.events.length, 0);
  });

  it("C — HTF pool not visible at T_LTF → no event", () => {
    const htf = flatHours(80, 100);
    htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 20;
    ltf[E + 1].high = 200;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    assert.equal(ctx.events.length, 0);
  });

  it("A — HTF future spike does not change prior cross-TF events", () => {
    const htfBase = flatHours(70, 100);
    htfBslOn1h(htfBase, 25, 140, 45);
    const ltf = htfBase.map((x) => ({ ...x }));
    const E = 35;
    ltf[E + 1].high = 145;
    const ctxA = crossTf({ ltf, htf: htfBase, E_LTF: E });
    const htfExtended = [...htfBase, c(70 * ONE_H, 500), c(71 * ONE_H, 600)];
    setSyntheticPivot(htfExtended, 71, "HIGH", 900);
    const ctxB = crossTf({ ltf, htf: htfExtended, E_LTF: E });
    assert.deepEqual(ctxA.events, ctxB.events);
  });

  it("I — prefix invariance on LTF suffix", () => {
    const htf = flatHours(70, 100);
    htfBslOn1h(htf, 25, 140, 45);
    const ltfShort = flatHours(55, 100);
    const ltfLong = flatHours(75, 100);
    const E = 35;
    ltfShort[E + 1].high = 145;
    ltfLong[E + 1].high = 145;
    const a = crossTf({ ltf: ltfShort, htf, E_LTF: E });
    const b = crossTf({ ltf: ltfLong, htf, E_LTF: E });
    assert.deepEqual(a.events, b.events);
  });

  it("J — immutability", () => {
    const htf = flatHours(70, 100);
    htfBslOn1h(htf, 25, 140, 45);
    const ltf = htf.map((x) => ({ ...x }));
    deepFreeze(ltf);
    deepFreeze(htf);
    const E = 35;
    ltf[E + 1].high = 145;
    crossTf({ ltf, htf, E_LTF: E });
    assert.ok(Object.isFrozen(ltf));
    assert.ok(Object.isFrozen(htf));
  });

  it("K — determinism (5 runs)", () => {
    const htf = flatHours(70, 100);
    htfBslOn1h(htf, 25, 140, 45);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 35;
    ltf[E + 1].high = 145;
    const runs = Array.from({ length: 5 }, () =>
      crossTf({ ltf, htf, E_LTF: E })
    );
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
      assert.equal(JSON.stringify(runs[i]), JSON.stringify(runs[0]));
    }
  });

  it("L — unsupported timeframe → unresolved, no silent fallback", () => {
    const ltf = hourSeries(0, 10);
    const ctx = crossTf({ ltf, htf: ltf, E_LTF: 5, ltfTf: "NOT_A_TF", htfTf: "1H" });
    assert.equal(ctx.events.length, 0);
    assert.ok(ctx.unresolved.some((u) => u.code === "MISSING_TIMEFRAME_DATA"));
  });

  it("M — missing HTF context → explicit unresolved", () => {
    const ltf = hourSeries(0, 5);
    const empty = crossTf({ ltf, htf: [], E_LTF: 2 });
    assert.equal(empty.events.length, 0);
    assert.ok(empty.unresolved.some((u) => u.code === "MISSING_TIMEFRAME_DATA"));

    const early = crossTf({ ltf: hourSeries(0, 10), htf: hourSeries(0, 2), E_LTF: 0 });
    assert.equal(early.events.length, 0);
    assert.ok(early.unresolved.some((u) => u.code === "INSUFFICIENT_HTF_CONTEXT"));
  });

  it("R — horizon boundary E+H included, E+H+1 excluded", () => {
    const htf = flatHours(80, 100);
    const { pool } = htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    const H = 3;
    ltf[E + H].high = pool.price + 1;
    ltf[E + H + 1].high = pool.price + 1;
    const ctx = crossTf({ ltf, htf, E_LTF: E, horizonBars: H });
    assert.ok(ctx.events.some((e) => e.ltfTriggerBarIndex === E + H));
    assert.ok(!ctx.events.some((e) => e.ltfTriggerBarIndex === E + H + 1));
  });

  it("S — invalid horizon", () => {
    const ltf = hourSeries(0, 20);
    const ctx = crossTf({ ltf, htf: ltf, E_LTF: 5, horizonBars: 0 });
    assert.equal(ctx.events.length, 0);
    assert.ok(ctx.unresolved.some((u) => u.code === "INVALID_HORIZON_BARS"));
  });

  it("T — event id encodes HTF timeframe (pool id collision safe)", () => {
    const htf = flatHours(70, 100);
    const { pool } = htfBslOn1h(htf, 25, 140, 45);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 35;
    ltf[E + 1].high = 145;
    const ctx1 = crossTf({ ltf, htf, E_LTF: E, htfTf: "1H" });
    assert.equal(ctx1.events.length, 1);
    assert.ok(ctx1.events[0].eventId.startsWith("ctf:1H:"));
    assert.ok(ctx1.events[0].eventId.includes(pool.poolId));
    assert.ok(ctx1.events[0].eventId.includes("LIQUIDITY_WICK_TOUCH"));
    const ctx4 = crossTf({ ltf, htf, E_LTF: E, htfTf: "4H" });
    if (ctx4.events.length > 0) {
      assert.ok(ctx4.events[0].eventId.startsWith("ctf:4H:"));
      assert.notEqual(ctx4.events[0].eventId, ctx1.events[0].eventId);
    }
  });

  it("P — no BOS/CHoCH coupling in events", () => {
    const htf = flatHours(80, 100);
    htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    ltf[E + 1].high = 155;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    for (const ev of ctx.events) {
      assert.equal(ev.eventType, "LIQUIDITY_WICK_TOUCH");
      assert.notEqual((ev as { bos?: string }).bos, "BOS");
    }
    assert.ok(ctx.limitations.includes("no_bos_choch_coupling"));
  });

  it("O — events reference HTF pools only (not protected)", () => {
    const htf = flatHours(80, 100);
    htfBslOn1h(htf, 30, 150, 50);
    const ltf = htf.map((x) => ({ ...x }));
    const E = 40;
    ltf[E + 1].high = 155;
    const ctx = crossTf({ ltf, htf, E_LTF: E });
    for (const ev of ctx.events) {
      assert.ok(ev.htfPoolId.startsWith("pool:"));
      assert.ok(!ev.htfPoolId.includes("protected"));
    }
    assert.ok(ctx.limitations.includes("protected_not_liquidity"));
  });

  it("B — developing HTF bar excluded via MSL-7A closed selection", () => {
    const ltf = hourSeries(0, 24);
    const htf = hourSeries(0, 24);
    htfBslOn1h(htf, 10, 150, 20);
    const E = 22;
    ltf[E + 1].high = 200;
    const ctxShort = crossTf({ ltf, htf: htf.slice(0, 23), E_LTF: E });
    const ctxLong = crossTf({ ltf, htf, E_LTF: E });
    assert.deepEqual(ctxShort.events, ctxLong.events);
  });

  it("N — derived vs hand-built 4H same OHLC → same event count", () => {
    const ltf = hourSeries(0, 32);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const hand: Candle[] = [];
    for (let b = 0; b < 8; b++) {
      const slice = ltf.slice(b * 4, b * 4 + 4);
      hand.push({
        time: slice[0].time,
        open: slice[0].open,
        high: Math.max(...slice.map((x) => x.high)),
        low: Math.min(...slice.map((x) => x.low)),
        close: slice[3].close,
        volume: slice.reduce((s, x) => s + x.volume, 0),
      });
    }
    assert.deepEqual(derived, hand);
    const E = 20;
    ltf[E + 1].high = 200;
    const ctxDerived = crossTf({
      ltf,
      htf: derived,
      E_LTF: E,
      ltfTf: "1H",
      htfTf: "4H",
    });
    const ctxHand = crossTf({
      ltf,
      htf: hand,
      E_LTF: E,
      ltfTf: "1H",
      htfTf: "4H",
    });
    assert.equal(ctxDerived.events.length, ctxHand.events.length);
  });

  it("T-FROZEN — BTC 1H → derive 4H → cross-TF deterministic, checksum unchanged", () => {
    const fixturePath = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const fileBefore = readFileSync(fixturePath, "utf8");
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: loaded.candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E = 500;
    const a = buildMarketStructureCrossTfLiquidityInteractionContext({
      ltfCandles: loaded.candles,
      htfCandles: derived,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      ltfEvaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const b = buildMarketStructureCrossTfLiquidityInteractionContext({
      ltfCandles: loaded.candles,
      htfCandles: derived,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      ltfEvaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(a, b);
    assert.ok(a.limitations.includes("cross_tf_liquidity_interaction_research_only"));
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles), BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    assert.equal(readFileSync(fixturePath, "utf8"), fileBefore);
  });

  it("rule ids and limitations present", () => {
    const ltf = hourSeries(0, 30);
    const ctx = crossTf({ ltf, htf: ltf, E_LTF: 10 });
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID);
    assert.equal(ctx.ruleIds.touch, MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID);
    assert.ok(ctx.limitations.includes("no_sweep"));
    assert.ok(ctx.limitations.includes("observation_window_e_plus_1_to_horizon"));
  });
});
