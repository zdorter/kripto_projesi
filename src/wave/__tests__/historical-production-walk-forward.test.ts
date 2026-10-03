import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import {
  HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION,
  runHistoricalProductionWalkForward,
  validateHistoricalProductionWalkForwardRange,
} from "../historical-production-walk-forward";

function walkFingerprint(
  result: ReturnType<typeof runHistoricalProductionWalkForward>
) {
  return result.rows.map((row) => ({
    e: row.evaluationBarIndex,
    evalIdx: row.composed.evaluationBarIndex,
    evalTime: row.composed.evaluationBarTime,
    loadError: row.composed.loadError,
    entry: row.composed.references.entry.referencePrice,
    productionId: row.composed.production?.id ?? null,
  }));
}

describe("historical production walk-forward (B-8c)", () => {
  const symbol = "BTCUSDT";
  const timeframeId = "1H";
  const historicalE = 22;
  const lastIndex = DEMO_OHLCV.length - 1;

  const baseInput = {
    symbol,
    timeframeId,
    candles: DEMO_OHLCV,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  };

  it("A: single E (start === end)", () => {
    const result = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
    });
    assert.equal(result.rangeError, null);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]!.evaluationBarIndex, historicalE);
    assert.equal(result.rows[0]!.composed.evaluationBarIndex, historicalE);
  });

  it("B–C: multiple sequential E progression", () => {
    const start = 20;
    const end = 23;
    const result = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: start,
      endEvaluationBar: end,
    });
    assert.equal(result.rows.length, end - start + 1);
    for (let i = 0; i < result.rows.length; i++) {
      assert.equal(result.rows[i]!.evaluationBarIndex, start + i);
      assert.equal(result.rows[i]!.composed.evaluationBarIndex, start + i);
    }
  });

  it("D: start/end validation (no silent clamp)", () => {
    assert.equal(
      validateHistoricalProductionWalkForwardRange(DEMO_OHLCV, -1, 5).ok,
      false
    );
    assert.equal(
      runHistoricalProductionWalkForward({
        ...baseInput,
        startEvaluationBar: -1,
        endEvaluationBar: 5,
      }).rangeError,
      "START_EVALUATION_BAR_OUT_OF_RANGE"
    );
    assert.equal(
      runHistoricalProductionWalkForward({
        ...baseInput,
        startEvaluationBar: 0,
        endEvaluationBar: DEMO_OHLCV.length,
      }).rangeError,
      "END_EVALUATION_BAR_OUT_OF_RANGE"
    );
    assert.equal(
      runHistoricalProductionWalkForward({
        ...baseInput,
        startEvaluationBar: 10,
        endEvaluationBar: 5,
      }).rangeError,
      "START_AFTER_END"
    );
    assert.equal(
      runHistoricalProductionWalkForward({
        ...baseInput,
        candles: [],
        startEvaluationBar: 0,
        endEvaluationBar: 0,
      }).rangeError,
      "EMPTY_CANDLES"
    );
    assert.equal(
      runHistoricalProductionWalkForward({
        ...baseInput,
        startEvaluationBar: 1.5,
        endEvaluationBar: 2,
      }).rangeError,
      "INVALID_EVALUATION_BAR"
    );
  });

  it("E: deterministic output", () => {
    const a = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
    });
    const b = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: 20,
      endEvaluationBar: 23,
    });
    assert.deepEqual(walkFingerprint(a), walkFingerprint(b));
    assert.equal(
      a.schemaVersion,
      HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION
    );
  });

  it("F: future mutation at E unchanged across runner", () => {
    const baseline = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
    });
    const mutated = DEMO_OHLCV.map((c, i) =>
      i <= historicalE
        ? c
        : { ...c, high: c.high * 9, low: c.low / 9, close: c.close + 500 }
    );
    const after = runHistoricalProductionWalkForward({
      ...baseInput,
      candles: mutated,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
    });
    assert.deepEqual(
      walkFingerprint(baseline)[0],
      walkFingerprint(after)[0]
    );
  });

  it("G: E+1 evaluation includes next candle in evaluation bar", () => {
    const atE = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
    });
    const atNext = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: historicalE + 1,
      endEvaluationBar: historicalE + 1,
    });
    assert.equal(atE.rows[0]!.composed.evaluationBarTime, DEMO_OHLCV[historicalE]!.time);
    assert.equal(
      atNext.rows[0]!.composed.evaluationBarTime,
      DEMO_OHLCV[historicalE + 1]!.time
    );
    assert.notEqual(
      atE.rows[0]!.composed.evaluationBarTime,
      atNext.rows[0]!.composed.evaluationBarTime
    );
  });

  it("H: independent snapshots (two runs, no shared mutation)", () => {
    const candlesCopy = DEMO_OHLCV.map((c) => ({ ...c }));
    const first = runHistoricalProductionWalkForward({
      ...baseInput,
      candles: candlesCopy,
      startEvaluationBar: 20,
      endEvaluationBar: 22,
    });
    candlesCopy[22] = {
      ...candlesCopy[22]!,
      close: candlesCopy[22]!.close + 1,
    };
    const second = runHistoricalProductionWalkForward({
      ...baseInput,
      candles: candlesCopy,
      startEvaluationBar: 20,
      endEvaluationBar: 22,
    });
    assert.notDeepEqual(
      first.rows[2]!.composed.references.entry.referencePrice,
      second.rows[2]!.composed.references.entry.referencePrice
    );
    assert.deepEqual(
      first.rows[0]!.composed.evaluationBarIndex,
      second.rows[0]!.composed.evaluationBarIndex
    );
  });

  it("I: no outcome replay in runner module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-production-walk-forward.ts"),
      "utf8"
    );
    assert.ok(!src.includes("replayProspectiveSetupOutcome"));
    assert.ok(!src.includes("enrichProspectiveSetupOutcomeReplay"));
    assert.ok(!src.includes("outcomeReplay"));
  });

  it("J: no alarm references", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-production-walk-forward.ts"),
      "utf8"
    );
    assert.ok(!src.includes("alarm"));
  });

  it("K: no cohort filtering", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-production-walk-forward.ts"),
      "utf8"
    );
    assert.ok(!src.includes("cohort"));
    assert.ok(!src.includes("HistoricalMeasurement"));
    assert.ok(!src.includes("selectDisplayProspectiveCandidate"));
  });

  it("L: last walk row matches direct compose at lastIndex", () => {
    const walk = runHistoricalProductionWalkForward({
      ...baseInput,
      startEvaluationBar: lastIndex,
      endEvaluationBar: lastIndex,
    });
    const direct = composeProductionWaveScannerForSymbol(baseInput);
    assert.deepEqual(
      walk.rows[0]!.composed.references,
      direct.references
    );
    assert.equal(walk.rows[0]!.composed.evaluationBarIndex, direct.evaluationBarIndex);
  });

  it("M: B-8b future mutation compose test semantics preserved", () => {
    const baseline = composeProductionWaveScannerForSymbol({
      ...baseInput,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    const mutatedCandles = DEMO_OHLCV.map((c, i) =>
      i <= historicalE ? c : { ...c, high: c.high * 3 + 999, low: c.low * 0.1 - 999 }
    );
    const after = composeProductionWaveScannerForSymbol({
      ...baseInput,
      candles: mutatedCandles,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.equal(baseline.references.entry.referencePrice, after.references.entry.referencePrice);
  });
});
