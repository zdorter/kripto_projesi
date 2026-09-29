import type { Candle } from "../types";
import type {
  EntryPlanCandidate,
  EntryPlanEligibility,
} from "./entry-plan-types";
import type {
  ReferenceLevelKind,
  SetupDirectionalBias,
} from "./setup-types";

export const ENTRY_MODEL_SCHEMA_VERSION = "1.0" as const;

/**
 * Implemented entry reference models only (no speculative future models).
 */
export type EntryModelId = "EVALUATION_CLOSE" | "SEGMENT_ENDPOINT";

export type EntryReferenceOutcome =
  | "ENTRY_REFERENCE_AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

/**
 * Immutable OHLCV slice from the same evaluation snapshot as the Entry Plan.
 * Caller attests candles align with the closed-bar contract used for the plan.
 */
export interface EntryModelPriceContext {
  candles: Candle[];
}

export interface EntryModelEvaluateInput {
  plan: EntryPlanCandidate;
  priceContext?: EntryModelPriceContext;
}

/**
 * Deterministic entry price reference — not an order, signal, or execution price.
 */
export interface EntryPriceReference {
  schemaVersion: typeof ENTRY_MODEL_SCHEMA_VERSION;
  modelId: EntryModelId;
  modelLabel: string;
  outcome: EntryReferenceOutcome;
  entryPlanId: string;
  setupTypeId: string;
  directionalBias: SetupDirectionalBias | null;
  referencePrice?: number;
  referenceBarIndex?: number;
  referenceLevelKind?: ReferenceLevelKind;
  rationale: string;
  limitations: string[];
}

export interface EntryModelReport {
  schemaVersion: typeof ENTRY_MODEL_SCHEMA_VERSION;
  entryPlanId: string;
  symbol: string;
  timeframe: string;
  planEligibility: EntryPlanEligibility;
  references: EntryPriceReference[];
  limitations: string[];
}

export interface EntryModelBuildResult {
  report: EntryModelReport;
}
