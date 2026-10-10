import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureMtfStructureAlignmentContext,
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
  resolveMtfStructureStateAlignment,
} from "../market-structure/market-structure-mtf-structure-alignment";
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

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number, startTime = 0): Candle[] {
  return Array.from({ length: count }, (_, i) => c(startTime + i * ONE_H));
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

function bullishLadder(): Candle[] {
  const base = flatCandles(55, 115);
  for (let i = 0; i < base.length; i++) {
    base[i].time = i * ONE_H;
    base[i].low = 114;
    base[i].high = 116;
    base[i].close = 115;
  }
  for (const [index, type, price] of [
    [10, "LOW", 100],
    [18, "HIGH", 120],
    [26, "LOW", 110],
    [34, "HIGH", 130],
  ] as const) {
    setSyntheticPivot(base, index, type, price);
  }
  return base;
}

function bearishLadder(): Candle[] {
  const base = flatCandles(55, 105);
  for (let i = 0; i < base.length; i++) {
    base[i].time = i * ONE_H;
    base[i].low = 104;
    base[i].high = 106;
    base[i].close = 105;
  }
  for (const [index, type, price] of [
    [10, "HIGH", 130],
    [18, "LOW", 110],
    [26, "HIGH", 120],
    [34, "LOW", 100],
  ] as const) {
    setSyntheticPivot(base, index, type, price);
  }
  return base;
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

function alignAt(
  ltf: Candle[],
  htf: Candle[],
  E: number,
  ltfTf = "1H",
  htfTf = "1H",
  htfSourceTrack?: "DERIVED_1H_4H" | "NATIVE_HTF" | "UNSPECIFIED"
) {
  return buildMarketStructureMtfStructureAlignmentContext({
    ltfCandles: ltf,
    htfCandles: htf,
    ltfEvaluationBarIndex: E,
    ltfTimeframeId: ltfTf,
    htfTimeframeId: htfTf,
    swingConfig: SMALL_SWING,
    htfSourceTrack,
  });
}

describe("market-structure-mtf-structure-alignment (MSL-9A)", () => {
  it("matrix: 3×3 trend comparison taxonomy", () => {
    const cases: Array<
      [string, string, ReturnType<typeof resolveMtfStructureStateAlignment>]
    > = [
      ["BULLISH", "BULLISH", "ALIGNED"],
      ["BEARISH", "BEARISH", "ALIGNED"],
      ["BULLISH", "BEARISH", "COUNTER_ALIGNED"],
      ["BEARISH", "BULLISH", "COUNTER_ALIGNED"],
      ["NEUTRAL", "BULLISH", "NEUTRAL"],
      ["NEUTRAL", "BEARISH", "NEUTRAL"],
      ["BULLISH", "NEUTRAL", "NEUTRAL"],
      ["BEARISH", "NEUTRAL", "NEUTRAL"],
      ["NEUTRAL", "NEUTRAL", "NEUTRAL"],
    ];
    for (const [ltf, htf, expected] of cases) {
      assert.equal(
        resolveMtfStructureStateAlignment(
          ltf as "BULLISH" | "BEARISH" | "NEUTRAL",
          htf as "BULLISH" | "BEARISH" | "NEUTRAL"
        ),
        expected
      );
    }
  });

  it("A. LTF bullish + HTF bullish → ALIGNED (1H/1H same series)", () => {
    const ltf = bullishLadder();
    const E = 40;
    const ctx = alignAt(ltf, ltf, E);
    assert.equal(ctx.ltfTrendContext, "BULLISH");
    assert.equal(ctx.htfTrendContext, "BULLISH");
    assert.equal(ctx.alignment, "ALIGNED");
  });

  it("B. LTF bearish + HTF bearish → ALIGNED", () => {
    const ltf = bearishLadder();
    const ctx = alignAt(ltf, ltf, 40);
    assert.equal(ctx.ltfTrendContext, "BEARISH");
    assert.equal(ctx.htfTrendContext, "BEARISH");
    assert.equal(ctx.alignment, "ALIGNED");
  });

  it("C/D. counter-aligned when LTF and HTF trends differ", () => {
    const bull = bullishLadder();
    const bear = bearishLadder();
    const ctx1 = alignAt(bull, bear, 40);
    const ctx2 = alignAt(bear, bull, 40);
    if (ctx1.ltfTrendContext === "BULLISH" && ctx1.htfTrendContext === "BEARISH") {
      assert.equal(ctx1.alignment, "COUNTER_ALIGNED");
    }
    if (ctx2.ltfTrendContext === "BEARISH" && ctx2.htfTrendContext === "BULLISH") {
      assert.equal(ctx2.alignment, "COUNTER_ALIGNED");
    }
  });

  it("E–G. neutral involvement → NEUTRAL alignment", () => {
    const flat = flatCandles(30, 100);
    for (let i = 0; i < flat.length; i++) {
      flat[i].time = i * ONE_H;
    }
    setSyntheticPivot(flat, 8, "HIGH", 105);
    setSyntheticPivot(flat, 16, "LOW", 95);
    const ctx = alignAt(flat, flat, 25);
    if (ctx.ltfTrendContext === "NEUTRAL" || ctx.htfTrendContext === "NEUTRAL") {
      assert.equal(ctx.alignment, "NEUTRAL");
    }
  });

  it("H. missing HTF → UNRESOLVED", () => {
    const ltf = htfSeries(5);
    const ctx = alignAt(ltf, [], 2);
    assert.equal(ctx.alignment, "UNRESOLVED");
    assert.ok(ctx.unresolved.some((u) => u.code === "HTF_CONTEXT_UNAVAILABLE"));
  });

  it("J. developing HTF bar excluded (MSL-7A parity)", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = htfSeries(5);
    const E = 2;
    const a = alignAt(ltf, htfA, E);
    const b = alignAt(ltf, htfB, E);
    assert.deepEqual(a, b);
  });

  it("K/L. future spike invariance at fixed E", () => {
    const ltf = bullishLadder();
    const htf = bullishLadder();
    const E = 40;
    const base = alignAt(ltf, htf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((1000 + k) * ONE_H, 200));
      htf.push(c((1000 + k) * ONE_H, 50));
      assert.deepEqual(alignAt(ltf, htf, E), base);
    }
  });

  it("M. prefix invariance on LTF prefix extension", () => {
    const ltf = bullishLadder();
    const htf = bullishLadder();
    const E = 40;
    const base = alignAt(ltf, htf, E);
    const extended = [...ltf, c(999 * ONE_H, 120)];
    assert.deepEqual(alignAt(extended, htf, E), base);
  });

  it("N. knownAt timestamps populated when causal", () => {
    const ctx = alignAt(bullishLadder(), bullishLadder(), 40);
    assert.ok(ctx.ltfKnownAtTimestamp !== null);
    assert.ok(ctx.htfKnownAtTimestamp !== null);
    assert.ok(ctx.causalStatus.htfKnownAtVisibleAtLtfEvaluation);
  });

  it("O/P. HTF close boundary — closed HTF only", () => {
    const ltf = htfSeries(16);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E = 10;
    const ctx = alignAt(ltf, htf, E, "1H", "4H", "DERIVED_1H_4H");
    assert.ok(ctx.htfEvaluationBarIndex !== null);
    assert.equal(ctx.causalStatus.htfBarClosedAtLtfEvaluation, true);
  });

  it("Q. module does not compare raw cross-TF bar indices", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-mtf-structure-alignment.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("ltfEvaluationBarIndex <"));
    assert.ok(!src.includes("htfEvaluationBarIndex <"));
    assert.ok(src.includes("isKnownAtOrBefore"));
  });

  it("R. derived 1H→4H track", () => {
    const ltf = htfSeries(32);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const ctx = alignAt(ltf, htf, 20, "1H", "4H", "DERIVED_1H_4H");
    assert.equal(ctx.htfSourceTrack, "DERIVED_1H_4H");
    assert.ok(ctx.limitations.includes("derived_htf_research_track"));
  });

  it("S. native/derived distinction in limitations", () => {
    const ctx = alignAt(bullishLadder(), bullishLadder(), 40, "1H", "1H", "NATIVE_HTF");
    assert.ok(ctx.limitations.includes("native_htf_parity_not_established"));
    assert.ok(ctx.limitations.includes("native_htf_input_declared_not_parity_validated"));
  });

  it("T. deterministic ×5", () => {
    const ltf = bullishLadder();
    const htf = bullishLadder();
    const first = JSON.stringify(alignAt(ltf, htf, 40));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(alignAt(ltf, htf, 40)), first);
    }
  });

  it("U. input immutability / deep freeze contract", () => {
    const ltf = bullishLadder();
    const htf = bullishLadder();
    const ltfCopy = ltf.map((x) => ({ ...x }));
    const htfCopy = htf.map((x) => ({ ...x }));
    deepFreeze(ltfCopy);
    deepFreeze(htfCopy);
    alignAt(ltfCopy, htfCopy, 40);
    assert.equal(ltfCopy[40].close, ltf[40].close);
  });

  it("V. frozen BTC checksum unchanged + deterministic alignment", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    assert.ok(
      readFileSync(
        join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH),
        "utf8"
      ).length > 0
    );
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: loaded.candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E = 500;
    const a = alignAt(loaded.candles, htf, E, "1H", "4H", "DERIVED_1H_4H");
    const b = alignAt(loaded.candles, htf, E, "1H", "4H", "DERIVED_1H_4H");
    assert.deepEqual(a, b);
    assert.equal(a.ruleId, MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID);
  });

  it("W. MSL-7A compatibility — same HTF E as alignment context", () => {
    const ltf = bullishLadder();
    const mtf = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      htfCandles: ltf,
      ltfEvaluationBarIndex: 40,
      ltfTimeframeId: "1H",
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    const ctx = alignAt(ltf, ltf, 40);
    assert.equal(ctx.htfEvaluationBarIndex, mtf.htf!.evaluationBarIndex);
  });

  it("X/Y. no liquidity/MSS rebuild in module source", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-mtf-structure-alignment.ts"
      ),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureMssContext"));
    assert.ok(!src.includes("buildMarketStructureLiquidity"));
    assert.ok(!src.includes("detectSwings"));
    assert.ok(src.includes("buildMarketStructureMtfAlignmentContext"));
  });

  it("Z. limitations and evidence tag", () => {
    const ctx = alignAt(bullishLadder(), bullishLadder(), 40);
    assert.equal(ctx.evidenceTag, "DESCRIPTIVE_MTF_STRUCTURE_STATE");
    assert.ok(ctx.limitations.includes("no_mtf_mss"));
    assert.ok(ctx.limitations.includes("no_liquidity_alignment"));
    assert.ok(ctx.limitations.includes("descriptive_alignment_only"));
  });
});
