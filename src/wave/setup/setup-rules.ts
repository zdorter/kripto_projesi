import type { SetupCatalogEntry } from "./setup-types";
import type {
  ConditionEvaluation,
  ConditionOutcome,
  ReferenceLevel,
  SetupConditionId,
  SetupDirectionalBasis,
  SetupDirectionalBias,
  SetupEvaluationContext,
  SetupLifecycleStatus,
} from "./setup-types";
import type { WaveScanResult } from "../wave-scanner";

const STANDARD_SETUP_LIMITATIONS = [
  "Setup detection does not compute entries, stops, targets, risk/reward, leverage, or executable trade directives.",
  "CANDIDATE: structural scenario/context matches catalog; trade-setup confirmation rules are not defined or not complete.",
  "CONFIRMED: reserved for isTradeSetup catalog types when all trade-setup confirmation rules are MET (none in current catalog).",
  "Engine wave CONFIRMED and scenario ACTIVE do not imply setup CONFIRMED.",
  "MTF NESTED_POSSIBLE and hierarchy NESTED_CANDIDATE do not imply parent/child trade confirmation.",
];

export function evaluateCondition(
  conditionId: SetupConditionId,
  ctx: SetupEvaluationContext
): ConditionEvaluation {
  const row = ctx.scanRow;
  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;

  switch (conditionId) {
    case "scenario-active":
      if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Scenario lifecycle is INSUFFICIENT_CONTEXT.",
        };
      }
      return {
        conditionId,
        outcome: row.scenarioStatus === "ACTIVE" ? "MET" : "NOT_MET",
        detail: `Scenario status is ${row.scenarioStatus}.`,
      };

    case "engine-not-invalidated":
      if (row.engineStatus === undefined) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Engine status not present on scan row.",
        };
      }
      return {
        conditionId,
        outcome: row.engineStatus === "INVALIDATED" ? "NOT_MET" : "MET",
        detail: `Engine status is ${row.engineStatus}.`,
      };

    case "segment-defined": {
      const ok =
        row.startIndex >= 0 &&
        row.endIndex >= 0 &&
        row.endIndex >= row.startIndex &&
        Number.isFinite(row.startPrice) &&
        Number.isFinite(row.endPrice) &&
        !(row.startPrice === 0 && row.endPrice === 0);
      if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Scenario marked INSUFFICIENT_CONTEXT; segment not reliable.",
        };
      }
      return {
        conditionId,
        outcome: ok ? "MET" : "NOT_MET",
        detail: ok
          ? `Segment indices ${row.startIndex}–${row.endIndex} with prices.`
          : "Segment indices or prices missing on scan row.",
      };
    }

    case "invalidation-available":
      return {
        conditionId,
        outcome: row.invalidation.available ? "MET" : "NOT_MET",
        detail: row.invalidation.available
          ? "Scenario invalidation object is available."
          : "No invalidation price in scenario layer output.",
      };

    case "setup-invalidation-triggered": {
      const triggered =
        row.scenarioStatus === "INVALIDATED" ||
        row.engineStatus === "INVALIDATED";
      return {
        conditionId,
        outcome: triggered ? "MET" : "NOT_MET",
        detail: triggered
          ? "Scenario or engine leg is INVALIDATED."
          : "No invalidation trigger on scenario/engine status.",
      };
    }

    case "ht-trend-context":
      if (!mtf) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Higher-timeframe bundle not in optional MTF context.",
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Higher TF trend ${mtf.trendAlignment.higherTrend}.`,
      };

    case "mtf-context-present":
      return {
        conditionId,
        outcome: mtf ? "MET" : "INSUFFICIENT_DATA",
        detail: mtf
          ? "Multi-timeframe state supplied for symbol."
          : "MTF context missing from scan report optionalMtfBySymbol.",
      };

    case "mtf-relationship-allows": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "No MTF context; relationship not evaluated.",
        };
      }
      const kind = mtf.relationship.kind;
      const allows = kind === "ALIGNED" || kind === "NESTED_POSSIBLE";
      return {
        conditionId,
        outcome: allows ? "MET" : "NOT_MET",
        detail: `MTF relationship ${kind} (${mtf.relationship.summary}).`,
      };
    }

    case "mtf-relationship-aligned": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "MTF required but missing.",
        };
      }
      const kind = mtf.relationship.kind;
      return {
        conditionId,
        outcome: kind === "ALIGNED" ? "MET" : "NOT_MET",
        detail:
          kind === "NESTED_POSSIBLE"
            ? "NESTED_POSSIBLE does not satisfy aligned confirmation."
            : `MTF relationship ${kind}.`,
      };
    }

    case "hierarchy-context-present":
      return {
        conditionId,
        outcome: hierarchy ? "MET" : "NOT_APPLICABLE",
        detail: hierarchy
          ? "Hierarchy report present."
          : "No hierarchy in optional context.",
      };

    case "hierarchy-time-contained": {
      if (!hierarchy) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Hierarchy report required for this confirmation.",
        };
      }
      const pair = hierarchy.primaryPair;
      if (!pair) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "No hierarchy primary pair.",
        };
      }
      return {
        conditionId,
        outcome:
          pair.timeRelation === "TIME_CONTAINED" ? "MET" : "NOT_MET",
        detail: `Primary pair time relation ${pair.timeRelation}; nesting ${pair.relationship}.`,
      };
    }

    case "hierarchy-nesting-not-confirmed": {
      if (!hierarchy?.primaryPair) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "No hierarchy primary pair to mis-label as confirmed nesting.",
        };
      }
      const rel = hierarchy.primaryPair.relationship;
      if (rel === "NESTED_CANDIDATE" || rel === "POSSIBLE_NESTING") {
        return {
          conditionId,
          outcome: "MET",
          detail: `${rel} is not treated as confirmed parent/child.`,
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Hierarchy relationship ${rel} — no false parent/child confirmation.`,
      };
    }

    case "fib-context-available":
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Fibonacci context is not part of WaveScanReport input contract.",
      };

    case "presentation-trend-alignment": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "MTF not supplied.",
        };
      }
      const cmp = mtf.trendAlignment.comparison;
      return {
        conditionId,
        outcome:
          cmp === "SAME" || cmp === "PARTIAL_NEUTRAL" ? "MET" : "NOT_MET",
        detail: `Trend comparison ${cmp} (higher ${mtf.trendAlignment.higherTrend}, lower ${mtf.trendAlignment.lowerTrend}).`,
      };
    }

    default:
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Unknown condition id.",
      };
  }
}

function allRequiredMet(evaluations: ConditionEvaluation[]): boolean {
  return evaluations.every((e) => e.outcome === "MET");
}

function hasInsufficientData(evaluations: ConditionEvaluation[]): boolean {
  return evaluations.some((e) => e.outcome === "INSUFFICIENT_DATA");
}

export function resolveSetupLifecycleStatus(
  row: WaveScanResult,
  catalog: SetupCatalogEntry,
  triggerEvals: ConditionEvaluation[],
  confirmationEvals: ConditionEvaluation[],
  invalidationEvals: ConditionEvaluation[],
  contextInsufficient: boolean
): SetupLifecycleStatus {
  if (row.scenarioStatus === "INVALIDATED") {
    return "INVALID";
  }

  if (contextInsufficient) {
    return "INSUFFICIENT_CONTEXT";
  }

  if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }

  const invalidationTriggered = invalidationEvals.some(
    (e) =>
      e.conditionId === "setup-invalidation-triggered" && e.outcome === "MET"
  );
  if (invalidationTriggered) {
    return "INVALID";
  }

  const requiredEvals = [...triggerEvals, ...confirmationEvals];
  if (hasInsufficientData(requiredEvals)) {
    return "INSUFFICIENT_CONTEXT";
  }

  const triggerReady = allRequiredMet(triggerEvals);
  const confirmationReady = allRequiredMet(confirmationEvals);

  if (triggerReady && confirmationReady) {
    if (catalog.isTradeSetup) {
      return "CONFIRMED";
    }
    return "CANDIDATE";
  }

  if (row.scenarioStatus === "ACTIVE" || triggerReady) {
    return "CANDIDATE";
  }

  return "INSUFFICIENT_CONTEXT";
}

export function catalogMatchesScanRow(
  entry: SetupCatalogEntry,
  row: WaveScanResult
): boolean {
  if (entry.allowedRoles && !entry.allowedRoles.includes(row.role)) {
    return false;
  }
  if (
    entry.allowedStructures &&
    !entry.allowedStructures.includes(row.structure)
  ) {
    return false;
  }
  if (
    entry.allowedWaveLabels &&
    !entry.allowedWaveLabels.includes(row.waveLabel)
  ) {
    return false;
  }
  return true;
}

export function resolveDirectionalBias(
  row: WaveScanResult,
  ctx: SetupEvaluationContext
): { bias: SetupDirectionalBias | null; basis: SetupDirectionalBasis } {
  const mtf = ctx.symbolContext?.multiTimeframe;
  const bundle =
    mtf?.higherTimeframe.timeframeId === row.timeframe
      ? mtf.higherTimeframe
      : mtf?.lowerTimeframe.timeframeId === row.timeframe
        ? mtf.lowerTimeframe
        : undefined;

  if (row.structure === "IMPULSE" && bundle) {
    const track = bundle.presentation.tracks.selectedImpulse;
    if (track.countDirection === "BULLISH" || track.countDirection === "BEARISH") {
      return {
        bias: track.countDirection,
        basis: "IMPULSE_COUNT_DIRECTION",
      };
    }
  }

  if (row.waveLabel === "5" || row.waveLabel === "C") {
    return { bias: null, basis: null };
  }

  if (
    Number.isFinite(row.startPrice) &&
    Number.isFinite(row.endPrice) &&
    row.startPrice !== row.endPrice
  ) {
    return {
      bias: row.endPrice > row.startPrice ? "BULLISH" : "BEARISH",
      basis: "LEG_PRICE_DELTA",
    };
  }

  return { bias: null, basis: null };
}

export function buildReferenceLevels(
  row: WaveScanResult,
  ctx: SetupEvaluationContext
): ReferenceLevel[] {
  const levels: ReferenceLevel[] = [
    {
      kind: "SEGMENT_START",
      label: "Segment start",
      price: row.startPrice,
      index: row.startIndex,
      timeframe: row.timeframe,
    },
    {
      kind: "SEGMENT_END",
      label: "Segment end",
      price: row.endPrice,
      index: row.endIndex,
      timeframe: row.timeframe,
    },
  ];

  if (row.invalidation.available && row.invalidation.price !== undefined) {
    levels.push({
      kind: "SCENARIO_INVALIDATION",
      label: "Scenario invalidation",
      price: row.invalidation.price,
      note: row.invalidation.rule,
      invalidationSource: row.invalidation.source,
    });
  }

  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;

  if (mtf && row.role === "PRIMARY") {
    const lower = mtf.lowerTimeframe.primaryFocus;
    if (lower.startPrice !== null && lower.endPrice !== null) {
      levels.push({
        kind: "MTF_LOWER_SEGMENT_START",
        label: "Lower TF primary segment start",
        price: lower.startPrice,
        index: lower.startIndex ?? undefined,
        timeframe: mtf.lowerTimeframe.timeframeId,
      });
      levels.push({
        kind: "MTF_LOWER_SEGMENT_END",
        label: "Lower TF primary segment end",
        price: lower.endPrice,
        index: lower.endIndex ?? undefined,
        timeframe: mtf.lowerTimeframe.timeframeId,
      });
    }
  }

  if (hierarchy?.primaryPair) {
    const pp = hierarchy.primaryPair;
    levels.push({
      kind: "HIERARCHY_HIGHER_SEGMENT",
      label: `Higher ${pp.higherWave.structure} ${pp.higherWave.label}`,
      price: pp.higherWave.lowPrice,
      index: pp.higherWave.startIndex,
      timeframe: hierarchy.higherTimeframe,
      note: pp.reason,
    });
    levels.push({
      kind: "HIERARCHY_LOWER_SEGMENT",
      label: `Lower ${pp.lowerWave.structure} ${pp.lowerWave.label}`,
      price: pp.lowerWave.lowPrice,
      index: pp.lowerWave.startIndex,
      timeframe: hierarchy.lowerTimeframe,
      note: pp.relationship,
    });
  }

  return levels;
}

export function summarizeConditions(
  evaluations: ConditionEvaluation[],
  prefix: string
): string {
  const parts = evaluations.map((e) => `${e.conditionId}=${e.outcome}`);
  return `${prefix}: ${parts.join("; ")}`;
}

export function standardSetupLimitations(): string[] {
  return [...STANDARD_SETUP_LIMITATIONS];
}

export function isContextInsufficientForCatalog(
  entry: SetupCatalogEntry,
  ctx: SetupEvaluationContext
): boolean {
  if (!entry.requiresMtf) {
    return false;
  }
  return !ctx.symbolContext?.multiTimeframe;
}
