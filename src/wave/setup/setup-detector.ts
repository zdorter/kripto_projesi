import { STRUCTURAL_SETUP_CATALOG } from "./setup-catalog";
import { detectTradeSetups } from "./trade-setup-detector";
import type { TradeSetupEvaluationContext } from "./trade-setup-types";
import {
  buildReferenceLevels,
  catalogMatchesScanRow,
  evaluateCondition,
  isContextInsufficientForCatalog,
  resolveDirectionalBias,
  resolveSetupLifecycleStatus,
  standardSetupLimitations,
  summarizeConditions,
} from "./setup-rules";
import type {
  SetupCandidate,
  SetupDetectionInput,
  SetupDetectionReport,
  SetupDetectionSymbolError,
  SetupEvaluationContext,
  SetupSymbolContext,
} from "./setup-types";
import { SETUP_SCHEMA_VERSION } from "./setup-types";
import type { WaveScanReport, WaveScanResult } from "../wave-scanner";

function compareCandidates(a: SetupCandidate, b: SetupCandidate): number {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const tf = a.timeframe.localeCompare(b.timeframe);
  if (tf !== 0) {
    return tf;
  }
  const type = a.setupTypeId.localeCompare(b.setupTypeId);
  if (type !== 0) {
    return type;
  }
  return a.scenarioRef.scenarioId.localeCompare(b.scenarioRef.scenarioId);
}

function symbolContextFromReport(
  report: WaveScanReport,
  symbol: string
): SetupSymbolContext | undefined {
  const block = report.optionalMtfBySymbol?.[symbol];
  if (!block) {
    return undefined;
  }
  return {
    multiTimeframe: block.multiTimeframe,
    hierarchy: block.hierarchy,
  };
}

function buildCandidateForRow(
  row: WaveScanResult,
  entry: typeof STRUCTURAL_SETUP_CATALOG[number],
  ctx: SetupEvaluationContext
): SetupCandidate {
  const contextInsufficient = isContextInsufficientForCatalog(entry, ctx);

  const triggerEvals = entry.triggerConditions.map((id) =>
    evaluateCondition(id, ctx)
  );
  const confirmationEvals = entry.confirmationConditions.map((id) =>
    evaluateCondition(id, ctx)
  );
  const invalidationEvals = [
    evaluateCondition("setup-invalidation-triggered", ctx),
  ];
  const optionalEvals = entry.optionalConditions.map((id) =>
    evaluateCondition(id, ctx)
  );

  const status = resolveSetupLifecycleStatus(
    row,
    entry,
    triggerEvals,
    confirmationEvals,
    invalidationEvals,
    contextInsufficient
  );

  const { bias, basis } = resolveDirectionalBias(row, ctx);
  const evaluationNotes: string[] = [];
  if (bias === null) {
    evaluationNotes.push(
      "Directional bias not inferred from wave label; no IMPULSE_COUNT_DIRECTION or eligible LEG_PRICE_DELTA."
    );
  }
  if (contextInsufficient) {
    evaluationNotes.push(
      "Setup type requires MTF context missing from WaveScanReport.optionalMtfBySymbol."
    );
  }
  for (const o of optionalEvals) {
    if (o.outcome === "INSUFFICIENT_DATA") {
      evaluationNotes.push(`${o.conditionId}: ${o.detail}`);
    }
  }
  if (!entry.isTradeSetup && status === "CANDIDATE") {
    const triggerReady = triggerEvals.every((e) => e.outcome === "MET");
    const confirmationReady = confirmationEvals.every((e) => e.outcome === "MET");
    if (triggerReady && confirmationReady) {
      evaluationNotes.push(
        "Structural catalog conditions are MET; trade setup CONFIRMED is disabled for this type (isTradeSetup false)."
      );
    }
  }

  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;

  const limitations = [
    ...standardSetupLimitations(),
    ...row.limitations,
  ];

  const id = `${row.symbol}:${row.timeframe}:${entry.setupTypeId}:${row.scenarioId}`;

  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    scenarioRef: {
      scenarioId: row.scenarioId,
      role: row.role,
      structure: row.structure,
      waveLabel: row.waveLabel,
      scenarioStatus: row.scenarioStatus,
      engineStatus: row.engineStatus,
    },
    setupTypeId: entry.setupTypeId,
    setupTypeLabel: entry.label,
    category: entry.category,
    isTradeSetup: entry.isTradeSetup,
    status,
    directionalBias: bias,
    directionalBasis: basis,
    trigger: {
      conditions: triggerEvals,
      summary: summarizeConditions(triggerEvals, "Trigger"),
    },
    confirmation: {
      conditions: confirmationEvals,
      summary: summarizeConditions(confirmationEvals, "Confirmation"),
    },
    invalidation: {
      conditions: invalidationEvals,
      summary: summarizeConditions(invalidationEvals, "Invalidation"),
      usesScenarioInvalidation: row.invalidation.available,
    },
    referenceLevels: buildReferenceLevels(row, ctx),
    sourceScenario: {
      confidence: row.confidence,
      startIndex: row.startIndex,
      endIndex: row.endIndex,
      startPrice: row.startPrice,
      endPrice: row.endPrice,
      evidence: [...row.evidence],
      limitations: [...row.limitations],
    },
    context: {
      marketTrendHigher: mtf?.trendAlignment.higherTrend,
      marketTrendLower: mtf?.trendAlignment.lowerTrend,
      mtfRelationshipKind: mtf?.relationship.kind,
      hierarchyPrimaryRelationship: hierarchy?.primaryPair?.relationship,
    },
    setupLimitations: limitations,
    evaluationNotes,
  };
}

function detectForScanRow(
  row: WaveScanResult,
  symbolContext: SetupSymbolContext | undefined,
  errors: SetupDetectionSymbolError[]
): SetupCandidate[] {
  const candidates: SetupCandidate[] = [];
  const ctx: SetupEvaluationContext = { scanRow: row, symbolContext };

  for (const entry of STRUCTURAL_SETUP_CATALOG) {
    if (!catalogMatchesScanRow(entry, row)) {
      continue;
    }
    try {
      candidates.push(buildCandidateForRow(row, entry, ctx));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        symbol: row.symbol,
        timeframe: row.timeframe,
        scenarioId: row.scenarioId,
        setupTypeId: entry.setupTypeId,
        message,
      });
    }
  }

  return candidates;
}

export function detectSetupsFromScanReport(
  report: WaveScanReport
): SetupDetectionReport {
  return detectSetups({ scanReport: report });
}

export function detectSetups(input: SetupDetectionInput): SetupDetectionReport {
  const report = input.scanReport;
  const candidates: SetupCandidate[] = [];
  const errors: SetupDetectionSymbolError[] = [...report.errors.map((e) => ({
    symbol: e.symbol,
    timeframe: e.timeframe,
    message: `Scan error (setup skipped for symbol): ${e.message}`,
  }))];

  const rowsBySymbol = new Map<string, WaveScanResult[]>();
  for (const row of report.results) {
    const list = rowsBySymbol.get(row.symbol) ?? [];
    list.push(row);
    rowsBySymbol.set(row.symbol, list);
  }

  if (input.tradeContext) {
    const ctxBySymbol: Record<string, SetupSymbolContext | undefined> = {};
    for (const sym of report.symbols) {
      ctxBySymbol[sym] = symbolContextFromReport(report, sym);
    }
    candidates.push(
      ...detectTradeSetups(input.tradeContext, ctxBySymbol, errors)
    );
  }

  for (const [symbol, rows] of rowsBySymbol) {
    const symbolContext = symbolContextFromReport(report, symbol);
    for (const row of rows) {
      try {
        candidates.push(...detectForScanRow(row, symbolContext, errors));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          symbol: row.symbol,
          timeframe: row.timeframe,
          scenarioId: row.scenarioId,
          message,
        });
      }
    }
  }

  const sorted = [...candidates].sort(compareCandidates);
  errors.sort((a, b) => {
    const sym = a.symbol.localeCompare(b.symbol);
    if (sym !== 0) {
      return sym;
    }
    return (a.setupTypeId ?? "").localeCompare(b.setupTypeId ?? "");
  });

  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    timeframe: report.timeframe,
    symbols: [...report.symbols].sort((a, b) => a.localeCompare(b)),
    candidates: sorted,
    candidateCount: sorted.length,
    errors,
    limitations: standardSetupLimitations(),
  };
}
