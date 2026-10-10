import { detectSwings, mergeSwingConfig } from "../swing-detector";
import {
  classifyHighStructure,
  classifyLowStructure,
} from "../trend-detector";
import type { Candle, MarketStructure, SwingPoint } from "../types";
import { buildMarketStructureBreakContext } from "./market-structure-break";
import { buildMarketStructureLiquidityContext } from "./market-structure-liquidity";
import { buildMarketStructureProtectedContext } from "./market-structure-protected";
import { buildMarketStructureZigzagContext } from "./market-structure-zigzag";
import {
  MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  MarketStructureInvalidEvaluationBarIndexError,
  type BuildMarketStructureSnapshotAtBarInput,
  type MarketStructurePairSnapshot,
  type MarketStructureSnapshot,
} from "./market-structure-types";

export {
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  MarketStructureInvalidEvaluationBarIndexError,
} from "./market-structure-types";
export type {
  BuildMarketStructureSnapshotAtBarInput,
  EqualStructureDiagnostic,
  MarketStructurePairSnapshot,
  MarketStructureProtectedContext,
  MarketStructureScope,
  MarketStructureSnapshot,
  MarketStructureSwingAnnotation,
  MarketStructureSwingLabel,
  MarketStructureZigzagContext,
  ProtectedLevelCandidate,
  ProtectedLevelCandidateStatusAtE,
  ProtectedLevelSelectionReasonCode,
  UnresolvedProtectedReason,
} from "./market-structure-types";
export type {
  BreakObservation,
  BreakReferenceRegistryEntry,
  ClassifiedStructureEvent,
  MarketStructureBreakContext,
} from "./market-structure-break-types";
export type {
  BslCandidate,
  EqualHighObservation,
  EqualLowObservation,
  LiquidityPoolCandidate,
  MarketStructureLiquidityContext,
  SslCandidate,
} from "./market-structure-liquidity-types";
export {
  MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID,
} from "./market-structure-types";
export {
  buildMarketStructureBreakContext,
  MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
  MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
  MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
} from "./market-structure-break";
export type {
  BuildMarketStructureBreakContextInput,
  MarketStructureSnapshotForBreak,
} from "./market-structure-break";
export {
  buildMarketStructureLiquidityContext,
  MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
  pricesEqualHybridTolerance,
} from "./market-structure-liquidity";
export type {
  BuildMarketStructureLiquidityContextInput,
  MarketStructureSnapshotForLiquidity,
} from "./market-structure-liquidity";
export {
  buildMarketStructureLiquidityInteractionContext,
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "./market-structure-liquidity-interaction";
export type {
  BuildMarketStructureLiquidityInteractionContextInput,
  LiquidityInteractionEvent,
  MarketStructureLiquidityInteractionContext,
} from "./market-structure-liquidity-interaction";
export { buildMarketStructureProtectedContext } from "./market-structure-protected";
export type {
  BuildMarketStructureProtectedContextInput,
  MarketStructureSnapshotForProtected,
} from "./market-structure-protected";
export {
  buildMarketStructureZigzagContext,
  mergeSameTypeSwingsForZigzag,
  zigzagSpineAlternatesTypes,
} from "./market-structure-zigzag";

const STANDARD_LIMITATIONS = [
  "descriptive_structure_foundation_only",
  "not_trading_signal",
  "not_bos_choch_liquidity",
  "trend_not_equivalent_to_market_structure",
  "internal_external_scope_not_production_rule",
  `internal_external_rule_id=${MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID}`,
] as const;

function cloneSwing(s: SwingPoint): SwingPoint {
  return {
    index: s.index,
    time: s.time,
    price: s.price,
    type: s.type,
    strength: s.strength,
    confirmed: s.confirmed,
  };
}

function buildStructurePairSnapshots(
  swings: readonly SwingPoint[],
  rightBars: number,
  evaluationBarIndex: number
): {
  pairs: MarketStructurePairSnapshot[];
  highStructure: MarketStructure[];
  lowStructure: MarketStructure[];
} {
  const confirmed = swings.filter((s) => s.confirmed);
  const highs = confirmed.filter((s) => s.type === "HIGH");
  const lows = confirmed.filter((s) => s.type === "LOW");
  const pairs: MarketStructurePairSnapshot[] = [];
  const highStructure: MarketStructure[] = [];
  const lowStructure: MarketStructure[] = [];

  for (let i = 1; i < highs.length; i++) {
    const structure = classifyHighStructure(highs[i - 1], highs[i]);
    const knownAt = highs[i].index + rightBars;
    if (knownAt > evaluationBarIndex) {
      continue;
    }
    highStructure.push(structure);
    pairs.push({
      kind: "HIGH",
      fromIndex: highs[i - 1].index,
      toIndex: highs[i].index,
      fromPrice: highs[i - 1].price,
      toPrice: highs[i].price,
      structure,
      knownAtBarIndex: knownAt,
    });
  }

  for (let i = 1; i < lows.length; i++) {
    const structure = classifyLowStructure(lows[i - 1], lows[i]);
    const knownAt = lows[i].index + rightBars;
    if (knownAt > evaluationBarIndex) {
      continue;
    }
    lowStructure.push(structure);
    pairs.push({
      kind: "LOW",
      fromIndex: lows[i - 1].index,
      toIndex: lows[i].index,
      fromPrice: lows[i - 1].price,
      toPrice: lows[i].price,
      structure,
      knownAtBarIndex: knownAt,
    });
  }

  return { pairs, highStructure, lowStructure };
}

function collectContextLimitations(
  candleCountAtE: number,
  swingConfig: ReturnType<typeof mergeSwingConfig>,
  confirmedCount: number
): string[] {
  const limitations: string[] = [...STANDARD_LIMITATIONS];
  const minLen = swingConfig.leftBars + swingConfig.rightBars + 1;
  if (candleCountAtE < minLen) {
    limitations.push("INSUFFICIENT_PIVOT_WINDOW");
  }
  if (confirmedCount === 0) {
    limitations.push("NO_CONFIRMED_SWINGS");
  } else if (confirmedCount === 1) {
    limitations.push("SINGLE_CONFIRMED_SWING_ONLY");
  }
  limitations.push(
    `swing_confirmation_lag_bars=${swingConfig.rightBars} (pivot_index + rightBars <= evaluationBarIndex)`
  );
  return limitations;
}

/**
 * Evaluation-bar–scoped market structure foundation (MSL-1).
 *
 * - `evaluationBarIndex` (E) is inclusive; candles after E are never read.
 * - Swings come from `detectSwings` on `candles[0..E]` only (slice-first).
 * - A swing is included only when confirmed per pivot rules (`pivotIndex + rightBars <= E`).
 * - Descriptive snapshot only: no BOS/CHoCH, liquidity, protected levels, or trade signals.
 * - MSL-2: zigzag spine + internal/external scope (research rule ZIGZAG_SPINE_EXTERNAL_LEG_CONTAINMENT_V1).
 * - MSL-3: protected level research candidates (MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_V1).
 * - MSL-4: break observations + BOS/CHoCH (MARKET_STRUCTURE_BREAK_RESEARCH_V1).
 * - MSL-5: liquidity foundation (MARKET_STRUCTURE_LIQUIDITY_RESEARCH_V1).
 */
export function buildMarketStructureSnapshotAtBar(
  input: BuildMarketStructureSnapshotAtBarInput
): MarketStructureSnapshot {
  const { candles, evaluationBarIndex } = input;
  const candleCount = candles.length;

  if (
    candleCount === 0 ||
    !Number.isInteger(evaluationBarIndex) ||
    evaluationBarIndex < 0 ||
    evaluationBarIndex >= candleCount
  ) {
    throw new MarketStructureInvalidEvaluationBarIndexError(
      evaluationBarIndex,
      candleCount
    );
  }

  const swingConfig = mergeSwingConfig(input.swingConfig);
  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1) as Candle[];
  const swings = detectSwings(effectiveCandles, swingConfig);
  const rightBars = swingConfig.rightBars;

  const confirmedSwings = swings
    .filter((s) => s.confirmed && s.index + rightBars <= evaluationBarIndex)
    .map(cloneSwing);

  const { pairs, highStructure, lowStructure } = buildStructurePairSnapshots(
    confirmedSwings,
    rightBars,
    evaluationBarIndex
  );

  const zigzag = buildMarketStructureZigzagContext(
    confirmedSwings,
    rightBars,
    evaluationBarIndex
  );

  const limitations = collectContextLimitations(
    effectiveCandles.length,
    swingConfig,
    confirmedSwings.length
  );

  const core = {
    schemaVersion: MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
    evaluationBarIndex,
    evaluationTimestamp: effectiveCandles[evaluationBarIndex].time,
    swingConfig: { ...swingConfig },
    confirmationLagBars: rightBars,
    confirmedSwings,
    highStructure,
    lowStructure,
    structurePairs: pairs,
    zigzag,
    limitations,
  };

  const protectedContext = buildMarketStructureProtectedContext({ snapshot: core });

  const withProtected = {
    ...core,
    protected: protectedContext,
  };

  const breakContext = buildMarketStructureBreakContext({
    snapshot: withProtected,
    candles: effectiveCandles,
  });

  const withBreak = {
    ...withProtected,
    break: breakContext,
  };

  const liquidityContext = buildMarketStructureLiquidityContext({
    snapshot: withBreak,
  });

  return {
    ...withBreak,
    liquidity: liquidityContext,
  };
}
