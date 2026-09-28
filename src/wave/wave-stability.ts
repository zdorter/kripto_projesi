import {
  CALIBRATION_SWING_WINDOW_PRESETS,
  runSwingCalibration,
  type SwingCalibrationReport,
  type SwingWindowPreset,
} from "./swing-calibration";
import type { Candle, WaveCandidate, WaveLabel, WaveStatus } from "./types";

export const WAVE_STABILITY_LABELS: WaveLabel[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "A",
  "B",
  "C",
];

export interface StabilityConfigRef {
  id: string;
  label: string;
}

export interface WaveConfigSnapshot {
  configId: string;
  configLabel: string;
  present: boolean;
  status?: WaveStatus;
  confidence?: number;
  startIndex?: number;
  endIndex?: number;
  startPrice?: number;
  endPrice?: number;
  segmentLength?: number;
}

export interface WavePairwiseOverlap {
  wave: WaveLabel;
  configAId: string;
  configALabel: string;
  configBId: string;
  configBLabel: string;
  indexOverlapRatio: number;
  priceOverlapRatio: number;
}

export interface WavePersistenceSummary {
  wave: WaveLabel;
  presenceCount: number;
  presenceRatio: number;
  configsPresent: string[];
  configsMissing: string[];
  /** Mean confidence where wave exists; informational only. */
  averageConfidence: number | null;
  /** Mean pairwise index overlap (Jaccard on bar indices), when ≥2 configs present. */
  meanIndexOverlap: number | null;
  /** Mean pairwise price-range overlap on segment highs/lows, when ≥2 configs present. */
  meanPriceOverlap: number | null;
}

export interface WavePersistenceRow {
  wave: WaveLabel;
  matrix: Record<string, boolean>;
  snapshots: WaveConfigSnapshot[];
  summary: WavePersistenceSummary;
}

export interface WaveStabilityReport {
  candleCount: number;
  configs: StabilityConfigRef[];
  persistenceMatrix: { wave: WaveLabel; byConfigId: Record<string, boolean> }[];
  waves: WavePersistenceRow[];
  pairwise: WavePairwiseOverlap[];
  summary: WavePersistenceSummary[];
}

function candleSegmentRange(
  candles: Candle[],
  startIndex: number,
  endIndex: number
): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!c) {
      continue;
    }
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
  }
  if (!Number.isFinite(low)) {
    return { low: 0, high: 0 };
  }
  return { low, high };
}

function endpointPrices(
  candles: Candle[],
  startIndex: number,
  endIndex: number
): { startPrice: number; endPrice: number } {
  const startC = candles[startIndex];
  const endC = candles[endIndex];
  return {
    startPrice: startC?.close ?? 0,
    endPrice: endC?.close ?? 0,
  };
}

/**
 * Jaccard overlap on inclusive bar index ranges.
 * intersectionLength / unionLength
 */
export function indexOverlapRatio(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  const intersectionStart = Math.max(aStart, bStart);
  const intersectionEnd = Math.min(aEnd, bEnd);
  const intersection =
    intersectionEnd >= intersectionStart
      ? intersectionEnd - intersectionStart + 1
      : 0;
  const unionStart = Math.min(aStart, bStart);
  const unionEnd = Math.max(aEnd, bEnd);
  const union = unionEnd - unionStart + 1;
  return union > 0 ? intersection / union : 0;
}

/**
 * Jaccard overlap on candle high/low envelope over each index span.
 */
export function priceRangeOverlapRatio(
  candles: Candle[],
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  const a = candleSegmentRange(candles, aStart, aEnd);
  const b = candleSegmentRange(candles, bStart, bEnd);
  const intersectionLow = Math.max(a.low, b.low);
  const intersectionHigh = Math.min(a.high, b.high);
  const intersection = Math.max(0, intersectionHigh - intersectionLow);
  const unionLow = Math.min(a.low, b.low);
  const unionHigh = Math.max(a.high, b.high);
  const union = unionHigh - unionLow;
  return union > 0 ? intersection / union : 0;
}

function waveByLabel(
  waves: WaveCandidate[],
  label: WaveLabel
): WaveCandidate | undefined {
  return waves.find((w) => w.label === label);
}

function snapshotForConfig(
  candles: Candle[],
  configId: string,
  configLabel: string,
  wave: WaveCandidate | undefined
): WaveConfigSnapshot {
  if (!wave) {
    return { configId, configLabel, present: false };
  }
  const { startPrice, endPrice } = endpointPrices(
    candles,
    wave.startIndex,
    wave.endIndex
  );
  return {
    configId,
    configLabel,
    present: true,
    status: wave.status,
    confidence: wave.confidence,
    startIndex: wave.startIndex,
    endIndex: wave.endIndex,
    startPrice,
    endPrice,
    segmentLength: wave.endIndex - wave.startIndex + 1,
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildWaveStabilityFromCalibration(
  report: SwingCalibrationReport,
  candles: Candle[]
): WaveStabilityReport {
  const configs: StabilityConfigRef[] = report.presets.map((p) => ({
    id: p.id,
    label: p.label,
  }));
  const configCount = configs.length;

  const pairwise: WavePairwiseOverlap[] = [];
  const waves: WavePersistenceRow[] = [];
  const summaryList: WavePersistenceSummary[] = [];

  for (const label of WAVE_STABILITY_LABELS) {
    const byConfigId: Record<string, boolean> = {};
    const snapshots: WaveConfigSnapshot[] = [];

    for (const preset of report.presets) {
      const detail = report.detailsByConfigId[preset.id];
      const wave = waveByLabel(detail.engineWaves, label);
      byConfigId[preset.id] = wave !== undefined;
      snapshots.push(
        snapshotForConfig(candles, preset.id, preset.label, wave)
      );
    }

    const presentConfigs = configs.filter((c) => byConfigId[c.id]);
    const missingConfigs = configs.filter((c) => !byConfigId[c.id]);
    const presenceCount = presentConfigs.length;
    const presenceRatio = configCount > 0 ? presenceCount / configCount : 0;

    const confidences = snapshots
      .filter((s) => s.present && s.confidence !== undefined)
      .map((s) => s.confidence as number);

    const presentSnapshots = snapshots.filter((s) => s.present);

    for (let i = 0; i < presentSnapshots.length; i++) {
      for (let j = i + 1; j < presentSnapshots.length; j++) {
        const a = presentSnapshots[i];
        const b = presentSnapshots[j];
        if (
          a.startIndex === undefined ||
          a.endIndex === undefined ||
          b.startIndex === undefined ||
          b.endIndex === undefined
        ) {
          continue;
        }
        pairwise.push({
          wave: label,
          configAId: a.configId,
          configALabel: a.configLabel,
          configBId: b.configId,
          configBLabel: b.configLabel,
          indexOverlapRatio: indexOverlapRatio(
            a.startIndex,
            a.endIndex,
            b.startIndex,
            b.endIndex
          ),
          priceOverlapRatio: priceRangeOverlapRatio(
            candles,
            a.startIndex,
            a.endIndex,
            b.startIndex,
            b.endIndex
          ),
        });
      }
    }

    const indexOverlaps = pairwise
      .filter((p) => p.wave === label)
      .map((p) => p.indexOverlapRatio);
    const priceOverlaps = pairwise
      .filter((p) => p.wave === label)
      .map((p) => p.priceOverlapRatio);

    const waveSummary: WavePersistenceSummary = {
      wave: label,
      presenceCount,
      presenceRatio,
      configsPresent: presentConfigs.map((c) => c.label),
      configsMissing: missingConfigs.map((c) => c.label),
      averageConfidence: mean(confidences),
      meanIndexOverlap: mean(indexOverlaps),
      meanPriceOverlap: mean(priceOverlaps),
    };

    summaryList.push(waveSummary);
    waves.push({
      wave: label,
      matrix: byConfigId,
      snapshots,
      summary: waveSummary,
    });
  }

  const persistenceMatrix = waves.map((w) => ({
    wave: w.wave,
    byConfigId: w.matrix,
  }));

  return {
    candleCount: report.candleCount,
    configs,
    persistenceMatrix,
    waves,
    pairwise,
    summary: summaryList,
  };
}

export function runWaveStability(
  candles: Candle[],
  presets: SwingWindowPreset[] = CALIBRATION_SWING_WINDOW_PRESETS
): WaveStabilityReport {
  const calibration = runSwingCalibration(candles, presets);
  return buildWaveStabilityFromCalibration(calibration, candles);
}
