import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveHtfCandlesFromLtf,
  HtfDerivationError,
} from "../market-structure/market-structure-htf-derivation";
import { buildMarketStructureMtfAlignmentContext } from "../market-structure/market-structure-mtf-alignment";
import { HistoricalOhlcvDatasetValidationError } from "../historical-ohlcv-dataset-validation";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const FOUR_H = 4 * ONE_H;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, o: number, h: number, l: number, cl: number, v = 1): Candle {
  return { time, open: o, high: h, low: l, close: cl, volume: v };
}

function hourSeries(
  startTime: number,
  count: number,
  price = 100
): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    c(startTime + i * ONE_H, price, price + 2, price - 2, price + 1, 10 + i)
  );
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

describe("market-structure-htf-derivation (MSL-7B)", () => {
  it("T-AGG-BOUNDARY: UTC 4H buckets from hourly timestamps", () => {
    const base = 0;
    const ltf = hourSeries(base, 8);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.equal(derived.candles.length, 2);
    assert.equal(derived.candles[0].time, 0);
    assert.equal(derived.candles[1].time, FOUR_H);
    assert.equal(derived.ratio, 4);
  });

  it("T-AGG-PARTIAL: 3/4 LTF → no HTF row", () => {
    const bucket = 8 * ONE_H;
    const ltf = hourSeries(bucket, 3);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.equal(derived.candles.length, 0);
    assert.ok(derived.unresolved.some((u) => u.code === "AGGREGATION_INCOMPLETE_BUCKET"));
  });

  it("T-AGG-CLOSED: 4/4 → one HTF candle", () => {
    const bucket = 8 * ONE_H;
    const ltf = hourSeries(bucket, 4);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.equal(derived.candles.length, 1);
    assert.equal(derived.candles[0].time, bucket);
  });

  it("T-AGG-OHLC: open/high/low/close correctness", () => {
    const t0 = 12 * ONE_H;
    const ltf = [
      c(t0, 10, 15, 9, 11, 1),
      c(t0 + ONE_H, 11, 20, 8, 12, 2),
      c(t0 + 2 * ONE_H, 12, 18, 7, 13, 3),
      c(t0 + 3 * ONE_H, 13, 17, 5, 16, 4),
    ];
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const h = derived.candles[0];
    assert.equal(h.open, 10);
    assert.equal(h.high, 20);
    assert.equal(h.low, 5);
    assert.equal(h.close, 16);
  });

  it("T-AGG-VOLUME: volume sum", () => {
    const ltf = hourSeries(0, 4, 50);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const expectedVol = 10 + 11 + 12 + 13;
    assert.equal(derived.candles[0].volume, expectedVol);
  });

  it("T-AGG-GAP: missing hour in bucket → skip + unresolved (spacing intact)", () => {
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: hourSeries(0, 3),
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.equal(derived.candles.length, 0);
    assert.ok(derived.unresolved.some((u) => u.code === "AGGREGATION_INCOMPLETE_BUCKET"));
  });

  it("T-AGG-DUPLICATE: duplicate timestamp → reject", () => {
    const ltf = hourSeries(0, 4);
    ltf.push({ ...ltf[1] });
    assert.throws(
      () =>
        deriveHtfCandlesFromLtf({
          ltfCandles: ltf,
          ltfTimeframeId: "1H",
          htfTimeframeId: "4H",
        }),
      HistoricalOhlcvDatasetValidationError
    );
  });

  it("T-AGG-ORDER: unsorted → reject", () => {
    const ltf = hourSeries(0, 4);
    const swapped = [ltf[1], ltf[0], ltf[2], ltf[3]];
    assert.throws(
      () =>
        deriveHtfCandlesFromLtf({
          ltfCandles: swapped,
          ltfTimeframeId: "1H",
          htfTimeframeId: "4H",
        }),
      HistoricalOhlcvDatasetValidationError
    );
  });

  it("T-AGG-FUTURE: trailing 1H does not change earlier buckets", () => {
    const prefix = hourSeries(0, 8);
    const full = [...prefix, ...hourSeries(8 * ONE_H, 4, 200)];
    const dPrefix = deriveHtfCandlesFromLtf({
      ltfCandles: prefix,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const dFull = deriveHtfCandlesFromLtf({
      ltfCandles: full,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.deepEqual(dPrefix.candles, dFull.candles.slice(0, dPrefix.candles.length));
  });

  it("T-AGG-DETERMINISM: five runs deepEqual + JSON", () => {
    const ltf = hourSeries(FOUR_H, 12);
    const input = { ltfCandles: ltf, ltfTimeframeId: "1H", htfTimeframeId: "4H" };
    const runs = Array.from({ length: 5 }, () => deriveHtfCandlesFromLtf(input));
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
      assert.equal(JSON.stringify(runs[i]), JSON.stringify(runs[0]));
    }
  });

  it("T-AGG-IMMUTABILITY: inputs not mutated", () => {
    const ltf = hourSeries(0, 8);
    const json = JSON.stringify(ltf);
    deepFreeze(ltf);
    deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.equal(JSON.stringify(ltf), json);
  });

  it("T-NATIVE-DERIVED: hand-built 4H matches derived OHLC", () => {
    const t0 = 20 * ONE_H;
    const ltf = hourSeries(t0, 4, 100);
    ltf[1].high = 150;
    ltf[2].low = 50;
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles[0];
    const nativeLike = c(t0, 100, 150, 50, ltf[3].close, 10 + 11 + 12 + 13);
    assert.equal(derived.time, nativeLike.time);
    assert.equal(derived.open, nativeLike.open);
    assert.equal(derived.high, nativeLike.high);
    assert.equal(derived.low, nativeLike.low);
    assert.equal(derived.close, nativeLike.close);
    assert.equal(derived.volume, nativeLike.volume);
  });

  it("T-MTF-7A: derived vs hand-built same alignment", () => {
    const ltf = hourSeries(0, 16);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E_LTF = 10;
    const ctxDerived = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: derived,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    const ctxHand = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: [...derived],
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(ctxDerived, ctxHand);
  });

  it("T-FROZEN-1H: BTC fixture derivation deterministic, source checksum unchanged", () => {
    const fixturePath = join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH);
    const fileBefore = readFileSync(fixturePath, "utf8");
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
    const checksumBefore = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    const d1 = deriveHtfCandlesFromLtf({
      ltfCandles: loaded.candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const d2 = deriveHtfCandlesFromLtf({
      ltfCandles: loaded.candles,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    assert.deepEqual(d1, d2);
    assert.ok(d1.candles.length > 0);
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles), checksumBefore);
    const fileAfter = readFileSync(fixturePath, "utf8");
    assert.equal(fileBefore, fileAfter);
  });

  it("T-CAUSAL-PARTIAL: T_LTF=10:00 → 08–11 4H not selected", () => {
    const ltf = hourSeries(0, 16);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E_LTF = 10;
    assert.equal(ltf[E_LTF].time, 10 * ONE_H);
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    assert.ok(ctx.htf);
    assert.equal(ctx.htf!.evaluationTimestamp, 4 * ONE_H);
    assert.notEqual(ctx.htf!.evaluationTimestamp, 8 * ONE_H);
  });

  it("T-CAUSAL-CLOSED: T_LTF=12:00 → 08–11 4H visible", () => {
    const ltf = hourSeries(0, 16);
    const htf = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    }).candles;
    const E_LTF = 12;
    assert.equal(ltf[E_LTF].time, 12 * ONE_H);
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    assert.ok(ctx.htf);
    assert.equal(ctx.htf!.evaluationTimestamp, 8 * ONE_H);
  });

  it("unsupported timeframe ratio throws", () => {
    assert.throws(
      () =>
        deriveHtfCandlesFromLtf({
          ltfCandles: hourSeries(0, 4),
          ltfTimeframeId: "4H",
          htfTimeframeId: "1H",
        }),
      HtfDerivationError
    );
  });
});
