import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureLiquidityInteractionContext,
  buildMarketStructureSnapshotAtBar,
} from "../market-structure/market-structure-snapshot";
import {
  buildMarketStructureLiquidityAdvancedInteractionContext,
  MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
} from "../market-structure/market-structure-liquidity-advanced-interaction";
import { buildMarketStructureLiquidityStructureAssociationContext } from "../market-structure/market-structure-liquidity-structure-association";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import {
  MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
} from "../market-structure/market-structure-liquidity-types";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";
import type { LiquidityPoolCandidate, MarketStructureLiquidityContext } from "../market-structure/market-structure-liquidity-types";
import type { MarketStructureSnapshot } from "../market-structure/market-structure-types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const E = 20;
const H = 24;

function snapAt(candles: Candle[], evalBar: number): MarketStructureSnapshot {
  return buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: evalBar,
    swingConfig: SMALL_SWING,
  });
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

function bslPoolAt(candles: Candle[], evalBar: number, highPrice: number, pivotIndex = 10) {
  const candlesCopy = candles.map((c) => ({ ...c }));
  setSyntheticPivot(candlesCopy, pivotIndex, "HIGH", highPrice);
  const snap = snapAt(candlesCopy, evalBar);
  const pool = snap.liquidity.liquidityPools.find(
    (p) => p.poolKind === "SINGLE_HIGH" && p.sourcePivotIndices[0] === pivotIndex
  );
  assert.ok(pool);
  return { candles: candlesCopy, snap: withPoolsOnly(snap, [pool!]), pool: pool! };
}

function sslPoolAt(candles: Candle[], evalBar: number, lowPrice: number, pivotIndex = 10) {
  const candlesCopy = candles.map((c) => ({ ...c }));
  setSyntheticPivot(candlesCopy, pivotIndex, "LOW", lowPrice);
  const snap = snapAt(candlesCopy, evalBar);
  const pool = snap.liquidity.liquidityPools.find(
    (p) => p.poolKind === "SINGLE_LOW" && p.sourcePivotIndices[0] === pivotIndex
  );
  assert.ok(pool);
  return { candles: candlesCopy, snap: withPoolsOnly(snap, [pool!]), pool: pool! };
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
  price: number
): LiquidityPoolCandidate {
  return {
    ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
    poolId,
    poolKind,
    price,
    priceBand: { lowerBound: price, upperBound: price },
    sourcePivotIndices: [1],
    sourceConfirmationBarIndices: [3],
    knownAtBarIndex: 3,
    scope: "EXTERNAL",
    memberCount: 1,
    representativePriceRuleId: MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
    statusAtE: "CANDIDATE",
  };
}

function touchCtx(snap: MarketStructureSnapshot, candles: Candle[]) {
  return buildMarketStructureLiquidityInteractionContext({ snapshot: snap, candles, horizonBars: H });
}

function advCtx(snap: MarketStructureSnapshot, candles: Candle[]) {
  return buildMarketStructureLiquidityAdvancedInteractionContext({
    snapshot: snap,
    candles,
    horizonBars: H,
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

describe("market-structure-liquidity-advanced-interaction (MSL-7E)", () => {
  it("A–F TOUCH (MSL-6) vs SWEEP/TAKEN (MSL-7E)", () => {
    const base = flatCandles(50, 100);
    const { candles: bslC, snap: bslS, pool: bP } = bslPoolAt(base, E, 120);
    const bar = E + 1;
    bslC[bar].high = bP.price;
    bslC[bar].close = bP.price - 1;
    let t = touchCtx(bslS, bslC);
    let a = advCtx(bslS, bslC);
    assert.equal(t.events.length, 1);
    assert.equal(a.events.length, 0);

    bslC[bar].high = bP.price + 1;
    bslC[bar].close = bP.price;
    t = touchCtx(bslS, bslC);
    a = advCtx(bslS, bslC);
    assert.equal(t.events.length, 1);
    assert.ok(a.events.some((e) => e.eventType === "LIQUIDITY_SWEEP"));
    assert.ok(!a.events.some((e) => e.eventType === "LIQUIDITY_TAKEN"));

    bslC[bar].close = bP.price + 1;
    t = touchCtx(bslS, bslC);
    a = advCtx(bslS, bslC);
    assert.equal(t.events.length, 1);
    assert.ok(a.events.some((e) => e.eventType === "LIQUIDITY_TAKEN"));
    assert.ok(!a.events.some((e) => e.eventType === "LIQUIDITY_SWEEP"));

    const { candles: sslC, snap: sslS, pool: sP } = sslPoolAt(base, E, 80);
    sslC[bar].low = sP.price;
    sslC[bar].close = sP.price + 1;
    assert.equal(touchCtx(sslS, sslC).events.length, 1);
    assert.equal(advCtx(sslS, sslC).events.length, 0);

    sslC[bar].low = sP.price - 1;
    sslC[bar].close = sP.price;
    a = advCtx(sslS, sslC);
    assert.ok(a.events.some((e) => e.eventType === "LIQUIDITY_SWEEP"));

    sslC[bar].close = sP.price - 1;
    a = advCtx(sslS, sslC);
    assert.ok(a.events.some((e) => e.eventType === "LIQUIDITY_TAKEN"));
  });

  it("G reclaim with precedingSweepEventId", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 2;
    candles[E + 1].close = pool.price;
    candles[E + 2].close = pool.price;
    candles[E + 2].high = pool.price - 1;
    const a = advCtx(snap, candles);
    const reclaim = a.events.find((e) => e.eventType === "LIQUIDITY_RECLAIM");
    assert.ok(reclaim);
    assert.equal(reclaim!.triggerBarIndex, E + 2);
    if (reclaim!.eventType === "LIQUIDITY_RECLAIM") {
      assert.ok(reclaim.precedingSweepEventId.includes("LIQUIDITY_SWEEP"));
      assert.equal(reclaim.precedingSweepTriggerBarIndex, E + 1);
    }
  });

  it("H taken breaks reclaim chain", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 2;
    candles[E + 1].close = pool.price;
    candles[E + 2].high = pool.price + 3;
    candles[E + 2].close = pool.price + 1;
    candles[E + 3].close = pool.price;
    const a = advCtx(snap, candles);
    assert.ok(!a.events.some((e) => e.eventType === "LIQUIDITY_RECLAIM"));
  });

  it("I two sweep→reclaim cycles", () => {
    const base = flatCandles(55, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    candles[E + 2].close = pool.price;
    candles[E + 4].high = pool.price + 1;
    candles[E + 4].close = pool.price;
    candles[E + 5].close = pool.price;
    const a = advCtx(snap, candles);
    const reclaims = a.events.filter((e) => e.eventType === "LIQUIDITY_RECLAIM");
    assert.equal(reclaims.length, 2);
  });

  it("J E bar excluded", () => {
    const base = flatCandles(40, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E].high = pool.price + 5;
    candles[E].close = pool.price;
    const a = advCtx(snap, candles);
    assert.ok(!a.events.some((e) => e.triggerBarIndex === E));
  });

  it("K frozen foundation unchanged when later snapshot differs", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    const snapLater = snapAt(candles, E + 10);
    assert.notEqual(snapLater.liquidity.liquidityPools.length, 0);
    const a = advCtx(snap, candles);
    assert.ok(a.events.some((e) => e.poolId === pool.poolId));
    assert.equal(snap.liquidity.liquidityPools[0].statusAtE, "CANDIDATE");
  });

  it("L–M prefix invariance and future spike", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    const prefixLen = E + H + 2;
    const prefix = candles.slice(0, prefixLen);
    const a = advCtx(snap, prefix);
    const extended = [
      ...prefix,
      { time: 999, open: 100, high: 200, low: 50, close: 100, volume: 1 },
    ];
    const b = advCtx(snap, extended);
    assert.deepEqual(a, b);
  });

  it("N–O immutability and determinism", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    deepFreeze(candles);
    const runs = Array.from({ length: 5 }, () => advCtx(snap, candles));
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
    }
  });

  it("P–Q multiple pools same bar", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool: bsl } = bslPoolAt(base, E, 130, 10);
    setSyntheticPivot(candles, 12, "LOW", 70);
    const ssl = snapAt(candles, E).liquidity.liquidityPools.find(
      (p) => p.poolKind === "SINGLE_LOW" && p.sourcePivotIndices[0] === 12
    );
    assert.ok(ssl);
    const frozen = withPoolsOnly(snap, [bsl, ssl!]);
    const bar = E + 1;
    candles[bar].high = bsl.price + 1;
    candles[bar].low = ssl!.price - 1;
    candles[bar].close = bsl.price;
    const a = advCtx(frozen, candles);
    assert.ok(a.events.filter((e) => e.eventType === "LIQUIDITY_SWEEP").length >= 2);
  });

  it("R invalid pool price", () => {
    const base = flatCandles(40, 100);
    const snap = snapAt(base, E);
    const bad = syntheticPool("bad:pool", "SINGLE_HIGH", Number.NaN);
    const frozen = withPoolsOnly(snap, [bad]);
    const a = advCtx(frozen, base);
    assert.equal(a.events.length, 0);
    assert.ok(a.unresolved.some((u) => u.code === "INVALID_LIQUIDITY_PRICE"));
  });

  it("S invalid horizon", () => {
    const base = flatCandles(40, 100);
    const snap = snapAt(base, E);
    const a = buildMarketStructureLiquidityAdvancedInteractionContext({
      snapshot: snap,
      candles: base,
      horizonBars: 0,
    });
    assert.equal(a.events.length, 0);
    assert.ok(a.unresolved.some((u) => u.code === "INVALID_HORIZON_BARS"));
  });

  it("T no future bars", () => {
    const base = flatCandles(E + 1, 100);
    const snap = snapAt(base, E);
    const a = advCtx(snap, base);
    assert.ok(a.unresolved.some((u) => u.code === "NO_FUTURE_DATA"));
  });

  it("U taken is not consumed lifecycle phase", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price + 1;
    const a = advCtx(snap, candles);
    const life = a.lifecycle.find((l) => l.poolId === pool.poolId);
    assert.equal(life?.phase, "TAKEN");
    assert.ok(a.limitations.includes("taken_is_not_consumed"));
    assert.ok(!a.events.some((e) => e.eventType === "LIQUIDITY_CONSUMED" as never));
  });

  it("V–X MSL-5/6/7D unchanged", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    const msl6Before = touchCtx(snap, candles);
    advCtx(snap, candles);
    const msl6After = touchCtx(snap, candles);
    assert.deepEqual(msl6Before, msl6After);
    assert.equal(snap.liquidity.liquidityPools[0].statusAtE, "CANDIDATE");

    const bull = flatCandles(60, 115);
    for (const row of bull) {
      row.low = 114;
      row.high = 116;
      row.close = 115;
    }
    setSyntheticPivot(bull, 10, "LOW", 100);
    setSyntheticPivot(bull, 18, "HIGH", 120);
    setSyntheticPivot(bull, 26, "LOW", 110);
    setSyntheticPivot(bull, 34, "HIGH", 130);
    const E2 = 40;
    bull[E2 + 1].high = 135;
    bull[E2 + 1].close = 128;
    const d1 = buildMarketStructureLiquidityStructureAssociationContext({
      candles: bull,
      evaluationBarIndex: E2,
      swingConfig: SMALL_SWING,
    });
    advCtx(snapAt(bull, E2), bull);
    const d2 = buildMarketStructureLiquidityStructureAssociationContext({
      candles: bull,
      evaluationBarIndex: E2,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(d1, d2);
  });

  it("Y BTC frozen checksum", () => {
    const fixturePath = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const before = readFileSync(fixturePath, "utf8");
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const snap = snapAt(loaded.candles, 500);
    const a = advCtx(snap, loaded.candles);
    const b = advCtx(snap, loaded.candles);
    assert.deepEqual(a, b);
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    assert.equal(readFileSync(fixturePath, "utf8"), before);
  });

  it("AA event IDs and rule IDs", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    const bar = E + 1;
    candles[bar].high = pool.price + 1;
    candles[bar].close = pool.price;
    const a = advCtx(snap, candles);
    const sweep = a.events.find((e) => e.eventType === "LIQUIDITY_SWEEP");
    assert.equal(sweep?.eventId, `li:${pool.poolId}:LIQUIDITY_SWEEP:${bar}`);
    assert.equal(sweep?.ruleId, MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID);
    candles[E + 2].close = pool.price;
    const a2 = advCtx(snap, candles);
    const taken = a2.events.find((e) => e.eventType === "LIQUIDITY_TAKEN");
    if (taken) {
      assert.equal(taken.ruleId, MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID);
    }
  });

  it("AC co-emission with MSL-6 touch", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 1;
    candles[E + 1].close = pool.price;
    assert.equal(touchCtx(snap, candles).events.length, 1);
    assert.ok(advCtx(snap, candles).events.some((e) => e.eventType === "LIQUIDITY_SWEEP"));
  });

  it("AD reclaim close-only wick need not cross P", () => {
    const base = flatCandles(50, 100);
    const { candles, snap, pool } = bslPoolAt(base, E, 120);
    candles[E + 1].high = pool.price + 2;
    candles[E + 1].close = pool.price;
    candles[E + 2].high = pool.price - 5;
    candles[E + 2].close = pool.price;
    const a = advCtx(snap, candles);
    assert.ok(a.events.some((e) => e.eventType === "LIQUIDITY_RECLAIM" && e.triggerBarIndex === E + 2));
  });

  it("limitations and research-only", () => {
    const base = flatCandles(40, 100);
    const snap = snapAt(base, E);
    const a = advCtx(snap, base);
    assert.ok(a.limitations.includes("liquidity_advanced_interaction_research_only"));
    assert.ok(a.limitations.includes("msl7d_association_unchanged"));
  });
});
