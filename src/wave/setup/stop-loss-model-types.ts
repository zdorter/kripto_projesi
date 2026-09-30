import type { EntryPriceReference } from "./entry-model-types";
import type { EntryPlanCandidate, EntryPlanEligibility } from "./entry-plan-types";
import type {
  ReferenceLevelKind,
  ScenarioInvalidationSource,
  SetupDirectionalBias,
} from "./setup-types";

export const STOP_LOSS_MODEL_SCHEMA_VERSION = "1.0" as const;

/**
 * Maps structural scenario invalidation to a stop-loss reference (not an executable order).
 *
 * SCENARIO_INVALIDATION_REFERENCE contract semantics:
 * SEGMENT_ENVELOPE_SCENARIO_INVALIDATION_REFERENCE — invalidation must lie outside the
 * setup segment price envelope (see stop-loss-model geometry).
 *
 * TRACK_SCOPE_INVALIDATION_REFERENCE — track-scoped structural invalidation on the risk
 * side of the selected entry reference (no segment envelope).
 */
export type StopLossModelId =
  | "SCENARIO_INVALIDATION_REFERENCE"
  | "TRACK_SCOPE_INVALIDATION_REFERENCE";

export type StopLossReferenceOutcome =
  | "STOP_REFERENCE_AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

export interface StopLossModelEvaluateInput {
  plan: EntryPlanCandidate;
  /**
   * Selected entry reference from entry model (composition layer).
   * Required for TRACK_SCOPE_INVALIDATION_REFERENCE risk-side geometry.
   */
  selectedEntryReference?: EntryPriceReference | null;
}

/**
 * Stop-loss price reference — not a stop order sent to an exchange.
 */
export interface StopLossReference {
  schemaVersion: typeof STOP_LOSS_MODEL_SCHEMA_VERSION;
  modelId: StopLossModelId;
  modelLabel: string;
  outcome: StopLossReferenceOutcome;
  entryPlanId: string;
  setupTypeId: string;
  directionalBias: SetupDirectionalBias | null;
  stopPrice?: number;
  referenceKind?: ReferenceLevelKind;
  referenceSource: string;
  /** Contract scope semantics (documentation / reporting; not a ranking signal). */
  scopeSemantics?: string;
  rationale: string;
  limitations: string[];
  requiredInvalidationSource?: ScenarioInvalidationSource;
}

export interface StopLossModelReport {
  schemaVersion: typeof STOP_LOSS_MODEL_SCHEMA_VERSION;
  entryPlanId: string;
  symbol: string;
  timeframe: string;
  planEligibility: EntryPlanEligibility;
  references: StopLossReference[];
  limitations: string[];
}

export interface StopLossModelBuildResult {
  report: StopLossModelReport;
}
