import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alignNativeHtfCandlesToDerivedCompleteBuckets,
  BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES,
  BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS,
  buildNativeHtfParityReport,
  buildNativeHtfSemanticParityReport,
  filterNative4hClosedForParity,
  maxVolumeDecimalPlacesObserved,
  resolveHtfEvaluationBarIndex,
  sumVolumesAtDecimalPrecision,
  utc4hBucketOpen,
  validateNative4hForParity,
} from "../market-structure/native-htf-parity";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
import { buildMarketStructureMtfAlignmentContext } from "../market-structure/market-structure-mtf-alignment";
import { barCloseTimestamp } from "../market-structure/market-structure-bar-timestamp";
import {
  loadBtcusdt1hResearchFrozenDatasetV1,
  loadBtcusdt4hNativeResearchFrozenDatasetV1,
} from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const FOUR_H = 4 * ONE_H;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, o: number, h: number, l: number, cl: number, v = 1): Candle {
  return { time, open: o, high: h, low: l, close: cl, volume: v };
}

function hourSeries(startTime: number, count: number, price = 100): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    c(startTime + i * ONE_H, price, price + 2, price - 2, price + 1, 10 + i)
  );
}

function btcParityInput() {
  const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
  const native = loadBtcusdt4hNativeResearchFrozenDatasetV1().candles;
  return { ltf, native };
}

function btcReportWithNormalizedVolume() {
  const { ltf, native } = btcParityInput();
  return buildNativeHtfParityReport({
    ltfCandles: ltf,
    nativeHtfCandles: native,
    decimalNormalizedVolumeParity: {
      decimalPlaces: BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES,
      researchSymbol: "BTCUSDT",
    },
  });
}

function assertFrozenBtc1hChecksumUnchanged(): void {
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  assert.equal(
    computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
    BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
  );
  const fixturePath = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
  assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  assert.ok(readFileSync(fixturePath, "utf8").includes(BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM));
}

describe("native-htf-parity", () => {
  it("P-ND-001: BTC native vs derived complete buckets", () => {
    assertFrozenBtc1hChecksumUnchanged();
    const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    const native = loadBtcusdt4hNativeResearchFrozenDatasetV1().candles;
    const report = buildNativeHtfParityReport({ ltfCandles: ltf, nativeHtfCandles: native });
    assert.equal(report.invalidNativeInput, null);
    assert.ok(report.comparedCompleteBucketCount > 0);
    assert.equal(report.fieldParityStatus, "FIELD_PARITY_FAILED");
    const nonVolume = report.bucketRows.filter(
      (r) => r.outcome !== "matched" && r.outcome !== "volumeMismatch"
    );
    assert.equal(nonVolume.length, 0, "only volume may differ (IEEE754 sum vs native kline)");
    assert.equal(report.mismatchCounts.volumeMismatch, report.comparedCompleteBucketCount - report.matchedCount);
    assert.ok(report.matchedCount === 0 || report.mismatchCounts.volumeMismatch !== undefined);
    assert.equal(report.normalizedVolumeParity.status, "NOT_ESTABLISHED");
  });

  const boundaryHoursUtc = [0, 4, 8, 12, 16, 20] as const;
  for (let i = 0; i < boundaryHoursUtc.length; i++) {
    const hour = boundaryHoursUtc[i];
    it(`P-BND-00${i + 1}: ${String(hour).padStart(2, "0")}:00 UTC bucket`, () => {
      const dayBase = Date.UTC(2024, 0, 15, 0, 0, 0);
      const bucketOpen = dayBase + hour * ONE_H;
      assert.equal(utc4hBucketOpen(bucketOpen), bucketOpen);
      const ltf = hourSeries(bucketOpen, 4, 50);
      const derived = deriveHtfCandlesFromLtf({
        ltfCandles: ltf,
        ltfTimeframeId: "1H",
        htfTimeframeId: "4H",
      }).candles[0];
      const nativeLike = c(
        bucketOpen,
        ltf[0].open,
        Math.max(...ltf.map((x) => x.high)),
        Math.min(...ltf.map((x) => x.low)),
        ltf[3].close,
        ltf.reduce((s, x) => s + x.volume, 0)
      );
      const report = buildNativeHtfParityReport({
        ltfCandles: ltf,
        nativeHtfCandles: [nativeLike],
      });
      assert.equal(report.fieldParityStatus, "FIELD_PARITY_ESTABLISHED");
      assert.equal(derived.time, bucketOpen);
    });
  }

  it("P-CLS-001: developing native bar excluded from parity set", () => {
    const bucket = 20 * ONE_H;
    const ltf = hourSeries(bucket, 4);
    const closedNative = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const developing = c(bucket + FOUR_H, 1, 2, 0.5, 1.5, 9);
    const asOf = bucket + FOUR_H;
    const filtered = filterNative4hClosedForParity(
      [...closedNative, developing],
      asOf,
      "4H"
    );
    assert.equal(filtered.length, 1);
    const report = buildNativeHtfParityReport({
      ltfCandles: ltf,
      nativeHtfCandles: [...closedNative, developing],
      nativeClosedAsOfMs: asOf,
    });
    assert.equal(report.fieldParityStatus, "FIELD_PARITY_ESTABLISHED");
    assert.equal(filtered.some((c) => c.time === developing.time), false);
  });

  it("P-DEV-001: mid-4H T_LTF selects prior closed HTF (native + derived)", () => {
    const ltf = hourSeries(0, 16);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E_LTF = 10;
    const T_LTF = ltf[E_LTF].time;
    for (const htfCandles of [derived, [...derived]]) {
      const res = resolveHtfEvaluationBarIndex({
        candles: htfCandles,
        timeframeId: "4H",
        ltfEvaluationTimestamp: T_LTF,
      });
      assert.ok(res.ok);
      assert.equal(res.evaluationTimestamp, 4 * ONE_H);
      const closeSelected = barCloseTimestamp(htfCandles[res.evaluationBarIndex], "4H")!;
      assert.ok(closeSelected <= T_LTF);
      const nextClose = barCloseTimestamp(htfCandles[res.evaluationBarIndex + 1], "4H");
      if (nextClose !== null) {
        assert.ok(nextClose > T_LTF);
      }
    }
  });

  it("P-MISS-001: missing 1H → native-only, not field parity failure on that bucket", () => {
    const ltf = hourSeries(8 * ONE_H, 3);
    const nativeBar = c(8 * ONE_H, 1, 2, 0.5, 1.5, 4);
    const report = buildNativeHtfParityReport({
      ltfCandles: ltf,
      nativeHtfCandles: [nativeBar],
    });
    assert.equal(report.comparedCompleteBucketCount, 0);
    assert.ok(report.incompleteDerivedBuckets.length > 0);
    assert.ok(report.nativeOnlyTimestamps.includes(nativeBar.time));
    assert.equal(report.fieldParityStatus, "NOT_ESTABLISHED");
  });

  it("P-MISS-002: missing native 4H for complete derived bucket", () => {
    const ltf = hourSeries(0, 4);
    const report = buildNativeHtfParityReport({
      ltfCandles: ltf,
      nativeHtfCandles: [],
    });
    assert.equal(report.invalidNativeInput?.code, "EMPTY_DATASET");
  });

  it("P-DUP-001: duplicate 1H rejects derivation", () => {
    const ltf = hourSeries(0, 4);
    ltf.splice(2, 0, { ...ltf[1] });
    const report = buildNativeHtfParityReport({
      ltfCandles: ltf,
      nativeHtfCandles: [c(0, 1, 2, 0.5, 1.5, 4)],
    });
    assert.equal(report.invalidLtfInput?.code, "DUPLICATE_TIMESTAMP");
  });

  it("P-DUP-002: duplicate native 4H → invalidNativeInput", () => {
    const ltf = hourSeries(0, 4);
    const native = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const dup = [...native, { ...native[0] }];
    const v = validateNative4hForParity(dup);
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.issue.code, "DUPLICATE_TIMESTAMP");
    }
  });

  it("P-ORD-001: unsorted 1H rejected", () => {
    const ltf = hourSeries(0, 4);
    const swapped = [ltf[1], ltf[0], ltf[2], ltf[3]];
    const report = buildNativeHtfParityReport({
      ltfCandles: swapped,
      nativeHtfCandles: [c(0, 1, 2, 0.5, 1.5, 4)],
    });
    assert.equal(report.invalidLtfInput?.code, "NON_CHRONOLOGICAL_ORDER");
  });

  it("P-ORD-002: unsorted native rejected", () => {
    const native = [c(FOUR_H, 1, 2, 0.5, 1.5, 1), c(0, 1, 2, 0.5, 1.5, 1)];
    const v = validateNative4hForParity(native);
    assert.equal(v.ok, false);
  });

  it("P-EDGE-001: first incomplete bucket excluded from comparison", () => {
    assertFrozenBtc1hChecksumUnchanged();
    const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    const firstBucket = utc4hBucketOpen(ltf[0].time);
    if (firstBucket !== ltf[0].time) {
      const report = buildNativeHtfParityReport({
        ltfCandles: ltf,
        nativeHtfCandles: loadBtcusdt4hNativeResearchFrozenDatasetV1().candles,
      });
      assert.ok(!report.bucketRows.some((r) => r.bucketOpen === firstBucket));
      assert.ok(report.nativeOnlyTimestamps.includes(firstBucket) || report.incompleteDerivedBuckets.includes(firstBucket));
    } else {
      assert.ok(true);
    }
  });

  it("P-EDGE-002: last incomplete bucket excluded", () => {
    const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    const last = ltf[ltf.length - 1].time;
    const lastBucket = utc4hBucketOpen(last);
    const report = buildNativeHtfParityReport({
      ltfCandles: ltf,
      nativeHtfCandles: loadBtcusdt4hNativeResearchFrozenDatasetV1().candles,
    });
    const slots = [0, 1, 2, 3].map((j) => lastBucket + j * ONE_H);
    const completeLast = slots.every((t) => ltf.some((candle) => candle.time === t));
    if (!completeLast) {
      assert.ok(!report.bucketRows.some((r) => r.bucketOpen === lastBucket));
    }
  });

  it("P-7A-001: derived vs native same HTF selection at samples", () => {
    const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    const native = loadBtcusdt4hNativeResearchFrozenDatasetV1().candles;
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const nativeAligned = alignNativeHtfCandlesToDerivedCompleteBuckets(derived, native);
    assert.equal(nativeAligned.length, derived.length);
    const samples = [100, 500, 1500, 2500, 2999];
    const semantic = buildNativeHtfSemanticParityReport({
      ltfCandles: ltf,
      derivedHtfCandles: derived,
      nativeHtfCandles: nativeAligned,
      ltfEvaluationBarIndices: samples,
      confluenceEvaluationBarIndex: 1500,
      swingConfig: SMALL_SWING,
    });
    assert.equal(semantic.status, "SEMANTIC_PARITY_ESTABLISHED");
    assert.ok(semantic.mtfAlignmentSamples.every((s) => s.ok));
  });

  it("P-7A-002: future HTF append does not alter causal selection", () => {
    const ltf = hourSeries(0, 16);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E = 10;
    const base = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: derived,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    const extended = [...derived, c(99 * ONE_H, 200, 210, 190, 205, 1)];
    const extCtx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: extended,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(base.htf?.evaluationBarIndex, extCtx.htf?.evaluationBarIndex);
    assert.deepEqual(base.alignment, extCtx.alignment);
  });

  it("P-9F-001: derived vs native 9F mtf panel semantic comparison", () => {
    const ltf = loadBtcusdt1hResearchFrozenDatasetV1().candles;
    const native = loadBtcusdt4hNativeResearchFrozenDatasetV1().candles;
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const nativeAligned = alignNativeHtfCandlesToDerivedCompleteBuckets(derived, native);
    const semantic = buildNativeHtfSemanticParityReport({
      ltfCandles: ltf,
      derivedHtfCandles: derived,
      nativeHtfCandles: nativeAligned,
      ltfEvaluationBarIndices: [1500],
      confluenceEvaluationBarIndex: 1500,
      swingConfig: SMALL_SWING,
    });
    assert.equal(semantic.confluence9fOk, true);
    assert.equal(semantic.status, "SEMANTIC_PARITY_ESTABLISHED");
  });

  describe("D-VOL-1 decimal normalized volume parity (research tier)", () => {
    it("V-R-001: strict JS sum remains FIELD_PARITY_FAILED", () => {
      const report = btcReportWithNormalizedVolume();
      assert.equal(report.fieldParityStatus, "FIELD_PARITY_FAILED");
    });

    it("V-R-002: 3dp decimal sum matches native for all BTC buckets", () => {
      const report = btcReportWithNormalizedVolume();
      const n = report.normalizedVolumeParity;
      assert.equal(n.status, "ESTABLISHED");
      assert.equal(n.precision, 3);
      assert.equal(n.comparedBuckets, 749);
      assert.equal(n.matchedBuckets, 749);
      assert.equal(n.mismatchedBuckets, 0);
      assert.ok(n.limitations.includes("not_universal_binance_volume_precision"));
    });

    it("V-R-003: first strict mismatch normalizes successfully", () => {
      const report = btcReportWithNormalizedVolume();
      const ev = report.normalizedVolumeParity.representativeEvidence.find(
        (e) => e.label === "first_strict_field_mismatch"
      );
      assert.ok(ev);
      assert.equal(ev!.nativeVolume, 52731.38);
      assert.equal(ev!.jsFloatingSumVolume, 52731.380000000005);
      assert.equal(ev!.decimalNormalizedSumVolume, 52731.38);
    });

    it("V-R-004: largest difference normalizes successfully", () => {
      const report = btcReportWithNormalizedVolume();
      const ev = report.normalizedVolumeParity.representativeEvidence.find(
        (e) => e.label === "largest_js_native_abs_diff"
      );
      assert.ok(ev);
      assert.equal(ev!.nativeVolume, 83019.001);
      assert.equal(ev!.decimalNormalizedSumVolume, 83019.001);
    });

    it("V-R-005: smallest difference normalizes successfully", () => {
      const report = btcReportWithNormalizedVolume();
      const ev = report.normalizedVolumeParity.representativeEvidence.find(
        (e) => e.label === "smallest_js_native_abs_diff"
      );
      assert.ok(ev);
      assert.equal(ev!.nativeVolume, 3692.034);
      assert.equal(ev!.decimalNormalizedSumVolume, 3692.034);
    });

    it("V-R-006: mixed decimal precision members normalize correctly", () => {
      const { ltf, native } = btcParityInput();
      const ltfByTime = new Map(ltf.map((c) => [c.time, c]));
      const t0 = BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS.mixedDecimalMember;
      const members = [0, 1, 2, 3].map((j) => ltfByTime.get(t0 + j * ONE_H)!);
      assert.equal(String(members[0]!.volume), "12293.7");
      const sum = sumVolumesAtDecimalPrecision(
        members.map((m) => m.volume),
        3
      );
      const nativeVol = native.find((c) => c.time === t0)!.volume;
      assert.equal(sum, nativeVol);
    });

    it("V-R-007: 3dp normalization does not alter time/open/high/low/close", () => {
      const report = btcReportWithNormalizedVolume();
      for (const row of report.bucketRows) {
        if (!row.derived || !row.native) continue;
        assert.equal(row.derived.time, row.native.time);
        assert.equal(row.derived.open, row.native.open);
        assert.equal(row.derived.high, row.native.high);
        assert.equal(row.derived.low, row.native.low);
        assert.equal(row.derived.close, row.native.close);
      }
    });

    it("V-R-008: precision metadata explicitly reports 3", () => {
      const report = btcReportWithNormalizedVolume();
      assert.equal(report.normalizedVolumeParity.precision, 3);
      const { ltf } = btcParityInput();
      assert.equal(
        maxVolumeDecimalPlacesObserved(ltf.map((c) => c.volume)),
        3
      );
    });

    it("V-R-009: future LTF append does not change normalized parity", () => {
      const { ltf, native } = btcParityInput();
      const prefix = ltf.slice(0, 2800);
      const cfg = {
        decimalNormalizedVolumeParity: {
          decimalPlaces: 3 as const,
          researchSymbol: "BTCUSDT" as const,
        },
      };
      const dPrefix = deriveHtfCandlesFromLtf({
        ltfCandles: prefix,
        ltfTimeframeId: "1H",
        htfTimeframeId: "4H",
      }).candles;
      const dFull = deriveHtfCandlesFromLtf({
        ltfCandles: ltf,
        ltfTimeframeId: "1H",
        htfTimeframeId: "4H",
      }).candles;
      assert.deepEqual(dPrefix, dFull.slice(0, dPrefix.length));
      const rPrefix = buildNativeHtfParityReport({
        ltfCandles: prefix,
        nativeHtfCandles: native,
        ...cfg,
      });
      const rFull = buildNativeHtfParityReport({
        ltfCandles: ltf,
        nativeHtfCandles: native,
        ...cfg,
      });
      assert.equal(rPrefix.normalizedVolumeParity.status, "ESTABLISHED");
      assert.equal(rPrefix.normalizedVolumeParity.mismatchedBuckets, 0);
      assert.equal(rFull.normalizedVolumeParity.status, "ESTABLISHED");
      assert.equal(
        rPrefix.normalizedVolumeParity.comparedBuckets,
        dPrefix.length
      );
      assert.equal(rPrefix.normalizedVolumeParity.matchedBuckets, dPrefix.length);
    });

    it("V-R-010: frozen BTC 1H checksum unchanged", () => {
      assertFrozenBtc1hChecksumUnchanged();
    });
  });
});
