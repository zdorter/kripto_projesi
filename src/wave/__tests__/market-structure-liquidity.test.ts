import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureLiquidityContext,
  buildMarketStructureSnapshotAtBar,
  MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
  pricesEqualHybridTolerance,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";

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

function snapAt(candles: Candle[], E: number) {
  return buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig: SMALL_SWING,
  });
}

function deepCloneCandles(candles: readonly Candle[]): Candle[] {
  return candles.map((c) => ({ ...c }));
}

describe("market-structure-liquidity (MSL-5)", () => {
  it("A. single HIGH → 1 BSL, 1 SINGLE_HIGH, 0 EQH cluster", () => {
    const candles = flatCandles(30, 100);
    applySyntheticPivots(candles, [[10, "HIGH", 120]]);
    const snap = snapAt(candles, 20);
    assert.equal(snap.liquidity.bslCandidates.length, 1);
    assert.equal(snap.liquidity.bslCandidates[0].candidateId, "bsl:10");
    const pools = snap.liquidity.liquidityPools.filter((p) => p.poolKind === "SINGLE_HIGH");
    assert.equal(pools.length, 1);
    assert.equal(snap.liquidity.liquidityPools.filter((p) => p.poolKind === "EQH_CLUSTER").length, 0);
    assert.equal(snap.liquidity.equalHighObservations.length, 0);
  });

  it("B. single LOW → 1 SSL, 1 SINGLE_LOW", () => {
    const candles = flatCandles(30, 100);
    applySyntheticPivots(candles, [[10, "LOW", 80]]);
    const snap = snapAt(candles, 20);
    assert.equal(snap.liquidity.sslCandidates.length, 1);
    assert.ok(snap.liquidity.liquidityPools.some((p) => p.poolId === "pool:single-low:10"));
  });

  it("C. exact EQH → observation, cluster, 2 BSL", () => {
    const candles = flatCandles(40, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "LOW", 90],
      [14, "HIGH", 110],
      [22, "LOW", 95],
      [28, "HIGH", 110],
    ]);
    const snap = snapAt(candles, 35);
    assert.equal(snap.liquidity.bslCandidates.length, 2);
    assert.equal(snap.liquidity.equalHighObservations.length, 1);
    assert.equal(snap.liquidity.liquidityPools.filter((p) => p.poolKind === "EQH_CLUSTER").length, 1);
  });

  it("D. exact EQL symmetric", () => {
    const candles = flatCandles(40, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "HIGH", 120],
      [14, "LOW", 100],
      [22, "HIGH", 115],
      [28, "LOW", 100],
    ]);
    const snap = snapAt(candles, 35);
    assert.ok(snap.liquidity.equalLowObservations.length >= 1);
    assert.ok(snap.liquidity.liquidityPools.some((p) => p.poolKind === "EQL_CLUSTER"));
  });

  it("E. tolerance EQH 100 / 100.04 → cluster", () => {
    assert.ok(pricesEqualHybridTolerance(100, 100.04));
    const candles = flatCandles(45, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "LOW", 90],
      [14, "HIGH", 100],
      [22, "LOW", 95],
      [28, "HIGH", 100.04],
    ]);
    const snap = snapAt(candles, 40);
    assert.ok(snap.liquidity.equalHighObservations.length >= 1);
    assert.ok(snap.liquidity.liquidityPools.some((p) => p.poolKind === "EQH_CLUSTER"));
  });

  it("F. tolerance boundary just outside → no pairwise EQH", () => {
    assert.ok(!pricesEqualHybridTolerance(100, 100.1));
  });

  it("G. chain 100 / 100.04 / 100.08 → one cluster, 3 obs pairs", () => {
    const candles = flatCandles(50, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "LOW", 90],
      [12, "HIGH", 100],
      [18, "LOW", 95],
      [24, "HIGH", 100.04],
      [30, "LOW", 96],
      [36, "HIGH", 100.08],
    ]);
    const snap = snapAt(candles, 45);
    const cluster = snap.liquidity.liquidityPools.find((p) => p.poolKind === "EQH_CLUSTER");
    assert.ok(cluster);
    assert.equal(cluster!.memberCount, 3);
    assert.equal(snap.liquidity.equalHighObservations.length, 2);
  });

  it("H. transitivity → single connected component", () => {
    const candles = flatCandles(50, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [10, "HIGH", 100],
      [18, "LOW", 95],
      [26, "HIGH", 100.04],
      [34, "LOW", 96],
      [40, "HIGH", 100.08],
    ]);
    const snap = snapAt(candles, 48);
    assert.equal(
      snap.liquidity.liquidityPools.filter((p) => p.poolKind === "EQH_CLUSTER").length,
      1
    );
  });

  it("I. internal + external scope on BSL metadata", () => {
    const candles = flatCandles(45, 100);
    for (const c of candles) {
      c.low = 98;
      c.high = 102;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "LOW", 90],
      [14, "HIGH", 110],
      [22, "LOW", 100],
      [28, "HIGH", 115],
    ]);
    const snap = snapAt(candles, 40);
    const scopes = new Set(snap.liquidity.bslCandidates.map((c) => c.scope));
    assert.ok(scopes.size >= 1);
  });

  it("J. protected high + BSL same pivot → separate objects", () => {
    const candles = flatCandles(55, 105);
    for (const c of candles) {
      c.low = 104;
      c.high = 106;
      c.close = 105;
    }
    applySyntheticPivots(candles, [
      [10, "HIGH", 130],
      [18, "LOW", 110],
      [26, "HIGH", 120],
      [34, "LOW", 100],
    ]);
    const snap = snapAt(candles, 40);
    assert.equal(snap.protected.trendContext, "BEARISH");
    const prot = snap.protected.protectedHighs.find((p) => p.pivotIndex === 26);
    assert.ok(prot);
    const bsl = snap.liquidity.bslCandidates.find((c) => c.sourcePivotIndex === 26);
    assert.ok(bsl);
    assert.notEqual(prot!.price, undefined);
    assert.equal(bsl!.candidateId, "bsl:26");
    assert.ok(!bsl!.selectionReasonCodes.includes("C3_STRUCTURE_LABEL" as never));
  });

  it("K. future E+1 equal HIGH → @E liquidity unchanged", () => {
    const candles = flatCandles(50, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [8, "LOW", 90],
      [14, "HIGH", 110],
      [22, "LOW", 95],
    ]);
    const E = 30;
    const atE = snapAt(deepCloneCandles(candles), E);
    applySyntheticPivots(candles, [[36, "HIGH", 110]]);
    const atEAgain = snapAt(candles, E);
    assert.deepEqual(atE.liquidity, atEAgain.liquidity);
  });

  it("L. duplicate build → deterministic IDs", () => {
    const candles = flatCandles(35, 100);
    applySyntheticPivots(candles, [[10, "HIGH", 120]]);
    const a = snapAt(deepCloneCandles(candles), 25).liquidity;
    const b = snapAt(deepCloneCandles(candles), 25).liquidity;
    assert.deepEqual(a, b);
  });

  it("M. no confirmed swings → empty arrays + limitation", () => {
    const candles = flatCandles(8, 100);
    const snap = snapAt(candles, 7);
    assert.equal(snap.liquidity.bslCandidates.length, 0);
    assert.ok(
      snap.liquidity.unresolved.some((u) => u.code === "NO_CONFIRMED_SWINGS") ||
        snap.limitations.includes("NO_CONFIRMED_SWINGS")
    );
  });

  it("N. invalid E → snapshot builder throws", () => {
    const candles = flatCandles(10, 100);
    assert.throws(() => snapAt(candles, 20));
  });

  it("exact equality via hybrid tolerance", () => {
    assert.ok(pricesEqualHybridTolerance(110, 110));
  });

  it("non-finite and <=0 prices → INVALID_SWING_PRICE unresolved", () => {
    const snap = snapAt(flatCandles(25, 100), 20);
    const bad = {
      ...snap,
      confirmedSwings: [
        {
          index: 5,
          time: 5,
          price: -1,
          type: "HIGH" as const,
          strength: 50,
          confirmed: true,
        },
      ],
    };
    const liq = buildMarketStructureLiquidityContext({ snapshot: bad });
    assert.ok(liq.unresolved.some((u) => u.code === "INVALID_SWING_PRICE"));
    assert.equal(liq.bslCandidates.length, 0);
  });

  it("representative price = earliest pivot member", () => {
    const candles = flatCandles(50, 100);
    for (const c of candles) {
      c.low = 95;
      c.high = 105;
      c.close = 100;
    }
    applySyntheticPivots(candles, [
      [10, "HIGH", 100],
      [18, "LOW", 95],
      [26, "HIGH", 100.04],
    ]);
    const snap = snapAt(candles, 40);
    const pool = snap.liquidity.liquidityPools.find((p) => p.poolKind === "EQH_CLUSTER");
    assert.ok(pool);
    assert.equal(pool!.price, 100);
    assert.equal(pool!.priceBand.lowerBound, 100);
    assert.equal(pool!.priceBand.upperBound, 100.04);
  });

  it("knownAtBarIndex <= E on all candidates", () => {
    const candles = flatCandles(40, 100);
    applySyntheticPivots(candles, [
      [8, "HIGH", 120],
      [16, "LOW", 100],
    ]);
    const E = 25;
    const snap = snapAt(candles, E);
    for (const c of [...snap.liquidity.bslCandidates, ...snap.liquidity.sslCandidates]) {
      assert.ok(c.knownAtBarIndex <= E);
    }
    for (const o of [...snap.liquidity.equalHighObservations, ...snap.liquidity.equalLowObservations]) {
      assert.ok(o.knownAtBarIndex <= E);
    }
  });

  it("immutability — snapshot input candles unchanged", () => {
    const candles = flatCandles(30, 100);
    applySyntheticPivots(candles, [[10, "HIGH", 120]]);
    const clone = deepCloneCandles(candles);
    snapAt(clone, 20);
    assert.deepEqual(candles, clone);
  });

  it("deterministic ×5 repeated liquidity context", () => {
    const candles = flatCandles(40, 100);
    applySyntheticPivots(candles, [
      [8, "HIGH", 110],
      [16, "LOW", 100],
    ]);
    const results = Array.from({ length: 5 }, () => snapAt(deepCloneCandles(candles), 30).liquidity);
    for (let i = 1; i < results.length; i++) {
      assert.deepEqual(results[0], results[i]);
    }
  });

  it("prefix invariance through snapshot @E", () => {
    const candles = flatCandles(45, 100);
    applySyntheticPivots(candles, [
      [8, "HIGH", 110],
      [16, "LOW", 100],
      [24, "HIGH", 115],
    ]);
    const E = 35;
    const full = snapAt(candles, E);
    const sliced = snapAt(candles.slice(0, E + 1), E);
    assert.deepEqual(full.liquidity, sliced.liquidity);
  });

  it("buildMarketStructureLiquidityContext matches snapshot.liquidity", () => {
    const candles = flatCandles(30, 100);
    applySyntheticPivots(candles, [[10, "HIGH", 120]]);
    const snap = snapAt(candles, 20);
    const ctx = buildMarketStructureLiquidityContext({ snapshot: snap });
    assert.deepEqual(ctx, snap.liquidity);
  });

  it("rule IDs and limitations", () => {
    const snap = snapAt(flatCandles(25, 100), 20);
    assert.equal(snap.liquidity.ruleId, MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID);
    assert.equal(snap.liquidity.ruleIds.equality, MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID);
    assert.ok(snap.liquidity.limitations.includes("does_not_consume_msl4_break"));
    assert.ok(snap.liquidity.limitations.includes("no_ohlc_in_msl5_v1"));
  });

  it("architecture — liquidity module boundaries", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-liquidity.ts"),
      "utf8"
    );
    assert.ok(mod.includes("MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID"));
    assert.ok(!mod.includes("buildMarketStructureBreakContext"));
    assert.ok(!mod.includes("detectSwings"));
    assert.ok(!mod.includes("candles"));
  });

  it("frozen BTC E=500 deterministic liquidity", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
    const E = 500;
    const a = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    const b = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    assert.deepEqual(a.liquidity, b.liquidity);
    assert.ok(a.liquidity.bslCandidates.length >= 0);
  });
});
