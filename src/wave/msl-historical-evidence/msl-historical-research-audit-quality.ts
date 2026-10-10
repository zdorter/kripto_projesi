import type { MslHistoricalEvidenceRecordV1 } from "./msl-historical-evidence-types";
import type { MslHistoricalCohortAnalyticsReportV1 } from "./msl-historical-cohort-analytics-types";
import type { MslHistoricalResearchDataQualityFinding } from "./msl-historical-research-audit-types";

function finding(
  code: string,
  messages: string[]
): MslHistoricalResearchDataQualityFinding {
  return {
    code,
    count: messages.length,
    sampleMessages: messages.slice(0, 5).sort((a, b) => a.localeCompare(b)),
  };
}

export function auditMslHistoricalResearchDataQuality(input: {
  records: readonly MslHistoricalEvidenceRecordV1[];
  cohortAnalytics: MslHistoricalCohortAnalyticsReportV1;
  evaluationIndices: readonly number[];
}): MslHistoricalResearchDataQualityFinding[] {
  const { records, cohortAnalytics, evaluationIndices } = input;
  const findings: MslHistoricalResearchDataQualityFinding[] = [];

  const evalPointKeys = new Map<string, string[]>();
  for (const r of records) {
    const key = [
      r.symbol,
      r.timeframe,
      String(r.evaluationBarIndex),
      String(r.observationHorizonBars),
      r.measurementMode,
      r.eventFamily,
      r.eventId ?? "",
    ].join("|");
    const list = evalPointKeys.get(key) ?? [];
    list.push(r.datasetId);
    evalPointKeys.set(key, list);
  }
  const dupEval: string[] = [];
  for (const [key, ids] of evalPointKeys) {
    if (ids.length > 1) {
      dupEval.push(`duplicate_evaluation_point:${key}`);
    }
  }
  findings.push(finding("DUPLICATE_EVALUATION_POINT", dupEval));

  const dupEvalIndices = new Set(evaluationIndices);
  if (dupEvalIndices.size !== evaluationIndices.length) {
    findings.push(
      finding("DUPLICATE_EVALUATION_INDEX_IN_GRID", [
        `grid has ${evaluationIndices.length - dupEvalIndices.size} duplicate E values`,
      ])
    );
  } else {
    findings.push(finding("DUPLICATE_EVALUATION_INDEX_IN_GRID", []));
  }

  const eventIdSeen = new Map<string, string>();
  const dupEvent: string[] = [];
  for (const r of records) {
    if (!r.eventId) {
      continue;
    }
    const ctx = `${r.symbol}|${r.timeframe}|${r.evaluationBarIndex}|${r.measurementMode}`;
    const prior = eventIdSeen.get(r.eventId);
    if (prior && prior !== ctx) {
      dupEvent.push(`duplicate_event_id:${r.eventId}:${prior}:vs:${ctx}`);
    }
    eventIdSeen.set(r.eventId, ctx);
  }
  findings.push(finding("DUPLICATE_EVENT_ID", dupEvent));

  const missingEvent: string[] = [];
  for (const r of records) {
    if (r.sampleStatus !== "NO_EVENT" && r.eventFamily !== "NONE" && !r.eventId) {
      missingEvent.push(
        `missing_event_id:${r.symbol}:E${r.evaluationBarIndex}:H${r.observationHorizonBars}:${r.measurementMode}`
      );
    }
  }
  findings.push(finding("MISSING_EVENT_ID", missingEvent));

  const negativeBars: string[] = [];
  const outOfHorizon: string[] = [];
  for (const r of records) {
    const pools = [
      ...r.subsequentStructureEvents,
      ...r.subsequentLiquidityEvents,
      ...r.subsequentMssEvents,
    ];
    for (const e of pools) {
      if (e.barsAfterEvaluation < 0) {
        negativeBars.push(`${e.eventId}:bars=${e.barsAfterEvaluation}`);
      }
      if (e.barsAfterEvaluation > r.observationHorizonBars) {
        outOfHorizon.push(
          `${e.eventId}:bars=${e.barsAfterEvaluation}>H${r.observationHorizonBars}`
        );
      }
    }
  }
  findings.push(finding("NEGATIVE_BARS_AFTER_EVALUATION", negativeBars));
  findings.push(finding("EVENT_OUTSIDE_HORIZON", outOfHorizon));

  const strictKnownAt: string[] = [];
  const disclosureKnownAt: string[] = [];
  for (const r of records) {
    const E = r.evaluationBarIndex;
    if (r.measurementMode === "STRICT_AT_E" && r.knownAtBarIndex !== null) {
      if (r.knownAtBarIndex > E) {
        strictKnownAt.push(
          `STRICT_AT_E knownAt=${r.knownAtBarIndex}>E=${E} id=${r.eventId ?? "null"}`
        );
      }
    }
    if (r.measurementMode === "DISCLOSURE_HORIZON") {
      for (const d of r.disclosureObservations) {
        if (d.knownAtBarIndex <= E) {
          disclosureKnownAt.push(
            `DISCLOSURE knownAt=${d.knownAtBarIndex}<=E=${E} id=${d.eventId}`
          );
        }
      }
    }
  }
  findings.push(finding("STRICT_KNOWN_AT_VIOLATION", strictKnownAt));
  findings.push(finding("DISCLOSURE_KNOWN_AT_VIOLATION", disclosureKnownAt));

  const insufficientInFullHorizon: string[] = [];
  for (const c of cohortAnalytics.cohorts) {
    if (
      c.cohortDefinition.sampleStatus === "SUFFICIENT_HORIZON" &&
      c.insufficientHorizonCount > 0
    ) {
      insufficientInFullHorizon.push(
        `cohort ${JSON.stringify(c.cohortDefinition)} has insufficientHorizonCount=${c.insufficientHorizonCount}`
      );
    }
  }
  findings.push(finding("INSUFFICIENT_HORIZON_IN_SUFFICIENT_COHORT", insufficientInFullHorizon));

  const nullAsZero: string[] = [];
  for (const c of cohortAnalytics.cohorts) {
    for (const stats of [
      c.forwardReturnStats,
      c.mfeStats,
      c.maeStats,
      c.rangeExpansionStats,
    ]) {
      if (stats.count === 0 && stats.mean !== null && stats.mean !== undefined) {
        nullAsZero.push(`non_null_mean_with_zero_count:${stats.mean}`);
      }
    }
  }
  findings.push(finding("NULL_TREATED_AS_ZERO", nullAsZero));

  const cohortKeys = new Map<string, number>();
  const dupCohort: string[] = [];
  for (const c of cohortAnalytics.cohorts) {
    const key = JSON.stringify(c.cohortDefinition);
    cohortKeys.set(key, (cohortKeys.get(key) ?? 0) + 1);
  }
  for (const [key, n] of cohortKeys) {
    if (n > 1) {
      dupCohort.push(`duplicate_cohort:${key}`);
    }
  }
  findings.push(finding("DUPLICATE_COHORT", dupCohort));

  findings.sort((a, b) => a.code.localeCompare(b.code));
  return findings;
}
