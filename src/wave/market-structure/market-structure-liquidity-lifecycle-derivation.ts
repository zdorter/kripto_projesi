import type { LiquidityPoolCandidate } from "./market-structure-liquidity-types";
import type { AdvancedLiquidityInteractionEvent } from "./market-structure-liquidity-advanced-interaction-types";

export const MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID =
  "MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_V1" as const;

export type LiquidityLifecyclePhase =
  | "UNTOUCHED"
  | "TOUCHED"
  | "SWEPT"
  | "TAKEN"
  | "RECLAIMED";

export interface LiquidityPoolLifecycleProjection {
  poolId: string;
  phase: LiquidityLifecyclePhase;
  lastEventId: string | null;
  lastTriggerBarIndex: number | null;
}

export interface DeriveMarketStructureLiquidityLifecycleInput {
  pools: readonly LiquidityPoolCandidate[];
  events: readonly AdvancedLiquidityInteractionEvent[];
}

function compareEvents(
  a: AdvancedLiquidityInteractionEvent,
  b: AdvancedLiquidityInteractionEvent
): number {
  if (a.triggerBarIndex !== b.triggerBarIndex) {
    return a.triggerBarIndex - b.triggerBarIndex;
  }
  if (a.poolId !== b.poolId) {
    return a.poolId.localeCompare(b.poolId);
  }
  return a.eventType.localeCompare(b.eventType);
}

function phaseForEvent(
  eventType: AdvancedLiquidityInteractionEvent["eventType"]
): LiquidityLifecyclePhase {
  switch (eventType) {
    case "LIQUIDITY_SWEEP":
      return "SWEPT";
    case "LIQUIDITY_TAKEN":
      return "TAKEN";
    case "LIQUIDITY_RECLAIM":
      return "RECLAIMED";
    default:
      return "UNTOUCHED";
  }
}

/**
 * MSL-7E: derived lifecycle phases from immutable advanced liquidity events (MODEL C).
 * Does not mutate MSL-5 pool objects.
 */
export function deriveMarketStructureLiquidityLifecycle(
  input: DeriveMarketStructureLiquidityLifecycleInput
): LiquidityPoolLifecycleProjection[] {
  const phaseByPool = new Map<string, LiquidityPoolLifecycleProjection>();

  for (const pool of input.pools) {
    phaseByPool.set(pool.poolId, {
      poolId: pool.poolId,
      phase: "UNTOUCHED",
      lastEventId: null,
      lastTriggerBarIndex: null,
    });
  }

  const sorted = [...input.events].sort(compareEvents);

  for (const event of sorted) {
    const entry = phaseByPool.get(event.poolId);
    if (!entry) {
      continue;
    }
    entry.phase = phaseForEvent(event.eventType);
    entry.lastEventId = event.eventId;
    entry.lastTriggerBarIndex = event.triggerBarIndex;
  }

  return [...phaseByPool.values()].sort((a, b) => a.poolId.localeCompare(b.poolId));
}
