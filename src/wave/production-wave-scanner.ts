import type { Candle, WaveEngineOptions } from "./types";
import { runWaveScan } from "./wave-scanner";
import { detectSetups } from "./setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "./setup/trade-setup-context";
import { resolveTradeSetupEvaluationBoundary } from "./setup/trade-setup-evaluation-bar";
import { detectProspectiveSetupProduction } from "./setup/prospective-setup-production";
import type { ProspectiveSetupProductionCandidate } from "./setup/prospective-setup-production-types";
import { evaluateProspectiveReferenceBundle } from "./setup/prospective-reference-evaluation";
import { PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY } from "./setup/prospective-open-leg-displacement-equality-policy";
import type { SetupCandidate } from "./setup/setup-types";
import type { ProspectiveReferenceEvaluation } from "./setup/prospective-reference-evaluation";
import { enrichProspectiveSetupOutcomeReplay } from "./setup/prospective-setup-outcome-replay-enrichment";
import {
  presentWaveScannerRow,
  type ProductionWaveScannerComposedRow,
} from "./wave-scanner-presentation";
import type { WaveScannerReportPresentation } from "./wave-scanner-presentation-types";

export const PRODUCTION_WAVE_SCANNER_SCHEMA_VERSION = "1.0" as const;

export interface ProductionWaveScannerRunInput {
  symbols: string[];
  candlesBySymbol: Record<string, Candle[]>;
  timeframeId: string;
  engineOptions?: WaveEngineOptions;
  generatedAt?: string;
  /** Per-symbol live ticker for trade evaluation entry freshness only. */
  liveMarketPriceBySymbol?: Record<string, number | null>;
  /** Opt-in post-evaluation outcome replay (default off). */
  includeOutcomeReplay?: boolean;
  outcomeReplayHorizonBars?: number;
}

export interface ProductionWaveScannerSymbolComposeOptions {
  /**
   * Historical evaluation bar E (inclusive). Omit for MVP default: last closed candle.
   */
  evaluationBarIndex?: number;
}

export interface ProductionWaveScannerSymbolInput {
  symbol: string;
  candles: Candle[];
  timeframeId: string;
  engineOptions?: WaveEngineOptions;
  composeOptions?: ProductionWaveScannerSymbolComposeOptions;
}

export const PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE =
  "EVALUATION_BAR_OUT_OF_RANGE" as const;

function emptyReference(): ProspectiveReferenceEvaluation {
  return {
    schemaVersion: "1.0",
    prospectiveId: "",
    entry: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
    },
    stop: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
    },
    target: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
      policyId: PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY,
    },
    rr: { outcome: "INSUFFICIENT_CONTEXT", ratio: null },
    readyForFurtherEvaluation: false,
    limitations: [],
  };
}

/**
 * Deterministic display pick per symbol (status depth, then id). Not a trade-quality ranking.
 */
export function selectDisplayProspectiveCandidate(
  rows: Array<{
    production: ProspectiveSetupProductionCandidate;
    references: ProspectiveReferenceEvaluation;
    historicalSetup: SetupCandidate;
  }>
): (typeof rows)[number] | null {
  if (rows.length === 0) {
    return null;
  }
  const rank = (r: (typeof rows)[number]) => {
    if (r.references.readyForFurtherEvaluation) {
      return 0;
    }
    if (r.production.status === "CONFIRMED") {
      return 1;
    }
    if (r.production.status === "CANDIDATE") {
      return 2;
    }
    if (r.production.status === "INVALIDATED") {
      return 3;
    }
    return 4;
  };
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) {
      return d;
    }
    return a.production.id.localeCompare(b.production.id);
  })[0]!;
}

function resolveProductionComposeEvaluationBar(
  candles: Candle[],
  explicitEvaluationBarIndex?: number
):
  | { ok: true; evaluationBarIndex: number }
  | { ok: false; loadError: string } {
  if (explicitEvaluationBarIndex !== undefined) {
    if (!Number.isFinite(explicitEvaluationBarIndex)) {
      return {
        ok: false,
        loadError: PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE,
      };
    }
    const evaluationBarIndex = Math.floor(explicitEvaluationBarIndex);
    if (evaluationBarIndex < 0 || evaluationBarIndex >= candles.length) {
      return {
        ok: false,
        loadError: PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE,
      };
    }
    return { ok: true, evaluationBarIndex };
  }

  const boundary = resolveTradeSetupEvaluationBoundary({
    candles,
    closedSeriesOnly: true,
  });
  if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
    return { ok: false, loadError: "EVALUATION_BAR_NOT_ESTABLISHED" };
  }
  return { ok: true, evaluationBarIndex: boundary.evaluationBarIndex };
}

export type ProductionComposedCandidate = {
  production: ProspectiveSetupProductionCandidate;
  references: ProspectiveReferenceEvaluation;
  historicalSetup: SetupCandidate;
};

export type ProductionCompositionAtEvaluationBar =
  | {
      kind: "success";
      symbol: string;
      timeframeId: string;
      evaluationBarIndex: number;
      evaluationBarTime: number | null;
      candleCount: number;
      candidates: ProductionComposedCandidate[];
    }
  | { kind: "failure"; row: ProductionWaveScannerComposedRow };

function productionCompositionFailureRow(
  symbol: string,
  timeframeId: string,
  loadError: string,
  evaluationBarTime: number | null,
  evaluationBarIndex: number | null,
  candleCount: number
): ProductionWaveScannerComposedRow {
  return {
    symbol,
    timeframe: timeframeId,
    loadError,
    historicalSetup: null,
    production: null,
    references: emptyReference(),
    evaluationBarTime,
    evaluationBarIndex,
    candleCount,
  };
}

function toComposedRow(
  meta: Extract<ProductionCompositionAtEvaluationBar, { kind: "success" }>,
  candidate: ProductionComposedCandidate
): ProductionWaveScannerComposedRow {
  return {
    symbol: meta.symbol,
    timeframe: meta.timeframeId,
    loadError: null,
    historicalSetup: candidate.historicalSetup,
    production: candidate.production,
    references: candidate.references,
    evaluationBarTime: meta.evaluationBarTime,
    evaluationBarIndex: meta.evaluationBarIndex,
    candleCount: meta.candleCount,
  };
}

/**
 * Full production candidate collection at evaluation bar E (same pipeline as compose).
 */
export function resolveProductionCompositionAtEvaluationBar(
  input: ProductionWaveScannerSymbolInput
): ProductionCompositionAtEvaluationBar {
  const { symbol, candles, timeframeId, engineOptions, composeOptions } = input;
  if (!candles.length) {
    return {
      kind: "failure",
      row: productionCompositionFailureRow(
        symbol,
        timeframeId,
        "INSUFFICIENT_CANDLES",
        null,
        null,
        0
      ),
    };
  }

  const resolvedBar = resolveProductionComposeEvaluationBar(
    candles,
    composeOptions?.evaluationBarIndex
  );
  if (!resolvedBar.ok) {
    return {
      kind: "failure",
      row: productionCompositionFailureRow(
        symbol,
        timeframeId,
        resolvedBar.loadError,
        null,
        null,
        candles.length
      ),
    };
  }

  const evaluationBarIndex = resolvedBar.evaluationBarIndex;
  const evaluationBarTime = candles[evaluationBarIndex]?.time ?? null;

  try {
    const evaluationCandles = candles.slice(0, evaluationBarIndex + 1);
    const scan = runWaveScan([{ symbol, candles: evaluationCandles }], {
      timeframe: timeframeId,
      engineOptions,
    });
    const scanError = scan.errors.find((e) => e.symbol === symbol);
    if (scanError) {
      return {
        kind: "failure",
        row: productionCompositionFailureRow(
          symbol,
          timeframeId,
          scanError.message,
          evaluationBarTime,
          evaluationBarIndex,
          candles.length
        ),
      };
    }

    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      {
        [symbol]: {
          candles,
          closedSeriesOnly: true,
          evaluationBarIndex,
        },
      },
      engineOptions
    );
    const setupDetection = detectSetups({
      scanReport: tradeContext.scanReport,
      tradeContext,
    });
    const historicalTradeSetups = setupDetection.candidates.filter(
      (c) => c.isTradeSetup
    );
    const productionReport = detectProspectiveSetupProduction({
      historicalTradeSetups,
      tradeContext,
      candlesBySymbol: { [symbol]: candles },
    });

    const setupsById = new Map(historicalTradeSetups.map((s) => [s.id, s]));
    const bundle = tradeContext.bundlesBySymbol?.[symbol];
    if (!bundle) {
      return {
        kind: "failure",
        row: productionCompositionFailureRow(
          symbol,
          timeframeId,
          "ANALYSIS_BUNDLE_UNAVAILABLE",
          evaluationBarTime,
          evaluationBarIndex,
          candles.length
        ),
      };
    }

    const candidates: ProductionComposedCandidate[] =
      productionReport.candidates.map((production) => {
        const historicalSetup = setupsById.get(production.sourceSetupId)!;
        const references = evaluateProspectiveReferenceBundle({
          production,
          historicalSetup,
          bundle,
          candles,
        });
        return { production, references, historicalSetup };
      });

    return {
      kind: "success",
      symbol,
      timeframeId,
      evaluationBarIndex,
      evaluationBarTime,
      candleCount: candles.length,
      candidates,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "failure",
      row: productionCompositionFailureRow(
        symbol,
        timeframeId,
        message,
        evaluationBarTime,
        evaluationBarIndex,
        candles.length
      ),
    };
  }
}

/** One composed row per prospective production candidate at E. */
export function composeProductionCandidateRowsForSymbol(
  input: ProductionWaveScannerSymbolInput
): ProductionWaveScannerComposedRow[] {
  const resolved = resolveProductionCompositionAtEvaluationBar(input);
  if (resolved.kind === "failure") {
    return [];
  }
  return resolved.candidates.map((candidate) =>
    toComposedRow(resolved, candidate)
  );
}

export function composeProductionWaveScannerForSymbol(
  input: ProductionWaveScannerSymbolInput
): ProductionWaveScannerComposedRow {
  const resolved = resolveProductionCompositionAtEvaluationBar(input);
  if (resolved.kind === "failure") {
    return resolved.row;
  }

  const selected = selectDisplayProspectiveCandidate(resolved.candidates);
  if (!selected) {
    return {
      symbol: resolved.symbol,
      timeframe: resolved.timeframeId,
      loadError: null,
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime: resolved.evaluationBarTime,
      evaluationBarIndex: resolved.evaluationBarIndex,
      candleCount: resolved.candleCount,
    };
  }

  return toComposedRow(resolved, selected);
}

export function runProductionWaveScanner(
  input: ProductionWaveScannerRunInput
): WaveScannerReportPresentation {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const symbolErrors: Array<{ symbol: string; message: string }> = [];
  const rows: ProductionWaveScannerComposedRow[] = [];

  for (const symbol of input.symbols) {
    const candles = input.candlesBySymbol[symbol];
    if (!candles) {
      symbolErrors.push({ symbol, message: "NO_CANDLES" });
      rows.push({
        symbol,
        timeframe: input.timeframeId,
        loadError: "NO_CANDLES",
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime: null,
        evaluationBarIndex: null,
        candleCount: 0,
      });
      continue;
    }
    const composed = composeProductionWaveScannerForSymbol({
      symbol,
      candles,
      timeframeId: input.timeframeId,
      engineOptions: input.engineOptions,
    });
    if (composed.loadError) {
      symbolErrors.push({ symbol, message: composed.loadError });
    }
    rows.push(composed);
  }

  const liveMap = input.liveMarketPriceBySymbol;
  const liveMapProvided = liveMap !== undefined;
  const includeOutcomeReplay = input.includeOutcomeReplay === true;

  return {
    schemaVersion: "1.0",
    timeframe: input.timeframeId,
    generatedAt,
    rows: rows.map((composed) => {
      const entryRef = composed.references.entry.referencePrice;
      const liveMarketPrice = liveMapProvided
        ? (liveMap[composed.symbol] ?? null)
        : entryRef;
      const row = presentWaveScannerRow(composed, { liveMarketPrice });
      if (!includeOutcomeReplay) {
        return row;
      }
      const candles = input.candlesBySymbol[composed.symbol];
      if (!candles?.length) {
        return row;
      }
      const outcomeReplay = enrichProspectiveSetupOutcomeReplay(
        composed,
        candles,
        { horizonBars: input.outcomeReplayHorizonBars }
      );
      if (!outcomeReplay) {
        return row;
      }
      return { ...row, outcomeReplay };
    }),
    symbolErrors,
  };
}

export type { SetupCandidate };
