import {
  applyPerWaveConfidence,
  computeConfidence,
} from "./confidence";
import { detectSwings, mergeSwingConfig } from "./swing-detector";
import { detectTrend } from "./trend-detector";
import {
  currentWaveLabel,
  detectWaves,
  primaryInvalidationPrice,
} from "./wave-detector";
import {
  Candle,
  WaveAnalysis,
  WaveEngineOptions,
} from "./types";
import {
  mapToPresentationState,
  WavePresentationState,
} from "./presentation-state";
import { buildWaveDiagnostics, WaveDiagnostics } from "./wave-diagnostics";

export interface WaveAnalysisResult {
  analysis: WaveAnalysis;
  impulseBullish: boolean;
}

export function buildWaveAnalysis(
  candles: Candle[],
  options?: WaveEngineOptions
): WaveAnalysisResult {
  if (candles.length === 0) {
    return {
      analysis: {
        trend: "NEUTRAL",
        waves: [],
        confidence: 0,
        alternativeScenarios: [],
      },
      impulseBullish: true,
    };
  }

  const swingConfig = mergeSwingConfig(options?.swing);
  const swings = detectSwings(candles, swingConfig);
  const trend = detectTrend(swings);
  const detection = detectWaves(candles, swings, trend);

  const allWaves = [...detection.impulse, ...detection.corrective];
  const overallConfidence = computeConfidence({
    candles,
    swings,
    waves: detection.impulse,
    trend,
    impulseBullish: detection.impulseBullish,
  });

  const wavesWithConfidence = applyPerWaveConfidence(
    allWaves,
    overallConfidence
  );

  return {
    impulseBullish: detection.impulseBullish,
    analysis: {
      trend,
      currentWave: currentWaveLabel(wavesWithConfidence),
      waves: wavesWithConfidence,
      confidence: overallConfidence,
      invalidationPrice: primaryInvalidationPrice(wavesWithConfidence),
      alternativeScenarios: detection.alternatives.map((alt) =>
        applyPerWaveConfidence(alt, overallConfidence * 0.85)
      ),
    },
  };
}

export function analyzeWave(
  candles: Candle[],
  options?: WaveEngineOptions
): WaveAnalysis {
  return buildWaveAnalysis(candles, options).analysis;
}

export function analyzeWaveWithPresentation(
  candles: Candle[],
  options?: WaveEngineOptions
): { analysis: WaveAnalysis; presentation: WavePresentationState } {
  const result = buildWaveAnalysis(candles, options);
  return {
    analysis: result.analysis,
    presentation: mapToPresentationState(result.analysis, {
      impulseBullish: result.impulseBullish,
    }),
  };
}

export function analyzeWaveWithDiagnostics(
  candles: Candle[],
  options?: WaveEngineOptions
): {
  analysis: WaveAnalysis;
  presentation: WavePresentationState;
  diagnostics: WaveDiagnostics;
} {
  const result = buildWaveAnalysis(candles, options);
  const presentation = mapToPresentationState(result.analysis, {
    impulseBullish: result.impulseBullish,
  });
  const diagnostics = buildWaveDiagnostics(
    candles,
    presentation,
    result.impulseBullish,
    options
  );
  return {
    analysis: result.analysis,
    presentation,
    diagnostics,
  };
}
