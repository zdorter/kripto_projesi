import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureProtectedContext,
  buildMarketStructureSnapshotAtBar,
  MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH } from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { detectTrend } from "../trend-detector";
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

/** Bullish HL/HH ladder: 100 L → 120 H → 110 L → 130 H */
function bullishProtectedLadder(): Candle[] {
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

/** Bearish LH/LL ladder: 130 H → 110 L → 120 H → 100 L */
function bearishProtectedLadder(): Candle[] {
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

function snapshotCoreWithoutProtected(
  snap: ReturnType<typeof buildMarketStructureSnapshotAtBar>
) {
  const { protected: _p, ...core } = snap;
  return core;
}

describe("market-structure-protected (MSL-3)", () => {
  it("A. bullish — C3 HL low candidate emitted (not asserted as sole protected)", () => {
    const candles = bullishProtectedLadder();
    const E = 40;
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.equal(snap.protected.ruleId, MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID);
    assert.equal(snap.protected.trendContext, "BULLISH");
    const c3 = snap.protected.protectedLows.filter((c) =>
      c.selectionReasonCodes.includes("C3_STRUCTURE_LABEL")
    );
    assert.ok(c3.length >= 1);
    const hlLow = c3.find((c) => c.structureLabelAtSelection === "HL");
    assert.ok(hlLow);
    assert.equal(hlLow!.statusAtE, "CANDIDATE");
  });

  it("B. bearish — C3 LH high candidate emitted", () => {
    const candles = bearishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.equal(snap.protected.trendContext, "BEARISH");
    const c3 = snap.protected.protectedHighs.filter((c) =>
      c.selectionReasonCodes.includes("C3_STRUCTURE_LABEL")
    );
    assert.ok(c3.length >= 1);
    assert.ok(c3.some((c) => c.structureLabelAtSelection === "LH"));
  });

  it("C. HH/HL pair confirmation latency gates candidates", () => {
    const candles = bullishProtectedLadder();
    const full = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const hlPair = full.structurePairs.find((p) => p.kind === "LOW" && p.structure === "HL");
    assert.ok(hlPair, "expected HL low pair on bullish ladder at E=40");
    const earlyE = hlPair.knownAtBarIndex - 1;
    const early = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: earlyE,
      swingConfig: SMALL_SWING,
    });
    const late = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.ok(
      !early.structurePairs.some((p) => p.kind === "LOW" && p.structure === "HL")
    );
    const earlyC3 = early.protected.protectedLows.filter((c) =>
      c.selectionReasonCodes.includes("C3_STRUCTURE_LABEL")
    );
    const lateC3 = late.protected.protectedLows.filter((c) =>
      c.selectionReasonCodes.includes("C3_STRUCTURE_LABEL")
    );
    assert.equal(earlyC3.length, 0);
    assert.ok(lateC3.length >= 1);
    assert.ok(late.structurePairs.some((p) => p.kind === "LOW" && p.structure === "HL"));
  });

  it("D. LH/LL bearish symmetry for C3 high side", () => {
    const candles = bearishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.ok(snap.protected.protectedHighs.length >= 1);
    assert.equal(snap.protected.protectedLows.length, 0);
  });

  it("E. internal swing may appear in candidates with INTERNAL scope", () => {
    const candles = bullishProtectedLadder();
    applySyntheticPivots(candles, [[22, "HIGH", 115]]);
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const internalAnn = snap.zigzag.internalStructure;
    if (internalAnn.length > 0) {
      const internalPivot = internalAnn[0].pivotIndex;
      const match = snap.protected.protectedLows.find((c) => c.pivotIndex === internalPivot);
      if (match) {
        assert.equal(match.scope, "INTERNAL");
      }
    }
    assert.ok(snap.protected.limitations.includes("protected_not_equal_hh_hl"));
  });

  it("F. external spine reported as C5 candidate (not as canonical protected)", () => {
    const candles = bullishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const c5 = snap.protected.protectedLows.filter((c) =>
      c.selectionReasonCodes.includes("C5_EXTERNAL_SPINE")
    );
    assert.ok(c5.length >= 1);
    assert.ok(c5.every((c) => c.scope === "EXTERNAL"));
  });

  it("G. multiple candidates at same E — no silent collapse to one", () => {
    const candles = bullishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.ok(snap.protected.protectedLows.length >= 2);
    const distinctPivots = new Set(snap.protected.protectedLows.map((c) => c.pivotIndex));
    assert.ok(distinctPivots.size >= 2);
  });

  it("H. multiple candidates → UNRESOLVED reason, no tie-break", () => {
    const candles = bullishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.ok(
      snap.protected.unresolved.some(
        (u) => u.code === "MULTIPLE_PROTECTED_LOW_CANDIDATES_NO_SINGLE_SELECTION"
      )
    );
  });

  it("I. confirmation lag pivot 10 / rightBars 5 — E=14 vs E=15", () => {
    const candles = latencyPivotSeries();
    const snap14 = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 14,
      swingConfig: DEFAULT_SWING,
    });
    const snap15 = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 15,
      swingConfig: DEFAULT_SWING,
    });
    assert.ok(!snap14.confirmedSwings.some((s) => s.index === 10));
    assert.ok(snap15.confirmedSwings.some((s) => s.index === 10));
    for (const c of snap14.protected.protectedLows) {
      assert.ok(c.protectedStatusKnownAtBarIndex <= 14);
    }
    for (const c of snap15.protected.protectedHighs) {
      assert.ok(c.protectedStatusKnownAtBarIndex <= 15);
    }
  });

  it("J. every candidate protectedStatusKnownAtBarIndex <= E", () => {
    const candles = bullishProtectedLadder();
    const E = 40;
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    for (const c of [...snap.protected.protectedLows, ...snap.protected.protectedHighs]) {
      assert.ok(c.protectedStatusKnownAtBarIndex <= E);
      assert.ok(c.sourceSwingConfirmationBarIndex <= E);
    }
  });

  it("K. future bars at E+1 do not change E snapshot protected output", () => {
    const candles = bullishProtectedLadder();
    const E = 35;
    const atE = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const extended = deepCloneCandles(candles);
    for (let i = E + 1; i < extended.length; i++) {
      extended[i].low = 50;
      extended[i].high = 200;
      extended[i].close = 125;
    }
    const atEAgain = buildMarketStructureSnapshotAtBar({
      candles: extended,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(atE.protected, atEAgain.protected);
  });

  it("L. future spike invisible at E (MSL-2 parity)", () => {
    const candles = bullishProtectedLadder();
    const E = 30;
    const atE = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const extended = deepCloneCandles(candles);
    for (let i = E + 1; i < extended.length; i++) {
      extended[i].high = 50_000;
      extended[i].low = 40_000;
    }
    const atEExtended = buildMarketStructureSnapshotAtBar({
      candles: extended,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(atE.protected, atEExtended.protected);
  });

  it("M. same input deepEqual determinism", () => {
    const candles = bullishProtectedLadder();
    const a = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const b = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(a.protected, b.protected);
  });

  it("N. repeated invocation parity", () => {
    const candles = bearishProtectedLadder();
    const results = Array.from({ length: 5 }, () =>
      buildMarketStructureSnapshotAtBar({
        candles,
        evaluationBarIndex: 40,
        swingConfig: SMALL_SWING,
      }).protected
    );
    for (let i = 1; i < results.length; i++) {
      assert.deepEqual(results[0], results[i]);
    }
  });

  it("O. frozen BTC checksum and E=500 deterministic protected", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
    const path = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const doc = JSON.parse(readFileSync(path, "utf8")) as { metadata: { datasetChecksum: string } };
    assert.equal(doc.metadata.datasetChecksum, checksum);

    const E = 500;
    const a = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    const b = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    assert.deepEqual(a.protected, b.protected);
    assert.equal(a.protected.ruleId, MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID);
  });

  it("C6 structure pair from candidate on bullish ladder", () => {
    const candles = bullishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const c6 = snap.protected.protectedLows.filter((c) =>
      c.selectionReasonCodes.includes("C6_STRUCTURE_PAIR_FROM")
    );
    assert.ok(c6.length >= 1);
    const hlPair = snap.structurePairs.find((p) => p.kind === "LOW" && p.structure === "HL");
    if (hlPair) {
      assert.ok(c6.some((c) => c.pivotIndex === hlPair.fromIndex));
    }
  });

  it("NEUTRAL trend — no side candidates, unresolved TREND_NEUTRAL", () => {
    const candles = flatCandles(20, 100);
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 19,
      swingConfig: SMALL_SWING,
    });
    assert.equal(detectTrend([...snap.confirmedSwings]), "NEUTRAL");
    assert.equal(snap.protected.protectedLows.length, 0);
    assert.equal(snap.protected.protectedHighs.length, 0);
    assert.ok(snap.protected.unresolved.some((u) => u.code === "TREND_NEUTRAL"));
  });

  it("buildMarketStructureProtectedContext consumes snapshot without re-detecting swings", () => {
    const candles = bullishProtectedLadder();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    const core = snapshotCoreWithoutProtected(snap);
    const ctx = buildMarketStructureProtectedContext({ snapshot: core });
    assert.deepEqual(ctx, snap.protected);
  });

  it("schema version 1.4 and limitations on protected context", () => {
    const snap = buildMarketStructureSnapshotAtBar({
      candles: bullishProtectedLadder(),
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.equal(snap.schemaVersion, MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.schemaVersion, "1.4");
    assert.ok(snap.protected.limitations.includes("protected_rule_is_research_only"));
    assert.ok(snap.protected.limitations.includes("no_future_data_for_status"));
    assert.ok(snap.protected.limitations.includes("multiple_candidates_may_remain_unresolved"));
  });

  it("input candles immutable — snapshot build does not mutate", () => {
    const candles = bullishProtectedLadder();
    const clone = deepCloneCandles(candles);
    buildMarketStructureSnapshotAtBar({
      candles: clone,
      evaluationBarIndex: 40,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(candles, clone);
  });

  it("architecture — protected module has no fetch/evaluator/scanner", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-protected.ts"),
      "utf8"
    );
    assert.ok(mod.includes("MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_V1"));
    assert.ok(!mod.includes("detectSwings"));
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });
});
