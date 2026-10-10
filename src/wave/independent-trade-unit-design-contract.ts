/**
 * B-12a design contract (documentation only — no runtime behavior).
 *
 * Defines vocabulary for independent trade units before PnL. Does not implement
 * deduplication, lifecycle, or execution.
 */

export const INDEPENDENT_TRADE_UNIT_DESIGN_SCHEMA_VERSION = "1.0" as const;

/** Canonical artifact observation key (B-8). */
export const INDEPENDENT_TRADE_UNIT_SNAPSHOT_ID_COMPONENTS = [
  "symbol",
  "timeframe",
  "evaluationBarIndex",
  "prospectiveSetupId",
] as const;

/**
 * Lookahead boundary for trade *identification* (decision at E):
 * only candles[0..evaluationBarIndex]. Outcome/PnL may use E+1..horizon.
 */
export const INDEPENDENT_TRADE_UNIT_DECISION_CANDLE_RANGE =
  "candles[0..evaluationBarIndex]" as const;

export const INDEPENDENT_TRADE_UNIT_OUTCOME_CANDLE_RANGE =
  "candles[evaluationBarIndex+1 .. evaluationBarIndex+horizonBars]" as const;

/** Explicit non-goals for B-12a / design phase. */
export const INDEPENDENT_TRADE_UNIT_DESIGN_NON_GOALS = [
  "calculatePnL",
  "computePnL",
  "equityCurve",
  "executionSimulation",
  "slippage",
  "fees",
  "parameterSearch",
  "optimize",
] as const;
