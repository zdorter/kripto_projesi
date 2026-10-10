import { runMsl14HistoricalResearchAudit } from "../src/wave/msl-historical-evidence/msl-historical-research-audit-run";

function parseSymbols(argv: string[]): string[] | undefined {
  const idx = argv.indexOf("--symbols");
  if (idx === -1) {
    return undefined;
  }
  return (argv[idx + 1] ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const symbols = parseSymbols(argv);
  const exportEvidenceNdjson = argv.includes("--export-evidence");
  const result = runMsl14HistoricalResearchAudit({ symbols, exportEvidenceNdjson });
  console.log("MSL-14 historical research measurement audit complete.");
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Batch runId: ${result.batchReport.runId}`);
  console.log(`Audit runId: ${result.auditReport.auditRunId}`);
  console.log(`Symbols: ${result.auditReport.multisymbolStatus.symbolCount}`);
  console.log(`Evidence records: ${result.batchReport.evidenceRecords.length}`);
  console.log(`Execution wall ms: ${Math.round(result.executionPerformance.totalWallMs)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
