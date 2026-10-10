import { parseMslHistoricalResearchCliArgs, runMslHistoricalResearchCli } from "../src/wave/msl-historical-evidence/msl-historical-research-cli";

async function main(): Promise<void> {
  const args = parseMslHistoricalResearchCliArgs(process.argv.slice(2));
  const { reportPath } = runMslHistoricalResearchCli(args);
  console.log(`MSL-13 historical research batch written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
