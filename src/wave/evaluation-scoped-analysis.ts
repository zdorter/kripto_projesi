import { analyzeWaveWithDiagnostics, buildWaveAnalysis } from "./analysis-pipeline";
import { mapToPresentationState } from "./presentation-state";
import { buildWaveDiagnostics } from "./wave-diagnostics";
import {
  assertScenarioIndicesWithinBar,
  collectEvaluationScopedInvariantViolations,
} from "./evaluation-scoped-invariants";
import type {
  EvaluationScopedWaveAnalysis,
  EvaluationScopedWaveAnalysisInput,
  FullVsScopedAnalysisComparison,
} from "./evaluation-scoped-analysis-types";
import { buildTimeframeBundle } from "./multi-timeframe";
import { buildWaveScenarios } from "./wave-scenarios";
import { resolveTradeSetupEvaluationBoundary } from "./setup/trade-setup-evaluation-bar";
import type { Candle, WaveEngineOptions } from "./types";
import type { WaveScanSymbolContext, WaveScannerRunOptions } from "./wave-scanner";
import { scanSymbolWaveScenarios } from "./wave-scanner";

function insufficient(
  evaluationBarIndex: number,
  inputCandleCount: number,
  detail: string
): EvaluationScopedWaveAnalysis {
  return {
    status: "INSUFFICIENT_CONTEXT",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: 0,
      maxCandleIndexUsed: -1,
      boundaryEstablished: false,
      contractDetail: detail,
    },
    analysis: null,
    presentation: null,
    diagnostics: null,
    impulseBullish: true,
    futureSafe: false,
    invariantViolations: [],
    detail,
  };
}

function invalidIndex(
  evaluationBarIndex: number,
  inputCandleCount: number,
  detail: string
): EvaluationScopedWaveAnalysis {
  return {
    status: "INVALID_EVALUATION_INDEX",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: 0,
      maxCandleIndexUsed: -1,
      boundaryEstablished: false,
      contractDetail: detail,
    },
    analysis: null,
    presentation: null,
    diagnostics: null,
    impulseBullish: true,
    futureSafe: false,
    invariantViolations: [],
    detail,
  };
}

/**
 * Slice-first evaluation-scoped wave analysis. The engine never sees candles after
 * evaluationBarIndex (no filter-after-analysis).
 */
export function analyzeWaveAtEvaluationBar(
  input: EvaluationScopedWaveAnalysisInput
): EvaluationScopedWaveAnalysis {
  const { candles, engineOptions } = input;
  const inputCandleCount = candles.length;

  if (inputCandleCount === 0) {
    return insufficient(-1, 0, "Empty candle series.");
  }

  const explicit = input.evaluationBarIndex;
  if (
    explicit !== undefined &&
    (!Number.isInteger(explicit) || explicit < 0 || explicit >= inputCandleCount)
  ) {
    return invalidIndex(
      explicit,
      inputCandleCount,
      `evaluationBarIndex ${explicit} out of bounds [0, ${inputCandleCount - 1}].`
    );
  }

  const boundary = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: explicit,
    closedSeriesOnly: input.closedSeriesOnly,
  });

  if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
    return insufficient(
      boundary.evaluationBarIndex,
      inputCandleCount,
      boundary.contractDetail
    );
  }

  const evaluationBarIndex = boundary.evaluationBarIndex;
  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1);

  const impulseResult = buildWaveAnalysis(effectiveCandles, engineOptions);
  const analysis = impulseResult.analysis;
  const presentation = mapToPresentationState(analysis, {
    impulseBullish: impulseResult.impulseBullish,
  });
  const diagnostics = buildWaveDiagnostics(
    effectiveCandles,
    presentation,
    impulseResult.impulseBullish,
    engineOptions
  );

  const invariantViolations = collectEvaluationScopedInvariantViolations(
    presentation,
    diagnostics,
    evaluationBarIndex
  );

  const futureSafe = invariantViolations.length === 0;

  return {
    status: "OK",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: effectiveCandles.length,
      maxCandleIndexUsed: evaluationBarIndex,
      boundaryEstablished: true,
      contractDetail: boundary.contractDetail,
    },
    analysis,
    presentation,
    diagnostics,
    impulseBullish: impulseResult.impulseBullish,
    futureSafe,
    invariantViolations,
    detail:
      "Analysis run on candles[0..evaluationBarIndex] only; indices match original series positions.",
  };
}

export function analyzeWaveAtEvaluationBarFromSeries(
  candles: Candle[],
  evaluationBarIndex: number,
  options?: {
    closedSeriesOnly?: boolean;
    engineOptions?: WaveEngineOptions;
  }
): EvaluationScopedWaveAnalysis {
  return analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex,
    closedSeriesOnly: options?.closedSeriesOnly,
    engineOptions: options?.engineOptions,
  });
}

export function buildWaveScenariosAtEvaluationBar(
  candles: Candle[],
  timeframeId: string,
  symbol: string,
  evaluationBarIndex: number,
  options?: {
    closedSeriesOnly?: boolean;
    engineOptions?: WaveEngineOptions;
  }
): {
  scoped: EvaluationScopedWaveAnalysis;
  scenarioCount: number;
  scenarioInvariantViolations: string[];
} {
  const scoped = analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex,
    closedSeriesOnly: options?.closedSeriesOnly,
    engineOptions: options?.engineOptions,
  });
  if (scoped.status !== "OK" || !scoped.presentation || !scoped.diagnostics) {
    return {
      scoped,
      scenarioCount: 0,
      scenarioInvariantViolations: [],
    };
  }

  const usedLen = scoped.evidence.usedCandleCount;
  const effectiveCandles = candles.slice(0, usedLen);
  const bundle = buildTimeframeBundle(effectiveCandles, timeframeId, options?.engineOptions);
  const scenarioReport = buildWaveScenarios(bundle, { symbol });
  const scenarioInvariantViolations = assertScenarioIndicesWithinBar(
    scenarioReport.scenarios,
    scoped.evaluationBarIndex
  );

  return {
    scoped,
    scenarioCount: scenarioReport.scenarios.length,
    scenarioInvariantViolations,
  };
}

/**
 * Scanner helper: slices candles before existing scan path (no production scanner change).
 */
export function scanSymbolWaveScenariosAtEvaluationBar(
  input: WaveScanSymbolContext,
  evaluationBarIndex: number,
  options: WaveScannerRunOptions & { closedSeriesOnly?: boolean }
): ReturnType<typeof scanSymbolWaveScenarios> {
  const scoped = analyzeWaveAtEvaluationBar({
    candles: input.candles,
    evaluationBarIndex,
    closedSeriesOnly: options.closedSeriesOnly ?? true,
    engineOptions: options.engineOptions,
  });
  if (scoped.status !== "OK") {
    return { results: [] };
  }
  const used = input.candles.slice(0, scoped.evidence.usedCandleCount);
  return scanSymbolWaveScenarios(
    { ...input, candles: used },
    options
  );
}

function snapshotCounts(
  analysis: { trend: string } | null,
  diagnostics: { confirmedSwingCount: number; confirmedSwings: { index: number }[] } | null,
  presentation: { engine: { flatWaves: unknown[] } } | null,
  scenarioCount: number
) {
  const swings = diagnostics?.confirmedSwings ?? [];
  return {
    swingCount: diagnostics?.confirmedSwingCount ?? 0,
    lastSwingIndex:
      swings.length > 0 ? swings[swings.length - 1].index : null,
    trend: analysis?.trend ?? "NEUTRAL",
    flatWaveCount: presentation?.engine.flatWaves.length ?? 0,
    scenarioCount,
  };
}

export function compareFullVsScopedWaveAnalysis(
  candles: Candle[],
  evaluationBarIndex: number,
  options?: {
    closedSeriesOnly?: boolean;
    engineOptions?: WaveEngineOptions;
    timeframeId?: string;
    symbol?: string;
  }
): FullVsScopedAnalysisComparison {
  const tf = options?.timeframeId ?? "1H";
  const symbol = options?.symbol ?? "SYMBOL";
  const engineOptions = options?.engineOptions;

  const full = analyzeWaveWithDiagnostics(candles, engineOptions);
  const fullBundle = buildTimeframeBundle(candles, tf, engineOptions);
  const fullScenarios = buildWaveScenarios(fullBundle, { symbol });

  const scoped = analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex,
    closedSeriesOnly: options?.closedSeriesOnly,
    engineOptions,
  });

  const scopedScenario = buildWaveScenariosAtEvaluationBar(
    candles,
    tf,
    symbol,
    evaluationBarIndex,
    { closedSeriesOnly: options?.closedSeriesOnly, engineOptions }
  );

  const prefixA = analyzeWaveAtEvaluationBar({
    candles: candles.slice(0, evaluationBarIndex + 1),
    evaluationBarIndex,
    closedSeriesOnly: options?.closedSeriesOnly ?? true,
    engineOptions,
  });
  const prefixB = analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex,
    closedSeriesOnly: options?.closedSeriesOnly ?? true,
    engineOptions,
  });

  const prefixInvariant =
    prefixA.status === "OK" &&
    prefixB.status === "OK" &&
    JSON.stringify({
      analysis: prefixA.analysis,
      presentation: prefixA.presentation,
      diagnostics: prefixA.diagnostics,
    }) ===
      JSON.stringify({
        analysis: prefixB.analysis,
        presentation: prefixB.presentation,
        diagnostics: prefixB.diagnostics,
      });

  const lastIndex = candles.length - 1;
  const parityAtLastClosedBar =
    evaluationBarIndex === lastIndex &&
    (options?.closedSeriesOnly === true) &&
    scoped.status === "OK" &&
    JSON.stringify(full.analysis) === JSON.stringify(scoped.analysis) &&
    JSON.stringify(full.presentation) === JSON.stringify(scoped.presentation);

  return {
    evaluationBarIndex,
    full: snapshotCounts(
      full.analysis,
      full.diagnostics,
      full.presentation,
      fullScenarios.scenarios.length
    ),
    scoped: snapshotCounts(
      scoped.analysis,
      scoped.diagnostics,
      scoped.presentation,
      scopedScenario.scenarioCount
    ),
    prefixInvariant,
    parityAtLastClosedBar,
  };
}

export function evaluationScopedOpenLegVerdict(
  scoped: EvaluationScopedWaveAnalysis
): "OPEN_LEG_REPRESENTABLE_WITH_SCOPED_ENGINE" | "NEEDS_OPEN_LEG_ABSTRACTION" {
  if (scoped.status !== "OK" || !scoped.presentation) {
    return "NEEDS_OPEN_LEG_ABSTRACTION";
  }
  const bar = scoped.evaluationBarIndex;
  const hasOpenSpan = scoped.presentation.engine.flatWaves.some(
    (w) => w.startIndex <= bar && w.endIndex > bar
  );
  return hasOpenSpan
    ? "OPEN_LEG_REPRESENTABLE_WITH_SCOPED_ENGINE"
    : "NEEDS_OPEN_LEG_ABSTRACTION";
}
