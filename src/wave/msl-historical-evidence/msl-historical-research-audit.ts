import { createHash } from "node:crypto";
import type { MslHistoricalEvidenceRecordV1 } from "./msl-historical-evidence-types";
import { auditMslHistoricalResearchDataQuality } from "./msl-historical-research-audit-quality";
import type {
  BuildMslHistoricalResearchMeasurementAuditInput,
  MslHistoricalResearchEventInventoryV1,
  MslHistoricalResearchMeasurementAuditReportV1,
  MslHistoricalResearchMeasurementModeCohortSummary,
} from "./msl-historical-research-audit-types";
import { MSL_HISTORICAL_RESEARCH_MEASUREMENT_AUDIT_SCHEMA_VERSION } from "./msl-historical-research-audit-types";
import type { MslHistoricalResearchBatchReportV1 } from "./msl-historical-research-pipeline-types";

function emptyEventInventory(): MslHistoricalResearchEventInventoryV1 {
  return {
    BOS: 0,
    CHoCH: 0,
    MSS: 0,
    LIQUIDITY_WICK_TOUCH: 0,
    CROSS_TF_LIQUIDITY_WICK_TOUCH: 0,
    SWEEP: 0,
    TAKEN: 0,
    RECLAIM: 0,
    LIQUIDITY_TO_BOS: 0,
    LIQUIDITY_TO_CHOCH: 0,
    STRUCTURE_TO_MSS: 0,
    MSS_TO_STRUCTURE: 0,
    MSS_TO_MSS: 0,
    NONE: 0,
  };
}

function mapFamilyToInventoryKey(
  family: string
): keyof MslHistoricalResearchEventInventoryV1 | null {
  switch (family) {
    case "LIQUIDITY_SWEEP":
      return "SWEEP";
    case "LIQUIDITY_TAKEN":
      return "TAKEN";
    case "LIQUIDITY_RECLAIM":
      return "RECLAIM";
    case "BOS":
    case "CHoCH":
    case "MSS":
    case "LIQUIDITY_WICK_TOUCH":
    case "CROSS_TF_LIQUIDITY_WICK_TOUCH":
    case "LIQUIDITY_TO_BOS":
    case "LIQUIDITY_TO_CHOCH":
    case "NONE":
      return family;
    default:
      return null;
  }
}

function buildEventInventory(
  batch: MslHistoricalResearchBatchReportV1
): MslHistoricalResearchEventInventoryV1 {
  const inv = emptyEventInventory();
  for (const [fam, count] of Object.entries(batch.evidenceSummary.eventFamilyCounts)) {
    const key = mapFamilyToInventoryKey(fam);
    if (key) {
      inv[key] += count;
    }
  }
  const seen = new Set<string>();
  for (const r of batch.evidenceRecords) {
    const window = `${r.symbol}|${r.timeframe}|${r.evaluationBarIndex}|${r.observationHorizonBars}`;
    const pools = [
      ...r.subsequentStructureEvents,
      ...r.subsequentMssEvents,
      ...r.subsequentLiquidityEvents,
    ];
    for (const e of pools) {
      const dedupe = `${window}|${e.eventId}`;
      if (seen.has(dedupe)) {
        continue;
      }
      seen.add(dedupe);
      const key = mapFamilyToInventoryKey(e.eventFamily);
      if (key && key !== "LIQUIDITY_TO_BOS" && key !== "LIQUIDITY_TO_CHOCH") {
        inv[key] += 1;
      }
    }
    for (const d of r.disclosureObservations) {
      const key = mapFamilyToInventoryKey(d.eventFamily);
      if (key === "LIQUIDITY_TO_BOS" || key === "LIQUIDITY_TO_CHOCH") {
        inv[key] += 1;
      }
    }
  }
  return inv;
}

function buildAssociationInventory(
  records: readonly MslHistoricalEvidenceRecordV1[]
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {
    LIQUIDITY_TO_BOS: 0,
    LIQUIDITY_TO_CHOCH: 0,
    STRUCTURE_TO_MSS: 0,
    MSS_TO_STRUCTURE: 0,
    MSS_TO_MSS: 0,
  };
  for (const r of records) {
    for (const d of r.disclosureObservations) {
      if (d.eventFamily === "LIQUIDITY_TO_BOS") {
        out.LIQUIDITY_TO_BOS! += 1;
      }
      if (d.eventFamily === "LIQUIDITY_TO_CHOCH") {
        out.LIQUIDITY_TO_CHOCH! += 1;
      }
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function buildMeasurementModeAudit(
  batch: MslHistoricalResearchBatchReportV1
): MslHistoricalResearchMeasurementModeCohortSummary[] {
  const modes = ["STRICT_AT_E", "DISCLOSURE_HORIZON", "OBSERVATION_ONLY"] as const;
  return modes.map((measurementMode) => {
    const cohorts = batch.cohortAnalytics.cohorts.filter(
      (c) => c.cohortDefinition.measurementMode === measurementMode
    );
    return {
      measurementMode,
      cohortRowCount: cohorts.length,
      sampleCount: cohorts.reduce((s, c) => s + c.sampleCount, 0),
      eventCount: cohorts.reduce((s, c) => s + c.eventCount, 0),
      noEventCount: cohorts.reduce((s, c) => s + c.noEventCount, 0),
      sufficientHorizonCount: cohorts.reduce((s, c) => s + c.sufficientHorizonCount, 0),
      insufficientHorizonCount: cohorts.reduce((s, c) => s + c.insufficientHorizonCount, 0),
    };
  });
}

function aggregateCoOccurrence(
  batch: MslHistoricalResearchBatchReportV1
): { observedCoOccurrenceKey: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of batch.cohortAnalytics.cohorts) {
    for (const row of c.observedCoOccurrenceCounts) {
      map.set(
        row.observedCoOccurrenceKey,
        (map.get(row.observedCoOccurrenceKey) ?? 0) + row.count
      );
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([observedCoOccurrenceKey, count]) => ({ observedCoOccurrenceKey, count }));
}

function buildTimeToEventAudit(batch: MslHistoricalResearchBatchReportV1) {
  const families = [
    { key: "BOS", field: "bos" as const },
    { key: "CHoCH", field: "choch" as const },
    { key: "MSS", field: "mss" as const },
    { key: "LIQUIDITY_WICK_TOUCH", field: "liquidityWickTouch" as const },
    { key: "LIQUIDITY_SWEEP", field: "liquiditySweep" as const },
    { key: "LIQUIDITY_TAKEN", field: "liquidityTaken" as const },
    { key: "LIQUIDITY_RECLAIM", field: "liquidityReclaim" as const },
  ];
  const map = new Map<
    string,
    { count: number; min: number | null; max: number | null; mean: number | null; median: number | null }
  >();
  for (const f of families) {
    map.set(f.key, { count: 0, min: null, max: null, mean: null, median: null });
  }
  for (const c of batch.cohortAnalytics.cohorts) {
    for (const f of families) {
      const stats = c.timeToEventStats[f.field];
      const cur = map.get(f.key)!;
      cur.count += stats.count;
      if (stats.minBars !== null) {
        cur.min = cur.min === null ? stats.minBars : Math.min(cur.min, stats.minBars);
      }
      if (stats.maxBars !== null) {
        cur.max = cur.max === null ? stats.maxBars : Math.max(cur.max, stats.maxBars);
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([eventFamily, s]) => ({
      eventFamily,
      count: s.count,
      minBars: s.min,
      medianBars: s.median,
      meanBars: s.mean,
      maxBars: s.max,
    }));
}

function buildForwardMetricAudit(batch: MslHistoricalResearchBatchReportV1) {
  return batch.cohortAnalytics.cohorts
    .filter((c) => c.cohortDefinition.sampleStatus === "SUFFICIENT_HORIZON")
    .map((c) => ({
      eventFamily: c.cohortDefinition.eventFamily,
      measurementMode: c.cohortDefinition.measurementMode,
      observationHorizonBars: c.cohortDefinition.observationHorizonBars,
      timeframe: c.cohortDefinition.timeframe,
      forwardReturnStats: c.forwardReturnStats,
      mfeStats: c.mfeStats,
      maeStats: c.maeStats,
      rangeExpansionStats: c.rangeExpansionStats,
    }))
    .sort((a, b) => {
      const keys = [
        a.timeframe.localeCompare(b.timeframe),
        a.measurementMode.localeCompare(b.measurementMode),
        a.eventFamily.localeCompare(b.eventFamily),
        a.observationHorizonBars - b.observationHorizonBars,
      ];
      for (const k of keys) {
        if (k !== 0) {
          return k;
        }
      }
      return 0;
    });
}

export function deterministicAuditRunId(batchRunId: string, gridId: string): string {
  return createHash("sha256").update(`${batchRunId}|${gridId}`, "utf8").digest("hex");
}

export function buildMslHistoricalResearchMeasurementAuditReport(
  input: BuildMslHistoricalResearchMeasurementAuditInput
): MslHistoricalResearchMeasurementAuditReportV1 {
  const { batchReport, grid, checksumAudit, leakageAudit, futureSpikeAudit, datasetCandleCounts } =
    input;

  const multisymbolUnresolved = batchReport.unresolved.filter(
    (u) => u.code === "MULTISYMBOL_DATA_NOT_SUPPLIED"
  );
  const symbolCount = batchReport.coverage.symbolCount;

  const dataQualityAudit =
    input.dataQualityAudit ??
    auditMslHistoricalResearchDataQuality({
      records: batchReport.evidenceRecords,
      cohortAnalytics: batchReport.cohortAnalytics,
      evaluationIndices: grid.evaluationIndices,
    });

  const limitations = [
    "msl_14_research_measurement_audit_v1",
    "descriptive_only_not_predictive",
    "overlap_dependency_risk_disclosed",
    "DERIVED_1H_4H_MTF_CANONICAL",
    "NATIVE_HTF_PRODUCTION_NOT_ESTABLISHED",
    "15M_NOT_ESTABLISHED",
  ];
  if (!leakageAudit.passed) {
    limitations.push("leakage_audit_failed");
  }
  if (!futureSpikeAudit.passed) {
    limitations.push("future_spike_audit_failed");
  }

  const unresolved = [...batchReport.unresolved];
  if (!leakageAudit.passed) {
    unresolved.push({ code: "LEAKAGE_AUDIT_FAILED", message: "Strict or known-at changed on prefix extend." });
  }
  if (!futureSpikeAudit.passed) {
    unresolved.push({ code: "FUTURE_SPIKE_AUDIT_FAILED", message: "Strict membership or checksum failed." });
  }
  for (const f of dataQualityAudit) {
    if (f.count > 0 && f.code.includes("VIOLATION")) {
      unresolved.push({
        code: f.code,
        message: `${f.count} finding(s); see dataQualityAudit.`,
      });
    }
  }

  return {
    schemaVersion: MSL_HISTORICAL_RESEARCH_MEASUREMENT_AUDIT_SCHEMA_VERSION,
    auditRunId: deterministicAuditRunId(batchReport.runId, grid.gridId),
    grid,
    batchRunId: batchReport.runId,
    datasetInventory: batchReport.datasets
      .map((d) => ({
        datasetId: d.datasetId,
        symbol: d.symbol,
        timeframe: d.timeframe,
        datasetChecksum: d.datasetChecksum,
        fixturePath: d.fixturePath,
        candleCount: datasetCandleCounts[d.datasetId] ?? 0,
        status: d.status,
      }))
      .sort((a, b) => a.datasetId.localeCompare(b.datasetId)),
    checksumAudit: [...checksumAudit].sort((a, b) => a.datasetId.localeCompare(b.datasetId)),
    measurementModeAudit: buildMeasurementModeAudit(batchReport),
    eventInventory: buildEventInventory(batchReport),
    associationInventory: buildAssociationInventory(batchReport.evidenceRecords),
    forwardMetricAudit: buildForwardMetricAudit(batchReport),
    timeToEventAudit: buildTimeToEventAudit(batchReport),
    horizonComparison: [...batchReport.horizonComparisons].sort(
      (a, b) => a.observationHorizonBars - b.observationHorizonBars
    ),
    coOccurrenceAudit: aggregateCoOccurrence(batchReport),
    overlapDependencyAudit: {
      ...batchReport.overlap,
      overlapDependencyRiskLabel: "overlap_dependency_risk",
      notStatisticallyIndependentNote:
        "Overlapping historical evaluation windows are not statistically independent samples.",
    },
    leakageAudit,
    futureSpikeAudit,
    dataQualityAudit,
    multisymbolStatus: {
      multisymbolDataSupplied: symbolCount > 1,
      symbolCount,
      unresolvedCodes: multisymbolUnresolved.map((u) => u.code),
    },
    mtfStatus: {
      canonicalMtf: "DERIVED_1H_4H",
      fifteenMinute: "NOT_ESTABLISHED",
      nativeHtfProduction: "NOT_ESTABLISHED",
    },
    performance: batchReport.performance,
    limitations: [...new Set(limitations)].sort((a, b) => a.localeCompare(b)),
    unresolved: [...unresolved].sort((a, b) => {
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    }),
  };
}
