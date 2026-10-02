import type { PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION } from "./prospective-setup-outcome-replay-contract";

export type ProspectiveSetupOutcomeReplayStatus =
  | "NO_FUTURE_DATA"
  | "NO_TOUCH"
  | "TARGET_TOUCHED"
  | "INVALIDATION_TOUCHED"
  | "AMBIGUOUS"
  | "INSUFFICIENT_CONTEXT";

export interface ProspectiveSetupOutcomeReplayInput {
  direction: "BULLISH" | "BEARISH" | "UNRESOLVED" | null;
  entryReferencePrice: number | null;
  targetReferencePrice: number | null;
  /** Structural invalidation reference (canonical stop ref at evaluation). */
  invalidationReferencePrice: number | null;
  evaluationBarIndex: number | null;
  candles: ReadonlyArray<{ high: number; low: number }>;
  horizonBars?: number;
  prospectiveSetupId?: string | null;
}

export interface ProspectiveSetupOutcomeReplayResult {
  schemaVersion: typeof PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION;
  outcome: ProspectiveSetupOutcomeReplayStatus;
  evaluationBarIndex: number | null;
  resolutionBarIndex: number | null;
  barsAfterEvaluation: number | null;
  targetPrice: number | null;
  invalidationPrice: number | null;
  direction: "BULLISH" | "BEARISH" | null;
  horizonBars: number;
  targetTouched: boolean;
  invalidationTouched: boolean;
  prospectiveSetupId: string | null;
}
