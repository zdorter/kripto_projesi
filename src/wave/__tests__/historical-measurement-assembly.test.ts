import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildHistoricalMeasurementRecord,
  futureBarsAvailableAfterEvaluationBar,
  runHistoricalMeasurementWalkForward,
} from "../historical-measurement-assembly";
import {
  HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
  buildHistoricalMeasurementSnapshotId,
} from "../setup/historical-measurement-contract";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import { resolveProspectiveStructuralInvalidation } from "../setup/prospective-structural-invalidation";
import { replayProspectiveSetupOutcome } from "../setup/prospective-setup-outcome-replay";
import { buildProspectiveSetupOutcomeReplayInput } from "../setup/prospective-setup-outcome-replay-input";

const cohort = "DISPLAY_PICK" as const;
const historicalE = 22;

function evaluationFingerprint(
  record: NonNullable<ReturnType<typeof buildHistoricalMeasurementRecord>>
) {
  return {
    entry: record.evaluation.references.entry,
    stop: record.evaluation.references.stop,
    target: record.evaluation.references.target,
    rr: record.evaluation.references.rr,
    ready: record.evaluation.references.readyForFurtherEvaluation,
    tradeEvaluation: record.evaluation.tradeEvaluation,
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

describe("historical measurement assembly (B-8d)", () => {
  const baseComposeInput = {
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    composeOptions: { evaluationBarIndex: historicalE },
  };

  it("A: single historical measurement at E", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    });
    assert.ok(record);
    assert.equal(record!.evaluationBarIndex, historicalE);
    assert.ok(record!.outcome);
  });

  it("B: deterministic snapshot ID", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    })!;
    assert.equal(
      record.snapshotId,
      buildHistoricalMeasurementSnapshotId({
        symbol: composed.symbol,
        timeframe: composed.timeframe,
        evaluationBarIndex: historicalE,
        prospectiveSetupId: composed.production!.id,
      })
    );
  });

  it("C: schema version 1.0", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    })!;
    assert.equal(record.schemaVersion, HISTORICAL_MEASUREMENT_SCHEMA_VERSION);
    assert.equal(record.horizonBars, HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS);
  });

  it("D–F: outcome target / invalidation / ambiguous", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    assert.ok(composed.production?.observedDirection === "BEARISH" || composed.production?.observedDirection === "BULLISH");
    const dir = composed.production!.observedDirection as "BULLISH" | "BEARISH";
    const inv = resolveProspectiveStructuralInvalidation(
      composed.historicalSetup!
    ).invalidationPrice!;
    const target = composed.references.target.referencePrice!;
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;

    const targetHit = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1, low: last.low })
        : followCandle(last, { low: target - 1, high: last.high }),
    ]);
    const targetRecord = buildHistoricalMeasurementRecord({
      composed,
      candles: targetHit,
      cohort,
    })!;
    assert.equal(targetRecord.outcome!.replay.outcome, "TARGET_TOUCHED");

    const invHit = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { low: inv - 1, high: last.high })
        : followCandle(last, { high: inv + 1, low: last.low }),
    ]);
    const invRecord = buildHistoricalMeasurementRecord({
      composed,
      candles: invHit,
      cohort,
    })!;
    assert.equal(invRecord.outcome!.replay.outcome, "INVALIDATION_TOUCHED");

    const amb = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1, low: inv - 1 })
        : followCandle(last, { low: target - 1, high: inv + 1 }),
    ]);
    const ambRecord = buildHistoricalMeasurementRecord({
      composed,
      candles: amb,
      cohort,
    })!;
    assert.equal(ambRecord.outcome!.replay.outcome, "AMBIGUOUS");
  });

  it("G: NO_TOUCH when future window has no touch", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const neutral = extendCandles(prefix, [
      followCandle(last, { high: last.high, low: last.low, close: last.close }),
      followCandle(last, { high: last.high, low: last.low, close: last.close }),
    ]);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: neutral,
      cohort,
      horizonBars: 2,
    })!;
    assert.equal(record.outcome!.replay.outcome, "NO_TOUCH");
  });

  it("H: NO_FUTURE_DATA at last index", () => {
    const last = DEMO_OHLCV.length - 1;
    const composed = composeProductionWaveScannerForSymbol({
      ...baseComposeInput,
      composeOptions: { evaluationBarIndex: last },
    });
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    })!;
    assert.equal(record.outcome!.futureBarsAvailable, 0);
    assert.equal(record.outcome!.replay.outcome, "NO_FUTURE_DATA");
  });

  it("I: partial horizon futureBarsAvailable=5", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const futures = Array.from({ length: 5 }, (_, i) =>
      followCandle(last, {
        time: last.time + (i + 1) * 3_600_000,
        close: last.close,
      })
    );
    const candles = extendCandles(prefix, futures);
    assert.equal(
      futureBarsAvailableAfterEvaluationBar(historicalE, candles.length),
      5
    );
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles,
      cohort,
      horizonBars: 24,
    })!;
    assert.equal(record.outcome!.futureBarsAvailable, 5);
  });

  it("J: horizon override 10", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
      horizonBars: 10,
    })!;
    assert.equal(record.horizonBars, 10);
    assert.equal(record.outcome!.replay.horizonBars, 10);
  });

  it("K: trade evaluation and outcome remain independent dimensions", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const dir = composed.production!.observedDirection!;
    const target = composed.references.target.referencePrice!;
    const candles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1 })
        : followCandle(last, { low: target - 1 }),
    ]);
    const record = buildHistoricalMeasurementRecord({
      composed,
      candles,
      cohort,
    })!;
    assert.equal(record.outcome!.replay.outcome, "TARGET_TOUCHED");
    assert.notEqual(record.evaluation.tradeEvaluation.status, "PASSED");
  });

  it("L: outcome replay does not mutate evaluation fields", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const before = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    })!;
    const evalBefore = evaluationFingerprint(before);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const dir = composed.production!.observedDirection!;
    const target = composed.references.target.referencePrice!;
    const wild = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 50, low: last.low - 50 })
        : followCandle(last, { low: target - 50, high: last.high + 50 }),
    ]);
    const after = buildHistoricalMeasurementRecord({
      composed,
      candles: wild,
      cohort,
    })!;
    assert.deepEqual(evaluationFingerprint(after), evalBefore);
    assert.notEqual(before.outcome!.replay.outcome, after.outcome!.replay.outcome);
  });

  it("M: future mutation leaves evaluation unchanged", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const baseline = buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    })!;
    const mutated = DEMO_OHLCV.map((c, i) =>
      i <= historicalE ? c : { ...c, high: c.high * 5, low: c.low / 5 }
    );
    const after = buildHistoricalMeasurementRecord({
      composed,
      candles: mutated,
      cohort,
    })!;
    assert.deepEqual(
      evaluationFingerprint(baseline),
      evaluationFingerprint(after)
    );
  });

  it("N: evaluation bar touch does not count in outcome", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const input = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV,
      { horizonBars: 1 }
    );
    assert.ok(input);
    const onlyEval = replayProspectiveSetupOutcome({
      ...input!,
      evaluationBarIndex: historicalE,
      candles: DEMO_OHLCV.slice(0, historicalE + 1),
    });
    assert.equal(onlyEval.outcome, "NO_FUTURE_DATA");
  });

  it("O–P: no alarm or presentation imports", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-measurement-assembly.ts"),
      "utf8"
    );
    assert.ok(!src.includes("alarm"));
    assert.ok(!src.includes("formatOutcomeReplay"));
    assert.ok(!src.includes("WaveScannerOutcomeReplayPresentation"));
    assert.ok(!src.includes("wave-scanner-page"));
  });

  it("Q: B-8b compose fingerprint unchanged by assembly", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const fingerprint = {
      evaluationBarIndex: composed.evaluationBarIndex,
      references: composed.references,
      productionId: composed.production?.id,
    };
    buildHistoricalMeasurementRecord({
      composed,
      candles: DEMO_OHLCV,
      cohort,
    });
    const again = composeProductionWaveScannerForSymbol(baseComposeInput);
    assert.deepEqual(
      {
        evaluationBarIndex: again.evaluationBarIndex,
        references: again.references,
        productionId: again.production?.id,
      },
      fingerprint
    );
  });

  it("walk-forward measurement orchestration", () => {
    const result = runHistoricalMeasurementWalkForward({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 22,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      cohort,
    });
    assert.equal(result.records.length, 3);
    assert.ok(result.records.every((r) => r.outcome !== null));
  });
});
