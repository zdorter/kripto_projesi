import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureMtfLiquidityAlignmentContext,
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
  resolveLiquiditySideProfile,
  resolveMtfLiquidityLifecycleAlignment,
  resolveMtfLiquiditySideAlignment,
  buildLiquidityLegFoundation,
} from "../market-structure/market-structure-mtf-liquidity-alignment";
import { buildMarketStructureMtfAlignmentContext } from "../market-structure/market-structure-mtf-alignment";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";
import type { LiquidityPoolCandidate } from "../market-structure/market-structure-liquidity-types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H));
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

function flattenLiquidityBand(candles: Candle[]): void {
  for (const bar of candles) {
    bar.open = 100;
    bar.high = 105;
    bar.low = 95;
    bar.close = 100;
  }
}

function with1hTimes(candles: Candle[]): Candle[] {
  for (let i = 0; i < candles.length; i++) {
    candles[i].time = i * ONE_H;
  }
  return candles;
}

function liquidityPivotSeries(
  pivots: ReadonlyArray<readonly [number, "LOW" | "HIGH", number]>
): Candle[] {
  const base = flatCandles(35, 100);
  flattenLiquidityBand(base);
  with1hTimes(base);
  for (const [index, type, price] of pivots) {
    setSyntheticPivot(base, index, type, price);
  }
  return base;
}

function highSideSeries(): Candle[] {
  return liquidityPivotSeries([[10, "HIGH", 120]]);
}

function lowSideSeries(): Candle[] {
  return liquidityPivotSeries([[10, "LOW", 80]]);
}

function bothSidesSeries(): Candle[] {
  return liquidityPivotSeries([
    [10, "HIGH", 120],
    [18, "LOW", 80],
  ]);
}

function alignLiq(
  ltf: Candle[],
  htf: Candle[],
  E: number,
  ltfTf = "1H",
  htfTf = "1H",
  track?: "DERIVED_1H_4H" | "NATIVE_HTF"
) {
  return buildMarketStructureMtfLiquidityAlignmentContext({
    ltfCandles: ltf,
    htfCandles: htf,
    ltfEvaluationBarIndex: E,
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    swingConfig: SMALL_SWING,
    htfSourceTrack: track,
  });
}

function mockPool(kind: LiquidityPoolCandidate["poolKind"], id: string): LiquidityPoolCandidate {
  return {
    ruleId: "MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_V1",
    poolId: id,
    poolKind: kind,
    price: 100,
    priceBand: { lowerBound: 99, upperBound: 101 },
    sourcePivotIndices: [10],
    sourceConfirmationBarIndices: [12],
    knownAtBarIndex: 12,
    scope: "EXTERNAL",
    memberCount: 1,
    representativePriceRuleId: "MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_V1",
    statusAtE: "CANDIDATE",
  };
}

describe("market-structure-mtf-liquidity-alignment (MSL-9B)", () => {
  it("side alignment taxonomy (pure)", () => {
    assert.equal(
      resolveMtfLiquiditySideAlignment("HIGH_SIDE_ONLY", "HIGH_SIDE_ONLY"),
      "MATCHING"
    );
    assert.equal(
      resolveMtfLiquiditySideAlignment("LOW_SIDE_ONLY", "LOW_SIDE_ONLY"),
      "MATCHING"
    );
    assert.equal(
      resolveMtfLiquiditySideAlignment("HIGH_SIDE_ONLY", "LOW_SIDE_ONLY"),
      "DIVERGENT"
    );
    assert.equal(
      resolveMtfLiquiditySideAlignment("NONE", "NONE"),
      "NONE"
    );
    assert.equal(
      resolveMtfLiquiditySideAlignment("BOTH_SIDES", "HIGH_SIDE_ONLY"),
      "MIXED"
    );
    assert.equal(
      resolveMtfLiquiditySideAlignment("NONE", "HIGH_SIDE_ONLY"),
      "DIVERGENT"
    );
  });

  it("A/B. HTF and LTF no liquidity → NONE", () => {
    const ltf = htfSeries(25);
    const ctx = alignLiq(ltf, ltf, 20);
    assert.equal(ctx.ltfFoundation.sideProfile, "NONE");
    assert.equal(ctx.htfFoundation!.sideProfile, "NONE");
    assert.equal(ctx.sideAlignment, "NONE");
  });

  it("C. same HIGH_SIDE → MATCHING", () => {
    const series = highSideSeries();
    const ctx = alignLiq(series, series, 25);
    assert.equal(ctx.ltfFoundation.sideProfile, "HIGH_SIDE_ONLY");
    assert.equal(ctx.htfFoundation!.sideProfile, "HIGH_SIDE_ONLY");
    assert.equal(ctx.sideAlignment, "MATCHING");
  });

  it("D. same LOW_SIDE → MATCHING", () => {
    const series = lowSideSeries();
    const ctx = alignLiq(series, series, 25);
    assert.equal(ctx.sideAlignment, "MATCHING");
  });

  it("E. opposite sides → DIVERGENT", () => {
    const ctx = alignLiq(highSideSeries(), lowSideSeries(), 25);
    assert.equal(ctx.ltfFoundation.sideProfile, "HIGH_SIDE_ONLY");
    assert.equal(ctx.htfFoundation!.sideProfile, "LOW_SIDE_ONLY");
    assert.equal(ctx.sideAlignment, "DIVERGENT");
  });

  it("F. mixed side on one leg → MIXED", () => {
    const ctx = alignLiq(highSideSeries(), bothSidesSeries(), 25);
    assert.equal(ctx.ltfFoundation.sideProfile, "HIGH_SIDE_ONLY");
    assert.equal(ctx.htfFoundation!.sideProfile, "BOTH_SIDES");
    assert.equal(ctx.sideAlignment, "MIXED");
  });

  it("G. lifecycle UNTOUCHED @ E foundation → MATCHING", () => {
    const ctx = alignLiq(highSideSeries(), highSideSeries(), 25);
    assert.equal(ctx.ltfFoundation.dominantLifecyclePhase, "UNTOUCHED");
    assert.equal(ctx.lifecycleAlignment, "MATCHING");
  });

  it("H. lifecycle alignment pure mixed", () => {
    const htf = buildLiquidityLegFoundation([mockPool("SINGLE_HIGH", "a")]);
    const ltfBase = buildLiquidityLegFoundation([mockPool("SINGLE_HIGH", "b")]);
    const ltf = {
      ...ltfBase,
      dominantLifecyclePhase: "MIXED_LIFECYCLE" as const,
    };
    assert.equal(resolveMtfLiquidityLifecycleAlignment(htf, ltf), "MIXED");
  });

  it("I/J. HTF developing bar excluded", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = highSideSeries();
    const E = 2;
    const a = alignLiq(ltf, htfA, E);
    const b = alignLiq(ltf, htfB, E);
    assert.deepEqual(a, b);
  });

  it("K/L. future spike invariance", () => {
    const ltf = highSideSeries();
    const htf = highSideSeries();
    const E = 25;
    const base = alignLiq(ltf, htf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((100 + k) * ONE_H, 200));
      htf.push(c((100 + k) * ONE_H, 50));
      assert.deepEqual(alignLiq(ltf, htf, E), base);
    }
  });

  it("M. prefix invariance", () => {
    const ltf = highSideSeries();
    const htf = highSideSeries();
    const E = 25;
    const base = alignLiq(ltf, htf, E);
    assert.deepEqual(alignLiq([...ltf, c(999 * ONE_H)], htf, E), base);
  });

  it("missing HTF → UNRESOLVED", () => {
    const ctx = alignLiq(htfSeries(5), [], 2);
    assert.equal(ctx.sideAlignment, "UNRESOLVED");
  });

  it("N. derived 1H→4H", () => {
    const ltf = htfSeries(40);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const ctx = alignLiq(ltf, htf, 30, "1H", "4H", "DERIVED_1H_4H");
    assert.equal(ctx.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("O. native track limitation", () => {
    const ctx = alignLiq(highSideSeries(), highSideSeries(), 25, "1H", "1H", "NATIVE_HTF");
    assert.ok(ctx.limitations.includes("native_htf_parity_not_established"));
  });

  it("P. side profile from pools", () => {
    assert.equal(
      resolveLiquiditySideProfile([mockPool("SINGLE_HIGH", "x")]),
      "HIGH_SIDE_ONLY"
    );
    assert.equal(
      resolveLiquiditySideProfile([
        mockPool("SINGLE_HIGH", "x"),
        mockPool("SINGLE_LOW", "y"),
      ]),
      "BOTH_SIDES"
    );
  });

  it("Q. deterministic ×5", () => {
    const ltf = highSideSeries();
    const first = JSON.stringify(alignLiq(ltf, ltf, 25));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(alignLiq(ltf, ltf, 25)), first);
    }
  });

  it("R. immutability", () => {
    const ltf = highSideSeries();
    const copy = ltf.map((x) => ({ ...x }));
    Object.freeze(copy);
    alignLiq(copy, copy, 25);
    assert.equal(copy[25].close, ltf[25].close);
  });

  it("S. frozen BTC checksum + deterministic", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(
      join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH),
      "utf8"
    );
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: loaded.candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const a = alignLiq(loaded.candles, htf, 500, "1H", "4H", "DERIVED_1H_4H");
    const b = alignLiq(loaded.candles, htf, 500, "1H", "4H", "DERIVED_1H_4H");
    assert.deepEqual(a, b);
    assert.equal(a.ruleId, MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID);
  });

  it("T. MSL-7A HTF E compatibility", () => {
    const ltf = highSideSeries();
    const mtf = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      htfCandles: ltf,
      ltfEvaluationBarIndex: 25,
      ltfTimeframeId: "1H",
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    const ctx = alignLiq(ltf, ltf, 25);
    assert.equal(ctx.htfEvaluationBarIndex, mtf.htf!.evaluationBarIndex);
  });

  it("Y. no structure / MSS dependency in source", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-mtf-liquidity-alignment.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureMssContext"));
    assert.ok(!src.includes("buildMarketStructureMtfStructureAlignmentContext"));
    assert.ok(!src.includes("buildMarketStructureBreakContext"));
    assert.ok(!src.includes("buildMarketStructureLiquidityAdvancedInteractionContext"));
    assert.ok(!src.includes("buildMarketStructureCrossTfLiquidityInteractionContext"));
  });

  it("Z. limitations", () => {
    const ctx = alignLiq(highSideSeries(), highSideSeries(), 25);
    assert.ok(ctx.limitations.includes("no_structure_alignment"));
    assert.ok(ctx.limitations.includes("no_msl7e_rebuild"));
    assert.equal(ctx.evidenceTag, "DESCRIPTIVE_MTF_LIQUIDITY_STATE");
  });
});
