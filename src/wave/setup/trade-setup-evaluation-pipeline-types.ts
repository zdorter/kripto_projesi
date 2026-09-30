import type { EntryPlanReport } from "./entry-plan-types";
import type { SetupDetectionReport } from "./setup-types";
import type { TradeSetupEvaluationSnapshot } from "./trade-setup-evaluation-types";

export const TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION = "1.0" as const;

export type TradeSetupEvaluationPipelineErrorPhase =
  | "evaluation_snapshot";

export interface TradeSetupEvaluationPipelineError {
  symbol: string;
  entryPlanId?: string;
  setupId?: string;
  phase: TradeSetupEvaluationPipelineErrorPhase;
  message: string;
}

export interface TradeSetupEvaluationPipelineItem {
  setupId: string;
  entryPlanId: string;
  symbol: string;
  timeframe: string;
  setupTypeId: string;
  snapshot: TradeSetupEvaluationSnapshot;
}

/**
 * End-to-end wiring report: setup detection → entry plans → evaluation snapshots.
 */
export interface TradeSetupEvaluationPipelineReport {
  schemaVersion: typeof TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION;
  timeframe: string;
  symbols: string[];
  setupDetection: SetupDetectionReport;
  entryPlanReport: EntryPlanReport;
  snapshots: TradeSetupEvaluationPipelineItem[];
  snapshotCount: number;
  errors: TradeSetupEvaluationPipelineError[];
  limitations: string[];
}
