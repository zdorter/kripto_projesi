import type { WaveDiagnostics } from "../wave-diagnostics";
import type { WavePresentationState } from "../presentation-state";
import type { WaveScanReport } from "../wave-scanner";
import type { SetupCatalogEntry } from "./setup-types";

export type EvaluationAnalysisScope = "EVALUATION_SCOPED" | "FULL_SERIES";

export interface SymbolEvaluationBundle {
  timeframeId: string;
  /** How wave/presentation/diagnostics were produced for this bundle. */
  evaluationAnalysisScope?: EvaluationAnalysisScope;
  /**
   * Last closed candle index (inclusive) for trade evaluation boundary.
   * -1 when closed boundary is not established.
   */
  evaluationBarIndex: number;
  /**
   * True when the caller contract proves evaluationBarIndex is a closed candle
   * boundary (closedSeriesOnly attestation or explicit index before an open tail).
   */
  evaluationBarBoundaryEstablished: boolean;
  evaluationBarContractDetail: string;
  candleCount: number;
  diagnostics: WaveDiagnostics;
  presentation: WavePresentationState;
}

export interface TradeSetupEvaluationContext {
  scanReport: WaveScanReport;
  bundlesBySymbol?: Record<string, SymbolEvaluationBundle>;
}

export interface TradeSetupSymbolBuildInput {
  candles: import("../types").Candle[];
  /**
   * Last closed bar index (inclusive). When omitted, boundary is established only
   * if `closedSeriesOnly` is true (then defaults to last array index).
   */
  evaluationBarIndex?: number;
  /**
   * Caller attests every candle in `candles` is closed (e.g. Binance
   * `filterClosedKlines` output). Required to default evaluation bar without an
   * explicit index when the last array element might be an open candle.
   */
  closedSeriesOnly?: boolean;
}

export type TradeSetupConditionId =
  | "evaluation-bar-available"
  | "impulse-context-available"
  | "corrective-abc-context-available"
  | "impulse-continuation-phase-active"
  | "c-leg-started"
  | "w2-not-invalidated"
  | "w4-structure-conflict-clear"
  | "impulse-leading-leg-confirmed-at-bar"
  | "c-leg-confirmed-at-bar"
  | "fib-w12-conformance-met"
  | "fib-abc-conformance-met";

export interface TradeSetupCatalogEntry extends SetupCatalogEntry {
  category: "TRADE_SETUP";
  isTradeSetup: true;
  prerequisiteConditions: TradeSetupConditionId[];
  tradeConfirmationConditions: TradeSetupConditionId[];
}

export interface TradeSetupEvaluationContextRow {
  scanRow: import("../wave-scanner").WaveScanResult;
  bundle?: SymbolEvaluationBundle;
  symbolContext?: import("./setup-types").SetupSymbolContext;
}
