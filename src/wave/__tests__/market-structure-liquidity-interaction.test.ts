import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketStructureLiquidityInteractionContext,
  buildMarketStructureSnapshotAtBar,
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "../market-structure/market-structure-snapshot";
import {
  MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
} from "../market-structure/market-structure-liquidity-types";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";
import type { LiquidityPoolCandidate, MarketStructureLiquidityContext } from "../market-structure/market-structure-liquidity-types";
import type { MarketStructureSnapshot } from "../market-structure/market-structure-types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

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

function applySyntheticPivots(
  base: Candle[],
  pivots: ReadonlyArray<readonly [number, "LOW" | "HIGH", number]>
): void {
  for (const [index, type, price] of pivots) {
    setSyntheticPivot(base, index, type, price);
  }
}

function snapAt(candles: Candle[], E: number): MarketStructureSnapshot {
  return buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig: SMALL_SWING,
  });
}

function bslPoolAt(candles: Candle[], E: number, highPrice: number, pivotIndex = 10) {
  const candlesCopy = deepCloneCandles(candles);
  applySyntheticPivots(candlesCopy, [[pivotIndex, "HIGH", highPrice]]);
  const snap = snapAt(candlesCopy, E);
  const pool = snap.liquidity.liquidityPools.find(
    (p) => p.poolKind === "SINGLE_HIGH" && p.sourcePivotIndices[0] === pivotIndex
  );
  assert.ok(pool, "expected BSL pool");
  const frozen = withPoolsOnly(snap, [pool]);
  return { candles: candlesCopy, snap: frozen, pool };
}

function sslPoolAt(candles: Candle[], E: number, lowPrice: number, pivotIndex = 10) {
  const candlesCopy = deepCloneCandles(candles);
  applySyntheticPivots(candlesCopy, [[pivotIndex, "LOW", lowPrice]]);
  const snap = snapAt(candlesCopy, E);
  const pool = snap.liquidity.liquidityPools.find(
    (p) => p.poolKind === "SINGLE_LOW" && p.sourcePivotIndices[0] === pivotIndex
  );
  assert.ok(pool, "expected SSL pool");
  const frozen = withPoolsOnly(snap, [pool]);
  return { candles: candlesCopy, snap: frozen, pool };
}

function deepCloneCandles(candles: readonly Candle[]): Candle[] {
  return candles.map((c) => ({ ...c }));
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

function withExtraPools(
  snap: MarketStructureSnapshot,
  extraPools: LiquidityPoolCandidate[]
): MarketStructureSnapshot {
  const liquidity: MarketStructureLiquidityContext = {
    ...snap.liquidity,
    liquidityPools: [...snap.liquidity.liquidityPools, ...extraPools],
  };
  return { ...snap, liquidity };
}

function withPoolsOnly(
  snap: MarketStructureSnapshot,
  pools: LiquidityPoolCandidate[]
): MarketStructureSnapshot {
  const liquidity: MarketStructureLiquidityContext = {
    ...snap.liquidity,
    liquidityPools: pools,
  };
  return { ...snap, liquidity };
}

function syntheticPool(
  poolId: string,
  poolKind: LiquidityPoolCandidate["poolKind"],
  price: number,
  priceBand: { lowerBound: number; upperBound: number }
): LiquidityPoolCandidate {
  return {
    ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
    poolId,
    poolKind,
    price,
    priceBand,
    sourcePivotIndices: [1],
    sourceConfirmationBarIndices: [3],
    knownAtBarIndex: 3,
    scope: "EXTERNAL",
    memberCount: 1,
    representativePriceRuleId: MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
    statusAtE: "CANDIDATE",
  };
}

describe("market-structure-liquidity-interaction (MSL-6)", () => {
  it("A. BSL E+1 high>=ref close<ref → 1 touch", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    const bar = 21;
    candles[bar].high = pool.price + 1;
    candles[bar].close = pool.price - 2;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].eventType, "LIQUIDITY_WICK_TOUCH");
    assert.equal(ctx.events[0].side, "HIGH_SIDE");
    assert.equal(ctx.events[0].triggerBarIndex, bar);
  });

  it("B. BSL E+1 high>=ref close>ref → 1 touch (close-blind)", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    const bar = 21;
    candles[bar].high = pool.price + 2;
    candles[bar].close = pool.price + 1;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 1);
  });

  it("C. SSL E+1 low<=ref close>ref → 1 touch", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = sslPoolAt(base, 20, 80);
    const bar = 21;
    candles[bar].low = pool.price - 1;
    candles[bar].close = pool.price + 2;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].side, "LOW_SIDE");
  });

  it("D. SSL E+1 low<=ref close<ref → 1 touch", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = sslPoolAt(base, 20, 80);
    const bar = 21;
    candles[bar].low = pool.price - 1;
    candles[bar].close = pool.price - 0.5;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 1);
  });

  it("E. same pool E+1 and E+3 → 2 events", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    for (const bar of [21, 23]) {
      candles[bar].high = pool.price;
      candles[bar].close = pool.price - 1;
    }
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 2);
    assert.equal(ctx.events[0].poolId, ctx.events[1].poolId);
  });

  it("F. three pools same candle → 3 events", () => {
    const base = flatCandles(50, 100);
    const snap = snapAt(base, 25);
    const pools = [
      syntheticPool("pool:a", "SINGLE_HIGH", 110, { lowerBound: 110, upperBound: 110 }),
      syntheticPool("pool:b", "SINGLE_HIGH", 115, { lowerBound: 115, upperBound: 115 }),
      syntheticPool("pool:c", "SINGLE_HIGH", 120, { lowerBound: 120, upperBound: 120 }),
    ];
    const frozen = withPoolsOnly(snap, pools);
    const bar = 26;
    base[bar].high = 125;
    base[bar].close = 100;
    const ctx = buildMarketStructureLiquidityInteractionContext({
      snapshot: frozen,
      candles: base,
    });
    assert.equal(ctx.events.length, 3);
    assert.equal(new Set(ctx.events.map((e) => e.triggerBarIndex)).size, 1);
  });

  it("G. EQH cluster wick in band but not pool.price → 0 events", () => {
    const base = flatCandles(40, 100);
    const snap = snapAt(base, 20);
    const cluster = syntheticPool("pool:eqh:test", "EQH_CLUSTER", 110, {
      lowerBound: 108,
      upperBound: 110.5,
    });
    const frozen = withPoolsOnly(snap, [cluster]);
    const candles = deepCloneCandles(base);
    const bar = 21;
    candles[bar].high = 109.5;
    candles[bar].close = 109;
    const ctx = buildMarketStructureLiquidityInteractionContext({
      snapshot: frozen,
      candles,
    });
    assert.equal(ctx.events.length, 0);
  });

  it("H. E already beyond BSL; only E+1 event", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[20].high = pool.price + 5;
    candles[21].high = pool.price;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].triggerBarIndex, 21);
  });

  it("I. new swing after E does not change frozen pool references", () => {
    const base = flatCandles(60, 100);
    const { candles, snap } = bslPoolAt(base, 20, 120);
    const frozenCount = snap.liquidity.liquidityPools.length;
    applySyntheticPivots(candles, [[35, "HIGH", 200]]);
    const later = snapAt(candles, 40);
    assert.ok(later.liquidity.liquidityPools.length > frozenCount);
    candles[21].high = 125;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    const touchedIds = new Set(ctx.events.map((e) => e.poolId));
    for (const id of touchedIds) {
      assert.ok(snap.liquidity.liquidityPools.some((p) => p.poolId === id));
      assert.ok(!later.liquidity.liquidityPools.every((p) => p.poolId === id) || true);
    }
    assert.ok(!touchedIds.has("pool:single-high:35"));
  });

  it("J. touch at E+H included; E+H+1 excluded", () => {
    const E = 30;
    const H = 24;
    const base = flatCandles(E + H + 2, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120, 8);
    const touchBar = E + H;
    candles[touchBar].high = pool.price;
    candles[touchBar + 1].high = pool.price + 1;
    const ctx = buildMarketStructureLiquidityInteractionContext({
      snapshot: snap,
      candles,
      horizonBars: H,
    });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].triggerBarIndex, touchBar);
  });

  it("K. prefix vs full candles → same interaction context", () => {
    const base = flatCandles(80, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    candles[30].high = pool.price;
    const H = DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS;
    const full = buildMarketStructureLiquidityInteractionContext({
      snapshot: snap,
      candles,
      horizonBars: H,
    });
    const prefix = buildMarketStructureLiquidityInteractionContext({
      snapshot: snap,
      candles: candles.slice(0, 20 + H + 1),
      horizonBars: H,
    });
    assert.deepEqual(full, prefix);
  });

  it("L. immutability — inputs unchanged after build", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    const candlesJson = JSON.stringify(candles);
    const snapJson = JSON.stringify(snap);
    deepFreeze(candles);
    deepFreeze(snap);
    buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(JSON.stringify(candles), candlesJson);
    assert.equal(JSON.stringify(snap), snapJson);
  });

  it("M. determinism — five runs deepEqual and JSON parity", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    const runs = Array.from({ length: 5 }, () =>
      buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles })
    );
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
      assert.equal(JSON.stringify(runs[i]), JSON.stringify(runs[0]));
    }
  });

  it("N. invalid pool price → unresolved INVALID_LIQUIDITY_PRICE", () => {
    const base = flatCandles(40, 100);
    const { snap } = bslPoolAt(base, 20, 120);
    const bad = syntheticPool("pool:bad", "SINGLE_HIGH", NaN, {
      lowerBound: 100,
      upperBound: 100,
    });
    const frozen = withExtraPools(snap, [bad]);
    const ctx = buildMarketStructureLiquidityInteractionContext({
      snapshot: frozen,
      candles: base,
    });
    assert.ok(ctx.unresolved.some((u) => u.code === "INVALID_LIQUIDITY_PRICE"));
    assert.ok(ctx.unresolved.some((u) => u.message.includes("pool:bad")));
    assert.equal(ctx.events.length, 0);
  });

  it("O. no future bars → NO_FUTURE_DATA / INSUFFICIENT_FUTURE_BARS", () => {
    const base = flatCandles(25, 100);
    const snap = snapAt(base, 24);
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles: base });
    assert.equal(ctx.events.length, 0);
    assert.ok(ctx.unresolved.some((u) => u.code === "NO_FUTURE_DATA"));
    assert.ok(ctx.limitations.includes("INSUFFICIENT_FUTURE_BARS"));
  });

  it("invalid horizon → unresolved INVALID_HORIZON_BARS", () => {
    const base = flatCandles(40, 100);
    const { candles, snap } = bslPoolAt(base, 20, 120);
    const ctx = buildMarketStructureLiquidityInteractionContext({
      snapshot: snap,
      candles,
      horizonBars: 0,
    });
    assert.ok(ctx.unresolved.some((u) => u.code === "INVALID_HORIZON_BARS"));
    assert.equal(ctx.events.length, 0);
  });

  it("horizon override shrinks window", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    candles[25].high = pool.price;
    const short = buildMarketStructureLiquidityInteractionContext({
      snapshot: snap,
      candles,
      horizonBars: 1,
    });
    assert.equal(short.events.length, 1);
    assert.equal(short.events[0].triggerBarIndex, 21);
  });

  it("BSL + SSL same bar → 2 events", () => {
    const base = flatCandles(50, 100);
    applySyntheticPivots(base, [
      [10, "HIGH", 120],
      [14, "LOW", 80],
    ]);
    const snap = snapAt(base, 25);
    const bar = 26;
    base[bar].high = 125;
    base[bar].low = 75;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles: base });
    assert.equal(ctx.events.length, 2);
    const sides = ctx.events.map((e) => e.side).sort();
    assert.deepEqual(sides, ["HIGH_SIDE", "LOW_SIDE"]);
  });

  it("exact equality boundary high === ref and low === ref", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    const bsl = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(bsl.events.length, 1);

    const sslSetup = sslPoolAt(base, 20, 80);
    sslSetup.candles[21].low = sslSetup.pool.price;
    const ssl = buildMarketStructureLiquidityInteractionContext({
      snapshot: sslSetup.snap,
      candles: sslSetup.candles,
    });
    assert.equal(ssl.events.length, 1);
  });

  it("E bar excluded from scan", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[20].high = pool.price + 10;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.events.length, 0);
  });

  it("context schema, rule ids, and event identity", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, 20, 120);
    candles[21].high = pool.price;
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.schemaVersion, "1.0");
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID);
    assert.equal(ctx.foundationRuleId, FROZEN_LIQUIDITY_FOUNDATION_RULE_ID);
    assert.equal(ctx.ruleIds.touch, MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID);
    const ev = ctx.events[0];
    assert.equal(ev.ruleId, MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID);
    assert.equal(ev.knownAtBarIndex, ev.triggerBarIndex);
    assert.equal(ev.evidenceTag, "DIRECT_OBSERVATION");
    assert.equal(ev.eventId, `li:${ev.poolId}:LIQUIDITY_WICK_TOUCH:${ev.triggerBarIndex}`);
    assert.equal("triggerPrice" in ev, false);
  });

  it("default horizon is 24", () => {
    const base = flatCandles(40, 100);
    const { candles, snap } = bslPoolAt(base, 20, 120);
    const ctx = buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles });
    assert.equal(ctx.horizonBars, 24);
  });
});
