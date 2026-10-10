import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureLiquidityStructureAssociationContext,
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-liquidity-structure-association";
import {
  buildMarketStructureLiquidityInteractionContext,
  buildMarketStructureSnapshotAtBar,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function hourSeries(count: number, price = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H, price));
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

function bullishLadderHours(): Candle[] {
  const base = hourSeries(60, 115);
  for (const row of base) {
    row.low = 114;
    row.high = 116;
    row.close = 115;
  }
  setSyntheticPivot(base, 10, "LOW", 100);
  setSyntheticPivot(base, 18, "HIGH", 120);
  setSyntheticPivot(base, 26, "LOW", 110);
  setSyntheticPivot(base, 34, "HIGH", 130);
  return base;
}

function bearishLadderHours(): Candle[] {
  const base = hourSeries(60, 105);
  for (const row of base) {
    row.low = 104;
    row.high = 106;
    row.close = 105;
  }
  setSyntheticPivot(base, 10, "HIGH", 130);
  setSyntheticPivot(base, 18, "LOW", 110);
  setSyntheticPivot(base, 26, "HIGH", 120);
  setSyntheticPivot(base, 34, "LOW", 100);
  return base;
}

function assoc(input: {
  candles: Candle[];
  E: number;
  horizonBars?: number;
}) {
  return buildMarketStructureLiquidityStructureAssociationContext({
    candles: input.candles,
    evaluationBarIndex: input.E,
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

describe("market-structure-liquidity-structure-association (MSL-7D)", () => {
  it("1. basic liquidity → BOS association", () => {
    const bull = bullishLadderHours();
    const E = 40;
    const touchBar = E + 1;
    bull[touchBar].high = 135;
    bull[touchBar].low = 112;
    bull[touchBar].close = 128;
    const ctxBos = assoc({ candles: bull, E });
    assert.ok(ctxBos.associations.some((a) => a.associationType === "LIQUIDITY_TO_BOS"));
    assert.equal(ctxBos.structureEvaluationBarIndex, Math.min(E + 24, bull.length - 1));
  });

  it("2. basic liquidity → CHoCH association", () => {
    const bear = bearishLadderHours();
    const E = 40;
    const touchBar = E + 1;
    bear[touchBar].high = 122;
    bear[touchBar].low = 118;
    bear[touchBar].close = 121;
    const ctx = assoc({ candles: bear, E, horizonBars: 1 });
    assert.equal(ctx.structureEvaluationBarIndex, touchBar);
    assert.ok(ctx.associations.some((a) => a.associationType === "LIQUIDITY_TO_CHOCH"));
  });

  it("3–4. same-bar and next-bar association", () => {
    const bull = bullishLadderHours();
    const E = 40;
    const touchBar = E + 1;
    bull[touchBar].high = 135;
    bull[touchBar].low = 112;
    bull[touchBar].close = 128;
    const same = assoc({ candles: bull, E });
    assert.ok(
      same.associations.some(
        (a) =>
          a.liquidityTriggerBarIndex === touchBar &&
          a.structureTriggerBarIndex === touchBar &&
          a.associationType === "LIQUIDITY_TO_BOS"
      )
    );
    const nextBar = touchBar + 1;
    const bear2 = bearishLadderHours();
    bear2[touchBar].low = 100;
    bear2[touchBar].high = 106;
    bear2[touchBar].close = 105;
    bear2[nextBar].high = 122;
    bear2[nextBar].low = 118;
    bear2[nextBar].close = 121;
    const next = assoc({ candles: bear2, E, horizonBars: 2 });
    assert.equal(next.structureEvaluationBarIndex, nextBar);
    assert.ok(
      next.associations.some(
        (a) =>
          a.liquidityTriggerBarIndex === touchBar &&
          a.structureTriggerBarIndex === nextBar &&
          a.associationType === "LIQUIDITY_TO_CHOCH"
      )
    );
  });

  it("5. structure before touch → no association for that pair", () => {
    const bull = bullishLadderHours();
    const E = 40;
    bull[E].high = 135;
    bull[E].low = 112;
    bull[E].close = 128;
    const touchBar = E + 1;
    bull[touchBar].high = 131;
    bull[touchBar].close = 115;
    const ctx = assoc({ candles: bull, E });
    for (const a of ctx.associations) {
      assert.ok(a.structureTriggerBarIndex >= a.liquidityTriggerBarIndex);
    }
  });

  it("6–8. multiple liquidity / structure many-to-many", () => {
    const bull = bullishLadderHours();
    const E = 40;
    for (const bar of [E + 1, E + 3]) {
      bull[bar].high = 135;
      bull[bar].low = 112;
      bull[bar].close = 128;
    }
    const ctx = assoc({ candles: bull, E });
    const liqIds = new Set(ctx.associations.map((a) => a.sourceLiquidityEventId));
    assert.ok(liqIds.size >= 2);
    assert.ok(ctx.associations.length >= 2);
  });

  it("9. BSL + SSL same bar separate liquidity events", () => {
    const bull = bullishLadderHours();
    const E = 45;
    const bar = E + 1;
    bull[bar].high = 136;
    bull[bar].low = 109;
    bull[bar].close = 115;
    const ctx = assoc({ candles: bull, E, horizonBars: 1 });
    const liq = buildMarketStructureLiquidityInteractionContext({
      snapshot: buildMarketStructureSnapshotAtBar({
        candles: bull,
        evaluationBarIndex: E,
        swingConfig: SMALL_SWING,
      }),
      candles: bull,
    });
    const atBarLiq = liq.events.filter((e) => e.triggerBarIndex === bar);
    assert.ok(atBarLiq.length >= 2);
    assert.ok(
      ctx.associations.some(
        (a) => a.liquidityTriggerBarIndex === bar && a.associationType === "LIQUIDITY_TO_BOS"
      )
    );
  });

  it("10. E bar excluded from liquidity touches", () => {
    const bull = bullishLadderHours();
    const E = 40;
    bull[E].high = 200;
    const ctx = assoc({ candles: bull, E });
    assert.ok(!ctx.associations.some((a) => a.liquidityTriggerBarIndex === E));
  });

  it("11. E+H horizon boundary", () => {
    const bull = bullishLadderHours();
    const E = 40;
    const H = 3;
    const touchIn = E + H;
    const touchOut = E + H + 1;
    bull[touchIn].high = 135;
    bull[touchOut].high = 135;
    const liq = buildMarketStructureLiquidityInteractionContext({
      snapshot: buildMarketStructureSnapshotAtBar({
        candles: bull,
        evaluationBarIndex: E,
        swingConfig: SMALL_SWING,
      }),
      candles: bull,
      horizonBars: H,
    });
    assert.ok(!liq.events.some((e) => e.triggerBarIndex === touchOut));
    const ctx = assoc({ candles: bull, E, horizonBars: H });
    assert.equal(ctx.structureEvaluationBarIndex, E + H);
  });

  it("12. invalid horizon", () => {
    const ctx = assoc({ candles: hourSeries(20), E: 5, horizonBars: 0 });
    assert.equal(ctx.associations.length, 0);
    assert.ok(ctx.unresolved.some((u) => u.code === "INVALID_HORIZON_BARS"));
  });

  it("14–15. future spike and prefix invariance", () => {
    const bull = bullishLadderHours();
    const E = 40;
    const H = 24;
    const touchBar = E + 1;
    bull[touchBar].high = 135;
    bull[touchBar].close = 128;
    const prefixLen = E + H + 2;
    const prefix = bull.slice(0, prefixLen);
    const a = assoc({ candles: prefix, E, horizonBars: H });
    const extended = [...prefix, c(200 * ONE_H, 115), c(201 * ONE_H, 115)];
    const b = assoc({ candles: extended, E, horizonBars: H });
    assert.deepEqual(a.associations, b.associations);
  });

  it("16–18. immutability and determinism", () => {
    const bull = bullishLadderHours();
    const E = 40;
    bull[E + 1].high = 135;
    deepFreeze(bull);
    const runs = Array.from({ length: 5 }, () => assoc({ candles: bull, E }));
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
    }
    assert.ok(runs[0].associations.every((a) => a.associationId.startsWith("lsa:")));
  });

  it("19–20. frozen liquidity at E and E_struct reporting", () => {
    const bull = bullishLadderHours();
    const E = 40;
    const snapE = buildMarketStructureSnapshotAtBar({
      candles: bull,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const snapExtended = buildMarketStructureSnapshotAtBar({
      candles: bull,
      evaluationBarIndex: E + 10,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(
      snapE.liquidity.liquidityPools.map((p) => p.poolId),
      snapExtended.liquidity.liquidityPools.slice(0, snapE.liquidity.liquidityPools.length).map((p) => p.poolId).slice(0, snapE.liquidity.liquidityPools.length)
    );
    const ctx = assoc({ candles: bull, E, horizonBars: 5 });
    assert.equal(ctx.evaluationBarIndex, E);
    assert.equal(ctx.structureEvaluationBarIndex, E + 5);
  });

  it("21–22. limitations exclude sweep/MSS", () => {
    const ctx = assoc({ candles: hourSeries(30), E: 10 });
    assert.ok(ctx.limitations.includes("no_sweep"));
    assert.ok(ctx.limitations.includes("no_mss"));
    assert.ok(ctx.limitations.includes("structure_observation_extends_past_liquidity_evaluation"));
  });

  it("23. protected separation — associations reference liquidity event ids only", () => {
    const bull = bullishLadderHours();
    const E = 40;
    bull[E + 1].high = 135;
    const ctx = assoc({ candles: bull, E });
    for (const a of ctx.associations) {
      assert.ok(a.sourceLiquidityEventId.includes("LIQUIDITY_WICK_TOUCH"));
      assert.ok(!a.targetStructureEventId.includes("protected"));
    }
  });

  it("24. BTC frozen checksum unchanged", () => {
    const fixturePath = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const before = readFileSync(fixturePath, "utf8");
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    const E = 500;
    const a = assoc({ candles: loaded.candles, E });
    const b = assoc({ candles: loaded.candles, E });
    assert.deepEqual(a, b);
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    assert.equal(readFileSync(fixturePath, "utf8"), before);
  });

  it("rule id present", () => {
    const ctx = assoc({ candles: hourSeries(25), E: 10 });
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID);
  });
});
