import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeWaveWithDiagnostics } from "../analysis-pipeline";
import { runSwingCalibration } from "../swing-calibration";
import { flatCandles } from "./test-helpers";

describe("swing-calibration", () => {
  it("runs the same Candle[] through multiple swing configs", () => {
    const candles = flatCandles(80, 100);
    for (let i = 0; i < candles.length; i++) {
      const w = Math.sin(i / 5) * 12;
      candles[i].high += w;
      candles[i].low += w;
      candles[i].close += w;
    }

    const report = runSwingCalibration(candles);
    assert.equal(report.summaries.length, 4);
    assert.equal(report.candleCount, candles.length);

    const swingCounts = report.summaries.map((s) => s.confirmedSwingCount);
    assert.ok(swingCounts.every((n) => n >= 0));
    assert.notDeepEqual(
      report.detailsByConfigId["3-3"].confirmedSwingCount,
      report.detailsByConfigId["10-10"].confirmedSwingCount
    );
  });

  it("keeps config results independent", () => {
    const candles = flatCandles(60, 50);
    for (let i = 0; i < candles.length; i++) {
      const w = Math.cos(i / 4) * 8;
      candles[i].high += w;
      candles[i].low += w;
    }

    const first = runSwingCalibration(candles);
    const second = runSwingCalibration(candles);

    assert.deepEqual(
      first.summaries.map((s) => s.confirmedSwingCount),
      second.summaries.map((s) => s.confirmedSwingCount)
    );

    for (const id of ["3-3", "5-5", "7-7", "10-10"]) {
      assert.equal(
        first.detailsByConfigId[id].swingConfig.leftBars,
        first.detailsByConfigId[id].swingConfig.rightBars
      );
    }
  });

  it("5/5 matches default analyzeWaveWithDiagnostics (no options)", () => {
    const candles = flatCandles(70, 200);
    for (let i = 0; i < candles.length; i++) {
      const w = Math.sin(i / 6) * 20;
      candles[i].high += w;
      candles[i].low += w;
      candles[i].close += w;
    }

    const defaultRun = analyzeWaveWithDiagnostics(candles);
    const report = runSwingCalibration(candles);
    const fiveFive = report.detailsByConfigId["5-5"];

    assert.equal(
      fiveFive.confirmedSwingCount,
      defaultRun.diagnostics.confirmedSwingCount
    );
    assert.equal(fiveFive.marketTrend, defaultRun.diagnostics.trendSource.marketTrend);
    assert.equal(
      fiveFive.ruleConformanceScore,
      defaultRun.presentation.ruleConformanceScore
    );
    assert.equal(fiveFive.overlapCount, defaultRun.presentation.overlaps.length);
    assert.deepEqual(
      fiveFive.impulseWaves.map((w) => w.label),
      defaultRun.analysis.waves
        .filter((w) => ["1", "2", "3", "4", "5"].includes(w.label))
        .map((w) => w.label)
    );
  });
});
