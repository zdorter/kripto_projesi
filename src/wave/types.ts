export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SwingType = "HIGH" | "LOW";

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: SwingType;
  strength: number;
  confirmed: boolean;
}

export type TrendDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export type MarketStructure = "HH" | "HL" | "LH" | "LL";

export type WaveLabel = "1" | "2" | "3" | "4" | "5" | "A" | "B" | "C";

export type WaveStatus = "POTENTIAL" | "CONFIRMED" | "INVALIDATED";

export interface WaveCandidate {
  label: WaveLabel;
  startIndex: number;
  endIndex: number;
  confidence: number;
  status: WaveStatus;
  invalidationPrice?: number;
  structureConflict?: boolean;
}

export interface WaveAnalysis {
  trend: TrendDirection;
  currentWave?: WaveLabel;
  waves: WaveCandidate[];
  confidence: number;
  invalidationPrice?: number;
  alternativeScenarios: WaveCandidate[][];
}

export interface SwingConfig {
  leftBars: number;
  rightBars: number;
  atrPeriod: number;
  minAtrMultiplier: number;
}

export const DEFAULT_SWING_CONFIG: SwingConfig = {
  leftBars: 5,
  rightBars: 5,
  atrPeriod: 14,
  minAtrMultiplier: 0.5,
};

export interface WaveEngineOptions {
  swing?: Partial<SwingConfig>;
}
