import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHtfVisibilityView,
  buildMarketStructureMtfAlignmentContext,
  getTimeframeDurationMs,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  resolveHtfEvaluationBarIndex,
  barCloseTimestamp,
} from "../market-structure/market-structure-mtf-alignment";
import { buildMarketStructureSnapshotAtBar } from "../market-structure/market-structure-snapshot";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number, startTime = 0): Candle[] {
  return Array.from({ length: count }, (_, i) => c(startTime + i * ONE_H));
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

describe("market-structure-mtf-alignment (MSL-7A)", () => {
  it("T-DURATION-1H: 1H duration and bar close", () => {
    assert.equal(getTimeframeDurationMs("1H"), ONE_H);
    const candle = c(1_000_000);
    assert.equal(barCloseTimestamp(candle, "1H"), 1_000_000 + ONE_H - 1);
    assert.equal(
      knownAtTimestampFromBarIndex([candle], 0, "1H"),
      1_000_000 + ONE_H - 1
    );
  });

  it("T-HTF-OPEN: developing HTF bar does not change MTF context", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = htfSeries(5);
    const E_LTF = 2;
    const T_LTF = ltf[E_LTF].time;
    assert.equal(T_LTF, 2 * ONE_H);

    const ctxA = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: htfA,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    const ctxB = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: htfB,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(ctxA, ctxB);
    assert.equal(ctxA.htf!.evaluationBarIndex, 1);
  });

  it("T-HTF-FUTURE: post-T_LTF HTF bars do not change context", () => {
    const htfBase = htfSeries(4);
    const ltf = htfSeries(3);
    const E_LTF = 2;
    const base = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: htfBase,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    const extended = [...htfBase, c(10 * ONE_H, 200), c(11 * ONE_H, 200)];
    const extendedCtx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E_LTF,
      ltfTimeframeId: "1H",
      htfCandles: extended,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(base, extendedCtx);
  });

  it("T-LTF-FUTURE: post-E_LTF LTF bars do not change LTF snapshot", () => {
    const ltfBase = htfSeries(5);
    const htf = htfSeries(5);
    const E = 2;
    const snapDirect = buildMarketStructureSnapshotAtBar({
      candles: ltfBase,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const extended = [...ltfBase, c(99 * ONE_H, 500)];
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: extended,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(ctx.ltf.snapshot, snapDirect);
  });

  it("T-BND-A/B/C: HTF close vs T_LTF selection", () => {
    const candles = [c(0), c(ONE_H), c(2 * ONE_H)];
    const close0 = barCloseTimestamp(candles[0], "1H")!;
    const close1 = barCloseTimestamp(candles[1], "1H")!;
    const close2 = barCloseTimestamp(candles[2], "1H")!;

    const rA = resolveHtfEvaluationBarIndex({
      candles,
      timeframeId: "1H",
      ltfEvaluationTimestamp: close1 - 1,
    });
    assert.ok(rA.ok && rA.evaluationBarIndex === 0);

    const rB = resolveHtfEvaluationBarIndex({
      candles,
      timeframeId: "1H",
      ltfEvaluationTimestamp: close1,
    });
    assert.ok(rB.ok && rB.evaluationBarIndex === 1);

    const rC = resolveHtfEvaluationBarIndex({
      candles,
      timeframeId: "1H",
      ltfEvaluationTimestamp: close1 + 1,
    });
    assert.ok(rC.ok && rC.evaluationBarIndex === 1);

    const rBeforeFirst = resolveHtfEvaluationBarIndex({
      candles,
      timeframeId: "1H",
      ltfEvaluationTimestamp: close0 - 1,
    });
    assert.equal(rBeforeFirst.ok, false);
    if (!rBeforeFirst.ok) {
      assert.equal(rBeforeFirst.code, "INSUFFICIENT_HTF_CONTEXT");
    }

    assert.ok(isKnownAtOrBefore(close1, close1));
    assert.ok(isKnownAtOrBefore(close0, close1));
    assert.equal(isKnownAtOrBefore(close2, close1), false);
  });

  it("T-KNOWN-AT: visibility filter on knownAt vs T_LTF", () => {
    const htf = htfSeries(6);
    const snap = buildMarketStructureSnapshotAtBar({
      candles: htf,
      evaluationBarIndex: 5,
      swingConfig: SMALL_SWING,
    });
    const T_LTF = knownAtTimestampFromBarIndex(htf, 2, "1H")!;
    const view = buildHtfVisibilityView({
      snapshot: snap,
      htfCandles: htf,
      htfTimeframeId: "1H",
      ltfEvaluationTimestamp: T_LTF,
    });
    for (const ann of snap.zigzag.zigzagSpine) {
      const knownTs = knownAtTimestampFromBarIndex(htf, ann.knownAtBarIndex, "1H")!;
      const inView = view.zigzagSpinePivotIndices.includes(ann.pivotIndex);
      assert.equal(inView, knownTs <= T_LTF);
    }
  });

  it("T-BREAK-KNOWN-VS-TRIGGER: knownAt after T_LTF → invisible", () => {
    const htf = htfSeries(8);
    const snap = buildMarketStructureSnapshotAtBar({
      candles: htf,
      evaluationBarIndex: 7,
      swingConfig: SMALL_SWING,
    });
    const T_LTF = knownAtTimestampFromBarIndex(htf, 1, "1H")!;
    const fakeKnownAtBar = 5;
    const modified = {
      ...snap,
      break: {
        ...snap.break,
        classifiedEvents: [
          ...snap.break.classifiedEvents,
          {
            eventId: "ce:TEST:fake",
            eventType: "BOS" as const,
            classificationRuleId: snap.break.ruleIds.bos,
            derivedFromObservationId: "bo:fake",
            evidenceTag: "RULE_CLASSIFICATION" as const,
            direction: "UP" as const,
            referencePivotIndex: 0,
            referencePrice: 100,
            referenceType: "HIGH" as const,
            referenceScope: "EXTERNAL" as const,
            triggerBarIndex: 1,
            knownAtBarIndex: fakeKnownAtBar,
            trendContextAtClassification: "BULLISH" as const,
          },
        ],
      },
    };
    const view = buildHtfVisibilityView({
      snapshot: modified,
      htfCandles: htf,
      htfTimeframeId: "1H",
      ltfEvaluationTimestamp: T_LTF,
    });
    assert.ok(!view.breakClassifiedEventIds.includes("ce:TEST:fake"));
  });

  it("T-MISSING-TF: empty HTF candles", () => {
    const ltf = htfSeries(3);
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: 2,
      ltfTimeframeId: "1H",
      htfCandles: [],
      htfTimeframeId: "1H",
    });
    assert.equal(ctx.htf, null);
    assert.ok(ctx.unresolved.some((u) => u.code === "MISSING_TIMEFRAME_DATA"));
  });

  it("T-NO-HTF-CLOSED: T_LTF before first HTF close", () => {
    const htf = htfSeries(3);
    const ltf = [c(0)];
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: 0,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "1H",
    });
    assert.equal(ctx.htf, null);
    assert.ok(ctx.unresolved.some((u) => u.code === "INSUFFICIENT_HTF_CONTEXT"));
  });

  it("T-WRAPPER: LTF snapshot matches direct builder", () => {
    const ltf = htfSeries(10);
    const htf = htfSeries(10);
    const E = 5;
    const direct = buildMarketStructureSnapshotAtBar({
      candles: ltf,
      evaluationBarIndex: E,
      swingConfig: SMALL_SWING,
    });
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    assert.deepEqual(ctx.ltf.snapshot, direct);
  });

  it("T-DET: five runs deepEqual and JSON parity", () => {
    const ltf = htfSeries(12);
    const htf = htfSeries(12);
    const input = {
      ltfCandles: ltf,
      ltfEvaluationBarIndex: 6,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    };
    const runs = Array.from({ length: 5 }, () =>
      buildMarketStructureMtfAlignmentContext(input)
    );
    for (let i = 1; i < runs.length; i++) {
      assert.deepEqual(runs[i], runs[0]);
      assert.equal(JSON.stringify(runs[i]), JSON.stringify(runs[0]));
    }
  });

  it("T-IMMUT: inputs not mutated", () => {
    const ltf = htfSeries(8);
    const htf = htfSeries(8);
    const ltfJson = JSON.stringify(ltf);
    const htfJson = JSON.stringify(htf);
    deepFreeze(ltf);
    deepFreeze(htf);
    buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: 4,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "1H",
      swingConfig: SMALL_SWING,
    });
    assert.equal(JSON.stringify(ltf), ltfJson);
    assert.equal(JSON.stringify(htf), htfJson);
  });

  it("unsupported timeframe → MISSING_TIMEFRAME_DATA", () => {
    const res = resolveHtfEvaluationBarIndex({
      candles: htfSeries(2),
      timeframeId: "NOT_A_TF",
      ltfEvaluationTimestamp: ONE_H,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "MISSING_TIMEFRAME_DATA");
  });

  it("4H HTF + 1H LTF selection (synthetic, no aggregation)", () => {
    const FOUR_H = 4 * ONE_H;
    const htf = [c(0), c(FOUR_H), c(2 * FOUR_H)];
    const ltf = [c(FOUR_H + ONE_H)];
    const ctx = buildMarketStructureMtfAlignmentContext({
      ltfCandles: ltf,
      ltfEvaluationBarIndex: 0,
      ltfTimeframeId: "1H",
      htfCandles: htf,
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
    });
    assert.ok(ctx.htf);
    assert.equal(ctx.htf!.evaluationBarIndex, 0);
    assert.equal(ctx.alignment.htfBarClosedAtLtfEvaluation, true);
  });
});
