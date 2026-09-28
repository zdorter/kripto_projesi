import { analyzeWaveWithDiagnostics } from "./analysis-pipeline";
import type { FocusView } from "./presentation-state";
import type { FibonacciDiagnostic } from "./wave-diagnostics";
import type { WaveDiagnostics } from "./wave-diagnostics";
import {
  Candle,
  MarketStructure,
  SwingConfig,
  TrendDirection,
  WaveCandidate,
  WaveEngineOptions,
  WaveLabel,
} from "./types";
import { DEFAULT_SWING_CONFIG } from "./types";
import type { SwingDiagnosticRow } from "./wave-diagnostics";

export interface SwingWindowPreset {
  id: string;
  label: string;
  leftBars: number;
  rightBars: number;
}

export const CALIBRATION_SWING_WINDOW_PRESETS: SwingWindowPreset[] = [
  { id: "3-3", label: "3/3", leftBars: 3, rightBars: 3 },
  { id: "5-5", label: "5/5", leftBars: 5, rightBars: 5 },
  { id: "7-7", label: "7/7", leftBars: 7, rightBars: 7 },
  { id: "10-10", label: "10/10", leftBars: 10, rightBars: 10 },
];

export interface CalibrationWaveRow {
  label: WaveLabel;
  status: WaveCandidate["status"];
  confidence: number;
}

export interface CalibrationLeadingWave {
  label: WaveLabel;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
}

export interface SwingCalibrationSummary {
  configId: string;
  configLabel: string;
  swingConfig: SwingConfig;
  confirmedSwingCount: number;
  marketTrend: TrendDirection;
  primaryDisplay: string;
  alternativeDisplay: string;
  ruleConformanceScore: number;
  overlapCount: number;
  fibonacci: FibonacciDiagnostic;
  leadingWave: CalibrationLeadingWave | null;
}

export interface SwingCalibrationDetail extends SwingCalibrationSummary {
  lastTenConfirmedSwings: SwingDiagnosticRow[];
  structureLabels: MarketStructure[];
  impulseWaves: CalibrationWaveRow[];
  correctiveWaves: CalibrationWaveRow[];
  primary: FocusView | null;
  alternative: FocusView | null;
  /** Flat engine wave list for this config (unchanged detection). */
  engineWaves: WaveCandidate[];
  diagnostics: WaveDiagnostics;
}

export interface SwingCalibrationReport {
  candleCount: number;
  presets: SwingWindowPreset[];
  summaries: SwingCalibrationSummary[];
  detailsByConfigId: Record<string, SwingCalibrationDetail>;
}

const IMPULSE: WaveLabel[] = ["1", "2", "3", "4", "5"];
const CORRECTIVE: WaveLabel[] = ["A", "B", "C"];

function optionsForPreset(preset: SwingWindowPreset): WaveEngineOptions {
  return {
    swing: {
      leftBars: preset.leftBars,
      rightBars: preset.rightBars,
      atrPeriod: DEFAULT_SWING_CONFIG.atrPeriod,
      minAtrMultiplier: DEFAULT_SWING_CONFIG.minAtrMultiplier,
    },
  };
}

function focusDisplay(focus: FocusView | null): string {
  if (!focus) {
    return "—";
  }
  return `${focus.structure} ${focus.wave}`;
}

function waveRows(
  waves: WaveCandidate[],
  labels: WaveLabel[]
): CalibrationWaveRow[] {
  return labels
    .map((label) => waves.find((w) => w.label === label))
    .filter((w): w is WaveCandidate => w !== undefined)
    .map((w) => ({
      label: w.label,
      status: w.status,
      confidence: w.confidence,
    }));
}

function leadingFromDiagnostics(diagnostics: WaveDiagnostics): CalibrationLeadingWave | null {
  const focus = diagnostics.focus.primary;
  if (!focus) {
    return null;
  }
  return {
    label: focus.wave,
    startIndex: focus.startIndex,
    endIndex: focus.endIndex,
    startPrice: focus.startPrice,
    endPrice: focus.endPrice,
  };
}

export function runSwingCalibration(
  candles: Candle[],
  presets: SwingWindowPreset[] = CALIBRATION_SWING_WINDOW_PRESETS
): SwingCalibrationReport {
  const summaries: SwingCalibrationSummary[] = [];
  const detailsByConfigId: Record<string, SwingCalibrationDetail> = {};

  for (const preset of presets) {
    const options = optionsForPreset(preset);
    const { analysis, presentation, diagnostics } = analyzeWaveWithDiagnostics(
      candles,
      options
    );

    const impulseWaves = waveRows(analysis.waves, IMPULSE);
    const correctiveWaves = waveRows(analysis.waves, CORRECTIVE);
    const lastTen = diagnostics.confirmedSwings.slice(-10);
    const structureLabels = diagnostics.structurePairs.map((p) => p.structure);

    const detail: SwingCalibrationDetail = {
      configId: preset.id,
      configLabel: preset.label,
      swingConfig: diagnostics.swingConfig,
      confirmedSwingCount: diagnostics.confirmedSwingCount,
      marketTrend: diagnostics.trendSource.marketTrend,
      primaryDisplay: focusDisplay(presentation.primary),
      alternativeDisplay: focusDisplay(presentation.alternative),
      ruleConformanceScore: presentation.ruleConformanceScore,
      overlapCount: presentation.overlaps.length,
      fibonacci: diagnostics.fibonacci,
      leadingWave: leadingFromDiagnostics(diagnostics),
      lastTenConfirmedSwings: lastTen,
      structureLabels,
      impulseWaves,
      correctiveWaves,
      primary: presentation.primary,
      alternative: presentation.alternative,
      engineWaves: analysis.waves,
      diagnostics,
    };

    detailsByConfigId[preset.id] = detail;
    summaries.push(detail);
  }

  return {
    candleCount: candles.length,
    presets,
    summaries,
    detailsByConfigId,
  };
}
