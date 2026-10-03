import type { Candle, WaveEngineOptions } from "./types";
import {
  composeProductionWaveScannerForSymbol,
  type ProductionWaveScannerSymbolComposeOptions,
} from "./production-wave-scanner";
import type { ProductionWaveScannerComposedRow } from "./wave-scanner-presentation";

/**
 * Historical production walk-forward (Phase B-8c).
 * Complexity: O((end - start + 1) × composeCost(E)) — naive, correctness-first.
 */
export const HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION = "1.0" as const;

export type HistoricalWalkForwardRangeError =
  | "EMPTY_CANDLES"
  | "INVALID_EVALUATION_BAR"
  | "START_EVALUATION_BAR_OUT_OF_RANGE"
  | "END_EVALUATION_BAR_OUT_OF_RANGE"
  | "START_AFTER_END";

export interface HistoricalProductionWalkForwardInput {
  symbol: string;
  timeframeId: string;
  candles: Candle[];
  startEvaluationBar: number;
  endEvaluationBar: number;
  engineOptions?: WaveEngineOptions;
  composeOptions?: Omit<
    ProductionWaveScannerSymbolComposeOptions,
    "evaluationBarIndex"
  >;
}

export interface HistoricalProductionWalkForwardRow {
  evaluationBarIndex: number;
  composed: ProductionWaveScannerComposedRow;
}

export interface HistoricalProductionWalkForwardResult {
  schemaVersion: typeof HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION;
  symbol: string;
  timeframeId: string;
  candleCount: number;
  startEvaluationBar: number | null;
  endEvaluationBar: number | null;
  rangeError: HistoricalWalkForwardRangeError | null;
  rows: HistoricalProductionWalkForwardRow[];
}

function parseEvaluationBarIndex(value: number): number | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

export function validateHistoricalProductionWalkForwardRange(
  candles: Candle[],
  startEvaluationBar: number,
  endEvaluationBar: number
):
  | { ok: true; start: number; end: number }
  | { ok: false; error: HistoricalWalkForwardRangeError } {
  if (!candles.length) {
    return { ok: false, error: "EMPTY_CANDLES" };
  }
  const start = parseEvaluationBarIndex(startEvaluationBar);
  const end = parseEvaluationBarIndex(endEvaluationBar);
  if (start === null || end === null) {
    return { ok: false, error: "INVALID_EVALUATION_BAR" };
  }
  const lastIndex = candles.length - 1;
  if (start < 0 || start > lastIndex) {
    return { ok: false, error: "START_EVALUATION_BAR_OUT_OF_RANGE" };
  }
  if (end < 0 || end > lastIndex) {
    return { ok: false, error: "END_EVALUATION_BAR_OUT_OF_RANGE" };
  }
  if (start > end) {
    return { ok: false, error: "START_AFTER_END" };
  }
  return { ok: true, start, end };
}

export function runHistoricalProductionWalkForward(
  input: HistoricalProductionWalkForwardInput
): HistoricalProductionWalkForwardResult {
  const {
    symbol,
    timeframeId,
    candles,
    startEvaluationBar,
    endEvaluationBar,
    engineOptions,
    composeOptions,
  } = input;

  const base = {
    schemaVersion: HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION,
    symbol,
    timeframeId,
    candleCount: candles.length,
    startEvaluationBar: null as number | null,
    endEvaluationBar: null as number | null,
    rangeError: null as HistoricalWalkForwardRangeError | null,
    rows: [] as HistoricalProductionWalkForwardRow[],
  };

  const validated = validateHistoricalProductionWalkForwardRange(
    candles,
    startEvaluationBar,
    endEvaluationBar
  );
  if (!validated.ok) {
    return {
      ...base,
      rangeError: validated.error,
    };
  }

  const rows: HistoricalProductionWalkForwardRow[] = [];
  for (let e = validated.start; e <= validated.end; e++) {
    const composed = composeProductionWaveScannerForSymbol({
      symbol,
      candles,
      timeframeId,
      engineOptions,
      composeOptions: {
        ...composeOptions,
        evaluationBarIndex: e,
      },
    });
    rows.push({ evaluationBarIndex: e, composed });
  }

  return {
    ...base,
    startEvaluationBar: validated.start,
    endEvaluationBar: validated.end,
    rows,
  };
}
