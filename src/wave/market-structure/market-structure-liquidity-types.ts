import type { MarketStructureScope } from "./market-structure-types";
import type { SwingType } from "../types";

export const MARKET_STRUCTURE_LIQUIDITY_CONTEXT_SCHEMA_VERSION = "1.0" as const;

export const MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_RESEARCH_V1" as const;

export const MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID =
  "MARKET_STRUCTURE_BSL_CANDIDATE_V1" as const;

export const MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID =
  "MARKET_STRUCTURE_SSL_CANDIDATE_V1" as const;

export const MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID =
  "MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_V1" as const;

export const MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_RULE_ID =
  "MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_V1" as const;

export const MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_RULE_ID =
  "MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_V1" as const;

export const MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID =
  "MARKET_STRUCTURE_EQH_CLUSTER_V1" as const;

export const MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID =
  "MARKET_STRUCTURE_EQL_CLUSTER_V1" as const;

export const MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID =
  "MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_V1" as const;

export const MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_V1" as const;

export const MARKET_STRUCTURE_EQUALITY_MIN_ABS_EPS = 1e-9;
export const MARKET_STRUCTURE_EQUALITY_RELATIVE_EPS = 5e-4;

export type LiquiditySide = "BSL" | "SSL";

export type LiquidityPoolKind =
  | "SINGLE_HIGH"
  | "SINGLE_LOW"
  | "EQH_CLUSTER"
  | "EQL_CLUSTER";

export type LiquidityCandidateStatusAtE = "CANDIDATE";

export type BslSelectionReasonCode = "SWING_CONFIRMED_HIGH";
export type SslSelectionReasonCode = "SWING_CONFIRMED_LOW";

export interface LiquidityPriceBand {
  lowerBound: number;
  upperBound: number;
}

export interface BslCandidate {
  ruleId: typeof MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID;
  candidateId: string;
  side: "BSL";
  sourceSwingType: "HIGH";
  price: number;
  sourcePivotIndex: number;
  sourceConfirmationBarIndex: number;
  knownAtBarIndex: number;
  scope: MarketStructureScope;
  statusAtE: LiquidityCandidateStatusAtE;
  selectionReasonCodes: readonly [BslSelectionReasonCode];
  sharedSourcePivotIndex: number;
}

export interface SslCandidate {
  ruleId: typeof MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID;
  candidateId: string;
  side: "SSL";
  sourceSwingType: "LOW";
  price: number;
  sourcePivotIndex: number;
  sourceConfirmationBarIndex: number;
  knownAtBarIndex: number;
  scope: MarketStructureScope;
  statusAtE: LiquidityCandidateStatusAtE;
  selectionReasonCodes: readonly [SslSelectionReasonCode];
  sharedSourcePivotIndex: number;
}

export interface EqualHighObservation {
  ruleId: typeof MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_RULE_ID;
  observationId: string;
  memberPivotIndices: readonly [number, number];
  knownAtBarIndex: number;
  equalityToleranceRuleId: typeof MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID;
}

export interface EqualLowObservation {
  ruleId: typeof MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_RULE_ID;
  observationId: string;
  memberPivotIndices: readonly [number, number];
  knownAtBarIndex: number;
  equalityToleranceRuleId: typeof MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID;
}

export interface LiquidityPoolCandidate {
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID;
  poolId: string;
  poolKind: LiquidityPoolKind;
  price: number;
  priceBand: LiquidityPriceBand;
  sourcePivotIndices: readonly number[];
  sourceConfirmationBarIndices: readonly number[];
  knownAtBarIndex: number;
  scope: MarketStructureScope;
  memberCount: number;
  representativePriceRuleId: typeof MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID;
  statusAtE: LiquidityCandidateStatusAtE;
  clusterRuleId?:
    | typeof MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID
    | typeof MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID;
}

export interface LiquidityUnresolvedReason {
  code: string;
  message: string;
}

export interface MarketStructureLiquidityContext {
  schemaVersion: typeof MARKET_STRUCTURE_LIQUIDITY_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  ruleIds: {
    bsl: typeof MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID;
    ssl: typeof MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID;
    equality: typeof MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID;
    eqhCluster: typeof MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID;
    eqlCluster: typeof MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID;
    pool: typeof MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID;
  };
  bslCandidates: readonly BslCandidate[];
  sslCandidates: readonly SslCandidate[];
  equalHighObservations: readonly EqualHighObservation[];
  equalLowObservations: readonly EqualLowObservation[];
  liquidityPools: readonly LiquidityPoolCandidate[];
  unresolved: readonly LiquidityUnresolvedReason[];
  limitations: readonly string[];
}
