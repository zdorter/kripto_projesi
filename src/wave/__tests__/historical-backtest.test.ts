import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runHistoricalBacktest } from "../historical-backtest";
import { HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION } from "../historical-backtest-types";
import { classifyHistoricalPositionOutcomePolicy } from "../historical-position-outcome-policy";
import { POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0 } from "../historical-position-outcome-policy-types";

const symbol = "BTCUSDT";
const timeframeId = "1H";
const historicalE = 22;

function baseInput(candles = DEMO_OHLCV, start = historicalE, end = historicalE) {
  return {
    symbol,
    timeframeId,
    candles,
    startEvaluationBar: start,
    endEvaluationBar: end,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  };
}

describe("historical backtest runner (B-10f)", () => {
  it("A–C: single and multi evaluation bar deterministic runs", () => {
    const single = runHistoricalBacktest(baseInput());
    assert.equal(single.configuration.rangeError, null);
    assert.equal(single.schemaVersion, HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION);
    assert.ok(single.artifact.measurements.length > 0);
    assert.equal(
      single.pathBatch.results.length,
      single.outcomeStatistics.overall.counts.totalSnapshots
    );

    const multi = runHistoricalBacktest(baseInput(DEMO_OHLCV, 20, 21));
    assert.equal(multi.configuration.evaluatedEvaluationBars, 2);
    assert.ok(multi.artifact.measurements.length >= multi.configuration.evaluatedEvaluationBars);
  });

  it("D–H: range validation without silent clamp", () => {
    const empty = runHistoricalBacktest({
      ...baseInput([]),
      startEvaluationBar: 0,
      endEvaluationBar: 0,
    });
    assert.equal(empty.configuration.rangeError, "EMPTY_CANDLES");
    assert.equal(empty.artifact.measurements.length, 0);
    assert.equal(empty.outcomeStatistics.overall.counts.totalSnapshots, 0);

    const badStart = runHistoricalBacktest({
      ...baseInput(),
      startEvaluationBar: -1,
      endEvaluationBar: 5,
    });
    assert.equal(badStart.configuration.rangeError, "START_EVALUATION_BAR_OUT_OF_RANGE");

    const badEnd = runHistoricalBacktest({
      ...baseInput(),
      startEvaluationBar: 0,
      endEvaluationBar: 9999,
    });
    assert.equal(badEnd.configuration.rangeError, "END_EVALUATION_BAR_OUT_OF_RANGE");

    const inverted = runHistoricalBacktest({
      ...baseInput(),
      startEvaluationBar: 21,
      endEvaluationBar: 20,
    });
    assert.equal(inverted.configuration.rangeError, "START_AFTER_END");
  });

  it("I–K: future candles affect path but not evaluation snapshot identity", () => {
    const e = historicalE;
    const candlesA = DEMO_OHLCV.map((c) => ({ ...c }));
    const candlesB = DEMO_OHLCV.map((c) => ({ ...c }));
    for (let i = e + 1; i < candlesB.length; i++) {
      candlesB[i] = {
        ...candlesB[i]!,
        high: 1_000_000,
        low: 0.01,
      };
    }
    const reportA = runHistoricalBacktest(baseInput(candlesA, e, e));
    const reportB = runHistoricalBacktest(baseInput(candlesB, e, e));
    const idsA = reportA.artifact.measurements.map((m) => m.snapshotId).sort();
    const idsB = reportB.artifact.measurements.map((m) => m.snapshotId).sort();
    assert.deepEqual(idsA, idsB);
    const evalA = JSON.stringify(
      reportA.artifact.measurements.map((m) => m.evaluation.references)
    );
    const evalB = JSON.stringify(
      reportB.artifact.measurements.map((m) => m.evaluation.references)
    );
    assert.equal(evalA, evalB);
    const outcomesA = reportA.pathBatch.results.map((r) => r.outcome).join(",");
    const outcomesB = reportB.pathBatch.results.map((r) => r.outcome).join(",");
    assert.notEqual(outcomesA, outcomesB);
  });

  it("L–O: candidate expansion and cohort overlap", () => {
    const report = runHistoricalBacktest(baseInput(DEMO_OHLCV, historicalE, historicalE));
    const bars = new Set(
      report.artifact.measurements.map((m) => m.evaluationBarIndex)
    );
    assert.equal(bars.size, 1);
    assert.ok(report.artifact.measurements.length >= 1);
    const withOverlap = report.artifact.measurements.filter((m) =>
      m.cohorts.includes("DISPLAY_PICK")
    );
    if (withOverlap.length > 0) {
      assert.ok(
        report.outcomeStatistics.cohorts.DISPLAY_PICK.counts.totalSnapshots >=
          withOverlap.length
      );
    }
  });

  it("P–Q: B-10d/B-10e integration via path batch observations", () => {
    const report = runHistoricalBacktest(baseInput());
    assert.equal(
      report.configuration.policyId,
      POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0
    );
    for (let i = 0; i < report.pathBatch.results.length; i++) {
      const expected = classifyHistoricalPositionOutcomePolicy(
        report.pathBatch.results[i]!
      ).classification;
      assert.ok(expected);
    }
    assert.equal(
      report.outcomeStatistics.statisticsSchemaVersion,
      report.configuration.outcomeStatisticsSchemaVersion
    );
  });

  it("R–W: outcome classes map to reporting counts", () => {
    const report = runHistoricalBacktest(baseInput(DEMO_OHLCV, 20, 23));
    const c = report.outcomeStatistics.overall.counts;
    assert.equal(c.wins, c.favorableResolutions);
    assert.equal(c.losses, c.adverseResolutions);
    assert.equal(
      c.decisiveResolutions,
      c.favorableResolutions + c.adverseResolutions
    );
    assert.equal(
      c.measuredPaths,
      c.decisiveResolutions + c.measuredNonDecisive
    );
    const rate = report.outcomeStatistics.overall.rates.winRate_decisive;
    assert.equal(rate.denominatorId, "DECISIVE_RESOLUTIONS");
    if (c.decisiveResolutions === 0) {
      assert.equal(rate.value, null);
    } else {
      assert.equal(rate.numerator, c.wins);
      assert.equal(rate.denominator, c.decisiveResolutions);
    }
  });

  it("X–Z: non-decisive and unmeasured never count as wins/losses", () => {
    const report = runHistoricalBacktest(baseInput(DEMO_OHLCV, 20, 23));
    const cls = report.outcomeStatistics.overall.classification;
    const wins = cls.FAVORABLE_RESOLUTION ?? 0;
    const losses = cls.ADVERSE_RESOLUTION ?? 0;
    assert.equal(
      (cls.INCONCLUSIVE_SAME_BAR ?? 0) + (cls.UNRESOLVED_AT_HORIZON ?? 0),
      report.outcomeStatistics.overall.counts.measuredNonDecisive
    );
    assert.equal(wins + losses, report.outcomeStatistics.overall.counts.decisiveResolutions);
  });

  it("AA–AB: evaluation cross matrix present", () => {
    const report = runHistoricalBacktest(baseInput());
    assert.ok(report.outcomeStatistics.evaluationCross);
    assert.ok(report.outcomeStatistics.evaluationCross.FAILED);
    assert.ok(report.outcomeStatistics.evaluationCross.PASSED);
  });

  it("AC–AG: dimension and RR slices from B-10e", () => {
    const report = runHistoricalBacktest(baseInput(DEMO_OHLCV, 20, 22));
    assert.ok(report.outcomeStatistics.bySymbol);
    assert.ok(report.outcomeStatistics.byTimeframe);
    assert.ok(report.outcomeStatistics.bySetupFamily);
    assert.ok(report.outcomeStatistics.byDirection);
    assert.ok(report.outcomeStatistics.byRrBucket.FROM_1_0_TO_1_5);
    for (const cohort of [
      "ALL_PRODUCTION_CANDIDATES",
      "READY_REFERENCES",
      "TRADE_EVAL_PASSED",
      "DISPLAY_PICK",
    ] as const) {
      assert.ok(report.outcomeStatistics.cohorts[cohort]);
    }
  });

  it("AH–AI: cohort filter OR semantics", () => {
    const full = runHistoricalBacktest(baseInput());
    const filtered = runHistoricalBacktest({
      ...baseInput(),
      filter: { cohorts: ["DISPLAY_PICK", "READY_REFERENCES"] },
    });
    assert.ok(
      filtered.outcomeStatistics.overall.counts.totalSnapshots <=
        full.outcomeStatistics.overall.counts.totalSnapshots
    );
  });

  it("AJ–AK: determinism and input immutability", () => {
    const candles = DEMO_OHLCV.map((c) => ({ ...c }));
    const input = baseInput(candles);
    const frozen = JSON.stringify(candles);
    const a = runHistoricalBacktest(input);
    const b = runHistoricalBacktest(input);
    assert.deepEqual(a.outcomeStatistics, b.outcomeStatistics);
    assert.equal(JSON.stringify(candles), frozen);
  });

  it("AL–AS: runner implementation constraints", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/historical-backtest.ts"),
      "utf8"
    );
    assert.ok(src.includes("buildHistoricalMeasurementArtifact"));
    assert.ok(src.includes("runHistoricalPositionPathBatch"));
    assert.ok(src.includes("aggregateHistoricalPositionOutcomeStatistics"));
    assert.ok(!src.includes("Date.now"));
    assert.ok(!src.includes("Math.random"));
    assert.ok(!src.includes("fetch("));
    assert.ok(!src.includes("calculatePnL"));
    assert.ok(!src.includes("replayProspectiveSetupOutcome"));
    assert.ok(!src.includes("evaluateTradeEvaluation"));
    assert.ok(!src.includes("alarm"));
    assert.ok(!src.includes("window"));
  });

  it("AV–AX: schema and artifact compatibility", () => {
    const report = runHistoricalBacktest(baseInput());
    assert.equal(report.artifact.schemaVersion, report.configuration.measurementSchemaVersion);
    assert.equal(report.configuration.horizonBars, 24);
    assert.equal(report.configuration.symbol, symbol);
    assert.equal(report.configuration.timeframeId, timeframeId);
  });
});
