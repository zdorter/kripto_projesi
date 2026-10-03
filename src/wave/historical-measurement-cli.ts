import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../browser/demo-ohlcv";
import {
  HISTORICAL_MEASUREMENT_ARTIFACT_DEFAULT_OUTPUT_DIR,
  buildHistoricalMeasurementArtifact,
  serializeHistoricalMeasurementArtifact,
} from "./historical-measurement-artifact";
export interface MeasureHistoricalCliArgs {
  symbol: string;
  timeframeId: string;
  startEvaluationBar: number;
  endEvaluationBar: number;
  horizonBars?: number;
  outputPath: string;
  useDemoDataset: boolean;
}

export function parseMeasureHistoricalCliArgs(
  argv: string[]
): MeasureHistoricalCliArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      opts[key] = next;
      i++;
    } else {
      opts[key] = "true";
    }
  }

  const symbol = opts.symbol ?? "BTCUSDT";
  const timeframeId = opts.timeframe ?? opts.timeframeId ?? "1H";
  const startRaw = opts.start ?? opts.startEvaluationBar;
  const endRaw = opts.end ?? opts.endEvaluationBar;
  if (startRaw === undefined || endRaw === undefined) {
    throw new Error(
      "measure:historical requires --start and --end evaluation bar indices"
    );
  }
  const startEvaluationBar = Number(startRaw);
  const endEvaluationBar = Number(endRaw);
  if (
    !Number.isInteger(startEvaluationBar) ||
    !Number.isInteger(endEvaluationBar)
  ) {
    throw new Error("--start and --end must be integers");
  }

  const horizonBars =
    opts.horizon !== undefined ? Number(opts.horizon) : undefined;
  if (
    horizonBars !== undefined &&
    (!Number.isFinite(horizonBars) || horizonBars < 0)
  ) {
    throw new Error("--horizon must be a non-negative number");
  }

  const useDemoDataset = opts.demo !== "false" && opts.input === undefined;
  if (!useDemoDataset) {
    throw new Error(
      "Only DEMO dataset is supported; omit --input and do not pass --demo false"
    );
  }

  const defaultFile = `${symbol}-${timeframeId}-E${startEvaluationBar}-${endEvaluationBar}.json`;
  const outputPath =
    opts.output ??
    `${HISTORICAL_MEASUREMENT_ARTIFACT_DEFAULT_OUTPUT_DIR}/${defaultFile}`;

  return {
    symbol,
    timeframeId,
    startEvaluationBar,
    endEvaluationBar,
    horizonBars,
    outputPath,
    useDemoDataset,
  };
}

export function runMeasureHistoricalCli(args: MeasureHistoricalCliArgs): string {
  const artifact = buildHistoricalMeasurementArtifact({
    symbol: args.symbol,
    timeframeId: args.timeframeId,
    candles: DEMO_OHLCV,
    startEvaluationBar: args.startEvaluationBar,
    endEvaluationBar: args.endEvaluationBar,
    horizonBars: args.horizonBars,
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  return serializeHistoricalMeasurementArtifact(artifact);
}
