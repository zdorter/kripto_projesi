/**
 * B-12g teorik R-Multiple (risk katı getirisi) contract.
 *
 * Canonical kaynaklar (B-12b IndependentTradeUnit — yeniden üretilmez):
 * - entryReferencePrice ← B-8 evaluation.references.entry.referencePrice
 * - targetReferencePrice ← B-8 evaluation.references.target.referencePrice
 * - invalidationReferencePrice ← B-10a pathResult.invalidationReferencePrice (lifecycle freeze)
 * - direction ← path replay direction
 * - canonicalRrRatio ← B-9d evaluation.references.rr.ratio (PROSPECTIVE RR)
 * - pathOutcome / policyClassification ← B-10a + B-10d DECISIVE_V1 (trade üzerinde donmuş)
 * - tradeId / snapshotId ← B-12b kimlik
 *
 * PROSPECTIVE RR (B-9d) ≠ REALIZED/THEORETICAL R (B-12g):
 * - Örn. prospective RR = 2.0, WIN → teorik +2R; LOSS → -1R; NO_TOUCH → R yok.
 * - Bu katman PnL, fee, slippage veya execution simülasyonu içermez.
 */

export const HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION =
  "1.0" as const;

export type IndependentTradeRMultipleRejectionReason =
  | "INVALID_ENTRY_REFERENCE"
  | "INVALID_TARGET_REFERENCE"
  | "INVALID_INVALIDATION_REFERENCE"
  | "INVALID_DIRECTION"
  | "INVALID_RISK_REFERENCE"
  | "INCONSISTENT_TARGET_DIRECTION";

export const INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS: readonly IndependentTradeRMultipleRejectionReason[] =
  [
    "INVALID_ENTRY_REFERENCE",
    "INVALID_TARGET_REFERENCE",
    "INVALID_INVALIDATION_REFERENCE",
    "INVALID_DIRECTION",
    "INVALID_RISK_REFERENCE",
    "INCONSISTENT_TARGET_DIRECTION",
  ];
