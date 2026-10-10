import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";
import { buildMslHistoricalResearchBatchReport } from "./msl-historical-research-pipeline-batch";
import {
  defaultMinEvaluationBarIndex,
  researchDatasetId,
} from "./msl-historical-research-pipeline-dataset";
import type { HistoricalResearchDataset } from "./msl-historical-research-pipeline-types";
import type {
  MslHistoricalResearchFutureSpikeAuditResult,
  MslHistoricalResearchLeakageAuditResult,
} from "./msl-historical-research-audit-types";
import type { Candle } from "../types";

function flatCandles(count: number, price: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: i * ONE_H,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1,
  }));
}

const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };
const ONE_H = 3_600_000;

function strictFingerprint(
  records: ReturnType<typeof buildMslHistoricalResearchBatchReport>["evidenceRecords"]
) {
  return records
    .filter((r) => r.measurementMode === "STRICT_AT_E")
    .map((r) => ({
      eventId: r.eventId,
      eventFamily: r.eventFamily,
      knownAtBarIndex: r.knownAtBarIndex,
    }))
    .sort((a, b) => (a.eventId ?? "").localeCompare(b.eventId ?? ""));
}

export function runMsl14LeakageAudit(input: {
  dataset: HistoricalResearchDataset;
  representativeEvaluationBarIndices: readonly number[];
  observationHorizonBars: readonly number[];
}): MslHistoricalResearchLeakageAuditResult {
  const { dataset, representativeEvaluationBarIndices, observationHorizonBars } = input;
  let strictOk = true;
  let knownAtOk = true;

  for (const E of representativeEvaluationBarIndices) {
    if (E > dataset.lastEvaluationBar || E < dataset.firstEvaluationBar) {
      continue;
    }
    const base = dataset.candles.slice(0, E + 50);
    const dsBase: HistoricalResearchDataset = {
      ...dataset,
      candles: base,
      lastEvaluationBar: base.length - 1,
    };
    const extended = [
      ...base,
      ...dataset.candles.slice(base.length, Math.min(base.length + 30, dataset.candles.length)),
    ];
    const dsExt: HistoricalResearchDataset = {
      ...dataset,
      candles: extended,
      lastEvaluationBar: extended.length - 1,
    };
    const before = buildMslHistoricalResearchBatchReport({
      datasets: [dsBase],
      evaluationIndices: [E],
      observationHorizonBars,
      swingConfig: SWING,
    });
    const after = buildMslHistoricalResearchBatchReport({
      datasets: [dsExt],
      evaluationIndices: [E],
      observationHorizonBars,
      swingConfig: SWING,
    });
    const s1 = strictFingerprint(before.evidenceRecords);
    const s2 = strictFingerprint(after.evidenceRecords);
    if (JSON.stringify(s1) !== JSON.stringify(s2)) {
      strictOk = false;
    }
    const k1 = before.evidenceRecords.map((r) => ({
      mode: r.measurementMode,
      knownAt: r.knownAtBarIndex,
    }));
    const k2 = after.evidenceRecords.map((r) => ({
      mode: r.measurementMode,
      knownAt: r.knownAtBarIndex,
    }));
    if (JSON.stringify(k1) !== JSON.stringify(k2)) {
      knownAtOk = false;
    }
  }

  return {
    representativeEvaluationBarIndices: [...representativeEvaluationBarIndices].sort(
      (a, b) => a - b
    ),
    strictMembershipUnchanged: strictOk,
    knownAtClassificationUnchanged: knownAtOk,
    passed: strictOk && knownAtOk,
  };
}

export function runMsl14FutureSpikeAudit(): MslHistoricalResearchFutureSpikeAuditResult {
  const base = flatCandles(80, 100);
  for (let i = 0; i < base.length; i++) {
    base[i]!.time = i * ONE_H;
  }
  const E = 40;
  const ds: HistoricalResearchDataset = {
    datasetId: researchDatasetId("TEST", "1H"),
    symbol: "TEST",
    timeframe: "1H",
    datasetChecksum: "synthetic",
    source: "synthetic",
    closedCandleOnly: true,
    barDurationMs: ONE_H,
    fixturePath: "",
    candles: base,
    status: "COMPLETE",
    firstEvaluationBar: defaultMinEvaluationBarIndex(),
    lastEvaluationBar: base.length - 1,
  };
  const before = buildMslHistoricalResearchBatchReport({
    datasets: [ds],
    evaluationIndices: [E],
    observationHorizonBars: [8],
    swingConfig: SWING,
  });
  const extended: Candle[] = base.map((c) => ({ ...c }));
  for (let i = E + 1; i < extended.length; i++) {
    extended[i] = { ...extended[i]!, high: 10_000, low: 9_000, close: 9_500 };
  }
  const after = buildMslHistoricalResearchBatchReport({
    datasets: [{ ...ds, candles: extended }],
    evaluationIndices: [E],
    observationHorizonBars: [8],
    swingConfig: SWING,
  });
  const strictBefore = strictFingerprint(before.evidenceRecords);
  const strictAfter = strictFingerprint(after.evidenceRecords);
  const strictSame = JSON.stringify(strictBefore) === JSON.stringify(strictAfter);
  const fwdBefore = before.evidenceRecords[0]?.forwardObservations.forwardReturn;
  const fwdAfter = after.evidenceRecords[0]?.forwardObservations.forwardReturn;
  const fwdMayDiffer =
    fwdBefore !== null && fwdAfter !== null ? fwdBefore !== fwdAfter : true;
  const checksum =
    loadBtcusdt1hResearchFrozenDatasetV1().document.metadata.datasetChecksum;
  return {
    strictMembershipUnchanged: strictSame,
    forwardMetricsMayDiffer: fwdMayDiffer,
    frozenBtcChecksumUnchanged: checksum === BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
    passed: strictSame && checksum === BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  };
}
