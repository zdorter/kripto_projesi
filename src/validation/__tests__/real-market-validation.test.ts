import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  blockersForTradeSetupDetail,
  incrementBlockerCounts,
} from "../real-market-blockers";
import {
  buildRealMarketValidationReport,
  formatRealMarketValidationReport,
} from "../real-market-validation";
import {
  buildFixtureReportFromDemoScan,
  buildFixtureReportFromMvpCandidates,
} from "./fixtures/real-market-validation-fixture";
import { impulseContinuationSetup } from "../../wave/__tests__/fixtures/mvp-e2e-fixtures";

describe("real-market validation (14E)", () => {
  it("aggregate report fields", () => {
    const report = buildFixtureReportFromMvpCandidates();
    assert.equal(report.schemaVersion, "1.3");
    assert.equal(report.symbols.length, 2);
    assert.ok(report.aggregate.tradeSetupCount >= 2);
    assert.ok(typeof report.aggregate.scenarioCount === "number");
    assert.ok(report.funnel.tradeSetupCount === report.aggregate.tradeSetupCount);
  });

  it("setup status counts", () => {
    const report = buildFixtureReportFromMvpCandidates();
    const sum =
      report.aggregate.setupStatusCounts.CONFIRMED +
      report.aggregate.setupStatusCounts.CANDIDATE +
      report.aggregate.setupStatusCounts.INVALID +
      report.aggregate.setupStatusCounts.INSUFFICIENT_CONTEXT;
    assert.equal(sum, report.aggregate.tradeSetupCount);
    assert.equal(report.aggregate.setupStatusCounts.CONFIRMED, 1);
    assert.equal(report.aggregate.setupStatusCounts.CANDIDATE, 1);
  });

  it("evaluation counts", () => {
    const report = buildFixtureReportFromMvpCandidates();
    const evalSum =
      report.aggregate.evaluationCounts.READY_FOR_FURTHER_EVALUATION +
      report.aggregate.evaluationCounts.INSUFFICIENT_CONTEXT +
      report.aggregate.evaluationCounts.INVALID;
    assert.ok(evalSum <= report.aggregate.entryPlanCount);
  });

  it("blocker normalization", () => {
    const setup = impulseContinuationSetup("BTCUSDT", { status: "CANDIDATE" });
    const blockers = blockersForTradeSetupDetail({
      setup,
      plan: null,
      snapshot: null,
      candidateReport: null,
      selection: null,
    });
    assert.ok(blockers.includes("SETUP_NOT_CONFIRMED"));
    const counts: Record<string, number> = {};
    incrementBlockerCounts(counts, blockers);
    assert.equal(counts.SETUP_NOT_CONFIRMED, 1);
  });

  it("funnel counts are non-increasing steps", () => {
    const report = buildFixtureReportFromMvpCandidates();
    const f = report.funnel;
    assert.ok(f.confirmedSetupCount <= f.tradeSetupCount);
    assert.ok(f.entryPlanCount <= f.tradeSetupCount);
    assert.ok(f.readyForFurtherEvaluationCount <= f.rrAvailableCount);
  });

  it("wave distribution keys", () => {
    const report = buildFixtureReportFromDemoScan();
    assert.ok(typeof report.waveLabelDistribution === "object");
    const total = Object.values(report.waveLabelDistribution).reduce(
      (a, b) => a + b,
      0
    );
    assert.equal(total, report.aggregate.scenarioCount);
  });

  it("setup type distribution", () => {
    const report = buildFixtureReportFromMvpCandidates();
    assert.ok(report.setupTypeStatusDistribution["impulse-continuation"]);
    const row = report.setupTypeStatusDistribution["impulse-continuation"];
    assert.equal(row.CONFIRMED + row.CANDIDATE, 2);
  });

  it("directional bias distribution", () => {
    const report = buildFixtureReportFromMvpCandidates();
    assert.ok(report.directionalBiasDistribution.BULLISH >= 1);
    for (const d of report.tradeSetupDetails) {
      if (d.scenarioWaveLabel === "5" || d.scenarioWaveLabel === "C") {
        assert.notEqual(
          d.directionalBasis,
          "WAVE_LABEL_DIRECTION",
          "direction must not be derived from Wave 5 / C label"
        );
      }
    }
  });

  it("symbol isolation", () => {
    const report = buildFixtureReportFromMvpCandidates();
    for (const d of report.tradeSetupDetails) {
      assert.ok(d.symbol === "BTCUSDT" || d.symbol === "ETHUSDT");
      assert.equal(
        d.symbol,
        report.symbolSummaries.find((s) => s.symbol === d.symbol)?.symbol
      );
    }
    const btc = report.symbolSummaries.find((s) => s.symbol === "BTCUSDT");
    assert.equal(btc?.setupCount, 1);
  });

  it("missing target context without attestation fabrication", () => {
    const report = buildFixtureReportFromMvpCandidates();
    const withPlan = report.tradeSetupDetails.filter((d) => d.entryPlanCreated);
    for (const d of withPlan) {
      const allInsufficient = d.objectiveTargetCandidates.every(
        (c) => c.outcome !== "AVAILABLE"
      );
      if (allInsufficient && d.objectiveTargetCandidates.length > 0) {
        assert.ok(d.blockers.includes("OBJECTIVE_TARGET_CONTEXT_MISSING"));
      }
    }
  });

  it("no fallback READY without references", () => {
    const report = buildFixtureReportFromDemoScan();
    for (const d of report.tradeSetupDetails) {
      if (d.evaluationState === "READY_FOR_FURTHER_EVALUATION") {
        assert.equal(d.entryAvailability, "AVAILABLE");
        assert.equal(d.stopAvailability, "AVAILABLE");
        assert.equal(d.targetAvailability, "AVAILABLE");
        assert.equal(d.rrAvailability, "AVAILABLE");
      }
    }
  });

  it("deterministic report from fixed fixture", () => {
    const a = buildFixtureReportFromMvpCandidates();
    const b = buildFixtureReportFromMvpCandidates();
    assert.deepEqual(
      { ...a, fetchedAt: "x" },
      { ...b, fetchedAt: "x" }
    );
  });

  it("closed candle attestation propagation", () => {
    const report = buildFixtureReportFromMvpCandidates();
    const btc = report.symbolSummaries.find((s) => s.symbol === "BTCUSDT");
    assert.equal(btc?.closedCandleCount, 3);
    assert.ok(btc!.lastCandleTime >= btc!.firstCandleTime);
  });

  it("formatRealMarketValidationReport includes header", () => {
    const text = formatRealMarketValidationReport(
      buildFixtureReportFromMvpCandidates()
    );
    assert.ok(text.includes("REAL MARKET VALIDATION"));
    assert.ok(text.includes("Funnel:"));
  });

  it("validation module report builder does not import Binance", () => {
    const file = path.join(
      process.cwd(),
      "src/validation/real-market-blockers.ts"
    );
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!text.includes("binance"));
    assert.ok(!text.includes("fetch("));
  });
});
