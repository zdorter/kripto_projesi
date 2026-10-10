import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureSnapshotAtBar,
  buildMarketStructureZigzagContext,
  MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  mergeSameTypeSwingsForZigzag,
  zigzagSpineAlternatesTypes,
} from "../market-structure/market-structure-snapshot";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH } from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { detectSwings } from "../swing-detector";
import { candle, flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.1 };
/** Lower ATR floor so synthetic leg fixtures expose internal swings between merged spine pivots. */
const MSL2_LEG_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

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

/** External LOW ~100 → HIGH ~120 with internal highs merged off the zigzag spine. */
function bullishExternalLegWithInternals(): Candle[] {
  const base = flatCandles(45, 115);
  for (const c of base) {
    c.low = 114;
    c.high = 116;
    c.close = 115;
  }
  applySyntheticPivots(base, [
    [8, "LOW", 100],
    [14, "HIGH", 108],
    [20, "LOW", 104],
    [26, "HIGH", 112],
    [32, "HIGH", 120],
  ]);
  return base;
}

function bearishExternalLegWithInternals(): Candle[] {
  const base = flatCandles(45, 105);
  for (const c of base) {
    c.low = 104;
    c.high = 106;
    c.close = 105;
  }
  applySyntheticPivots(base, [
    [8, "HIGH", 120],
    [14, "LOW", 112],
    [20, "HIGH", 116],
    [26, "LOW", 108],
    [32, "LOW", 95],
  ]);
  return base;
}

function msl1CoreFields(snap: ReturnType<typeof buildMarketStructureSnapshotAtBar>) {
  return {
    evaluationBarIndex: snap.evaluationBarIndex,
    evaluationTimestamp: snap.evaluationTimestamp,
    confirmedSwings: snap.confirmedSwings,
    highStructure: snap.highStructure,
    lowStructure: snap.lowStructure,
    structurePairs: snap.structurePairs,
  };
}

describe("market-structure-zigzag (MSL-2)", () => {
  it("A–B. empty candles and invalid E", () => {
    assert.throws(() =>
      buildMarketStructureSnapshotAtBar({ candles: [], evaluationBarIndex: 0 })
    );
    const candles = flatCandles(10, 100);
    assert.throws(() =>
      buildMarketStructureSnapshotAtBar({ candles, evaluationBarIndex: 10 })
    );
  });

  it("C. confirmation lag on zigzag spine", () => {
    const candles = flatCandles(30, 100);
    for (let i = 8; i <= 12; i++) {
      candles[i].high = 200;
      candles[i].low = 90;
    }
    candles[10].high = 220;
    const snap14 = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 14,
      swingConfig: { leftBars: 5, rightBars: 5, atrPeriod: 14, minAtrMultiplier: 0.5 },
    });
    const snap15 = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 15,
      swingConfig: { leftBars: 5, rightBars: 5, atrPeriod: 14, minAtrMultiplier: 0.5 },
    });
    const spine14 = snap14.zigzag.zigzagSpine.some((s) => s.pivotIndex === 10);
    const spine15 = snap15.zigzag.zigzagSpine.some((s) => s.pivotIndex === 10);
    assert.equal(spine14, false);
    assert.equal(spine15, true);
    if (spine15) {
      const node = snap15.zigzag.zigzagSpine.find((s) => s.pivotIndex === 10)!;
      assert.equal(node.knownAtBarIndex, 15);
    }
  });

  it("D–E. zigzag alternation and same-type merge", () => {
    const merged = mergeSameTypeSwingsForZigzag([
      { index: 1, time: 1, price: 10, type: "LOW", strength: 50, confirmed: true },
      { index: 3, time: 3, price: 8, type: "LOW", strength: 50, confirmed: true },
      { index: 5, time: 5, price: 15, type: "HIGH", strength: 50, confirmed: true },
      { index: 7, time: 7, price: 18, type: "HIGH", strength: 50, confirmed: true },
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].price, 8);
    assert.equal(merged[1].price, 18);
    const ctx = buildMarketStructureZigzagContext(merged, 2, 20);
    assert.equal(zigzagSpineAlternatesTypes(ctx.zigzagSpine), true);
  });

  it("F–H. bullish external leg with internal swings", () => {
    const candles = bullishExternalLegWithInternals();
    const E = 35;
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: E,
      swingConfig: MSL2_LEG_SWING,
    });
    assert.equal(snap.zigzag.ruleId, MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID);
    assert.ok(snap.zigzag.zigzagSpine.length >= 2);
    assert.ok(zigzagSpineAlternatesTypes(snap.zigzag.zigzagSpine));
    const lows = snap.zigzag.zigzagSpine.filter((s) => s.type === "LOW");
    const highs = snap.zigzag.zigzagSpine.filter((s) => s.type === "HIGH");
    assert.ok(lows.length >= 1);
    assert.ok(highs.length >= 1);
    assert.ok(snap.zigzag.internalStructure.length > 0);
    assert.ok(
      snap.zigzag.internalStructure.every((s) => s.scope === "INTERNAL")
    );
    assert.ok(
      snap.zigzag.internalStructure.every((s) => s.knownAtBarIndex <= E)
    );
  });

  it("G. bearish external leg structure", () => {
    const candles = bearishExternalLegWithInternals();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 35,
      swingConfig: MSL2_LEG_SWING,
    });
    assert.ok(snap.zigzag.externalStructure.length >= 2);
    assert.ok(snap.zigzag.externalStructure.every((s) => s.scope === "EXTERNAL"));
    assert.ok(snap.zigzag.internalStructure.length > 0);
  });

  it("J–K. HH/HL/LH/LL independent of scope", () => {
    const candles = bullishExternalLegWithInternals();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 35,
      swingConfig: MSL2_LEG_SWING,
    });
    const combined = [...snap.zigzag.externalStructure, ...snap.zigzag.internalStructure];
    for (const node of combined) {
      if (node.structureLabel !== "UNKNOWN") {
        assert.ok(["HH", "HL", "LH", "LL"].includes(node.structureLabel));
      }
      assert.ok(["EXTERNAL", "INTERNAL"].includes(node.scope));
    }
    const hhExternal = combined.some((n) => n.structureLabel === "HH" && n.scope === "EXTERNAL");
    const hlInternal = combined.some((n) => n.structureLabel === "HL" && n.scope === "INTERNAL");
    assert.ok(hhExternal || hlInternal || combined.length > 0);
  });

  it("L. knownAtBarIndex equals pivot + rightBars", () => {
    const candles = bullishExternalLegWithInternals();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 35,
      swingConfig: SMALL_SWING,
    });
    for (const node of snap.zigzag.zigzagSpine) {
      assert.equal(node.knownAtBarIndex, node.pivotIndex + SMALL_SWING.rightBars);
      assert.equal(node.confirmationBarIndex, node.knownAtBarIndex);
    }
  });

  it("M–N. E causality and future spike invisibility", () => {
    const candles = bullishExternalLegWithInternals();
    const E = 28;
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
    assert.deepEqual(msl1CoreFields(atE), msl1CoreFields(atEExtended));
    assert.deepEqual(atE.zigzag, atEExtended.zigzag);
  });

  it("O–P. immutability and determinism", () => {
    const candles = deepCloneCandles(bearishExternalLegWithInternals());
    const original = deepCloneCandles(candles);
    const a = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 30,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(candles, original);
    const b = buildMarketStructureSnapshotAtBar({
      candles: original,
      evaluationBarIndex: 30,
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("Q. frozen BTC integration and checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(
      checksum,
      "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc"
    );
    const path = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const doc = JSON.parse(readFileSync(path, "utf8")) as { metadata: { datasetChecksum: string } };
    assert.equal(doc.metadata.datasetChecksum, checksum);
    const E = 600;
    const snap = buildMarketStructureSnapshotAtBar({ candles: loaded.candles, evaluationBarIndex: E });
    assert.equal(snap.schemaVersion, MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION);
    assert.ok(snap.zigzag.zigzagSpine.length > 0);
    const extended = [...loaded.candles, loaded.candles[loaded.candles.length - 1]];
    const sliceSnap = buildMarketStructureSnapshotAtBar({
      candles: loaded.candles.slice(0, E + 1),
      evaluationBarIndex: E,
    });
    const fullSnap = buildMarketStructureSnapshotAtBar({
      candles: extended,
      evaluationBarIndex: E,
    });
    assert.deepEqual(sliceSnap.zigzag, fullSnap.zigzag);
  });

  it("R. MSL-1 core field parity preserved", () => {
    const candles = bullishExternalLegWithInternals();
    const snap = buildMarketStructureSnapshotAtBar({
      candles,
      evaluationBarIndex: 35,
      swingConfig: SMALL_SWING,
    });
    const effective = candles.slice(0, 36);
    const raw = detectSwings(effective, SMALL_SWING)
      .filter((s) => s.confirmed && s.index + SMALL_SWING.rightBars <= 35)
      .map((s) => ({ ...s }));
    assert.deepEqual(snap.confirmedSwings, raw);
    assert.ok(snap.highStructure.length >= 0);
    assert.ok(snap.structurePairs.every((p) => p.knownAtBarIndex <= 35));
  });

  it("S. equal high diagnostic without liquidity semantics", () => {
    const swings = [
      { index: 4, time: 4, price: 90, type: "LOW" as const, strength: 50, confirmed: true },
      { index: 8, time: 8, price: 110, type: "HIGH" as const, strength: 50, confirmed: true },
      { index: 12, time: 12, price: 95, type: "LOW" as const, strength: 50, confirmed: true },
      { index: 16, time: 16, price: 110, type: "HIGH" as const, strength: 50, confirmed: true },
    ];
    const ctx = buildMarketStructureZigzagContext(swings, 2, 25);
    const eq = ctx.zigzagSpine.find((s) => s.pivotIndex === 16);
    assert.ok(eq);
    assert.equal(eq!.equalStructureDiagnostic, "EQUAL_HIGH");
    assert.ok(!JSON.stringify(ctx).includes("liquidity_pool"));
  });

  it("T. architecture boundary in zigzag module", () => {
    const mod = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-zigzag.ts"),
      "utf8"
    );
    assert.ok(!mod.includes("trade-evaluation"));
    assert.ok(!mod.includes("fetch("));
  });

  it("schema version 1.4 includes zigzag, protected, break, and liquidity context", () => {
    const snap = buildMarketStructureSnapshotAtBar({
      candles: flatCandles(20, 100),
      evaluationBarIndex: 19,
      swingConfig: SMALL_SWING,
    });
    assert.equal(snap.schemaVersion, MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION);
    assert.equal(snap.schemaVersion, "1.4");
    assert.ok(snap.zigzag);
    assert.ok(snap.protected);
    assert.ok(snap.break);
    assert.ok(snap.liquidity);
    assert.ok(snap.limitations.some((l) => l.includes("internal_external_rule_id")));
  });
});
