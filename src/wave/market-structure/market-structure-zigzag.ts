import {
  classifyHighStructure,
  classifyLowStructure,
} from "../trend-detector";
import type { SwingPoint } from "../types";
import {
  MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  type EqualStructureDiagnostic,
  type MarketStructureScope,
  type MarketStructureSwingAnnotation,
  type MarketStructureSwingLabel,
  type MarketStructureZigzagContext,
} from "./market-structure-types";

const PRICE_EQUAL_EPS = 1e-9;

/**
 * Same extremum-merge semantics as `mergeSameTypeSwings` in wave-detector.ts
 * (not imported to avoid coupling MSL foundation to Elliott wave detection).
 */
export function mergeSameTypeSwingsForZigzag(swings: readonly SwingPoint[]): SwingPoint[] {
  if (swings.length === 0) {
    return [];
  }
  const out: SwingPoint[] = [swings[0]];
  for (let i = 1; i < swings.length; i++) {
    const prev = out[out.length - 1];
    const cur = swings[i];
    if (prev.type !== cur.type) {
      out.push(cur);
      continue;
    }
    if (cur.type === "HIGH") {
      if (cur.price >= prev.price) {
        out[out.length - 1] = cur;
      }
    } else if (cur.price <= prev.price) {
      out[out.length - 1] = cur;
    }
  }
  return out;
}

function swingKey(s: Pick<SwingPoint, "index" | "type">): string {
  return `${s.index}:${s.type}`;
}

function structureLabelForSwing(
  swing: SwingPoint,
  prevHigh: SwingPoint | null,
  prevLow: SwingPoint | null
): MarketStructureSwingLabel {
  if (swing.type === "HIGH") {
    if (!prevHigh) {
      return "UNKNOWN";
    }
    return classifyHighStructure(prevHigh, swing);
  }
  if (!prevLow) {
    return "UNKNOWN";
  }
  return classifyLowStructure(prevLow, swing);
}

function equalDiagnostic(
  swing: SwingPoint,
  prevSameType: SwingPoint | null
): EqualStructureDiagnostic {
  if (!prevSameType) {
    return "NONE";
  }
  if (Math.abs(swing.price - prevSameType.price) <= PRICE_EQUAL_EPS) {
    return swing.type === "HIGH" ? "EQUAL_HIGH" : "EQUAL_LOW";
  }
  return "NONE";
}

function annotateSwing(
  swing: SwingPoint,
  scope: MarketStructureScope,
  rightBars: number,
  structureLabel: MarketStructureSwingLabel,
  equalStructureDiagnostic: EqualStructureDiagnostic
): MarketStructureSwingAnnotation {
  const confirmationBarIndex = swing.index + rightBars;
  return {
    pivotIndex: swing.index,
    time: swing.time,
    price: swing.price,
    type: swing.type,
    strength: swing.strength,
    confirmationBarIndex,
    knownAtBarIndex: confirmationBarIndex,
    structureLabel,
    scope,
    equalStructureDiagnostic,
    source: MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  };
}

function resolveScope(
  swing: SwingPoint,
  spineKeys: Set<string>,
  spine: readonly SwingPoint[]
): MarketStructureScope {
  if (spineKeys.has(swingKey(swing))) {
    return "EXTERNAL";
  }
  for (let i = 0; i < spine.length - 1; i++) {
    const left = spine[i].index;
    const right = spine[i + 1].index;
    if (swing.index > left && swing.index < right) {
      return "INTERNAL";
    }
  }
  return "UNRESOLVED";
}

export function buildMarketStructureZigzagContext(
  confirmedSwings: readonly SwingPoint[],
  rightBars: number,
  evaluationBarIndex: number
): MarketStructureZigzagContext {
  const ordered = [...confirmedSwings].sort((a, b) => a.index - b.index);
  const spine = mergeSameTypeSwingsForZigzag(ordered);
  const spineKeys = new Set(spine.map(swingKey));

  const internalStructure: MarketStructureSwingAnnotation[] = [];
  let prevHigh: SwingPoint | null = null;
  let prevLow: SwingPoint | null = null;

  for (const swing of ordered) {
    if (swing.index + rightBars > evaluationBarIndex) {
      continue;
    }
    const prevSame = swing.type === "HIGH" ? prevHigh : prevLow;
    const structureLabel = structureLabelForSwing(swing, prevHigh, prevLow);
    const eq = equalDiagnostic(swing, prevSame);
    if (swing.type === "HIGH") {
      prevHigh = swing;
    } else {
      prevLow = swing;
    }
    const scope = resolveScope(swing, spineKeys, spine);
    if (scope === "INTERNAL") {
      internalStructure.push(
        annotateSwing(swing, scope, rightBars, structureLabel, eq)
      );
    }
  }

  let spinePrevHigh: SwingPoint | null = null;
  let spinePrevLow: SwingPoint | null = null;
  const zigzagSpine: MarketStructureSwingAnnotation[] = [];
  for (const swing of spine) {
    if (swing.index + rightBars > evaluationBarIndex) {
      continue;
    }
    const prevSame = swing.type === "HIGH" ? spinePrevHigh : spinePrevLow;
    const structureLabel = structureLabelForSwing(swing, spinePrevHigh, spinePrevLow);
    const eq = equalDiagnostic(swing, prevSame);
    if (swing.type === "HIGH") {
      spinePrevHigh = swing;
    } else {
      spinePrevLow = swing;
    }
    zigzagSpine.push(annotateSwing(swing, "EXTERNAL", rightBars, structureLabel, eq));
  }

  return {
    ruleId: MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
    zigzagSpine,
    externalStructure: zigzagSpine,
    internalStructure,
  };
}

export function zigzagSpineAlternatesTypes(spine: readonly MarketStructureSwingAnnotation[]): boolean {
  for (let i = 1; i < spine.length; i++) {
    if (spine[i].type === spine[i - 1].type) {
      return false;
    }
  }
  return true;
}
