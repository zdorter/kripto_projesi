import { BinanceFuturesOhlcvProvider } from "../providers/binance-ohlcv";
import type { Candle, WaveEngineOptions } from "../wave/types";
import { runWaveScan } from "../wave/wave-scanner";
import type { WaveScanReport, WaveScanResult } from "../wave/wave-scanner";
import { detectSetups } from "../wave/setup/setup-detector";
import { buildTradeSetupEvaluationContext } from "../wave/setup/trade-setup-context";
import { resolveTradeSetupEvaluationBoundary } from "../wave/setup/trade-setup-evaluation-bar";
import { buildTradeSetupEvaluationPipeline } from "../wave/setup/trade-setup-evaluation-pipeline";
import type { TradeSetupEvaluationPipelineReport } from "../wave/setup/trade-setup-evaluation-pipeline-types";
import type { SetupDetectionReport, SetupLifecycleStatus } from "../wave/setup/setup-types";
import type { TradeSetupEvaluationAggregateState } from "../wave/setup/trade-setup-evaluation-types";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";
import {
  blockersForTradeSetupDetail,
  incrementBlockerCounts,
} from "./real-market-blockers";
import {
  buildConditionSummary,
  buildInvalidationFlowSummary,
  summarizeZeroConfirmedRootCause,
} from "./real-market-setup-diagnostics";
import { buildFibonacciAnchorDiagnostic } from "./real-market-fibonacci-anchor-diagnostics";
import {
  buildObjectiveWaveResolutionDiagnostic,
  summarizeObjectiveWaveResolutionDiagnostics,
} from "./real-market-objective-wave-resolution-diagnostics";
import {
  buildProspectiveSetupDiagnostic,
  summarizeProspectiveSetupDiagnostics,
} from "./real-market-prospective-setup-diagnostics";
import { buildEvaluationScopedAnalysisDiagnostic } from "./real-market-evaluation-scoped-diagnostics";
import {
  buildOpenStructuralLegDiagnostic,
  summarizeOpenStructuralLegDiagnostics,
} from "./real-market-open-structural-leg-diagnostics";
import { buildProspectiveProductionDiagnostics } from "./real-market-prospective-production-diagnostics";
import { buildAnchorIdentityDiagnostics } from "./real-market-anchor-identity-diagnostics";
import { buildTransitionSemanticsDiagnostics } from "./real-market-transition-semantics-diagnostics";
import { buildProspectiveReplayDiagnostics } from "./real-market-prospective-replay-diagnostics";
import { buildSymbolEvaluationBundleAtEvaluationBar } from "../wave/setup/trade-setup-context";
import {
  buildTradeSetupTemporalDiagnostic,
  summarizeTradeSetupTemporalDiagnostics,
} from "./real-market-trade-setup-temporal-diagnostics";
import {
  buildWaveProjectionContextDiagnostic,
  summarizeWaveProjectionContextDiagnostics,
} from "./real-market-wave-projection-context-diagnostics";
import {
  buildFibonacciProjectionPolicyDiagnostic,
  summarizeProjectionPolicyDiagnostics,
} from "./real-market-fibonacci-projection-policy-diagnostics";
import {
  buildObjectiveTargetProductionDiagnostic,
  summarizeObjectiveTargetSources,
  summarizeSelectedTargetSources,
} from "./real-market-objective-target-diagnostics";
import {
  buildStopDiagnosticsFromPipeline,
  buildStopModelSummary,
} from "./real-market-stop-diagnostics";
import {
  analyzeInvalidationPrecedenceFindings,
  buildInvalidationScopeSummary,
  buildScenarioInvalidationCandidateReports,
  buildStopScopeCompatibilitySummary,
  correctiveTrackInvalidationNote,
  scopeCompatibilityMatrix,
} from "./real-market-invalidation-scope";
import type {
  LayerAvailability,
  RealMarketTradeSetupDetail,
  RealMarketValidationFunnel,
  RealMarketValidationReport,
  RealMarketSymbolSummary,
} from "./real-market-validation-types";
import { REAL_MARKET_VALIDATION_SCHEMA_VERSION } from "./real-market-validation-types";

export const DEFAULT_REAL_MARKET_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
] as const;

export interface RealMarketValidationRunConfig {
  symbols: readonly string[];
  interval: string;
  limit: number;
  timeframeId: string;
  engineOptions?: WaveEngineOptions;
  fetchedAt?: string;
}

function emptyStatusCounts(): Record<SetupLifecycleStatus, number> {
  return {
    CONFIRMED: 0,
    CANDIDATE: 0,
    INVALID: 0,
    INSUFFICIENT_CONTEXT: 0,
  };
}

function emptyEvalCounts(): Record<TradeSetupEvaluationAggregateState, number> {
  return {
    READY_FOR_FURTHER_EVALUATION: 0,
    INSUFFICIENT_CONTEXT: 0,
    INVALID: 0,
  };
}

function layerFromReference(
  available: boolean,
  insufficient: boolean
): LayerAvailability {
  if (available) {
    return "AVAILABLE";
  }
  if (insufficient) {
    return "INSUFFICIENT_CONTEXT";
  }
  return "NOT_APPLICABLE";
}


export interface RealMarketValidationInputs {
  config: RealMarketValidationRunConfig;
  candlesBySymbol: Record<string, Candle[]>;
  scanReport: WaveScanReport;
  tradeContext: TradeSetupEvaluationContext;
  setupDetection: SetupDetectionReport;
  pipelineReport: TradeSetupEvaluationPipelineReport;
}

export function buildRealMarketValidationReport(
  input: RealMarketValidationInputs
): RealMarketValidationReport {
  const { config, candlesBySymbol, scanReport, setupDetection, pipelineReport } =
    input;
  const fetchedAt = config.fetchedAt ?? new Date().toISOString();
  const snapshotByPlanId = new Map(
    pipelineReport.snapshots.map((s) => [s.entryPlanId, s.snapshot])
  );
  const planBySetupId = new Map(
    pipelineReport.entryPlanReport.plans.map((p) => [p.setupRef.setupId, p])
  );

  const blockerCounts: Record<string, number> = {};
  const waveLabelDistribution: Record<string, number> = {};
  const setupTypeStatusDistribution: Record<
    string,
    Record<SetupLifecycleStatus, number>
  > = {};
  const directionalBiasDistribution: Record<string, number> = {};
  const tradeSetupDetails: RealMarketTradeSetupDetail[] = [];

  for (const row of scanReport.results) {
    const key = `${row.structure}:${row.waveLabel}`;
    waveLabelDistribution[key] = (waveLabelDistribution[key] ?? 0) + 1;
  }

  const scanErrors = new Set(scanReport.errors.map((e) => e.symbol));
  const scanRowByScenario = new Map(
    scanReport.results.map((r) => [
      `${r.symbol}:${r.scenarioId}`,
      r,
    ])
  );

  const conditionSummary = buildConditionSummary(
    setupDetection,
    scanReport,
    input.tradeContext
  );
  const invalidationFlowSummary = buildInvalidationFlowSummary({
    scanReport,
    tradeContext: input.tradeContext,
    setupDetection,
  });
  const zeroConfirmedRootCauseNotes = summarizeZeroConfirmedRootCause(
    conditionSummary
  );

  const scanRowBySetupId = new Map<string, WaveScanResult>();
  for (const setup of setupDetection.candidates) {
    const row = scanRowByScenario.get(
      `${setup.symbol}:${setup.scenarioRef.scenarioId}`
    );
    if (row) {
      scanRowBySetupId.set(setup.id, row);
    }
  }
  const entryPriceByPlanId = new Map<string, number>();
  for (const item of pipelineReport.snapshots) {
    const price = item.snapshot.selectedEntryReference?.referencePrice;
    if (price !== undefined && Number.isFinite(price)) {
      entryPriceByPlanId.set(item.entryPlanId, price);
    }
  }
  const setupIdByPlanId = new Map(
    pipelineReport.entryPlanReport.plans.map((p) => [p.id, p.setupRef.setupId])
  );
  const { stopDiagnostics, stopFailureSummary } =
    buildStopDiagnosticsFromPipeline({
      plans: pipelineReport.entryPlanReport.plans,
      setupIdByPlanId,
      scanRowBySetupId,
      entryPriceByPlanId,
    });

  const invalidationScopeSummary = buildInvalidationScopeSummary(scanReport);
  const stopScopeCompatibilitySummary =
    buildStopScopeCompatibilitySummary(stopDiagnostics);
  const scenarioInvalidationCandidates = buildScenarioInvalidationCandidateReports(
    scanReport,
    input.tradeContext
  );
  const invalidationPrecedenceFindings = analyzeInvalidationPrecedenceFindings(
    scenarioInvalidationCandidates,
    stopDiagnostics
  );
  const stopModelSummary = {
    byModelId: buildStopModelSummary(stopDiagnostics),
  };
  const selectedStopModelSummary: {
    byModelId: Record<string, number>;
    planCount: number;
  } = {
    byModelId: {},
    planCount: stopDiagnostics.length,
  };
  for (const d of stopDiagnostics) {
    if (d.selectedStopModelId) {
      selectedStopModelSummary.byModelId[d.selectedStopModelId] =
        (selectedStopModelSummary.byModelId[d.selectedStopModelId] ?? 0) + 1;
    }
  }

  const stopDiagBySetupId = new Map(
    stopDiagnostics.map((d) => [d.setupId, d])
  );
  const objectiveTargetProductionDiagnostics: ReturnType<
    typeof buildObjectiveTargetProductionDiagnostic
  >[] = [];
  const bundles = input.tradeContext.bundlesBySymbol ?? {};
  for (const item of pipelineReport.snapshots) {
    const plan = pipelineReport.entryPlanReport.plans.find(
      (p) => p.id === item.entryPlanId
    );
    const bundle = plan ? bundles[plan.symbol] : undefined;
    if (!plan || !bundle) {
      continue;
    }
    const stopDiag = stopDiagBySetupId.get(plan.setupRef.setupId);
    objectiveTargetProductionDiagnostics.push(
      buildObjectiveTargetProductionDiagnostic({
        plan,
        bundle,
        snapshot: item.snapshot,
        entryReferencePrice: entryPriceByPlanId.get(plan.id),
        stopReferencePrice: stopDiag?.selectedStopPrice ?? stopDiag?.stopPrice ?? undefined,
        stopModelId: stopDiag?.selectedStopModelId ?? stopDiag?.stopModelId ?? null,
      })
    );
  }
  objectiveTargetProductionDiagnostics.sort((a, b) =>
    a.symbol.localeCompare(b.symbol) || a.setupId.localeCompare(b.setupId)
  );
  const objectiveTargetSourceSummary = summarizeObjectiveTargetSources(
    objectiveTargetProductionDiagnostics
  );
  const selectedTargetSourceSummary = summarizeSelectedTargetSources(
    objectiveTargetProductionDiagnostics
  );

  const fibonacciProjectionPolicyDiagnostics: ReturnType<
    typeof buildFibonacciProjectionPolicyDiagnostic
  >[] = [];
  for (const item of pipelineReport.snapshots) {
    const plan = pipelineReport.entryPlanReport.plans.find(
      (p) => p.id === item.entryPlanId
    );
    const bundle = plan ? bundles[plan.symbol] : undefined;
    if (!plan || !bundle) {
      continue;
    }
    fibonacciProjectionPolicyDiagnostics.push(
      buildFibonacciProjectionPolicyDiagnostic({
        plan,
        bundle,
        snapshot: item.snapshot,
      })
    );
  }
  fibonacciProjectionPolicyDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );
  const projectionPolicySummary = summarizeProjectionPolicyDiagnostics(
    fibonacciProjectionPolicyDiagnostics
  );

  const fibonacciAnchorDiagnostics: ReturnType<
    typeof buildFibonacciAnchorDiagnostic
  >[] = [];
  for (const item of pipelineReport.snapshots) {
    const plan = pipelineReport.entryPlanReport.plans.find(
      (p) => p.id === item.entryPlanId
    );
    const bundle = plan ? bundles[plan.symbol] : undefined;
    if (!plan || !bundle) {
      continue;
    }
    fibonacciAnchorDiagnostics.push(
      buildFibonacciAnchorDiagnostic({
        plan,
        bundle,
        entryReferencePrice: entryPriceByPlanId.get(plan.id) ?? null,
      })
    );
  }
  fibonacciAnchorDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );

  const waveProjectionContextDiagnostics: ReturnType<
    typeof buildWaveProjectionContextDiagnostic
  >[] = [];
  for (const item of pipelineReport.snapshots) {
    const plan = pipelineReport.entryPlanReport.plans.find(
      (p) => p.id === item.entryPlanId
    );
    const bundle = plan ? bundles[plan.symbol] : undefined;
    if (!plan || !bundle) {
      continue;
    }
    waveProjectionContextDiagnostics.push(
      buildWaveProjectionContextDiagnostic({ plan, bundle })
    );
  }
  waveProjectionContextDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );
  const waveProjectionContextSummary = summarizeWaveProjectionContextDiagnostics(
    waveProjectionContextDiagnostics
  );

  const objectiveWaveResolutionDiagnostics: ReturnType<
    typeof buildObjectiveWaveResolutionDiagnostic
  >[] = [];
  for (const item of pipelineReport.snapshots) {
    const plan = pipelineReport.entryPlanReport.plans.find(
      (p) => p.id === item.entryPlanId
    );
    const bundle = plan ? bundles[plan.symbol] : undefined;
    if (!plan || !bundle) {
      continue;
    }
    objectiveWaveResolutionDiagnostics.push(
      buildObjectiveWaveResolutionDiagnostic({ plan, bundle })
    );
  }
  objectiveWaveResolutionDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );
  const objectiveWaveResolutionSummary =
    summarizeObjectiveWaveResolutionDiagnostics(
      objectiveWaveResolutionDiagnostics
    );

  for (const setup of setupDetection.candidates) {
    if (!setup.isTradeSetup) {
      continue;
    }
    const biasKey = setup.directionalBias ?? "null";
    directionalBiasDistribution[biasKey] =
      (directionalBiasDistribution[biasKey] ?? 0) + 1;

    if (!setupTypeStatusDistribution[setup.setupTypeId]) {
      setupTypeStatusDistribution[setup.setupTypeId] = emptyStatusCounts();
    }
    setupTypeStatusDistribution[setup.setupTypeId][setup.status]++;

    const plan = planBySetupId.get(setup.id) ?? null;
    const snapshot = plan ? snapshotByPlanId.get(plan.id) ?? null : null;

    const scanRow = scanRowByScenario.get(
      `${setup.symbol}:${setup.scenarioRef.scenarioId}`
    );
    const blockers = blockersForTradeSetupDetail({
      setup,
      plan,
      snapshot,
      candidateReport: snapshot?.objectiveTargetCandidates ?? null,
      selection: snapshot?.objectiveTargetSelection ?? null,
      scanError: scanErrors.has(setup.symbol),
      scanInvalidationAvailable: scanRow?.invalidation.available,
    });
    incrementBlockerCounts(blockerCounts, blockers);

    const entryAvail = snapshot
      ? layerFromReference(
          !!snapshot.selectedEntryReference,
          snapshot.entryModel.references.some(
            (r) => r.outcome === "INSUFFICIENT_CONTEXT"
          )
        )
      : "NOT_APPLICABLE";

    const stopAvail = snapshot
      ? layerFromReference(
          !!snapshot.selectedStopLossReference,
          snapshot.stopLossModel.references.some(
            (r) => r.outcome === "INSUFFICIENT_CONTEXT"
          )
        )
      : "NOT_APPLICABLE";

    const targetAvail = snapshot
      ? layerFromReference(
          !!snapshot.selectedTargetReference,
          snapshot.targetModel.references.some(
            (r) => r.outcome === "INSUFFICIENT_CONTEXT"
          )
        )
      : "NOT_APPLICABLE";

    const rrAvail = snapshot
      ? layerFromReference(
          !!snapshot.selectedRiskRewardReference,
          snapshot.riskRewardModel.references.some(
            (r) => r.outcome === "INSUFFICIENT_CONTEXT"
          )
        )
      : "NOT_APPLICABLE";

    tradeSetupDetails.push({
      symbol: setup.symbol,
      timeframe: setup.timeframe,
      setupId: setup.id,
      setupTypeId: setup.setupTypeId,
      setupStatus: setup.status,
      directionalBias: setup.directionalBias,
      directionalBasis: setup.directionalBasis,
      scenarioRole: setup.scenarioRef.role,
      scenarioStructure: setup.scenarioRef.structure,
      scenarioWaveLabel: setup.scenarioRef.waveLabel,
      scenarioEngineStatus: setup.scenarioRef.engineStatus,
      scenarioStatus: setup.scenarioRef.scenarioStatus,
      entryPlanCreated: !!plan,
      entryPlanEligibilityReason: plan?.eligibility.reason ?? null,
      entryAvailability: entryAvail,
      stopAvailability: stopAvail,
      objectiveTargetCandidates:
        snapshot?.objectiveTargetCandidates?.candidates.map((c) => ({
          sourceId: c.sourceId,
          outcome: c.outcome,
        })) ?? [],
      targetSelectionOutcome: snapshot?.objectiveTargetSelection?.outcome ?? null,
      targetAvailability: targetAvail,
      rrAvailability: rrAvail,
      evaluationState: snapshot?.evaluationState ?? null,
      blockers,
    });
  }

  const symbolSummaries: RealMarketSymbolSummary[] = config.symbols.map(
    (symbol) => {
      const candles = candlesBySymbol[symbol] ?? [];
      const bundle = input.tradeContext.bundlesBySymbol?.[symbol];
      const setups = setupDetection.candidates.filter(
        (c) => c.symbol === symbol && c.isTradeSetup
      );
      const statusCounts = emptyStatusCounts();
      for (const s of setups) {
        statusCounts[s.status]++;
      }
      const plans = pipelineReport.entryPlanReport.plans.filter(
        (p) => p.symbol === symbol
      );
      const evalCounts = emptyEvalCounts();
      for (const item of pipelineReport.snapshots.filter(
        (s) => s.symbol === symbol
      )) {
        evalCounts[item.snapshot.evaluationState]++;
      }
      const scenarios = scanReport.results.filter((r) => r.symbol === symbol);
      return {
        symbol,
        timeframe: config.timeframeId,
        closedCandleCount: candles.length,
        firstCandleTime: candles[0]?.time ?? 0,
        lastCandleTime: candles.at(-1)?.time ?? 0,
        marketTrend: bundle?.diagnostics.trendSource.marketTrend ?? "UNKNOWN",
        scenarioCount: scenarios.length,
        setupCount: setups.length,
        setupStatusCounts: statusCounts,
        entryPlanCount: plans.length,
        evaluationCounts: evalCounts,
      };
    }
  );

  const tradeSetups = setupDetection.candidates.filter((c) => c.isTradeSetup);
  const detailBySetupId = new Map(
    tradeSetupDetails.map((d) => [d.setupId, d])
  );
  const tradeSetupTemporalDiagnostics: ReturnType<
    typeof buildTradeSetupTemporalDiagnostic
  >[] = [];
  for (const setup of tradeSetups) {
    const bundle = bundles[setup.symbol];
    if (!bundle) {
      continue;
    }
    const detail = detailBySetupId.get(setup.id);
    tradeSetupTemporalDiagnostics.push(
      buildTradeSetupTemporalDiagnostic({
        setup,
        bundle,
        entryAvailability: detail?.entryAvailability,
        stopAvailability: detail?.stopAvailability,
      })
    );
  }
  tradeSetupTemporalDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );
  const temporalSetupSummary = summarizeTradeSetupTemporalDiagnostics(
    tradeSetupTemporalDiagnostics
  );

  const prospectiveSetupDiagnostics: ReturnType<
    typeof buildProspectiveSetupDiagnostic
  >[] = [];
  for (const setup of tradeSetups) {
    if (setup.status !== "CONFIRMED") {
      continue;
    }
    const candles = candlesBySymbol[setup.symbol];
    if (!candles?.length) {
      continue;
    }
    const bar = resolveTradeSetupEvaluationBoundary({
      candles,
      closedSeriesOnly: true,
    }).evaluationBarIndex;
    const bundle = buildSymbolEvaluationBundleAtEvaluationBar(
      candles,
      config.timeframeId,
      { evaluationBarIndex: bar, closedSeriesOnly: true }
    );
    const effective = candles.slice(0, bundle.evaluationBarIndex + 1);
    prospectiveSetupDiagnostics.push(
      buildProspectiveSetupDiagnostic({
        historicalSetup: setup,
        bundle,
        candles: effective,
      })
    );
  }
  prospectiveSetupDiagnostics.sort((a, b) =>
    a.sourceSetupId.localeCompare(b.sourceSetupId)
  );
  const prospectiveSetupSupportSummary = summarizeProspectiveSetupDiagnostics(
    prospectiveSetupDiagnostics
  );

  const evaluationScopedAnalysisDiagnostics: ReturnType<
    typeof buildEvaluationScopedAnalysisDiagnostic
  >[] = [];
  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    if (!candles.length) {
      continue;
    }
    const lastBar = resolveTradeSetupEvaluationBoundary({
      candles,
      closedSeriesOnly: true,
    }).evaluationBarIndex;
    const confirmedSetup = setupDetection.candidates.find(
      (s) => s.symbol === symbol && s.status === "CONFIRMED"
    );
    evaluationScopedAnalysisDiagnostics.push(
      buildEvaluationScopedAnalysisDiagnostic({
        symbol,
        candles,
        evaluationBarIndex: lastBar,
        timeframeId: config.timeframeId,
        confirmedHistoricalSetup: confirmedSetup ?? null,
        fullSetupCount: setupDetection.candidates.filter(
          (s) => s.symbol === symbol
        ).length,
      })
    );
  }
  evaluationScopedAnalysisDiagnostics.sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  const openStructuralLegDiagnostics: ReturnType<
    typeof buildOpenStructuralLegDiagnostic
  >[] = [];
  for (const setup of tradeSetups) {
    if (setup.status !== "CONFIRMED") {
      continue;
    }
    const candles = candlesBySymbol[setup.symbol];
    if (!candles?.length) {
      continue;
    }
    openStructuralLegDiagnostics.push(
      buildOpenStructuralLegDiagnostic({
        symbol: setup.symbol,
        candles,
        historicalSetup: setup,
        timeframeId: config.timeframeId,
      })
    );
  }
  openStructuralLegDiagnostics.sort((a, b) =>
    a.setupId.localeCompare(b.setupId)
  );
  const openStructuralLegSummary = summarizeOpenStructuralLegDiagnostics(
    openStructuralLegDiagnostics
  );

  const prospectiveProductionReport = buildProspectiveProductionDiagnostics({
    tradeSetups: setupDetection.candidates,
    tradeContext: input.tradeContext,
    candlesBySymbol,
  });
  const prospectiveProductionDiagnostics =
    prospectiveProductionReport.candidates;
  const prospectiveProductionSummary = prospectiveProductionReport.summary;
  const prospectiveFunnel = prospectiveProductionSummary;
  const anchorIdentityDiagnostics = buildAnchorIdentityDiagnostics(
    prospectiveProductionDiagnostics
  );
  const transitionSemanticsDiagnostics = buildTransitionSemanticsDiagnostics(
    prospectiveProductionDiagnostics
  );
  const prospectiveReplayDiagnostics = buildProspectiveReplayDiagnostics();

  const aggregateStatus = emptyStatusCounts();
  for (const s of tradeSetups) {
    aggregateStatus[s.status]++;
  }

  const funnel: RealMarketValidationFunnel = {
    tradeSetupCount: tradeSetups.length,
    confirmedSetupCount: aggregateStatus.CONFIRMED,
    entryPlanCount: pipelineReport.entryPlanReport.planCount,
    entryAvailableCount: tradeSetupDetails.filter(
      (d) => d.entryAvailability === "AVAILABLE"
    ).length,
    stopAvailableCount: tradeSetupDetails.filter(
      (d) => d.stopAvailability === "AVAILABLE"
    ).length,
    targetAvailableCount: tradeSetupDetails.filter(
      (d) => d.targetAvailability === "AVAILABLE"
    ).length,
    rrAvailableCount: tradeSetupDetails.filter(
      (d) => d.rrAvailability === "AVAILABLE"
    ).length,
    readyForFurtherEvaluationCount: tradeSetupDetails.filter(
      (d) => d.evaluationState === "READY_FOR_FURTHER_EVALUATION"
    ).length,
  };

  const aggregateEval = emptyEvalCounts();
  for (const item of pipelineReport.snapshots) {
    aggregateEval[item.snapshot.evaluationState]++;
  }

  return {
    schemaVersion: REAL_MARKET_VALIDATION_SCHEMA_VERSION,
    fetchedAt,
    timeframe: config.timeframeId,
    limit: config.limit,
    symbols: [...config.symbols],
    symbolSummaries,
    tradeSetupDetails,
    funnel,
    blockerCounts,
    waveLabelDistribution,
    setupTypeStatusDistribution,
    directionalBiasDistribution,
    aggregate: {
      scenarioCount: scanReport.scenarioCount ?? scanReport.results.length,
      tradeSetupCount: tradeSetups.length,
      setupStatusCounts: aggregateStatus,
      entryPlanCount: pipelineReport.entryPlanReport.planCount,
      entryAvailableCount: funnel.entryAvailableCount,
      stopAvailableCount: funnel.stopAvailableCount,
      targetAvailableCount: funnel.targetAvailableCount,
      rrAvailableCount: funnel.rrAvailableCount,
      evaluationCounts: aggregateEval,
    },
    conditionSummary,
    invalidationFlowSummary,
    zeroConfirmedRootCauseNotes,
    stopDiagnostics,
    stopFailureSummary,
    invalidationScopeSummary,
    stopScopeCompatibilitySummary,
    scopeCompatibilityMatrix: scopeCompatibilityMatrix(),
    scenarioInvalidationCandidates,
    invalidationPrecedenceFindings,
    correctiveTrackInvalidationNote: correctiveTrackInvalidationNote(
      input.tradeContext
    ),
    stopModelSummary,
    selectedStopModelSummary,
    objectiveTargetProductionDiagnostics,
    objectiveTargetSourceSummary,
    selectedTargetSourceSummary,
    fibonacciProjectionPolicyDiagnostics,
    projectionPolicySummary,
    fibonacciAnchorDiagnostics,
    waveProjectionContextDiagnostics,
    waveProjectionContextSummary,
    objectiveWaveResolutionDiagnostics,
    objectiveWaveResolutionSummary,
    tradeSetupTemporalDiagnostics,
    temporalSetupSummary,
    prospectiveSetupDiagnostics,
    prospectiveSetupSupportSummary,
    evaluationScopedAnalysisDiagnostics,
    openStructuralLegDiagnostics,
    openStructuralLegSummary,
    prospectiveProductionDiagnostics,
    prospectiveProductionSummary,
    prospectiveFunnel,
    anchorIdentityDiagnostics,
    transitionSemanticsDiagnostics,
    prospectiveReplayDiagnostics,
  };
}

export function formatRealMarketValidationReport(
  report: RealMarketValidationReport
): string {
  const lines: string[] = [];
  lines.push("REAL MARKET VALIDATION");
  lines.push("======================");
  lines.push("");
  lines.push(`Fetched at: ${report.fetchedAt}`);
  lines.push(`Symbols: ${report.symbols.length}`);
  lines.push(`Timeframe: ${report.timeframe}`);
  lines.push(`Limit: ${report.limit}`);
  lines.push("");
  lines.push("Closed candles:");
  for (const s of report.symbolSummaries) {
    lines.push(
      `  ${s.symbol} ${s.closedCandleCount} (${s.firstCandleTime} → ${s.lastCandleTime}) trend=${s.marketTrend}`
    );
  }
  lines.push("");
  lines.push(`Scenarios: ${report.aggregate.scenarioCount}`);
  lines.push(`Trade setups: ${report.aggregate.tradeSetupCount}`);
  lines.push(
    `CONFIRMED: ${report.aggregate.setupStatusCounts.CONFIRMED}  CANDIDATE: ${report.aggregate.setupStatusCounts.CANDIDATE}  INVALID: ${report.aggregate.setupStatusCounts.INVALID}  INSUFFICIENT: ${report.aggregate.setupStatusCounts.INSUFFICIENT_CONTEXT}`
  );
  lines.push(`Entry plans: ${report.aggregate.entryPlanCount}`);
  lines.push(
    `Entry AVAILABLE: ${report.aggregate.entryAvailableCount}  Stop AVAILABLE: ${report.aggregate.stopAvailableCount}  Target AVAILABLE: ${report.aggregate.targetAvailableCount}  RR AVAILABLE: ${report.aggregate.rrAvailableCount}`
  );
  lines.push(
    `READY_FOR_FURTHER_EVALUATION: ${report.aggregate.evaluationCounts.READY_FOR_FURTHER_EVALUATION}`
  );
  lines.push("");
  lines.push("Funnel:");
  lines.push(`  Trade Setup → ${report.funnel.tradeSetupCount}`);
  lines.push(`  Confirmed → ${report.funnel.confirmedSetupCount}`);
  lines.push(`  Entry Plan → ${report.funnel.entryPlanCount}`);
  lines.push(`  Entry Available → ${report.funnel.entryAvailableCount}`);
  lines.push(`  Stop Available → ${report.funnel.stopAvailableCount}`);
  lines.push(`  Target Available → ${report.funnel.targetAvailableCount}`);
  lines.push(`  RR Available → ${report.funnel.rrAvailableCount}`);
  lines.push(`  Ready → ${report.funnel.readyForFurtherEvaluationCount}`);
  lines.push("");
  lines.push("Top blockers (frequency only, not quality ranking):");
  const sortedBlockers = Object.entries(report.blockerCounts).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [k, v] of sortedBlockers.slice(0, 15)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("Invalidation flow (aggregate):");
  const inv = report.invalidationFlowSummary;
  lines.push(`  wave candidate invalidation: ${inv.waveCandidateInvalidationAvailable}`);
  lines.push(`  scenario/scanner invalidation: ${inv.scannerInvalidationAvailable}`);
  lines.push(`  setup SCENARIO_INVALIDATION ref: ${inv.setupScenarioInvalidationReferenceAvailable}`);
  lines.push(
    `  scanner→setup mapping gaps: ${inv.scannerAvailableSetupReferenceMissing}`
  );
  lines.push("");
  lines.push("Stop failure summary (frequency only):");
  for (const [k, v] of Object.entries(report.stopFailureSummary).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("");
  lines.push("Invalidation scope (scanner scenarios):");
  for (const [src, n] of Object.entries(
    report.invalidationScopeSummary.bySource
  )) {
    lines.push(`  ${src}: ${n}`);
  }
  lines.push("");
  lines.push("Stop scope compatibility (entry plans with stop diagnostics):");
  for (const [src, stats] of Object.entries(
    report.stopScopeCompatibilitySummary.bySource
  )) {
    lines.push(
      `  ${src}: considered=${stats.considered} geometryAccepted=${stats.geometryAccepted} geometryRejected=${stats.geometryRejected}`
    );
  }
  if (report.invalidationPrecedenceFindings.length > 0) {
    lines.push("");
    lines.push("Invalidation precedence findings:");
    for (const f of report.invalidationPrecedenceFindings) {
      lines.push(`  - ${f}`);
    }
  }
  lines.push("");
  lines.push("Stop model summary (per-model outcomes, not ranking):");
  for (const [modelId, stats] of Object.entries(
    report.stopModelSummary.byModelId
  )) {
    lines.push(
      `  ${modelId}: available=${stats.available} insufficient=${stats.insufficient} notApplicable=${stats.notApplicable}`
    );
  }
  lines.push("");
  lines.push("Selected stop model (first AVAILABLE in catalog order):");
  for (const [modelId, n] of Object.entries(
    report.selectedStopModelSummary.byModelId
  )) {
    lines.push(`  ${modelId}: ${n}`);
  }
  lines.push("");
  lines.push("Objective target source summary:");
  for (const [src, stats] of Object.entries(
    report.objectiveTargetSourceSummary
  )) {
    lines.push(
      `  ${src}: available=${stats.available} insufficient=${stats.insufficient} notApplicable=${stats.notApplicable}`
    );
  }
  lines.push("");
  lines.push("Fibonacci projection policy (aggregate status, not quality):");
  for (const [status, n] of Object.entries(report.projectionPolicySummary)) {
    lines.push(`  ${status}: ${n}`);
  }
  lines.push("");
  lines.push("Fibonacci anchor lookahead (entry plans):");
  for (const row of report.fibonacciAnchorDiagnostics) {
    lines.push(
      `  ${row.setupId}: safe=${row.lookahead.safe} maxAnchorIndex=${row.lookahead.maxAnchorIndex}`
    );
  }
  lines.push("");
  lines.push("Wave projection context (14N-B, not target policy):");
  for (const [status, n] of Object.entries(report.waveProjectionContextSummary)) {
    lines.push(`  ${status}: ${n}`);
  }
  lines.push("");
  lines.push("Objective wave resolution (14N-C):");
  for (const [status, n] of Object.entries(report.objectiveWaveResolutionSummary)) {
    lines.push(`  ${status}: ${n}`);
  }
  lines.push("");
  lines.push("Trade setup temporal semantics (14N-D):");
  for (const [k, n] of Object.entries(report.temporalSetupSummary)) {
    lines.push(`  ${k}: ${n}`);
  }
  for (const row of report.tradeSetupTemporalDiagnostics.filter(
    (r) => r.lifecycleStatus === "CONFIRMED"
  )) {
    lines.push(
      `  ${row.setupId}: objective=${row.objectiveEligibility} entry=${row.entryAvailability} stop=${row.stopAvailability}`
    );
  }
  lines.push("");
  lines.push("Prospective setup contract (14N-E):");
  for (const [k, n] of Object.entries(report.prospectiveSetupSupportSummary)) {
    lines.push(`  ${k}: ${n}`);
  }
  lines.push("");
  lines.push("Prospective production (14N-H):");
  for (const [k, n] of Object.entries(report.prospectiveProductionSummary)) {
    lines.push(`  ${k}: ${n}`);
  }
  lines.push("");
  lines.push("Open structural leg (14N-G):");
  for (const [k, n] of Object.entries(report.openStructuralLegSummary)) {
    lines.push(`  ${k}: ${n}`);
  }
  lines.push("");
  lines.push("Evaluation-scoped analysis (14N-F):");
  for (const row of report.evaluationScopedAnalysisDiagnostics) {
    lines.push(
      `  ${row.symbol} bar=${row.evaluationBarIndex} futureSafe=${row.futureSafe} prefixInvariant=${row.prefixInvariant} parity=${row.parityAtLastClosedBar} openLeg=${row.openLegVerdict}`
    );
  }
  lines.push("");
  lines.push(report.correctiveTrackInvalidationNote);
  return lines.join("\n");
}

export async function runRealMarketValidation(
  config: RealMarketValidationRunConfig,
  provider?: BinanceFuturesOhlcvProvider
): Promise<RealMarketValidationReport> {
  const ohlcv = provider ?? new BinanceFuturesOhlcvProvider();
  const candlesBySymbol: Record<string, Candle[]> = {};
  const symbolInputs: Record<
    string,
    { candles: Candle[]; closedSeriesOnly: true }
  > = {};

  for (const symbol of config.symbols) {
    const candles = await ohlcv.getCandles(symbol, config.interval, config.limit);
    candlesBySymbol[symbol] = candles;
    symbolInputs[symbol] = { candles, closedSeriesOnly: true };
  }

  const scanInputs = config.symbols
    .filter((s) => candlesBySymbol[s]?.length)
    .map((symbol) => ({ symbol, candles: candlesBySymbol[symbol] }));

  const scanReport = runWaveScan(scanInputs, {
    timeframe: config.timeframeId,
    engineOptions: config.engineOptions,
  });

  const tradeContext = buildTradeSetupEvaluationContext(
    scanReport,
    symbolInputs,
    config.engineOptions
  );

  const setupDetection = detectSetups({
    scanReport: tradeContext.scanReport,
    tradeContext,
  });

  const pipelineReport = buildTradeSetupEvaluationPipeline({
    scanReport,
    tradeContext,
    candlesBySymbol,
    setupDetectionReport: setupDetection,
  });

  return buildRealMarketValidationReport({
    config,
    candlesBySymbol,
    scanReport,
    tradeContext,
    setupDetection,
    pipelineReport,
  });
}
