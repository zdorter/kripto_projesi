import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertNoForbiddenMslHistoricalResearchPipelineKeys } from "./msl-historical-research-pipeline-forbidden";
import type { MslHistoricalResearchBatchReportV1 } from "./msl-historical-research-pipeline-types";

export function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sortKeysDeep(v));
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

export function deterministicRunIdFromConfig(config: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(config));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function stripPerformanceFromBatchReport(
  report: MslHistoricalResearchBatchReportV1
): MslHistoricalResearchBatchReportV1 {
  return {
    ...report,
    performance: {
      evidenceGenerationMs: 0,
      analyticsGenerationMs: 0,
      totalProcessingMs: 0,
    },
  };
}

export function serializeMslHistoricalResearchBatchReport(
  report: MslHistoricalResearchBatchReportV1,
  options?: { includePerformance?: boolean }
): string {
  const payload =
    options?.includePerformance === false ?
      stripPerformanceFromBatchReport(report)
    : report;
  assertNoForbiddenMslHistoricalResearchPipelineKeys(payload);
  return `${JSON.stringify(sortKeysDeep(payload), null, 2)}\n`;
}

export function writeMslHistoricalResearchBatchReport(
  outputPath: string,
  report: MslHistoricalResearchBatchReportV1,
  options?: { includePerformance?: boolean }
): string {
  const abs = resolve(outputPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, serializeMslHistoricalResearchBatchReport(report, options), "utf8");
  return abs;
}
