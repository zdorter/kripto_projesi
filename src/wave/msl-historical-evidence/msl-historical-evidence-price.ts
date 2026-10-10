import type { Candle } from "../types";
import type { MslHistoricalEvidenceForwardObservations } from "./msl-historical-evidence-types";

export interface ComputeForwardObservationsInput {
  candles: readonly Candle[];
  evaluationBarIndex: number;
  observationHorizonBars: number;
}

export interface ForwardObservationComputeResult {
  forward: MslHistoricalEvidenceForwardObservations;
  sufficientHorizon: boolean;
}

/**
 * Pure OHLCV forward window: candles[E+1 .. min(E+H, last)] only.
 */
export function computeMslHistoricalForwardObservations(
  input: ComputeForwardObservationsInput
): ForwardObservationComputeResult {
  const E = input.evaluationBarIndex;
  const H = input.observationHorizonBars;
  const candles = input.candles;
  const lastIndex = candles.length - 1;

  const empty: MslHistoricalEvidenceForwardObservations = {
    effectiveHorizonBars: 0,
    terminalBarOffset: null,
    forwardReturn: null,
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    rangeExpansion: null,
    timeToHighBarOffset: null,
    timeToLowBarOffset: null,
  };

  if (
    !Number.isInteger(E) ||
    E < 0 ||
    E >= candles.length ||
    !Number.isInteger(H) ||
    H <= 0
  ) {
    return { forward: empty, sufficientHorizon: false };
  }

  const requestedEnd = E + H;
  const effectiveEnd = Math.min(requestedEnd, lastIndex);
  const sufficientHorizon = requestedEnd <= lastIndex;

  if (E + 1 > effectiveEnd) {
    return { forward: empty, sufficientHorizon: false };
  }

  const baseClose = candles[E].close;
  if (!Number.isFinite(baseClose) || baseClose === 0) {
    return { forward: empty, sufficientHorizon: sufficientHorizon };
  }

  let maxHigh = -Infinity;
  let minLow = Infinity;
  let timeToHigh: number | null = null;
  let timeToLow: number | null = null;

  for (let i = E + 1; i <= effectiveEnd; i++) {
    const bar = candles[i];
    if (bar.high > maxHigh) {
      maxHigh = bar.high;
      timeToHigh = i - E;
    }
    if (bar.low < minLow) {
      minLow = bar.low;
      timeToLow = i - E;
    }
  }

  const terminalBarOffset = effectiveEnd - E;
  const terminalClose = candles[effectiveEnd].close;

  return {
    forward: {
      effectiveHorizonBars: effectiveEnd - E,
      terminalBarOffset,
      forwardReturn: terminalClose / baseClose - 1,
      maxFavorableExcursion: maxHigh / baseClose - 1,
      maxAdverseExcursion: minLow / baseClose - 1,
      rangeExpansion: maxHigh - minLow,
      timeToHighBarOffset: timeToHigh,
      timeToLowBarOffset: timeToLow,
    },
    sufficientHorizon,
  };
}
