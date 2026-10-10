import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { runFrozenHistoricalBacktest } from "../frozen-historical-backtest";
import { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "../historical-evaluator-rr-threshold-theoretical-r-analysis";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import {
  buildHistoricalFrozenOhlcvDatasetDocument,
  compareHistoricalFrozenVsLiveOhlcvDatasets,
  formatHistoricalFrozenLiveDatasetDriftReport,
  loadBtcusdt1hResearchFrozenDatasetV1,
  parseHistoricalFrozenOhlcvDatasetJson,
  validateLoadedFrozenOhlcvDataset,
} from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT,
  HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION,
} from "../historical-frozen-ohlcv-dataset-types";
import { fetchBinanceFuturesHistoricalCandles } from "../historical-ohlcv-dataset-loader";
import { aggregateIndependentTradeRMultipleStatistics } from "../historical-independent-trade-r-multiple-statistics";
import { auditIndependentTradeTheoreticalREligibility } from "../historical-independent-trade-r-eligibility-audit";
import { aggregateIndependentTradeStatistics } from "../historical-independent-trade-statistics";
import { ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT } from "../independent-trade-entry-event-policy-contract";
import { buildIndependentTradeLifecycleReport } from "../independent-trade-unit-lifecycle";
import { resolveRealHistoricalBacktestEvaluationRange } from "../real-historical-backtest";
import type { Candle } from "../types";

const FIXTURE_JSON = readFileSync(
  join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH),
  "utf8"
);

function frozenBacktestPipeline() {
  const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
  const range = resolveRealHistoricalBacktestEvaluationRange(loaded.candles.length, 24);
  const result = runFrozenHistoricalBacktest({
    horizonBars: 24,
    startEvaluationBar: range.startEvaluationBar,
    endEvaluationBar: range.endEvaluationBar,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  const lifecycleReport = buildIndependentTradeLifecycleReport({
    report: result.report,
    entryEventPolicyId: ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  });
  const stats = aggregateIndependentTradeStatistics(lifecycleReport);
  const rStats = aggregateIndependentTradeRMultipleStatistics({
    lifecycleReport,
    statisticsReport: stats,
  });
  const audit = auditIndependentTradeTheoreticalREligibility({
    lifecycleReport,
    statisticsReport: stats,
    rMultipleStatisticsReport: rStats,
  });
  const b12p = buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis({
    lifecycleReport,
    eligibilityAuditReport: audit,
  });
  return { loaded, result, lifecycleReport, stats, audit, b12p };
}

describe("historical-frozen-ohlcv-dataset (B-12q)", () => {
  it("A — dataset schema", () => {
    const doc = JSON.parse(FIXTURE_JSON) as { candles: unknown[]; metadata: unknown };
    assert.ok(Array.isArray(doc.candles));
    assert.ok(doc.candles.length > 0);
    const row = doc.candles[0] as Record<string, unknown>;
    for (const key of ["timestamp", "open", "high", "low", "close", "volume"]) {
      assert.ok(key in row);
    }
  });

  it("B — dataset metadata", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const m = loaded.document.metadata;
    assert.equal(m.schemaVersion, HISTORICAL_FROZEN_OHLCV_DATASET_SCHEMA_VERSION);
    assert.equal(m.symbol, "BTCUSDT");
    assert.equal(m.timeframe, "1H");
    assert.equal(m.candleCount, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT);
    assert.equal(m.closedCandleOnly, true);
    assert.equal(m.barDurationMs, 3_600_000);
    assert.equal(m.source, "binance-futures-klines");
    assert.ok(m.datasetChecksum.length === 64);
    assert.equal(m.firstTimestamp, loaded.candles[0].time);
    assert.equal(m.lastTimestamp, loaded.candles[loaded.candles.length - 1].time);
    assert.ok(!("generatedAt" in m));
  });

  it("C — hash determinism", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const a = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    const b = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    assert.equal(a, b);
    assert.equal(a, loaded.document.metadata.datasetChecksum);
  });

  it("D — hash changes when candle changes", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const base = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    const mutated: Candle[] = loaded.candles.map((c, i) =>
      i === 10 ? { ...c, close: c.close + 0.01 } : { ...c }
    );
    const changed = computeHistoricalFrozenOhlcvDatasetChecksum(mutated);
    assert.notEqual(base, changed);
  });

  it("E — dataset validation", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const validation = validateLoadedFrozenOhlcvDataset(loaded);
    assert.equal(validation.ok, true);
    assert.equal(validation.candleCount, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT);
  });

  it("F — timestamp uniqueness", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const times = new Set(loaded.candles.map((c) => c.time));
    assert.equal(times.size, loaded.candles.length);
  });

  it("G — 1H spacing", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    for (let i = 1; i < loaded.candles.length; i++) {
      assert.equal(loaded.candles[i].time - loaded.candles[i - 1].time, 3_600_000);
    }
  });

  it("H — input immutability (parse)", () => {
    const before = FIXTURE_JSON;
    parseHistoricalFrozenOhlcvDatasetJson(before);
    assert.equal(FIXTURE_JSON, before);
  });

  it("I — frozen loader immutability", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const fingerprint = computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles);
    validateLoadedFrozenOhlcvDataset(loaded);
    runFrozenHistoricalBacktest({
      candles: loaded.candles,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles), fingerprint);
  });

  it("J — two identical frozen runs deepEqual", () => {
    const range = resolveRealHistoricalBacktestEvaluationRange(
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT,
      24
    );
    const opts = {
      horizonBars: 24,
      startEvaluationBar: range.startEvaluationBar,
      endEvaluationBar: range.endEvaluationBar,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    };
    const a = runFrozenHistoricalBacktest(opts);
    const b = runFrozenHistoricalBacktest(opts);
    assert.equal(a.frozenLayer.datasetChecksum, b.frozenLayer.datasetChecksum);
    assert.deepEqual(a.pathOutcomeCounts, b.pathOutcomeCounts);
    assert.deepEqual(a.report.summary, b.report.summary);
    assert.deepEqual(a.frozenLayer, b.frozenLayer);
  });

  it("K — B-12p output reproducibility on frozen dataset", () => {
    const first = frozenBacktestPipeline();
    const second = frozenBacktestPipeline();
    assert.equal(
      first.result.frozenLayer.datasetChecksum,
      second.result.frozenLayer.datasetChecksum
    );
    assert.equal(
      first.lifecycleReport.summary.independentTrades,
      second.lifecycleReport.summary.independentTrades
    );
    assert.deepEqual(first.b12p.thresholdSlices, second.b12p.thresholdSlices);
    assert.deepEqual(first.b12p.passComparisonTable, second.b12p.passComparisonTable);
    assert.deepEqual(first.b12p.failComparisonTable, second.b12p.failComparisonTable);
    assert.deepEqual(
      first.b12p.prospectiveRrBucketAnalysis,
      second.b12p.prospectiveRrBucketAnalysis
    );
    assert.deepEqual(
      first.b12p.prospectiveBandComparison,
      second.b12p.prospectiveBandComparison
    );
    assert.deepEqual(first.b12p.baselineDeltas, second.b12p.baselineDeltas);
  });

  it("L — no network in frozen runner", () => {
    const mod = readFileSync(join(process.cwd(), "src/wave/frozen-historical-backtest.ts"), "utf8");
    assert.ok(mod.includes("runFrozenHistoricalBacktest"));
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!mod.includes("fetch("));
  });

  it("M — architecture guard (module sources)", () => {
    const frozen = readFileSync(
      join(process.cwd(), "src/wave/historical-frozen-ohlcv-dataset.ts"),
      "utf8"
    );
    const runner = readFileSync(
      join(process.cwd(), "src/wave/frozen-historical-backtest.ts"),
      "utf8"
    );
    assert.ok(!frozen.includes("fetch("));
    assert.ok(!runner.includes("fetch("));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(frozen));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(runner));
    assert.ok(runner.includes("runRealHistoricalBacktest"));
  });

  it("dataset drift report vs live Binance (informational)", async () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const live = await fetchBinanceFuturesHistoricalCandles("BTCUSDT", "1H", 3000);
    const drift = compareHistoricalFrozenVsLiveOhlcvDatasets(live, frozen.candles);
    const text = formatHistoricalFrozenLiveDatasetDriftReport(drift);
    assert.ok(text.includes("LIVE_DATASET"));
    assert.ok(text.includes("FROZEN_DATASET"));
    if (!drift.sameCount || !drift.sameLastTimestamp) {
      assert.ok(drift.differingCandleCount >= 0);
    }
  });

  it("build document round-trip checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const doc = buildHistoricalFrozenOhlcvDatasetDocument(loaded.candles, {
      symbol: "BTCUSDT",
      timeframe: "1H",
    });
    assert.equal(doc.metadata.datasetChecksum, loaded.document.metadata.datasetChecksum);
  });
});
