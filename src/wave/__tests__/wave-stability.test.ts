import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSwingCalibration } from "../swing-calibration";
import {
  buildWaveStabilityFromCalibration,
  indexOverlapRatio,
  priceRangeOverlapRatio,
  runWaveStability,
  WAVE_STABILITY_LABELS,
} from "../wave-stability";
import { flatCandles } from "./test-helpers";
import type { SwingCalibrationReport } from "../swing-calibration";
import type { Candle, WaveCandidate, WaveLabel } from "../types";

function mockCalibrationReport(
  wavesByConfig: Record<string, Partial<Record<WaveLabel, WaveCandidate>>>,
  candleCount = 100
): SwingCalibrationReport {
  const presets = [
    { id: "3-3", label: "3/3", leftBars: 3, rightBars: 3 },
    { id: "5-5", label: "5/5", leftBars: 5, rightBars: 5 },
    { id: "7-7", label: "7/7", leftBars: 7, rightBars: 7 },
    { id: "10-10", label: "10/10", leftBars: 10, rightBars: 10 },
  ];
  const detailsByConfigId: SwingCalibrationReport["detailsByConfigId"] = {};
  const summaries = presets.map((preset) => {
    const map = wavesByConfig[preset.id] ?? {};
    const engineWaves = WAVE_STABILITY_LABELS
      .map((label) => map[label])
      .filter((w): w is WaveCandidate => w !== undefined);
    const detail = {
      configId: preset.id,
      configLabel: preset.label,
      engineWaves,
    } as SwingCalibrationReport["detailsByConfigId"][string];
    detailsByConfigId[preset.id] = detail;
    return detail;
  });
  return {
    candleCount,
    presets,
    summaries,
    detailsByConfigId,
  };
}

function wave(
  label: WaveLabel,
  startIndex: number,
  endIndex: number,
  confidence = 50
): WaveCandidate {
  return {
    label,
    startIndex,
    endIndex,
    confidence,
    status: "CONFIRMED",
  };
}

describe("wave-stability", () => {
  it("indexOverlapRatio is 1 for identical spans", () => {
    assert.equal(indexOverlapRatio(10, 20, 10, 20), 1);
  });

  it("indexOverlapRatio for partial overlap is deterministic", () => {
    // [10,20] and [15,25]: intersection 15-20 = 6, union 10-25 = 16
    assert.equal(indexOverlapRatio(10, 20, 15, 25), 6 / 16);
  });

  it("priceRangeOverlapRatio uses candle high/low envelope", () => {
    const candles: Candle[] = flatCandles(30, 100);
    for (let i = 10; i <= 20; i++) {
      candles[i].high = 120;
      candles[i].low = 110;
    }
    for (let i = 15; i <= 25; i++) {
      candles[i].high = 125;
      candles[i].low = 115;
    }
    const ratio = priceRangeOverlapRatio(candles, 10, 20, 15, 25);
    assert.ok(ratio > 0 && ratio < 1);
  });

  it("presenceRatio is 1 when wave exists in all configs", () => {
    const report = mockCalibrationReport({
      "3-3": { "5": wave("5", 1, 5) },
      "5-5": { "5": wave("5", 2, 6) },
      "7-7": { "5": wave("5", 3, 7) },
      "10-10": { "5": wave("5", 4, 8) },
    });
    const candles = flatCandles(50, 100);
    const stability = buildWaveStabilityFromCalibration(report, candles);
    const w5 = stability.summary.find((s) => s.wave === "5");
    assert.ok(w5);
    assert.equal(w5.presenceCount, 4);
    assert.equal(w5.presenceRatio, 1);
  });

  it("presenceRatio is 0.5 when wave exists in 2/4 configs", () => {
    const report = mockCalibrationReport({
      "3-3": { C: wave("C", 10, 15) },
      "7-7": { C: wave("C", 12, 18) },
    });
    const stability = buildWaveStabilityFromCalibration(
      report,
      flatCandles(50, 100)
    );
    const wC = stability.summary.find((s) => s.wave === "C");
    assert.ok(wC);
    assert.equal(wC.presenceCount, 2);
    assert.equal(wC.presenceRatio, 0.5);
    assert.deepEqual(wC.configsPresent, ["3/3", "7/7"]);
    assert.deepEqual(wC.configsMissing, ["5/5", "10/10"]);
  });

  it("reports missing waves with present=false snapshots", () => {
    const report = mockCalibrationReport({
      "5-5": { "1": wave("1", 0, 3) },
    });
    const stability = buildWaveStabilityFromCalibration(
      report,
      flatCandles(20, 50)
    );
    const row = stability.waves.find((w) => w.wave === "2");
    assert.ok(row);
    assert.equal(row.summary.presenceCount, 0);
    assert.ok(row.snapshots.every((s) => !s.present));
  });

  it("pairwise overlaps are ordered deterministically by preset order", () => {
    const report = mockCalibrationReport({
      "3-3": { "5": wave("5", 0, 10) },
      "5-5": { "5": wave("5", 0, 10) },
      "7-7": { "5": wave("5", 0, 10) },
      "10-10": { "5": wave("5", 0, 10) },
    });
    const stability = buildWaveStabilityFromCalibration(
      report,
      flatCandles(30, 100)
    );
    const pairs = stability.pairwise.filter((p) => p.wave === "5");
    assert.equal(pairs.length, 6);
    assert.equal(pairs[0].configAId, "3-3");
    assert.equal(pairs[0].configBId, "5-5");
    assert.equal(pairs[0].indexOverlapRatio, 1);
  });

  it("runWaveStability integrates with calibration presets", () => {
    const candles = flatCandles(80, 100);
    for (let i = 0; i < candles.length; i++) {
      const w = Math.sin(i / 5) * 12;
      candles[i].high += w;
      candles[i].low += w;
    }
    const stability = runWaveStability(candles);
    assert.equal(stability.configs.length, 4);
    assert.equal(stability.persistenceMatrix.length, 8);
    assert.equal(stability.pairwise.length >= 0, true);
  });

  it("calibration summaries unchanged when adding engineWaves field", () => {
    const candles = flatCandles(60, 80);
    for (let i = 0; i < candles.length; i++) {
      candles[i].high += Math.sin(i / 4) * 6;
      candles[i].low += Math.sin(i / 4) * 6;
    }
    const report = runSwingCalibration(candles);
    for (const s of report.summaries) {
      const detail = report.detailsByConfigId[s.configId];
      assert.ok(Array.isArray(detail.engineWaves));
      assert.equal(s.confirmedSwingCount, detail.confirmedSwingCount);
      assert.equal(s.marketTrend, detail.marketTrend);
      assert.equal(s.ruleConformanceScore, detail.ruleConformanceScore);
    }
  });
});
