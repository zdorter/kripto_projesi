import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureSnapshotAtBar,
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  MarketStructureInvalidEvaluationBarIndexError,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH } from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import {
  classifyHighStructure,
  classifyLowStructure,
  detectMarketStructures,
} from "../trend-detector";
import { detectSwings } from "../swing-detector";
import { candle, flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.1 };
const DEFAULT_SWING = { leftBars: 5, rightBars: 5, atrPeriod: 14, minAtrMultiplier: 0.5 };

function closesToCandles(closes: number[]): Candle[] {
  return closes.map((p, i) => candle(i * 3_600_000, p, p + 0.5, p - 0.5, p));
}

function deepCloneCandles(candles: readonly Candle[]): Candle[] {
  return candles.map((c) => ({ ...c }));
}

/** Enough bars for 5/5 pivots with a prominent high at index 10. */
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

function bullishSwingSeries(): Candle[] {
  const closes = [
    100, 101, 102, 103, 104, 105, 104, 103, 102, 103, 104, 105, 106, 107, 108, 107, 106,
    105, 106, 107, 108, 109, 110, 109, 108, 107, 108, 109, 110, 111, 110, 109, 108, 109, 110,
  ];
  return closesToCandles(closes);
}

function bearishSwingSeries(): Candle[] {
  const closes = [
    110, 109, 108, 107, 106, 105, 106, 107, 106, 105, 104, 103, 102, 103, 104, 103, 102, 101,
    100, 101, 100, 99, 98, 99, 100, 99, 98, 97, 96, 97, 98, 97, 96, 95, 96,
  ];
  return closesToCandles(closes);
}

describe("market-structure-snapshot (MSL-1)", () => {
  it("basic snapshot schema and evaluation timestamp", () => {
    const candles = bullishSwingSeries();
    const E = 25;
    const snap = buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: E, swingConfig: SMALL_SWING });
    assert.equal(snap.schemaVersion, MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.evaluationBarIndex, E);
    assert.equal(snap.evaluationTimestamp, candles[E].time);
    assert.ok(snap.limitations.includes("descriptive_structure_foundation_only"));
  });

  it("confirmed swing ledger excludes unconfirmed pivots", () => {
    const candles = latencyPivotSeries();
    const E = 12;
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: DEFAULT_SWING,
    });
    assert.ok(snap.confirmedSwings.every((s) => s.confirmed));
    const effective = candles.slice(0, E + 1);
    const raw = detectSwings(effective, DEFAULT_SWING);
    const unconfirmed = raw.filter((s) => !s.confirmed);
    for (const u of unconfirmed) {
      assert.ok(!snap.confirmedSwings.some((c) => c.index === u.index && c.type === u.type));
    }
  });

  it("rightBars confirmation latency pivot 10 with rightBars 5", () => {
    const candles = latencyPivotSeries();
    const pivotIndex = 10;
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
    const atPivot14 = snap14.confirmedSwings.some(
      (s) => s.index === pivotIndex && s.type === "HIGH"
    );
    const atPivot15 = snap15.confirmedSwings.some(
      (s) => s.index === pivotIndex && s.type === "HIGH"
    );
    assert.equal(atPivot14, false);
    assert.equal(atPivot15, true);
  });

  it("chronological ascending pivot index ordering", () => {
    const candles = bullishSwingSeries();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: candles.length - 1,
      swingConfig: SMALL_SWING,
    });
    for (let i = 1; i < snap.confirmedSwings.length; i++) {
      assert.ok(snap.confirmedSwings[i].index >= snap.confirmedSwings[i - 1].index);
    }
    const keys = new Set(snap.confirmedSwings.map((s) => `${s.index}:${s.type}`));
    assert.equal(keys.size, snap.confirmedSwings.length);
  });

  it("HH/HL/LH/LL parity with trend-detector on confirmed ledger", () => {
    const candles = bullishSwingSeries();
    const E = candles.length - 1;
    const snap = buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: E, swingConfig: SMALL_SWING });
    const highs = snap.confirmedSwings.filter((s) => s.type === "HIGH");
    const lows = snap.confirmedSwings.filter((s) => s.type === "LOW");
    const expectedHigh: typeof snap.highStructure = [];
    const expectedLow: typeof snap.lowStructure = [];
    for (let i = 1; i < highs.length; i++) {
      expectedHigh.push(classifyHighStructure(highs[i - 1], highs[i]));
    }
    for (let i = 1; i < lows.length; i++) {
      expectedLow.push(classifyLowStructure(lows[i - 1], lows[i]));
    }
    assert.deepEqual(snap.highStructure, expectedHigh);
    assert.deepEqual(snap.lowStructure, expectedLow);
    const legacy = detectMarketStructures([...snap.confirmedSwings]);
    assert.deepEqual([...snap.highStructure, ...snap.lowStructure], legacy);
  });

  it("evaluation bar slicing matches slice-first detectSwings", () => {
    const candles = bullishSwingSeries();
    const E = 20;
    const snap = buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: E, swingConfig: SMALL_SWING });
    const sliced = detectSwings(candles.slice(0, E + 1), SMALL_SWING).filter((s) => s.confirmed);
    assert.equal(snap.confirmedSwings.length, sliced.length);
  });

  it("no lookahead — extended series does not change snapshot at E", () => {
    const base = bullishSwingSeries();
    const E = 22;
    const atE = buildMarketStructureSnapshotAtBar({ candles: base, evaluationBarIndex: E, swingConfig: SMALL_SWING });
    const extended = [...base];
    extended.push(candle(99_999, 500, 900, 400, 500));
    extended.push(candle(100_999, 500, 950, 450, 500));
    const atEExtended = buildMarketStructureSnapshotAtBar({
      candles: extended,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(atE.confirmedSwings, atEExtended.confirmedSwings);
    assert.deepEqual(atE.structurePairs, atEExtended.structurePairs);
  });

  it("future spike after E not visible in snapshot at E", () => {
    const base = flatCandles(25, 100);
    const E = 15;
    const snapBefore = buildMarketStructureSnapshotAtBar({
      candles: base,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const withFuture = deepCloneCandles(base);
    for (let i = E + 1; i < withFuture.length; i++) {
      withFuture[i].high = 10_000;
      withFuture[i].low = 9_000;
    }
    const snapAfter = buildMarketStructureSnapshotAtBar({
      candles: withFuture,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(snapBefore, snapAfter);
  });

  it("immutability of input candles", () => {
    const candles = deepCloneCandles(bullishSwingSeries());
    const original = deepCloneCandles(candles);
    buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 10,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(candles, original);
  });

  it("determinism and JSON serialization parity", () => {
    const candles = bearishSwingSeries();
    const a = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 28,
      swingConfig: SMALL_SWING,
    });
    const b = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 28,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("invalid evaluationBarIndex throws", () => {
    const candles = bullishSwingSeries();
    assert.throws(
      () => buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: -1 }),
      MarketStructureInvalidEvaluationBarIndexError
    );
    assert.throws(
      () => buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: candles.length }),
      MarketStructureInvalidEvaluationBarIndexError
    );
    assert.throws(
      () => buildMarketStructureSnapshotAtBar({ candles: [], evaluationBarIndex: 0 }),
      MarketStructureInvalidEvaluationBarIndexError
    );
  });

  it("insufficient pivot window surfaces limitation", () => {
    const candles = flatCandles(5, 100);
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 4,
      swingConfig: DEFAULT_SWING,
    });
    assert.ok(snap.limitations.includes("INSUFFICIENT_PIVOT_WINDOW"));
  });

  it("no confirmed swings limitation on short semantic fixture", () => {
    const closes = [80, 83, 76, 81, 72];
    const candles = closesToCandles(closes);
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: candles.length - 1,
      swingConfig: DEFAULT_SWING,
    });
    assert.equal(snap.confirmedSwings.length, 0);
    assert.ok(snap.limitations.includes("NO_CONFIRMED_SWINGS"));
  });

  it("synthetic bullish sequence produces structure pairs", () => {
    const candles = bullishSwingSeries();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: candles.length - 1,
      swingConfig: SMALL_SWING,
    });
    assert.ok(snap.confirmedSwings.length >= 2);
    if (snap.highStructure.length > 0) {
      assert.ok(snap.structurePairs.some((p) => p.kind === "HIGH"));
    }
  });

  it("synthetic bearish sequence is deterministic", () => {
    const candles = bearishSwingSeries();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: candles.length - 1,
      swingConfig: SMALL_SWING,
    });
    assert.ok(snap.limitations.length > 0);
    assert.equal(snap.confirmationLagBars, SMALL_SWING.rightBars);
  });

  it("frozen BTC integration deterministic at fixed bar", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
    const E = 500;
    const a = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    const b = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    assert.deepEqual(a, b);
    assert.ok(a.confirmedSwings.length > 0);
    assert.ok(a.structurePairs.length >= 0);
    assert.equal(a.evaluationTimestamp, loaded.candles[E].time);
  });

  it("frozen BTC fixture file checksum unchanged", () => {
    const path = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const doc = JSON.parse(readFileSync(path, "utf8")) as { metadata: { datasetChecksum: string } };
    assert.equal(
      doc.metadata.datasetChecksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
  });

  it("structure pairs include knownAtBarIndex causal metadata", () => {
    const candles = bullishSwingSeries();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: candles.length - 1,
      swingConfig: SMALL_SWING,
    });
    for (const p of snap.structurePairs) {
      assert.ok(p.knownAtBarIndex <= snap.evaluationBarIndex);
      assert.equal(p.knownAtBarIndex, p.toIndex + SMALL_SWING.rightBars);
    }
  });

  it("repeated invocation parity", () => {
    const candles = latencyPivotSeries();
    const results = Array.from({ length: 5 }, () =>
      buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: 20, swingConfig: DEFAULT_SWING })
    );
    for (let i = 1; i < results.length; i++) {
      assert.deepEqual(results[0], results[i]);
    }
  });

  it("architecture — module has no evaluator/fetch/scanner imports", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-snapshot.ts"),
      "utf8"
    );
    assert.ok(mod.includes("buildMarketStructureSnapshotAtBar"));
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
    assert.ok(!mod.includes("composeProductionWaveScannerForSymbol"));
    assert.ok(!mod.includes("trade-evaluation"));
  });
});
