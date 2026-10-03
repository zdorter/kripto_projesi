import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  buildDisplayPickHistoricalCandidateMeasurement,
  buildHistoricalCandidateMeasurementsAtEvaluationBar,
  cohortsMatchingFilter,
  countProductionCandidatesAtEvaluationBar,
  resolveHistoricalMeasurementCohorts,
} from "../historical-candidate-cohort";
import {
  composeProductionCandidateRowsForSymbol,
  composeProductionWaveScannerForSymbol,
} from "../production-wave-scanner";
import { buildHistoricalMeasurementSnapshotId } from "../setup/historical-measurement-contract";

const historicalE = 22;
const base = {
  symbol: "BTCUSDT",
  candles: DEMO_OHLCV,
  timeframeId: "1H",
  engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  evaluationBarIndex: historicalE,
};

describe("historical candidate expansion + cohort (B-8e)", () => {
  it("audit: production candidate collection exists at E", () => {
    const count = countProductionCandidatesAtEvaluationBar(base);
    assert.ok(count >= 1);
    const rows = composeProductionCandidateRowsForSymbol({
      ...base,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.equal(rows.length, count);
  });

  it("A + E: DISPLAY_PICK preserved vs legacy compose", () => {
    const displayBundle = buildDisplayPickHistoricalCandidateMeasurement(base)!;
    const legacy = composeProductionWaveScannerForSymbol({
      ...base,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    assert.ok(cohortsMatchingFilter(displayBundle.cohorts, "DISPLAY_PICK"));
    assert.equal(
      displayBundle.measurement.prospectiveSetupId,
      legacy.production!.id
    );
    assert.deepEqual(
      displayBundle.measurement.evaluation.references,
      legacy.references
    );
  });

  it("B: ALL_PRODUCTION_CANDIDATES covers full collection", () => {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    assert.equal(bundles.length, countProductionCandidatesAtEvaluationBar(base));
    for (const b of bundles) {
      assert.ok(
        cohortsMatchingFilter(b.cohorts, "ALL_PRODUCTION_CANDIDATES")
      );
    }
  });

  it("C–D: READY and TRADE_EVAL cohort filters", () => {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    const ready = bundles.filter((b) =>
      cohortsMatchingFilter(b.cohorts, "READY_REFERENCES")
    );
    for (const b of ready) {
      assert.equal(b.measurement.evaluation.references.readyForFurtherEvaluation, true);
    }
    const passed = bundles.filter((b) =>
      cohortsMatchingFilter(b.cohorts, "TRADE_EVAL_PASSED")
    );
    for (const b of passed) {
      assert.equal(b.measurement.evaluation.tradeEvaluation.status, "PASSED");
    }
  });

  it("F: cohort overlap allowed", () => {
    const cohorts = resolveHistoricalMeasurementCohorts({
      references: {
        schemaVersion: "1.0",
        prospectiveId: "x",
        entry: {
          outcome: "AVAILABLE",
          referencePrice: 1,
          modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
        },
        stop: {
          outcome: "AVAILABLE",
          referencePrice: 0.5,
          modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
        },
        target: {
          outcome: "AVAILABLE",
          referencePrice: 2,
          modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
          policyId: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
        },
        rr: { outcome: "AVAILABLE", ratio: 2 },
        readyForFurtherEvaluation: true,
        limitations: [],
      },
      tradeEvaluationStatus: "PASSED",
      isDisplayPick: true,
    });
    assert.deepEqual(cohorts, [
      "ALL_PRODUCTION_CANDIDATES",
      "READY_REFERENCES",
      "TRADE_EVAL_PASSED",
      "DISPLAY_PICK",
    ]);
  });

  it("G–H: candidate-specific references and outcomes", () => {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    assert.ok(bundles.length >= 2);
    const ids = new Set(bundles.map((b) => b.measurement.prospectiveSetupId));
    assert.ok(ids.size >= 2);
    const withTarget = bundles.filter(
      (b) => b.measurement.outcome?.replay.targetPrice != null
    );
    if (withTarget.length >= 2) {
      const p0 = withTarget[0]!.measurement.outcome!.replay.targetPrice!;
      const p1 = withTarget[1]!.measurement.outcome!.replay.targetPrice!;
      assert.notEqual(p0, p1);
    }
    const readyCandidates = bundles.filter((b) =>
      b.measurement.evaluation.references.readyForFurtherEvaluation
    );
    const notReady = bundles.filter(
      (b) => !b.measurement.evaluation.references.readyForFurtherEvaluation
    );
    if (readyCandidates.length && notReady.length) {
      assert.notEqual(
        readyCandidates[0]!.measurement.evaluation.references.readyForFurtherEvaluation,
        notReady[0]!.measurement.evaluation.references.readyForFurtherEvaluation
      );
    }
  });

  it("I–J: snapshotId canonical and unique per candidate at E", () => {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    const ids = new Set<string>();
    for (const b of bundles) {
      assert.equal(
        b.measurement.snapshotId,
        buildHistoricalMeasurementSnapshotId({
          symbol: b.measurement.symbol,
          timeframe: b.measurement.timeframe,
          evaluationBarIndex: b.measurement.evaluationBarIndex,
          prospectiveSetupId: b.measurement.prospectiveSetupId,
        })
      );
      assert.ok(!ids.has(b.measurement.snapshotId));
      ids.add(b.measurement.snapshotId);
    }
  });

  it("K–L: future mutation affects outcome not evaluation", () => {
    const baseline = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    const display = baseline.find((b) =>
      cohortsMatchingFilter(b.cohorts, "DISPLAY_PICK")
    )!;
    const evalBefore = display.measurement.evaluation;
    const mutated = DEMO_OHLCV.map((c, i) =>
      i <= historicalE ? c : { ...c, high: c.high * 8, low: c.low / 8 }
    );
    const after = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      ...base,
      candles: mutated,
    });
    const displayAfter = after.find(
      (b) => b.measurement.prospectiveSetupId === display.measurement.prospectiveSetupId
    )!;
    assert.deepEqual(displayAfter.measurement.evaluation, evalBefore);
  });

  it("M: candidate rows only use prefix evaluation (compose regression)", () => {
    const rows = composeProductionCandidateRowsForSymbol({
      ...base,
      composeOptions: { evaluationBarIndex: historicalE },
    });
    for (const row of rows) {
      assert.equal(row.evaluationBarIndex, historicalE);
    }
  });

  it("N–O: trade eval and READY unchanged vs single-candidate assembly path", () => {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar(base);
    const display = bundles.find((b) =>
      cohortsMatchingFilter(b.cohorts, "DISPLAY_PICK")
    )!;
    const legacyPick = buildDisplayPickHistoricalCandidateMeasurement(base)!;
    assert.deepEqual(
      display.measurement.evaluation.tradeEvaluation,
      legacyPick.measurement.evaluation.tradeEvaluation
    );
    assert.equal(
      display.measurement.evaluation.references.readyForFurtherEvaluation,
      legacyPick.measurement.evaluation.references.readyForFurtherEvaluation
    );
  });

  it("P–R: no alarm, presentation, or statistics in module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/wave/historical-candidate-cohort.ts"),
      "utf8"
    );
    assert.ok(!src.includes("alarm"));
    assert.ok(!src.includes("formatOutcomeReplay"));
    assert.ok(!src.includes("win rate"));
    assert.ok(!src.includes("writeFileSync"));
  });
});
