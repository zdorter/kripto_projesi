import fs from "node:fs";
import path from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../src/browser/demo-ohlcv";
import { fetchBinanceFuturesHistoricalCandles } from "../src/wave/historical-ohlcv-dataset-loader";
import { runRealHistoricalBacktest } from "../src/wave/real-historical-backtest";
import {
  auditHistoricalBacktestRobustness,
  auditHistoricalBacktestSelectionLookahead,
  buildDirectionRrDecisiveCrossTable,
  compareHistoricalBacktestHorizons,
  formatHistoricalBacktestRobustnessAudit,
} from "../src/wave/historical-backtest-robustness-audit";
import { pairHistoricalPositionOutcomeObservationsWithBatch } from "../src/wave/historical-position-outcome-statistics";

async function main(): Promise<void> {
  const candles = await fetchBinanceFuturesHistoricalCandles(
    "BTCUSDT",
    "1H",
    3000
  );
  const base = runRealHistoricalBacktest({
    symbol: "BTCUSDT",
    timeframeId: "1H",
    candles,
    horizonBars: 24,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  const start = base.evaluationRange.startEvaluationBar;
  const end = base.evaluationRange.endEvaluationBar;

  const horizonComparison = compareHistoricalBacktestHorizons({
    symbol: "BTCUSDT",
    timeframeId: "1H",
    candles,
    startEvaluationBar: start,
    endEvaluationBar: end,
    horizons: [12, 24, 48],
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });

  const sampleEs = [100, 500, 1000, 1500, 2000, 2500].filter(
    (e) => e >= start && e <= end
  );
  const lookahead = auditHistoricalBacktestSelectionLookahead({
    report: base.report,
    candles,
    evaluationBarIndices: sampleEs,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });

  const audit = auditHistoricalBacktestRobustness({
    report: base.report,
    horizonComparison,
    lookahead,
  });

  const observations = pairHistoricalPositionOutcomeObservationsWithBatch(
    base.report.artifact,
    base.report.pathBatch
  );
  const directionRr = buildDirectionRrDecisiveCrossTable(
    observations,
    base.report.configuration.policyId
  );

  const text = formatHistoricalBacktestRobustnessAudit(audit);
  console.log(text);
  console.log("");
  console.log("Direction × RR (decisive/wins):");
  console.log(JSON.stringify(directionRr, null, 2));

  const outDir = path.join(process.cwd(), "validation-output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "historical-robustness-audit-BTCUSDT-1H.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify({ audit, directionRrCross: directionRr }, null, 2),
    "utf8"
  );
  console.log("");
  console.log(`Wrote ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
