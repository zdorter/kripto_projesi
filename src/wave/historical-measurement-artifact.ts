import type { Candle, WaveEngineOptions } from "./types";
import { buildHistoricalCandidateMeasurementsAtEvaluationBar } from "./historical-candidate-cohort";
import {
  validateHistoricalProductionWalkForwardRange,
  type HistoricalWalkForwardRangeError,
} from "./historical-production-walk-forward";
import {
  HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
  buildHistoricalMeasurementSnapshotId,
  isHistoricalMeasurementCohort,
  type HistoricalMeasurementCohort,
} from "./setup/historical-measurement-contract";
import type {
  HistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactDataset,
  HistoricalMeasurementArtifactEntry,
} from "./setup/historical-measurement-artifact-types";
import type { HistoricalCandidateMeasurementBundle } from "./setup/historical-measurement-types";

export const HISTORICAL_MEASUREMENT_ARTIFACT_DEFAULT_OUTPUT_DIR =
  "historical-measurement-output";

export class HistoricalMeasurementArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalMeasurementArtifactValidationError";
  }
}

export interface BuildHistoricalMeasurementArtifactInput {
  symbol: string;
  timeframeId: string;
  candles: Candle[];
  startEvaluationBar: number;
  endEvaluationBar: number;
  horizonBars?: number;
  engineOptions?: WaveEngineOptions;
}

export function historicalMeasurementArtifactEntryFromBundle(
  bundle: HistoricalCandidateMeasurementBundle
): HistoricalMeasurementArtifactEntry {
  const m = bundle.measurement;
  return {
    schemaVersion: m.schemaVersion,
    snapshotId: m.snapshotId,
    symbol: m.symbol,
    timeframe: m.timeframe,
    evaluationBarIndex: m.evaluationBarIndex,
    evaluationBarTime: m.evaluationBarTime,
    prospectiveSetupId: m.prospectiveSetupId,
    horizonBars: m.horizonBars,
    cohorts: [...bundle.cohorts],
    cohort: m.cohort,
    evaluation: m.evaluation,
    outcome: m.outcome,
  };
}

export function compareHistoricalMeasurementArtifactEntryOrder(
  a: HistoricalMeasurementArtifactEntry,
  b: HistoricalMeasurementArtifactEntry
): number {
  if (a.evaluationBarIndex !== b.evaluationBarIndex) {
    return a.evaluationBarIndex - b.evaluationBarIndex;
  }
  if (a.prospectiveSetupId !== b.prospectiveSetupId) {
    return a.prospectiveSetupId < b.prospectiveSetupId ? -1 : 1;
  }
  if (a.symbol !== b.symbol) {
    return a.symbol < b.symbol ? -1 : 1;
  }
  if (a.timeframe !== b.timeframe) {
    return a.timeframe < b.timeframe ? -1 : 1;
  }
  return 0;
}

export function sortHistoricalMeasurementArtifactEntries(
  entries: HistoricalMeasurementArtifactEntry[]
): HistoricalMeasurementArtifactEntry[] {
  return [...entries].sort(compareHistoricalMeasurementArtifactEntryOrder);
}

function buildDatasetDescriptor(input: {
  symbol: string;
  timeframeId: string;
  candleCount: number;
  horizonBars: number;
  start: number | null;
  end: number | null;
  rangeError: HistoricalWalkForwardRangeError | null;
}): HistoricalMeasurementArtifactDataset {
  return {
    symbol: input.symbol,
    timeframe: input.timeframeId,
    candleCount: input.candleCount,
    startEvaluationBar: input.start,
    endEvaluationBar: input.end,
    horizonBars: input.horizonBars,
    rangeError: input.rangeError,
  };
}

/**
 * Walk-forward @ E × candidate expansion (B-8e) → measurement + outcome (B-8d), no recompute on serialize.
 */
export function buildHistoricalMeasurementArtifact(
  input: BuildHistoricalMeasurementArtifactInput
): HistoricalMeasurementArtifact {
  const horizonBars =
    input.horizonBars ?? HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS;

  const validated = validateHistoricalProductionWalkForwardRange(
    input.candles,
    input.startEvaluationBar,
    input.endEvaluationBar
  );

  if (!validated.ok) {
    return {
      schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
      dataset: buildDatasetDescriptor({
        symbol: input.symbol,
        timeframeId: input.timeframeId,
        candleCount: input.candles.length,
        horizonBars,
        start: null,
        end: null,
        rangeError: validated.error,
      }),
      measurements: [],
    };
  }

  const measurements: HistoricalMeasurementArtifactEntry[] = [];
  for (let e = validated.start; e <= validated.end; e++) {
    const bundles = buildHistoricalCandidateMeasurementsAtEvaluationBar({
      symbol: input.symbol,
      candles: input.candles,
      timeframeId: input.timeframeId,
      engineOptions: input.engineOptions,
      evaluationBarIndex: e,
      horizonBars,
    });
    for (const bundle of bundles) {
      measurements.push(historicalMeasurementArtifactEntryFromBundle(bundle));
    }
  }

  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    dataset: buildDatasetDescriptor({
      symbol: input.symbol,
      timeframeId: input.timeframeId,
      candleCount: input.candles.length,
      horizonBars,
      start: validated.start,
      end: validated.end,
      rangeError: null,
    }),
    measurements: sortHistoricalMeasurementArtifactEntries(measurements),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new HistoricalMeasurementArtifactValidationError(
        "Non-finite number cannot be serialized"
      );
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === undefined) {
        continue;
      }
      out[key] = stableJsonValue(v);
    }
    return out;
  }
  throw new HistoricalMeasurementArtifactValidationError(
    "Unsupported JSON value type in artifact"
  );
}

export function serializeHistoricalMeasurementArtifact(
  artifact: HistoricalMeasurementArtifact,
  pretty = true
): string {
  const normalized: HistoricalMeasurementArtifact = {
    schemaVersion: artifact.schemaVersion,
    dataset: artifact.dataset,
    measurements: sortHistoricalMeasurementArtifactEntries([
      ...artifact.measurements,
    ]),
  };
  const jsonReady = stableJsonValue(normalized);
  return pretty
    ? `${JSON.stringify(jsonReady, null, 2)}\n`
    : `${JSON.stringify(jsonReady)}\n`;
}

function assertStringField(
  obj: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: ${label} must be a non-empty string`
    );
  }
  return value;
}

function assertNumberField(
  obj: Record<string, unknown>,
  key: string,
  label: string
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: ${label} must be a finite number`
    );
  }
  return value;
}

function validateArtifactEntry(
  raw: unknown,
  index: number
): HistoricalMeasurementArtifactEntry {
  if (!isPlainObject(raw)) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}] must be an object`
    );
  }
  const schemaVersion = assertStringField(
    raw,
    "schemaVersion",
    `measurements[${index}].schemaVersion`
  );
  if (schemaVersion !== HISTORICAL_MEASUREMENT_SCHEMA_VERSION) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].schemaVersion must be ${HISTORICAL_MEASUREMENT_SCHEMA_VERSION}`
    );
  }

  const symbol = assertStringField(raw, "symbol", `measurements[${index}].symbol`);
  const timeframe = assertStringField(
    raw,
    "timeframe",
    `measurements[${index}].timeframe`
  );
  const prospectiveSetupId = assertStringField(
    raw,
    "prospectiveSetupId",
    `measurements[${index}].prospectiveSetupId`
  );
  const evaluationBarIndex = assertNumberField(
    raw,
    "evaluationBarIndex",
    `measurements[${index}].evaluationBarIndex`
  );
  const snapshotId = assertStringField(
    raw,
    "snapshotId",
    `measurements[${index}].snapshotId`
  );
  const expectedSnapshotId = buildHistoricalMeasurementSnapshotId({
    symbol,
    timeframe,
    evaluationBarIndex,
    prospectiveSetupId,
  });
  if (snapshotId !== expectedSnapshotId) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].snapshotId does not match canonical identity`
    );
  }

  const cohortsRaw = raw.cohorts;
  if (!Array.isArray(cohortsRaw) || cohortsRaw.length === 0) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].cohorts must be a non-empty array`
    );
  }
  const cohorts: HistoricalMeasurementCohort[] = [];
  for (const c of cohortsRaw) {
    if (!isHistoricalMeasurementCohort(c)) {
      throw new HistoricalMeasurementArtifactValidationError(
        `Invalid artifact: measurements[${index}].cohorts contains unknown cohort`
      );
    }
    cohorts.push(c);
  }

  const cohort = raw.cohort;
  if (!isHistoricalMeasurementCohort(cohort)) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].cohort must be a known cohort`
    );
  }

  if (!isPlainObject(raw.evaluation)) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].evaluation required`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "outcome")) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: measurements[${index}].outcome field required`
    );
  }

  const horizonBars = assertNumberField(
    raw,
    "horizonBars",
    `measurements[${index}].horizonBars`
  );

  const evaluationBarTime =
    raw.evaluationBarTime === null
      ? null
      : typeof raw.evaluationBarTime === "number" &&
          Number.isFinite(raw.evaluationBarTime)
        ? raw.evaluationBarTime
        : (() => {
            throw new HistoricalMeasurementArtifactValidationError(
              `Invalid artifact: measurements[${index}].evaluationBarTime`
            );
          })();

  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    snapshotId,
    symbol,
    timeframe,
    evaluationBarIndex,
    evaluationBarTime,
    prospectiveSetupId,
    horizonBars,
    cohorts,
    cohort,
    evaluation: raw.evaluation as unknown as HistoricalMeasurementArtifactEntry["evaluation"],
    outcome: raw.outcome as unknown as HistoricalMeasurementArtifactEntry["outcome"],
  };
}

export function validateHistoricalMeasurementArtifact(
  value: unknown
): HistoricalMeasurementArtifact {
  if (!isPlainObject(value)) {
    throw new HistoricalMeasurementArtifactValidationError(
      "Invalid artifact: root must be an object"
    );
  }
  const schemaVersion = assertStringField(value, "schemaVersion", "schemaVersion");
  if (schemaVersion !== HISTORICAL_MEASUREMENT_SCHEMA_VERSION) {
    throw new HistoricalMeasurementArtifactValidationError(
      `Invalid artifact: schemaVersion must be ${HISTORICAL_MEASUREMENT_SCHEMA_VERSION}`
    );
  }
  if (!isPlainObject(value.dataset)) {
    throw new HistoricalMeasurementArtifactValidationError(
      "Invalid artifact: dataset must be an object"
    );
  }
  const measurementsRaw = value.measurements;
  if (!Array.isArray(measurementsRaw)) {
    throw new HistoricalMeasurementArtifactValidationError(
      "Invalid artifact: measurements must be an array"
    );
  }
  const measurements = measurementsRaw.map((entry, index) =>
    validateArtifactEntry(entry, index)
  );
  const dataset = value.dataset;
  return {
    schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
    dataset: {
      symbol: assertStringField(dataset, "symbol", "dataset.symbol"),
      timeframe: assertStringField(dataset, "timeframe", "dataset.timeframe"),
      candleCount: assertNumberField(dataset, "candleCount", "dataset.candleCount"),
      startEvaluationBar:
        dataset.startEvaluationBar === null
          ? null
          : assertNumberField(
              dataset,
              "startEvaluationBar",
              "dataset.startEvaluationBar"
            ),
      endEvaluationBar:
        dataset.endEvaluationBar === null
          ? null
          : assertNumberField(
              dataset,
              "endEvaluationBar",
              "dataset.endEvaluationBar"
            ),
      horizonBars: assertNumberField(dataset, "horizonBars", "dataset.horizonBars"),
      rangeError:
        dataset.rangeError === null
          ? null
          : typeof dataset.rangeError === "string"
            ? (dataset.rangeError as HistoricalWalkForwardRangeError)
            : (() => {
                throw new HistoricalMeasurementArtifactValidationError(
                  "Invalid artifact: dataset.rangeError"
                );
              })(),
    },
    measurements: sortHistoricalMeasurementArtifactEntries(measurements),
  };
}

export function parseHistoricalMeasurementArtifact(
  json: string
): HistoricalMeasurementArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HistoricalMeasurementArtifactValidationError(
      "Invalid artifact: JSON parse failed"
    );
  }
  return validateHistoricalMeasurementArtifact(parsed);
}

export function historicalMeasurementArtifactsEquivalent(
  a: HistoricalMeasurementArtifact,
  b: HistoricalMeasurementArtifact
): boolean {
  return (
    serializeHistoricalMeasurementArtifact(a, false) ===
    serializeHistoricalMeasurementArtifact(b, false)
  );
}
