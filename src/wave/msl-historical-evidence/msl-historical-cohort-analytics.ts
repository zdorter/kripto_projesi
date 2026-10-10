import type { MslHistoricalEvidenceRecordV1 } from "./msl-historical-evidence-types";
import {
  buildNumericDistributionStats,
  buildTimeToEventStats,
  emptyNumericDistributionStats,
  emptyTimeToEventStats,
} from "./msl-historical-cohort-analytics-stats";
import type {
  BuildDescriptiveCohortComparisonInput,
  BuildMslHistoricalCohortAnalyticsInput,
  DescriptiveCohortComparisonV1,
  MslHistoricalCohortAnalyticsReportV1,
  MslHistoricalCohortAnalyticsV1,
  MslHistoricalCohortDefinition,
  MslHistoricalCohortEventCounts,
  MslHistoricalObservedCoOccurrenceCount,
} from "./msl-historical-cohort-analytics-types";
import { MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION } from "./msl-historical-cohort-analytics-types";

const MULTISYMBOL_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

function directionKey(direction: string | null): string {
  return direction ?? "";
}

function cohortKey(def: MslHistoricalCohortDefinition): string {
  return [
    def.symbol,
    def.timeframe,
    def.measurementMode,
    def.eventFamily,
    directionKey(def.eventDirection),
    String(def.observationHorizonBars),
    def.sampleStatus,
  ].join("|");
}

function windowKey(r: MslHistoricalEvidenceRecordV1): string {
  return [
    r.symbol,
    r.timeframe,
    r.datasetChecksum,
    String(r.evaluationBarIndex),
    String(r.observationHorizonBars),
  ].join("|");
}

function recordMatchesCohort(
  r: MslHistoricalEvidenceRecordV1,
  def: MslHistoricalCohortDefinition
): boolean {
  if (r.symbol !== def.symbol) {
    return false;
  }
  if (r.timeframe !== def.timeframe) {
    return false;
  }
  if (r.measurementMode !== def.measurementMode) {
    return false;
  }
  if (r.eventFamily !== def.eventFamily) {
    return false;
  }
  if (directionKey(r.eventDirection) !== directionKey(def.eventDirection)) {
    return false;
  }
  if (r.observationHorizonBars !== def.observationHorizonBars) {
    return false;
  }
  if (def.sampleStatus !== "ALL" && r.sampleStatus !== def.sampleStatus) {
    return false;
  }
  return true;
}

function dedupeWindowRepresentatives(
  records: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalEvidenceRecordV1[] {
  const sorted = [...records].sort((a, b) => {
    const wa = windowKey(a);
    const wb = windowKey(b);
    if (wa !== wb) {
      return wa.localeCompare(wb);
    }
    const aId = a.eventId ?? "";
    const bId = b.eventId ?? "";
    return aId.localeCompare(bId);
  });
  const seen = new Set<string>();
  const out: MslHistoricalEvidenceRecordV1[] = [];
  for (const r of sorted) {
    const w = windowKey(r);
    if (seen.has(w)) {
      continue;
    }
    seen.add(w);
    out.push(r);
  }
  return out;
}

function detectOverlappingWindowRisk(
  records: readonly MslHistoricalEvidenceRecordV1[]
): boolean {
  const bySlice = new Map<string, { indices: number[]; horizon: number }>();
  for (const r of records) {
    const k = `${r.symbol}|${r.timeframe}|${r.observationHorizonBars}`;
    const entry = bySlice.get(k) ?? { indices: [], horizon: r.observationHorizonBars };
    entry.indices.push(r.evaluationBarIndex);
    bySlice.set(k, entry);
  }
  for (const { indices, horizon } of bySlice.values()) {
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]! - sorted[i - 1]! < horizon) {
        return true;
      }
    }
  }
  return false;
}

function emptyEventCounts(): MslHistoricalCohortEventCounts {
  return {
    subsequentBosCount: 0,
    subsequentChochCount: 0,
    subsequentMssCount: 0,
    subsequentTouchCount: 0,
    subsequentCrossTfTouchCount: 0,
    subsequentSweepCount: 0,
    subsequentTakenCount: 0,
    subsequentReclaimCount: 0,
    associationLiquidityToBosCount: 0,
    associationLiquidityToChochCount: 0,
    firstSubsequentEventFamilyCounts: {},
  };
}

function countSubsequentEvents(
  windows: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalCohortEventCounts {
  const counts = emptyEventCounts();
  const firstFamily: Record<string, number> = {};
  const seenEventIds = new Set<string>();

  for (const r of windows) {
    if (r.firstSubsequentEvent) {
      const fam = r.firstSubsequentEvent.eventFamily;
      firstFamily[fam] = (firstFamily[fam] ?? 0) + 1;
    }

    for (const e of r.subsequentStructureEvents) {
      if (seenEventIds.has(`${windowKey(r)}:${e.eventId}`)) {
        continue;
      }
      seenEventIds.add(`${windowKey(r)}:${e.eventId}`);
      if (e.eventFamily === "BOS") {
        counts.subsequentBosCount += 1;
      }
      if (e.eventFamily === "CHoCH") {
        counts.subsequentChochCount += 1;
      }
    }
    for (const e of r.subsequentMssEvents) {
      if (seenEventIds.has(`${windowKey(r)}:${e.eventId}`)) {
        continue;
      }
      seenEventIds.add(`${windowKey(r)}:${e.eventId}`);
      counts.subsequentMssCount += 1;
    }
    for (const e of r.subsequentLiquidityEvents) {
      if (seenEventIds.has(`${windowKey(r)}:${e.eventId}`)) {
        continue;
      }
      seenEventIds.add(`${windowKey(r)}:${e.eventId}`);
      switch (e.eventFamily) {
        case "LIQUIDITY_WICK_TOUCH":
          counts.subsequentTouchCount += 1;
          break;
        case "CROSS_TF_LIQUIDITY_WICK_TOUCH":
          counts.subsequentCrossTfTouchCount += 1;
          break;
        case "LIQUIDITY_SWEEP":
          counts.subsequentSweepCount += 1;
          break;
        case "LIQUIDITY_TAKEN":
          counts.subsequentTakenCount += 1;
          break;
        case "LIQUIDITY_RECLAIM":
          counts.subsequentReclaimCount += 1;
          break;
        default:
          break;
      }
    }
    for (const d of r.disclosureObservations) {
      if (d.eventFamily === "LIQUIDITY_TO_BOS") {
        counts.associationLiquidityToBosCount += 1;
      }
      if (d.eventFamily === "LIQUIDITY_TO_CHOCH") {
        counts.associationLiquidityToChochCount += 1;
      }
    }
  }

  counts.firstSubsequentEventFamilyCounts = Object.fromEntries(
    Object.entries(firstFamily).sort(([a], [b]) => a.localeCompare(b))
  );
  return counts;
}

function coOccurrenceKey(families: readonly string[]): string {
  return [...new Set(families)].sort((a, b) => a.localeCompare(b)).join("+");
}

function buildCoOccurrenceCounts(
  windows: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalObservedCoOccurrenceCount[] {
  const map = new Map<string, number>();
  for (const r of windows) {
    const families = new Set<string>();
    for (const e of r.subsequentStructureEvents) {
      families.add(e.eventFamily);
    }
    for (const e of r.subsequentMssEvents) {
      families.add(e.eventFamily);
    }
    for (const e of r.subsequentLiquidityEvents) {
      if (
        e.eventFamily === "LIQUIDITY_SWEEP" ||
        e.eventFamily === "LIQUIDITY_TAKEN" ||
        e.eventFamily === "LIQUIDITY_RECLAIM" ||
        e.eventFamily === "LIQUIDITY_WICK_TOUCH"
      ) {
        families.add(e.eventFamily);
      }
    }
    const list = [...families].sort((a, b) => a.localeCompare(b));
    if (list.length < 2) {
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = coOccurrenceKey([list[i]!, list[j]!]);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([observedCoOccurrenceKey, count]) => ({ observedCoOccurrenceKey, count }));
}

function collectBarsAfter(
  windows: readonly MslHistoricalEvidenceRecordV1[],
  family: string
): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  for (const r of windows) {
    const pools = [
      ...r.subsequentStructureEvents,
      ...r.subsequentMssEvents,
      ...r.subsequentLiquidityEvents,
    ];
    for (const e of pools) {
      const id = `${windowKey(r)}:${e.eventId}`;
      if (seen.has(id)) {
        continue;
      }
      if (e.eventFamily !== family) {
        continue;
      }
      seen.add(id);
      out.push(e.barsAfterEvaluation);
    }
  }
  return out;
}

function buildCohortAnalytics(
  def: MslHistoricalCohortDefinition,
  records: readonly MslHistoricalEvidenceRecordV1[],
  overlappingWindowRisk: boolean
): MslHistoricalCohortAnalyticsV1 {
  const matched = records.filter((r) => recordMatchesCohort(r, def));
  const windows = dedupeWindowRepresentatives(matched);

  const forwardReturns: number[] = [];
  const mfe: number[] = [];
  const mae: number[] = [];
  const rangeExp: number[] = [];

  let sufficientHorizonCount = 0;
  let insufficientHorizonCount = 0;
  let noEventCount = 0;
  let eventCount = 0;

  for (const r of matched) {
    if (r.sampleStatus === "SUFFICIENT_HORIZON") {
      sufficientHorizonCount += 1;
    } else if (r.sampleStatus === "INSUFFICIENT_HORIZON") {
      insufficientHorizonCount += 1;
    }
    if (r.sampleStatus === "NO_EVENT") {
      noEventCount += 1;
    } else {
      eventCount += 1;
    }
  }

  for (const r of windows) {
    if (r.sampleStatus !== "SUFFICIENT_HORIZON") {
      continue;
    }
    const f = r.forwardObservations;
    if (f.forwardReturn !== null) {
      forwardReturns.push(f.forwardReturn);
    }
    if (f.maxFavorableExcursion !== null) {
      mfe.push(f.maxFavorableExcursion);
    }
    if (f.maxAdverseExcursion !== null) {
      mae.push(f.maxAdverseExcursion);
    }
    if (f.rangeExpansion !== null) {
      rangeExp.push(f.rangeExpansion);
    }
  }

  const limitations = [
    "descriptive_historical_measurement_only",
    "not_predictive_not_causal",
    "DESCRIPTIVE_ONLY",
  ];
  if (overlappingWindowRisk) {
    limitations.push(
      "overlappingWindowRisk=true",
      "neighboring_evaluation_windows_may_share_future_bars_not_independent_samples"
    );
  }

  return {
    schemaVersion: MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION,
    cohortDefinition: def,
    sampleCount: matched.length,
    eventCount,
    noEventCount,
    sufficientHorizonCount,
    insufficientHorizonCount,
    overlappingWindowRisk,
    forwardReturnStats: buildNumericDistributionStats(forwardReturns),
    mfeStats: buildNumericDistributionStats(mfe),
    maeStats: buildNumericDistributionStats(mae),
    rangeExpansionStats: buildNumericDistributionStats(rangeExp),
    eventCounts: countSubsequentEvents(windows),
    timeToEventStats: {
      bos: buildTimeToEventStats(collectBarsAfter(windows, "BOS")),
      choch: buildTimeToEventStats(collectBarsAfter(windows, "CHoCH")),
      mss: buildTimeToEventStats(collectBarsAfter(windows, "MSS")),
      liquidityWickTouch: buildTimeToEventStats(
        collectBarsAfter(windows, "LIQUIDITY_WICK_TOUCH")
      ),
      liquiditySweep: buildTimeToEventStats(collectBarsAfter(windows, "LIQUIDITY_SWEEP")),
      liquidityTaken: buildTimeToEventStats(collectBarsAfter(windows, "LIQUIDITY_TAKEN")),
      liquidityReclaim: buildTimeToEventStats(collectBarsAfter(windows, "LIQUIDITY_RECLAIM")),
    },
    observedCoOccurrenceCounts: buildCoOccurrenceCounts(windows),
    limitations: [...limitations].sort((a, b) => a.localeCompare(b)),
    unresolved: [],
  };
}

function discoverCohortDefinitions(
  records: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalCohortDefinition[] {
  const set = new Map<string, MslHistoricalCohortDefinition>();
  for (const r of records) {
    for (const sampleStatus of [
      r.sampleStatus,
      "ALL" as const,
    ]) {
      const def: MslHistoricalCohortDefinition = {
        symbol: r.symbol,
        timeframe: r.timeframe,
        measurementMode: r.measurementMode,
        eventFamily: r.eventFamily,
        eventDirection: r.eventDirection,
        observationHorizonBars: r.observationHorizonBars,
        sampleStatus,
      };
      set.set(cohortKey(def), def);
    }
  }
  return [...set.values()].sort((a, b) => cohortKey(a).localeCompare(cohortKey(b)));
}

export function buildMslHistoricalCohortAnalyticsReport(
  input: BuildMslHistoricalCohortAnalyticsInput
): MslHistoricalCohortAnalyticsReportV1 {
  const records = [...input.records].sort((a, b) => {
    if (a.evaluationBarIndex !== b.evaluationBarIndex) {
      return a.evaluationBarIndex - b.evaluationBarIndex;
    }
    const aId = a.eventId ?? "";
    const bId = b.eventId ?? "";
    return aId.localeCompare(bId);
  });

  const symbols = [...new Set(records.map((r) => r.symbol))].sort((a, b) =>
    a.localeCompare(b)
  );
  const timeframes = [...new Set(records.map((r) => r.timeframe))].sort((a, b) =>
    a.localeCompare(b)
  );
  const datasetIds = [...new Set(records.map((r) => r.datasetId))].sort((a, b) =>
    a.localeCompare(b)
  );
  const datasetChecksums = [...new Set(records.map((r) => r.datasetChecksum))].sort(
    (a, b) => a.localeCompare(b)
  );

  const multisymbolPresent = symbols.filter((s) =>
    MULTISYMBOL_SYMBOLS.includes(s as (typeof MULTISYMBOL_SYMBOLS)[number])
  );
  const multisymbolDataSupplied = multisymbolPresent.length > 1;

  const overlappingWindowRisk = detectOverlappingWindowRisk(records);
  const limitations = ["msl_historical_cohort_analytics_v1", "DESCRIPTIVE_ONLY"];
  const unresolved: { code: string; message: string }[] = [];

  if (symbols.length === 1 && symbols[0] === "BTCUSDT") {
    unresolved.push({
      code: "MULTISYMBOL_DATA_NOT_SUPPLIED",
      message:
        "Only BTCUSDT evidence supplied; other multisymbol slots remain unfilled (not fabricated).",
    });
  }

  const cohorts = discoverCohortDefinitions(records).map((def) =>
    buildCohortAnalytics(def, records, overlappingWindowRisk)
  );

  return {
    schemaVersion: MSL_HISTORICAL_COHORT_ANALYTICS_SCHEMA_VERSION,
    datasetIds,
    datasetChecksums,
    symbolsPresent: symbols,
    timeframesPresent: timeframes,
    multisymbolDataSupplied,
    overlappingWindowRisk,
    cohorts,
    limitations: [...limitations].sort((a, b) => a.localeCompare(b)),
    unresolved: [...unresolved].sort((a, b) => {
      if (a.code !== b.code) {
        return a.code.localeCompare(b.code);
      }
      return a.message.localeCompare(b.message);
    }),
  };
}

function filterByStrictPresence(
  records: readonly MslHistoricalEvidenceRecordV1[],
  presence: "PRESENT" | "ABSENT" | undefined,
  family: "BOS" | "CHoCH" | "MSS"
): MslHistoricalEvidenceRecordV1[] {
  if (!presence) {
    return [...records];
  }
  const windows = dedupeWindowRepresentatives(records);
  const windowHasStrict = new Map<string, boolean>();
  for (const r of records) {
    if (r.measurementMode !== "STRICT_AT_E" || r.eventFamily !== family) {
      continue;
    }
    windowHasStrict.set(windowKey(r), true);
  }
  const allowedWindows = new Set<string>();
  for (const w of windows) {
    const key = windowKey(w);
    const has = windowHasStrict.get(key) ?? false;
    if (presence === "PRESENT" && has) {
      allowedWindows.add(key);
    }
    if (presence === "ABSENT" && !has) {
      allowedWindows.add(key);
    }
  }
  return records.filter((r) => allowedWindows.has(windowKey(r)));
}

export function buildDescriptiveCohortComparison(
  input: BuildDescriptiveCohortComparisonInput
): DescriptiveCohortComparisonV1 {
  const defA: MslHistoricalCohortDefinition = {
    symbol: input.cohortA.symbol,
    timeframe: input.cohortA.timeframe,
    measurementMode: input.cohortA.measurementMode,
    eventFamily: input.cohortA.eventFamily,
    eventDirection: input.cohortA.eventDirection,
    observationHorizonBars: input.cohortA.observationHorizonBars,
    sampleStatus: input.cohortA.sampleStatus ?? "SUFFICIENT_HORIZON",
  };
  const defB: MslHistoricalCohortDefinition = {
    symbol: input.cohortB.symbol,
    timeframe: input.cohortB.timeframe,
    measurementMode: input.cohortB.measurementMode,
    eventFamily: input.cohortB.eventFamily,
    eventDirection: input.cohortB.eventDirection,
    observationHorizonBars: input.cohortB.observationHorizonBars,
    sampleStatus: input.cohortB.sampleStatus ?? "SUFFICIENT_HORIZON",
  };

  const poolA = filterByStrictPresence(
    input.records,
    input.cohortA.strictEventPresence,
    "BOS"
  );
  const poolB = filterByStrictPresence(
    input.records,
    input.cohortB.strictEventPresence,
    "BOS"
  );

  const cohortA = buildCohortAnalytics(defA, poolA, detectOverlappingWindowRisk(poolA));
  const cohortB = buildCohortAnalytics(defB, poolB, detectOverlappingWindowRisk(poolB));

  const meanDiff = (a: number | null, b: number | null): number | null => {
    if (a === null || b === null) {
      return null;
    }
    return a - b;
  };

  return {
    comparisonKind: "DESCRIPTIVE_COHORT_COMPARISON",
    label: "DESCRIPTIVE_ONLY",
    cohortA: defA,
    cohortB: defB,
    sampleCountA: cohortA.sampleCount,
    sampleCountB: cohortB.sampleCount,
    meanForwardReturnDifference: meanDiff(
      cohortA.forwardReturnStats.mean,
      cohortB.forwardReturnStats.mean
    ),
    medianForwardReturnDifference: meanDiff(
      cohortA.forwardReturnStats.median,
      cohortB.forwardReturnStats.median
    ),
    meanMfeDifference: meanDiff(cohortA.mfeStats.mean, cohortB.mfeStats.mean),
    meanMaeDifference: meanDiff(cohortA.maeStats.mean, cohortB.maeStats.mean),
    limitations: [
      "DESCRIPTIVE_ONLY",
      "not_predictive_not_causal",
      "descriptive_cohort_comparison",
    ],
  };
}

export function sortCohortAnalyticsReportForDeterministicJson(
  report: MslHistoricalCohortAnalyticsReportV1
): MslHistoricalCohortAnalyticsReportV1 {
  return {
    ...report,
    cohorts: [...report.cohorts].sort((a, b) =>
      cohortKey(a.cohortDefinition).localeCompare(cohortKey(b.cohortDefinition))
    ),
  };
}
