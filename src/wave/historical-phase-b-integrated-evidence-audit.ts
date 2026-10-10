import { PRICE_MOVE_REWARD_BUCKET_IDS } from "./historical-entry-price-move-quality-analysis-types";
import type { PriceMoveRewardBucketId } from "./historical-entry-price-move-quality-analysis-types";
import { targetBandToRewardBucket } from "./historical-target-distance-reachability-cost-balance-analysis";
import type { DelayedEntryModelId } from "./historical-delayed-entry-research-types";
import {
  HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION,
  type BuildHistoricalPhaseBIntegratedEvidenceAuditInput,
  type CanonicalVsDelayedDeltaRow,
  type CostSurfaceRow,
  type DescriptiveDecisionSurfaceCell,
  type FutureMoveEvidenceRow,
  type HistoricalPhaseBIntegratedEvidenceAuditReport,
  type PhaseSourceMatrixRow,
  type ResearchCandidate,
  type TargetDecisionSurfaceRow,
  type TargetMagnitudeEvidenceRow,
} from "./historical-phase-b-integrated-evidence-audit-types";

const FIXTURE_PATH = "src/wave/fixtures/btcusdt-1h-research-ohlcv-v1.json";
const FIXTURE_CHECKSUM =
  "f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc";

const WARNINGS: readonly string[] = [
  "phase_b_integrated_evidence_audit_only",
  "no_production_rule",
  "no_optimizer",
  "no_best_or_optimal_language",
  "single_symbol_single_timeframe",
  "multiple_comparison_not_adjusted",
  "scenario_cost_not_exchange_fee",
];

function populationFromInput(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput) {
  const b18 = input.delayedEntryResearchReport;
  const b12w = input.reachabilityReplayReport;
  if (b18) return b18.population;
  if (b12w) {
    const canon = b12w.modelResults.find((m) => m.modelId === "CANONICAL_DISPLACEMENT_EQUALITY");
    return {
      independentTrades: b12w.population.independentTrades,
      replayClassifiable: canon?.classifiableTrades ?? 320,
      notReplayable: canon?.notReplayable ?? 16,
      horizonBars: b12w.replayPolicy.horizonBars,
    };
  }
  return {
    independentTrades: input.lifecycleReport.trades.length,
    replayClassifiable: input.lifecycleReport.trades.length,
    notReplayable: 0,
    horizonBars: input.lifecycleReport.configuration?.horizonBars ?? 24,
  };
}

function phaseRow(
  phaseId: string,
  reportKey: string,
  report: { schemaVersion?: string } | undefined,
  note: string
): PhaseSourceMatrixRow {
  return {
    phaseId,
    reportKey,
    consumed: Boolean(report),
    schemaVersion: report?.schemaVersion ?? null,
    note,
  };
}

function buildSourceMatrix(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): PhaseSourceMatrixRow[] {
  return [
    phaseRow("B-12h", "eligibilityAuditReport", input.eligibilityAuditReport, "Theoretical R reference (frozen)"),
    phaseRow(
      "B-12p",
      "rrThresholdTheoreticalR via B-12r",
      input.historicalEntryPriceMoveQualityAnalysisReport?.consumedReports.b12pSchemaVersion
        ? input.historicalEntryPriceMoveQualityAnalysisReport
        : undefined,
      "B-12p band metrics embedded in B-12r when rrThreshold report supplied"
    ),
    phaseRow("B-12r", "historicalEntryPriceMoveQualityAnalysisReport", input.historicalEntryPriceMoveQualityAnalysisReport, "Reward/risk buckets"),
    phaseRow("B-12s", "historicalTargetProvenanceStructuralDistanceAnalysisReport", input.historicalTargetProvenanceStructuralDistanceAnalysisReport, "Target provenance distance"),
    phaseRow("B-12t", "displacementEqualityTargetMechanicsReport", input.displacementEqualityTargetMechanicsReport, "Displacement equality mechanics"),
    phaseRow("B-12u", "structuralExtremeVsDisplacementTargetReport", input.structuralExtremeVsDisplacementTargetReport, "Prefix headroom / structural"),
    phaseRow("B-12v", "alternativeTargetModelAnalysisReport", input.alternativeTargetModelAnalysisReport, "Alternative target models"),
    phaseRow("B-12w", "reachabilityReplayReport", input.reachabilityReplayReport, "Reachability replay"),
    phaseRow("B-12x", "costAwareCounterfactualAnalysisReport", input.costAwareCounterfactualAnalysisReport, "Round-trip cost scenarios"),
    phaseRow("B-12y", "historicalTargetDistanceStructuralContextAnalysisReport", input.historicalTargetDistanceStructuralContextAnalysisReport, "Target distance × structure"),
    phaseRow("B-12z", "historicalTargetDistanceReachabilityCostBalanceAnalysisReport", input.historicalTargetDistanceReachabilityCostBalanceAnalysisReport, "Reach × cost balance"),
    phaseRow("B-13", "historicalEntryContextTargetResearchReport", input.historicalEntryContextTargetResearchReport, "Entry context target research"),
    phaseRow("B-14", "futureMoveAnalysisReport", input.futureMoveAnalysisReport, "Future move thresholds"),
    phaseRow("B-15", "futureMovePredictivenessAnalysisReport", input.futureMovePredictivenessAnalysisReport, "Future move predictiveness"),
    phaseRow("B-16", "entryContextCombinationFutureMoveAnalysisReport", input.entryContextCombinationFutureMoveAnalysisReport, "Combination future move"),
    phaseRow("B-17", "signalIndependenceAuditReport", input.signalIndependenceAuditReport, "Signal independence / geometry redundancy"),
    phaseRow("B-18", "delayedEntryResearchReport", input.delayedEntryResearchReport, "Delayed entry research"),
    phaseRow("B-19", "delayedEntryDecisionAuditReport", input.delayedEntryDecisionAuditReport, "Delayed entry decision audit"),
    phaseRow("B-12q", "candles", input.candles ? { schemaVersion: "fixture" } : undefined, "Frozen OHLCV fixture reference"),
  ].sort((a, b) => a.phaseId.localeCompare(b.phaseId));
}

function costCoverageForRewardBucket(
  input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput,
  bucketId: PriceMoveRewardBucketId
): number | null {
  const b12z = input.historicalTargetDistanceReachabilityCostBalanceAnalysisReport;
  if (!b12z) return null;
  const row = b12z.targetDistanceBalanceTable.find(
    (r) => targetBandToRewardBucket(r.targetDistanceBand) === bucketId
  );
  return row?.costCoverageAt0_20 ?? null;
}

function targetMagnitudeEvidence(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): TargetMagnitudeEvidenceRow[] {
  const b12r = input.historicalEntryPriceMoveQualityAnalysisReport;
  const b12w = input.reachabilityReplayReport;
  const rows: TargetMagnitudeEvidenceRow[] = [];
  for (const bucketId of PRICE_MOVE_REWARD_BUCKET_IDS) {
    if (bucketId === "REWARD_NOT_APPLICABLE") continue;
    const b12rCell = b12r?.rewardBuckets.byBucket[bucketId];
    const b12wCross = b12w?.rewardCross.find(
      (c) => c.rewardBucket === bucketId && c.modelId === "CANONICAL_DISPLACEMENT_EQUALITY"
    );
    const reach =
      b12wCross && b12wCross.trades > 0 ? b12wCross.targetReached / b12wCross.trades : null;
    rows.push({
      rewardBucketLabel: bucketId,
      population: b12rCell?.trades ?? b12wCross?.trades ?? null,
      targetReachRate: reach,
      costCoverageAt020: costCoverageForRewardBucket(input, bucketId),
      theoreticalRReferenceNote:
        "B-12h/B-12p band metrics consumed via B-12r b12pProspectiveBandReference when supplied; not recomputed in B-20.",
      tag: "HISTORICAL_EVIDENCE",
    });
  }
  return rows;
}

function futureMoveEvidence(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): FutureMoveEvidenceRow[] {
  const b14 = input.futureMoveAnalysisReport;
  const b15 = input.futureMovePredictivenessAnalysisReport;
  if (!b14) return [];
  const overallB15 =
    b15?.displacementAnalysis.buckets[0]?.thresholdSlices ??
    b15?.canonicalRewardAnalysis.buckets[0]?.thresholdSlices;
  return b14.thresholdAnalysis.map((t) => {
    const p15Slice = overallB15?.find((s) => s.thresholdPercent === t.thresholdPercent);
    return {
      thresholdPercent: t.thresholdPercent,
      futureMoveReachRate: t.futureMoveReachRate,
      medianBarsToReach: t.medianBarsToReach,
      medianMfePercent: p15Slice?.medianMfe ?? null,
      source: p15Slice ? "B-15" : "B-14",
    };
  });
}

function buildEntrySurface(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): DescriptiveDecisionSurfaceCell[] {
  const b19 = input.delayedEntryDecisionAuditReport;
  if (!b19 || b19.auditBlocked) return [];
  const cells: DescriptiveDecisionSurfaceCell[] = [];
  for (const row of b19.decisionComparisonTable) {
    const costT1 = b19.fullCostMatrix.find(
      (c) =>
        c.model === row.model &&
        c.levelLabel === row.levelLabel &&
        c.targetModel === "T1_FROZEN_TARGET" &&
        c.roundTripCostPercent === 0.2
    );
    const inv = b19.invalidationComparison.rows.find(
      (r) =>
        r.model === row.model &&
        r.levelLabel === row.levelLabel &&
        r.targetModel === "T1_FROZEN_TARGET" &&
        r.invalidationModel === "I1_FROZEN_INVALIDATION"
    );
    cells.push({
      entryModel: row.model,
      retracementLevel: row.levelLabel,
      targetModel: "T1_FROZEN_TARGET",
      fillRate: row.fillRate,
      missedRate: row.missedRate,
      medianImprovement: row.medianImprovement,
      targetReach: row.t1TargetReachRate,
      invalidationRate: inv?.invalidationRate ?? null,
      medianRR: row.medianRrI1,
      costCoverage020: costT1?.costCoverageRate ?? row.costCoverageAt020,
      tag: "DESCRIPTIVE_DECISION_SURFACE",
    });
    const t2Reach = b19.decisionComparisonTable.find(
      (r) => r.model === row.model && r.levelLabel === row.levelLabel
    )?.t2TargetReachRate;
    cells.push({
      entryModel: row.model,
      retracementLevel: row.levelLabel,
      targetModel: "T2_REPROJECTED_TARGET",
      fillRate: row.fillRate,
      missedRate: row.missedRate,
      medianImprovement: row.medianImprovement,
      targetReach: t2Reach ?? null,
      invalidationRate: null,
      medianRR: row.medianRrI1,
      costCoverage020: null,
      tag: "DESCRIPTIVE_DECISION_SURFACE",
    });
  }
  return cells.sort((a, b) =>
    `${a.entryModel}:${a.retracementLevel}:${a.targetModel}`.localeCompare(
      `${b.entryModel}:${b.retracementLevel}:${b.targetModel}`
    )
  );
}

function canonicalDeltas(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): CanonicalVsDelayedDeltaRow[] {
  const b19 = input.delayedEntryDecisionAuditReport;
  if (!b19) return [];
  const base = b19.decisionComparisonTable.find((r) => r.model === "MODEL_D_NO_DELAY_BASELINE");
  if (!base) return [];
  return b19.decisionComparisonTable
    .filter((r) => r.model !== "MODEL_D_NO_DELAY_BASELINE")
    .map((r) => ({
      entryModel: r.model,
      levelLabel: r.levelLabel,
      fillRateDelta:
        r.fillRate !== null && base.fillRate !== null ? r.fillRate - base.fillRate : null,
      improvementDelta:
        r.medianImprovement !== null && base.medianImprovement !== null
          ? r.medianImprovement - base.medianImprovement
          : null,
      t1ReachDelta:
        r.t1TargetReachRate !== null && base.t1TargetReachRate !== null
          ? r.t1TargetReachRate - base.t1TargetReachRate
          : null,
      medianRrDelta:
        r.medianRrI1 !== null && base.medianRrI1 !== null ? r.medianRrI1 - base.medianRrI1 : null,
      costCoverage020Delta:
        r.costCoverageAt020 !== null && base.costCoverageAt020 !== null
          ? r.costCoverageAt020 - base.costCoverageAt020
          : null,
    }));
}

function targetSurface(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): TargetDecisionSurfaceRow[] {
  const b12w = input.reachabilityReplayReport;
  if (!b12w) return [];
  return b12w.modelComparison.map((m) => ({
    targetModelId: m.modelId,
    rewardBucketLabel: null,
    targetReachRate: m.targetReachRate,
    targetBeforeInvalidationRate: m.targetBeforeInvalidationRate,
    costCoverageNote: "See B-12x / B-12z for cost-aware slices.",
  }));
}

function costSurface(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): CostSurfaceRow[] {
  const b19 = input.delayedEntryDecisionAuditReport;
  if (b19 && !b19.auditBlocked) {
    return b19.fullCostMatrix
      .filter((c) => c.targetModel === "T1_FROZEN_TARGET")
      .map((c) => ({
        roundTripCostPercent: c.roundTripCostPercent,
        targetModelLabel: "T1_FROZEN_TARGET",
        entryModelLabel: `${c.model}:${c.levelLabel}`,
        grossMarginMedian: c.medianGrossMarginPercent,
        netMarginMedian: c.medianNetMarginPercent,
        costCoverageRate: c.costCoverageRate,
        source: "B-19",
      }));
  }
  const b12x = input.costAwareCounterfactualAnalysisReport;
  if (!b12x) return [];
  return b12x.modelResults.map((m) => ({
    roundTripCostPercent: m.roundTripCostPercentage,
    targetModelLabel: m.modelId,
    entryModelLabel: "E_CLOSE_CANONICAL",
    grossMarginMedian: m.meanGrossRewardPercentageOnReached,
    netMarginMedian: m.meanNetMarginPercentageOnReached,
    costCoverageRate: m.costCoveredTargetRate,
    source: "B-12x",
  }));
}

function researchCandidates(input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput): ResearchCandidate[] {
  const pop = populationFromInput(input);
  const b17 = input.signalIndependenceAuditReport;
  const candidates: ResearchCandidate[] = [
    {
      label: "Delayed entry retracement trade-off (fill vs improvement)",
      evidence: "B-18/B-19 descriptive fill and missed-entry surfaces.",
      supportingReports: ["B-18", "B-19"],
      sampleSize: pop.replayClassifiable,
      directEvidence: ["fill_events", "improvement_arithmetic", "missed_entry_counts"],
      associativeEvidence: ["reward_bucket_slices"],
      counterfactualEvidence: ["MODEL_A/B/C delayed entry", "T1/T2", "I1/I2"],
      limitations: ["single symbol", "counterfactual touch fill", "no execution"],
      nextExperiment: ["multi-symbol", "walk-forward", "execution simulation"],
      evidenceCoverage: input.delayedEntryDecisionAuditReport ? "HIGH" : "LOW",
      status: "RESEARCH_CANDIDATE",
    },
    {
      label: "Target magnitude × reach × cost coverage",
      evidence: "B-12r/B-12w/B-12x integrated targetMagnitudeEvidence rows.",
      supportingReports: ["B-12r", "B-12w", "B-12x"],
      sampleSize: pop.independentTrades,
      directEvidence: ["reach_replay", "cost_arithmetic"],
      associativeEvidence: ["reward_buckets"],
      counterfactualEvidence: ["B-12v alternative targets"],
      limitations: ["high reach on small targets ≠ economic edge"],
      nextExperiment: ["fee model", "net expectancy study"],
      evidenceCoverage: input.historicalEntryPriceMoveQualityAnalysisReport ? "HIGH" : "MEDIUM",
      status: "RESEARCH_CANDIDATE",
    },
    {
      label: "Future move thresholds vs canonical target distance",
      evidence: "B-14 threshold reach distinct from canonical target %.",
      supportingReports: ["B-14", "B-15"],
      sampleSize:
        input.futureMovePredictivenessAnalysisReport?.population.classifiableForFutureMove ??
        input.futureMoveAnalysisReport?.population.canonicalReplayClassifiable ??
        null,
      directEvidence: ["MFE", "bars_to_threshold"],
      associativeEvidence: ["B-16 combinations"],
      counterfactualEvidence: [],
      limitations: ["geometry-linked reward/displacement redundancy per B-17"],
      nextExperiment: ["regime segmentation", "larger window"],
      evidenceCoverage: input.futureMoveAnalysisReport ? "HIGH" : "LOW",
      status: "RESEARCH_CANDIDATE",
    },
    {
      label: "Prefix headroom cohort (descriptive)",
      evidence: "B-12u/B-13 headroom slices; not established as predictive signal.",
      supportingReports: ["B-12u", "B-13", "B-17"],
      sampleSize: input.structuralExtremeVsDisplacementTargetReport?.population.independentTrades ?? null,
      directEvidence: ["prefix_extreme_at_E"],
      associativeEvidence: ["headroom × reach"],
      counterfactualEvidence: [],
      limitations: ["B-17: headroom NOT_ESTABLISHED independence"],
      nextExperiment: ["multi-symbol headroom replication"],
      evidenceCoverage: input.signalIndependenceAuditReport ? "MEDIUM" : "LOW",
      status: "RESEARCH_CANDIDATE",
    },
    {
      label: "T1 frozen vs T2 reprojected target geometry",
      evidence: "B-19 target model separation on delayed fills.",
      supportingReports: ["B-19", "B-12w"],
      sampleSize: pop.replayClassifiable,
      directEvidence: ["replay_touch"],
      associativeEvidence: [],
      counterfactualEvidence: ["T2 displacement reprojection"],
      limitations: ["T2 not production target"],
      nextExperiment: ["isolated T2 sensitivity on other symbols"],
      evidenceCoverage: input.delayedEntryDecisionAuditReport ? "MEDIUM" : "LOW",
      status: "RESEARCH_CANDIDATE",
    },
  ];
  if (b17) {
    candidates.push({
      label: "Context dimensions under geometry redundancy (B-17)",
      evidence: `Displacement/reward redundancy: ${b17.geometricRedundancyAnalysis.validityClass}.`,
      supportingReports: ["B-17", "B-16", "B-14"],
      sampleSize: b17.population.classifiableForFutureMove,
      directEvidence: [],
      associativeEvidence: ["context_slices", "combination_tables"],
      counterfactualEvidence: [],
      limitations: ["do not double-count displacement and reward"],
      nextExperiment: ["orthogonal feature design", "independent validation set"],
      evidenceCoverage: "MEDIUM",
      status: "RESEARCH_CANDIDATE",
    });
  }
  return candidates;
}

export function buildHistoricalPhaseBIntegratedEvidenceAudit(
  input: BuildHistoricalPhaseBIntegratedEvidenceAuditInput
): HistoricalPhaseBIntegratedEvidenceAuditReport {
  const population = populationFromInput(input);
  const matrix = buildSourceMatrix(input);
  const missingSections = matrix.filter((m) => !m.consumed).map((m) => m.phaseId);

  const b12u = input.structuralExtremeVsDisplacementTargetReport;
  const headroomDist = b12u?.headroomDistribution;
  const noHeadroom = headroomDist?.NO_HEADROOM ?? null;
  const headroomPresent =
    headroomDist
      ? Object.entries(headroomDist).reduce(
          (s, [k, v]) => (k === "NO_HEADROOM" ? s : s + v),
          0
        )
      : null;
  const headroomRows = [
    {
      headroomBucket: "HEADROOM_PRESENT",
      trades: headroomPresent,
      note:
        "B-12u/B-12s parity: structural move beyond canonical reward (e.g. 121 trades) is descriptive; headroom ≠ future predictive signal.",
      tag: "HISTORICAL_ASSOCIATION" as const,
    },
    {
      headroomBucket: "HEADROOM_ABSENT",
      trades: noHeadroom,
      note: "B-12u headroomDistribution.NO_HEADROOM.",
      tag: "HISTORICAL_ASSOCIATION" as const,
    },
  ];

  const delayedSummary: HistoricalPhaseBIntegratedEvidenceAuditReport["delayedEntryEvidenceSummary"][number][] =
    [];
  const b18 = input.delayedEntryResearchReport;
  const b19 = input.delayedEntryDecisionAuditReport;
  if (b19 && !b19.auditBlocked) {
    for (const row of b19.decisionComparisonTable) {
      delayedSummary.push({
        model: row.model,
        levelLabel: row.levelLabel,
        fillRate: row.fillRate,
        missedRate: row.missedRate,
        medianImprovement: row.medianImprovement,
        t1Reach: row.t1TargetReachRate,
        t2Reach: row.t2TargetReachRate,
        source: "B-19",
      });
    }
  } else if (b18) {
    for (const row of b18.comparisonTableT1) {
      delayedSummary.push({
        model: row.model,
        levelLabel: row.levelLabel,
        fillRate: row.fillRate,
        missedRate:
          b18.tradeOffSummary.find(
            (t) => t.model === row.model && t.levelLabel === row.levelLabel
          )?.missedEntry != null && row.trades > 0
            ? b18.tradeOffSummary.find(
                (t) => t.model === row.model && t.levelLabel === row.levelLabel
              )!.missedEntry / row.trades
            : null,
        medianImprovement: row.medianImprovement,
        t1Reach: row.targetReachRate,
        t2Reach: b18.comparisonTableT2.find(
          (t) => t.model === row.model && t.levelLabel === row.levelLabel
        )?.targetReachRate ?? null,
        source: "B-18",
      });
    }
  }

  const b17 = input.signalIndependenceAuditReport;
  const signalSummary =
    b17?.featureIndependenceSummary.map((f) => ({
      signal: f.context,
      validityClass: f.independentInformationStatus,
      note: `geometryDependency=${f.geometryDependency}; futureAssociation=${f.futureAssociationObserved}`,
    })) ?? [];

  const parityNotes: {
    phaseId: string;
    note: string;
    populationMatch: boolean;
  }[] = [];
  if (b18) {
    parityNotes.push({
      phaseId: "B-18",
      note: "Population aligned with integrated audit population.",
      populationMatch: b18.population.independentTrades === population.independentTrades,
    });
  }
  if (b19) {
    parityNotes.push({
      phaseId: "B-19",
      note: `b18Parity.allMatch=${b19.b18Parity.allMatch}`,
      populationMatch: b19.population.independentTrades === population.independentTrades,
    });
  }
  if (input.futureMoveAnalysisReport) {
    parityNotes.push({
      phaseId: "B-14",
      note: "Future move classifiable population cross-check.",
      populationMatch:
        input.futureMoveAnalysisReport.population.independentTrades === population.independentTrades,
    });
  }

  const riskRrSurface: HistoricalPhaseBIntegratedEvidenceAuditReport["riskRrSurface"][number][] = [];
  if (b19 && !b19.auditBlocked) {
    for (const row of b19.invalidationComparison.rows.filter((r) => r.targetModel === "T1_FROZEN_TARGET")) {
      riskRrSurface.push({
        label: `${row.model}:${row.levelLabel}`,
        invalidationModel: row.invalidationModel === "I1_FROZEN_INVALIDATION" ? "I1" : "I2",
        medianRiskPct: row.medianRiskPct,
        medianRewardPct: null,
        medianCounterfactualRr: row.medianCounterfactualRr,
        theoreticalRNote: "B-12h decisive theoreticalR not recomputed in B-20.",
      });
    }
  }

  const failedN =
    input.futureMoveAnalysisReport?.failedFavorableAnalysis.trades ??
    input.lifecycleReport.trades.filter(
      (t) => t.tradeEvaluationStatus === "FAILED" && t.policyClassification === "FAVORABLE_RESOLUTION"
    ).length;
  const passedAdvN =
    input.futureMoveAnalysisReport?.passedAdverseAnalysis.trades ??
    input.lifecycleReport.trades.filter(
      (t) => t.tradeEvaluationStatus === "PASSED" && t.policyClassification === "ADVERSE_RESOLUTION"
    ).length;

  return {
    schemaVersion: HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION,
    datasetReference: {
      fixturePath: b18?.datasetReference.fixturePath ?? FIXTURE_PATH,
      expectedDatasetChecksum: b18?.datasetReference.expectedDatasetChecksum ?? FIXTURE_CHECKSUM,
    },
    population,
    phaseSourceMatrix: matrix,
    missingSections,
    targetMagnitudeEvidence: targetMagnitudeEvidence(input),
    futureMoveEvidence: futureMoveEvidence(input),
    structuralHeadroomEvidence: headroomRows,
    delayedEntryEvidenceSummary: delayedSummary,
    entryDecisionSurface: buildEntrySurface(input),
    canonicalVsDelayedDeltas: canonicalDeltas(input),
    targetDecisionSurface: targetSurface(input),
    costSurface: costSurface(input),
    riskRrSurface,
    contextConditionalEvidence: [
      ...(input.historicalEntryContextTargetResearchReport?.headroomAnalysis.map((s) => ({
        dimension: "headroom",
        bucket: String(s.headroomBucket),
        note: `B-13 targetReachRate=${s.targetReachRate ?? "n/a"}; geometry-redundant with reward per B-17.`,
        tag: "HISTORICAL_ASSOCIATION" as const,
      })) ?? []),
      ...(input.historicalEntryContextTargetResearchReport?.displacementAnalysis.map((s) => ({
        dimension: "displacement",
        bucket: String(s.displacementBucket),
        note: `B-13 targetReachRate=${s.targetReachRate ?? "n/a"}.`,
        tag: "HISTORICAL_ASSOCIATION" as const,
      })) ?? []),
      ...(b18?.contextSlices.map((s) => ({
        dimension: s.dimension,
        bucket: s.bucket,
        note: "B-18 delayed-entry context slice (associational).",
        tag: "HISTORICAL_ASSOCIATION" as const,
      })) ?? []),
    ],
    signalIndependenceSummary: signalSummary,
    failedFavorableEvidence: {
      cohortSize: failedN,
      note: "FAILED + FAVORABLE — descriptive only; not evaluator verdict.",
      source: b19 ? "B-19.failedFavorableAudit" : b18 ? "B-18.failedFavorableDelayedEntry" : "lifecycle",
    },
    passedAdverseEvidence: {
      cohortSize: passedAdvN,
      note: "PASSED + ADVERSE — descriptive only.",
      source: b19 ? "B-19.passedAdverseAudit" : b18 ? "B-18.passedAdverseDelayedEntry" : "lifecycle",
    },
    temporalStabilitySummary: [
      {
        source: "B-15",
        label: "TEMPORAL_DESCRIPTIVE_SPLIT",
        note:
          input.entryContextCombinationFutureMoveAnalysisReport?.diagnosticSummary?.find((d) =>
            d.question.includes("temporal")
          )?.answer ??
          input.signalIndependenceAuditReport?.temporalDescriptiveSplit.note ??
          "B-15 consumed for threshold/MFE slices; temporal split see B-17/B-18/B-19.",
      },
      {
        source: "B-18",
        label: "TEMPORAL_DESCRIPTIVE_SPLIT",
        note: b18?.temporalDescriptiveSplit.note ?? "Not consumed",
      },
      {
        source: "B-19",
        label: "TEMPORAL_DESCRIPTIVE_SPLIT",
        note: b19?.temporalDescriptiveSplit.note ?? "Not consumed",
      },
    ],
    multipleComparisonWarning: {
      statement:
        "Many buckets, models, thresholds, and contexts compared without multiple-testing adjustment; correlations descriptive only.",
    },
    directObservations: [
      "replay_reach",
      "fill_events",
      "improvement_arithmetic",
      "MFE_MAE",
      "timing_bars",
      "cost_arithmetic",
    ],
    associationalFindings: [
      "context_slices",
      "wave_family_cohorts",
      "evaluator_cohort_slices",
      "temporal_descriptive_split",
    ],
    counterfactualEvidence: [
      "delayed_entry_models",
      "alternative_target_models",
      "T1_T2_target_geometry",
      "I1_I2_invalidation_views",
    ],
    notEstablished: [
      "production_strategy",
      "optimal_entry",
      "optimal_target",
      "profitable_strategy",
      "universal_market_rule",
    ],
    lookaheadAttestation: {
      entryContextEnd: "E",
      outcomeFrom: "E+1",
      statement:
        "B-20 consumes pre-built phase reports; no future-derived entry/target/invalidation selection.",
    },
    researchCandidates: researchCandidates(input),
    limitations: [
      "BTCUSDT_1H_only",
      "frozen_historical_sample",
      "no_slippage_funding_execution",
      "counterfactual_touch_semantics",
      "geometry_redundancy_per_B-17",
    ],
    productionDecision: {
      productionRuleStatus: "NOT_ESTABLISHED",
      entryRuleStatus: "NOT_ESTABLISHED",
      targetRuleStatus: "NOT_ESTABLISHED",
      delayedEntryRuleStatus: "NOT_ESTABLISHED",
      generalMarketRule: "NOT_ESTABLISHED",
    },
    parityNotes,
    statisticalQualityAttestation: {
      reachRateConfidence: "Wilson_95_when_present_in_source_reports",
      sampleSizeLabels: ["LARGE_SAMPLE", "MODERATE_SAMPLE", "SMALL_SAMPLE", "INSUFFICIENT_SAMPLE"],
      interpretWithCautionWhenNBelow10: true,
    },
    warnings: [...WARNINGS],
    consumedReports: Object.fromEntries(matrix.map((m) => [m.reportKey, m.consumed])),
  };
}
