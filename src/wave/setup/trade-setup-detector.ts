import { catalogMatchesScanRow } from "./setup-rules";
import {
  buildReferenceLevels,
  evaluateCondition,
  standardSetupLimitations,
  summarizeConditions,
} from "./setup-rules";
import { TRADE_SETUP_CATALOG } from "./trade-setup-catalog";
import type { TradeSetupCatalogEntry } from "./trade-setup-types";
import {
  evaluateSharedTradePrerequisites,
  evaluateTradeCondition,
  overlapFiveCNote,
  resolveTradeDirectionalBias,
  resolveTradeSetupLifecycleStatus,
} from "./trade-setup-rules";
import type {
  SetupCandidate,
  SetupDetectionSymbolError,
  SetupSymbolContext,
} from "./setup-types";
import { SETUP_SCHEMA_VERSION } from "./setup-types";
import type { TradeSetupEvaluationContext } from "./trade-setup-types";
import type { WaveScanResult } from "../wave-scanner";

export function detectTradeSetups(
  tradeContext: TradeSetupEvaluationContext,
  symbolContextBySymbol: Record<string, SetupSymbolContext | undefined>,
  errors: SetupDetectionSymbolError[]
): SetupCandidate[] {
  const report = tradeContext.scanReport;
  const candidates: SetupCandidate[] = [];

  for (const row of report.results) {
    const bundle = tradeContext.bundlesBySymbol?.[row.symbol];
    const ctxRow = {
      scanRow: row,
      bundle,
      symbolContext: symbolContextBySymbol[row.symbol],
    };

    for (const entry of TRADE_SETUP_CATALOG) {
      if (!catalogMatchesScanRow(entry, row)) {
        continue;
      }
      try {
        candidates.push(buildTradeCandidate(row, entry, ctxRow));
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
  }

  return candidates;
}

function buildTradeCandidate(
  row: WaveScanResult,
  entry: TradeSetupCatalogEntry,
  ctxRow: {
    scanRow: WaveScanResult;
    bundle?: import("./trade-setup-types").SymbolEvaluationBundle;
    symbolContext?: SetupSymbolContext;
  }
): SetupCandidate {
  const baseCtx = {
    scanRow: row,
    symbolContext: ctxRow.symbolContext,
  };

  const sharedPrereq = evaluateSharedTradePrerequisites(ctxRow);
  const tradePrereq = entry.prerequisiteConditions.map((id) =>
    evaluateTradeCondition(id, ctxRow)
  );
  const prerequisiteEvals = [...sharedPrereq, ...tradePrereq];

  const triggerEvals = entry.triggerConditions.map((id) =>
    evaluateTradeCondition(id as import("./trade-setup-types").TradeSetupConditionId, ctxRow)
  );
  const tradeConfirmationEvals = entry.tradeConfirmationConditions.map((id) =>
    evaluateTradeCondition(id, ctxRow)
  );
  const invalidationEvals = [
    evaluateCondition("setup-invalidation-triggered", baseCtx),
  ];

  const status = resolveTradeSetupLifecycleStatus(
    row,
    entry,
    prerequisiteEvals,
    triggerEvals,
    tradeConfirmationEvals,
    invalidationEvals
  );

  const { bias, basis } = resolveTradeDirectionalBias(ctxRow);
  const evaluationNotes: string[] = [];
  if (bias === null) {
    evaluationNotes.push(
      "Directional bias not set from wave label; IMPULSE_COUNT_DIRECTION unavailable or not used."
    );
  }
  const overlap = overlapFiveCNote(ctxRow.bundle);
  if (overlap) {
    evaluationNotes.push(overlap);
  }
  for (const e of tradeConfirmationEvals) {
    if (e.conditionId === "fib-abc-conformance-met" && e.outcome === "INSUFFICIENT_DATA") {
      evaluationNotes.push(
        "correction-end: A-B-C fibonacci not in diagnostics contract → INSUFFICIENT_CONTEXT for confirmed trade setup."
      );
    }
  }

  const mtf = ctxRow.symbolContext?.multiTimeframe;
  const hierarchy = ctxRow.symbolContext?.hierarchy;

  const limitations = [
    ...standardSetupLimitations(),
    "Trade setup CONFIRMED enables Entry Plan eligibility only; it is not a trade signal.",
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
    isTradeSetup: true,
    status,
    directionalBias: bias,
    directionalBasis: basis,
    trigger: {
      conditions: triggerEvals,
      summary: summarizeConditions(triggerEvals, "Trigger"),
    },
    confirmation: {
      conditions: tradeConfirmationEvals,
      summary: summarizeConditions(tradeConfirmationEvals, "TradeConfirmation"),
    },
    invalidation: {
      conditions: invalidationEvals,
      summary: summarizeConditions(invalidationEvals, "Invalidation"),
      usesScenarioInvalidation: row.invalidation.available,
    },
    referenceLevels: buildReferenceLevels(row, baseCtx),
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
