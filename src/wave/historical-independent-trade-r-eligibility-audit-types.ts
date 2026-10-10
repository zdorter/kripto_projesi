import type { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION } from "./historical-independent-trade-r-multiple-contract";
import type { IndependentTradeRMultipleRejectionReason } from "./historical-independent-trade-r-multiple-contract";
import type { HistoricalIndependentTradeRMultipleStatisticsReport } from "./historical-independent-trade-r-multiple-statistics-types";
import type { IndependentTradeStatisticsReport } from "./historical-independent-trade-statistics-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";

export const HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION =
  "1.0" as const;

/** B-12g geometry / eligibility sınıflandırması (audit-only; hesap kuralları değişmez). */
export type TheoreticalRGeometryClassification =
  | "VALID_BULLISH_GEOMETRY"
  | "VALID_BEARISH_GEOMETRY"
  | "INVALID_RISK_REFERENCE"
  | "INCONSISTENT_TARGET_DIRECTION"
  | "INVALID_DIRECTION"
  | "INVALID_PRICE_REFERENCE";

export type TheoreticalRRootCauseCategory =
  | "REFERENCE_DATA_INCONSISTENT"
  | "DIRECTION_LEVEL_MISMATCH"
  | "CANONICAL_RR_PRICE_MISMATCH"
  | "EXPECTED_HISTORICAL_CONTRACT_BEHAVIOR"
  | "OTHER"
  | "UNKNOWN";

export const THEORETICAL_R_RR_COMPARE_TOLERANCE_ABSOLUTE = 1e-6 as const;
export const THEORETICAL_R_RR_COMPARE_TOLERANCE_RELATIVE = 1e-4 as const;

export interface TheoreticalRCanonicalSourceNote {
  field: string;
  /** Mevcut stack'teki donmuş kaynak (yeniden üretilmez). */
  sourceDescription: string;
}

export const THEORETICAL_R_CANONICAL_SOURCE_NOTES: readonly TheoreticalRCanonicalSourceNote[] =
  [
    {
      field: "entryReferencePrice",
      sourceDescription:
        "B-12b IndependentTradeUnit ← B-8 evaluation.references.entry.referencePrice",
    },
    {
      field: "targetReferencePrice",
      sourceDescription:
        "B-12b IndependentTradeUnit ← B-8 evaluation.references.target.referencePrice",
    },
    {
      field: "invalidationReferencePrice",
      sourceDescription:
        "B-12b IndependentTradeUnit ← B-10a pathResult.invalidationReferencePrice (lifecycle freeze)",
    },
    {
      field: "direction",
      sourceDescription: "B-12b IndependentTradeUnit ← B-10a path replay direction",
    },
    {
      field: "canonicalRrRatio",
      sourceDescription:
        "B-12b IndependentTradeUnit ← B-9d evaluation.references.rr.ratio (prospective RR)",
    },
    {
      field: "pathOutcome",
      sourceDescription: "B-12b IndependentTradeUnit ← B-10a path outcome (frozen)",
    },
    {
      field: "policyClassification",
      sourceDescription:
        "B-12b IndependentTradeUnit ← B-10d DECISIVE_V1 policy mapping (frozen)",
    },
    {
      field: "tradeId",
      sourceDescription: "B-12b lifecycle trade identity",
    },
    {
      field: "snapshotId",
      sourceDescription: "B-12b snapshot identity at entry bar E",
    },
  ];

export interface TheoreticalRDecisiveTradeAuditRow {
  tradeId: string;
  snapshotId: string;
  evaluationBarIndex: number;
  prospectiveSetupId: string;
  direction: "BULLISH" | "BEARISH" | null;
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  invalidationReferencePrice: number | null;
  canonicalRrRatio: number | null;
  pathOutcome: ProspectiveSetupOutcomeReplayStatus;
  policyClassification: HistoricalPositionPolicyClassification;
  lifecycleDurationBars: number | null;
  geometryClassification: TheoreticalRGeometryClassification;
  b12gRejectionReasons: readonly IndependentTradeRMultipleRejectionReason[];
  theoreticalREligible: boolean;
  theoreticalR: number | null;
  derivedProspectiveRrFromPrices: number | null;
  canonicalRrDelta: number | null;
  canonicalRrWithinTolerance: boolean | null;
  rootCauseCategory: TheoreticalRRootCauseCategory;
  rootCauseNote: string;
  /** Outcome independence: audit outcome alanlarını değiştirmez. */
  observedWin: boolean;
  observedLoss: boolean;
}

export interface TheoreticalRDecisiveParitySummary {
  decisiveTrades: number;
  validTheoreticalRTrades: number;
  decisiveWithoutTheoreticalR: number;
  parityInvariantHolds: boolean;
}

export type TheoreticalRGeometryDistribution = {
  [K in TheoreticalRGeometryClassification]: number;
};

export type TheoreticalRRejectionDistribution = {
  [K in IndependentTradeRMultipleRejectionReason]: number;
};

export type TheoreticalRRootCauseDistribution = {
  [K in TheoreticalRRootCauseCategory]: number;
};

export interface TheoreticalRRrConsistencySummary {
  decisiveWithComparableRr: number;
  withinToleranceCount: number;
  outsideToleranceCount: number;
  missingCanonicalRrCount: number;
  missingDerivedRrCount: number;
  /** Gözlemsel; canonical RR ≠ B-12g realized R. */
  note: string;
}

export interface TheoreticalRSampleTables {
  firstValidDecisiveTrades: readonly TheoreticalRDecisiveTradeAuditRow[];
  firstInvalidDecisiveTrades: readonly TheoreticalRDecisiveTradeAuditRow[];
}

export interface HistoricalIndependentTradeREligibilityAuditReport {
  schemaVersion: typeof HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION;
  rMultipleContractVersion: typeof HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION;
  auditScopeNote: string;
  canonicalSourceNotes: readonly TheoreticalRCanonicalSourceNote[];
  population: {
    independentTrades: number;
    decisiveTrades: number;
  };
  decisiveParity: TheoreticalRDecisiveParitySummary;
  geometryDistribution: TheoreticalRGeometryDistribution;
  rejectionDistributionAmongDecisiveWithoutR: TheoreticalRRejectionDistribution;
  rootCauseDistribution: TheoreticalRRootCauseDistribution;
  rrConsistency: TheoreticalRRrConsistencySummary;
  decisiveRows: readonly TheoreticalRDecisiveTradeAuditRow[];
  samples: TheoreticalRSampleTables;
  warnings: {
    auditOnly: string;
    noSilentRepair: string;
    noOutcomeMutation: string;
    prospectiveVsDerivedRr: string;
  };
}

export interface AuditIndependentTradeTheoreticalREligibilityInput {
  lifecycleReport: IndependentTradeLifecycleReport;
  /** İsteğe bağlı B-12g parity doğrulaması. */
  rMultipleStatisticsReport?: HistoricalIndependentTradeRMultipleStatisticsReport;
  /** İsteğe bağlı B-12c outcome parity (değiştirilmez). */
  statisticsReport?: IndependentTradeStatisticsReport;
}
