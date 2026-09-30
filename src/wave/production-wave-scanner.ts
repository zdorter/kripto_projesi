import type { Candle, WaveEngineOptions } from "./types";
import { runWaveScan } from "./wave-scanner";
import { detectSetups } from "./setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "./setup/trade-setup-context";
import { resolveTradeSetupEvaluationBoundary } from "./setup/trade-setup-evaluation-bar";
import { detectProspectiveSetupProduction } from "./setup/prospective-setup-production";
import type { ProspectiveSetupProductionCandidate } from "./setup/prospective-setup-production-types";
import { evaluateProspectiveReferenceBundle } from "./setup/prospective-reference-evaluation";
import type { SetupCandidate } from "./setup/setup-types";
import type { ProspectiveReferenceEvaluation } from "./setup/prospective-reference-evaluation";
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
}

export interface ProductionWaveScannerSymbolInput {
  symbol: string;
  candles: Candle[];
  timeframeId: string;
  engineOptions?: WaveEngineOptions;
}

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
      policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY",
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

export function composeProductionWaveScannerForSymbol(
  input: ProductionWaveScannerSymbolInput
): ProductionWaveScannerComposedRow {
  const { symbol, candles, timeframeId, engineOptions } = input;
  if (!candles.length) {
    return {
      symbol,
      timeframe: timeframeId,
      loadError: "INSUFFICIENT_CANDLES",
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime: null,
      evaluationBarIndex: null,
      candleCount: 0,
    };
  }

  const boundary = resolveTradeSetupEvaluationBoundary({
    candles,
    closedSeriesOnly: true,
  });
  if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
    return {
      symbol,
      timeframe: timeframeId,
      loadError: "EVALUATION_BAR_NOT_ESTABLISHED",
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime: null,
      evaluationBarIndex: null,
      candleCount: candles.length,
    };
  }

  const evaluationBarIndex = boundary.evaluationBarIndex;
  const evaluationBarTime = candles[evaluationBarIndex]?.time ?? null;

  try {
    const scan = runWaveScan([{ symbol, candles }], {
      timeframe: timeframeId,
      engineOptions,
    });
    const scanError = scan.errors.find((e) => e.symbol === symbol);
    if (scanError) {
      return {
        symbol,
        timeframe: timeframeId,
        loadError: scanError.message,
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length,
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
    const setupDetection = detectSetups({ scanReport: scan, tradeContext });
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
        symbol,
        timeframe: timeframeId,
        loadError: "ANALYSIS_BUNDLE_UNAVAILABLE",
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length,
      };
    }

    const composed = productionReport.candidates.map((production) => {
      const historicalSetup = setupsById.get(production.sourceSetupId)!;
      const references = evaluateProspectiveReferenceBundle({
        production,
        historicalSetup,
        bundle,
        candles,
      });
      return { production, references, historicalSetup };
    });

    const selected = selectDisplayProspectiveCandidate(composed);
    if (!selected) {
      return {
        symbol,
        timeframe: timeframeId,
        loadError: null,
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length,
      };
    }

    return {
      symbol,
      timeframe: timeframeId,
      loadError: null,
      historicalSetup: selected.historicalSetup,
      production: selected.production,
      references: selected.references,
      evaluationBarTime,
      evaluationBarIndex,
      candleCount: candles.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      symbol,
      timeframe: timeframeId,
      loadError: message,
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime,
      evaluationBarIndex,
      candleCount: candles.length,
    };
  }
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

  return {
    schemaVersion: "1.0",
    timeframe: input.timeframeId,
    generatedAt,
    rows: rows.map(presentWaveScannerRow),
    symbolErrors,
  };
}

export type { SetupCandidate };
