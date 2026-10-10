import type { TrendDirection } from "../types";

export const MSL_HISTORICAL_EVIDENCE_SCHEMA_VERSION = "1.0" as const;

export const MSL_HISTORICAL_EVIDENCE_DATASET_ID_BTCUSDT_1H_V1 =
  "BTCUSDT_1H_RESEARCH_FROZEN_V1" as const;

export type MslHistoricalEvidenceMeasurementMode =
  | "STRICT_AT_E"
  | "DISCLOSURE_HORIZON"
  | "OBSERVATION_ONLY";

export type MslHistoricalEvidenceObservationMode =
  | "STRICT_AT_E"
  | "DISCLOSURE_HORIZON"
  | "OBSERVATION_ONLY";

export type MslHistoricalEvidenceSampleStatus =
  | "SUFFICIENT_HORIZON"
  | "INSUFFICIENT_HORIZON"
  | "NO_EVENT";

export type MslHistoricalEvidenceEventFamily =
  | "BOS"
  | "CHoCH"
  | "MSS"
  | "LIQUIDITY_WICK_TOUCH"
  | "LIQUIDITY_SWEEP"
  | "LIQUIDITY_TAKEN"
  | "LIQUIDITY_RECLAIM"
  | "CROSS_TF_LIQUIDITY_WICK_TOUCH"
  | "LIQUIDITY_TO_BOS"
  | "LIQUIDITY_TO_CHOCH"
  | "NONE";

export interface MslHistoricalEvidenceForwardObservations {
  /** Bars actually used: E+1 .. effectiveEnd (inclusive). */
  effectiveHorizonBars: number;
  /** Terminal bar offset h = effectiveEnd - E when sufficient; else last available offset. */
  terminalBarOffset: number | null;
  forwardReturn: number | null;
  maxFavorableExcursion: number | null;
  maxAdverseExcursion: number | null;
  rangeExpansion: number | null;
  timeToHighBarOffset: number | null;
  timeToLowBarOffset: number | null;
}

export interface MslHistoricalEvidenceStrictEventRef {
  eventFamily: Exclude<MslHistoricalEvidenceEventFamily, "NONE">;
  eventId: string;
  eventDirection: string;
  knownAtBarIndex: number;
  knownAtTimestamp: number;
  triggerBarIndex: number;
}

export interface MslHistoricalEvidenceStructureObservations {
  trendContext: TrendDirection;
  structurePairCount: number;
  zigzagSpineCount: number;
  internalStructureCount: number;
  externalStructureCount: number;
  bosCountAtE: number;
  chochCountAtE: number;
  strictEvents: readonly MslHistoricalEvidenceStrictEventRef[];
  protectedHighCount: number;
  protectedLowCount: number;
}

export interface MslHistoricalEvidenceLiquidityObservations {
  bslCount: number;
  sslCount: number;
  equalHighCount: number;
  equalLowCount: number;
  poolCount: number;
}

export interface MslHistoricalEvidenceMssObservations {
  strictEvents: readonly MslHistoricalEvidenceStrictEventRef[];
}

export interface MslHistoricalEvidenceUnresolved {
  code: string;
  message: string;
}

export interface MslHistoricalEvidenceEventObservation {
  eventId: string;
  eventFamily: Exclude<MslHistoricalEvidenceEventFamily, "NONE">;
  eventBarIndex: number;
  eventTimestamp: number;
  barsAfterEvaluation: number;
  knownAtBarIndex: number;
  knownAtTimestamp: number;
  observationMode: MslHistoricalEvidenceObservationMode;
  eventDirection: string | null;
}

export interface MslHistoricalEvidenceDisclosureObservation
  extends MslHistoricalEvidenceEventObservation {
  observationMode: "DISCLOSURE_HORIZON" | "STRICT_AT_E";
  structureEvaluationBarIndex?: number;
  sourceLiquidityEventId?: string;
  targetStructureEventId?: string;
}

export interface MslHistoricalEvidenceFirstSubsequentEventRef {
  eventId: string;
  eventFamily: Exclude<MslHistoricalEvidenceEventFamily, "NONE">;
  eventBarIndex: number;
  barsAfterEvaluation: number;
}

export interface MslHistoricalEvidencePrimaryDisclosureRef {
  eventFamily: Exclude<
    MslHistoricalEvidenceEventFamily,
    "NONE" | "BOS" | "CHoCH" | "MSS"
  >;
  eventId: string;
  eventDirection: string | null;
  knownAtBarIndex: number;
  knownAtTimestamp: number;
  triggerBarIndex: number;
  poolId?: string;
  poolKind?: string;
  sourceLiquidityEventId?: string;
  targetStructureEventId?: string;
  structureEvaluationBarIndex?: number;
}

export interface MslHistoricalEvidencePhaseBObservations {
  disclosureObservations: readonly MslHistoricalEvidenceDisclosureObservation[];
  subsequentStructureEvents: readonly MslHistoricalEvidenceEventObservation[];
  subsequentLiquidityEvents: readonly MslHistoricalEvidenceEventObservation[];
  subsequentMssEvents: readonly MslHistoricalEvidenceEventObservation[];
  disclosurePrimaryRefs: readonly MslHistoricalEvidencePrimaryDisclosureRef[];
  firstSubsequentEvent: MslHistoricalEvidenceFirstSubsequentEventRef | null;
  strictEventRecords: readonly MslHistoricalEvidenceStrictEventRef[];
  structureObservations: MslHistoricalEvidenceStructureObservations;
  liquidityObservations: MslHistoricalEvidenceLiquidityObservations;
  mssObservations: MslHistoricalEvidenceMssObservations;
  evaluationTimestamp: number;
  limitations: readonly string[];
  unresolved: readonly MslHistoricalEvidenceUnresolved[];
}

export interface MslHistoricalEvidenceRecordV1 {
  schemaVersion: typeof MSL_HISTORICAL_EVIDENCE_SCHEMA_VERSION;
  datasetId: string;
  datasetChecksum: string;
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  measurementMode: MslHistoricalEvidenceMeasurementMode;
  eventFamily: MslHistoricalEvidenceEventFamily;
  eventId: string | null;
  eventDirection: string | null;
  knownAtBarIndex: number | null;
  knownAtTimestamp: number | null;
  observationHorizonBars: number;
  sampleStatus: MslHistoricalEvidenceSampleStatus;
  forwardObservations: MslHistoricalEvidenceForwardObservations;
  structureObservations: MslHistoricalEvidenceStructureObservations | null;
  liquidityObservations: MslHistoricalEvidenceLiquidityObservations | null;
  mssObservations: MslHistoricalEvidenceMssObservations | null;
  limitations: readonly string[];
  unresolved: readonly MslHistoricalEvidenceUnresolved[];
  disclosureObservations: readonly MslHistoricalEvidenceDisclosureObservation[];
  subsequentStructureEvents: readonly MslHistoricalEvidenceEventObservation[];
  subsequentLiquidityEvents: readonly MslHistoricalEvidenceEventObservation[];
  subsequentMssEvents: readonly MslHistoricalEvidenceEventObservation[];
  firstSubsequentEvent: MslHistoricalEvidenceFirstSubsequentEventRef | null;
}

export interface BuildMslHistoricalEvidenceAtEvaluationInput {
  candles: readonly import("../types").Candle[];
  evaluationBarIndex: number;
  observationHorizonBars: number;
  symbol: string;
  timeframe: string;
  datasetId: string;
  datasetChecksum: string;
  swingConfig?: import("../types").SwingConfig;
  htfCandles?: readonly import("../types").Candle[];
  htfTimeframeId?: string;
}

export interface WalkMslHistoricalEvidenceBatchInput {
  candles: readonly import("../types").Candle[];
  evaluationBarIndices: readonly number[];
  observationHorizonBars: readonly number[];
  symbol: string;
  timeframe: string;
  datasetId: string;
  datasetChecksum: string;
  swingConfig?: import("../types").SwingConfig;
  htfCandles?: readonly import("../types").Candle[];
  htfTimeframeId?: string;
}
