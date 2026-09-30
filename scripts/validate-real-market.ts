import fs from "node:fs";
import path from "node:path";
import { DEMO_WAVE_ENGINE_OPTIONS } from "../src/browser/demo-ohlcv";
import {
  DEFAULT_REAL_MARKET_SYMBOLS,
  formatRealMarketValidationReport,
  runRealMarketValidation,
} from "../src/validation/real-market-validation";

const OUT_DIR = path.join(process.cwd(), "validation-output");
const OUT_FILE = path.join(OUT_DIR, "real-market-validation.json");

async function main(): Promise<void> {
  const report = await runRealMarketValidation({
    symbols: DEFAULT_REAL_MARKET_SYMBOLS,
    interval: "1h",
    limit: 500,
    timeframeId: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    fetchedAt: new Date().toISOString(),
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log(formatRealMarketValidationReport(report));
  console.log("");
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
