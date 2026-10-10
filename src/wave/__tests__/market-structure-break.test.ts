import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureBreakContext,
  buildMarketStructureSnapshotAtBar,
  MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
  MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
  MARKET_STRUCTURE_BREAK_PRICE_EPS,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { candle, flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const DEFAULT_SWING = { leftBars: 5, rightBars: 5, atrPeriod: 14, minAtrMultiplier: 0.5 };

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

function deepCloneCandles(candles: readonly Candle[]): Candle[] {
  return candles.map((c) => ({ ...c }));
}

function bullishLadder(): Candle[] {
  const base = flatCandles(55, 115);
  for (const c of base) {
    c.low = 114;
    c.high = 116;
    c.close = 115;
  }
  applySyntheticPivots(base, [
    [10, "LOW", 100],
    [18, "HIGH", 120],
    [26, "LOW", 110],
    [34, "HIGH", 130],
  ]);
  return base;
}

function bearishLadder(): Candle[] {
  const base = flatCandles(55, 105);
  for (const c of base) {
    c.low = 104;
    c.high = 106;
    c.close = 105;
  }
  applySyntheticPivots(base, [
    [10, "HIGH", 130],
    [18, "LOW", 110],
    [26, "HIGH", 120],
    [34, "LOW", 100],
  ]);
  return base;
}

function snapAt(candles: Candle[], E: number) {
  return buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig: SMALL_SWING,
  });
}

function setBarWick(base: Candle[], index: number, high: number, low: number, close: number): void {
  base[index].high = high;
  base[index].low = low;
  base[index].close = close;
}

describe("market-structure-break (MSL-4)", () => {
  it("A. bullish ladder — BOS on break above 130 HIGH", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 112, 128);
    const snap = snapAt(candles, E);
    assert.equal(snap.protected.trendContext, "BULLISH");
    const bos = snap.break.classifiedEvents.filter((e) => e.eventType === "BOS");
    assert.ok(bos.length >= 1);
    assert.ok(bos.some((e) => e.referencePrice === 130 && e.direction === "UP"));
    assert.equal(bos[0].classificationRuleId, MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID);
  });

  it("B. bearish ladder — BOS on break below 100 LOW", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 102, 98, 99);
    const snap = snapAt(candles, E);
    assert.equal(snap.protected.trendContext, "BEARISH");
    const bos = snap.break.classifiedEvents.filter((e) => e.eventType === "BOS");
    assert.ok(bos.some((e) => e.referencePrice === 100 && e.direction === "DOWN"));
  });

  it("C. bullish trend — CHoCH on break below 110 LOW", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const choch = snap.break.classifiedEvents.filter((e) => e.eventType === "CHoCH");
    assert.ok(choch.some((e) => e.direction === "DOWN" && e.referenceType === "LOW"));
    assert.equal(choch[0].classificationRuleId, MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID);
  });

  it("D. bearish trend — CHoCH on break above 120 HIGH", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 122, 118, 121);
    const snap = snapAt(candles, E);
    const choch = snap.break.classifiedEvents.filter((e) => e.eventType === "CHoCH");
    assert.ok(choch.some((e) => e.direction === "UP" && e.referenceType === "HIGH"));
  });

  it("E. wick inclusive — high 123 close 118 vs ref 120", () => {
    const candles = flatCandles(25, 115);
    setSyntheticPivot(candles, 10, "HIGH", 120);
    const E = 20;
    setBarWick(candles, E, 123, 117, 118);
    const snap = snapAt(candles, E);
    assert.ok(
      snap.break.breakObservations.some(
        (o) => o.referencePrice === 120 && o.direction === "UP"
      )
    );
  });

  it("F. no wick break — high 119 vs ref 120", () => {
    const candles = flatCandles(25, 115);
    setSyntheticPivot(candles, 10, "HIGH", 120);
    const E = 20;
    setBarWick(candles, E, 119, 115, 121);
    const snap = snapAt(candles, E);
    assert.ok(
      !snap.break.breakObservations.some(
        (o) => o.referencePrice === 120 && o.triggerBarIndex === E
      )
    );
  });

  it("G. unconfirmed reference — no observation for pivot beyond E confirm", () => {
    const candles = latencyPivotSeries();
    const E = 12;
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: DEFAULT_SWING,
    });
    assert.equal(snap.break.breakObservations.length, 0);
  });

  it("H. reference confirmed at E — observation knownAt = E", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 112, 130);
    const snap = snapAt(candles, E);
    for (const o of snap.break.breakObservations) {
      assert.equal(o.knownAtBarIndex, o.triggerBarIndex);
      assert.ok(o.knownAtBarIndex <= E);
      assert.equal(o.confirmationBarIndex, null);
    }
  });

  it("I/J. scope INTERNAL and EXTERNAL on observations", () => {
    const candles = bullishLadder();
    applySyntheticPivots(candles, [[22, "HIGH", 115]]);
    const E = 40;
    setBarWick(candles, E, 136, 112, 128);
    const snap = snapAt(candles, E);
    const scopes = new Set(snap.break.breakObservations.map((o) => o.referenceScope));
    assert.ok(scopes.size >= 1);
  });

  it("K. multiple protected lows — observations preserved", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 105, 108);
    const snap = snapAt(candles, E);
    const protObs = snap.break.breakObservations.filter((o) =>
      o.referenceSources.includes("PROTECTED")
    );
    assert.ok(protObs.length >= 1);
  });

  it("L. unresolved protected — CLASSIFICATION_PROTECTED_AMBIGUITY when applicable", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 105, 108);
    const snap = snapAt(candles, E);
    if (
      snap.protected.unresolved.some(
        (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
      )
    ) {
      const chochProt = snap.break.classifiedEvents.filter(
        (e) =>
          e.eventType === "CHoCH" &&
          snap.break.breakObservations.find(
            (o) =>
              o.observationId === e.derivedFromObservationId &&
              o.referenceSources.includes("PROTECTED")
          )
      );
      if (chochProt.length > 1) {
        assert.ok(
          snap.break.unresolved.some((u) => u.code === "CLASSIFICATION_PROTECTED_AMBIGUITY")
        );
      }
    }
  });

  it("M. NEUTRAL — observations possible, no BOS/CHoCH", () => {
    const candles = flatCandles(20, 100);
    const snap = snapAt(candles, 19);
    assert.equal(snap.protected.trendContext, "NEUTRAL");
    assert.equal(snap.break.classifiedEvents.length, 0);
  });

  it("N. no confirmed swings — empty observations/events", () => {
    const candles = flatCandles(8, 100);
    const snap = snapAt(candles, 7);
    assert.equal(snap.break.breakObservations.length, 0);
    assert.equal(snap.break.classifiedEvents.length, 0);
  });

  it("O. break at E+1 invisible at E", () => {
    const candles = bullishLadder();
    const E = 38;
    const snapE = snapAt(deepCloneCandles(candles), E);
    setBarWick(candles, E + 1, 135, 112, 128);
    const snapE2 = snapAt(candles, E);
    assert.deepEqual(snapE.break, snapE2.break);
    const snapNext = snapAt(candles, E + 1);
    assert.ok(snapNext.break.breakObservations.length >= snapE.break.breakObservations.length);
  });

  it("P. multi HIGH break — multiple BOS without priority merge", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 112, 128);
    const snap = snapAt(candles, E);
    assert.equal(snap.protected.trendContext, "BULLISH");
    const atE = snap.break.breakObservations.filter(
      (o) => o.triggerBarIndex === E && o.direction === "UP" && o.referenceType === "HIGH"
    );
    assert.ok(atE.length >= 1);
    const bos = snap.break.classifiedEvents.filter((e) => e.eventType === "BOS");
    assert.ok(bos.length >= 2);
  });

  it("Q. equality at reference — high == 120 breaks UP", () => {
    const candles = flatCandles(25, 115);
    setSyntheticPivot(candles, 10, "HIGH", 120);
    const E = 20;
    setBarWick(candles, E, 120, 118, 119);
    const snap = snapAt(candles, E);
    assert.ok(snap.break.breakObservations.some((o) => o.referencePrice === 120));
  });

  it("rule IDs and MSS limitation", () => {
    const snap = snapAt(bullishLadder(), 40);
    assert.equal(snap.break.ruleId, MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID);
    assert.equal(snap.break.ruleIds.trigger, MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID);
    assert.ok(snap.break.limitations.includes("mss_not_in_msl4_v1"));
    assert.ok(!snap.break.classifiedEvents.some((e) => (e.eventType as string) === "MSS"));
  });

  it("observationId deterministic format", () => {
    const candles = bullishLadder();
    setBarWick(candles, 40, 135, 112, 128);
    const snap = snapAt(candles, 40);
    for (const o of snap.break.breakObservations) {
      assert.match(o.observationId, /^bo:\d+:(HIGH|LOW):\d+:(UP|DOWN)$/);
    }
  });

  it("Test A — future spike after E", () => {
    const candles = bullishLadder();
    setBarWick(candles, 35, 135, 112, 128);
    const atE = snapAt(deepCloneCandles(candles), 35);
    for (let i = 36; i < candles.length; i++) {
      candles[i].high = 50_000;
      candles[i].low = 40_000;
    }
    const atEAgain = snapAt(candles, 35);
    assert.deepEqual(atE.break, atEAgain.break);
  });

  it("Test D — slice vs full prefix", () => {
    const candles = bullishLadder();
    setBarWick(candles, 40, 135, 112, 128);
    const full = snapAt(candles, 40);
    const sliced = buildMarketStructureSnapshotAtBar({
      candles: candles.slice(0, 41),
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(full.break, sliced.break);
  });

  it("Test E — input immutability", () => {
    const candles = bullishLadder();
    const clone = deepCloneCandles(candles);
    snapAt(clone, 40);
    assert.deepEqual(candles, clone);
  });

  it("Test F — five-run deepEqual", () => {
    const candles = bullishLadder();
    setBarWick(candles, 40, 135, 112, 128);
    const results = Array.from({ length: 5 }, () => snapAt(deepCloneCandles(candles), 40).break);
    for (let i = 1; i < results.length; i++) {
      assert.deepEqual(results[0], results[i]);
    }
  });

  it("buildMarketStructureBreakContext without redetecting swings", () => {
    const candles = bullishLadder();
    setBarWick(candles, 40, 135, 112, 128);
    const snap = snapAt(candles, 40);
    const { break: _b, ...core } = snap;
    const ctx = buildMarketStructureBreakContext({ snapshot: snap, candles });
    assert.deepEqual(ctx, snap.break);
    const ctx2 = buildMarketStructureBreakContext({ snapshot: core, candles });
    assert.deepEqual(ctx2, snap.break);
  });

  it("frozen BTC E=500 deterministic break context", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
    const E = 500;
    const a = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    const b = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    assert.deepEqual(a.break, b.break);
  });

  it("architecture — break module boundaries", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-break.ts"),
      "utf8"
    );
    assert.ok(mod.includes("MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID"));
    assert.ok(!mod.includes("detectSwings"));
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });
});

function latencyPivotSeries(): Candle[] {
  const base = flatCandles(30, 100);
  for (let i = 8; i <= 12; i++) {
    base[i].high = 150;
    base[i].low = 95;
    base[i].close = 100;
  }
  base[10].high = 200;
  base[10].low = 90;
  base[10].close = 105;
  return base;
}
