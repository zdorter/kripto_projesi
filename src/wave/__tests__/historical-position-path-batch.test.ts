import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../types";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { composeProductionWaveScannerForSymbol } from "../production-wave-scanner";
import { buildHistoricalMeasurementRecord } from "../historical-measurement-assembly";
import { sortHistoricalMeasurementArtifactEntries } from "../historical-measurement-artifact";
import type { HistoricalMeasurementArtifact } from "../setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementArtifactEntry } from "../setup/historical-measurement-artifact-types";
import type { HistoricalMeasurementRecord } from "../setup/historical-measurement-types";
import { HISTORICAL_MEASUREMENT_SCHEMA_VERSION } from "../setup/historical-measurement-contract";
import { selectHistoricalMeasurementEntries } from "../historical-measurement-statistics-filter";
import { resolveHistoricalPositionPathV1 } from "../historical-position-path";
import {
  HistoricalPositionPathBatchValidationError,
  runHistoricalPositionPathBatch,
} from "../historical-position-path-batch";
import { HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION } from "../historical-position-path-batch-types";
import { buildProspectiveSetupOutcomeReplayInput } from "../setup/prospective-setup-outcome-replay-input";
import { replayProspectiveSetupOutcome } from "../setup/prospective-setup-outcome-replay";
import { resolveProspectiveStructuralInvalidation } from "../setup/prospective-structural-invalidation";

const cohort = "ALL_PRODUCTION_CANDIDATES" as const;
const historicalE = 22;

function recordToEntry(
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

function artifactFromMeasurements(
  measurements: HistoricalMeasurementArtifactEntry[],
  candles: Candle[]
): HistoricalMeasurementArtifact {
  const first = measurements[0];
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    dataset: {
      symbol: first?.symbol ?? "BTCUSDT",
      timeframe: first?.timeframe ?? "1H",
      candleCount: candles.length,
      startEvaluationBar: null,
      endEvaluationBar: null,
      horizonBars: first?.horizonBars ?? 24,
      rangeError: null,
    },
    measurements: sortHistoricalMeasurementArtifactEntries(measurements),
  };
}

function buildArtifactFromComposed(
  composed: ReturnType<typeof composeProductionWaveScannerForSymbol>,
  candles: Candle[],
  horizonBars?: number
) {
  const record = buildHistoricalMeasurementRecord({
    composed,
    candles,
    cohort,
    horizonBars,
  });
  assert.ok(record);
  return artifactFromMeasurements([recordToEntry(record)], candles);
}

describe("historical position path batch (B-10b)", () => {
  const baseComposeInput = {
    symbol: "BTCUSDT",
    candles: DEMO_OHLCV,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    composeOptions: { evaluationBarIndex: historicalE },
  };

  it("A–B: single and multiple entries", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const art = buildArtifactFromComposed(composed, DEMO_OHLCV);
    const single = runHistoricalPositionPathBatch({
      artifact: art,
      candles: DEMO_OHLCV,
    });
    assert.equal(single.results.length, 1);

    const composed2 = composeProductionWaveScannerForSymbol({
      ...baseComposeInput,
      composeOptions: { evaluationBarIndex: historicalE - 1 },
    });
    const r2 = buildHistoricalMeasurementRecord({
      composed: composed2,
      candles: DEMO_OHLCV,
      cohort,
    });
    assert.ok(r2);
    const art2 = artifactFromMeasurements(
      [
        recordToEntry(
          buildHistoricalMeasurementRecord({
            composed,
            candles: DEMO_OHLCV,
            cohort,
          })!
        ),
        recordToEntry(r2),
      ],
      DEMO_OHLCV
    );
    const batch = runHistoricalPositionPathBatch({
      artifact: art2,
      candles: DEMO_OHLCV,
    });
    assert.equal(batch.results.length, 2);
    assert.equal(batch.input.filteredSnapshotCount, 2);
  });

  it("C–D: cohort filter and OR semantics", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const display = recordToEntry(
      buildHistoricalMeasurementRecord({
        composed,
        candles: DEMO_OHLCV,
        cohort,
      })!
    );
    display.cohorts = ["DISPLAY_PICK"];
    const ready = recordToEntry(
      buildHistoricalMeasurementRecord({
        composed,
        candles: DEMO_OHLCV,
        cohort,
      })!
    );
    ready.cohorts = ["READY_REFERENCES"];
    ready.prospectiveSetupId = "ready-1";
    ready.snapshotId = `BTCUSDT:1H:${ready.evaluationBarIndex}:ready-1`;
    const art = artifactFromMeasurements([display, ready], DEMO_OHLCV);
    const filtered = runHistoricalPositionPathBatch({
      artifact: art,
      candles: DEMO_OHLCV,
      filter: { cohorts: ["DISPLAY_PICK", "READY_REFERENCES"] },
    });
    assert.equal(
      filtered.input.filteredSnapshotCount,
      selectHistoricalMeasurementEntries(art, {
        cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
      }).length
    );
    assert.equal(filtered.results.length, 2);
  });

  it("E–F: empty artifact and filtered empty", () => {
    const emptyArt = artifactFromMeasurements([], DEMO_OHLCV);
    const empty = runHistoricalPositionPathBatch({
      artifact: emptyArt,
      candles: DEMO_OHLCV,
    });
    assert.equal(empty.results.length, 0);
    assert.equal(empty.input.totalSnapshots, 0);

    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const art = buildArtifactFromComposed(composed, DEMO_OHLCV);
    const none = runHistoricalPositionPathBatch({
      artifact: art,
      candles: DEMO_OHLCV,
      filter: { cohorts: ["DISPLAY_PICK"] },
    });
    assert.equal(none.results.length, 0);
  });

  it("G + H: deterministic ordering and snapshotId preserved", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const r1 = recordToEntry(
      buildHistoricalMeasurementRecord({ composed, candles: DEMO_OHLCV, cohort })!
    );
    const composed2 = composeProductionWaveScannerForSymbol({
      ...baseComposeInput,
      composeOptions: { evaluationBarIndex: historicalE - 2 },
    });
    const r2 = recordToEntry(
      buildHistoricalMeasurementRecord({
        composed: composed2,
        candles: DEMO_OHLCV,
        cohort,
      })!
    );
    const art = artifactFromMeasurements([r2, r1], DEMO_OHLCV);
    const a = runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV });
    const b = runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV });
    assert.deepEqual(a, b);
    assert.ok(
      a.results[0].snapshotId <= a.results[1].snapshotId ||
        a.results[0].evaluationBarIndex! <= a.results[1].evaluationBarIndex!
    );
    assert.equal(a.results[0].snapshotId, r2.snapshotId);
  });

  it("I: same prospectiveSetupId different E → two results", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const e1 = recordToEntry(
      buildHistoricalMeasurementRecord({ composed, candles: DEMO_OHLCV, cohort })!
    );
    const e2 = {
      ...e1,
      evaluationBarIndex: historicalE - 1,
      snapshotId: `BTCUSDT:1H:${historicalE - 1}:${e1.prospectiveSetupId}`,
    };
    const art = artifactFromMeasurements([e1, e2], DEMO_OHLCV);
    const batch = runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV });
    assert.equal(batch.results.length, 2);
    assert.notEqual(batch.results[0].snapshotId, batch.results[1].snapshotId);
  });

  it("J: overlapping future windows measured independently", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const entries = [historicalE, historicalE - 1].map((bar) => {
      const c = composeProductionWaveScannerForSymbol({
        ...baseComposeInput,
        composeOptions: { evaluationBarIndex: bar },
      });
      return recordToEntry(
        buildHistoricalMeasurementRecord({ composed: c, candles: DEMO_OHLCV, cohort })!
      );
    });
    const art = artifactFromMeasurements(entries, DEMO_OHLCV);
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV }).results
        .length,
      2
    );
  });

  it("K–P: outcome varieties via assembly paths", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const dir = composed.production!.observedDirection as "BULLISH" | "BEARISH";
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const inv = resolveProspectiveStructuralInvalidation(
      composed.historicalSetup!
    ).invalidationPrice!;

    const targetCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1 })
        : followCandle(last, { low: target - 1 }),
    ]);
    const targetArt = buildArtifactFromComposed(composed, targetCandles);
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: targetArt, candles: targetCandles })
        .results[0].outcome,
      "TARGET_TOUCHED"
    );

    const invCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { low: inv - 1 })
        : followCandle(last, { high: inv + 1 }),
    ]);
    const invArt = buildArtifactFromComposed(composed, invCandles);
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: invArt, candles: invCandles })
        .results[0].outcome,
      "INVALIDATION_TOUCHED"
    );

    const ambCandles = extendCandles(prefix, [
      dir === "BULLISH"
        ? followCandle(last, { high: target + 1, low: inv - 1 })
        : followCandle(last, { low: target - 1, high: inv + 1 }),
    ]);
    const ambArt = buildArtifactFromComposed(composed, ambCandles);
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: ambArt, candles: ambCandles })
        .results[0].outcome,
      "AMBIGUOUS"
    );

    const noTouchArt = buildArtifactFromComposed(composed, DEMO_OHLCV, 2);
    const noTouch = runHistoricalPositionPathBatch({
      artifact: noTouchArt,
      candles: DEMO_OHLCV,
      horizonBars: 2,
    });
    assert.equal(noTouch.results[0].outcome, "NO_TOUCH");

    const lastBar = DEMO_OHLCV.length - 1;
    const atEnd = composeProductionWaveScannerForSymbol({
      ...baseComposeInput,
      composeOptions: { evaluationBarIndex: lastBar },
    });
    const endArt = buildArtifactFromComposed(atEnd, DEMO_OHLCV);
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: endArt, candles: DEMO_OHLCV })
        .results[0].outcome,
      "NO_FUTURE_DATA"
    );

    const insArt = buildArtifactFromComposed(composed, DEMO_OHLCV);
    insArt.measurements[0].evaluation.production = null;
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: insArt, candles: DEMO_OHLCV })
        .results[0].outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("Q: UNRESOLVED direction", () => {
    const art = buildArtifactFromComposed(
      composeProductionWaveScannerForSymbol(baseComposeInput),
      DEMO_OHLCV
    );
    art.measurements[0].evaluation.production!.observedDirection = "UNRESOLVED";
    assert.equal(
      runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV })
        .results[0].outcome,
      "INSUFFICIENT_CONTEXT"
    );
  });

  it("R–S: horizon override vs entry horizon", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const prefix = DEMO_OHLCV.slice(0, historicalE + 1);
    const last = prefix[prefix.length - 1]!;
    const target = composed.references.target.referencePrice!;
    const candles = extendCandles(prefix, [
      followCandle(last, {}),
      followCandle(last, {}),
      followCandle(last, { high: target + 1 }),
    ]);
    const art = buildArtifactFromComposed(composed, candles, 24);
    const entry = art.measurements[0];
    const withOverride = runHistoricalPositionPathBatch({
      artifact: art,
      candles,
      horizonBars: 2,
    });
    assert.equal(withOverride.results[0].outcome, "NO_TOUCH");
    assert.equal(
      withOverride.results[0].outcome,
      resolveHistoricalPositionPathV1({ entry, candles, horizonBars: 2 }).outcome
    );
    const entryHorizon = runHistoricalPositionPathBatch({
      artifact: art,
      candles,
    });
    assert.deepEqual(
      entryHorizon.results[0],
      resolveHistoricalPositionPathV1({ entry, candles })
    );
  });

  it("T–W: immutability", () => {
    const art = buildArtifactFromComposed(
      composeProductionWaveScannerForSymbol(baseComposeInput),
      DEMO_OHLCV
    );
    const candles = [...DEMO_OHLCV];
    const filter = { cohorts: ["ALL_PRODUCTION_CANDIDATES" as const] };
    const beforeArt = JSON.stringify(art);
    const beforeCandles = JSON.stringify(candles);
    const beforeFilter = JSON.stringify(filter);
    runHistoricalPositionPathBatch({ artifact: art, candles, filter });
    assert.equal(JSON.stringify(art), beforeArt);
    assert.equal(JSON.stringify(candles), beforeCandles);
    assert.equal(JSON.stringify(filter), beforeFilter);
  });

  it("X–Y: B-6 and B-10a parity", () => {
    const composed = composeProductionWaveScannerForSymbol(baseComposeInput);
    const art = buildArtifactFromComposed(composed, DEMO_OHLCV);
    const entry = art.measurements[0];
    const batch = runHistoricalPositionPathBatch({
      artifact: art,
      candles: DEMO_OHLCV,
    });
    const direct = resolveHistoricalPositionPathV1({
      entry,
      candles: DEMO_OHLCV,
    });
    assert.deepEqual(batch.results[0], direct);
    const replayInput = buildProspectiveSetupOutcomeReplayInput(
      composed,
      DEMO_OHLCV
    );
    assert.ok(replayInput);
    const b6 = replayProspectiveSetupOutcome(replayInput);
    assert.equal(batch.results[0].outcome, b6.outcome);
  });

  it("Z–AE: evaluation and references unchanged", () => {
    const art = buildArtifactFromComposed(
      composeProductionWaveScannerForSymbol(baseComposeInput),
      DEMO_OHLCV
    );
    const te = JSON.stringify(art.measurements[0].evaluation.tradeEvaluation);
    const refs = JSON.stringify(art.measurements[0].evaluation.references);
    const ready = art.measurements[0].evaluation.references.readyForFurtherEvaluation;
    runHistoricalPositionPathBatch({ artifact: art, candles: DEMO_OHLCV });
    assert.equal(JSON.stringify(art.measurements[0].evaluation.tradeEvaluation), te);
    assert.equal(JSON.stringify(art.measurements[0].evaluation.references), refs);
    assert.equal(
      art.measurements[0].evaluation.references.readyForFurtherEvaluation,
      ready
    );
  });

  it("candle count mismatch throws", () => {
    const art = buildArtifactFromComposed(
      composeProductionWaveScannerForSymbol(baseComposeInput),
      DEMO_OHLCV
    );
    assert.throws(
      () =>
        runHistoricalPositionPathBatch({
          artifact: art,
          candles: DEMO_OHLCV.slice(0, 10),
        }),
      HistoricalPositionPathBatchValidationError
    );
  });

  it("AM: no WIN/LOSS fields on batch result", () => {
    const batch = runHistoricalPositionPathBatch({
      artifact: buildArtifactFromComposed(
        composeProductionWaveScannerForSymbol(baseComposeInput),
        DEMO_OHLCV
      ),
      candles: DEMO_OHLCV,
    });
    assert.equal(
      batch.batchSchemaVersion,
      HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION
    );
    assert.ok(!("win" in batch));
    assert.ok(!("pnl" in batch));
    assert.equal(batch.input.candleCount, DEMO_OHLCV.length);
    assert.equal(batch.input.artifactDatasetCandleCount, DEMO_OHLCV.length);
  });
});
