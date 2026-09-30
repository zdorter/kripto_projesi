import type { WaveAnalysisResult } from "./analysis-pipeline";
import type { WaveDiagnostics } from "./wave-diagnostics";
import type { WavePresentationState } from "./presentation-state";
import type { Candle, WaveAnalysis, WaveEngineOptions } from "./types";

export type EvaluationScopedAnalysisStatus =
  | "OK"
  | "INSUFFICIENT_CONTEXT"
  | "INVALID_EVALUATION_INDEX";

export interface EvaluationScopedWaveAnalysisInput {
  candles: Candle[];
  evaluationBarIndex?: number;
  closedSeriesOnly?: boolean;
  engineOptions?: WaveEngineOptions;
}

export interface EvaluationScopedAnalysisEvidence {
  inputCandleCount: number;
  usedCandleCount: number;
  maxCandleIndexUsed: number;
  boundaryEstablished: boolean;
  contractDetail: string;
}

export interface EvaluationScopedWaveAnalysis {
  status: EvaluationScopedAnalysisStatus;
  evaluationBarIndex: number;
  evidence: EvaluationScopedAnalysisEvidence;
  analysis: WaveAnalysis | null;
  presentation: WavePresentationState | null;
  diagnostics: WaveDiagnostics | null;
  impulseBullish: boolean;
  futureSafe: boolean;
  invariantViolations: string[];
  detail: string;
}

export interface FullVsScopedAnalysisComparison {
  evaluationBarIndex: number;
  full: {
    swingCount: number;
    lastSwingIndex: number | null;
    trend: string;
    flatWaveCount: number;
    scenarioCount: number;
  };
  scoped: {
    swingCount: number;
    lastSwingIndex: number | null;
    trend: string;
    flatWaveCount: number;
    scenarioCount: number;
  };
  prefixInvariant: boolean;
  parityAtLastClosedBar: boolean;
}

export type EvaluationScopedSupportVerdict =
  | "EVALUATION_SCOPED_ANALYSIS_SUPPORTED"
  | "EVALUATION_SCOPED_ANALYSIS_UNSUPPORTED";

export type EvaluationScopedOpenLegVerdict =
  | "OPEN_LEG_REPRESENTABLE_WITH_SCOPED_ENGINE"
  | "NEEDS_OPEN_LEG_ABSTRACTION";

/** @internal */
export interface EvaluationScopedEngineRun {
  analysis: WaveAnalysis;
  presentation: WavePresentationState;
  diagnostics: WaveDiagnostics;
  impulseBullish: boolean;
}

export type { WaveAnalysisResult };
