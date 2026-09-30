import type { EntryPlanCandidate } from "../wave/setup/entry-plan-types";
import { buildObjectiveTargetSourceContextForPlan } from "../wave/setup/objective-target-production-context";
import {
  auditFibonacciAnchorLookahead,
  buildDiagnosticRatioProjections,
  buildImpulsePivotDiagnostics,
  compareDiagnosticsToPivotPrices,
  diagnosticProjectionGeometry,
  extractW1W2FibonacciAnchors,
} from "../wave/setup/fibonacci-anchor-semantics";
import type { SymbolEvaluationBundle } from "../wave/setup/trade-setup-types";
import type { FibExtensionLevel } from "../wave/fibonacci";

export interface RealMarketFibonacciAnchorModelDiagnostic {
  ratios: { ratio: FibExtensionLevel; price: number | null }[];
  geometryByRatio: Record<
    string,
    {
      aboveSegmentEnvelope: boolean | null;
      aboveEntryReference: boolean | null;
    }
  >;
}

export interface RealMarketFibonacciAnchorDiagnostic {
  setupId: string;
  waveLabel: string;
  evaluationBarIndex: number;
  anchors: {
    w1StartIndex: number | null;
    w1StartPrice: number | null;
    w1EndIndex: number | null;
    w1EndPrice: number | null;
    w2EndIndex: number | null;
    w2EndPrice: number | null;
  };
  pivots: ReturnType<typeof buildImpulsePivotDiagnostics>;
  diagnosticsVsPivot: ReturnType<typeof compareDiagnosticsToPivotPrices> | null;
  models: {
    MODEL_A: RealMarketFibonacciAnchorModelDiagnostic;
    MODEL_B: RealMarketFibonacciAnchorModelDiagnostic;
  };
  lookahead: {
    maxAnchorIndex: number | null;
    safe: boolean;
    findings: string[];
  };
  projectionScopeNote: string;
}

export function buildFibonacciAnchorDiagnostic(input: {
  plan: EntryPlanCandidate;
  bundle: SymbolEvaluationBundle;
  entryReferencePrice?: number | null;
}): RealMarketFibonacciAnchorDiagnostic {
  const { plan, bundle, entryReferencePrice = null } = input;
  const context = buildObjectiveTargetSourceContextForPlan(plan, bundle);
  const fib = context.diagnostics?.fibonacci;
  const w1w2 = extractW1W2FibonacciAnchors(fib);
  const pivots = buildImpulsePivotDiagnostics(
    bundle.diagnostics.waveLegs,
    context.diagnostics?.confirmedSwings ?? [],
    plan.evaluationBar.evaluationBarIndex
  );
  const diagnosticsVsPivot = w1w2
    ? compareDiagnosticsToPivotPrices(w1w2, pivots)
    : null;

  const emptyModel = (): RealMarketFibonacciAnchorModelDiagnostic => ({
    ratios: [],
    geometryByRatio: {},
  });

  let modelA = emptyModel();
  let modelB = emptyModel();
  if (w1w2) {
    const { modelA: aRows, modelB: bRows } = buildDiagnosticRatioProjections(w1w2);
    const geomFor = (price: number | null) =>
      diagnosticProjectionGeometry(plan, price, entryReferencePrice);
    modelA = {
      ratios: aRows,
      geometryByRatio: Object.fromEntries(
        aRows.map((r) => {
          const g = geomFor(r.price);
          return [
            String(r.ratio),
            {
              aboveSegmentEnvelope: g.aboveSegmentEnvelope,
              aboveEntryReference: g.aboveEntryReference,
            },
          ];
        })
      ),
    };
    modelB = {
      ratios: bRows,
      geometryByRatio: Object.fromEntries(
        bRows.map((r) => {
          const g = geomFor(r.price);
          return [
            String(r.ratio),
            {
              aboveSegmentEnvelope: g.aboveSegmentEnvelope,
              aboveEntryReference: g.aboveEntryReference,
            },
          ];
        })
      ),
    };
  }

  const lookahead = auditFibonacciAnchorLookahead({
    evaluationBarIndex: plan.evaluationBar.evaluationBarIndex,
    fib,
    confirmedSwingsAtBar: context.diagnostics?.confirmedSwings ?? [],
    sourceScenarioStartIndex: plan.sourceScenario.startIndex,
    sourceScenarioEndIndex: plan.sourceScenario.endIndex,
  });

  return {
    setupId: plan.setupRef.setupId,
    waveLabel: plan.scenarioRef.waveLabel,
    evaluationBarIndex: plan.evaluationBar.evaluationBarIndex,
    anchors: {
      w1StartIndex: w1w2?.w1StartIndex ?? null,
      w1StartPrice: w1w2?.w1StartPriceCandleExtreme ?? null,
      w1EndIndex: w1w2?.w1EndIndex ?? null,
      w1EndPrice: w1w2?.w1EndPriceCandleExtreme ?? null,
      w2EndIndex: w1w2?.w2EndIndex ?? null,
      w2EndPrice: w1w2?.w2EndPriceCandleExtreme ?? null,
    },
    pivots,
    diagnosticsVsPivot,
    models: {
      MODEL_A: modelA,
      MODEL_B: modelB,
    },
    lookahead,
    projectionScopeNote:
      "Fibonacci W1–W2 anchors are track-level (selected impulse sequence); setup segment is scenario sourceScenario — W3/W4 setups share the same track anchors at a given evaluation bar.",
  };
}
