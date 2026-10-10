import type {
  Candle,
  MarketStructure,
  SwingConfig,
  SwingPoint,
  SwingType,
  TrendDirection,
} from "../types";

/**
 * Research-only scope rule (not production SMC doctrine).
 * EXTERNAL = alternating zigzag spine after same-type extremum merge (wave-detector semantics).
 * INTERNAL = other confirmed swings strictly between consecutive spine pivots.
 */
export const MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID =
  "ZIGZAG_SPINE_EXTERNAL_LEG_CONTAINMENT_V1" as const;

export type MarketStructureScope = "EXTERNAL" | "INTERNAL" | "UNRESOLVED";

export type MarketStructureSwingLabel = MarketStructure | "UNKNOWN";

/** MSL-1 base; MSL-2 zigzag; MSL-3 protected; MSL-4 break; MSL-5 liquidity (additive). */
export const MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION = "1.4" as const;

/** Research-only protected level candidates (not production SMC / not stop-loss). */
export const MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_V1" as const;

export type ProtectedLevelSelectionReasonCode =
  | "C3_STRUCTURE_LABEL"
  | "C5_EXTERNAL_SPINE"
  | "C6_STRUCTURE_PAIR_FROM";

export type ProtectedLevelCandidateStatusAtE =
  | "CANDIDATE"
  | "ACTIVE"
  | "UNRESOLVED";

export interface ProtectedLevelCandidate {
  pivotIndex: number;
  type: SwingType;
  price: number;
  sourceSwingConfirmationBarIndex: number;
  protectedStatusKnownAtBarIndex: number;
  selectionReasonCodes: readonly ProtectedLevelSelectionReasonCode[];
  scope?: MarketStructureScope;
  structureLabelAtSelection?: MarketStructureSwingLabel;
  statusAtE: ProtectedLevelCandidateStatusAtE;
}

export interface UnresolvedProtectedReason {
  code: string;
  message: string;
}

export interface MarketStructureProtectedContext {
  ruleId: typeof MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID;
  evaluationBarIndex: number;
  /** Read-only trend from detectTrend(confirmedSwings); not a protected selection rule. */
  trendContext: TrendDirection;
  protectedHighs: readonly ProtectedLevelCandidate[];
  protectedLows: readonly ProtectedLevelCandidate[];
  unresolved: readonly UnresolvedProtectedReason[];
  limitations: readonly string[];
}

export type EqualStructureDiagnostic = "NONE" | "EQUAL_HIGH" | "EQUAL_LOW";

export interface MarketStructureSwingAnnotation {
  pivotIndex: number;
  time: number;
  price: number;
  type: SwingType;
  strength: number;
  confirmationBarIndex: number;
  knownAtBarIndex: number;
  structureLabel: MarketStructureSwingLabel;
  scope: MarketStructureScope;
  equalStructureDiagnostic: EqualStructureDiagnostic;
  source: typeof MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID;
}

export interface MarketStructureZigzagContext {
  ruleId: typeof MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID;
  zigzagSpine: readonly MarketStructureSwingAnnotation[];
  externalStructure: readonly MarketStructureSwingAnnotation[];
  internalStructure: readonly MarketStructureSwingAnnotation[];
}

export interface MarketStructurePairSnapshot {
  kind: "HIGH" | "LOW";
  fromIndex: number;
  toIndex: number;
  fromPrice: number;
  toPrice: number;
  structure: MarketStructure;
  /** Bar index at which this pair classification is causally known (second swing confirmed). */
  knownAtBarIndex: number;
}

export interface MarketStructureSnapshot {
  schemaVersion: typeof MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  swingConfig: SwingConfig;
  confirmationLagBars: number;
  confirmedSwings: readonly SwingPoint[];
  highStructure: readonly MarketStructure[];
  lowStructure: readonly MarketStructure[];
  structurePairs: readonly MarketStructurePairSnapshot[];
  zigzag: MarketStructureZigzagContext;
  protected: MarketStructureProtectedContext;
  break: import("./market-structure-break-types").MarketStructureBreakContext;
  liquidity: import("./market-structure-liquidity-types").MarketStructureLiquidityContext;
  limitations: readonly string[];
}

export interface BuildMarketStructureSnapshotAtBarInput {
  candles: readonly Candle[];
  evaluationBarIndex: number;
  swingConfig?: Partial<SwingConfig>;
}

export class MarketStructureInvalidEvaluationBarIndexError extends Error {
  readonly code = "INVALID_EVALUATION_BAR_INDEX" as const;

  constructor(
    evaluationBarIndex: number,
    candleCount: number
  ) {
    super(
      `evaluationBarIndex ${evaluationBarIndex} out of bounds [0, ${Math.max(0, candleCount - 1)}] for candle count ${candleCount}.`
    );
    this.name = "MarketStructureInvalidEvaluationBarIndexError";
  }
}
