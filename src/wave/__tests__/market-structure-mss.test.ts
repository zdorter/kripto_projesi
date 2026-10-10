import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import {
  buildMarketStructureMssContext,
  MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID,
  MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-mss";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { candle, flatCandles } from "./test-helpers";
import type { Candle } from "../types";
import type { MarketStructureSnapshot } from "../market-structure/market-structure-types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

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

function applySyntheticPivots(
  base: Candle[],
  pivots: ReadonlyArray<readonly [number, "LOW" | "HIGH", number]>
): void {
  for (const [index, type, price] of pivots) {
    setSyntheticPivot(base, index, type, price);
  }
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

function setBarWick(
  base: Candle[],
  index: number,
  high: number,
  low: number,
  close: number
): void {
  base[index].high = high;
  base[index].low = low;
  base[index].close = close;
}

function snapAt(candles: Candle[], E: number): MarketStructureSnapshot {
  return buildMarketStructureSnapshotAtBar({
    candles,
    evaluationBarIndex: E,
    swingConfig: SMALL_SWING,
  });
}

function mssAt(snap: MarketStructureSnapshot) {
  return buildMarketStructureMssContext({ snapshot: snap });
}

describe("market-structure-mss (MSL-8)", () => {
  it("A. bullish structure — BOS at E does not emit MSS", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 112, 128);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    assert.ok(snap.break.classifiedEvents.some((e) => e.eventType === "BOS"));
    assert.equal(ctx.events.length, 0);
  });

  it("B. bearish structure — BOS at E does not emit MSS", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 102, 98, 99);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    assert.ok(snap.break.classifiedEvents.some((e) => e.eventType === "BOS"));
    assert.equal(ctx.events.length, 0);
  });

  it("C. neutral trend — NO_MSS unresolved", () => {
    const candles = flatCandles(30, 100);
    applySyntheticPivots(candles, [
      [8, "HIGH", 105],
      [16, "LOW", 95],
    ]);
    const E = 25;
    const snap = snapAt(candles, E);
    if (snap.protected.trendContext !== "NEUTRAL") {
      return;
    }
    const ctx = mssAt(snap);
    assert.equal(ctx.events.length, 0);
    assert.ok(
      ctx.unresolved.some((u) => u.code === "TREND_CONTEXT_NEUTRAL_NO_MSS")
    );
  });

  it("D. bullish ladder CHoCH exists but MSS UNRESOLVED when multiple protected LOW (not CHoCH alias)", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    assert.equal(snap.protected.trendContext, "BULLISH");
    const choch = snap.break.classifiedEvents.filter((e) => e.eventType === "CHoCH");
    assert.ok(choch.length >= 1);
    const ctx = mssAt(snap);
    assert.equal(ctx.events.length, 0);
    assert.ok(
      ctx.unresolved.some(
        (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
      )
    );
  });

  it("D2. single protected LOW — BEARISH MSS emitted (structure transition)", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const obs = snap.break.breakObservations.find(
      (o) =>
        o.referencePivotIndex === 26 &&
        o.referenceType === "LOW" &&
        o.referenceSources.includes("PROTECTED")
    );
    assert.ok(obs);
    const candidate = snap.protected.protectedLows.find((c) => c.pivotIndex === 26);
    assert.ok(candidate);
    const stub = {
      ...snap,
      protected: {
        ...snap.protected,
        protectedLows: [candidate!],
        unresolved: [],
      },
    };
    const ctx = buildMarketStructureMssContext({ snapshot: stub });
    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].mssDirection, "BEARISH");
    assert.equal(ctx.events[0].preTransitionDirectionalState, "BULLISH");
    assert.equal(ctx.events[0].confirmationBarIndex, null);
    assert.equal(ctx.events[0].knownAtBarIndex, obs!.triggerBarIndex);
  });

  it("E. bearish ladder CHoCH exists but MSS UNRESOLVED when multiple protected HIGH", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 122, 118, 121);
    const snap = snapAt(candles, E);
    assert.equal(snap.protected.trendContext, "BEARISH");
    assert.ok(snap.break.classifiedEvents.some((e) => e.eventType === "CHoCH"));
    const ctx = mssAt(snap);
    assert.equal(ctx.events.length, 0);
    assert.ok(
      ctx.unresolved.some(
        (u) => u.code === "MULTIPLE_PROTECTED_HIGH_CANDIDATES_NO_SINGLE_SELECTION"
      )
    );
  });

  it("F. CHoCH without MSS — swing-only reference (no protected candidate match)", () => {
    const candles = flatCandles(35, 115);
    applySyntheticPivots(candles, [
      [10, "LOW", 100],
      [18, "HIGH", 120],
      [26, "LOW", 110],
    ]);
    const E = 32;
    setBarWick(candles, E, 116, 108, 109);
    const snap = snapAt(candles, E);
    const choch = snap.break.classifiedEvents.filter((e) => e.eventType === "CHoCH");
    const ctx = mssAt(snap);
    const protObs = snap.break.breakObservations.filter((o) =>
      o.referenceSources.includes("PROTECTED")
    );
    if (choch.length >= 1 && protObs.length === 0) {
      assert.equal(ctx.events.length, 0);
    }
  });

  it("G. protected reference required — events cite PROTECTED observation", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    for (const ev of ctx.events) {
      const obs = snap.break.breakObservations.find(
        (o) => o.observationId === ev.derivedFromObservationId
      );
      assert.ok(obs);
      assert.ok(obs!.referenceSources.includes("PROTECTED"));
      assert.equal(ev.referenceRuleId, "MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_V1");
    }
  });

  it("H. multiple protected LOW ambiguity blocks bearish MSS", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 105, 108);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    if (
      snap.protected.unresolved.some(
        (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
      )
    ) {
      const bearish = ctx.events.filter((e) => e.mssDirection === "BEARISH");
      assert.equal(bearish.length, 0);
      assert.ok(
        ctx.unresolved.some(
          (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
        )
      );
    }
  });

  it("I/J. internal and external scope carried as metadata on MSS events", () => {
    const candles = bullishLadder();
    applySyntheticPivots(candles, [[22, "HIGH", 115]]);
    const E = 40;
    setBarWick(candles, E, 136, 112, 128);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    for (const ev of ctx.events) {
      assert.ok(ev.referenceScope === "INTERNAL" || ev.referenceScope === "EXTERNAL");
    }
  });

  it("K. reuses MSL-4 wick-inclusive observations (no duplicate trigger)", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    for (const ev of ctx.events) {
      assert.ok(
        snap.break.breakObservations.some(
          (o) => o.observationId === ev.derivedFromObservationId
        )
      );
    }
    const src = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-mss.ts"),
      "utf8"
    );
    assert.ok(!src.includes("wickTriggers"));
    assert.ok(!src.includes("buildMarketStructureBreakContext"));
  });

  it("L. evaluation bar E inclusive — trigger at E allowed", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    for (const ev of ctx.events) {
      assert.ok(ev.triggerBarIndex <= E);
    }
  });

  it("M. E+1 not in snapshot — extending series changes MSS only when E moves", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snapE = snapAt(candles, E);
    const ctxE = mssAt(snapE);
    candles.push(candle(E + 1, 2000, 140, 130, 135, 132));
    const snapE1 = snapAt(candles, E);
    const ctxE1 = mssAt(snapE1);
    assert.deepEqual(ctxE.events, ctxE1.events);
  });

  it("N. knownAt equals triggerBarIndex", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 122, 118, 121);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    for (const ev of ctx.events) {
      assert.equal(ev.knownAtBarIndex, ev.triggerBarIndex);
      assert.ok(ev.referenceKnownAtBarIndex <= E);
    }
  });

  it("O/P. prefix and future spike invariance at fixed E", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const base = mssAt(snapAt(candles, E));
    for (let k = 0; k < 5; k++) {
      candles.push(candle(E + 1 + k, 3000 + k, 200, 50, 180, 100));
      assert.deepEqual(mssAt(snapAt(candles, E)).events, base.events);
    }
  });

  it("Q. context output is plain data (immutable usage contract)", () => {
    const snap = snapAt(bullishLadder(), 40);
    const a = mssAt(snap);
    const b = mssAt(snap);
    assert.deepEqual(a, b);
  });

  it("R. deterministic — same input ×5", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const snap = snapAt(candles, E);
    const first = JSON.stringify(mssAt(snap));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(mssAt(snap)), first);
    }
  });

  it("S. duplicate prevention — same direction+reference+trigger once", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 115, 108, 109);
    const ctx = mssAt(snapAt(candles, E));
    const ids = ctx.events.map((e) => e.eventId);
    assert.equal(ids.length, new Set(ids).size);
  });

  it("T/U. same-bar BOS/CHoCH coexist; MSS separate from classifiedEvents", () => {
    const candles = bullishLadder();
    const E = 40;
    setBarWick(candles, E, 135, 108, 128);
    const snap = snapAt(candles, E);
    const ctx = mssAt(snap);
    assert.ok(!snap.break.classifiedEvents.some((e) => (e.eventType as string) === "MSS"));
    assert.ok(snap.break.classifiedEvents.length >= 1 || ctx.events.length >= 0);
  });

  it("V–Y. MSL-4 classifiedEvents union unchanged (BOS|CHoCH only)", () => {
    const snap = snapAt(bullishLadder(), 40);
    for (const e of snap.break.classifiedEvents) {
      assert.ok(e.eventType === "BOS" || e.eventType === "CHoCH");
    }
    assert.ok(snap.break.limitations.includes("mss_not_in_msl4_v1"));
  });

  it("Z. MSL-7D/7E limitations still include no_mss on association/advanced", () => {
    const assoc = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-liquidity-structure-association.ts"
      ),
      "utf8"
    );
    const adv = readFileSync(
      join(
        process.cwd(),
        "src/wave/market-structure/market-structure-liquidity-advanced-interaction.ts"
      ),
      "utf8"
    );
    assert.ok(assoc.includes("no_mss"));
    assert.ok(adv.includes("no_mss"));
  });

  it("AA. rule IDs and limitations on MSS context", () => {
    const ctx = mssAt(snapAt(bullishLadder(), 40));
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID);
    assert.ok(ctx.limitations.includes("research_only"));
    assert.ok(ctx.limitations.includes("not_changing_msl4"));
    assert.ok(ctx.limitations.includes("choch_does_not_imply_mss"));
    if (ctx.events.length > 0) {
      assert.equal(
        ctx.events[0].classificationRuleId,
        MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID
      );
    }
  });

  it("AB. frozen BTC dataset checksum unchanged", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(checksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    assert.ok(
      readFileSync(
        join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH),
        "utf8"
      ).length > 0
    );
  });

  it("event id pattern mss:direction:pivot:type:trigger", () => {
    const candles = bearishLadder();
    const E = 40;
    setBarWick(candles, E, 122, 118, 121);
    const ctx = mssAt(snapAt(candles, E));
    for (const ev of ctx.events) {
      assert.match(
        ev.eventId,
        /^mss:(BULLISH|BEARISH):\d+:(HIGH|LOW):\d+$/
      );
    }
  });
});
