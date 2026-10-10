import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { INDEPENDENT_TRADE_DURATION_BUCKET_IDS } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeDurationBucketId } from "./historical-independent-trade-analysis-types";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import { HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS } from "./historical-position-outcome-statistics-types";
import type { HistoricalPositionOutcomeDirectionSliceKey } from "./historical-position-outcome-statistics-types";
import { classifyTheoreticalRGeometryForAudit } from "./historical-independent-trade-r-eligibility-audit";
import type { TheoreticalRGeometryClassification } from "./historical-independent-trade-r-eligibility-audit-types";
import type { TheoreticalRDecisiveTradeAuditRow } from "./historical-independent-trade-r-eligibility-audit-types";
import {
  computeTheoreticalTradeRMultiple,
  type TheoreticalTradeRMultipleResult,
} from "./historical-independent-trade-r-multiple-statistics";
import {
  computeIndependentTradeWinRateDecisive,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS,
  ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS,
  ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_CONTRACT_VERSION,
  ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS,
  ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_CONTRACT_VERSION,
  ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS,
  ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS,
  HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION,
  type BuildHistoricalEntryReferenceQualityAnalysisInput,
  type EntryReferenceAnalysisQuestionAnswer,
  type EntryReferenceDirectionCross,
  type EntryReferenceDurationCross,
  type EntryReferenceEvaluationCrossCell,
  type EntryReferenceGeometryEvaluationCross,
  type EntryReferenceGeometryQuality,
  type EntryReferenceInvalidGeometrySection,
  type EntryReferenceQualityByGeometry,
  type EntryReferenceQualityByRewardDistance,
  type EntryReferenceQualityByRiskDistance,
  type EntryReferenceQualityOutcomeSlice,
  type EntryReferenceRewardDistanceBucketId,
  type EntryReferenceRiskDistanceBucketId,
  type EntryReferenceRrCross,
  type HistoricalEntryReferenceQualityAnalysisReport,
} from "./historical-entry-reference-quality-analysis-types";
import type { TradeEvaluationStatus } from "./setup/trade-evaluation-types";

const EVALUATION_ROWS: readonly Extract<
  TradeEvaluationStatus,
  "PASSED" | "FAILED" | "INSUFFICIENT_CONTEXT"
>[] = ["PASSED", "FAILED", "INSUFFICIENT_CONTEXT"];

const ANALYSIS_WARNINGS: readonly string[] = [
  "observational_analysis",
  "no_causality",
  "no_pnl",
  "no_execution_simulation",
  "no_fees",
  "no_slippage",
  "no_funding",
  "no_position_sizing",
  "theoretical_r_only",
  "prospective_rr_not_theoretical_r",
  "temporal_dependence",
  "overlapping_historical_observations_at_snapshot_layer",
  "independent_trade_mutex_not_statistical_independence",
  "small_sample_caution",
  "invalid_geometry_excluded_from_theoretical_r_where_applicable",
];

type Acc = {
  trades: number;
  measuredTrades: number;
  unmeasuredTrades: number;
  decisive: number;
  wins: number;
  losses: number;
  inconclusive: number;
  unresolved: number;
  rSum: number;
  rCount: number;
};

function emptyAcc(): Acc {
  return {
    trades: 0,
    measuredTrades: 0,
    unmeasuredTrades: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    inconclusive: 0,
    unresolved: 0,
    rSum: 0,
    rCount: 0,
  };
}

function isDecisive(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION" || c === "ADVERSE_RESOLUTION";
}

function isMeasured(c: HistoricalPositionPolicyClassification): boolean {
  return (
    c === "FAVORABLE_RESOLUTION" ||
    c === "ADVERSE_RESOLUTION" ||
    c === "INCONCLUSIVE_SAME_BAR" ||
    c === "UNRESOLVED_AT_HORIZON"
  );
}

function accumulateTrade(acc: Acc, trade: IndependentTradeUnit, theoreticalR: number | null): void {
  const c = trade.policyClassification;
  acc.trades += 1;
  if (isMeasured(c)) {
    acc.measuredTrades += 1;
  } else {
    acc.unmeasuredTrades += 1;
  }
  if (c === "FAVORABLE_RESOLUTION") {
    acc.wins += 1;
    acc.decisive += 1;
  } else if (c === "ADVERSE_RESOLUTION") {
    acc.losses += 1;
    acc.decisive += 1;
  } else if (c === "INCONCLUSIVE_SAME_BAR") {
    acc.inconclusive += 1;
  } else if (c === "UNRESOLVED_AT_HORIZON") {
    acc.unresolved += 1;
  }
  if (theoreticalR !== null && Number.isFinite(theoreticalR)) {
    acc.rSum += theoreticalR;
    acc.rCount += 1;
  }
}

function accToSlice(acc: Acc): EntryReferenceQualityOutcomeSlice {
  return {
    trades: acc.trades,
    measuredTrades: acc.measuredTrades,
    unmeasuredTrades: acc.unmeasuredTrades,
    decisive: acc.decisive,
    wins: acc.wins,
    losses: acc.losses,
    inconclusive: acc.inconclusive,
    unresolved: acc.unresolved,
    winRate_decisive: computeIndependentTradeWinRateDecisive(acc.wins, acc.losses),
    averageTheoreticalR: acc.rCount === 0 ? null : acc.rSum / acc.rCount,
    theoreticalRTradeCount: acc.rCount,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(acc.decisive),
    descriptiveOnly: true,
  };
}

function emptyGeometryAccMap(): Record<EntryReferenceGeometryQuality, Acc> {
  return Object.fromEntries(
    ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, emptyAcc()])
  ) as Record<EntryReferenceGeometryQuality, Acc>;
}

export function mapAuditGeometryToEntryReferenceQuality(
  geometry: TheoreticalRGeometryClassification
): EntryReferenceGeometryQuality {
  if (
    geometry === "VALID_BULLISH_GEOMETRY" ||
    geometry === "VALID_BEARISH_GEOMETRY"
  ) {
    return "CONSISTENT_GEOMETRY";
  }
  if (geometry === "INCONSISTENT_TARGET_DIRECTION") {
    return "INCONSISTENT_TARGET_DIRECTION";
  }
  if (geometry === "INVALID_RISK_REFERENCE") {
    return "INVALID_RISK_REFERENCE";
  }
  return "INSUFFICIENT_GEOMETRY";
}

export function classifyEntryReferenceRiskDistanceBucket(
  riskDistancePercentage: number | null
): EntryReferenceRiskDistanceBucketId {
  if (riskDistancePercentage === null || !Number.isFinite(riskDistancePercentage)) {
    return "NOT_APPLICABLE";
  }
  if (
    riskDistancePercentage <
    ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS.tightMaxExclusive
  ) {
    return "TIGHT_RISK";
  }
  if (
    riskDistancePercentage <
    ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS.mediumMaxExclusive
  ) {
    return "MEDIUM_RISK";
  }
  return "WIDE_RISK";
}

export function classifyEntryReferenceRewardDistanceBucket(
  rewardDistancePercentage: number | null
): EntryReferenceRewardDistanceBucketId {
  if (
    rewardDistancePercentage === null ||
    !Number.isFinite(rewardDistancePercentage)
  ) {
    return "NOT_APPLICABLE";
  }
  if (
    rewardDistancePercentage <
    ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS.shortMaxExclusive
  ) {
    return "SHORT_REWARD";
  }
  if (
    rewardDistancePercentage <
    ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS.mediumMaxExclusive
  ) {
    return "MEDIUM_REWARD";
  }
  return "LONG_REWARD";
}

function resolveDurationBucket(
  durationBars: number | null
): IndependentTradeDurationBucketId | null {
  if (durationBars === null || !Number.isFinite(durationBars)) {
    return null;
  }
  const d = Math.floor(durationBars);
  if (d >= 1 && d <= 3) {
    return "DURATION_1_3";
  }
  if (d >= 4 && d <= 6) {
    return "DURATION_4_6";
  }
  if (d >= 7 && d <= 12) {
    return "DURATION_7_12";
  }
  if (d >= 13 && d <= 24) {
    return "DURATION_13_24";
  }
  return null;
}

function resolveEvalStatus(
  trade: IndependentTradeUnit
): (typeof EVALUATION_ROWS)[number] | null {
  const s = trade.tradeEvaluationStatus;
  if (s === "PASSED" || s === "FAILED" || s === "INSUFFICIENT_CONTEXT") {
    return s;
  }
  return null;
}

function emptyCrossCell(): EntryReferenceEvaluationCrossCell {
  return {
    total: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    winRate_decisive: computeIndependentTradeWinRateDecisive(0, 0),
  };
}

function assertInputParity(
  input: BuildHistoricalEntryReferenceQualityAnalysisInput
): void {
  const { lifecycleReport, statisticsReport, rMultipleStatisticsReport, eligibilityAuditReport } =
    input;
  const trades = lifecycleReport.trades.length;
  const c = statisticsReport.overall.counts;
  const o = rMultipleStatisticsReport.overall;
  if (trades !== c.totalTrades || trades !== o.totalTrades) {
    throw new Error(
      "B-12j parity: lifecycle trade count ≠ B-12c/B-12g totalTrades"
    );
  }
  if (eligibilityAuditReport.population.independentTrades !== trades) {
    throw new Error("B-12j parity: B-12h independentTrades ≠ lifecycle");
  }
  if (eligibilityAuditReport.decisiveParity.decisiveTrades !== c.decisiveResolutions) {
    throw new Error("B-12j parity: B-12h decisive ≠ B-12c decisiveResolutions");
  }
}

function buildAnalysisQuestions(
  geometry: EntryReferenceQualityByGeometry,
  overallDecisive: number,
  invalidSection: EntryReferenceInvalidGeometrySection,
  evaluationCross: EntryReferenceGeometryEvaluationCross
): readonly EntryReferenceAnalysisQuestionAnswer[] {
  const consistent = geometry.CONSISTENT_GEOMETRY;
  const inconsistent =
    geometry.INCONSISTENT_TARGET_DIRECTION.decisive +
    geometry.INVALID_RISK_REFERENCE.decisive +
    geometry.INSUFFICIENT_GEOMETRY.decisive;
  const consistentWr = consistent.winRate_decisive.value;
  const inconsistentWr =
    inconsistent === 0
      ? null
      : (geometry.INCONSISTENT_TARGET_DIRECTION.wins +
          geometry.INVALID_RISK_REFERENCE.wins +
          geometry.INSUFFICIENT_GEOMETRY.wins) /
        inconsistent;

  const passedConsistent =
    evaluationCross.CONSISTENT_GEOMETRY.PASSED.winRate_decisive.value;
  const failedConsistent =
    evaluationCross.CONSISTENT_GEOMETRY.FAILED.winRate_decisive.value;

  return [
    {
      questionId: "Q1_geometry_prevalence",
      question: "Geometry inconsistency ne kadar yaygın?",
      observation: `Toplam ${overallDecisive} decisive içinde inconsistent/invalid/insufficient geometry decisive payı ≈ ${inconsistent}; invalid R unavailable (B-12h): ${invalidSection.summary.unavailableCount}.`,
      descriptiveOnly: true,
    },
    {
      questionId: "Q2_consistent_vs_inconsistent",
      question:
        "Consistent geometry ile inconsistent geometry arasında decisive outcome farkı var mı?",
      observation: `CONSISTENT decisive win rate: ${consistentWr ?? "null"}; combined non-consistent decisive win rate: ${inconsistentWr ?? "null"} (gözlemsel; nedensellik yok).`,
      descriptiveOnly: true,
    },
    {
      questionId: "Q3_risk_distance",
      question:
        "Risk distance büyüdükçe historical decisive win rate nasıl değişiyor?",
      observation:
        "riskDistance.byBucket dilimlerindeki winRate_decisive karşılaştırılmalı (descriptive only).",
      descriptiveOnly: true,
    },
    {
      questionId: "Q4_reward_distance",
      question:
        "Reward distance büyüdükçe historical decisive win rate nasıl değişiyor?",
      observation:
        "rewardDistance.byBucket dilimlerindeki winRate_decisive karşılaştırılmalı (descriptive only).",
      descriptiveOnly: true,
    },
    {
      questionId: "Q5_evaluation_geometry",
      question:
        "PASSED ve FAILED evaluation gruplarında geometry dağılımı farklı mı?",
      observation: `CONSISTENT+PASSED win rate: ${passedConsistent ?? "null"}; CONSISTENT+FAILED: ${failedConsistent ?? "null"}; evaluationCross tablosuna bakın.`,
      descriptiveOnly: true,
    },
    {
      questionId: "Q6_direction",
      question: "BULLISH ve BEARISH geometry davranışı farklı mı?",
      observation: "directionCross içinde geometryDistribution ve byGeometry karşılaştırın.",
      descriptiveOnly: true,
    },
    {
      questionId: "Q7_rr_geometry",
      question:
        "Prospective RR ile geometry consistency arasında ilişki var mı?",
      observation: "rrCross içinde geometryDistribution; prospective RR ≠ theoretical R.",
      descriptiveOnly: true,
    },
    {
      questionId: "Q8_setup_family",
      question: "Geometry problemi belirli setup family'de yoğunlaşıyor mu?",
      observation:
        "invalidGeometry.details setupFamilyDistribution ve trade-level geometry dağılımı ile incelenir.",
      descriptiveOnly: true,
    },
    {
      questionId: "Q9_duration",
      question: "Geometry problemi belirli duration bucket'larında yoğunlaşıyor mu?",
      observation: "durationCross geometryDistribution karşılaştırması.",
      descriptiveOnly: true,
    },
    {
      questionId: "Q10_unavailable_r",
      question: "16 theoretical-R unavailable trade'in ortak özelliği nedir?",
      observation: `${invalidSection.summary.unavailableCount} decisive trade theoretical R yok; primary: ${invalidSection.summary.primaryClassification}; B-12h INCONSISTENT_TARGET_DIRECTION odaklı.`,
      descriptiveOnly: true,
    },
  ];
}

/**
 * B-12j: entry / target / invalidation reference quality (gözlemsel audit).
 * Mevcut lifecycle + B-12c/B-12g/B-12h/B-12i çıktılarını tüketir; path replay yok.
 */
export function buildHistoricalEntryReferenceQualityAnalysis(
  input: BuildHistoricalEntryReferenceQualityAnalysisInput
): HistoricalEntryReferenceQualityAnalysisReport {
  assertInputParity(input);
  const {
    lifecycleReport,
    statisticsReport,
    rMultipleStatisticsReport,
    eligibilityAuditReport,
    theoreticalPerformanceReport,
    assertAuditGeometryParity = true,
  } = input;

  const auditByTradeId = new Map<string, TheoreticalRDecisiveTradeAuditRow>();
  for (const row of eligibilityAuditReport.decisiveRows) {
    auditByTradeId.set(row.tradeId, row);
  }

  const geometryAcc = emptyGeometryAccMap();
  const riskAcc = Object.fromEntries(
    ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS.map((id) => [id, emptyAcc()])
  ) as EntryReferenceQualityByRiskDistance extends infer _T
    ? Record<EntryReferenceRiskDistanceBucketId, Acc>
    : never;
  const rewardAcc = Object.fromEntries(
    ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS.map((id) => [id, emptyAcc()])
  ) as Record<EntryReferenceRewardDistanceBucketId, Acc>;

  const evaluationCross = Object.fromEntries(
    ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [
      g,
      Object.fromEntries(EVALUATION_ROWS.map((e) => [e, emptyCrossCell()])),
    ])
  ) as EntryReferenceGeometryEvaluationCross;

  const directionGeometryDist: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    Record<EntryReferenceGeometryQuality, number>
  > = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
      k,
      Object.fromEntries(ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, 0])),
    ])
  ) as Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    Record<EntryReferenceGeometryQuality, number>
  >;
  const directionByGeometry: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    Record<EntryReferenceGeometryQuality, Acc>
  > = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
      k,
      emptyGeometryAccMap(),
    ])
  ) as Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    Record<EntryReferenceGeometryQuality, Acc>
  >;
  const directionOverallAcc: Record<
    HistoricalPositionOutcomeDirectionSliceKey,
    Acc
  > = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [k, emptyAcc()])
  ) as Record<HistoricalPositionOutcomeDirectionSliceKey, Acc>;

  const rrGeometryDist = Object.fromEntries(
    HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((rr) => [
      rr,
      Object.fromEntries(ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, 0])),
    ])
  ) as Record<
    (typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number],
    Record<EntryReferenceGeometryQuality, number>
  >;
  const rrByGeometry = Object.fromEntries(
    HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((rr) => [rr, emptyGeometryAccMap()])
  ) as Record<
    (typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number],
    Record<EntryReferenceGeometryQuality, Acc>
  >;

  const durationGeometryDist = Object.fromEntries(
    INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((d) => [
      d,
      Object.fromEntries(ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, 0])),
    ])
  ) as Record<
    IndependentTradeDurationBucketId,
    Record<EntryReferenceGeometryQuality, number>
  >;
  const durationByGeometry = Object.fromEntries(
    INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((d) => [d, emptyGeometryAccMap()])
  ) as Record<
    IndependentTradeDurationBucketId,
    Record<EntryReferenceGeometryQuality, Acc>
  >;

  const overallGeometryDist = Object.fromEntries(
    ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, 0])
  ) as Record<EntryReferenceGeometryQuality, number>;

  for (const trade of lifecycleReport.trades) {
    const computed: TheoreticalTradeRMultipleResult =
      computeTheoreticalTradeRMultiple(trade);
    const auditGeo = classifyTheoreticalRGeometryForAudit(trade, computed);
    if (assertAuditGeometryParity && isDecisive(trade.policyClassification)) {
      const row = auditByTradeId.get(trade.tradeId);
      if (row && row.geometryClassification !== auditGeo) {
        throw new Error(
          `B-12j geometry parity failed for trade ${trade.tradeId}`
        );
      }
    }
    const quality = mapAuditGeometryToEntryReferenceQuality(auditGeo);
    overallGeometryDist[quality] += 1;

    const theoreticalR = computed.theoreticalR;
    accumulateTrade(geometryAcc[quality], trade, theoreticalR);

    const entry = trade.entryReferencePrice;
    let riskPct: number | null = null;
    let rewardPct: number | null = null;
    if (
      quality === "CONSISTENT_GEOMETRY" &&
      computed.riskAmount !== null &&
      computed.rewardAmount !== null &&
      entry !== null &&
      Number.isFinite(entry) &&
      entry > 0
    ) {
      riskPct = computed.riskAmount / entry;
      rewardPct = computed.rewardAmount / entry;
    }
    const riskBucket = classifyEntryReferenceRiskDistanceBucket(riskPct);
    const rewardBucket = classifyEntryReferenceRewardDistanceBucket(rewardPct);
    accumulateTrade(riskAcc[riskBucket], trade, theoreticalR);
    accumulateTrade(rewardAcc[rewardBucket], trade, theoreticalR);

    const evalStatus = resolveEvalStatus(trade);
    if (evalStatus) {
      const cell = evaluationCross[quality][evalStatus];
      cell.total += 1;
      if (trade.policyClassification === "FAVORABLE_RESOLUTION") {
        cell.decisive += 1;
        cell.wins += 1;
      } else if (trade.policyClassification === "ADVERSE_RESOLUTION") {
        cell.decisive += 1;
        cell.losses += 1;
      }
      cell.winRate_decisive = computeIndependentTradeWinRateDecisive(
        cell.wins,
        cell.losses
      );
    }

    const dirKey = resolveIndependentTradeDirectionSliceKey(trade);
    directionGeometryDist[dirKey][quality] += 1;
    accumulateTrade(directionByGeometry[dirKey][quality], trade, theoreticalR);
    accumulateTrade(directionOverallAcc[dirKey], trade, theoreticalR);

    const rrBucket = classifyHistoricalMeasurementRrBucketRow(
      trade.canonicalRrRatio
    );
    rrGeometryDist[rrBucket][quality] += 1;
    accumulateTrade(rrByGeometry[rrBucket][quality], trade, theoreticalR);

    const dur = resolveDurationBucket(trade.lifecycleDurationBars);
    if (dur) {
      durationGeometryDist[dur][quality] += 1;
      accumulateTrade(durationByGeometry[dur][quality], trade, theoreticalR);
    }
  }

  const geometry: EntryReferenceQualityByGeometry = Object.fromEntries(
    ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [g, accToSlice(geometryAcc[g])])
  ) as EntryReferenceQualityByGeometry;

  for (const g of ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS) {
    for (const e of EVALUATION_ROWS) {
      const cell = evaluationCross[g][e];
      cell.winRate_decisive = computeIndependentTradeWinRateDecisive(
        cell.wins,
        cell.losses
      );
    }
  }

  const riskDistance = {
    contractVersion: ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_CONTRACT_VERSION,
    descriptiveOnlyNote:
      "Risk distance bucket'ları yalnızca gözlemsel analiz içindir; trading kuralı değildir.",
    thresholds: ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_THRESHOLDS,
    byBucket: Object.fromEntries(
      ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS.map((id) => [
        id,
        accToSlice(riskAcc[id]),
      ])
    ) as EntryReferenceQualityByRiskDistance,
  };

  const rewardDistance = {
    contractVersion: ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_CONTRACT_VERSION,
    descriptiveOnlyNote:
      "Reward distance bucket'ları yalnızca gözlemsel analiz içindir.",
    thresholds: ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_THRESHOLDS,
    byBucket: Object.fromEntries(
      ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS.map((id) => [
        id,
        accToSlice(rewardAcc[id]),
      ])
    ) as EntryReferenceQualityByRewardDistance,
  };

  const directionCross = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [
      k,
      {
        geometryDistribution: directionGeometryDist[k],
        byGeometry: Object.fromEntries(
          ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [
            g,
            accToSlice(directionByGeometry[k][g]),
          ])
        ) as EntryReferenceQualityByGeometry,
        decisiveWinRateOverall: computeIndependentTradeWinRateDecisive(
          directionOverallAcc[k].wins,
          directionOverallAcc[k].losses
        ),
      },
    ])
  ) as EntryReferenceDirectionCross;

  const rrCross = Object.fromEntries(
    HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((rr) => [
      rr,
      {
        geometryDistribution: rrGeometryDist[rr],
        byGeometry: Object.fromEntries(
          ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [
            g,
            accToSlice(rrByGeometry[rr][g]),
          ])
        ) as EntryReferenceQualityByGeometry,
      },
    ])
  ) as EntryReferenceRrCross;

  const durationCross = Object.fromEntries(
    INDEPENDENT_TRADE_DURATION_BUCKET_IDS.map((d) => [
      d,
      {
        geometryDistribution: durationGeometryDist[d],
        byGeometry: Object.fromEntries(
          ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS.map((g) => [
            g,
            accToSlice(durationByGeometry[d][g]),
          ])
        ) as EntryReferenceQualityByGeometry,
      },
    ])
  ) as EntryReferenceDurationCross;

  const unavailableRows = eligibilityAuditReport.decisiveRows.filter(
    (r) => !r.theoreticalREligible
  );
  let invWins = 0;
  let invLosses = 0;
  const setupFam: Record<string, number> = {};
  const dirDist = Object.fromEntries(
    HISTORICAL_POSITION_OUTCOME_DIRECTION_SLICE_KEYS.map((k) => [k, 0])
  ) as Record<HistoricalPositionOutcomeDirectionSliceKey, number>;
  const evalDist = Object.fromEntries(EVALUATION_ROWS.map((e) => [e, 0])) as Record<
    (typeof EVALUATION_ROWS)[number],
    number
  >;
  const rrDist = Object.fromEntries(
    HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS.map((r) => [r, 0])
  ) as Record<(typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number], number>;

  for (const row of unavailableRows) {
    if (row.observedWin) {
      invWins += 1;
    }
    if (row.observedLoss) {
      invLosses += 1;
    }
    const trade = lifecycleReport.trades.find((t) => t.tradeId === row.tradeId);
    if (trade) {
      const fam = trade.setupFamilyId ?? "UNKNOWN";
      setupFam[fam] = (setupFam[fam] ?? 0) + 1;
      const dk = resolveIndependentTradeDirectionSliceKey(trade);
      dirDist[dk] += 1;
      const es = resolveEvalStatus(trade);
      if (es) {
        evalDist[es] += 1;
      }
      rrDist[classifyHistoricalMeasurementRrBucketRow(trade.canonicalRrRatio)] += 1;
    }
  }

  const decisive = statisticsReport.overall.counts.decisiveResolutions;
  const unavailableCount = unavailableRows.length;
  const invalidGeometry: EntryReferenceInvalidGeometrySection = {
    summary: {
      decisiveTrades: decisive,
      unavailableCount,
      percentageOfDecisive: decisive === 0 ? null : unavailableCount / decisive,
      primaryClassification: "INCONSISTENT_TARGET_DIRECTION",
    },
    unavailableDecisiveOutcomes: {
      wins: invWins,
      losses: invLosses,
      winRate_decisive: computeIndependentTradeWinRateDecisive(invWins, invLosses),
    },
    details: [
      {
        decisiveTrades: decisive,
        theoreticalRUnavailable: unavailableCount,
        percentageOfDecisive: decisive === 0 ? null : unavailableCount / decisive,
        geometryClassification: "INCONSISTENT_TARGET_DIRECTION",
        count: unavailableRows.filter(
          (r) => r.geometryClassification === "INCONSISTENT_TARGET_DIRECTION"
        ).length,
        directionDistribution: dirDist,
        evaluationDistribution: evalDist,
        outcomeDistribution: { wins: invWins, losses: invLosses },
        setupFamilyDistribution: setupFam,
        prospectiveRrBucketDistribution: rrDist,
      },
    ],
    note:
      "B-12c outcome ve B-12g R aggregate değişmez; bu bölüm yalnızca diagnostic görünüm.",
  };

  const totalTrades = lifecycleReport.trades.length;
  const overall = {
    totalTrades,
    measuredTrades: statisticsReport.overall.counts.measuredTrades,
    decisive,
    wins: statisticsReport.overall.counts.wins,
    losses: statisticsReport.overall.counts.losses,
    geometryDistribution: overallGeometryDist,
    consistentGeometryShare:
      totalTrades === 0
        ? null
        : overallGeometryDist.CONSISTENT_GEOMETRY / totalTrades,
    inconsistentGeometryShare:
      totalTrades === 0
        ? null
        : (overallGeometryDist.INCONSISTENT_TARGET_DIRECTION +
            overallGeometryDist.INVALID_RISK_REFERENCE +
            overallGeometryDist.INSUFFICIENT_GEOMETRY) /
          totalTrades,
    b12gExpectancyR: rMultipleStatisticsReport.overall.expectancyR,
    b12gSumR: rMultipleStatisticsReport.overall.sumR,
    b12gProfitFactorR: rMultipleStatisticsReport.overall.profitFactorR,
  };

  const analysisQuestions = buildAnalysisQuestions(
    geometry,
    decisive,
    invalidGeometry,
    evaluationCross
  );

  return {
    schemaVersion: HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_ENTRY_REFERENCE_QUALITY",
    consumedReports: {
      statisticsSchemaVersion: statisticsReport.statisticsSchemaVersion,
      rMultipleSchemaVersion: rMultipleStatisticsReport.schemaVersion,
      eligibilityAuditSchemaVersion: eligibilityAuditReport.schemaVersion,
      theoreticalPerformanceSchemaVersion:
        theoreticalPerformanceReport?.schemaVersion ?? null,
    },
    population: {
      snapshotReference: statisticsReport.snapshotReference,
      independentTrades: totalTrades,
      note:
        "Primary population: IndependentTradeLifecycleReport.trades[]; snapshot funnel B-12c referansı.",
    },
    overall,
    geometry,
    riskDistance,
    rewardDistance,
    evaluationCross,
    directionCross,
    rrCross,
    durationCross,
    invalidGeometry,
    prospectiveVsTheoreticalR: {
      prospectiveRrField: "IndependentTradeUnit.canonicalRrRatio (B-9d prospective RR)",
      theoreticalRField: "B-12g computeTheoreticalTradeRMultiple (frozen policy outcome)",
      note:
        "Prospective RR gelecekte beklenen reward/risk referansıdır; theoretical R path sonucuna göre oluşur.",
    },
    analysisQuestions,
    warnings: ANALYSIS_WARNINGS,
  };
}
