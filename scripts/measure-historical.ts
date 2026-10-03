import fs from "node:fs";
import path from "node:path";
import {
  parseMeasureHistoricalCliArgs,
  runMeasureHistoricalCli,
} from "../src/wave/historical-measurement-cli";

async function main(): Promise<void> {
  const args = parseMeasureHistoricalCliArgs(process.argv.slice(2));
  const json = runMeasureHistoricalCli(args);
  const outDir = path.dirname(path.resolve(args.outputPath));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.resolve(args.outputPath), json, "utf8");
  console.log(`Wrote ${path.resolve(args.outputPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
