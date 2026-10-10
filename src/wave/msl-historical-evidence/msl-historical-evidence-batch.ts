import { computeMslHistoricalForwardObservations } from "./msl-historical-evidence-price";
import { buildMslHistoricalEvidencePhaseBObservations } from "./msl-historical-evidence-phase-b";
import type {
  BuildMslHistoricalEvidenceAtEvaluationInput,
  MslHistoricalEvidencePrimaryDisclosureRef,
  MslHistoricalEvidenceRecordV1,
  MslHistoricalEvidenceSampleStatus,
  MslHistoricalEvidenceStrictEventRef,
  WalkMslHistoricalEvidenceBatchInput,
} from "./msl-historical-evidence-types";
import { MSL_HISTORICAL_EVIDENCE_SCHEMA_VERSION } from "./msl-historical-evidence-types";

function sampleStatus(
  sufficientHorizon: boolean,
  hasPrimaryEvent: boolean
): MslHistoricalEvidenceSampleStatus {
  if (!sufficientHorizon) {
    return "INSUFFICIENT_HORIZON";
  }
  if (!hasPrimaryEvent) {
    return "NO_EVENT";
  }
  return "SUFFICIENT_HORIZON";
}

type RecordBase = Omit<
  MslHistoricalEvidenceRecordV1,
  "measurementMode" | "eventFamily" | "eventId" | "eventDirection" | "knownAtBarIndex" | "knownAtTimestamp"
>;

function baseRecordFields(input: {
  datasetId: string;
  datasetChecksum: string;
  symbol: string;
  timeframe: string;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  observationHorizonBars: number;
  sampleStatus: MslHistoricalEvidenceSampleStatus;
  forward: ReturnType<typeof computeMslHistoricalForwardObservations>["forward"];
  phaseB: ReturnType<typeof buildMslHistoricalEvidencePhaseBObservations>;
}): RecordBase {
  return {
    schemaVersion: MSL_HISTORICAL_EVIDENCE_SCHEMA_VERSION,
    datasetId: input.datasetId,
    datasetChecksum: input.datasetChecksum,
    symbol: input.symbol,
    timeframe: input.timeframe,
    evaluationBarIndex: input.evaluationBarIndex,
    evaluationTimestamp: input.evaluationTimestamp,
    observationHorizonBars: input.observationHorizonBars,
    sampleStatus: input.sampleStatus,
    forwardObservations: input.forward,
    structureObservations: input.phaseB.structureObservations,
    liquidityObservations: input.phaseB.liquidityObservations,
    mssObservations: input.phaseB.mssObservations,
    limitations: input.phaseB.limitations,
    unresolved: input.phaseB.unresolved,
    disclosureObservations: input.phaseB.disclosureObservations,
    subsequentStructureEvents: input.phaseB.subsequentStructureEvents,
    subsequentLiquidityEvents: input.phaseB.subsequentLiquidityEvents,
    subsequentMssEvents: input.phaseB.subsequentMssEvents,
    firstSubsequentEvent: input.phaseB.firstSubsequentEvent,
  };
}

function recordFromStrictEvent(base: RecordBase, ev: MslHistoricalEvidenceStrictEventRef): MslHistoricalEvidenceRecordV1 {
  return {
    ...base,
    measurementMode: "STRICT_AT_E",
    eventFamily: ev.eventFamily,
    eventId: ev.eventId,
    eventDirection: ev.eventDirection,
    knownAtBarIndex: ev.knownAtBarIndex,
    knownAtTimestamp: ev.knownAtTimestamp,
  };
}

function recordFromDisclosureEvent(
  base: RecordBase,
  ref: MslHistoricalEvidencePrimaryDisclosureRef
): MslHistoricalEvidenceRecordV1 {
  return {
    ...base,
    measurementMode: "DISCLOSURE_HORIZON",
    eventFamily: ref.eventFamily,
    eventId: ref.eventId,
    eventDirection: ref.eventDirection,
    knownAtBarIndex: ref.knownAtBarIndex,
    knownAtTimestamp: ref.knownAtTimestamp,
  };
}

function observationOnlyRecord(base: RecordBase): MslHistoricalEvidenceRecordV1 {
  return {
    ...base,
    measurementMode: "OBSERVATION_ONLY",
    eventFamily: "NONE",
    eventId: null,
    eventDirection: null,
    knownAtBarIndex: null,
    knownAtTimestamp: null,
  };
}

export function buildMslHistoricalEvidenceAtEvaluation(
  input: BuildMslHistoricalEvidenceAtEvaluationInput
): MslHistoricalEvidenceRecordV1[] {
  const E = input.evaluationBarIndex;
  const H = input.observationHorizonBars;

  const phaseB = buildMslHistoricalEvidencePhaseBObservations({
    candles: input.candles,
    evaluationBarIndex: E,
    observationHorizonBars: H,
    evaluationTimestamp: input.candles[E]!.time,
    swingConfig: input.swingConfig,
    timeframeId: input.timeframe,
    htfCandles: input.htfCandles,
    htfTimeframeId: input.htfTimeframeId,
  });

  const { forward, sufficientHorizon } = computeMslHistoricalForwardObservations({
    candles: input.candles,
    evaluationBarIndex: E,
    observationHorizonBars: H,
  });

  const hasPrimary =
    phaseB.strictEventRecords.length > 0 || phaseB.disclosurePrimaryRefs.length > 0;

  const status = sampleStatus(sufficientHorizon, hasPrimary);

  const base = baseRecordFields({
    datasetId: input.datasetId,
    datasetChecksum: input.datasetChecksum,
    symbol: input.symbol,
    timeframe: input.timeframe,
    evaluationBarIndex: E,
    evaluationTimestamp: phaseB.evaluationTimestamp,
    observationHorizonBars: H,
    sampleStatus: status,
    forward,
    phaseB,
  });

  const records: MslHistoricalEvidenceRecordV1[] = [];

  for (const ev of phaseB.strictEventRecords) {
    records.push(recordFromStrictEvent(base, ev));
  }
  for (const ref of phaseB.disclosurePrimaryRefs) {
    records.push(recordFromDisclosureEvent(base, ref));
  }

  if (records.length === 0) {
    return [observationOnlyRecord(base)];
  }

  return records;
}

export function walkMslHistoricalEvidenceBatch(
  input: WalkMslHistoricalEvidenceBatchInput
): MslHistoricalEvidenceRecordV1[] {
  const out: MslHistoricalEvidenceRecordV1[] = [];
  const horizons = [...input.observationHorizonBars].sort((a, b) => a - b);
  const indices = [...input.evaluationBarIndices].sort((a, b) => a - b);

  for (const E of indices) {
    for (const H of horizons) {
      out.push(
        ...buildMslHistoricalEvidenceAtEvaluation({
          candles: input.candles,
          evaluationBarIndex: E,
          observationHorizonBars: H,
          symbol: input.symbol,
          timeframe: input.timeframe,
          datasetId: input.datasetId,
          datasetChecksum: input.datasetChecksum,
          swingConfig: input.swingConfig,
          htfCandles: input.htfCandles,
          htfTimeframeId: input.htfTimeframeId,
        })
      );
    }
  }

  return sortMslHistoricalEvidenceRecords(out);
}

export function sortMslHistoricalEvidenceRecords(
  records: readonly MslHistoricalEvidenceRecordV1[]
): MslHistoricalEvidenceRecordV1[] {
  return [...records].sort((a, b) => {
    if (a.evaluationBarIndex !== b.evaluationBarIndex) {
      return a.evaluationBarIndex - b.evaluationBarIndex;
    }
    const modeOrder = (m: MslHistoricalEvidenceRecordV1["measurementMode"]) => {
      if (m === "STRICT_AT_E") {
        return 0;
      }
      if (m === "DISCLOSURE_HORIZON") {
        return 1;
      }
      return 2;
    };
    if (modeOrder(a.measurementMode) !== modeOrder(b.measurementMode)) {
      return modeOrder(a.measurementMode) - modeOrder(b.measurementMode);
    }
    const aId = a.eventId ?? "";
    const bId = b.eventId ?? "";
    if (aId !== bId) {
      return aId.localeCompare(bId);
    }
    if (a.observationHorizonBars !== b.observationHorizonBars) {
      return a.observationHorizonBars - b.observationHorizonBars;
    }
    return a.eventFamily.localeCompare(b.eventFamily);
  });
}
