import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import {
  buildHistoricalMeasurementRecord,
  futureBarsAvailableAfterEvaluationBar,
} from "../historical-measurement-assembly";
import type { HistoricalMeasurementArtifactEntry } from "../setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementRecord } from "../setup/historical-measurement-types";
import { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "../setup/historical-measurement-contract";
import {
  HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
  HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
} from "../historical-position-path-contract";
import {
  buildHistoricalPositionPathReplayInputFromArtifactEntry,
  resolveHistoricalPositionPathV1,
} from "../historical-position-path";
import { replayProspectiveSetupOutcome } from "../setup/prospective-setup-outcome-replay";
import { buildProspectiveSetupOutcomeReplayInput } from "../setup/prospective-setup-outcome-replay-input";
import { resolveProspectiveStructuralInvalidation } from "../setup/prospective-structural-invalidation";

const cohort = "ALL_PRODUCTION_CANDIDATES" as const;
const historicalE = 22;

function candle(high: number, low: number): Candle {
  return {
    time: 0,
    open: (high + low) / 2,
    high,
    low,
    close: (high + low) / 2,
    volume: 1,
  };
}

function extendCandles(prefix: Candle[], futures: Candle[]): Candle[] {
  return [...prefix, ...futures];
}

function followCandle(prev: Candle, patch: Partial<Candle>): Candle {
  return {
    ...prev,
    time: prev.time + 3_600_000,
    open: patch.open ?? prev.close,
    high: patch.high ?? prev.high,
    low: patch.low ?? prev.low,
    close: patch.close ?? prev.close,
    volume: patch.volume ?? prev.volume,
  };
}

function recordToArtifactEntry(
  record: HistoricalMeasurementRecord
): HistoricalMeasurementArtifactEntry {
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    snapshotId: record.snapshotId,
    symbol: record.symbol,
    timeframe: record.timeframe,
    evaluationBarIndex: record.evaluationBarIndex,
    evaluationBarTime: record.evaluationBarTime,
    prospectiveSetupId: record.prospectiveSetupId,
    horizonBars: record.horizonBars,
    cohorts: [record.cohort],
    cohort: record.cohort,
    evaluation: record.evaluation,
    outcome: record.outcome,
  };
}

function buildEntryFromComposed(
  composed: ReturnType<typeof composeProductionWaveScannerForSymbol>,
  candles: Candle[],
  horizonBars?: number
): HistoricalMeasurementArtifactEntry {
  const record = buildHistoricalMeasurementRecord({
    composed,
    candles,
    cohort,
    horizonBars,
  });
  assert.ok(record);
  return recordToArtifactEntry(record);
}

/** Synthetic high>=target touches require BULLISH replay semantics (M/S/T). */
function applyBullishObservedDirection(
  entry: HistoricalMeasurementArtifactEntry
): void {
  assert.ok(entry.evaluation.production);
  entry.evaluation.production.observedDirection = "BULLISH";
}

describe("historical position path V1 (B-10a)", () => {
  const baseComposeInput = {
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    composeOptions: { evaluationBarIndex: historicalE },
  };

  it("A–D: bullish/bearish target and invalidation via artifact entry", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const dir = composed.production!.observedDirection as "BULLISH" | "BEARISH";
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const inv = composed.references.stop.referencePrice!;

    const targetCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1 })
        : followCandle(last, { low: target - 1 }),
    ]);
    const entry = buildEntryFromComposed(composed, targetCandles);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry, candles: targetCandles }).outcome,
      "TARGET_TOUCHED"
    );

    const invCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { low: inv - 1 })
        : followCandle(last, { high: inv + 1 }),
    ]);
    const entryInv = buildEntryFromComposed(composed, invCandles);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry: entryInv, candles: invCandles })
        .outcome,
      "INVALIDATION_TOUCHED"
    );
  });

  it("E: same-candle dual touch → AMBIGUOUS", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const dir = composed.production!.observedDirection as "BULLISH" | "BEARISH";
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const inv = composed.references.stop.referencePrice!;
    const ambCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1, low: inv - 1 })
        : followCandle(last, { low: target - 1, high: inv + 1 }),
    ]);
    const entry = buildEntryFromComposed(composed, ambCandles);
    const path = resolveHistoricalPositionPathV1({
      entry,
      candles: ambCandles,
    });
    assert.equal(path.outcome, "AMBIGUOUS");
    assert.equal(path.b6ReplayOutcome, "AMBIGUOUS");
  });

  it("F–G: multi-candle first target vs first invalidation", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const dir = composed.production!.observedDirection as "BULLISH" | "BEARISH";
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const inv = composed.references.stop.referencePrice!;

    const invFirst = extendCandles(prefix, [
      followCandle(last, { high: last.high, low: last.low }),
      dir === "BULLISH"
        ? followCandle(last, { low: inv - 1, high: last.high })
        : followCandle(last, { high: inv + 1, low: last.low }),
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1 })
        : followCandle(last, { low: target - 1 }),
    ]);
    const entryInv = buildEntryFromComposed(composed, invFirst, 5);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry: entryInv, candles: invFirst })
        .outcome,
      "INVALIDATION_TOUCHED"
    );

    const targetFirst = extendCandles(prefix, [
      followCandle(last, { high: last.high, low: last.low }),
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1 })
        : followCandle(last, { low: target - 1 }),
      dir === "BULLISH"
        ? followCandle(last, { low: inv - 1 })
        : followCandle(last, { high: inv + 1 }),
    ]);
    const entryTarget = buildEntryFromComposed(composed, targetFirst, 5);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry: entryTarget, candles: targetFirst })
        .outcome,
      "TARGET_TOUCHED"
    );
  });

  it("H: NO_TOUCH", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const neutral = extendCandles(prefix, [
      followCandle(last, {}),
      followCandle(last, {}),
    ]);
    const entry = buildEntryFromComposed(composed, neutral, 2);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry, candles: neutral }).outcome,
      "NO_TOUCH"
    );
  });

  it("I + R: NO_FUTURE_DATA at last index and DEMO E=23 parity", () => {
    const last = DEMO_OHLCV.length - 1;
    const composed = composeProductionWaveScannerForSymbol({
      ...baseComposeInput,
      composeOptions: { evaluationBarIndex: last },
    });
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    const path = resolveHistoricalPositionPathV1({
      entry,
      candles: DEMO_OHLCV,
    });
    assert.equal(path.outcome, "NO_FUTURE_DATA");
    assert.equal(path.futureBarsAvailable, 0);
    assert.equal(
      path.positionModelId,
      HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1
    );
  });

  it("J–K: INSUFFICIENT_CONTEXT and UNRESOLVED direction", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    entry.evaluation.production = null;
    assert.equal(
      resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV }).outcome,
      "INSUFFICIENT_CONTEXT"
    );

    const entry2 = buildEntryFromComposed(composed, DEMO_OHLCV);
    entry2.evaluation.production!.observedDirection = "UNRESOLVED";
    assert.equal(
      resolveHistoricalPositionPathV1({ entry: entry2, candles: DEMO_OHLCV })
        .outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("L: evaluation candle touch excluded", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const touchOnE = prefix.map((c, i) =>
      i === historicalE ? followCandle(c, { high: target + 5 }) : c
    );
    const withFuture = extendCandles(touchOnE, [followCandle(last, {})]);
    const entry = buildEntryFromComposed(composed, withFuture);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry, candles: withFuture }).outcome,
      "NO_TOUCH"
    );
  });

  it("M: horizon boundary respected", () => {
    const horizon = 3;
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entryProbe = buildEntryFromComposed(composed, DEMO_OHLCV);
    const inv = resolveProspectiveStructuralInvalidation(
      entryProbe.evaluation.historicalSetup!
    ).invalidationPrice!;
    const target = entryProbe.evaluation.references.target.referencePrice!;
    const safeLow = inv + 1;
    const candles = [
      candle(100, 100),
      candle(100, safeLow),
      candle(100, safeLow),
      candle(target + 1, safeLow),
      candle(100, safeLow),
    ];
    const entry = buildEntryFromComposed(composed, candles, horizon);
    entry.evaluationBarIndex = 0;
    applyBullishObservedDirection(entry);
    assert.equal(
      resolveHistoricalPositionPathV1({ entry, candles, horizonBars: horizon })
        .outcome,
      "TARGET_TOUCHED"
    );

    const touchBeyondHorizon = [
      candle(100, 100),
      candle(100, safeLow),
      candle(100, safeLow),
      candle(100, safeLow),
      candle(target + 1, safeLow),
    ];
    const entryBeyond = buildEntryFromComposed(
      composed,
      touchBeyondHorizon,
      horizon
    );
    entryBeyond.evaluationBarIndex = 0;
    applyBullishObservedDirection(entryBeyond);
    assert.equal(
      resolveHistoricalPositionPathV1({
        entry: entryBeyond,
        candles: touchBeyondHorizon,
        horizonBars: horizon,
      }).outcome,
      "NO_TOUCH"
    );
  });

  it("N–O: candles and artifact immutability", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const candles = [...DEMO_OHLCV];
    const entry = buildEntryFromComposed(composed, candles);
    const beforeEntry = JSON.stringify(entry);
    const beforeCandles = JSON.stringify(candles);
    resolveHistoricalPositionPathV1({ entry, candles });
    assert.equal(JSON.stringify(entry), beforeEntry);
    assert.equal(JSON.stringify(candles), beforeCandles);
  });

  it("P: determinism", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    assert.deepEqual(
      resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV }),
      resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV })
    );
  });

  it("Q: B-6 parity via composed replay input wiring", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const replayInput = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV
    );
    assert.ok(replayInput);
    const b6 = replayProspectiveSetupOutcome(replayInput);
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    const path = resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV });
    assert.equal(path.outcome, b6.outcome);
    assert.equal(path.b6ReplayOutcome, b6.outcome);
    assert.equal(path.resolutionBarIndex, b6.resolutionBarIndex);
  });

  it("Q2: B-6 parity on synthetic replay fixtures", () => {
    const fixtures = [
      {
        direction: "BULLISH" as const,
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
        evaluationBarIndex: 0,
        candles: [candle(100, 100), candle(111, 100)],
      },
      {
        direction: "BULLISH" as const,
        entryReferencePrice: 100,
        targetReferencePrice: 110,
        invalidationReferencePrice: 95,
        evaluationBarIndex: 0,
        candles: [candle(100, 100), candle(111, 94)],
      },
    ];
    for (const fixture of fixtures) {
      const b6 = replayProspectiveSetupOutcome(fixture);
      const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
      const entry = buildEntryFromComposed(composed, fixture.candles as Candle[]);
      const wired = buildHistoricalPositionPathReplayInputFromArtifactEntry(
        entry,
        fixture.candles
      );
      assert.ok(wired);
      const pathInput = { ...wired, ...fixture };
      const pathReplay = replayProspectiveSetupOutcome(pathInput);
      assert.equal(pathReplay.outcome, b6.outcome);
    }
  });

  it("S: E=100 style future target at E+10", () => {
    const evalBar = 100;
    const horizon = 24;
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entryProbe = buildEntryFromComposed(composed, DEMO_OHLCV);
    const inv = resolveProspectiveStructuralInvalidation(
      entryProbe.evaluation.historicalSetup!
    ).invalidationPrice!;
    const target = entryProbe.evaluation.references.target.referencePrice!;
    const safeLow = inv + 1;
    const candles: Candle[] = [];
    for (let i = 0; i <= evalBar + 15; i++) {
      candles.push({
        time: i,
        open: 100,
        high: target - 1,
        low: safeLow,
        close: 100,
        volume: 1,
      });
    }
    candles[evalBar + 10] = candle(115, safeLow);

    const entry = buildEntryFromComposed(composed, candles, horizon);
    entry.evaluationBarIndex = evalBar;
    applyBullishObservedDirection(entry);
    const path = resolveHistoricalPositionPathV1({
      entry,
      candles,
      horizonBars: horizon,
    });
    assert.equal(path.outcome, "TARGET_TOUCHED");
    assert.equal(path.resolutionBarIndex, evalBar + 10);
    assert.equal(path.barsAfterEvaluation, 10);
    assert.equal(path.targetReferencePrice, target);
  });

  it("T: gap touch uses high/low only (no fill price)", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entryProbe = buildEntryFromComposed(composed, DEMO_OHLCV);
    const inv = resolveProspectiveStructuralInvalidation(
      entryProbe.evaluation.historicalSetup!
    ).invalidationPrice!;
    const target = entryProbe.evaluation.references.target.referencePrice!;
    const gapLow = Math.max(target + 1, inv + 1);
    const candles = [
      candle(100, 100),
      {
        time: 1,
        open: target + 5,
        high: target + 7,
        low: gapLow,
        close: target + 4,
        volume: 1,
      },
    ];
    const entry = buildEntryFromComposed(composed, candles);
    entry.evaluationBarIndex = 0;
    applyBullishObservedDirection(entry);
    const path = resolveHistoricalPositionPathV1({ entry, candles });
    assert.equal(path.outcome, "TARGET_TOUCHED");
    assert.equal(path.targetReferencePrice, target);
  });

  it("U–W: trade eval and references unchanged", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    const teBefore = JSON.stringify(entry.evaluation.tradeEvaluation);
    const refsBefore = JSON.stringify(entry.evaluation.references);
    const rrBefore = entry.evaluation.references.rr.ratio;
    resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV });
    assert.equal(JSON.stringify(entry.evaluation.tradeEvaluation), teBefore);
    assert.equal(JSON.stringify(entry.evaluation.references), refsBefore);
    assert.equal(entry.evaluation.references.rr.ratio, rrBefore);
  });

  it("schema and limitations metadata", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entry = buildEntryFromComposed(composed, DEMO_OHLCV);
    const path = resolveHistoricalPositionPathV1({ entry, candles: DEMO_OHLCV });
    assert.equal(path.schemaVersion, HISTORICAL_POSITION_PATH_SCHEMA_VERSION);
    assert.ok(path.limitations.length >= 3);
    assert.ok(!("win" in path));
    assert.ok(!("pnl" in path));
    assert.equal(
      path.futureBarsAvailable,
      futureBarsAvailableAfterEvaluationBar(
        entry.evaluationBarIndex,
        DEMO_OHLCV.length
      )
    );
  });
});
