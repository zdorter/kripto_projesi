import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInvalidationFlowSummary } from "../real-market-setup-diagnostics";
import {
  buildFixtureReportFromDemoScan,
  buildFixtureReportFromMvpCandidates,
} from "./fixtures/real-market-validation-fixture";
import {
  impulseContinuationSetup,
  mvpScan,
  mvpSetupReport,
} from "../../wave/__tests__/fixtures/mvp-e2e-fixtures";
describe("real-market setup diagnostics (14F)", () => {
  it("aggregates condition outcomes deterministically", () => {
    const reportA = buildFixtureReportFromMvpCandidates();
    const reportB = buildFixtureReportFromMvpCandidates();
    assert.deepEqual(reportA.conditionSummary, reportB.conditionSummary);
    const imp = reportA.conditionSummary.bySetupType["impulse-continuation"];
    assert.ok(imp);
    assert.ok(imp.trigger["impulse-continuation-phase-active"] || imp.prerequisite);
  });

  it("invalidation flow counts mapping gaps as zero for fixture with scanner invalidation", () => {
    const symbols = ["BTCUSDT"];
    const setup = impulseContinuationSetup("BTCUSDT", { status: "CANDIDATE" });
    const scan = mvpScan(symbols);
    scan.results = [
      {
        symbol: "BTCUSDT",
        timeframe: "1H",
        scenarioId: "sc-imp",
        role: "PRIMARY",
        structure: "IMPULSE",
        waveLabel: "5",
        engineStatus: "CONFIRMED",
        scenarioStatus: "ACTIVE",
        confidence: 1,
        startIndex: 0,
        endIndex: 2,
        startPrice: 83_000,
        endPrice: 84_500,
        invalidation: {
          available: true,
          price: 82_900,
          source: "TRACK_SCOPE",
          rule: "fixture",
        },
        evidence: [],
        limitations: [],
      },
    ];
    const setupDetection = mvpSetupReport([setup]);
    const tradeContext = {
      scanReport: scan,
      bundlesBySymbol: {
        BTCUSDT: {
          timeframeId: "1H",
          evaluationBarIndex: 2,
          evaluationBarBoundaryEstablished: true,
          evaluationBarContractDetail: "fixture",
          candleCount: 3,
          diagnostics: { trendSource: { marketTrend: "BULLISH" } } as never,
          presentation: {} as never,
        },
      },
    };
    const flow = buildInvalidationFlowSummary({
      scanReport: scan,
      tradeContext,
      setupDetection,
    });
    assert.equal(flow.scannerInvalidationAvailable, 1);
    assert.equal(flow.scannerAvailableSetupReferenceMissing, 0);
  });

  it("report includes conditionSummary and invalidationFlowSummary", () => {
    const report = buildFixtureReportFromMvpCandidates();
    assert.ok(report.conditionSummary.bySetupType);
    assert.ok(report.invalidationFlowSummary);
    assert.ok(report.zeroConfirmedRootCauseNotes);
  });

  it("collectTradeSetupConditionEvaluations includes shared prerequisites", () => {
    const report = buildFixtureReportFromDemoScan();
    const setup = report.tradeSetupDetails[0];
    assert.ok(setup);
    const imp =
      report.conditionSummary.bySetupType["impulse-continuation"] ??
      report.conditionSummary.bySetupType["correction-end"];
    assert.ok(imp);
    assert.ok(
      imp.prerequisite["invalidation-available"] ||
        imp.prerequisite["scenario-active"]
    );
  });
});
