import fs from "node:fs";
import path from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../src/browser/demo-ohlcv";
import {
  fetchBinanceFuturesHistoricalCandles,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
} from "../src/wave/historical-ohlcv-dataset-loader";
import { formatRealHistoricalBacktestReport } from "../src/wave/real-historical-backtest-report";
import { runRealHistoricalBacktest } from "../src/wave/real-historical-backtest";

function parseArgs(argv: string[]): {
  symbol: string;
  timeframe: string;
  horizon: number;
  candles: number;
  start?: number;
  end?: number;
  outputPath?: string;
} {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        map.set(key, next);
        i += 1;
      } else {
        map.set(key, "true");
      }
    }
  }
  const symbol = (map.get("symbol") ?? "BTCUSDT").toUpperCase();
  const timeframe = (map.get("timeframe") ?? "1H").toUpperCase();
  const horizon = Number(map.get("horizon") ?? "24");
  const candles = Number(
    map.get("candles") ?? String(REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES)
  );
  const startRaw = map.get("start");
  const endRaw = map.get("end");
  const outputPath = map.get("output");
  return {
    symbol,
    timeframe,
    horizon,
    candles,
    start: startRaw !== undefined ? Number(startRaw) : undefined,
    end: endRaw !== undefined ? Number(endRaw) : undefined,
    outputPath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const series = await fetchBinanceFuturesHistoricalCandles(
    args.symbol,
    args.timeframe,
    args.candles
  );

  const result = runRealHistoricalBacktest({
    symbol: args.symbol,
    timeframeId: args.timeframe,
    candles: series,
    horizonBars: args.horizon,
    startEvaluationBar: args.start,
    endEvaluationBar: args.end,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });

  const text = formatRealHistoricalBacktestReport(result);
  console.log(text);

  const outDir = path.join(process.cwd(), "validation-output");
  const outFile =
    args.outputPath ??
    path.join(
      outDir,
      `real-historical-backtest-${args.symbol}-${args.timeframe}.json`
    );
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(
    path.resolve(outFile),
    JSON.stringify(
      {
        schemaVersion: result.schemaVersion,
        dataset: result.dataset,
        evaluationRange: result.evaluationRange,
        pathOutcomeCounts: result.pathOutcomeCounts,
        configuration: result.report.configuration,
        outcomeStatistics: result.report.outcomeStatistics,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("");
  console.log(`Wrote ${path.resolve(outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
