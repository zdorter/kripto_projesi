import { PRICE_MOVE_REWARD_BUCKET_IDS } from "./historical-entry-price-move-quality-analysis-types";
import { targetBandToRewardBucket } from "./historical-target-distance-reachability-cost-balance-analysis";
import type { IndependentTradeSampleSizeQuality } from "./historical-independent-trade-analysis-types";
import type { IndependentTradeLifecycleReport } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION,
  PHASE_B_COST_SCENARIOS_PERCENT,
  PHASE_B_FUTURE_MOVE_THRESHOLDS_PERCENT,
  PHASE_B_RESEARCH_PRIMARY_TIMEFRAME,
  PHASE_B_RESEARCH_TARGET_SYMBOLS,
  type BuildHistoricalPhaseBMultiSymbolRegimeValidationInput,
  type CandidateValidationRow,
  type CostGeneralizationRow,
  type DatasetMatrixRow,
  type DelayedEntryGeneralizationRow,
  type DisplacementGeneralizationRow,
  type FutureMoveGeneralizationRow,
  type HeadroomGeneralizationRow,
  type HistoricalPhaseBMultiSymbolRegimeValidationReport,
  type PhaseBResearchDatasetRef,
  type PhaseBResearchEvidenceTag,
  type PhaseBResearchRegimeLabel,
  type PhaseBResearchReplicationStatus,
  type PhaseBResearchScopeKey,
  type PhaseBResearchStabilityClass,
  type PopulationMatrixRow,
  type SymbolCoreMetricsRow,
  type SymbolRegimeMatrixCell,
  type TargetMagnitudeGeneralizationRow,
  type TargetModelGeneralizationRow,
} from "./historical-phase-b-multi-symbol-regime-validation-types";

const WARNINGS: readonly string[] = [
  "phase_b_multi_symbol_regime_research_only",
  "no_production_rule",
  "no_optimizer",
  "no_best_or_optimal_language",
  "scenario_cost_not_exchange_fee",
  "slippage_funding_execution_not_modeled",
  "multiple_comparison_not_adjusted",
  "btc_1h_not_auto_generalized",
];

export function phaseBResearchScopeKey(symbol: string, timeframe: string): PhaseBResearchScopeKey {
  return `${symbol}:${timeframe}`;
}

function sampleQuality(n: number): IndependentTradeSampleSizeQuality {
  if (n < 10) return "VERY_SMALL_SAMPLE";
  if (n < 30) return "SMALL_SAMPLE";
  if (n < 100) return "MODERATE_SAMPLE";
  return "LARGE_SAMPLE";
}

function sortedScopeKeys(input: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput): PhaseBResearchScopeKey[] {
  return Object.keys(input.lifecycleReports).sort() as PhaseBResearchScopeKey[];
}

function datasetFor(
  datasets: readonly PhaseBResearchDatasetRef[],
  symbol: string,
  timeframe: string
): PhaseBResearchDatasetRef | undefined {
  return datasets.find((d) => d.symbol === symbol && d.timeframe === timeframe);
}

function buildDatasetMatrix(datasets: readonly PhaseBResearchDatasetRef[]): DatasetMatrixRow[] {
  const rows: DatasetMatrixRow[] = [];
  for (const symbol of PHASE_B_RESEARCH_TARGET_SYMBOLS) {
    const primary = datasetFor(datasets, symbol, PHASE_B_RESEARCH_PRIMARY_TIMEFRAME);
    if (primary) {
      rows.push({
        symbol,
        timeframe: PHASE_B_RESEARCH_PRIMARY_TIMEFRAME,
        status: primary.status,
        fixturePath: primary.fixturePath,
        datasetChecksum: primary.datasetChecksum,
        candleCount: primary.candleCount,
        firstTimestamp: primary.firstTimestamp,
        lastTimestamp: primary.lastTimestamp,
        nextDatasetRequired: primary.status === "DATASET_NOT_AVAILABLE",
        note:
          primary.status === "AVAILABLE"
            ? "Frozen dataset supplied by caller."
            : "NEXT_DATASET_REQUIRED — no fixture in repo.",
      });
    } else {
      rows.push({
        symbol,
        timeframe: PHASE_B_RESEARCH_PRIMARY_TIMEFRAME,
        status: "DATASET_NOT_AVAILABLE",
        fixturePath: null,
        datasetChecksum: null,
        candleCount: null,
        firstTimestamp: null,
        lastTimestamp: null,
        nextDatasetRequired: true,
        note: "NEXT_DATASET_REQUIRED — symbol/timeframe not in datasets input.",
      });
    }
  }
  return rows.sort((a, b) => `${a.symbol}:${a.timeframe}`.localeCompare(`${b.symbol}:${b.timeframe}`));
}

function populationRow(
  scopeKey: PhaseBResearchScopeKey,
  lifecycle: IndependentTradeLifecycleReport,
  replay?: { classifiable: number | null; notReplayable: number | null; horizon: number } | null
): PopulationMatrixRow {
  const n = lifecycle.trades.length;
  const q = sampleQuality(n);
  return {
    scopeKey,
    symbol: lifecycle.trades[0]?.symbol ?? scopeKey.split(":")[0]!,
    timeframe: lifecycle.trades[0]?.timeframe ?? scopeKey.split(":")[1]!,
    independentTrades: n,
    replayClassifiable: replay?.classifiable ?? null,
    notReplayable: replay?.notReplayable ?? null,
    horizonBars: replay?.horizon ?? lifecycle.configuration?.horizonBars ?? null,
    sampleSizeQuality: q,
    interpretWithCaution: n < 10,
  };
}

function replayPopulation(
  input: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput,
  scopeKey: PhaseBResearchScopeKey
) {
  const b12w = input.reachabilityReplayReports?.[scopeKey];
  if (!b12w) return null;
  const canon = b12w.modelResults.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY");
  return {
    classifiable: canon?.classifiableTrades ?? null,
    notReplayable: canon?.notReplayable ?? null,
    horizon: b12w.replayPolicy.horizonBars,
  };
}

function classifyReplication(
  btcRate: number | null,
  otherRate: number | null,
  otherN: number
): PhaseBResearchReplicationStatus {
  if (otherN < 10) return "INSUFFICIENT_SAMPLE";
  if (btcRate === null || otherRate === null) return "NOT_ESTABLISHED";
  const delta = Math.abs(btcRate - otherRate);
  if (delta <= 0.05) return "REPLICATED";
  if (delta <= 0.15) return "PARTIALLY_REPLICATED";
  return "NOT_REPLICATED";
}

function stabilityClass(
  scopeCount: number,
  replication: PhaseBResearchReplicationStatus
): PhaseBResearchStabilityClass {
  if (scopeCount < 2) return "INSUFFICIENT_SAMPLE";
  if (replication === "REPLICATED") return "STABLE_ACROSS_SYMBOLS";
  if (replication === "PARTIALLY_REPLICATED") return "PARTIALLY_STABLE";
  if (replication === "NOT_REPLICATED") return "SYMBOL_DEPENDENT";
  return "INSUFFICIENT_SAMPLE";
}

function slugCandidateId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function regimeFromDirection(direction: string | null): PhaseBResearchRegimeLabel {
  if (direction === "BULLISH" || direction === "BEARISH") return direction;
  if (direction === null) return "NEUTRAL";
  return "REGIME_NOT_AVAILABLE";
}

function buildSymbolRegimeMatrix(
  input: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput,
  scopeKeys: PhaseBResearchScopeKey[]
): SymbolRegimeMatrixCell[] {
  const cells: SymbolRegimeMatrixCell[] = [];
  for (const scopeKey of scopeKeys) {
    const lifecycle = input.lifecycleReports[scopeKey]!;
    const b14 = input.futureMoveAnalysisReports?.[scopeKey];
    const b19 = input.delayedEntryDecisionAuditReports?.[scopeKey];
    const b12w = input.reachabilityReplayReports?.[scopeKey];
    const b12x = input.costAwareCounterfactualAnalysisReports?.[scopeKey];
    const canonReach = b12w?.modelComparison.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )?.targetReachRate;
    const cost020 =
      b12x?.modelResults.find(
        (m) =>
          m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && Math.abs(m.roundTripCostPercentage - 0.2) < 1e-9
      )?.costCoveredTargetRate ?? null;
    const delayed025 = b19?.decisionComparisonTable.find(
      (r) => r.model === "MODEL_A_FIXED_RETRACEMENT" && r.levelLabel === "0.25%"
    );
    const reach1 = b14?.thresholdAnalysis.find((t) => t.thresholdPercent === 1)?.futureMoveReachRate ?? null;
    const reach2 = b14?.thresholdAnalysis.find((t) => t.thresholdPercent === 2)?.futureMoveReachRate ?? null;

    const regimes: PhaseBResearchRegimeLabel[] = ["BULLISH", "BEARISH", "NEUTRAL"];
    for (const regime of regimes) {
      const trades = lifecycle.trades.filter((t) => regimeFromDirection(t.direction) === regime);
      const n = trades.length;
      const status = n < 10 ? "INSUFFICIENT_SAMPLE" : n === 0 ? "NOT_REPORTED" : "REPORTED";
      cells.push({
        scopeKey,
        symbol: trades[0]?.symbol ?? scopeKey.split(":")[0]!,
        timeframe: trades[0]?.timeframe ?? scopeKey.split(":")[1]!,
        regime,
        trades: n,
        classifiable: n >= 10 ? n : null,
        targetReachRate: status === "REPORTED" ? (canonReach ?? null) : null,
        futureMoveReach1Pct: status === "REPORTED" ? reach1 : null,
        futureMoveReach2Pct: status === "REPORTED" ? reach2 : null,
        medianMfe: null,
        medianTargetDistancePct: null,
        costCoverageAt020: status === "REPORTED" ? (cost020 ?? null) : null,
        delayedFillAt025Pct:
          status === "REPORTED" ? (delayed025?.fillRate ?? null) : null,
        sampleSizeQuality: sampleQuality(n),
        interpretWithCaution: n < 10,
        status,
        tags: n >= 10 ? ["CROSS_REGIME_OBSERVATION", "ASSOCIATIONAL_FINDING"] : ["INSUFFICIENT_SAMPLE"],
      });
    }
  }
  return cells.sort((a, b) =>
    `${a.scopeKey}:${a.regime}`.localeCompare(`${b.scopeKey}:${b.regime}`)
  );
}

export function buildHistoricalPhaseBMultiSymbolRegimeValidation(
  input: BuildHistoricalPhaseBMultiSymbolRegimeValidationInput
): HistoricalPhaseBMultiSymbolRegimeValidationReport {
  const scopeKeys = sortedScopeKeys(input);
  const datasetMatrix = buildDatasetMatrix(input.datasets);
  const missingSections: string[] = [];

  const btcScope = scopeKeys.find((k) => k.startsWith("BTCUSDT:")) ?? null;
  if (!btcScope) missingSections.push("BTCUSDT_PRIMARY_SCOPE");

  const populationMatrix: PopulationMatrixRow[] = scopeKeys.map((scopeKey) =>
    populationRow(scopeKey, input.lifecycleReports[scopeKey]!, replayPopulation(input, scopeKey))
  );

  const symbolSummary: SymbolCoreMetricsRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b12w = input.reachabilityReplayReports?.[scopeKey];
    const b14 = input.futureMoveAnalysisReports?.[scopeKey];
    const b19 = input.delayedEntryDecisionAuditReports?.[scopeKey];
    const b12x = input.costAwareCounterfactualAnalysisReports?.[scopeKey];
    const b15 = input.futureMovePredictivenessAnalysisReports?.[scopeKey];
    const canonReach = b12w?.modelComparison.find(
      (m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    )?.targetReachRate;
    const mfe =
      b15?.displacementAnalysis.buckets[0]?.thresholdSlices.find((s) => s.thresholdPercent === 1)
        ?.medianMfe ?? null;
    const cost020 =
      b12x?.modelResults.find(
        (m) =>
          m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" && Math.abs(m.roundTripCostPercentage - 0.2) < 1e-9
      )?.costCoveredTargetRate ?? null;
    const delayed = b19?.decisionComparisonTable.find(
      (r) => r.model === "MODEL_A_FIXED_RETRACEMENT" && r.levelLabel === "0.25%"
    );
    symbolSummary.push({
      scopeKey,
      symbol: scopeKey.split(":")[0]!,
      timeframe: scopeKey.split(":")[1]!,
      canonicalTargetReachRate: canonReach ?? null,
      futureMoveReachAt1Pct:
        b14?.thresholdAnalysis.find((t) => t.thresholdPercent === 1)?.futureMoveReachRate ?? null,
      futureMoveReachAt2Pct:
        b14?.thresholdAnalysis.find((t) => t.thresholdPercent === 2)?.futureMoveReachRate ?? null,
      medianMfePercent: mfe,
      costCoverageAt020: cost020,
      delayedFillAt025Pct: delayed?.fillRate ?? null,
      delayedImprovementAt025Pct: delayed?.medianImprovement ?? null,
      tags: scopeKeys.length > 1 ? ["DIRECT_OBSERVATION", "CROSS_SYMBOL_OBSERVATION"] : ["DIRECT_OBSERVATION"],
    });
  }

  const targetMagnitudeGeneralization: TargetMagnitudeGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b12r = input.historicalEntryPriceMoveQualityAnalysisReports?.[scopeKey];
    const b12w = input.reachabilityReplayReports?.[scopeKey];
    const b12z = input.historicalTargetDistanceReachabilityCostBalanceAnalysisReports?.[scopeKey];
    for (const bucketId of PRICE_MOVE_REWARD_BUCKET_IDS) {
      if (bucketId === "REWARD_NOT_APPLICABLE") continue;
      const cross = b12w?.rewardCross.find(
        (c) => c.rewardBucket === bucketId && c.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
      );
      const reach = cross && cross.trades > 0 ? cross.targetReached / cross.trades : null;
      const row = b12z?.targetDistanceBalanceTable.find(
        (r) => targetBandToRewardBucket(r.targetDistanceBand) === bucketId
      );
      targetMagnitudeGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        rewardBucketLabel: bucketId,
        population: b12r?.rewardBuckets.byBucket[bucketId].trades ?? cross?.trades ?? null,
        targetReachRate: reach,
        costCoverageAt020: row?.costCoverageAt0_20 ?? null,
        theoreticalRReferenceNote: "B-12h/B-12p via B-12r when supplied; not recomputed in B-21.",
        tags: ["DIRECT_OBSERVATION"],
      });
    }
  }

  const btcReach1 =
    btcScope && input.futureMoveAnalysisReports?.[btcScope]
      ? input.futureMoveAnalysisReports[btcScope]!.thresholdAnalysis.find((t) => t.thresholdPercent === 1)
          ?.futureMoveReachRate ?? null
      : null;

  const futureMoveGeneralization: FutureMoveGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b14 = input.futureMoveAnalysisReports?.[scopeKey];
    if (!b14) continue;
    for (const th of PHASE_B_FUTURE_MOVE_THRESHOLDS_PERCENT) {
      const row = b14.thresholdAnalysis.find((t) => t.thresholdPercent === th);
      const rate = row?.futureMoveReachRate ?? null;
      const n = row?.eligibleTrades ?? 0;
      const replication =
        scopeKey === btcScope
          ? "NOT_ESTABLISHED"
          : classifyReplication(btcReach1, rate, n);
      futureMoveGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        thresholdPercent: th,
        futureMoveReachRate: rate,
        medianBarsToReach: row?.medianBarsToReach ?? null,
        replicationVsBtc: replication,
        tags:
          scopeKey === btcScope
            ? ["DIRECT_OBSERVATION"]
            : ["CROSS_SYMBOL_OBSERVATION", "ASSOCIATIONAL_FINDING"],
      });
    }
  }

  const headroomGeneralization: HeadroomGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b12u = input.structuralExtremeVsDisplacementTargetReports?.[scopeKey];
    const b13 = input.historicalEntryContextTargetResearchReports?.[scopeKey];
    const dist = b12u?.headroomDistribution;
    const present = dist
      ? Object.entries(dist).reduce((s, [k, v]) => (k === "NO_HEADROOM" ? s : s + v), 0)
      : null;
    const absent = dist?.NO_HEADROOM ?? null;
    const reachPresent =
      b13?.headroomAnalysis.find((h) => h.headroomBucket !== "NO_HEADROOM")?.targetReachRate ?? null;
    const reachAbsent =
      b13?.headroomAnalysis.find((h) => h.headroomBucket === "NO_HEADROOM")?.targetReachRate ?? null;
    headroomGeneralization.push(
      {
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        headroomBucket: "HEADROOM_PRESENT",
        population: present,
        targetReachRate: reachPresent,
        futureMoveReach1Pct: null,
        note: "CROSS_SYMBOL_ASSOCIATION only — not predictive headroom claim.",
        tags: ["ASSOCIATIONAL_FINDING", "CROSS_SYMBOL_OBSERVATION"],
      },
      {
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        headroomBucket: "HEADROOM_ABSENT",
        population: absent,
        targetReachRate: reachAbsent,
        futureMoveReach1Pct: null,
        note: "Compare reach deltas descriptively vs BTC; geometry redundancy per B-17.",
        tags: ["ASSOCIATIONAL_FINDING"],
      }
    );
  }

  const displacementGeneralization: DisplacementGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b13 = input.historicalEntryContextTargetResearchReports?.[scopeKey];
    if (!b13) continue;
    for (const row of b13.displacementAnalysis) {
      displacementGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        displacementBucket: String(row.displacementBucket),
        trades: row.trades,
        targetReachRate: row.targetReachRate,
        futureMoveReach1Pct: null,
        tags: ["ASSOCIATIONAL_FINDING"],
      });
    }
  }

  const delayedEntryGeneralization: DelayedEntryGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b19 = input.delayedEntryDecisionAuditReports?.[scopeKey];
    if (!b19 || b19.auditBlocked) continue;
    for (const row of b19.decisionComparisonTable.filter(
      (r) => r.model === "MODEL_A_FIXED_RETRACEMENT"
    )) {
      delayedEntryGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        levelLabel: row.levelLabel,
        fillRate: row.fillRate,
        missedRate: row.missedRate,
        medianImprovement: row.medianImprovement,
        t1TargetReachRate: row.t1TargetReachRate,
        costCoverageAt020: row.costCoverageAt020,
        tags: ["COUNTERFACTUAL_EVIDENCE", "CROSS_SYMBOL_OBSERVATION"],
      });
    }
  }

  const targetModelGeneralization: TargetModelGeneralizationRow[] = [];
  const targetModelIds = [
    "CANONICAL_DISPLACEMENT_EQUALITY",
    "STRUCTURAL_PREFIX_EXTREME",
    "DISPLACEMENT_1_25",
    "DISPLACEMENT_1_50",
    "DISPLACEMENT_2_00",
    "DISPLACEMENT_2_50",
    "DISPLACEMENT_3_00",
  ] as const;
  for (const scopeKey of scopeKeys) {
    const b12w = input.reachabilityReplayReports?.[scopeKey];
    const b12x = input.costAwareCounterfactualAnalysisReports?.[scopeKey];
    if (!b12w) continue;
    for (const modelId of targetModelIds) {
      const m = b12w.modelComparison.find((x) => x.modelId === modelId);
      const cost =
        b12x?.modelResults.find(
          (c) => c.modelId === modelId && Math.abs(c.roundTripCostPercentage - 0.2) < 1e-9
        )?.costCoveredTargetRate ?? null;
      targetModelGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        modelId,
        targetReachRate: m?.targetReachRate ?? null,
        targetBeforeInvalidationRate: m?.targetBeforeInvalidationRate ?? null,
        meanMfePercentage: m?.meanMfePercentage ?? null,
        costCoverageAt020: cost,
        tags: ["COUNTERFACTUAL_EVIDENCE"],
      });
    }
  }

  const costGeneralization: CostGeneralizationRow[] = [];
  for (const scopeKey of scopeKeys) {
    const b12x = input.costAwareCounterfactualAnalysisReports?.[scopeKey];
    if (!b12x) continue;
    for (const costPct of PHASE_B_COST_SCENARIOS_PERCENT) {
      const m = b12x.modelResults.find(
        (r) =>
          r.modelId === "CANONICAL_DISPLACEMENT_EQUALITY" &&
          Math.abs(r.roundTripCostPercentage - costPct) < 1e-9
      );
      if (!m) continue;
      costGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        roundTripCostPercent: costPct,
        costCoverageRate: m.costCoveredTargetRate,
        grossMarginMedian: m.meanGrossRewardPercentageOnReached,
        netMarginMedian: m.meanNetMarginPercentageOnReached,
        tags: ["DIRECT_OBSERVATION", "CROSS_SYMBOL_OBSERVATION"],
      });
    }
  }

  const riskRrGeneralization: HistoricalPhaseBMultiSymbolRegimeValidationReport["riskRrGeneralization"][number][] =
    [];
  for (const scopeKey of scopeKeys) {
    const b19 = input.delayedEntryDecisionAuditReports?.[scopeKey];
    if (!b19 || b19.auditBlocked) continue;
    for (const row of b19.invalidationComparison.rows.filter(
      (r) => r.targetModel === "T1_FROZEN_TARGET" && r.model === "MODEL_D_NO_DELAY_BASELINE"
    )) {
      riskRrGeneralization.push({
        scopeKey,
        symbol: scopeKey.split(":")[0]!,
        label: `${row.model}:${row.invalidationModel}`,
        medianRiskPct: row.medianRiskPct,
        medianCounterfactualRr: row.medianCounterfactualRr,
        theoreticalRNote: "B-12h reference only when present in upstream reports.",
        tags: ["COUNTERFACTUAL_EVIDENCE"],
      });
    }
  }

  const contextGeneralization: HistoricalPhaseBMultiSymbolRegimeValidationReport["contextGeneralization"][number][] =
    [];
  for (const scopeKey of scopeKeys) {
    const b20 = input.integratedEvidenceAudits?.[scopeKey];
    if (b20) {
      for (const c of b20.contextConditionalEvidence) {
        contextGeneralization.push({
          scopeKey,
          symbol: scopeKey.split(":")[0]!,
          dimension: c.dimension,
          bucket: c.bucket,
          note: c.note,
          tags: [c.tag as PhaseBResearchEvidenceTag],
        });
      }
    }
  }

  const candidateValidation: CandidateValidationRow[] = [];
  const btcAudit = btcScope ? input.integratedEvidenceAudits?.[btcScope] : undefined;
  const candidates = btcAudit?.researchCandidates ?? [];
  const crossSymbolCount = scopeKeys.length;
  for (const c of candidates) {
    const replication: PhaseBResearchReplicationStatus =
      crossSymbolCount >= 2 ? "NOT_ESTABLISHED" : "INSUFFICIENT_SAMPLE";
    candidateValidation.push({
      candidateId: slugCandidateId(c.label),
      label: c.label,
      btcEvidence: c.evidence,
      crossSymbolEvidence:
        crossSymbolCount >= 2
          ? "Compare symbolSummary and futureMoveGeneralization replicationVsBtc."
          : "Only BTCUSDT 1H frozen scope available — cross-symbol NOT_ESTABLISHED.",
      crossRegimeEvidence: "symbolRegimeMatrix ASSOCIATIONAL slices when n>=10.",
      sampleQuality: sampleQuality(c.sampleSize ?? 0),
      geometryDependency: "See geometryDependency section (B-17 parity).",
      temporalBehavior: "TEMPORAL_DESCRIPTIVE_SPLIT from B-18/B-19 per scope when present.",
      evidenceStatus: replication,
      stabilityClass: stabilityClass(crossSymbolCount, replication),
      limitations: [...c.limitations, "multi_symbol_frozen_datasets_limited"],
      nextExperiment: c.nextExperiment,
      tags: ["NOT_ESTABLISHED", "ASSOCIATIONAL_FINDING"],
    });
  }
  if (!candidates.length) missingSections.push("B-20_integratedEvidenceAudits");

  const temporalStability: HistoricalPhaseBMultiSymbolRegimeValidationReport["temporalStability"][number][] =
    [];
  for (const scopeKey of scopeKeys) {
    const b18 = input.delayedEntryResearchReports?.[scopeKey];
    const b19 = input.delayedEntryDecisionAuditReports?.[scopeKey];
    temporalStability.push({
      scopeKey,
      symbol: scopeKey.split(":")[0]!,
      label: "TEMPORAL_DESCRIPTIVE_SPLIT",
      note: b19?.temporalDescriptiveSplit.note ?? b18?.temporalDescriptiveSplit.note ?? "Not consumed.",
      tags: ["ASSOCIATIONAL_FINDING"],
    });
  }

  const geometryPerScope = scopeKeys.map((scopeKey) => ({
    scopeKey,
    validityClass:
      input.signalIndependenceAuditReports?.[scopeKey]?.geometricRedundancyAnalysis.validityClass ??
      null,
  }));

  const nextDatasetsRequired = datasetMatrix
    .filter((d) => d.nextDatasetRequired)
    .map((d) => ({
      symbol: d.symbol,
      timeframe: d.timeframe,
      reason: "Frozen Phase B research fixture not present in repository.",
    }));

  if (crossSymbolCount < 2) {
    missingSections.push("CROSS_SYMBOL_FROZEN_STACK");
  }

  const regimeSummary = (["BULLISH", "BEARISH", "NEUTRAL"] as PhaseBResearchRegimeLabel[]).map(
    (regime) => ({
      regime,
      scopesReporting: scopeKeys.length,
      note: "Trade direction proxy at E; TRENDING/RANGING not modeled — REGIME_NOT_AVAILABLE for structural regime.",
      tags: ["ASSOCIATIONAL_FINDING"] as const,
    })
  );

  return {
    schemaVersion: HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION,
    datasetMatrix,
    populationMatrix,
    symbolSummary,
    regimeSummary,
    symbolRegimeMatrix: buildSymbolRegimeMatrix(input, scopeKeys),
    targetMagnitudeGeneralization,
    futureMoveGeneralization,
    headroomGeneralization,
    displacementGeneralization,
    delayedEntryGeneralization,
    targetModelGeneralization,
    costGeneralization,
    riskRrGeneralization,
    contextGeneralization,
    candidateValidation,
    temporalStability,
    statisticalQuality: {
      reachRateConfidence: "Wilson_95_when_present_in_source_reports",
      sampleSizeLabels: ["LARGE_SAMPLE", "MODERATE_SAMPLE", "SMALL_SAMPLE", "VERY_SMALL_SAMPLE"],
      interpretWithCautionWhenNBelow10: true,
      correlationNote: "Correlations descriptive only; no p-value significance claims.",
    },
    geometryDependency: {
      statement:
        "Displacement ↔ canonical reward and reward ↔ RR carry high geometry dependency (B-17). Do not count as independent replication.",
      perScope: geometryPerScope,
      tags: ["NOT_ESTABLISHED", "ASSOCIATIONAL_FINDING"],
    },
    directObservations: [
      "per_symbol_reach_replay",
      "future_move_threshold_reach",
      "cost_arithmetic",
      "delayed_entry_counterfactual",
    ],
    associationalFindings: [
      "regime_direction_slices",
      "headroom_cross_symbol",
      "displacement_buckets",
    ],
    counterfactualEvidence: [
      "alternative_target_models",
      "delayed_entry_MODEL_A",
      "I1_I2_views",
    ],
    warnings: [...WARNINGS],
    missingSections: [...new Set(missingSections)].sort(),
    nextExperiments: [
      "freeze_eth_bnb_sol_xrp_ada_1h_datasets",
      "optional_15m_secondary_timeframe",
      "regime_specific_dataset_segmentation",
      "walk_forward_validation",
      "true_exchange_fee_slippage_funding",
      "execution_simulation",
      "paper_trading_shadow",
    ],
    nextDatasetsRequired,
    productionDecision: {
      productionRuleStatus: "NOT_ESTABLISHED",
      entryRuleStatus: "NOT_ESTABLISHED",
      targetRuleStatus: "NOT_ESTABLISHED",
      delayedEntryRuleStatus: "NOT_ESTABLISHED",
      generalMarketRule: "NOT_ESTABLISHED",
    },
    lookaheadAttestation: {
      entryContextEnd: "E",
      outcomeFrom: "E+1",
      statement:
        "B-21 consumes frozen phase reports per scope; no future-derived entry/target/invalidation selection.",
    },
    availableScopeKeys: scopeKeys,
    crossSymbolScopeCount: crossSymbolCount,
  };
}
