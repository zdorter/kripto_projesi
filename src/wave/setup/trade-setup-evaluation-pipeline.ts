import type { Candle } from "../types";
import type { WaveScanReport } from "../wave-scanner";
import { buildEntryPlansFromSetupReport } from "./entry-plan";
import { detectSetups } from "./setup-detector";
import { buildTradeSetupEvaluationSnapshot } from "./trade-setup-evaluation";
import type {
  TradeSetupEvaluationPipelineError,
  TradeSetupEvaluationPipelineItem,
  TradeSetupEvaluationPipelineReport,
} from "./trade-setup-evaluation-pipeline-types";
import { TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION } from "./trade-setup-evaluation-pipeline-types";
import type { SetupDetectionReport } from "./setup-types";
import type { ObjectiveTargetSourceContext } from "./objective-target-candidate-types";
import type { TradeSetupEvaluationContext } from "./trade-setup-types";

const PIPELINE_LIMITATIONS = [
  "Pipeline wires scanner → setup detection → entry plan → evaluation snapshot; it does not execute trades.",
  "Setup detection and entry plan rules are unchanged from upstream modules.",
  "Evaluation snapshots use buildTradeSetupEvaluationSnapshot only; reference models are not invoked separately.",
  "Per-plan snapshot failures are recorded in errors and do not abort other symbols or setups.",
  "Missing objective target in production setup detection is expected; aggregate state may be INSUFFICIENT_CONTEXT.",
  "When objectiveTargetSourceContextBySymbol is omitted, target selection is skipped (14D.7-compatible behavior).",
];

export interface TradeSetupEvaluationPipelineInput {
  scanReport: WaveScanReport;
  tradeContext?: TradeSetupEvaluationContext;
  /**
   * Optional OHLCV per symbol for entry-model evaluation-close (same closed-bar
   * contract as trade evaluation bundles).
   */
  candlesBySymbol?: Record<string, Candle[]>;
  /**
   * When provided, setup detection is not re-run (reuse / test fixtures).
   * Scanner output in scanReport is still the pipeline source of truth for symbol list.
   */
  setupDetectionReport?: SetupDetectionReport;
  /**
   * Per-symbol objective target source context for 14D.8/14D.9 wiring.
   * Caller-provided only; pipeline does not fetch diagnostics or candles.
   */
  objectiveTargetSourceContextBySymbol?: Record<
    string,
    ObjectiveTargetSourceContext
  >;
}

function comparePipelineItems(
  a: TradeSetupEvaluationPipelineItem,
  b: TradeSetupEvaluationPipelineItem
): number {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const type = a.setupTypeId.localeCompare(b.setupTypeId);
  if (type !== 0) {
    return type;
  }
  return a.setupId.localeCompare(b.setupId);
}

/**
 * End-to-end: WaveScanReport → SetupDetectionReport → EntryPlanReport →
 * TradeSetupEvaluationSnapshot per eligible plan.
 */
export function buildTradeSetupEvaluationPipeline(
  input: TradeSetupEvaluationPipelineInput
): TradeSetupEvaluationPipelineReport {
  const setupDetection =
    input.setupDetectionReport ??
    detectSetups({
      scanReport: input.scanReport,
      tradeContext: input.tradeContext,
    });

  const bundles = input.tradeContext?.bundlesBySymbol;
  const entryPlanReport = buildEntryPlansFromSetupReport(
    setupDetection,
    bundles
  );

  const snapshots: TradeSetupEvaluationPipelineItem[] = [];
  const errors: TradeSetupEvaluationPipelineError[] = [];

  for (const plan of entryPlanReport.plans) {
    const candles = input.candlesBySymbol?.[plan.symbol];
    const priceContext = candles ? { candles } : undefined;
    const objectiveTargetSourceContext =
      input.objectiveTargetSourceContextBySymbol?.[plan.symbol];
    try {
      const snapshot = buildTradeSetupEvaluationSnapshot({
        plan,
        priceContext,
        objectiveTargetSourceContext,
      });
      snapshots.push({
        setupId: plan.setupRef.setupId,
        entryPlanId: plan.id,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        setupTypeId: plan.setupTypeId,
        snapshot,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        symbol: plan.symbol,
        entryPlanId: plan.id,
        setupId: plan.setupRef.setupId,
        phase: "evaluation_snapshot",
        message,
      });
    }
  }

  snapshots.sort(comparePipelineItems);
  errors.sort((a, b) => {
    const sym = a.symbol.localeCompare(b.symbol);
    if (sym !== 0) {
      return sym;
    }
    return (a.entryPlanId ?? "").localeCompare(b.entryPlanId ?? "");
  });

  const symbols = [...new Set(snapshots.map((s) => s.symbol))].sort();

  return {
    schemaVersion: TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION,
    timeframe: input.scanReport.timeframe,
    symbols,
    setupDetection,
    entryPlanReport,
    snapshots,
    snapshotCount: snapshots.length,
    errors,
    limitations: [
      ...PIPELINE_LIMITATIONS,
      ...setupDetection.limitations,
      ...entryPlanReport.limitations,
    ],
  };
}
