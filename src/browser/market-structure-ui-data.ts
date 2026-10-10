export interface MarketStructureUiCacheKeyInput {
  symbol: string;
  schemaVersion: string;
  ruleId: string;
  ltfEvalTs: number;
  ltfLen: number;
  htfSourceTrack: string;
  includeReplay: boolean;
}

export function closedEvaluationBarIndex(candleCount: number): number {
  if (!Number.isInteger(candleCount) || candleCount <= 0) {
    throw new Error("candleCount must be a positive integer");
  }
  return candleCount - 1;
}

export function buildMarketStructureUiCacheKey(input: MarketStructureUiCacheKeyInput): string {
  return [
    input.symbol,
    input.schemaVersion,
    input.ruleId,
    String(input.ltfEvalTs),
    String(input.ltfLen),
    input.htfSourceTrack,
    input.includeReplay ? "replay1" : "replay0",
  ].join("|");
}
