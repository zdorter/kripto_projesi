import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMslHistoricalEvidenceAtEvaluation,
  sortMslHistoricalEvidenceRecords,
  walkMslHistoricalEvidenceBatch,
} from "../msl-historical-evidence/msl-historical-evidence-batch";
import { assertNoForbiddenMslHistoricalEvidenceKeys } from "../msl-historical-evidence/msl-historical-evidence-forbidden";
import { computeMslHistoricalForwardObservations } from "../msl-historical-evidence/msl-historical-evidence-price";
import {
  extractStrictSnapshotAtE,
  filterStrictEventRefForTest,
  isStrictKnownAtBarIndex,
  passesStrictKnownAtGate,
} from "../msl-historical-evidence/msl-historical-evidence-strict";
import {
  MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1,
} from "../msl-historical-evidence/msl-historical-evidence-types";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import { flatCandles, candle } from "./test-helpers";
import type { Candle } from "../types";

const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const ONE_H = 3_600_000;
const DATASET = {
  datasetId: MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1,
  datasetChecksum: BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  symbol: "BTCUSDT",
  timeframe: "1H",
};

function buildAt(candles: readonly Candle[], E: number, H: number) {
  return buildMslHistoricalEvidenceAtEvaluation({
    candles,
    evaluationBarIndex: E,
    observationHorizonBars: H,
    swingConfig: SWING,
    ...DATASET,
  });
}

describe("msl-historical-evidence Phase A", () => {
  it("frozen BTC 1H checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
  });

  it("knownAt filtering — E+1 excluded, E included", () => {
    assert.equal(isStrictKnownAtBarIndex(10, 10), true);
    assert.equal(isStrictKnownAtBarIndex(11, 10), false);
    assert.equal(
      passesStrictKnownAtGate({
        knownAtBarIndex: 11,
        knownAtTimestamp: 11,
        evaluationBarIndex: 10,
        evaluationTimestamp: 10,
      }),
      false
    );
    assert.equal(
      filterStrictEventRefForTest(
        {
          eventFamily: "BOS",
          eventId: "x",
          eventDirection: "UP",
          knownAtBarIndex: 10,
          knownAtTimestamp: 10,
          triggerBarIndex: 10,
        },
        10,
        10
      ),
      true
    );
  });

  it("forward observation uses E+1..E+H only (sentinel)", () => {
    const candles = flatCandles(12, 100);
    for (let i = 0; i < candles.length; i++) {
      candles[i].time = i * ONE_H;
      candles[i].close = 100 + i;
      candles[i].high = candles[i].close + 1;
      candles[i].low = candles[i].close - 1;
    }
    const E = 5;
    const H = 4;
    candles[6].close = 999;
    candles[10].close = 888;

    const { forward } = computeMslHistoricalForwardObservations({
      candles,
      evaluationBarIndex: E,
      observationHorizonBars: H,
    });
    assert.equal(forward.effectiveHorizonBars, 4);
    assert.equal(forward.terminalBarOffset, 4);
    assert.ok(forward.forwardReturn !== null);
    assert.equal(candles[E + forward.terminalBarOffset!].close, candles[9].close);
    assert.notEqual(forward.forwardReturn, 888 / candles[E].close - 1);
  });

  it("insufficient horizon when E+H beyond last index", () => {
    const candles = flatCandles(10, 50);
    const records = buildAt(candles, 8, 8);
    assert.ok(records.every((r) => r.sampleStatus === "INSUFFICIENT_HORIZON"));
  });

  it("horizon H=4 vs H=8 window sizes", () => {
    const candles = flatCandles(40, 100);
    const E = 20;
    const r4 = buildAt(candles, E, 4)[0]!;
    const r8 = buildAt(candles, E, 8)[0]!;
    assert.equal(r4.forwardObservations.effectiveHorizonBars, 4);
    assert.equal(r8.forwardObservations.effectiveHorizonBars, 8);
  });

  it("deterministic output on frozen BTC tail slice", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const candles = loaded.candles.slice(loaded.candles.length - 200);
    const E = candles.length - 50;
    const a = buildAt(candles, E, 24);
    const b = buildAt(candles, E, 24);
    assert.deepEqual(a, b);
  });

  it("prefix invariance — strict events unchanged after append", () => {
    const base = flatCandles(45, 100);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    const E = 28;
    const before = extractStrictSnapshotAtE({
      candles: base,
      evaluationBarIndex: E,
      swingConfig: SWING,
    });
    const extended = [...base, candle(45 * ONE_H, 100, 200, 50, 150)];
    const after = extractStrictSnapshotAtE({
      candles: extended,
      evaluationBarIndex: E,
      swingConfig: SWING,
    });
    assert.deepEqual(after.strictEventRecords, before.strictEventRecords);
    assert.deepEqual(after.structureObservations, before.structureObservations);
  });

  it("future spike — strict state unchanged, forward return changes", () => {
    const base = flatCandles(35, 100);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    const E = 20;
    const H = 8;
    const recBefore = buildAt(base, E, H);
    const extended = base.map((c) => ({ ...c }));
    for (let i = E + 1; i < extended.length; i++) {
      extended[i] = { ...extended[i], high: 10_000, low: 9_000, close: 9_500 };
    }
    const recAfter = buildAt(extended, E, H);
    assert.deepEqual(
      recBefore.map((r) => ({
        eventId: r.eventId,
        eventFamily: r.eventFamily,
        knownAtBarIndex: r.knownAtBarIndex,
      })),
      recAfter.map((r) => ({
        eventId: r.eventId,
        eventFamily: r.eventFamily,
        knownAtBarIndex: r.knownAtBarIndex,
      }))
    );
    const obsBefore = recBefore.find((r) => r.measurementMode === "OBSERVATION_ONLY") ?? recBefore[0]!;
    const obsAfter = recAfter.find((r) => r.measurementMode === "OBSERVATION_ONLY") ?? recAfter[0]!;
    if (obsBefore.forwardObservations.forwardReturn !== null) {
      assert.notEqual(
        obsBefore.forwardObservations.forwardReturn,
        obsAfter.forwardObservations.forwardReturn
      );
    }
  });

  it("future spike via snapshot at E unchanged", () => {
    const base = flatCandles(30, 100);
    const E = 18;
    const s1 = buildMarketStructureSnapshotAtBar({
      candles: base,
      evaluationBarIndex: E,
      swingConfig: SWING,
    });
    const extended = base.map((c) => ({ ...c }));
    extended.push(candle(30, 100, 50_000, 50, 40_000));
    const s2 = buildMarketStructureSnapshotAtBar({
      candles: extended,
      evaluationBarIndex: E,
      swingConfig: SWING,
    });
    assert.deepEqual(s2.break.classifiedEvents, s1.break.classifiedEvents);
    assert.deepEqual(s2.confirmedSwings, s1.confirmedSwings);
  });

  it("zero strict events — single OBSERVATION_ONLY record, no fake eventId", () => {
    const candles = flatCandles(12, 100);
    const records = buildAt(candles, 5, 4);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.measurementMode, "OBSERVATION_ONLY");
    assert.equal(records[0]!.eventId, null);
    assert.equal(records[0]!.sampleStatus, "NO_EVENT");
  });

  it("overlapping events — separate records per eventId", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const candles = loaded.candles.slice(400, 1200);
    const E = 400;
    const records = buildAt(candles, E, 12);
    const strict = records.filter((r) => r.measurementMode === "STRICT_AT_E");
    const ids = strict.map((r) => r.eventId);
    assert.equal(ids.length, new Set(ids).size);
    if (strict.length > 1) {
      assert.notEqual(strict[0]!.forwardObservations.forwardReturn, undefined);
    }
  });

  it("forbidden field scan on serialized records", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const records = buildAt(loaded.candles.slice(400, 900), 200, 8);
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalEvidenceKeys(records));
  });

  it("batch walk sort order", () => {
    const candles = flatCandles(50, 100);
    const batch = walkMslHistoricalEvidenceBatch({
      candles,
      evaluationBarIndices: [30, 20],
      observationHorizonBars: [8, 4],
      swingConfig: SWING,
      ...DATASET,
    });
    const sorted = sortMslHistoricalEvidenceRecords(batch);
    assert.deepEqual(batch, sorted);
  });

  it("architecture — module files deny production imports", () => {
    const root = join(process.cwd(), "src/wave/msl-historical-evidence");
    for (const file of [
      "msl-historical-evidence-batch.ts",
      "msl-historical-evidence-strict.ts",
      "msl-historical-evidence-price.ts",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.ok(!src.includes("trade-evaluation"));
      assert.ok(!src.includes("production-wave-scanner"));
      assert.ok(!src.includes("historical-backtest"));
      assert.ok(!src.includes("detectSwings"));
      assert.ok(!src.includes("fetch("));
    }
  });
});
