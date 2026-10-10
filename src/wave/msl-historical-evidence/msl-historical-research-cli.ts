import {
  buildMslHistoricalResearchBatchReport,
} from "./msl-historical-research-pipeline-batch";
import { resolveAvailableHistoricalResearchDatasets } from "./msl-historical-research-pipeline-dataset";
import {
  serializeMslHistoricalResearchBatchReport,
  writeMslHistoricalResearchBatchReport,
} from "./msl-historical-research-pipeline-serialize";

export interface MslHistoricalResearchCliArgs {
  symbols: readonly string[];
  evaluationIndices: readonly number[];
  startE?: number;
  endE?: number;
  step?: number;
  observationHorizonBars: readonly number[];
  outputPath: string;
}

export function parseMslHistoricalResearchCliArgs(argv: readonly string[]): MslHistoricalResearchCliArgs {
  let symbols: string[] = ["BTCUSDT"];
  let evaluationIndices: number[] = [];
  let startE: number | undefined;
  let endE: number | undefined;
  let step: number | undefined;
  let horizons: number[] = [24];
  let outputPath = "validation-output/msl-historical-research-batch-v1.json";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === "--dataset" || arg === "--symbol") {
      symbols = (next ?? "BTCUSDT").split(",").map((s) => s.trim().toUpperCase());
      i += 1;
    } else if (arg === "--e") {
      evaluationIndices = (next ?? "")
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));
      i += 1;
    } else if (arg === "--start-e") {
      startE = Number.parseInt(next ?? "", 10);
      i += 1;
    } else if (arg === "--end-e") {
      endE = Number.parseInt(next ?? "", 10);
      i += 1;
    } else if (arg === "--step") {
      step = Number.parseInt(next ?? "", 10);
      i += 1;
    } else if (arg === "--horizon") {
      horizons = [Number.parseInt(next ?? "24", 10)];
      i += 1;
    } else if (arg === "--horizons") {
      horizons = (next ?? "24")
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      i += 1;
    } else if (arg === "--output") {
      outputPath = next ?? outputPath;
      i += 1;
    }
  }

  return {
    symbols,
    evaluationIndices,
    startE,
    endE,
    step,
    observationHorizonBars: horizons.length ? horizons : [24],
    outputPath,
  };
}

export function runMslHistoricalResearchCli(
  args: MslHistoricalResearchCliArgs,
  cwd: string = process.cwd()
): { reportPath: string; json: string } {
  const { datasets, unresolved: resolveUnresolved } = resolveAvailableHistoricalResearchDatasets({
    symbols: args.symbols,
    cwd,
  });
  const built = buildMslHistoricalResearchBatchReport({
    datasets,
    evaluationIndices:
      args.evaluationIndices.length > 0 ? args.evaluationIndices : undefined,
    startE: args.startE,
    endE: args.endE,
    step: args.step,
    observationHorizonBars: args.observationHorizonBars,
  });
  const report = {
    ...built,
    unresolved: [...built.unresolved, ...resolveUnresolved].sort((a, b) => {
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    }),
  };
  const reportPath = writeMslHistoricalResearchBatchReport(args.outputPath, report);
  const json = serializeMslHistoricalResearchBatchReport(report);
  return { reportPath, json };
}
