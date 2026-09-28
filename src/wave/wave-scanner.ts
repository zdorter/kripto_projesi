import { buildTimeframeBundle } from "./multi-timeframe";
import type { MultiTimeframeWaveState } from "./multi-timeframe";
import { analyzeMultiTimeframe, DEFAULT_MULTI_TIMEFRAME_CONFIG } from "./multi-timeframe";
import { buildCandidateWaveHierarchy } from "./wave-hierarchy";
import type { WaveHierarchyReport } from "./wave-hierarchy";
import { buildWaveScenarios } from "./wave-scenarios";
import type {
  ScenarioInvalidationView,
  ScenarioLifecycleStatus,
  ScenarioRole,
  WaveScenario,
} from "./wave-scenarios";
import type { Candle, WaveEngineOptions, WaveLabel, WaveStatus } from "./types";
import type { StructureKind } from "./presentation-state";

export interface WaveScanResult {
  symbol: string;
  timeframe: string;
  scenarioId: string;
  role: ScenarioRole;
  structure: StructureKind;
  waveLabel: WaveLabel;
  engineStatus?: WaveStatus;
  scenarioStatus: ScenarioLifecycleStatus;
  confidence: number;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  invalidation: ScenarioInvalidationView;
  evidence: string[];
  limitations: string[];
}

export interface WaveScanSymbolError {
  symbol: string;
  timeframe: string;
  message: string;
}

export interface WaveScanSymbolContext {
  symbol: string;
  candles: Candle[];
  /** Optional lower-TF candles for existing MTF + hierarchy consumption only. */
  lowerCandles?: Candle[];
}

export interface WaveScannerRunOptions {
  timeframe: string;
  engineOptions?: WaveEngineOptions;
  lowerTimeframe?: string;
  multiTimeframeConfig?: {
    higherTimeframeId: string;
    lowerTimeframeId: string;
  };
}

export interface WaveScanReport {
  schemaVersion: "1.0";
  timeframe: string;
  symbols: string[];
  results: WaveScanResult[];
  analyzedSymbolCount: number;
  scenarioCount: number;
  errors: WaveScanSymbolError[];
  /** Present when lower candles were supplied for a symbol. */
  optionalMtfBySymbol?: Record<
    string,
    {
      multiTimeframe: MultiTimeframeWaveState;
      hierarchy: WaveHierarchyReport;
    }
  >;
}

export interface OhlcvProviderLike {
  getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<Candle[]>;
}

const ROLE_ORDER: Record<ScenarioRole, number> = {
  PRIMARY: 0,
  ALTERNATIVE: 1,
  CANDIDATE: 2,
};

function scenarioToScanResult(
  symbol: string,
  timeframe: string,
  scenario: WaveScenario
): WaveScanResult {
  return {
    symbol,
    timeframe,
    scenarioId: scenario.id,
    role: scenario.role,
    structure: scenario.structure,
    waveLabel: scenario.waveLabel,
    engineStatus: scenario.engineStatus,
    scenarioStatus: scenario.status,
    confidence: scenario.confidence,
    startIndex: scenario.startIndex,
    endIndex: scenario.endIndex,
    startPrice: scenario.startPrice,
    endPrice: scenario.endPrice,
    invalidation: scenario.invalidation,
    evidence: [...scenario.evidence],
    limitations: [...scenario.limitations],
  };
}

export function compareWaveScanResults(
  a: WaveScanResult,
  b: WaveScanResult
): number {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const tf = a.timeframe.localeCompare(b.timeframe);
  if (tf !== 0) {
    return tf;
  }
  const role = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
  if (role !== 0) {
    return role;
  }
  return a.scenarioId.localeCompare(b.scenarioId);
}

function sortResults(results: WaveScanResult[]): WaveScanResult[] {
  return [...results].sort(compareWaveScanResults);
}

export function scanSymbolWaveScenarios(
  input: WaveScanSymbolContext,
  options: WaveScannerRunOptions
): {
  results: WaveScanResult[];
  optionalMtf?: {
    multiTimeframe: MultiTimeframeWaveState;
    hierarchy: WaveHierarchyReport;
  };
} {
  const bundle = buildTimeframeBundle(
    input.candles,
    options.timeframe,
    options.engineOptions
  );

  let multiTimeframe: MultiTimeframeWaveState | undefined;
  let hierarchy: WaveHierarchyReport | undefined;
  let optionalMtf:
    | {
        multiTimeframe: MultiTimeframeWaveState;
        hierarchy: WaveHierarchyReport;
      }
    | undefined;

  if (input.lowerCandles && input.lowerCandles.length > 0) {
    const mtfConfig = options.multiTimeframeConfig ?? {
      higherTimeframeId: options.timeframe,
      lowerTimeframeId:
        options.lowerTimeframe ?? DEFAULT_MULTI_TIMEFRAME_CONFIG.lowerTimeframeId,
    };
    multiTimeframe = analyzeMultiTimeframe(
      input.candles,
      input.lowerCandles,
      mtfConfig,
      { symbol: input.symbol }
    );
    hierarchy = buildCandidateWaveHierarchy(
      multiTimeframe,
      input.candles,
      input.lowerCandles
    );
    optionalMtf = { multiTimeframe, hierarchy };
  }

  const scenarioReport = buildWaveScenarios(bundle, {
    symbol: input.symbol,
    multiTimeframe,
    hierarchy,
  });

  const results = scenarioReport.scenarios.map((s) =>
    scenarioToScanResult(input.symbol, options.timeframe, s)
  );

  return { results: sortResults(results), optionalMtf };
}

export function runWaveScan(
  inputs: WaveScanSymbolContext[],
  options: WaveScannerRunOptions
): WaveScanReport {
  const results: WaveScanResult[] = [];
  const errors: WaveScanSymbolError[] = [];
  const optionalMtfBySymbol: WaveScanReport["optionalMtfBySymbol"] = {};
  const symbols: string[] = [];

  for (const input of inputs) {
    symbols.push(input.symbol);
    try {
      if (input.candles.length === 0) {
        throw new Error("empty candle series");
      }
      const { results: symbolResults, optionalMtf } = scanSymbolWaveScenarios(
        input,
        options
      );
      results.push(...symbolResults);
      if (optionalMtf) {
        optionalMtfBySymbol[input.symbol] = optionalMtf;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        symbol: input.symbol,
        timeframe: options.timeframe,
        message,
      });
    }
  }

  const sorted = sortResults(results);

  return {
    schemaVersion: "1.0",
    timeframe: options.timeframe,
    symbols: [...symbols].sort((a, b) => a.localeCompare(b)),
    results: sorted,
    analyzedSymbolCount: symbols.length - errors.length,
    scenarioCount: sorted.length,
    errors,
    optionalMtfBySymbol:
      Object.keys(optionalMtfBySymbol).length > 0
        ? optionalMtfBySymbol
        : undefined,
  };
}

export async function runWaveScanWithProvider(
  provider: OhlcvProviderLike,
  symbols: string[],
  interval: string,
  limit: number,
  options: WaveScannerRunOptions
): Promise<WaveScanReport> {
  const inputs: WaveScanSymbolContext[] = [];
  const fetchErrors: WaveScanSymbolError[] = [];

  for (const symbol of symbols) {
    try {
      const candles = await provider.getCandles(symbol, interval, limit);
      if (candles.length === 0) {
        throw new Error("empty candle series");
      }
      inputs.push({ symbol, candles });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fetchErrors.push({
        symbol,
        timeframe: options.timeframe,
        message,
      });
    }
  }

  const report = runWaveScan(inputs, options);
  const errors = sortErrors([...fetchErrors, ...report.errors]);
  const failed = new Set(errors.map((e) => e.symbol));

  return {
    ...report,
    symbols: [...symbols].sort((a, b) => a.localeCompare(b)),
    errors,
    analyzedSymbolCount: symbols.filter((s) => !failed.has(s)).length,
  };
}

function sortErrors(errors: WaveScanSymbolError[]): WaveScanSymbolError[] {
  return [...errors].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
