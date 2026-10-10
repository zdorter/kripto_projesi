import { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "./historical-independent-trade-r-multiple-contract";
import type { IndependentTradeRMultipleRejectionReason } from "./historical-independent-trade-r-multiple-contract";
import { INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS } from "./historical-independent-trade-r-multiple-contract";
import {
  computeTheoreticalTradeRMultiple,
  type TheoreticalTradeRMultipleResult,
} from "./historical-independent-trade-r-multiple-statistics";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION,
  THEORETICAL_R_CANONICAL_SOURCE_NOTES,
  THEORETICAL_R_RR_COMPARE_TOLERANCE_ABSOLUTE,
  THEORETICAL_R_RR_COMPARE_TOLERANCE_RELATIVE,
  type AuditIndependentTradeTheoreticalREligibilityInput,
  type HistoricalIndependentTradeREligibilityAuditReport,
  type TheoreticalRDecisiveParitySummary,
  type TheoreticalRDecisiveTradeAuditRow,
  type TheoreticalRGeometryClassification,
  type TheoreticalRGeometryDistribution,
  type TheoreticalRRejectionDistribution,
  type TheoreticalRRootCauseCategory,
  type TheoreticalRRootCauseDistribution,
  type TheoreticalRRrConsistencySummary,
} from "./historical-independent-trade-r-eligibility-audit-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";

function isDecisive(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION" || c === "ADVERSE_RESOLUTION";
}

function emptyGeometryDistribution(): TheoreticalRGeometryDistribution {
  return {
    VALID_BULLISH_GEOMETRY: 0,
    VALID_BEARISH_GEOMETRY: 0,
    INVALID_RISK_REFERENCE: 0,
    INCONSISTENT_TARGET_DIRECTION: 0,
    INVALID_DIRECTION: 0,
    INVALID_PRICE_REFERENCE: 0,
  };
}

function emptyRejectionDistribution(): TheoreticalRRejectionDistribution {
  return Object.fromEntries(
    INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS.map((r) => [r, 0])
  ) as TheoreticalRRejectionDistribution;
}

function emptyRootCauseDistribution(): TheoreticalRRootCauseDistribution {
  return {
    REFERENCE_DATA_INCONSISTENT: 0,
    DIRECTION_LEVEL_MISMATCH: 0,
    CANONICAL_RR_PRICE_MISMATCH: 0,
    EXPECTED_HISTORICAL_CONTRACT_BEHAVIOR: 0,
    OTHER: 0,
    UNKNOWN: 0,
  };
}

/**
 * B-12g rejection sırası ile uyumlu geometry sınıfı (audit-only).
 */
export function classifyTheoreticalRGeometryForAudit(
  trade: IndependentTradeUnit,
  computed: TheoreticalTradeRMultipleResult
): TheoreticalRGeometryClassification {
  const reasons = computed.rejectionReasons;
  if (
    reasons.includes("INVALID_ENTRY_REFERENCE") ||
    reasons.includes("INVALID_TARGET_REFERENCE") ||
    reasons.includes("INVALID_INVALIDATION_REFERENCE")
  ) {
    return "INVALID_PRICE_REFERENCE";
  }
  if (reasons.includes("INVALID_DIRECTION")) {
    return "INVALID_DIRECTION";
  }
  if (reasons.includes("INCONSISTENT_TARGET_DIRECTION")) {
    return "INCONSISTENT_TARGET_DIRECTION";
  }
  if (reasons.includes("INVALID_RISK_REFERENCE")) {
    return "INVALID_RISK_REFERENCE";
  }
  if (trade.direction === "BULLISH") {
    return "VALID_BULLISH_GEOMETRY";
  }
  if (trade.direction === "BEARISH") {
    return "VALID_BEARISH_GEOMETRY";
  }
  return "INVALID_DIRECTION";
}

function rrWithinTolerance(
  canonical: number,
  derived: number
): boolean {
  const absDiff = Math.abs(canonical - derived);
  if (absDiff <= THEORETICAL_R_RR_COMPARE_TOLERANCE_ABSOLUTE) {
    return true;
  }
  const scale = Math.max(Math.abs(canonical), Math.abs(derived), 1);
  return absDiff / scale <= THEORETICAL_R_RR_COMPARE_TOLERANCE_RELATIVE;
}

function derivedProspectiveRrFromPrices(
  computed: TheoreticalTradeRMultipleResult
): number | null {
  const { riskAmount, rewardAmount } = computed;
  if (
    riskAmount === null ||
    rewardAmount === null ||
    riskAmount <= 0 ||
    !Number.isFinite(riskAmount) ||
    !Number.isFinite(rewardAmount) ||
    rewardAmount <= 0
  ) {
    return null;
  }
  return rewardAmount / riskAmount;
}

function inferRootCause(
  trade: IndependentTradeUnit,
  geometry: TheoreticalRGeometryClassification,
  computed: TheoreticalTradeRMultipleResult,
  canonicalRrWithinTolerance: boolean | null
): { category: TheoreticalRRootCauseCategory; note: string } {
  if (geometry === "VALID_BULLISH_GEOMETRY" || geometry === "VALID_BEARISH_GEOMETRY") {
    if (canonicalRrWithinTolerance === false) {
      return {
        category: "CANONICAL_RR_PRICE_MISMATCH",
        note:
          "B-9d canonical RR ile entry/target/invalidation türetilmiş reward/risk arasında tolerans dışı fark (gözlemsel).",
      };
    }
    return {
      category: "OTHER",
      note: "Geometri B-12g contract'ına uygun; teorik R üretilebilir (audit-only etiket).",
    };
  }

  if (geometry === "INVALID_PRICE_REFERENCE") {
    return {
      category: "REFERENCE_DATA_INCONSISTENT",
      note: "Entry/target/invalidation referanslarından biri geçersiz veya eksik (donmuş snapshot).",
    };
  }

  if (geometry === "INVALID_DIRECTION") {
    return {
      category: "DIRECTION_LEVEL_MISMATCH",
      note: "Direction BULLISH/BEARISH değil; seviye geometrisi değerlendirilemedi.",
    };
  }

  if (geometry === "INCONSISTENT_TARGET_DIRECTION") {
    const path = trade.pathOutcome;
    const decisiveWin = trade.policyClassification === "FAVORABLE_RESOLUTION";
    const decisiveLoss = trade.policyClassification === "ADVERSE_RESOLUTION";
    if (
      (path === "TARGET_TOUCHED" && decisiveWin) ||
      (path === "INVALIDATION_TOUCHED" && decisiveLoss)
    ) {
      return {
        category: "EXPECTED_HISTORICAL_CONTRACT_BEHAVIOR",
        note:
          "B-10d path/policy sonucu decisive; B-12g price-direction geometrisi uyumsuz — audit sonucu değiştirilmedi (outcome independence).",
      };
    }
    return {
      category: "DIRECTION_LEVEL_MISMATCH",
      note:
        "Direction ile entry/target/invalidation sıralaması B-12g geometri contract'ına uymuyor.",
    };
  }

  if (geometry === "INVALID_RISK_REFERENCE") {
    return {
      category: "REFERENCE_DATA_INCONSISTENT",
      note: "Risk <= 0; entry/invalidation donmuş referansları risk tanımına uymuyor.",
    };
  }

  if (canonicalRrWithinTolerance === false) {
    return {
      category: "CANONICAL_RR_PRICE_MISMATCH",
      note: "RR referansı ile türetilmiş reward/risk uyumsuz (kanıt: tolerans dışı delta).",
    };
  }

  return {
    category: "UNKNOWN",
    note: "Kök neden otomatik sınıflandırılamadı; yalnızca gözlemsel audit.",
  };
}

function buildDecisiveRow(trade: IndependentTradeUnit): TheoreticalRDecisiveTradeAuditRow {
  const computed = computeTheoreticalTradeRMultiple(trade);
  const geometry = classifyTheoreticalRGeometryForAudit(trade, computed);
  const derived = derivedProspectiveRrFromPrices(computed);
  const canonical = trade.canonicalRrRatio;
  let canonicalRrDelta: number | null = null;
  let canonicalRrWithinTolerance: boolean | null = null;
  if (canonical !== null && Number.isFinite(canonical) && derived !== null) {
    canonicalRrDelta = canonical - derived;
    canonicalRrWithinTolerance = rrWithinTolerance(canonical, derived);
  } else if (canonical === null || !Number.isFinite(canonical)) {
    canonicalRrWithinTolerance = null;
  } else if (derived === null) {
    canonicalRrWithinTolerance = null;
  }

  const { category, note } = inferRootCause(
    trade,
    geometry,
    computed,
    canonicalRrWithinTolerance
  );

  const theoreticalREligible =
    computed.theoreticalR !== null &&
    (trade.policyClassification === "FAVORABLE_RESOLUTION" ||
      trade.policyClassification === "ADVERSE_RESOLUTION");

  return {
    tradeId: trade.tradeId,
    snapshotId: trade.snapshotId,
    evaluationBarIndex: trade.evaluationBarIndex,
    prospectiveSetupId: trade.prospectiveSetupId,
    direction: trade.direction,
    entryReferencePrice: trade.entryReferencePrice,
    targetReferencePrice: trade.targetReferencePrice,
    invalidationReferencePrice: trade.invalidationReferencePrice,
    canonicalRrRatio: trade.canonicalRrRatio,
    pathOutcome: trade.pathOutcome,
    policyClassification: trade.policyClassification,
    lifecycleDurationBars: trade.lifecycleDurationBars,
    geometryClassification: geometry,
    b12gRejectionReasons: [...computed.rejectionReasons],
    theoreticalREligible,
    theoreticalR: computed.theoreticalR,
    derivedProspectiveRrFromPrices: derived,
    canonicalRrDelta,
    canonicalRrWithinTolerance,
    rootCauseCategory: category,
    rootCauseNote: note,
    observedWin: trade.policyClassification === "FAVORABLE_RESOLUTION",
    observedLoss: trade.policyClassification === "ADVERSE_RESOLUTION",
  };
}

function assertStatisticsParity(
  statisticsReport: IndependentTradeStatisticsReport,
  decisive: number,
  wins: number,
  losses: number
): void {
  const c = statisticsReport.overall.counts;
  if (
    c.decisiveResolutions !== decisive ||
    c.wins !== wins ||
    c.losses !== losses ||
    c.totalTrades !== statisticsReport.overall.counts.totalTrades
  ) {
    throw new Error(
      "B-12h decisive/outcome counts diverge from B-12c statisticsReport (parity guard)"
    );
  }
}

/**
 * B-12h: decisive trade'lerde teorik R eligibility kök neden audit (read-only).
 */
export function auditIndependentTradeTheoreticalREligibility(
  input: AuditIndependentTradeTheoreticalREligibilityInput
): HistoricalIndependentTradeREligibilityAuditReport {
  const { lifecycleReport, rMultipleStatisticsReport, statisticsReport } = input;
  const trades = lifecycleReport.trades;

  const decisiveRows: TheoreticalRDecisiveTradeAuditRow[] = [];
  for (const trade of trades) {
    if (!isDecisive(trade.policyClassification)) {
      continue;
    }
    decisiveRows.push(buildDecisiveRow(trade));
  }

  decisiveRows.sort((a, b) => a.tradeId.localeCompare(b.tradeId));

  const decisiveTrades = decisiveRows.length;
  const validTheoreticalRTrades = decisiveRows.filter(
    (r) => r.theoreticalREligible
  ).length;
  const decisiveWithoutTheoreticalR = decisiveTrades - validTheoreticalRTrades;

  const decisiveParity: TheoreticalRDecisiveParitySummary = {
    decisiveTrades,
    validTheoreticalRTrades,
    decisiveWithoutTheoreticalR,
    parityInvariantHolds:
      decisiveTrades === validTheoreticalRTrades + decisiveWithoutTheoreticalR,
  };

  const geometryDistribution = emptyGeometryDistribution();
  const rejectionDistribution = emptyRejectionDistribution();
  const rootCauseDistribution = emptyRootCauseDistribution();

  let withinToleranceCount = 0;
  let outsideToleranceCount = 0;
  let missingCanonicalRrCount = 0;
  let missingDerivedRrCount = 0;
  let decisiveWithComparableRr = 0;

  for (const row of decisiveRows) {
    geometryDistribution[row.geometryClassification] += 1;
    if (!row.theoreticalREligible) {
      rootCauseDistribution[row.rootCauseCategory] += 1;
    }

    if (!row.theoreticalREligible) {
      for (const reason of row.b12gRejectionReasons) {
        rejectionDistribution[reason] += 1;
      }
    }

    if (row.derivedProspectiveRrFromPrices === null) {
      missingDerivedRrCount += 1;
    }
    if (row.canonicalRrRatio === null || !Number.isFinite(row.canonicalRrRatio)) {
      missingCanonicalRrCount += 1;
    }
    if (
      row.canonicalRrWithinTolerance !== null &&
      row.derivedProspectiveRrFromPrices !== null
    ) {
      decisiveWithComparableRr += 1;
      if (row.canonicalRrWithinTolerance) {
        withinToleranceCount += 1;
      } else {
        outsideToleranceCount += 1;
      }
    }
  }

  const rrConsistency: TheoreticalRRrConsistencySummary = {
    decisiveWithComparableRr,
    withinToleranceCount,
    outsideToleranceCount,
    missingCanonicalRrCount,
    missingDerivedRrCount,
    note:
      "canonicalRrRatio (B-9d prospective) vs reward/risk from frozen prices (derivedProspectiveRrFromPrices); not B-12g realized outcome R.",
  };

  if (statisticsReport) {
    const wins = decisiveRows.filter((r) => r.observedWin).length;
    const losses = decisiveRows.filter((r) => r.observedLoss).length;
    assertStatisticsParity(statisticsReport, decisiveTrades, wins, losses);
  }

  if (rMultipleStatisticsReport) {
    const o = rMultipleStatisticsReport.overall;
    if (
      o.decisiveTrades !== decisiveTrades ||
      o.tradesWithTheoreticalR !== validTheoreticalRTrades ||
      o.decisiveWithoutTheoreticalR !== decisiveWithoutTheoreticalR
    ) {
      throw new Error(
        "B-12h parity diverges from B-12g rMultipleStatisticsReport"
      );
    }
  }

  const validSamples = decisiveRows.filter((r) => r.theoreticalREligible);
  const invalidSamples = decisiveRows.filter((r) => !r.theoreticalREligible);

  return {
    schemaVersion: HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION,
    rMultipleContractVersion: HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION,
    auditScopeNote:
      "Audit-only investigation of decisive trades without theoretical R; does not repair references or change outcomes.",
    canonicalSourceNotes: THEORETICAL_R_CANONICAL_SOURCE_NOTES,
    population: {
      independentTrades: trades.length,
      decisiveTrades,
    },
    decisiveParity,
    geometryDistribution,
    rejectionDistributionAmongDecisiveWithoutR: rejectionDistribution,
    rootCauseDistribution,
    rrConsistency,
    decisiveRows,
    samples: {
      firstValidDecisiveTrades: validSamples.slice(0, 10),
      firstInvalidDecisiveTrades: invalidSamples.slice(0, 10),
    },
    warnings: {
      auditOnly:
        "B-12h yalnızca gözlem ve sınıflandırma; path/policy/lifecycle/R kuralları değiştirilmez.",
      noSilentRepair:
        "Entry/target/invalidation/direction/RR veya decisive sonuçlar audit tarafından düzeltilmez.",
      noOutcomeMutation:
        "pathOutcome ve policyClassification audit çıktısında salt okunur kopyalanır.",
      prospectiveVsDerivedRr:
        "B-9d canonical RR ile price-türetilmiş RR aynı varsayılmaz; yalnızca matematiksel fark raporlanır.",
    },
  };
}
