import type { TradeSetupSymbolBuildInput } from "./trade-setup-types";

export interface ResolvedEvaluationBarBoundary {
  evaluationBarIndex: number;
  boundaryEstablished: boolean;
  contractDetail: string;
}

/**
 * Resolves trade evaluation bar without inferring close status from Candle fields
 * (Candle has no closeTime). See Binance `filterClosedKlines` for closed-only series.
 */
export function resolveTradeSetupEvaluationBoundary(
  input: Pick<
    TradeSetupSymbolBuildInput,
    "candles" | "evaluationBarIndex" | "closedSeriesOnly"
  >
): ResolvedEvaluationBarBoundary {
  const n = input.candles.length;
  if (n === 0) {
    return {
      evaluationBarIndex: -1,
      boundaryEstablished: false,
      contractDetail: "Empty candle series.",
    };
  }

  const lastIndex = n - 1;
  const explicit = input.evaluationBarIndex;

  if (input.closedSeriesOnly === true) {
    const bar =
      explicit !== undefined
        ? Math.max(0, Math.min(explicit, lastIndex))
        : lastIndex;
    return {
      evaluationBarIndex: bar,
      boundaryEstablished: true,
      contractDetail:
        "closedSeriesOnly attestation: all candles treated as closed; evaluation bar is within closed series.",
    };
  }

  if (explicit !== undefined) {
    const bar = Math.max(0, Math.min(explicit, lastIndex));
    if (bar < lastIndex) {
      return {
        evaluationBarIndex: bar,
        boundaryEstablished: true,
        contractDetail:
          "Explicit evaluationBarIndex before final array element; final candle may be open.",
      };
    }
    return {
      evaluationBarIndex: bar,
      boundaryEstablished: false,
      contractDetail:
        "evaluationBarIndex points at last candle without closedSeriesOnly attestation; open candle cannot be ruled out.",
    };
  }

  return {
    evaluationBarIndex: -1,
    boundaryEstablished: false,
    contractDetail:
      "No evaluationBarIndex and no closedSeriesOnly attestation; closed boundary unknown.",
  };
}
