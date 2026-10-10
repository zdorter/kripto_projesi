import type { SwingPoint, SwingType } from "../types";
import type {
  MarketStructureScope,
  MarketStructureSnapshot,
  MarketStructureSwingAnnotation,
} from "./market-structure-types";
import {
  MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_MIN_ABS_EPS,
  MARKET_STRUCTURE_EQUALITY_RELATIVE_EPS,
  MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID,
  MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID,
  MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
  type BslCandidate,
  type EqualHighObservation,
  type EqualLowObservation,
  type LiquidityPoolCandidate,
  type LiquidityUnresolvedReason,
  type MarketStructureLiquidityContext,
  type SslCandidate,
} from "./market-structure-liquidity-types";

export {
  MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_MIN_ABS_EPS,
  MARKET_STRUCTURE_EQUALITY_RELATIVE_EPS,
  MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID,
  MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID,
  MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
} from "./market-structure-liquidity-types";

export type {
  BslCandidate,
  EqualHighObservation,
  EqualLowObservation,
  LiquidityPoolCandidate,
  LiquidityUnresolvedReason,
  MarketStructureLiquidityContext,
  SslCandidate,
} from "./market-structure-liquidity-types";

export type MarketStructureSnapshotForLiquidity = Omit<
  MarketStructureSnapshot,
  "liquidity"
>;

export interface BuildMarketStructureLiquidityContextInput {
  snapshot: MarketStructureSnapshotForLiquidity;
}

const STANDARD_LIMITATIONS = [
  "liquidity_foundation_only",
  "not_sweep_not_grab_not_reclaim",
  "not_production_signal",
  "not_mss",
  "does_not_consume_msl4_break",
  "no_ohlc_in_msl5_v1",
  "protected_not_equivalent_to_bsl_ssl",
  "scope_is_metadata_only",
  "equality_hybrid_tolerance_research_v1",
  `liquidity_context_rule_id=${MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID}`,
] as const;

export function pricesEqualHybridTolerance(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return false;
  }
  const mid = (a + b) / 2;
  const threshold = Math.max(
    MARKET_STRUCTURE_EQUALITY_MIN_ABS_EPS,
    MARKET_STRUCTURE_EQUALITY_RELATIVE_EPS * mid
  );
  return Math.abs(a - b) <= threshold;
}

function allAnnotations(
  snapshot: MarketStructureSnapshotForLiquidity
): MarketStructureSwingAnnotation[] {
  return [
    ...snapshot.zigzag.externalStructure,
    ...snapshot.zigzag.internalStructure,
  ];
}

function annotationForPivot(
  snapshot: MarketStructureSnapshotForLiquidity,
  pivotIndex: number,
  type: SwingType
): MarketStructureSwingAnnotation | null {
  return (
    allAnnotations(snapshot).find(
      (a) => a.pivotIndex === pivotIndex && a.type === type
    ) ?? null
  );
}

function scopeForPivot(
  snapshot: MarketStructureSnapshotForLiquidity,
  pivotIndex: number,
  type: SwingType
): MarketStructureScope {
  return annotationForPivot(snapshot, pivotIndex, type)?.scope ?? "UNRESOLVED";
}

function causalSwingsOfType(
  snapshot: MarketStructureSnapshotForLiquidity,
  type: SwingType
): SwingPoint[] {
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  return snapshot.confirmedSwings
    .filter((s) => s.type === type && s.index + rightBars <= E)
    .slice()
    .sort((a, b) => a.index - b.index);
}

function knownAtForSwing(swing: SwingPoint, rightBars: number): number {
  return swing.index + rightBars;
}

function isValidSwingPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

class UnionFind {
  private parent = new Map<number, number>();

  constructor(keys: readonly number[]) {
    for (const k of keys) {
      this.parent.set(k, k);
    }
  }

  find(x: number): number {
    let p = this.parent.get(x)!;
    while (p !== this.parent.get(p)) {
      p = this.parent.get(p)!;
    }
    let cur = x;
    while (cur !== p) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, p);
      cur = next;
    }
    return p;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(rb, ra);
    }
  }

  components(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = groups.get(root) ?? [];
      list.push(key);
      groups.set(root, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a - b);
    }
    return groups;
  }
}

function buildPairwiseObservations(
  swings: readonly SwingPoint[],
  rightBars: number,
  side: "HIGH" | "LOW"
): {
  eqHigh: EqualHighObservation[];
  eqLow: EqualLowObservation[];
  invalidPrices: boolean;
} {
  const eqHigh: EqualHighObservation[] = [];
  const eqLow: EqualLowObservation[] = [];
  let invalidPrices = false;

  for (let i = 0; i < swings.length; i++) {
    if (!isValidSwingPrice(swings[i].price)) {
      invalidPrices = true;
    }
    for (let j = i + 1; j < swings.length; j++) {
      const a = swings[i];
      const b = swings[j];
      if (!isValidSwingPrice(a.price) || !isValidSwingPrice(b.price)) {
        invalidPrices = true;
        continue;
      }
      if (!pricesEqualHybridTolerance(a.price, b.price)) {
        continue;
      }
      const pivotA = Math.min(a.index, b.index);
      const pivotB = Math.max(a.index, b.index);
      const knownAt = Math.max(
        knownAtForSwing(a, rightBars),
        knownAtForSwing(b, rightBars)
      );
      if (side === "HIGH") {
        eqHigh.push({
          ruleId: MARKET_STRUCTURE_EQH_PAIRWISE_OBSERVATION_RULE_ID,
          observationId: `eqh:${pivotA}:${pivotB}`,
          memberPivotIndices: [pivotA, pivotB],
          knownAtBarIndex: knownAt,
          equalityToleranceRuleId:
            MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
        });
      } else {
        eqLow.push({
          ruleId: MARKET_STRUCTURE_EQL_PAIRWISE_OBSERVATION_RULE_ID,
          observationId: `eql:${pivotA}:${pivotB}`,
          memberPivotIndices: [pivotA, pivotB],
          knownAtBarIndex: knownAt,
          equalityToleranceRuleId:
            MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
        });
      }
    }
  }

  eqHigh.sort((x, y) => {
    if (x.memberPivotIndices[0] !== y.memberPivotIndices[0]) {
      return x.memberPivotIndices[0] - y.memberPivotIndices[0];
    }
    return x.memberPivotIndices[1] - y.memberPivotIndices[1];
  });
  eqLow.sort((x, y) => {
    if (x.memberPivotIndices[0] !== y.memberPivotIndices[0]) {
      return x.memberPivotIndices[0] - y.memberPivotIndices[0];
    }
    return x.memberPivotIndices[1] - y.memberPivotIndices[1];
  });

  return { eqHigh, eqLow, invalidPrices };
}

function dedupeObservations<T extends { observationId: string }>(
  items: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.observationId, item);
  }
  return [...map.values()].sort((a, b) =>
    a.observationId.localeCompare(b.observationId)
  );
}

function buildClusters(
  swings: readonly SwingPoint[],
  rightBars: number,
  side: "HIGH" | "LOW"
): {
  clusters: number[][];
  invalidPrices: boolean;
} {
  const keys = swings.map((s) => s.index);
  const uf = new UnionFind(keys);
  let invalidPrices = false;

  for (const s of swings) {
    if (!isValidSwingPrice(s.price)) {
      invalidPrices = true;
    }
  }

  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      const a = swings[i];
      const b = swings[j];
      if (!isValidSwingPrice(a.price) || !isValidSwingPrice(b.price)) {
        continue;
      }
      if (pricesEqualHybridTolerance(a.price, b.price)) {
        uf.union(a.index, b.index);
      }
    }
  }

  const components = uf.components();
  const clusters = [...components.values()].filter((m) => m.length >= 2);
  clusters.sort((a, b) => a[0] - b[0]);

  return { clusters, invalidPrices };
}

function swingByPivot(
  swings: readonly SwingPoint[],
  pivotIndex: number
): SwingPoint | null {
  return swings.find((s) => s.index === pivotIndex) ?? null;
}

function clusterScope(
  snapshot: MarketStructureSnapshotForLiquidity,
  members: readonly number[],
  type: SwingType
): MarketStructureScope {
  const scopes = members.map((p) => scopeForPivot(snapshot, p, type));
  const unique = new Set(scopes);
  if (unique.size === 1) {
    return scopes[0];
  }
  if (scopes.every((s) => s === "UNRESOLVED")) {
    return "UNRESOLVED";
  }
  return "UNRESOLVED";
}

function buildBslCandidates(
  snapshot: MarketStructureSnapshotForLiquidity,
  highs: readonly SwingPoint[]
): { candidates: BslCandidate[]; invalidPrices: boolean } {
  const rightBars = snapshot.confirmationLagBars;
  const map = new Map<number, BslCandidate>();
  let invalidPrices = false;

  for (const swing of highs) {
    if (!isValidSwingPrice(swing.price)) {
      invalidPrices = true;
      continue;
    }
    const confirmation = knownAtForSwing(swing, rightBars);
    const candidate: BslCandidate = {
      ruleId: MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
      candidateId: `bsl:${swing.index}`,
      side: "BSL",
      sourceSwingType: "HIGH",
      price: swing.price,
      sourcePivotIndex: swing.index,
      sourceConfirmationBarIndex: confirmation,
      knownAtBarIndex: confirmation,
      scope: scopeForPivot(snapshot, swing.index, "HIGH"),
      statusAtE: "CANDIDATE",
      selectionReasonCodes: ["SWING_CONFIRMED_HIGH"],
      sharedSourcePivotIndex: swing.index,
    };
    map.set(swing.index, candidate);
  }

  return {
    candidates: [...map.values()].sort(
      (a, b) => a.sourcePivotIndex - b.sourcePivotIndex
    ),
    invalidPrices,
  };
}

function buildSslCandidates(
  snapshot: MarketStructureSnapshotForLiquidity,
  lows: readonly SwingPoint[]
): { candidates: SslCandidate[]; invalidPrices: boolean } {
  const rightBars = snapshot.confirmationLagBars;
  const map = new Map<number, SslCandidate>();
  let invalidPrices = false;

  for (const swing of lows) {
    if (!isValidSwingPrice(swing.price)) {
      invalidPrices = true;
      continue;
    }
    const confirmation = knownAtForSwing(swing, rightBars);
    const candidate: SslCandidate = {
      ruleId: MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
      candidateId: `ssl:${swing.index}`,
      side: "SSL",
      sourceSwingType: "LOW",
      price: swing.price,
      sourcePivotIndex: swing.index,
      sourceConfirmationBarIndex: confirmation,
      knownAtBarIndex: confirmation,
      scope: scopeForPivot(snapshot, swing.index, "LOW"),
      statusAtE: "CANDIDATE",
      selectionReasonCodes: ["SWING_CONFIRMED_LOW"],
      sharedSourcePivotIndex: swing.index,
    };
    map.set(swing.index, candidate);
  }

  return {
    candidates: [...map.values()].sort(
      (a, b) => a.sourcePivotIndex - b.sourcePivotIndex
    ),
    invalidPrices,
  };
}

function buildPools(
  snapshot: MarketStructureSnapshotForLiquidity,
  highs: readonly SwingPoint[],
  lows: readonly SwingPoint[],
  eqhClusters: readonly number[][],
  eqlClusters: readonly number[][]
): LiquidityPoolCandidate[] {
  const rightBars = snapshot.confirmationLagBars;
  const pools: LiquidityPoolCandidate[] = [];
  const poolKeys = new Set<string>();

  const pushPool = (pool: LiquidityPoolCandidate, key: string) => {
    if (poolKeys.has(key)) {
      return;
    }
    poolKeys.add(key);
    pools.push(pool);
  };

  for (const swing of highs) {
    if (!isValidSwingPrice(swing.price)) {
      continue;
    }
    const confirmation = knownAtForSwing(swing, rightBars);
    const poolId = `pool:single-high:${swing.index}`;
    pushPool(
      {
        ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
        poolId,
        poolKind: "SINGLE_HIGH",
        price: swing.price,
        priceBand: { lowerBound: swing.price, upperBound: swing.price },
        sourcePivotIndices: [swing.index],
        sourceConfirmationBarIndices: [confirmation],
        knownAtBarIndex: confirmation,
        scope: scopeForPivot(snapshot, swing.index, "HIGH"),
        memberCount: 1,
        representativePriceRuleId:
          MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
        statusAtE: "CANDIDATE",
      },
      `SINGLE_HIGH:${swing.index}`
    );
  }

  for (const swing of lows) {
    if (!isValidSwingPrice(swing.price)) {
      continue;
    }
    const confirmation = knownAtForSwing(swing, rightBars);
    const poolId = `pool:single-low:${swing.index}`;
    pushPool(
      {
        ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
        poolId,
        poolKind: "SINGLE_LOW",
        price: swing.price,
        priceBand: { lowerBound: swing.price, upperBound: swing.price },
        sourcePivotIndices: [swing.index],
        sourceConfirmationBarIndices: [confirmation],
        knownAtBarIndex: confirmation,
        scope: scopeForPivot(snapshot, swing.index, "LOW"),
        memberCount: 1,
        representativePriceRuleId:
          MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
        statusAtE: "CANDIDATE",
      },
      `SINGLE_LOW:${swing.index}`
    );
  }

  for (const members of eqhClusters) {
    const swings = members
      .map((p) => swingByPivot(highs, p))
      .filter((s): s is SwingPoint => s !== null);
    if (swings.length < 2) {
      continue;
    }
    const prices = swings.map((s) => s.price);
    const earliest = swings.reduce((a, b) => (a.index < b.index ? a : b));
    const confirmations = swings.map((s) => knownAtForSwing(s, rightBars));
    const clusterKey = members.join(",");
    pushPool(
      {
        ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
        poolId: `pool:eqh:${clusterKey}`,
        poolKind: "EQH_CLUSTER",
        price: earliest.price,
        priceBand: {
          lowerBound: Math.min(...prices),
          upperBound: Math.max(...prices),
        },
        sourcePivotIndices: [...members],
        sourceConfirmationBarIndices: confirmations,
        knownAtBarIndex: Math.max(...confirmations),
        scope: clusterScope(snapshot, members, "HIGH"),
        memberCount: members.length,
        representativePriceRuleId:
          MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
        statusAtE: "CANDIDATE",
        clusterRuleId: MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID,
      },
      `EQH_CLUSTER:${clusterKey}`
    );
  }

  for (const members of eqlClusters) {
    const swings = members
      .map((p) => swingByPivot(lows, p))
      .filter((s): s is SwingPoint => s !== null);
    if (swings.length < 2) {
      continue;
    }
    const prices = swings.map((s) => s.price);
    const earliest = swings.reduce((a, b) => (a.index < b.index ? a : b));
    const confirmations = swings.map((s) => knownAtForSwing(s, rightBars));
    const clusterKey = members.join(",");
    pushPool(
      {
        ruleId: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
        poolId: `pool:eql:${clusterKey}`,
        poolKind: "EQL_CLUSTER",
        price: earliest.price,
        priceBand: {
          lowerBound: Math.min(...prices),
          upperBound: Math.max(...prices),
        },
        sourcePivotIndices: [...members],
        sourceConfirmationBarIndices: confirmations,
        knownAtBarIndex: Math.max(...confirmations),
        scope: clusterScope(snapshot, members, "LOW"),
        memberCount: members.length,
        representativePriceRuleId:
          MARKET_STRUCTURE_CLUSTER_REPRESENTATIVE_EARLIEST_PIVOT_RULE_ID,
        statusAtE: "CANDIDATE",
        clusterRuleId: MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID,
      },
      `EQL_CLUSTER:${clusterKey}`
    );
  }

  pools.sort((a, b) => a.poolId.localeCompare(b.poolId));
  return pools;
}

/**
 * MSL-5 research liquidity foundation (consumes MSL-1/2/3 snapshot only; no OHLC, no MSL-4 break).
 */
export function buildMarketStructureLiquidityContext(
  input: BuildMarketStructureLiquidityContextInput
): MarketStructureLiquidityContext {
  const snapshot = input.snapshot;
  const E = snapshot.evaluationBarIndex;
  const rightBars = snapshot.confirmationLagBars;
  const unresolved: LiquidityUnresolvedReason[] = [];
  const limitations: string[] = [...STANDARD_LIMITATIONS];

  const highs = causalSwingsOfType(snapshot, "HIGH");
  const lows = causalSwingsOfType(snapshot, "LOW");

  if (snapshot.confirmedSwings.length === 0) {
    unresolved.push({
      code: "NO_CONFIRMED_SWINGS",
      message: "No confirmed swings at evaluation bar; liquidity lists empty.",
    });
  }

  if (highs.length === 1) {
    limitations.push("single_swing_no_eq_cluster");
  }
  if (lows.length === 1) {
    limitations.push("single_swing_no_eq_cluster");
  }

  const bslResult = buildBslCandidates(snapshot, highs);
  const sslResult = buildSslCandidates(snapshot, lows);

  const highPair = buildPairwiseObservations(highs, rightBars, "HIGH");
  const lowPair = buildPairwiseObservations(lows, rightBars, "LOW");

  const highClusters = buildClusters(highs, rightBars, "HIGH");
  const lowClusters = buildClusters(lows, rightBars, "LOW");

  let invalidPrices =
    bslResult.invalidPrices ||
    sslResult.invalidPrices ||
    highPair.invalidPrices ||
    lowPair.invalidPrices ||
    highClusters.invalidPrices ||
    lowClusters.invalidPrices;

  if (invalidPrices) {
    unresolved.push({
      code: "INVALID_SWING_PRICE",
      message:
        "One or more swing prices were non-finite or <= 0; affected equality/candidates skipped.",
    });
  }

  const equalHighObservations = dedupeObservations(highPair.eqHigh);
  const equalLowObservations = dedupeObservations(lowPair.eqLow);

  const liquidityPools = buildPools(
    snapshot,
    highs,
    lows,
    highClusters.clusters,
    lowClusters.clusters
  );

  for (const c of [...bslResult.candidates, ...sslResult.candidates]) {
    if (c.scope === "UNRESOLVED") {
      limitations.push(`unknown_scope_pivot_${c.sharedSourcePivotIndex}`);
    }
  }

  return {
    schemaVersion: MARKET_STRUCTURE_LIQUIDITY_CONTEXT_SCHEMA_VERSION,
    ruleId: MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
    evaluationBarIndex: E,
    ruleIds: {
      bsl: MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
      ssl: MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
      equality: MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
      eqhCluster: MARKET_STRUCTURE_EQH_CLUSTER_RULE_ID,
      eqlCluster: MARKET_STRUCTURE_EQL_CLUSTER_RULE_ID,
      pool: MARKET_STRUCTURE_LIQUIDITY_POOL_CANDIDATE_RULE_ID,
    },
    bslCandidates: bslResult.candidates,
    sslCandidates: sslResult.candidates,
    equalHighObservations,
    equalLowObservations,
    liquidityPools,
    unresolved,
    limitations,
  };
}
