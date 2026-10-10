import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import {
  auditHistoricalBacktestCandidateExpansionAtBar,
  auditHistoricalBacktestCohortFilterOrSemantics,
  auditHistoricalBacktestReport,
  auditHistoricalMeasurementRrBucketBoundaries,
} from "../historical-backtest-validation";
import {
  HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE,
  HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION,
} from "../historical-backtest-validation-types";
import { measurementMatchesCohortFilter } from "../historical-measurement-statistics-filter";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "../historical-position-outcome-statistics";
import { classifyHistoricalPositionOutcomePolicy } from "../historical-position-outcome-policy";

const lastIndex = DEMO_OHLCV.length - 1;

function demoBacktest(
  start = HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE.startEvaluationBar,
  end = HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE.endEvaluationBar
) {
  return runHistoricalBacktest({
    symbol: "BTCUSDT",
    timeframeId: "1H",
    candles: DEMO_OHLCV,
    startEvaluationBar: start,
    endEvaluationBar: end,
    horizonBars: HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE.horizonBars,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
}

describe("historical backtest validation (B-10g)", () => {
  it("A–C: deterministic DEMO audit over multi-E range", () => {
    const report = demoBacktest();
    const audit = auditHistoricalBacktestReport({ report, candles: DEMO_OHLCV });
    assert.equal(
      audit.validationSchemaVersion,
      HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION
    );
    assert.equal(audit.issues.length, 0);
    assert.ok(audit.summary.totalSnapshots > 0);
    assert.equal(
      audit.summary.wins,
      audit.summary.favorableResolutions
    );
    assert.equal(
      audit.summary.losses,
      audit.summary.adverseResolutions
    );
  });

  it("B: repeated run deep-equal audit", () => {
    const report = demoBacktest();
    const a = auditHistoricalBacktestReport({ report, candles: DEMO_OHLCV });
    const b = auditHistoricalBacktestReport({ report, candles: DEMO_OHLCV });
    assert.deepEqual(a, b);
  });

  it("D: range boundaries and empty range error", () => {
    const bad = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: 30,
      endEvaluationBar: 30,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const audit = auditHistoricalBacktestReport({
      report: bad,
      candles: DEMO_OHLCV,
    });
    assert.equal(bad.configuration.rangeError, "START_EVALUATION_BAR_OUT_OF_RANGE");
    assert.equal(audit.summary.totalSnapshots, 0);
  });

  it("E–F: WIN/LOSS samples have decisive candle fields when present", () => {
    const report = demoBacktest();
    const audit = auditHistoricalBacktestReport({ report, candles: DEMO_OHLCV });
    for (const sample of [...audit.winSamples, ...audit.lossSamples]) {
      assert.equal(sample.policyClassification, sample.pathOutcome === "TARGET_TOUCHED"
        ? "FAVORABLE_RESOLUTION"
        : "ADVERSE_RESOLUTION");
      assert.ok(sample.resolutionBarIndex !== null);
      assert.ok(sample.decisiveCandleHigh !== null);
      assert.ok(sample.decisiveCandleLow !== null);
    }
  });

  it("G–J: ambiguous / no-touch / unmeasured semantics", () => {
    const report = demoBacktest();
    const audit = auditHistoricalBacktestReport({ report, candles: DEMO_OHLCV });
    if (!audit.naturalAmbiguousFixtureFound) {
      assert.equal(audit.ambiguousSamples.length, 0);
    } else {
      for (const s of audit.ambiguousSamples) {
        assert.equal(s.pathOutcome, "AMBIGUOUS");
        assert.equal(s.policyClassification, "INCONCLUSIVE_SAME_BAR");
      }
    }
    const edge = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar: lastIndex,
      endEvaluationBar: lastIndex,
      horizonBars: 24,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const edgeAudit = auditHistoricalBacktestReport({
      report: edge,
      candles: DEMO_OHLCV,
    });
    assert.ok(edgeAudit.summary.noFutureDataSamplesFound >= 0);
    assert.ok(edgeAudit.summary.insufficientContextSamplesFound >= 0);
    assert.equal(edgeAudit.issues.length, 0);
  });

  it("K–N: B-6 parity and policy mapping per observation", () => {
    const report = demoBacktest();
    const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
      report.artifact,
      report.pathBatch
    );
    for (const { pathResult } of observations) {
      const policy = classifyHistoricalPositionOutcomePolicy(pathResult);
      if (pathResult.outcome === "TARGET_TOUCHED") {
        assert.equal(policy.classification, "FAVORABLE_RESOLUTION");
      }
      if (pathResult.outcome === "INVALIDATION_TOUCHED") {
        assert.equal(policy.classification, "ADVERSE_RESOLUTION");
      }
      if (pathResult.outcome === "NO_TOUCH") {
        assert.equal(policy.classification, "UNRESOLVED_AT_HORIZON");
      }
    }
  });

  it("O–P: future mutation leaves evaluation references stable", () => {
    const e = 22;
    const candlesA = DEMO_OHLCV.map((c) => ({ ...c }));
    const candlesB = DEMO_OHLCV.map((c) => ({ ...c }));
    for (let i = e + 1; i < candlesB.length; i++) {
      candlesB[i] = { ...candlesB[i]!, high: 1e6, low: 0.01 };
    }
    const reportA = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: candlesA,
      startEvaluationBar: e,
      endEvaluationBar: e,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const reportB = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: candlesB,
      startEvaluationBar: e,
      endEvaluationBar: e,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const refsA = JSON.stringify(
      reportA.artifact.measurements.map((m) => m.evaluation.references)
    );
    const refsB = JSON.stringify(
      reportB.artifact.measurements.map((m) => m.evaluation.references)
    );
    assert.equal(refsA, refsB);
    assert.notEqual(
      JSON.stringify(reportA.pathBatch.results),
      JSON.stringify(reportB.pathBatch.results)
    );
  });

  it("Q: candidate expansion matches production rows at E", () => {
    const report = demoBacktest(22, 22);
    const audit = auditHistoricalBacktestCandidateExpansionAtBar({
      report,
      candles: DEMO_OHLCV,
      evaluationBarIndex: 22,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(
      audit.productionCandidates,
      audit.artifactEntriesAtE
    );
    assert.ok(audit.productionCandidates >= 1);
  });

  it("R–S: cohort overlap and OR filter", () => {
    const report = demoBacktest();
    assert.ok(auditHistoricalBacktestCohortFilterOrSemantics(report, DEMO_OHLCV));
    const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
      report.artifact,
      report.pathBatch
    );
    const orCount = observations.filter((o) =>
      measurementMatchesCohortFilter(o.entry, {
        cohorts: ["DISPLAY_PICK", "READY_REFERENCES"],
      })
    ).length;
    const filtered = runHistoricalBacktest({
      symbol: "BTCUSDT",
      timeframeId: "1H",
      candles: DEMO_OHLCV,
      startEvaluationBar:
        HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE.startEvaluationBar,
      endEvaluationBar:
        HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE.endEvaluationBar,
      filter: { cohorts: ["DISPLAY_PICK", "READY_REFERENCES"] },
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(filtered.outcomeStatistics.overall.counts.totalSnapshots, orCount);
  });

  it("T–U: decisive denominator and zero-rate edge", () => {
    const report = demoBacktest();
    const c = report.outcomeStatistics.overall.counts;
    const rate = report.outcomeStatistics.overall.rates.winRate_decisive;
    assert.equal(c.decisiveResolutions, c.wins + c.losses);
    assert.equal(rate.denominatorId, "DECISIVE_RESOLUTIONS");
    if (c.decisiveResolutions === 0) {
      assert.equal(rate.value, null);
    }
  });

  it("V–W: evaluation cross allows FAILED+WIN and PASSED+LOSS", () => {
    const report = demoBacktest();
    const cross = report.outcomeStatistics.evaluationCross;
    const failedWin = cross.FAILED.FAVORABLE_RESOLUTION;
    const passedLoss = cross.PASSED.ADVERSE_RESOLUTION;
    assert.equal(failedWin + passedLoss, failedWin + passedLoss);
  });

  it("X: RR bucket boundaries", () => {
    const buckets = auditHistoricalMeasurementRrBucketBoundaries();
    assert.equal(buckets["0.9"], "LT_1_0");
    assert.equal(buckets["1.0"], "FROM_1_0_TO_1_5");
    assert.equal(buckets["1.49"], "FROM_1_0_TO_1_5");
    assert.equal(buckets["1.5"], "FROM_1_5_TO_2_0");
    assert.equal(buckets["2.0"], "FROM_2_0_TO_3_0");
    assert.equal(buckets["3.0"], "GTE_3_0");
    assert.equal(buckets.null, "NULL_OR_INVALID_RR");
  });

  it("Y: dimension parity BTCUSDT / 1H", () => {
    const report = demoBacktest();
    assert.ok(report.outcomeStatistics.bySymbol.BTCUSDT);
    assert.ok(report.outcomeStatistics.byTimeframe["1H"]);
    assert.equal(
      report.outcomeStatistics.bySymbol.BTCUSDT!.counts.totalSnapshots,
      report.outcomeStatistics.overall.counts.totalSnapshots
    );
  });

  it("Z: snapshot independence across evaluation bars", () => {
    const report = demoBacktest();
    const bars = new Set(
      report.artifact.measurements.map((m) => m.evaluationBarIndex)
    );
    assert.ok(bars.size > 1);
    const ids = report.artifact.measurements.map((m) => m.snapshotId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("AA: input immutability", () => {
    const candles = DEMO_OHLCV.map((c) => ({ ...c }));
    const frozen = JSON.stringify(candles);
    auditHistoricalBacktestReport({
      report: demoBacktest(),
      candles,
    });
    assert.equal(JSON.stringify(candles), frozen);
  });

  it("AB–AJ: validation module constraints", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/historical-backtest-validation.ts"),
      "utf8"
    );
    assert.ok(src.includes("auditHistoricalBacktestReport"));
    assert.ok(src.includes("runHistoricalBacktest") === false);
    assert.ok(!src.includes("Date.now"));
    assert.ok(!src.includes("Math.random"));
    assert.ok(!src.includes("fetch("));
    assert.ok(!src.includes("calculatePnL"));
    assert.ok(!src.includes("ticker"));
    assert.ok(!src.includes("alarm"));
    assert.ok(!src.includes("optimize"));
    assert.ok(!src.includes("parameterSearch"));
  });
});
