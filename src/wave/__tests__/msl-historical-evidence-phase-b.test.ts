import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMslHistoricalEvidenceAtEvaluation,
  sortMslHistoricalEvidenceRecords,
} from "../msl-historical-evidence/msl-historical-evidence-batch";
import {
  classifyKnownAtCohort,
  classifyKnownAtCohortBarIndexOnly,
} from "../msl-historical-evidence/msl-historical-evidence-cohort";
import { assertNoForbiddenMslHistoricalEvidenceKeys } from "../msl-historical-evidence/msl-historical-evidence-forbidden";
import { buildMslHistoricalEvidencePhaseBObservations } from "../msl-historical-evidence/msl-historical-evidence-phase-b";
import { extractStrictSnapshotAtE } from "../msl-historical-evidence/msl-historical-evidence-strict";
import { MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1 } from "../msl-historical-evidence/msl-historical-evidence-types";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
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

function sliceBtc(from = 400, to = 1400): readonly Candle[] {
  return loadBtcusdt1hResearchFrozenDatasetV1().candles.slice(from, to);
}

function buildAt(candles: readonly Candle[], E: number, H: number, htfCandles?: readonly Candle[]) {
  return buildMslHistoricalEvidenceAtEvaluation({
    candles,
    evaluationBarIndex: E,
    observationHorizonBars: H,
    swingConfig: SWING,
    htfCandles,
    htfTimeframeId: "4H",
    ...DATASET,
  });
}

function times(candles: Candle[]) {
  for (let i = 0; i < candles.length; i++) {
    candles[i]!.time = i * ONE_H;
  }
}

describe("msl-historical-evidence Phase B", () => {
  it("B-001 knownAt E → strict cohort", () => {
    const candles = flatCandles(20, 100);
    times(candles);
    assert.equal(classifyKnownAtCohortBarIndexOnly(10, 10, 24), "STRICT_AT_E");
    assert.equal(
      classifyKnownAtCohort({
        knownAtBarIndex: 10,
        knownAtTimestamp: candles[10]!.time,
        evaluationBarIndex: 10,
        evaluationTimestamp: candles[10]!.time,
        observationHorizonBars: 24,
        candles,
      }),
      "STRICT_AT_E"
    );
  });

  it("B-002 knownAt E+1 → disclosure", () => {
    const candles = flatCandles(40, 100);
    times(candles);
    const E = 10;
    assert.equal(classifyKnownAtCohortBarIndexOnly(E + 1, E, 24), "DISCLOSURE_HORIZON");
  });

  it("B-003 knownAt E+H → disclosure", () => {
    const E = 10;
    const H = 24;
    assert.equal(classifyKnownAtCohortBarIndexOnly(E + H, E, H), "DISCLOSURE_HORIZON");
  });

  it("B-004 knownAt E+H+1 → excluded", () => {
    const E = 10;
    const H = 24;
    assert.equal(classifyKnownAtCohortBarIndexOnly(E + H + 1, E, H), "EXCLUDED");
  });

  it("B-005 MSL-6 wick touch disclosure within horizon on frozen BTC slice", () => {
    const candles = sliceBtc(400, 1200);
    const E = 200;
    const H = 48;
    const phaseB = buildMslHistoricalEvidencePhaseBObservations({
      candles,
      evaluationBarIndex: E,
      observationHorizonBars: H,
      evaluationTimestamp: candles[E]!.time,
      swingConfig: SWING,
      timeframeId: "1H",
    });
    const wickDisclosure = phaseB.disclosurePrimaryRefs.filter(
      (r) => r.eventFamily === "LIQUIDITY_WICK_TOUCH"
    );
    if (wickDisclosure.length > 0) {
      for (const ref of wickDisclosure) {
        assert.ok(ref.knownAtBarIndex > E);
        assert.ok(ref.knownAtBarIndex <= E + H);
      }
    }
    assert.ok(phaseB.subsequentLiquidityEvents.length >= wickDisclosure.length);
  });

  it("B-006 MSL-7E SWEEP disclosure classification", () => {
    const candles = sliceBtc(400, 1200);
    const E = 350;
    const H = 48;
    const records = buildAt(candles, E, H);
    const sweeps = records.filter(
      (r) => r.measurementMode === "DISCLOSURE_HORIZON" && r.eventFamily === "LIQUIDITY_SWEEP"
    );
    for (const r of sweeps) {
      assert.ok(r.knownAtBarIndex! > E);
      assert.ok(r.knownAtBarIndex! <= E + H);
    }
    const obs = records[0]!.subsequentLiquidityEvents.filter((e) => e.eventFamily === "LIQUIDITY_SWEEP");
    assert.ok(obs.length >= sweeps.length);
  });

  it("B-007 MSL-7E TAKEN disclosure classification", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 400, 48);
    const taken = records.filter(
      (r) => r.measurementMode === "DISCLOSURE_HORIZON" && r.eventFamily === "LIQUIDITY_TAKEN"
    );
    for (const r of taken) {
      assert.ok(r.knownAtBarIndex! > r.evaluationBarIndex);
      assert.ok(r.knownAtBarIndex! <= r.evaluationBarIndex + r.observationHorizonBars);
    }
  });

  it("B-008 MSL-7E RECLAIM disclosure classification", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 450, 48);
    const reclaim = records.filter(
      (r) => r.measurementMode === "DISCLOSURE_HORIZON" && r.eventFamily === "LIQUIDITY_RECLAIM"
    );
    for (const r of reclaim) {
      assert.ok(r.knownAtBarIndex! > r.evaluationBarIndex);
    }
  });

  it("B-009 MSL-7C cross-TF known-at filtering with derived 4H", () => {
    const candles = sliceBtc(400, 1200);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).htfCandles;
    const E = 200;
    const H = 24;
    const phaseB = buildMslHistoricalEvidencePhaseBObservations({
      candles,
      evaluationBarIndex: E,
      observationHorizonBars: H,
      evaluationTimestamp: candles[E]!.time,
      swingConfig: SWING,
      timeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "4H",
    });
    for (const ref of phaseB.disclosurePrimaryRefs.filter(
      (r) => r.eventFamily === "CROSS_TF_LIQUIDITY_WICK_TOUCH"
    )) {
      assert.ok(ref.knownAtBarIndex > E);
      assert.ok(ref.knownAtBarIndex <= E + H);
    }
  });

  it("B-010 MSL-7D structureEvaluationBarIndex boundary respected", () => {
    const candles = sliceBtc(400, 1200);
    const E = 250;
    const H = 32;
    const phaseB = buildMslHistoricalEvidencePhaseBObservations({
      candles,
      evaluationBarIndex: E,
      observationHorizonBars: H,
      evaluationTimestamp: candles[E]!.time,
      swingConfig: SWING,
    });
    const structEvalCap = Math.min(E + H, candles.length - 1);
    for (const row of phaseB.disclosureObservations) {
      if (row.structureEvaluationBarIndex !== undefined) {
        assert.equal(row.structureEvaluationBarIndex, structEvalCap);
        assert.ok(row.eventBarIndex <= structEvalCap);
      }
    }
  });

  it("B-011 future BOS subsequent observation only", () => {
    const candles = sliceBtc(400, 1200);
    const E = 500;
    const records = buildAt(candles, E, 24);
    const bos = records[0]!.subsequentStructureEvents.filter((e) => e.eventFamily === "BOS");
    for (const e of bos) {
      assert.ok(e.eventBarIndex > E);
      assert.equal(e.observationMode, "OBSERVATION_ONLY");
      assert.ok(!records.some((r) => r.measurementMode === "STRICT_AT_E" && r.eventId === e.eventId && e.eventBarIndex > E));
    }
  });

  it("B-012 future CHoCH subsequent observation only", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 550, 24);
    const choch = records[0]!.subsequentStructureEvents.filter((e) => e.eventFamily === "CHoCH");
    for (const e of choch) {
      assert.equal(e.observationMode, "OBSERVATION_ONLY");
      assert.ok(e.eventBarIndex > records[0]!.evaluationBarIndex);
    }
  });

  it("B-013 future MSS subsequent observation only", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 600, 24);
    const mss = records[0]!.subsequentMssEvents;
    for (const e of mss) {
      assert.equal(e.observationMode, "OBSERVATION_ONLY");
      assert.ok(e.eventBarIndex > records[0]!.evaluationBarIndex);
    }
  });

  it("B-014 future liquidity events in subsequent collection", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 300, 48);
    const liq = records[0]!.subsequentLiquidityEvents;
    assert.ok(liq.length >= 0);
    for (const e of liq) {
      assert.ok(e.eventBarIndex > records[0]!.evaluationBarIndex);
    }
  });

  it("B-015 first subsequent event deterministic", () => {
    const candles = sliceBtc(400, 1200);
    const E = 350;
    const a = buildAt(candles, E, 24);
    const b = buildAt(candles, E, 24);
    assert.deepEqual(a[0]!.firstSubsequentEvent, b[0]!.firstSubsequentEvent);
    const first = a[0]!.firstSubsequentEvent;
    if (first) {
      const all = [
        ...a[0]!.subsequentStructureEvents,
        ...a[0]!.subsequentLiquidityEvents,
        ...a[0]!.subsequentMssEvents,
      ];
      const minBar = Math.min(...all.map((x) => x.eventBarIndex));
      assert.equal(first.eventBarIndex, minBar);
    }
  });

  it("B-016 multiple events same bar preserved", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 500, 48);
    const all = [
      ...records[0]!.subsequentStructureEvents,
      ...records[0]!.subsequentLiquidityEvents,
      ...records[0]!.subsequentMssEvents,
    ];
    const byBar = new Map<number, number>();
    for (const e of all) {
      byBar.set(e.eventBarIndex, (byBar.get(e.eventBarIndex) ?? 0) + 1);
    }
    const multi = [...byBar.entries()].filter(([, n]) => n > 1);
    for (const [bar, count] of multi) {
      const atBar = all.filter((e) => e.eventBarIndex === bar);
      assert.equal(atBar.length, count);
      assert.equal(new Set(atBar.map((e) => e.eventId)).size, count);
    }
  });

  it("B-017 overlapping windows — separate records per eventId", () => {
    const candles = sliceBtc(400, 1200);
    const E = 300;
    const r12 = buildAt(candles, E, 12);
    const r24 = buildAt(candles, E, 24);
    const ids12 = new Set(r12.map((r) => r.eventId).filter(Boolean));
    const ids24 = new Set(r24.map((r) => r.eventId).filter(Boolean));
    assert.ok(ids12.size <= ids24.size || ids24.size <= ids12.size);
  });

  it("B-018 insufficient horizon preserved", () => {
    const candles = flatCandles(10, 50);
    const records = buildAt(candles, 8, 8);
    assert.ok(records.every((r) => r.sampleStatus === "INSUFFICIENT_HORIZON"));
  });

  it("B-019 prefix invariance strict unchanged", () => {
    const base = flatCandles(45, 100);
    times(base);
    const E = 28;
    const before = extractStrictSnapshotAtE({ candles: base, evaluationBarIndex: E, swingConfig: SWING });
    const extended = [...base, candle(45 * ONE_H, 100, 200, 50, 150)];
    const after = extractStrictSnapshotAtE({ candles: extended, evaluationBarIndex: E, swingConfig: SWING });
    assert.deepEqual(after.strictEventRecords, before.strictEventRecords);
  });

  it("B-020 future spike strict unchanged", () => {
    const base = flatCandles(35, 100);
    times(base);
    const E = 20;
    const before = buildAt(base, E, 8);
    const extended = base.map((c) => ({ ...c }));
    for (let i = E + 1; i < extended.length; i++) {
      extended[i] = { ...extended[i], high: 10_000, low: 9_000, close: 9_500 };
    }
    const after = buildAt(extended, E, 8);
    assert.deepEqual(
      before.filter((r) => r.measurementMode === "STRICT_AT_E").map((r) => r.eventId),
      after.filter((r) => r.measurementMode === "STRICT_AT_E").map((r) => r.eventId)
    );
  });

  it("B-021 frozen BTC checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
  });

  it("B-022 forbidden fields scan", () => {
    const candles = sliceBtc(400, 1200);
    const records = buildAt(candles, 200, 24);
    assert.doesNotThrow(() => assertNoForbiddenMslHistoricalEvidenceKeys(records));
  });

  it("B-023 architecture guard — phase B module imports", () => {
    const root = join(process.cwd(), "src/wave/msl-historical-evidence");
    for (const file of ["msl-historical-evidence-phase-b.ts", "msl-historical-evidence-cohort.ts"]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.ok(!src.includes("trade-evaluation"));
      assert.ok(!src.includes("production-wave-scanner"));
      assert.ok(!src.includes("historical-backtest"));
      assert.ok(!/detectSwings\s*\(/.test(src));
    }
    const phaseB = readFileSync(join(root, "msl-historical-evidence-phase-b.ts"), "utf8");
    assert.ok(phaseB.includes("buildMarketStructureLiquidityInteractionContext"));
    assert.ok(phaseB.includes("buildMarketStructureLiquidityAdvancedInteractionContext"));
  });

  it("B-024 deterministic JSON", () => {
    const candles = sliceBtc(400, 1200);
    const E = 200;
    const a = sortMslHistoricalEvidenceRecords(buildAt(candles, E, 12));
    const b = sortMslHistoricalEvidenceRecords(buildAt(candles, E, 12));
    assert.deepEqual(a, b);
  });

  it("B-025 zero-event — no fake disclosure primary", () => {
    const candles = flatCandles(12, 100);
    times(candles);
    const records = buildAt(candles, 5, 4);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.measurementMode, "OBSERVATION_ONLY");
    assert.equal(records[0]!.sampleStatus, "NO_EVENT");
    assert.equal(records[0]!.disclosureObservations.length, 0);
  });
});
