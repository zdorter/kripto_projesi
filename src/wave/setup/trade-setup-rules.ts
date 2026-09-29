import { evaluateCondition } from "./setup-rules";
import type { ConditionEvaluation, SetupLifecycleStatus } from "./setup-types";
import type { SetupConditionId } from "./setup-types";
import type { WaveScanResult } from "../wave-scanner";
import type {
  SymbolEvaluationBundle,
  TradeSetupCatalogEntry,
  TradeSetupConditionId,
  TradeSetupEvaluationContextRow,
} from "./trade-setup-types";
import type { WaveLabel } from "../types";

const IMPULSE_PHASE_LABELS: WaveLabel[] = ["3", "4", "5"];
const FIB_W12_MIN_CONFORMANCE = 0.01;

function legDiagnostic(
  bundle: SymbolEvaluationBundle,
  structure: "IMPULSE" | "CORRECTIVE",
  label: WaveLabel
) {
  return bundle.diagnostics.waveLegs.find(
    (l) => l.structure === structure && l.label === label
  );
}

function waveAtBar(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel
): { status: string; endIndex: number; structureConflict?: boolean } | null {
  const w = bundle.presentation.engine.flatWaves.find((x) => x.label === label);
  if (!w) {
    return null;
  }
  return w;
}

function legConfirmedAtOrBeforeBar(
  bundle: SymbolEvaluationBundle,
  label: WaveLabel
): boolean {
  if (!bundle.evaluationBarBoundaryEstablished) {
    return false;
  }
  const w = waveAtBar(bundle, label);
  if (!w) {
    return false;
  }
  if (w.status === "POTENTIAL") {
    return false;
  }
  if (w.status !== "CONFIRMED") {
    return false;
  }
  return w.endIndex <= bundle.evaluationBarIndex;
}

export function evaluateTradeCondition(
  conditionId: TradeSetupConditionId,
  ctx: TradeSetupEvaluationContextRow
): ConditionEvaluation {
  const row = ctx.scanRow;
  const bundle = ctx.bundle;

  switch (conditionId) {
    case "evaluation-bar-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Symbol evaluation bundle missing from TradeSetupEvaluationContext.",
        };
      }
      if (!bundle.evaluationBarBoundaryEstablished) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: bundle.evaluationBarContractDetail,
        };
      }
      if (
        bundle.evaluationBarIndex < 0 ||
        bundle.evaluationBarIndex >= bundle.candleCount
      ) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: `evaluationBarIndex ${bundle.evaluationBarIndex} out of range.`,
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Closed evaluation bar index ${bundle.evaluationBarIndex}: ${bundle.evaluationBarContractDetail}`,
      };

    case "impulse-context-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const w1 = legDiagnostic(bundle, "IMPULSE", "1");
      const w2 = legDiagnostic(bundle, "IMPULSE", "2");
      if (w1 && w2) {
        return {
          conditionId,
          outcome: "MET",
          detail: "Impulse waves 1 and 2 present in diagnostics snapshot.",
        };
      }
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Impulse waves 1–2 not available in diagnostics snapshot.",
      };

    case "corrective-abc-context-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const a = legDiagnostic(bundle, "CORRECTIVE", "A");
      const b = legDiagnostic(bundle, "CORRECTIVE", "B");
      const c = legDiagnostic(bundle, "CORRECTIVE", "C");
      if (a && b && c) {
        return {
          conditionId,
          outcome: "MET",
          detail: "Corrective A, B, and C legs present in diagnostics snapshot.",
        };
      }
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Corrective A-B-C context incomplete in diagnostics snapshot.",
      };

    case "impulse-continuation-phase-active": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const focusLabel = row.waveLabel;
      if (!IMPULSE_PHASE_LABELS.includes(focusLabel)) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: `Scenario wave ${focusLabel} is not impulse continuation phase (3/4/5).`,
        };
      }
      const w = waveAtBar(bundle, focusLabel);
      if (!w || w.endIndex > bundle.evaluationBarIndex) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Impulse phase leg not visible within evaluation bar window.",
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Impulse wave ${focusLabel} segment within evaluation boundary.`,
      };
    }

    case "c-leg-started":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const cLeg = legDiagnostic(bundle, "CORRECTIVE", "C");
      if (!cLeg || cLeg.startIndex > bundle.evaluationBarIndex) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Wave C not started within evaluation bar window.",
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: "Wave C leg started within evaluation boundary.",
      };

    case "w2-not-invalidated": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const w2 = waveAtBar(bundle, "2");
      if (!w2) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "Wave 2 not in engine snapshot.",
        };
      }
      return {
        conditionId,
        outcome: w2.status === "INVALIDATED" ? "NOT_MET" : "MET",
        detail: `Wave 2 status ${w2.status}.`,
      };
    }

    case "w4-structure-conflict-clear": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const w4 = waveAtBar(bundle, "4");
      if (!w4) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "Wave 4 not present.",
        };
      }
      return {
        conditionId,
        outcome: w4.structureConflict ? "NOT_MET" : "MET",
        detail: w4.structureConflict
          ? "Wave 4 structure conflict flagged by engine."
          : "Wave 4 has no structure conflict.",
      };
    }

    case "impulse-leading-leg-confirmed-at-bar": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const label = row.waveLabel;
      if (!IMPULSE_PHASE_LABELS.includes(label)) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Not an impulse continuation leg label.",
        };
      }
      const ok = legConfirmedAtOrBeforeBar(bundle, label);
      return {
        conditionId,
        outcome: ok ? "MET" : "NOT_MET",
        detail: ok
          ? `Impulse wave ${label} CONFIRMED at or before evaluation bar.`
          : `Impulse wave ${label} is POTENTIAL or beyond evaluation bar.`,
      };
    }

    case "c-leg-confirmed-at-bar":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const ok = legConfirmedAtOrBeforeBar(bundle, "C");
      return {
        conditionId,
        outcome: ok ? "MET" : "NOT_MET",
        detail: ok
          ? "Wave C CONFIRMED at or before evaluation bar."
          : "Wave C not CONFIRMED at evaluation bar (POTENTIAL or open).",
      };

    case "fib-w12-conformance-met":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required.",
        };
      }
      const fib = bundle.diagnostics.fibonacci;
      if (!fib.available) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: fib.note ?? "W1–W2 fibonacci not in diagnostics snapshot.",
        };
      }
      const score = fib.conformanceScore ?? 0;
      const hasMatch = fib.nearestMatch != null;
      if (hasMatch && score >= FIB_W12_MIN_CONFORMANCE) {
        return {
          conditionId,
          outcome: "MET",
          detail: "W1–W2 fibonacci conformance present in snapshot.",
        };
      }
      return {
        conditionId,
        outcome: "NOT_MET",
        detail: "W1–W2 fibonacci conformance not met in snapshot.",
      };

    case "fib-abc-conformance-met":
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail:
          "A-B-C fibonacci is not part of current diagnostics contract; correction-end cannot confirm fib.",
      };

    default:
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Unknown trade condition.",
      };
  }
}

const SHARED_TRADE_PREREQUISITES: SetupConditionId[] = [
  "scenario-active",
  "engine-not-invalidated",
  "invalidation-available",
  "segment-defined",
];

function allMet(evaluations: ConditionEvaluation[]): boolean {
  return evaluations.every((e) => e.outcome === "MET");
}

function hasInsufficient(evaluations: ConditionEvaluation[]): boolean {
  return evaluations.some((e) => e.outcome === "INSUFFICIENT_DATA");
}

export function resolveTradeSetupLifecycleStatus(
  row: WaveScanResult,
  entry: TradeSetupCatalogEntry,
  prerequisiteEvals: ConditionEvaluation[],
  triggerEvals: ConditionEvaluation[],
  tradeConfirmationEvals: ConditionEvaluation[],
  invalidationEvals: ConditionEvaluation[]
): SetupLifecycleStatus {
  if (row.scenarioStatus === "INVALIDATED") {
    return "INVALID";
  }

  const invalidationTriggered = invalidationEvals.some(
    (e) =>
      e.conditionId === "setup-invalidation-triggered" && e.outcome === "MET"
  );
  if (invalidationTriggered) {
    return "INVALID";
  }

  if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }

  const required = [
    ...prerequisiteEvals,
    ...triggerEvals,
    ...tradeConfirmationEvals,
  ];
  if (hasInsufficient(required)) {
    return "INSUFFICIENT_CONTEXT";
  }

  const prereqReady = allMet(prerequisiteEvals);
  const triggerReady = allMet(triggerEvals);
  const confirmReady = allMet(tradeConfirmationEvals);

  if (prereqReady && triggerReady && confirmReady) {
    return "CONFIRMED";
  }

  if (prereqReady || triggerReady || row.scenarioStatus === "ACTIVE") {
    return "CANDIDATE";
  }

  return "INSUFFICIENT_CONTEXT";
}

export function evaluateSharedTradePrerequisites(
  ctx: TradeSetupEvaluationContextRow
): ConditionEvaluation[] {
  const base = { scanRow: ctx.scanRow, symbolContext: ctx.symbolContext };
  return SHARED_TRADE_PREREQUISITES.map((id) => evaluateCondition(id, base));
}

export function resolveTradeDirectionalBias(
  ctx: TradeSetupEvaluationContextRow
): {
  bias: "BULLISH" | "BEARISH" | null;
  basis: "IMPULSE_COUNT_DIRECTION" | null;
} {
  const bundle = ctx.bundle;
  if (!bundle) {
    return { bias: null, basis: null };
  }
  const track = bundle.presentation.tracks.selectedImpulse;
  if (
    track.countDirection === "BULLISH" ||
    track.countDirection === "BEARISH"
  ) {
    return { bias: track.countDirection, basis: "IMPULSE_COUNT_DIRECTION" };
  }
  return { bias: null, basis: null };
}

export function overlapFiveCNote(
  bundle: SymbolEvaluationBundle | undefined
): string | undefined {
  if (!bundle) {
    return undefined;
  }
  const hit = bundle.diagnostics.overlaps.some((o) => {
    const labels = o.legs.map((l) => `${l.structure}${l.label}`);
    return labels.some((x) => x.includes("5")) && labels.some((x) => x.includes("C"));
  });
  if (hit) {
    return "Impulse Wave 5 and corrective Wave C share segment context; no ranking or winner selection applied.";
  }
  return undefined;
}
