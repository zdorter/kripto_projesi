import { replayCounterfactualTargetReachability } from "./historical-alternative-target-reachability-replay";
import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyPriceMoveRewardBucket } from "./historical-entry-price-move-quality-analysis";
import { PRICE_MOVE_REWARD_BUCKET_IDS } from "./historical-entry-price-move-quality-analysis-types";
import { classifyProspectiveRrBucket } from "./historical-entry-context-future-move-analysis";
import { computeIndependentTradeWinRateConfidenceInterval } from "./historical-independent-trade-statistical-validation";
import { classifyDisplacementContextBucket } from "./historical-target-distance-structural-context-analysis";
import type { CounterfactualReplayEvent } from "./historical-alternative-target-reachability-replay-types";
import type { Candle } from "./types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION,
  ROUND_TRIP_COST_SCENARIOS,
  type CounterfactualTargetModelId,
  type DelayedEntryLifecycleStatus,
  type DelayedEntryModelId,
  type BuildHistoricalDelayedEntryResearchInput,
  type EntryQualityComparisonRow,
  type HistoricalDelayedEntryResearchReport,
  type HistoricalDelayedEntrySimulationBundle,
  type HistoricalDelayedEntryTradeSimResult,
  type MissedEntryAnalysisRow,
  type ResearchFindingTag,
} from "./historical-delayed-entry-research-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";
const CANONICAL_MODEL = "CANONICAL_DISPLACEMENT_EQUALITY" as const;
const WARNINGS: readonly string[] = [
  "counterfactual_delayed_entry_research_only",
  "no_production_entry_rule",
  "no_best_entry_or_optimal_retracement_language",
  "not_profitability_claim",
  "lookahead_safe_first_touch_only",
];

export interface DelayedEntryScenario {
  model: DelayedEntryModelId;
  levelLabel: string;
  levelValue: number;
}

export const DELAYED_ENTRY_SCENARIOS: readonly DelayedEntryScenario[] = [
  { model: "MODEL_D_NO_DELAY_BASELINE", levelLabel: "0%", levelValue: 0 },
  { model: "MODEL_A_FIXED_RETRACEMENT", levelLabel: "0.10%", levelValue: 0.1 },
  { model: "MODEL_A_FIXED_RETRACEMENT", levelLabel: "0.25%", levelValue: 0.25 },
  { model: "MODEL_A_FIXED_RETRACEMENT", levelLabel: "0.50%", levelValue: 0.5 },
  { model: "MODEL_A_FIXED_RETRACEMENT", levelLabel: "0.75%", levelValue: 0.75 },
  { model: "MODEL_A_FIXED_RETRACEMENT", levelLabel: "1.00%", levelValue: 1 },
  { model: "MODEL_B_ANCHOR_FRACTION", levelLabel: "10%", levelValue: 0.1 },
  { model: "MODEL_B_ANCHOR_FRACTION", levelLabel: "25%", levelValue: 0.25 },
  { model: "MODEL_B_ANCHOR_FRACTION", levelLabel: "50%", levelValue: 0.5 },
  { model: "MODEL_C_STRUCTURAL_RETRACEMENT", levelLabel: "25%", levelValue: 0.25 },
  { model: "MODEL_C_STRUCTURAL_RETRACEMENT", levelLabel: "50%", levelValue: 0.5 },
];

function touchesTarget(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  target: number
): boolean {
  return direction === "BULLISH" ? candle.high >= target : candle.low <= target;
}

function touchesInvalidation(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  inv: number
): boolean {
  return direction === "BULLISH" ? candle.low <= inv : candle.high >= inv;
}

function touchesEntry(
  direction: "BULLISH" | "BEARISH",
  candle: { high: number; low: number },
  entry: number
): boolean {
  return direction === "BULLISH" ? candle.low <= entry : candle.high >= entry;
}

export function computeDelayedEntryPrice(input: {
  model: DelayedEntryModelId;
  levelValue: number;
  direction: "BULLISH" | "BEARISH";
  eClose: number;
  anchorPrice: number | null;
  prefixExtremePrice: number | null;
}): number | null {
  const { model, levelValue, direction, eClose, anchorPrice, prefixExtremePrice } = input;
  if (eClose <= 0) return null;
  if (model === "MODEL_D_NO_DELAY_BASELINE") return eClose;
  if (model === "MODEL_A_FIXED_RETRACEMENT") {
    const f = levelValue / 100;
    return direction === "BULLISH" ? eClose * (1 - f) : eClose * (1 + f);
  }
  if (model === "MODEL_B_ANCHOR_FRACTION") {
    if (anchorPrice === null) return null;
    const displacement = eClose - anchorPrice;
    return eClose - displacement * levelValue;
  }
  if (model === "MODEL_C_STRUCTURAL_RETRACEMENT") {
    if (prefixExtremePrice === null) return null;
    const span = eClose - prefixExtremePrice;
    return eClose - span * levelValue;
  }
  return null;
}

export function computeEntryImprovementPercent(
  direction: "BULLISH" | "BEARISH",
  eClose: number,
  delayedEntry: number
): number {
  if (eClose <= 0) return 0;
  return direction === "BULLISH"
    ? ((eClose - delayedEntry) / eClose) * 100
    : ((delayedEntry - eClose) / eClose) * 100;
}

export function computeCounterfactualTargetT2(
  _direction: "BULLISH" | "BEARISH",
  delayedEntry: number,
  anchorPrice: number | null
): number | null {
  if (anchorPrice === null) return null;
  return delayedEntry + (delayedEntry - anchorPrice);
}

export function computeCounterfactualInvalidationI2(
  direction: "BULLISH" | "BEARISH",
  delayedEntry: number,
  anchorPrice: number | null
): number | null {
  if (anchorPrice === null) return null;
  return anchorPrice;
}

function grossPct(from: number, to: number): number | null {
  if (from <= 0) return null;
  return (Math.abs(to - from) / from) * 100;
}

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

function median(nums: number[]): number | null {
  return percentile(nums, 0.5);
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface TradeSimInput {
  trade: IndependentTradeUnit;
  eClose: number;
  anchorPrice: number | null;
  prefixExtreme: number | null;
  canonicalRow: {
    replayEvent: CounterfactualReplayEvent;
    entryPrice: number | null;
    counterfactualTargetPrice: number | null;
  };
  displacementBucket: string;
  headroomPresence: string;
  rewardBucket: string;
  rrBucket: string;
  direction: "BULLISH" | "BEARISH";
  waveLabel: string;
  setupFamilyId: string;
}

function maxFavorableMoveFromEClose(
  direction: "BULLISH" | "BEARISH",
  eClose: number,
  evalIdx: number,
  end: number,
  candles: readonly Candle[]
): number | null {
  if (eClose <= 0) return null;
  let extreme = direction === "BULLISH" ? -Infinity : Infinity;
  for (let i = evalIdx + 1; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    if (direction === "BULLISH") extreme = Math.max(extreme, c.high);
    else extreme = Math.min(extreme, c.low);
  }
  if (!Number.isFinite(extreme)) return null;
  return direction === "BULLISH"
    ? ((extreme - eClose) / eClose) * 100
    : ((eClose - extreme) / eClose) * 100;
}

function ratioMfeMae(
  direction: "BULLISH" | "BEARISH",
  entryPrice: number,
  targetPrice: number,
  invalidationPrice: number,
  mfePct: number | null,
  maePct: number | null
): { mfeToTarget: number | null; maeToRisk: number | null } {
  const targetDist = Math.abs(targetPrice - entryPrice);
  const riskDist = Math.abs(entryPrice - invalidationPrice);
  const mfeToTarget =
    mfePct !== null && targetDist > 0
      ? (direction === "BULLISH"
          ? (entryPrice * (1 + mfePct / 100) - entryPrice)
          : (entryPrice - entryPrice * (1 - mfePct / 100))) / targetDist
      : null;
  const maeToRisk =
    maePct !== null && riskDist > 0 ? (maePct / 100) * entryPrice / riskDist : null;
  return { mfeToTarget, maeToRisk: maeToRisk };
}

function buildFilledSimResult(
  base: Pick<
    HistoricalDelayedEntryTradeSimResult,
    | "tradeId"
    | "status"
    | "fillBarOffset"
    | "delayedEntryPrice"
    | "improvementPct"
    | "maxFavorableMovePctBeforeFill"
    | "evaluationBarIndex"
    | "policyClassification"
    | "evaluatorStatus"
    | "rewardBucket"
    | "displacementBucket"
    | "headroomPresence"
    | "rrBucket"
    | "direction"
    | "waveLabel"
    | "setupFamilyId"
    | "canonicalReplayEvent"
  >,
  input: {
    direction: "BULLISH" | "BEARISH";
    evalIdx: number;
    fillBarOffset: number;
    entryPrice: number;
    targetT1: number;
    targetT2: number | null;
    invI1: number;
    invI2: number | null;
    candles: readonly Candle[];
    horizonBars: number;
  }
): HistoricalDelayedEntryTradeSimResult {
  const { direction, evalIdx, fillBarOffset, entryPrice, targetT1, targetT2, invI1, invI2, candles, horizonBars } =
    input;
  const rewardT1 = grossPct(entryPrice, targetT1);
  const rewardT2 = targetT2 !== null ? grossPct(entryPrice, targetT2) : null;
  const riskI1 = grossPct(entryPrice, invI1);
  const riskI2 = invI2 !== null ? grossPct(entryPrice, invI2) : null;
  const outcomeT1I1 = replayPathAfterDelayedFill({
    direction,
    evalIdx,
    fillBarOffset,
    entryPrice,
    targetPrice: targetT1,
    invalidationPrice: invI1,
    candles,
    horizonBars,
  });
  const outcomeT2I1 =
    targetT2 !== null
      ? replayPathAfterDelayedFill({
          direction,
          evalIdx,
          fillBarOffset,
          entryPrice,
          targetPrice: targetT2,
          invalidationPrice: invI1,
          candles,
          horizonBars,
        })
      : null;
  const outcomeT1I2 =
    invI2 !== null
      ? replayPathAfterDelayedFill({
          direction,
          evalIdx,
          fillBarOffset,
          entryPrice,
          targetPrice: targetT1,
          invalidationPrice: invI2,
          candles,
          horizonBars,
        })
      : null;
  const outcomeT2I2 =
    targetT2 !== null && invI2 !== null
      ? replayPathAfterDelayedFill({
          direction,
          evalIdx,
          fillBarOffset,
          entryPrice,
          targetPrice: targetT2,
          invalidationPrice: invI2,
          candles,
          horizonBars,
        })
      : null;
  const ratios = ratioMfeMae(direction, entryPrice, targetT1, invI1, outcomeT1I1.mfePct, outcomeT1I1.maePct);
  return {
    ...base,
    rewardPctT1: rewardT1,
    rewardPctT2: rewardT2,
    riskPctI1: riskI1,
    riskPctI2: riskI2,
    rrT1I1: riskI1 && rewardT1 ? rewardT1 / riskI1 : null,
    rrT2I1: riskI1 && rewardT2 ? rewardT2 / riskI1 : null,
    rrT1I2: riskI2 && rewardT1 ? rewardT1 / riskI2 : null,
    rrT2I2: riskI2 && rewardT2 ? rewardT2 / riskI2 : null,
    pathT1I1: outcomeT1I1.event,
    pathT2I1: outcomeT2I1?.event ?? null,
    pathT1I2: outcomeT1I2?.event ?? null,
    pathT2I2: outcomeT2I2?.event ?? null,
    barsToTargetT1: outcomeT1I1.barsToTarget,
    barsToTargetT2: outcomeT2I1?.barsToTarget ?? null,
    barsToInvalidationT1: outcomeT1I1.barsToInvalidation,
    barsToInvalidationI2: outcomeT1I2?.barsToInvalidation ?? null,
    mfePct: outcomeT1I1.mfePct,
    maePct: outcomeT1I1.maePct,
    mfeToTargetDistanceRatio: ratios.mfeToTarget,
    maeToRiskDistanceRatio: ratios.maeToRisk,
  };
}

function simulateDelayedTrade(
  input: TradeSimInput,
  scenario: DelayedEntryScenario,
  candles: readonly Candle[],
  horizonBars: number
): HistoricalDelayedEntryTradeSimResult {
  const { trade, eClose, anchorPrice, prefixExtreme, canonicalRow } = input;
  const direction = trade.direction;
  const baseContext = {
    tradeId: trade.tradeId,
    evaluationBarIndex: trade.evaluationBarIndex,
    policyClassification: trade.policyClassification,
    evaluatorStatus: trade.tradeEvaluationStatus,
    rewardBucket: input.rewardBucket,
    displacementBucket: input.displacementBucket,
    headroomPresence: input.headroomPresence,
    rrBucket: input.rrBucket,
    direction: input.direction,
    waveLabel: input.waveLabel,
    setupFamilyId: input.setupFamilyId,
    canonicalReplayEvent: canonicalRow.replayEvent,
  };
  const empty: HistoricalDelayedEntryTradeSimResult = {
    ...baseContext,
    status: "NOT_REPLAYABLE",
    fillBarOffset: null,
    delayedEntryPrice: null,
    improvementPct: null,
    riskPctI1: null,
    riskPctI2: null,
    rewardPctT1: null,
    rewardPctT2: null,
    rrT1I1: null,
    rrT2I1: null,
    rrT1I2: null,
    rrT2I2: null,
    pathT1I1: null,
    pathT2I1: null,
    pathT1I2: null,
    pathT2I2: null,
    barsToTargetT1: null,
    barsToTargetT2: null,
    barsToInvalidationT1: null,
    barsToInvalidationI2: null,
    mfePct: null,
    maePct: null,
    mfeToTargetDistanceRatio: null,
    maeToRiskDistanceRatio: null,
    maxFavorableMovePctBeforeFill: null,
  };
  if (direction !== "BULLISH" && direction !== "BEARISH") return empty;
  if (canonicalRow.replayEvent === "NOT_REPLAYABLE") return empty;
  const targetFrozen = trade.targetReferencePrice;
  const invFrozen = trade.invalidationReferencePrice;
  if (targetFrozen === null || invFrozen === null) return empty;

  const delayedEntry = computeDelayedEntryPrice({
    model: scenario.model,
    levelValue: scenario.levelValue,
    direction,
    eClose,
    anchorPrice,
    prefixExtremePrice: prefixExtreme,
  });
  if (delayedEntry === null || delayedEntry <= 0) {
    return { ...empty, status: "NOT_REPLAYABLE", delayedEntryPrice: delayedEntry };
  }

  const evalIdx = Math.floor(trade.evaluationBarIndex);
  const end = Math.min(evalIdx + horizonBars, candles.length - 1);
  const invI2 = computeCounterfactualInvalidationI2(direction, delayedEntry, anchorPrice);

  const targetT1Price = canonicalRow.counterfactualTargetPrice ?? targetFrozen;
  const entryForBaseline = canonicalRow.entryPrice ?? eClose;

  if (scenario.model === "MODEL_D_NO_DELAY_BASELINE") {
    const targetT2 = computeCounterfactualTargetT2(direction, entryForBaseline, anchorPrice);
    return buildFilledSimResult(
      {
        ...baseContext,
        status: "ENTRY_FILLED",
        fillBarOffset: 0,
        delayedEntryPrice: entryForBaseline,
        improvementPct: 0,
        maxFavorableMovePctBeforeFill: null,
      },
      {
        direction,
        evalIdx,
        fillBarOffset: 0,
        entryPrice: entryForBaseline,
        targetT1: targetT1Price,
        targetT2,
        invI1: invFrozen,
        invI2: computeCounterfactualInvalidationI2(direction, entryForBaseline, anchorPrice),
        candles,
        horizonBars,
      }
    );
  }

  let fillOffset: number | null = null;
  for (let i = evalIdx + 1; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    const entryHit = touchesEntry(direction, c, delayedEntry);
    const tHit = touchesTarget(direction, c, targetFrozen);
    const iHit = touchesInvalidation(direction, c, invFrozen);
    if (entryHit && (tHit || iHit)) {
      return {
        ...empty,
        status: "AMBIGUOUS_ENTRY_FILL",
        fillBarOffset: i - evalIdx,
        delayedEntryPrice: delayedEntry,
        maxFavorableMovePctBeforeFill: maxFavorableMoveFromEClose(direction, eClose, evalIdx, end, candles),
      };
    }
    if (tHit) {
      return {
        ...empty,
        status: "TARGET_MOVED_BEFORE_ENTRY",
        delayedEntryPrice: delayedEntry,
        maxFavorableMovePctBeforeFill: maxFavorableMoveFromEClose(direction, eClose, evalIdx, end, candles),
      };
    }
    if (iHit) {
      return {
        ...empty,
        status: "INVALIDATION_MOVED_BEFORE_ENTRY",
        delayedEntryPrice: delayedEntry,
        maxFavorableMovePctBeforeFill: maxFavorableMoveFromEClose(direction, eClose, evalIdx, end, candles),
      };
    }
    if (entryHit) {
      fillOffset = i - evalIdx;
      break;
    }
  }
  if (fillOffset === null) {
    return {
      ...empty,
      status: "ENTRY_NOT_FILLED",
      delayedEntryPrice: delayedEntry,
      maxFavorableMovePctBeforeFill: maxFavorableMoveFromEClose(direction, eClose, evalIdx, end, candles),
    };
  }

  const improvementPct = computeEntryImprovementPercent(direction, eClose, delayedEntry);
  const targetT2 = computeCounterfactualTargetT2(direction, delayedEntry, anchorPrice);
  return buildFilledSimResult(
    {
      ...baseContext,
      status: "ENTRY_FILLED",
      fillBarOffset: fillOffset,
      delayedEntryPrice: delayedEntry,
      improvementPct,
      maxFavorableMovePctBeforeFill: null,
    },
    {
      direction,
      evalIdx,
      fillBarOffset: fillOffset,
      entryPrice: delayedEntry,
      targetT1: targetFrozen,
      targetT2,
      invI1: invFrozen,
      invI2,
      candles,
      horizonBars,
    }
  );
}

function replayPathAfterDelayedFill(input: {
  direction: "BULLISH" | "BEARISH";
  evalIdx: number;
  fillBarOffset: number;
  entryPrice: number;
  targetPrice: number;
  invalidationPrice: number;
  candles: readonly Candle[];
  horizonBars: number;
}): {
  event: CounterfactualReplayEvent;
  barsToTarget: number | null;
  barsToInvalidation: number | null;
  mfePct: number | null;
  maePct: number | null;
} {
  const { direction, evalIdx, fillBarOffset, entryPrice, targetPrice, invalidationPrice, candles, horizonBars } =
    input;
  const start = evalIdx + fillBarOffset + 1;
  const end = Math.min(evalIdx + horizonBars, candles.length - 1);
  if (start > end) {
    return {
      event: "INSUFFICIENT_FUTURE",
      barsToTarget: null,
      barsToInvalidation: null,
      mfePct: null,
      maePct: null,
    };
  }

  let mfeExtreme = direction === "BULLISH" ? -Infinity : Infinity;
  let maeExtreme = direction === "BULLISH" ? Infinity : -Infinity;
  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (!c) continue;
    if (direction === "BULLISH") {
      mfeExtreme = Math.max(mfeExtreme, c.high);
      maeExtreme = Math.min(maeExtreme, c.low);
    } else {
      mfeExtreme = Math.min(mfeExtreme, c.low);
      maeExtreme = Math.max(maeExtreme, c.high);
    }
  }
  const mfePct =
    direction === "BULLISH"
      ? ((mfeExtreme - entryPrice) / entryPrice) * 100
      : ((entryPrice - mfeExtreme) / entryPrice) * 100;
  const maePct =
    direction === "BULLISH"
      ? ((entryPrice - maeExtreme) / entryPrice) * 100
      : ((maeExtreme - entryPrice) / entryPrice) * 100;

  for (let i = start; i <= end; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const tHit = touchesTarget(direction, candle, targetPrice);
    const iHit = touchesInvalidation(direction, candle, invalidationPrice);
    if (tHit && iHit) {
      return {
        event: "AMBIGUOUS_SAME_BAR",
        barsToTarget: i - evalIdx,
        barsToInvalidation: i - evalIdx,
        mfePct,
        maePct,
      };
    }
    if (tHit) {
      return { event: "TARGET_REACHED", barsToTarget: i - evalIdx, barsToInvalidation: null, mfePct, maePct };
    }
    if (iHit) {
      return { event: "INVALIDATION_REACHED", barsToTarget: null, barsToInvalidation: i - evalIdx, mfePct, maePct };
    }
  }
  return {
    event: "NOT_REACHED_WITHIN_HORIZON",
    barsToTarget: null,
    barsToInvalidation: null,
    mfePct,
    maePct,
  };
}

export function collectHistoricalDelayedEntrySimulations(
  input: BuildHistoricalDelayedEntryResearchInput
): HistoricalDelayedEntrySimulationBundle {
  const { lifecycleReport, candles, reachabilityReplayReport: b12w } = input;
  const horizonBars = lifecycleReport.configuration?.horizonBars ?? 24;
  const replayByTrade = new Map(
    b12w.perTrade
      .filter((r) => r.modelId === CANONICAL_MODEL)
      .map((r) => [r.tradeId, r])
  );
  const dispRows =
    input.displacementEqualityTargetMechanicsReport?.targetMagnitude?.perTrade ??
    input.displacementEqualityPerTrade ??
    [];
  const structRows =
    input.structuralExtremeVsDisplacementTargetAnalysisReport?.perTrade ??
    input.structuralPerTrade ??
    [];
  const dispMap = new Map(dispRows.map((r) => [r.tradeId, r]));
  const structMap = new Map(structRows.map((r) => [r.tradeId, r]));
  const tradeInputs: TradeSimInput[] = [];
  for (const t of lifecycleReport.trades) {
    const row = replayByTrade.get(t.tradeId);
    if (!row) continue;
    const evalIdx = Math.floor(t.evaluationBarIndex);
    const eCandle = candles[evalIdx];
    const eClose = t.entryReferencePrice ?? eCandle?.close ?? row.entryPrice;
    if (eClose === null || eClose === undefined) continue;
    const disp = dispMap.get(t.tradeId);
    const struct = structMap.get(t.tradeId);
    const headroomPct =
      (struct as { prefixExtremeHeadroomPercentage?: number | null })?.prefixExtremeHeadroomPercentage ??
      null;
    if (t.direction !== "BULLISH" && t.direction !== "BEARISH") continue;
    tradeInputs.push({
      trade: t,
      eClose,
      anchorPrice: disp?.anchorPrice ?? null,
      prefixExtreme: struct?.prefixExtremePrice ?? null,
      canonicalRow: {
        replayEvent: row.replayEvent,
        entryPrice: row.entryPrice,
        counterfactualTargetPrice: row.counterfactualTargetPrice,
      },
      displacementBucket: classifyDisplacementContextBucket(disp?.displacementPercentage ?? null),
      headroomPresence:
        headroomPct !== null && headroomPct > 0 ? "HEADROOM_PRESENT" : "HEADROOM_ABSENT",
      rewardBucket: classifyPriceMoveRewardBucket(row.grossTargetMovePercentage),
      rrBucket: classifyProspectiveRrBucket(t.canonicalRrRatio),
      direction: t.direction,
      waveLabel: t.snapshotCohorts[0] ?? "UNKNOWN",
      setupFamilyId: t.setupFamilyId,
    });
  }
  const resultsByScenarioKey: Record<string, HistoricalDelayedEntryTradeSimResult[]> = {};
  for (const scenario of DELAYED_ENTRY_SCENARIOS) {
    const key = `${scenario.model}:${scenario.levelLabel}`;
    resultsByScenarioKey[key] = tradeInputs.map((ti) =>
      simulateDelayedTrade(ti, scenario, candles, horizonBars)
    );
  }
  return {
    horizonBars,
    tradeCount: tradeInputs.length,
    resultsByScenarioKey,
  };
}

export function aggregateScenario(
  results: readonly HistoricalDelayedEntryTradeSimResult[],
  scenario: DelayedEntryScenario,
  targetModel: CounterfactualTargetModelId
): EntryQualityComparisonRow {
  const filled = results.filter((r) => r.status === "ENTRY_FILLED");
  const n = results.length;
  const fills = filled.length;
  const improvements = filled
    .map((r) => r.improvementPct)
    .filter((x): x is number => x !== null);
  const risks = filled.map((r) => r.riskPctI1).filter((x): x is number => x !== null);
  const rewards = filled
    .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.rewardPctT1 : r.rewardPctT2))
    .filter((x): x is number => x !== null);
  const rrs = filled
    .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.rrT1I1 : r.rrT2I1))
    .filter((x): x is number => x !== null);
  const paths = filled.map((r) =>
    targetModel === "T1_FROZEN_TARGET" ? r.pathT1I1 : r.pathT2I1
  );
  const targetReached = paths.filter((p) => p === "TARGET_REACHED").length;
  const invReached = paths.filter((p) => p === "INVALIDATION_REACHED").length;
  const noTouch = paths.filter((p) => p === "NOT_REACHED_WITHIN_HORIZON").length;
  const barsFill = filled
    .map((r) => r.fillBarOffset)
    .filter((b): b is number => b !== null);
  const barsTarget = filled
    .map((r) => (targetModel === "T1_FROZEN_TARGET" ? r.barsToTargetT1 : r.barsToTargetT2))
    .filter((b): b is number => b !== null);
  const missed = results.filter((r) => r.status === "ENTRY_NOT_FILLED").length;
  const costCoverage =
    rewards.length > 0
      ? rewards.filter((r) => r >= 0.2).length / rewards.length
      : null;

  return {
    model: scenario.model,
    levelLabel: scenario.levelLabel,
    targetModel,
    trades: n,
    fillRate: n > 0 ? fills / n : null,
    fillRateWilson95: computeIndependentTradeWinRateConfidenceInterval(fills, n - fills, 0.95),
    medianImprovement: median(improvements),
    meanImprovement: mean(improvements),
    medianRisk: median(risks),
    medianReward: median(rewards),
    medianCounterfactualRr: median(rrs),
    targetReachRate: fills > 0 ? targetReached / fills : null,
    invalidationRate: fills > 0 ? invReached / fills : null,
    noTouchRate: fills > 0 ? noTouch / fills : null,
    medianBarsToFill: median(barsFill),
    medianBarsToTargetAfterFill: median(barsTarget),
    costCoverageAt020: costCoverage,
    missedEntryCount: missed,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(n),
    interpretWithCaution: n < 10,
    tag: "COUNTERFACTUAL_ENTRY_MODEL",
  };
}

export function buildHistoricalDelayedEntryResearch(
  input: BuildHistoricalDelayedEntryResearchInput
): HistoricalDelayedEntryResearchReport {
  const { lifecycleReport, reachabilityReplayReport: b12w } = input;
  const sim = collectHistoricalDelayedEntrySimulations(input);
  const horizonBars = sim.horizonBars;
  const replayByTrade = new Map(
    b12w.perTrade
      .filter((r) => r.modelId === CANONICAL_MODEL)
      .map((r) => [r.tradeId, r])
  );
  const allResults = new Map<string, readonly HistoricalDelayedEntryTradeSimResult[]>(
    Object.entries(sim.resultsByScenarioKey)
  );
  const baselineKey = `MODEL_D_NO_DELAY_BASELINE:0%`;
  const baselineRows = allResults.get(baselineKey) ?? [];

  const comparisonTableT1: EntryQualityComparisonRow[] = [];
  const comparisonTableT2: EntryQualityComparisonRow[] = [];
  for (const scenario of DELAYED_ENTRY_SCENARIOS) {
    const key = `${scenario.model}:${scenario.levelLabel}`;
    const results = allResults.get(key) ?? [];
    comparisonTableT1.push(aggregateScenario(results, scenario, "T1_FROZEN_TARGET"));
    comparisonTableT2.push(aggregateScenario(results, scenario, "T2_REPROJECTED_TARGET"));
  }

  const missedEntryAnalysis: MissedEntryAnalysisRow[] = DELAYED_ENTRY_SCENARIOS.map((scenario) => {
    const key = `${scenario.model}:${scenario.levelLabel}`;
    const results = allResults.get(key) ?? [];
    const notFilled = results.filter((r) => r.status === "ENTRY_NOT_FILLED");
    const canonTarget = notFilled.filter((r) => {
      const row = replayByTrade.get(r.tradeId);
      return row?.replayEvent === "TARGET_REACHED";
    }).length;
    const canonInv = notFilled.filter((r) => {
      const row = replayByTrade.get(r.tradeId);
      return row?.replayEvent === "INVALIDATION_REACHED";
    }).length;
    return {
      model: scenario.model,
      levelLabel: scenario.levelLabel,
      notFilled: notFilled.length,
      canonicalTargetReachedCount: canonTarget,
      canonicalInvalidationCount: canonInv,
      note: "Canonical E-close outcome is counterfactual reference only for missed-fill trades.",
    };
  });

  const baselineT1 = comparisonTableT1.find((r) => r.model === "MODEL_D_NO_DELAY_BASELINE")!;
  const baselineResults = baselineRows;
  let parityMismatches = 0;
  for (const r of baselineResults) {
    const row = replayByTrade.get(r.tradeId);
    if (!row || row.replayEvent === "NOT_REPLAYABLE") continue;
    if (r.pathT1I1 !== row.replayEvent) parityMismatches += 1;
  }
  const parityMatch = parityMismatches === 0;

  const failedIds = new Set(
    lifecycleReport.trades
      .filter(
        (t) => t.tradeEvaluationStatus === "FAILED" && t.policyClassification === "FAVORABLE_RESOLUTION"
      )
      .map((t) => t.tradeId)
  );
  const passedAdvIds = new Set(
    lifecycleReport.trades
      .filter(
        (t) => t.tradeEvaluationStatus === "PASSED" && t.policyClassification === "ADVERSE_RESOLUTION"
      )
      .map((t) => t.tradeId)
  );

  const cohortRow = (scenario: DelayedEntryScenario, ids: Set<string>, target: CounterfactualTargetModelId) => {
    const key = `${scenario.model}:${scenario.levelLabel}`;
    const results = (allResults.get(key) ?? []).filter((r) => ids.has(r.tradeId));
    return aggregateScenario(results, scenario, target);
  };

  const failedFavorableDelayedEntry = DELAYED_ENTRY_SCENARIOS.map((s) =>
    cohortRow(s, failedIds, "T1_FROZEN_TARGET")
  );
  const passedAdverseDelayedEntry = DELAYED_ENTRY_SCENARIOS.map((s) =>
    cohortRow(s, passedAdvIds, "T1_FROZEN_TARGET")
  );

  const sortedEval = [...baselineRows].sort((a, b) => a.evaluationBarIndex - b.evaluationBarIndex);
  const splitAt = Math.floor(sortedEval.length * 0.7);
  const earlierIds = new Set(sortedEval.slice(0, splitAt).map((t) => t.tradeId));
  const laterIds = new Set(sortedEval.slice(splitAt).map((t) => t.tradeId));

  const targetDistanceBuckets = PRICE_MOVE_REWARD_BUCKET_IDS.filter(
    (id) => id !== "REWARD_NOT_APPLICABLE"
  ).map((bucketLabel) => {
    const ids = new Set(baselineRows.filter((ti) => ti.rewardBucket === bucketLabel).map((ti) => ti.tradeId));
    const rows = DELAYED_ENTRY_SCENARIOS.map((s) => cohortRow(s, ids, "T1_FROZEN_TARGET"));
    return { bucketLabel, rows };
  });

  const sliceScenario = DELAYED_ENTRY_SCENARIOS.find(
    (s) => s.model === "MODEL_A_FIXED_RETRACEMENT" && s.levelLabel === "0.25%"
  )!;
  const contextSlices: HistoricalDelayedEntryResearchReport["contextSlices"][number][] = [];
  const addSlices = (dimension: string, keyFn: (ti: HistoricalDelayedEntryTradeSimResult) => string) => {
    const buckets = [...new Set(baselineRows.map(keyFn))];
    for (const bucket of buckets) {
      const ids = new Set(baselineRows.filter((ti) => keyFn(ti) === bucket).map((ti) => ti.tradeId));
      const key = `${sliceScenario.model}:${sliceScenario.levelLabel}`;
      const results = (allResults.get(key) ?? []).filter((r) => ids.has(r.tradeId));
      const agg = aggregateScenario(results, sliceScenario, "T1_FROZEN_TARGET");
      contextSlices.push({
        dimension,
        bucket,
        model: sliceScenario.model,
        levelLabel: sliceScenario.levelLabel,
        fillRate: agg.fillRate,
        medianImprovement: agg.medianImprovement,
        tag: "ASSOCIATIONAL_FINDING",
      });
    }
  };
  addSlices("displacement", (ti) => ti.displacementBucket);
  addSlices("headroom", (ti) => ti.headroomPresence);
  addSlices("reward", (ti) => ti.rewardBucket);
  addSlices("rr", (ti) => ti.rrBucket);
  addSlices("direction", (ti) => ti.direction);
  addSlices("wave", (ti) => ti.waveLabel);
  addSlices("family", (ti) => ti.setupFamilyId);

  const temporalSummaries = DELAYED_ENTRY_SCENARIOS.map((scenario) => {
    const key = `${scenario.model}:${scenario.levelLabel}`;
    const all = allResults.get(key) ?? [];
    const earlier = all.filter((r) => earlierIds.has(r.tradeId));
    const later = all.filter((r) => laterIds.has(r.tradeId));
    const aggE = aggregateScenario(earlier, scenario, "T1_FROZEN_TARGET");
    const aggL = aggregateScenario(later, scenario, "T1_FROZEN_TARGET");
    return {
      model: scenario.model,
      levelLabel: scenario.levelLabel,
      earlierFillRate: aggE.fillRate,
      laterFillRate: aggL.fillRate,
      earlierMedianImprovement: aggE.medianImprovement,
      laterMedianImprovement: aggL.medianImprovement,
    };
  });

  const diagnosticSummary: HistoricalDelayedEntryResearchReport["diagnosticSummary"] = [
    {
      question: "E-close yerine delayed entry ne sıklıkta fill oluyor?",
      answer: `MODEL_A 0.25% fill rate ${((comparisonTableT1.find((r) => r.levelLabel === "0.25%")?.fillRate ?? 0) * 100).toFixed(1)}% (T1).`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Fill olduğunda median entry improvement nedir?",
      answer: `MODEL_A 0.50% median improvement ${comparisonTableT1.find((r) => r.levelLabel === "0.50%")?.medianImprovement?.toFixed(3) ?? "n/a"}%.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Daha büyük retracement talebi fill rate'i nasıl değiştiriyor?",
      answer: "See tradeOffSummary — descriptive only, not optimal retracement.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Missed entry ne sıklıkta?",
      answer: `MODEL_A 1.00% missed ${comparisonTableT1.find((r) => r.levelLabel === "1.00%")?.missedEntryCount ?? 0} trades.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Entry improvement risk %'yi ne kadar değiştiriyor?",
      answer: "Compare medianRisk baseline vs delayed rows in entryQualityComparison.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Entry improvement RR'yi nasıl değiştiriyor?",
      answer: "Counterfactual RR from frozen/reprojected reward vs frozen invalidation.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Frozen target ile reprojected target arasında fark nedir?",
      answer: `T1 vs T2 targetReach on same scenario — T2 uses displacement equality from delayed entry.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Delayed entry canonical target reachability'yi nasıl değiştiriyor?",
      answer: `Baseline T1 reach ${((baselineT1.targetReachRate ?? 0) * 100).toFixed(1)}%.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Delayed entry invalidation riskini nasıl değiştiriyor?",
      answer: "I1 frozen invalidation; closer entry changes risk % arithmetically.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Küçük targetlarda cost etkisi nedir?",
      answer: `costCoverageAt020 on entryQualityComparison; not profitability.`,
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Büyük targetlarda fill rate nasıl değişiyor?",
      answer: "See targetDistanceBuckets when populated.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "FAILED + FAVORABLE cohortunda delayed fill nasıl davranıyor?",
      answer: `n=${failedFavorableDelayedEntry[0]?.trades ?? 0}; fill rate on baseline row.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "PASSED + ADVERSE cohortunda nasıl davranıyor?",
      answer: `n=${passedAdverseDelayedEntry[0]?.trades ?? 0}.`,
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Hangi contextlerde fill rate daha yüksek?",
      answer: "contextSlices when B-12t/u supplied via optional maps.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Hangi contextlerde improvement daha yüksek?",
      answer: "contextSlices associational only.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Temporal split'te davranış korunuyor mu?",
      answer: "TEMPORAL_DESCRIPTIVE_SPLIT summaries in report.",
      tag: "ASSOCIATIONAL_FINDING",
    },
    {
      question: "Delayed entry association'ları B-17 geometry redundancy probleminden etkileniyor mu?",
      answer: "Reward/displacement geometry linked — interpret with B-17 POSSIBLY_REDUNDANT_GEOMETRY.",
      tag: "NOT_ESTABLISHED",
    },
    {
      question: "Lookahead riski var mı?",
      answer: "Entry levels computed at E only; first-touch fill; no best-entry selection.",
      tag: "DIRECT_OBSERVATION",
    },
    {
      question: "Bu araştırmadan production entry rule çıkarılabilir mi?",
      answer: "NOT_ESTABLISHED — counterfactual research only.",
      tag: "NOT_ESTABLISHED",
    },
  ];

  const tradeOffSummary = comparisonTableT1.map((r) => ({
    model: r.model,
    levelLabel: r.levelLabel,
    fillRate: r.fillRate,
    meanImprovement: r.meanImprovement,
    medianImprovement: r.medianImprovement,
    missedEntry: r.missedEntryCount,
    note: "Descriptive trade-off; not optimal retracement.",
  }));

  return {
    schemaVersion: HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: FIXTURE_PATH,
      expectedDatasetChecksum: FIXTURE_CHECKSUM,
    },
    population: {
      independentTrades: lifecycleReport.trades.length,
      replayClassifiable: baselineRows.filter((t) => t.canonicalReplayEvent !== "NOT_REPLAYABLE").length,
      notReplayable: baselineRows.filter((t) => t.canonicalReplayEvent === "NOT_REPLAYABLE").length,
      horizonBars,
    },
    canonicalBaseline: {
      entryAt: "E_CLOSE",
      target: "lifecycle.targetReferencePrice",
      invalidation: "lifecycle.invalidationReferencePrice",
      pathSource: "B-12w CANONICAL_DISPLACEMENT_EQUALITY",
      note: "Comparison reference only; production unchanged.",
    },
    comparisonTableT1,
    comparisonTableT2,
    entryQualityComparison: comparisonTableT1,
    missedEntryAnalysis,
    tradeOffSummary,
    failedFavorableDelayedEntry,
    passedAdverseDelayedEntry,
    targetDistanceBuckets,
    contextSlices,
    temporalDescriptiveSplit: {
      label: "TEMPORAL_DESCRIPTIVE_SPLIT",
      earlierFraction: 0.7,
      modelSummaries: temporalSummaries,
      note: "Not out-of-sample validation.",
    },
    diagnosticSummary,
    directVsAssociational: {
      direct: [
        "fill_events",
        "entry_improvement_arithmetic",
        "bars_to_fill",
        "target_touch_after_fill",
        "cost_arithmetic",
      ],
      associational: ["context_slices", "cohort_slices", "temporal_split"],
    },
    lookaheadAttestation: {
      entryLevelComputedAt: "E",
      fillDetectionFrom: "E+1",
      outcomeFrom: "ENTRY_FILL_BAR+1",
      statement:
        "Delayed entry prices use E-time geometry only. Candles E+1..horizon used for first-touch fill and post-fill path only.",
    },
    parity: {
      b12wCanonicalBaselineReachMatch: parityMatch,
      note: `MODEL_D per-trade replayEvent parity with B-12w canonical rows (mismatches=${parityMismatches}).`,
    },
    warnings: [...WARNINGS],
    tradeExamples: baselineRows.slice(0, 12).map((t) => ({
      tradeId: t.tradeId,
      model: "MODEL_D_NO_DELAY_BASELINE",
      status: "ENTRY_FILLED",
      note: "deterministic example",
    })),
    consumedReports: {
      lifecycleReport: true,
      reachabilityReplayReport: true,
      costAwareCounterfactualAnalysisReport: Boolean(input.costAwareCounterfactualAnalysisReport),
      historicalEntryContextTargetResearchReport: Boolean(input.historicalEntryContextTargetResearchReport),
      entryContextCombinationFutureMoveAnalysisReport: Boolean(
        input.entryContextCombinationFutureMoveAnalysisReport
      ),
      signalIndependenceAuditReport: Boolean(input.signalIndependenceAuditReport),
      eligibilityAuditReport: Boolean(input.eligibilityAuditReport),
    },
  };
}
