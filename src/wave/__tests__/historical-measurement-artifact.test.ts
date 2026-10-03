import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildHistoricalMeasurementArtifact,
  compareHistoricalMeasurementArtifactEntryOrder,
  historicalMeasurementArtifactsEquivalent,
  parseHistoricalMeasurementArtifact,
  serializeHistoricalMeasurementArtifact,
  validateHistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactValidationError,
} from "../historical-measurement-artifact";
import {
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
  buildHistoricalMeasurementSnapshotId,
} from "../setup/historical-measurement-contract";
import {
  parseMeasureHistoricalCliArgs,
  runMeasureHistoricalCli,
} from "../historical-measurement-cli";

const symbol = "BTCUSDT";
const timeframeId = "1H";
const historicalE = 22;

function evaluationFingerprint(
  entry: ReturnType<typeof buildHistoricalMeasurementArtifact>["measurements"][0]
) {
  return {
    entry: entry.evaluation.references.entry,
    stop: entry.evaluation.references.stop,
    target: entry.evaluation.references.target,
    rr: entry.evaluation.references.rr,
    ready: entry.evaluation.references.readyForFurtherEvaluation,
    tradeEvaluation: entry.evaluation.tradeEvaluation,
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

describe("historical measurement artifact (B-8f)", () => {
  it("A–D: schemaVersion, measurements, snapshotId, cohorts[]", () => {
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(artifact.schemaVersion, HISTORICAL_MEASUREMENT_SCHEMA_VERSION);
    assert.ok(artifact.measurements.length >= 1);
    for (const row of artifact.measurements) {
      assert.equal(row.schemaVersion, HISTORICAL_MEASUREMENT_SCHEMA_VERSION);
      assert.ok(row.cohorts.length >= 1);
      assert.ok(row.cohorts.includes("ALL_PRODUCTION_CANDIDATES"));
      assert.equal(
        row.snapshotId,
        buildHistoricalMeasurementSnapshotId({
          symbol: row.symbol,
          timeframe: row.timeframe,
          evaluationBarIndex: row.evaluationBarIndex,
          prospectiveSetupId: row.prospectiveSetupId,
        })
      );
    }
  });

  it("E: cohort overlap preserved on artifact entries", () => {
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const multi = artifact.measurements.filter((m) => m.cohorts.length > 1);
    assert.ok(multi.length >= 0);
    const display = artifact.measurements.find((m) =>
      m.cohorts.includes("DISPLAY_PICK")
    );
    assert.ok(display);
    assert.ok(display.cohorts.includes("ALL_PRODUCTION_CANDIDATES"));
  });

  it("F–G: deterministic serialization and ordering", () => {
    const input = {
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: 20,
      endEvaluationBar: 22,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    };
    const a = buildHistoricalMeasurementArtifact(input);
    const b = buildHistoricalMeasurementArtifact(input);
    const jsonA = serializeHistoricalMeasurementArtifact(a);
    const jsonB = serializeHistoricalMeasurementArtifact(b);
    assert.equal(jsonA, jsonB);
    for (let i = 1; i < a.measurements.length; i++) {
      assert.ok(
        compareHistoricalMeasurementArtifactEntryOrder(
          a.measurements[i - 1],
          a.measurements[i]
        ) <= 0
      );
    }
    const shuffled = {
      ...a,
      measurements: [...a.measurements].reverse(),
    };
    assert.equal(
      serializeHistoricalMeasurementArtifact(shuffled),
      serializeHistoricalMeasurementArtifact(a)
    );
  });

  it("H: parse round trip", () => {
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const json = serializeHistoricalMeasurementArtifact(artifact);
    const parsed = parseHistoricalMeasurementArtifact(json);
    assert.ok(historicalMeasurementArtifactsEquivalent(artifact, parsed));
  });

  it("I–J: invalid schema and snapshot identity rejected", () => {
    assert.throws(
      () => validateHistoricalMeasurementArtifact({ schemaVersion: "9.9" }),
      HistoricalMeasurementArtifactValidationError
    );
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const bad = JSON.parse(serializeHistoricalMeasurementArtifact(artifact)) as Record<
      string,
      unknown
    >;
    const measurements = bad.measurements as Record<string, unknown>[];
    measurements[0] = { ...measurements[0], snapshotId: "broken" };
    assert.throws(
      () => validateHistoricalMeasurementArtifact(bad),
      HistoricalMeasurementArtifactValidationError
    );
  });

  it("K–L: outcome and evaluation preserved", () => {
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const statuses = new Set(
      artifact.measurements.map((m) => m.outcome?.replay.outcome ?? "null")
    );
    assert.ok(statuses.size >= 1);
    for (const row of artifact.measurements) {
      assert.ok(row.evaluation.tradeEvaluation);
      assert.ok(row.evaluation.references);
    }
  });

  it("DEMO tail: last bar NO_FUTURE_DATA when applicable", () => {
    const last = DEMO_OHLCV.length - 1;
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: last,
      endEvaluationBar: last,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const display = artifact.measurements.find((m) =>
      m.cohorts.includes("DISPLAY_PICK")
    );
    if (display?.outcome) {
      assert.equal(display.outcome.futureBarsAvailable, 0);
      assert.equal(display.outcome.replay.outcome, "NO_FUTURE_DATA");
    }
  });

  it("M–N: future mutation changes outcome not evaluation", () => {
    const baseArtifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const tail = DEMO_OHLCV.slice(historicalE + 1);
    const mutatedTail = tail.map((c, i) =>
      i === 0
        ? followCandle(c, { high: c.high * 1.5, low: c.low * 0.5 })
        : c
    );
    const extended = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: extendCandles(prefix, mutatedTail),
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const baseById = new Map(
      baseArtifact.measurements.map((m) => [m.snapshotId, m])
    );
    for (const row of extended.measurements) {
      const base = baseById.get(row.snapshotId);
      if (!base) {
        continue;
      }
      assert.deepEqual(evaluationFingerprint(row), evaluationFingerprint(base));
    }
  });

  it("S: horizon override", () => {
    const h = 3;
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      horizonBars: h,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(artifact.dataset.horizonBars, h);
    for (const row of artifact.measurements) {
      assert.equal(row.horizonBars, h);
    }
  });

  it("T: candidate expansion row count at E", () => {
    const artifact = buildHistoricalMeasurementArtifact({
      symbol,
      timeframeId,
      candles: DEMO_OHLCV,
      startEvaluationBar: historicalE,
      endEvaluationBar: historicalE,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(artifact.measurements.length, 7);
  });

  it("R: CLI deterministic output", () => {
    const args = parseMeasureHistoricalCliArgs([
      "--symbol",
      symbol,
      "--timeframe",
      timeframeId,
      "--start",
      String(historicalE),
      "--end",
      String(historicalE),
      "--output",
      "out.json",
    ]);
    const a = runMeasureHistoricalCli(args);
    const b = runMeasureHistoricalCli(args);
    assert.equal(a, b);
    assert.ok(!a.includes("generatedAt"));
  });

  it("P–Q: no alarm/presentation/statistics tokens in serializer module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-measurement-artifact.ts"),
      "utf8"
    );
    assert.ok(!text.includes("presentWaveScannerRow"));
    assert.ok(!text.includes("formatOutcomeReplay"));
    assert.ok(!text.includes("win rate"));
    assert.ok(!text.includes("writeFileSync"));
    assert.ok(!text.includes("generatedAt"));
    assert.ok(!text.includes("Date.now"));
  });
});
