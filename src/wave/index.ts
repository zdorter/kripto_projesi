export {
  analyzeWave,
  analyzeWaveWithDiagnostics,
  analyzeWaveWithPresentation,
  buildWaveAnalysis,
} from "./analysis-pipeline";
export type { WaveAnalysisResult } from "./analysis-pipeline";
export {
  analyzeWaveAtEvaluationBar,
  analyzeWaveAtEvaluationBarFromSeries,
  buildWaveScenariosAtEvaluationBar,
  compareFullVsScopedWaveAnalysis,
  evaluationScopedOpenLegVerdict,
  scanSymbolWaveScenariosAtEvaluationBar,
} from "./evaluation-scoped-analysis";
export type {
  EvaluationScopedAnalysisEvidence,
  EvaluationScopedAnalysisStatus,
  EvaluationScopedOpenLegVerdict,
  EvaluationScopedSupportVerdict,
  EvaluationScopedWaveAnalysis,
  EvaluationScopedWaveAnalysisInput,
  FullVsScopedAnalysisComparison,
} from "./evaluation-scoped-analysis-types";
export {
  assertScenarioIndicesWithinBar,
  collectEvaluationScopedInvariantViolations,
} from "./evaluation-scoped-invariants";

export { computeAtrSeries, computeSwingStrength, detectSwings } from "./swing-detector";
export {
  classifyHighStructure,
  classifyLowStructure,
  detectMarketStructures,
  detectTrend,
} from "./trend-detector";
export {
  buildMarketStructureBreakContext,
  buildMarketStructureLiquidityContext,
  buildMarketStructureLiquidityInteractionContext,
  buildMarketStructureProtectedContext,
  buildMarketStructureSnapshotAtBar,
  buildMarketStructureZigzagContext,
  MARKET_STRUCTURE_BOS_CONTINUATION_RULE_ID,
  MARKET_STRUCTURE_BREAK_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_BREAK_TRIGGER_WICK_INCLUSIVE_RULE_ID,
  MARKET_STRUCTURE_BSL_CANDIDATE_RULE_ID,
  MARKET_STRUCTURE_CHOCH_COUNTER_BREAK_RULE_ID,
  MARKET_STRUCTURE_EQUALITY_HYBRID_TOLERANCE_RULE_ID,
  MARKET_STRUCTURE_INTERNAL_EXTERNAL_RULE_ID,
  DEFAULT_LIQUIDITY_INTERACTION_HORIZON_BARS,
  FROZEN_LIQUIDITY_FOUNDATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_WICK_TOUCH_RULE_ID,
  MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  MARKET_STRUCTURE_SSL_CANDIDATE_RULE_ID,
  MarketStructureInvalidEvaluationBarIndexError,
  mergeSameTypeSwingsForZigzag,
  pricesEqualHybridTolerance,
  zigzagSpineAlternatesTypes,
} from "./market-structure/market-structure-snapshot";
export {
  barCloseTimestamp,
  barOpenTimestamp,
  buildHtfVisibilityView,
  buildMarketStructureMtfAlignmentContext,
  getTimeframeDurationMs,
  isKnownAtOrBefore,
  knownAtTimestampFromBarIndex,
  resolveHtfEvaluationBarIndex,
  MARKET_STRUCTURE_CROSS_TF_KNOWN_AT_VISIBILITY_RULE_ID,
  MARKET_STRUCTURE_HTF_CLOSED_BAR_SELECTION_RULE_ID,
  MARKET_STRUCTURE_MTF_ALIGNMENT_RESEARCH_RULE_ID,
} from "./market-structure/market-structure-mtf-alignment";
export {
  buildMarketStructureMtfStructureAlignmentContext,
  MARKET_STRUCTURE_MTF_STRUCTURE_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_STRUCTURE_STATE_COMPARISON_RULE_ID,
  resolveMtfStructureStateAlignment,
} from "./market-structure/market-structure-mtf-structure-alignment";
export type {
  BuildMarketStructureMtfStructureAlignmentContextInput,
  MarketStructureMtfStructureAlignmentContext,
  MtfStructureAlignmentHtfSourceTrack,
  MtfStructureStateAlignment,
} from "./market-structure/market-structure-mtf-structure-alignment";
export {
  buildMarketStructureMtfLiquidityAlignmentContext,
  MARKET_STRUCTURE_MTF_LIQUIDITY_ALIGNMENT_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_LIQUIDITY_STATE_COMPARISON_RULE_ID,
  buildLiquidityLegFoundation,
  resolveLiquiditySideProfile,
  resolveMtfLiquidityLifecycleAlignment,
  resolveMtfLiquiditySideAlignment,
} from "./market-structure/market-structure-mtf-liquidity-alignment";
export type {
  BuildMarketStructureMtfLiquidityAlignmentContextInput,
  LiquidityFoundationState,
  LiquiditySideProfile,
  MarketStructureMtfLiquidityAlignmentContext,
  MtfLiquidityAlignmentHtfSourceTrack,
  MtfLiquidityLegFoundation,
  MtfLiquidityLifecycleAlignment,
  MtfLiquiditySideAlignment,
} from "./market-structure/market-structure-mtf-liquidity-alignment";
export {
  buildMarketStructureMtfEventOrderingContext,
  buildCrossTfRelationId,
  resolveHtfToLtfOrderingRelation,
  compareNormalizedEvents,
  MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_RULE_ID,
} from "./market-structure/market-structure-mtf-event-ordering";
export type {
  BuildMarketStructureMtfEventOrderingContextInput,
  CrossTfEventOrderingRelation,
  CrossTfOrderingRelationKind,
  MarketStructureMtfEventOrderingContext,
  MtfEventOrderingHtfSourceTrack,
  MtfOrderingEventFamily,
  NormalizedMtfOrderingEvent,
} from "./market-structure/market-structure-mtf-event-ordering";
export {
  buildMarketStructureHtfLiquidityLtfStructureAssociationContext,
  buildHtfLiquidityLtfStructureAssociationId,
  parsePoolIdFromLiquidityEventId,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_HTF_LIQUIDITY_LTF_STRUCTURE_ORDERING_RULE_ID,
} from "./market-structure/market-structure-htf-liquidity-ltf-structure-association";
export type {
  BuildMarketStructureHtfLiquidityLtfStructureAssociationContextInput,
  HtfLiquidityLtfStructureAssociation,
  HtfLiquidityLtfStructureAssociationType,
  MarketStructureHtfLiquidityLtfStructureAssociationContext,
} from "./market-structure/market-structure-htf-liquidity-ltf-structure-association";
export {
  buildMarketStructureMtfMssAssociationContext,
  buildMtfMssAssociationId,
  isEligibleMssAssociationMatrixCell,
  associationTypeForMatrixCell,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_ORDERING_RULE_ID,
} from "./market-structure/market-structure-mtf-mss-association";
export type {
  BuildMarketStructureMtfMssAssociationContextInput,
  MarketStructureMtfMssAssociation,
  MarketStructureMtfMssAssociationContext,
  MtfMssAssociationType,
} from "./market-structure/market-structure-mtf-mss-association";
export {
  buildMarketStructureDescriptiveConfluenceSurfaceContext,
  buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
} from "./market-structure/market-structure-descriptive-confluence-surface";
export type {
  BuildMarketStructureDescriptiveConfluenceSurfaceContextInput,
  ConfluenceSurfaceMtfPanel,
  ConfluenceSurfaceTimeframeSurface,
  MarketStructureDescriptiveConfluenceSurfaceContext,
  MarketStructureDescriptiveConfluenceSurfaceBundle,
} from "./market-structure/market-structure-descriptive-confluence-surface";
export {
  buildMarketStructureScenarioInterpretationContext,
  assertNoForbiddenScenarioInterpretationTokens,
  MARKET_STRUCTURE_SCENARIO_INTERPRETATION_RULE_ID,
} from "./market-structure/market-structure-scenario-interpretation";
export type {
  BuildMarketStructureScenarioInterpretationContextInput,
  MarketStructureScenarioInterpretationContext,
  MarketStructureScenarioInterpretation,
  ScenarioInterpretationFamily,
  ScenarioInterpretationStatus,
} from "./market-structure/market-structure-scenario-interpretation-types";
export {
  buildMarketStructureChartOverlayProjection,
  CHART_OVERLAY_PROJECTION_RULE_ID,
  cullStructureLabelMarkersForViewport,
  formatChartEvalUtcLabel,
  passesClosedContextClip,
  prioritizePriceLinesNearPrice,
} from "./market-structure/market-structure-chart-overlay";
export type {
  BuildMarketStructureChartOverlayProjectionInput,
  ChartOverlayVisibilityV1,
  MarketStructureChartOverlayProjectionV1,
  MarketStructureChartOverlaySourceV1,
} from "./market-structure/market-structure-chart-overlay";
export {
  deriveHtfCandlesFromLtf,
  MARKET_STRUCTURE_HTF_BUCKET_BINANCE_UTC_RULE_ID,
  MARKET_STRUCTURE_HTF_DERIVATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_OHLC_BUCKET_AGGREGATION_RULE_ID,
  NATIVE_HTF_RESEARCH_TRACK_LIMITATION,
} from "./market-structure/market-structure-htf-derivation";
export type {
  DeriveHtfCandlesFromLtfResult,
  HtfDerivationUnresolvedReason,
} from "./market-structure/market-structure-htf-derivation";
export {
  alignNativeHtfCandlesToDerivedCompleteBuckets,
  buildNativeHtfParityReport,
  buildNativeHtfSemanticParityReport,
  BTCUSDT_DECIMAL_NORMALIZED_VOLUME_PARITY_OBSERVED_DECIMAL_PLACES,
  BTCUSDT_VOLUME_PARITY_REPRESENTATIVE_BUCKET_OPENS,
  filterNative4hClosedForParity,
  maxVolumeDecimalPlacesObserved,
  sumVolumesAtDecimalPrecision,
  utc4hBucketOpen,
  validateNative4hForParity,
  volumeDecimalLiteralAtFixedPrecision,
  NATIVE_HTF_PARITY_REPORT_SCHEMA_VERSION,
  NATIVE_HTF_PARITY_RESEARCH_RULE_ID,
} from "./market-structure/native-htf-parity";
export type {
  BuildNativeHtfParityReportInput,
  DecimalNormalizedVolumeParityResult,
  DecimalNormalizedVolumeParityStatus,
  NativeHtfFieldParityStatus,
  NativeHtfParityReport,
  NativeHtfSemanticParityReport,
  NativeHtfSemanticParityStatus,
} from "./market-structure/native-htf-parity";
export {
  buildMarketStructureCrossTfLiquidityInteractionContext,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_CROSS_TF_LIQUIDITY_WICK_TOUCH_RULE_ID,
} from "./market-structure/market-structure-cross-tf-liquidity-interaction";
export type {
  BuildMarketStructureCrossTfLiquidityInteractionContextInput,
  CrossTfLiquidityInteractionEvent,
  MarketStructureCrossTfLiquidityInteractionContext,
} from "./market-structure/market-structure-cross-tf-liquidity-interaction";
export {
  buildMarketStructureLiquidityAdvancedInteractionContext,
  deriveMarketStructureLiquidityLifecycle,
  MARKET_STRUCTURE_LIQUIDITY_ADVANCED_INTERACTION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_LIFECYCLE_DERIVATION_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_RECLAIM_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_SWEEP_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TAKEN_RULE_ID,
} from "./market-structure/market-structure-liquidity-advanced-interaction";
export type {
  AdvancedLiquidityInteractionEvent,
  BuildMarketStructureLiquidityAdvancedInteractionContextInput,
  LiquidityPoolLifecycleProjection,
  LiquidityReclaimEvent,
  LiquiditySweepEvent,
  LiquidityTakenEvent,
  MarketStructureLiquidityAdvancedInteractionContext,
} from "./market-structure/market-structure-liquidity-advanced-interaction";
export {
  buildMarketStructureLiquidityStructureAssociationContext,
  MARKET_STRUCTURE_LIQUIDITY_STRUCTURE_ASSOCIATION_RESEARCH_RULE_ID,
  MARKET_STRUCTURE_LIQUIDITY_TO_STRUCTURE_ORDERING_RULE_ID,
} from "./market-structure/market-structure-liquidity-structure-association";
export {
  buildMarketStructureMssContext,
  MARKET_STRUCTURE_MSS_CLASSIFICATION_RULE_ID,
  MARKET_STRUCTURE_MSS_REFERENCE_PROTECTED_RULE_ID,
  MARKET_STRUCTURE_MSS_RESEARCH_RULE_ID,
} from "./market-structure/market-structure-mss";
export type {
  BuildMarketStructureMssContextInput,
  MarketStructureMssContext,
  MarketStructureMssEvent,
  MarketStructureSnapshotForMss,
  MssDirection,
  MssUnresolvedReason,
} from "./market-structure/market-structure-mss";
export type {
  BuildMarketStructureLiquidityStructureAssociationContextInput,
  LiquidityStructureAssociation,
  MarketStructureLiquidityStructureAssociationContext,
} from "./market-structure/market-structure-liquidity-structure-association";
export type {
  BuildMarketStructureMtfAlignmentContextInput,
  HtfEvaluationBarResolution,
  MarketStructureMtfAlignmentContext,
  MarketStructureMtfHtfVisibilityView,
} from "./market-structure/market-structure-mtf-alignment";
export type {
  BuildMarketStructureBreakContextInput,
  BuildMarketStructureLiquidityContextInput,
  BuildMarketStructureLiquidityInteractionContextInput,
  BuildMarketStructureProtectedContextInput,
  BuildMarketStructureSnapshotAtBarInput,
  BslCandidate,
  EqualStructureDiagnostic,
  EqualHighObservation,
  EqualLowObservation,
  LiquidityPoolCandidate,
  MarketStructureBreakContext,
  LiquidityInteractionEvent,
  MarketStructureLiquidityContext,
  MarketStructureLiquidityInteractionContext,
  MarketStructurePairSnapshot,
  MarketStructureProtectedContext,
  MarketStructureScope,
  MarketStructureSnapshot,
  MarketStructureSnapshotForBreak,
  MarketStructureSnapshotForLiquidity,
  MarketStructureSnapshotForProtected,
  MarketStructureSwingAnnotation,
  MarketStructureSwingLabel,
  MarketStructureZigzagContext,
  ProtectedLevelCandidate,
  ProtectedLevelCandidateStatusAtE,
  ProtectedLevelSelectionReasonCode,
  SslCandidate,
  UnresolvedProtectedReason,
} from "./market-structure/market-structure-snapshot";
export {
  FIB_EXTENSION_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  fibExtensionPrice,
  fibRetracementPrice,
  fibConformanceScore,
  nearestFibMatch,
} from "./fibonacci";
export {
  CONFIDENCE_WEIGHTS,
  applyPerWaveConfidence,
  computeConfidence,
  structureQualityFromSwings,
} from "./confidence";
export {
  currentWaveLabel,
  detectWaves,
  primaryInvalidationPrice,
} from "./wave-detector";
export type {
  Candle,
  MarketStructure,
  SwingConfig,
  SwingPoint,
  SwingType,
  TrendDirection,
  WaveAnalysis,
  WaveCandidate,
  WaveEngineOptions,
  WaveLabel,
  WaveStatus,
} from "./types";
export { DEFAULT_SWING_CONFIG } from "./types";
export {
  mapToPresentationState,
} from "./presentation-state";
export { buildWaveDiagnostics } from "./wave-diagnostics";
export type { WaveDiagnostics } from "./wave-diagnostics";
export type {
  FocusView,
  PresentationMappingContext,
  ScenarioKind,
  ScoreDisclaimer,
  SegmentOverlapView,
  StructureKind,
  StructureTrackView,
  TrendAlignment,
  WaveLegView,
  WavePresentationState,
} from "./presentation-state";
export {
  CALIBRATION_SWING_WINDOW_PRESETS,
  runSwingCalibration,
} from "./swing-calibration";
export type {
  CalibrationLeadingWave,
  CalibrationWaveRow,
  SwingCalibrationDetail,
  SwingCalibrationReport,
  SwingCalibrationSummary,
  SwingWindowPreset,
} from "./swing-calibration";
export {
  buildWaveStabilityFromCalibration,
  indexOverlapRatio,
  priceRangeOverlapRatio,
  runWaveStability,
  WAVE_STABILITY_LABELS,
} from "./wave-stability";
export type {
  StabilityConfigRef,
  WaveConfigSnapshot,
  WavePairwiseOverlap,
  WavePersistenceRow,
  WavePersistenceSummary,
  WaveStabilityReport,
} from "./wave-stability";
export {
  analyzeMultiTimeframe,
  buildTimeframeBundle,
  classifyMultiTimeframeRelationship,
  compareTrends,
  DEFAULT_MULTI_TIMEFRAME_CONFIG,
  focusContextFromDiagnostics,
} from "./multi-timeframe";
export type {
  FocusContextView,
  MultiTimeframeConfig,
  MultiTimeframeRelationshipKind,
  MultiTimeframeRelationshipView,
  MultiTimeframeWaveState,
  TimeAlignmentView,
  TimeframeWaveBundle,
  TimeWindow,
  TrendAlignmentView,
  TrendComparisonKind,
} from "./multi-timeframe";
export {
  buildCandidatePair,
  buildCandidateWaveHierarchy,
  buildHierarchySegment,
  classifyCandidateNesting,
  classifyPriceRelation,
  classifyTimeRelation,
  HIERARCHY_WAVE_LABELS,
} from "./wave-hierarchy";
export type {
  CandidateNestingKind,
  HierarchyWaveSegment,
  PriceRelationKind,
  TimeRelationKind,
  WaveHierarchyCandidate,
  WaveHierarchyReport,
} from "./wave-hierarchy";
export {
  buildWaveScenarioSet,
  buildWaveScenarios,
  mapEngineStatusToScenarioStatus,
  resolveScenarioInvalidation,
  enumerateScenarioInvalidationCandidates,
} from "./wave-scenarios";
export type {
  InvalidationSource,
  ScenarioInvalidationCandidate,
  ScenarioInvalidationView,
  ScenarioLifecycleStatus,
  ScenarioRole,
  WaveScenario,
  WaveScenarioBuildOptions,
  WaveScenarioReport,
  WaveScenarioSet,
} from "./wave-scenarios";
export {
  compareWaveScanResults,
  runWaveScan,
  runWaveScanWithProvider,
  scanSymbolWaveScenarios,
} from "./wave-scanner";
export type {
  OhlcvProviderLike,
  WaveScanReport,
  WaveScanResult,
  WaveScanSymbolContext,
  WaveScanSymbolError,
  WaveScannerRunOptions,
} from "./wave-scanner";
export {
  runProductionWaveScanner,
  composeProductionWaveScannerForSymbol,
  composeProductionCandidateRowsForSymbol,
  resolveProductionCompositionAtEvaluationBar,
  selectDisplayProspectiveCandidate,
  PRODUCTION_WAVE_SCANNER_SCHEMA_VERSION,
  PRODUCTION_COMPOSE_LOAD_ERROR_EVALUATION_BAR_OUT_OF_RANGE,
} from "./production-wave-scanner";
export type {
  ProductionWaveScannerRunInput,
  ProductionWaveScannerSymbolInput,
  ProductionWaveScannerSymbolComposeOptions,
  ProductionComposedCandidate,
  ProductionCompositionAtEvaluationBar,
} from "./production-wave-scanner";
export {
  buildDisplayPickHistoricalCandidateMeasurement,
  buildHistoricalCandidateMeasurementsAtEvaluationBar,
  cohortsMatchingFilter,
  countProductionCandidatesAtEvaluationBar,
  resolveHistoricalMeasurementCohorts,
} from "./historical-candidate-cohort";
export type { BuildHistoricalCandidateMeasurementsInput } from "./historical-candidate-cohort";
export {
  HISTORICAL_AS_OF_EVAL_LIVE_MARKET_PRICE_POLICY,
  resolveHistoricalAsOfEvalLiveMarketPrice,
} from "./historical-production-compose-policy";
export type { HistoricalAsOfEvalLiveMarketPricePolicy } from "./historical-production-compose-policy";
export {
  HISTORICAL_PRODUCTION_WALK_FORWARD_SCHEMA_VERSION,
  runHistoricalProductionWalkForward,
  validateHistoricalProductionWalkForwardRange,
} from "./historical-production-walk-forward";
export type {
  HistoricalProductionWalkForwardInput,
  HistoricalProductionWalkForwardResult,
  HistoricalProductionWalkForwardRow,
  HistoricalWalkForwardRangeError,
} from "./historical-production-walk-forward";
export {
  buildHistoricalMeasurementRecord,
  futureBarsAvailableAfterEvaluationBar,
  runHistoricalMeasurementWalkForward,
} from "./historical-measurement-assembly";
export type {
  BuildHistoricalMeasurementRecordInput,
  HistoricalMeasurementWalkForwardInput,
  HistoricalMeasurementWalkForwardResult,
} from "./historical-measurement-assembly";
export {
  HISTORICAL_MEASUREMENT_ARTIFACT_DEFAULT_OUTPUT_DIR,
  HistoricalMeasurementArtifactValidationError,
  buildHistoricalMeasurementArtifact,
  compareHistoricalMeasurementArtifactEntryOrder,
  historicalMeasurementArtifactEntryFromBundle,
  historicalMeasurementArtifactsEquivalent,
  parseHistoricalMeasurementArtifact,
  serializeHistoricalMeasurementArtifact,
  sortHistoricalMeasurementArtifactEntries,
  validateHistoricalMeasurementArtifact,
} from "./historical-measurement-artifact";
export type { BuildHistoricalMeasurementArtifactInput } from "./historical-measurement-artifact";
export type {
  HistoricalMeasurementArtifact,
  HistoricalMeasurementArtifactDataset,
  HistoricalMeasurementArtifactEntry,
} from "./setup/historical-measurement-artifact-types";
export {
  aggregateHistoricalMeasurementStatistics,
  emptyHistoricalMeasurementStatisticsReport,
  isPathMeasuredOutcome,
} from "./historical-measurement-statistics";
export {
  HISTORICAL_MEASUREMENT_STATISTICS_SCHEMA_VERSION,
} from "./historical-measurement-statistics-types";
export {
  aggregateHistoricalMeasurementStatisticsFiltered,
  buildDenominatorsFromCore,
  buildRatesFromDenominatorsAndCore,
  computeHistoricalMeasurementStatisticRate,
  measurementMatchesCohortFilter,
  selectHistoricalMeasurementEntries,
} from "./historical-measurement-statistics-filter";
export {
  HISTORICAL_MEASUREMENT_FILTERED_STATISTICS_SCHEMA_VERSION,
} from "./historical-measurement-statistics-filter-types";
export type {
  HistoricalMeasurementCohortStatisticsMap,
  HistoricalMeasurementCohortStatisticsSlice,
  HistoricalMeasurementDenominatorId,
  HistoricalMeasurementDenominators,
  HistoricalMeasurementFilteredStatisticsReport,
  HistoricalMeasurementStatisticRate,
  HistoricalMeasurementStatisticsFilter,
  HistoricalMeasurementStatisticsRates,
} from "./historical-measurement-statistics-filter-types";
export {
  aggregateHistoricalMeasurementCrossStatistics,
  buildCrossStatisticsSliceFromEntries,
  emptyHistoricalMeasurementEvalOutcomeMatrix,
  resolveCrossOutcomeColumn,
} from "./historical-measurement-cross-statistics";
export {
  HISTORICAL_MEASUREMENT_CROSS_EVALUATION_ROWS,
  HISTORICAL_MEASUREMENT_CROSS_NULL_OUTCOME,
  HISTORICAL_MEASUREMENT_CROSS_OUTCOME_COLUMNS,
  HISTORICAL_MEASUREMENT_CROSS_STATISTICS_SCHEMA_VERSION,
} from "./historical-measurement-cross-statistics-types";
export type {
  HistoricalMeasurementCohortCrossStatisticsMap,
  HistoricalMeasurementCrossColumnTotals,
  HistoricalMeasurementCrossOutcomeColumn,
  HistoricalMeasurementCrossRowTotals,
  HistoricalMeasurementCrossStatisticsReport,
  HistoricalMeasurementCrossStatisticsSlice,
  HistoricalMeasurementEvalOutcomeMatrix,
} from "./historical-measurement-cross-statistics-types";
export {
  aggregateHistoricalMeasurementRRStatistics,
  buildHistoricalMeasurementRRStatisticsSliceFromEntries,
  classifyHistoricalMeasurementRrBucketRow,
  emptyHistoricalMeasurementRREvaluationMatrix,
  emptyHistoricalMeasurementRROutcomeMatrix,
  isValidHistoricalMeasurementRrRatio,
  resolveHistoricalMeasurementCanonicalRrRatio,
  resolveHistoricalMeasurementRrBucketRow,
} from "./historical-measurement-rr-statistics";
export {
  HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS,
  HISTORICAL_MEASUREMENT_RR_NULL_OR_INVALID,
  HISTORICAL_MEASUREMENT_RR_NUMERICAL_BUCKETS,
  HISTORICAL_MEASUREMENT_RR_STATISTICS_SCHEMA_VERSION,
} from "./historical-measurement-rr-statistics-types";
export type {
  HistoricalMeasurementCohortRRStatisticsMap,
  HistoricalMeasurementRRBucketCounts,
  HistoricalMeasurementRRBucketRow,
  HistoricalMeasurementRRNumericalBucket,
  HistoricalMeasurementRREvaluationMatrix,
  HistoricalMeasurementRROutcomeMatrix,
  HistoricalMeasurementRRStatisticsReport,
  HistoricalMeasurementRRStatisticsSlice,
} from "./historical-measurement-rr-statistics-types";
export {
  aggregateHistoricalMeasurementDimensionStatistics,
  buildHistoricalMeasurementDimensionStatisticsBundleFromEntries,
  combineHistoricalMeasurementDimensionKeys,
  emptyHistoricalMeasurementDimensionStatisticsSlice,
  resolveHistoricalMeasurementDimensionSymbol,
  resolveHistoricalMeasurementDimensionTimeframe,
  resolveHistoricalMeasurementSetupFamily,
  sumDimensionSliceMapTotals,
  sumSymbolTimeframeSetupFamilyLeafTotals,
} from "./historical-measurement-dimension-statistics";
export {
  HISTORICAL_MEASUREMENT_DIMENSION_KEY_SEPARATOR,
  HISTORICAL_MEASUREMENT_DIMENSION_STATISTICS_SCHEMA_VERSION,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SETUP_FAMILY,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_SYMBOL,
  HISTORICAL_MEASUREMENT_DIMENSION_UNKNOWN_TIMEFRAME,
} from "./historical-measurement-dimension-statistics-types";
export type {
  HistoricalMeasurementCohortDimensionStatisticsMap,
  HistoricalMeasurementDimensionSliceMap,
  HistoricalMeasurementDimensionStatisticsBundle,
  HistoricalMeasurementDimensionStatisticsReport,
  HistoricalMeasurementDimensionStatisticsSlice,
  HistoricalMeasurementSymbolTimeframeSetupFamilyTree,
} from "./historical-measurement-dimension-statistics-types";
export {
  HISTORICAL_POSITION_PATH_MODEL_REFERENCE_PATH_V1,
  HISTORICAL_POSITION_PATH_REFERENCE_V1_LIMITATIONS,
  HISTORICAL_POSITION_PATH_SCHEMA_VERSION,
} from "./historical-position-path-contract";
export {
  HISTORICAL_POSITION_OUTCOME_POLICY_CLASSIFICATION_PERFORMANCE_MEANING,
  HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_DEFINITIONS,
  HISTORICAL_POSITION_OUTCOME_POLICY_NON_GOALS,
  HISTORICAL_POSITION_OUTCOME_POLICY_PRIMARY_SUCCESS_RATE_CONTRACT,
  isHistoricalPositionPolicyDecisiveClassification,
  isHistoricalPositionPolicyMeasuredClassification,
  isHistoricalPositionPolicyUnmeasuredClassification,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0_PATH_MAP,
} from "./historical-position-outcome-policy-contract";
export {
  HISTORICAL_POSITION_OUTCOME_POLICY_DENOMINATOR_IDS,
  HISTORICAL_POSITION_OUTCOME_POLICY_IDS,
  HISTORICAL_POSITION_OUTCOME_POLICY_SCHEMA_VERSION,
  HISTORICAL_POSITION_POLICY_CLASSIFICATIONS,
  POSITION_OUTCOME_POLICY_DECISIVE_V1_SHORT_NAME,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_MODEL_ID,
  POSITION_OUTCOME_POLICY_REFERENCE_PATH_V1_DECISIVE_1_0,
} from "./historical-position-outcome-policy-types";
export type {
  ClassifyHistoricalPositionOutcomePolicy,
  HistoricalPositionOutcomePolicyDenominatorId,
  HistoricalPositionOutcomePolicyId,
  HistoricalPositionOutcomePolicyPathOutcomeMap,
  HistoricalPositionPolicyClassification,
} from "./historical-position-outcome-policy-types";
export {
  classifyHistoricalPositionOutcomePolicy,
  HistoricalPositionOutcomePolicyMapperError,
} from "./historical-position-outcome-policy";
export {
  aggregateHistoricalPositionOutcomeStatistics,
  computeHistoricalPositionOutcomeWinRateDecisive,
  emptyHistoricalPositionOutcomeStatisticsCounts,
  pairHistoricalPositionOutcomeObservationsWithBatch,
  HistoricalPositionOutcomeStatisticsValidationError,
} from "./historical-position-outcome-statistics";
export { runHistoricalBacktest } from "./historical-backtest";
export {
  assertHistoricalOhlcvDatasetValid,
  HistoricalOhlcvDatasetValidationError,
  validateHistoricalOhlcvDataset,
} from "./historical-ohlcv-dataset-validation";
export { HISTORICAL_OHLCV_DATASET_VALIDATION_SCHEMA_VERSION } from "./historical-ohlcv-dataset-validation-types";
export type {
  HistoricalOhlcvDatasetValidationIssue,
  HistoricalOhlcvDatasetValidationResult,
} from "./historical-ohlcv-dataset-validation-types";
export {
  fetchBinanceFuturesHistoricalCandles,
  mapWaveTimeframeIdToBinanceInterval,
  REAL_HISTORICAL_BACKTEST_DEFAULT_TARGET_CANDLES,
  REAL_HISTORICAL_BACKTEST_MAX_TARGET_CANDLES,
} from "./historical-ohlcv-dataset-loader";
export {
  auditRealHistoricalEvaluationLookahead,
  auditRealHistoricalFirstDecisiveEvents,
} from "./real-historical-backtest-audit";
export { formatRealHistoricalBacktestReport } from "./real-historical-backtest-report";
export {
  auditHistoricalBacktestRobustness,
  auditHistoricalBacktestSelectionLookahead,
  buildDirectionRrDecisiveCrossTable,
  compareHistoricalBacktestHorizons,
  formatHistoricalBacktestRobustnessAudit,
} from "./historical-backtest-robustness-audit";
export { HISTORICAL_BACKTEST_ROBUSTNESS_AUDIT_SCHEMA_VERSION } from "./historical-backtest-robustness-audit-types";
export {
  INDEPENDENT_TRADE_UNIT_DECISION_CANDLE_RANGE,
  INDEPENDENT_TRADE_UNIT_DESIGN_SCHEMA_VERSION,
  INDEPENDENT_TRADE_UNIT_OUTCOME_CANDLE_RANGE,
} from "./independent-trade-unit-design-contract";
export {
  ENTRY_EVENT_POLICY_V1_ALL_PRODUCTION_CANDIDATES,
  ENTRY_EVENT_POLICY_V1_DISPLAY_PICK_COHORT,
  ENTRY_EVENT_POLICY_V1_READY_REFERENCES_COHORT,
  ENTRY_EVENT_POLICY_V1_TRADE_EVAL_PASSED,
  INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DEFAULT,
  INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_SCHEMA_VERSION,
  INDEPENDENT_TRADE_ENTRY_EVENT_POLICY_DOCUMENTATION,
  snapshotPassesIndependentTradeEntryEventPolicy,
} from "./independent-trade-entry-event-policy-contract";
export type { IndependentTradeEntryEventPolicyId } from "./independent-trade-entry-event-policy-contract";
export {
  buildIndependentTradeLifecycleReport,
  resolveIndependentTradeExitBarIndex,
} from "./independent-trade-unit-lifecycle";
export {
  INDEPENDENT_TRADE_POSITION_MUTEX_POLICY_DEFAULT,
  INDEPENDENT_TRADE_RE_ENTRY_POLICY_DEFAULT,
  INDEPENDENT_TRADE_SIBLING_CANDIDATE_POLICY_DEFAULT,
  INDEPENDENT_TRADE_UNIT_LIFECYCLE_SCHEMA_VERSION,
  POSITION_MUTEX_POLICY_V1_ONE_OPEN_PER_SYMBOL,
  RE_ENTRY_POLICY_V1_ALLOW_AFTER_PRIOR_EXIT,
  SIBLING_CANDIDATE_POLICY_V1_LOWEST_PROSPECTIVE_SETUP_ID,
} from "./independent-trade-unit-lifecycle-types";
export type {
  BuildIndependentTradeLifecycleInput,
  IndependentTradeEntryRejectionReason,
  IndependentTradeLifecycleReport,
  IndependentTradeLifecycleStatus,
  IndependentTradeLifecycleSummary,
  IndependentTradeUnit,
  IndependentTradeUnitConfiguration,
} from "./independent-trade-unit-lifecycle-types";
export {
  aggregateIndependentTradeStatistics,
  computeIndependentTradeWinRateDecisive,
  emptyIndependentTradeStatisticsCounts,
  emptyIndependentTradeStatisticsReport,
  resolveIndependentTradeDirectionSliceKey,
} from "./historical-independent-trade-statistics";
export { HISTORICAL_INDEPENDENT_TRADE_STATISTICS_SCHEMA_VERSION } from "./historical-independent-trade-statistics-types";
export type {
  IndependentTradeClassificationDistribution,
  IndependentTradeCohortStatisticsMap,
  IndependentTradeDenominators,
  IndependentTradeDurationStatistics,
  IndependentTradeEvaluationPolicyMatrix,
  IndependentTradePathOutcomeDistribution,
  IndependentTradeRrBucketStatisticsMap,
  IndependentTradeSetupFamilyStatisticsMap,
  IndependentTradeSnapshotReference,
  IndependentTradeStatisticsCounts,
  IndependentTradeStatisticsReport,
  IndependentTradeStatisticsSlice,
  IndependentTradeSymbolStatisticsMap,
  IndependentTradeTimeframeStatisticsMap,
} from "./historical-independent-trade-statistics-types";
export {
  analyzeIndependentTradeStatistics,
  classifyHistoricalIndependentTradeSampleSize,
  emptyIndependentTradeAnalysisReport,
} from "./historical-independent-trade-analysis";
export {
  HISTORICAL_INDEPENDENT_TRADE_ANALYSIS_SCHEMA_VERSION,
  INDEPENDENT_TRADE_DURATION_BUCKET_IDS,
  INDEPENDENT_TRADE_SAMPLE_SIZE_CONTRACT_VERSION,
  INDEPENDENT_TRADE_SAMPLE_SIZE_THRESHOLDS,
} from "./historical-independent-trade-analysis-types";
export type {
  AnalyzeIndependentTradeStatisticsInput,
  IndependentTradeAnalysisConfiguration,
  IndependentTradeAnalysisMetrics,
  IndependentTradeAnalysisPopulationSummary,
  IndependentTradeAnalysisReport,
  IndependentTradeCombinedAnalysis,
  IndependentTradeDurationBucketId,
  IndependentTradeEvaluationAnalysisMap,
  IndependentTradeEvaluationOutcomeCrossCell,
  IndependentTradeExitReasonAnalysisRow,
  IndependentTradeHighestObservedWinRate,
  IndependentTradeSampleSizeQuality,
} from "./historical-independent-trade-analysis-types";
export {
  classifyStatisticalEvidence,
  compareIndependentTradeGroups,
  computeIndependentTradeWinRateConfidenceInterval,
  testIndependentTradeWinRateAgainstBaseline,
  validateIndependentTradeStatistics,
} from "./historical-independent-trade-statistical-validation";
export { IndependentTradeStatisticalValidationError } from "./historical-independent-trade-statistical-validation";
export {
  HISTORICAL_INDEPENDENT_TRADE_STATISTICAL_VALIDATION_SCHEMA_VERSION,
  INDEPENDENT_TRADE_CONFIDENCE_LEVELS,
  INDEPENDENT_TRADE_DEFAULT_ALPHA,
  INDEPENDENT_TRADE_DEFAULT_BASELINE_WIN_RATE,
  INDEPENDENT_TRADE_DEFAULT_CONFIDENCE_LEVEL,
} from "./historical-independent-trade-statistical-validation-types";
export type {
  IndependentTradeBaselineWinRateTest,
  IndependentTradeGroupWinRateComparison,
  IndependentTradeStatisticalEvidenceLabel,
  IndependentTradeStatisticalValidationConfiguration,
  IndependentTradeStatisticalValidationReport,
  IndependentTradeStatisticalWarnings,
  IndependentTradeValidatedSlice,
  IndependentTradeWinRateConfidenceInterval,
  ValidateIndependentTradeStatisticsInput,
} from "./historical-independent-trade-statistical-validation-types";
export { analyzeIndependentTradeEvaluatorDiagnostic } from "./historical-independent-trade-evaluator-diagnostic";
export { HISTORICAL_INDEPENDENT_TRADE_EVALUATOR_DIAGNOSTIC_SCHEMA_VERSION } from "./historical-independent-trade-evaluator-diagnostic-types";
export {
  aggregateIndependentTradeRMultipleStatistics,
  computeTheoreticalTradeRMultiple,
  type TheoreticalTradeRMultipleResult,
} from "./historical-independent-trade-r-multiple-statistics";
export {
  HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_CONTRACT_VERSION,
  INDEPENDENT_TRADE_R_MULTIPLE_REJECTION_REASONS,
} from "./historical-independent-trade-r-multiple-contract";
export { HISTORICAL_INDEPENDENT_TRADE_R_MULTIPLE_STATISTICS_SCHEMA_VERSION } from "./historical-independent-trade-r-multiple-statistics-types";
export {
  auditIndependentTradeTheoreticalREligibility,
  classifyTheoreticalRGeometryForAudit,
} from "./historical-independent-trade-r-eligibility-audit";
export { HISTORICAL_INDEPENDENT_TRADE_R_ELIGIBILITY_AUDIT_SCHEMA_VERSION } from "./historical-independent-trade-r-eligibility-audit-types";
export type {
  AuditIndependentTradeTheoreticalREligibilityInput,
  HistoricalIndependentTradeREligibilityAuditReport,
  TheoreticalRDecisiveTradeAuditRow,
  TheoreticalRGeometryClassification,
  TheoreticalRRootCauseCategory,
} from "./historical-independent-trade-r-eligibility-audit-types";
export {
  buildHistoricalEvaluatorFailureReasonAnalysis,
  resolveEvaluatorFailureReasonBucket,
} from "./historical-evaluator-failure-reason-analysis";
export {
  EVALUATOR_FAILURE_REASON_ANALYSIS_MISSING_FAILED,
  EVALUATOR_FAILURE_REASON_CONTRACT_NOTES,
  EVALUATOR_FIRST_FAILURE_CANONICAL_ARTIFACT_PATH,
  EVALUATOR_FIRST_FAILURE_LIFECYCLE_FIELD,
  HISTORICAL_EVALUATOR_FAILURE_REASON_SCHEMA_VERSION,
} from "./historical-evaluator-failure-reason-contract";
export type {
  BuildHistoricalEvaluatorFailureReasonAnalysisInput,
  HistoricalEvaluatorFailureReasonAnalysisReport,
} from "./historical-evaluator-failure-reason-analysis-types";
export { buildHistoricalEvaluatorRuleDiagnostic } from "./historical-evaluator-rule-diagnostic";
export {
  integrateB12lFailureReasonIntoEvaluatorRuleDiagnostic,
} from "./historical-evaluator-rule-diagnostic-b12m-integration";
export {
  buildHistoricalEvaluatorFailureReasonDeepDiagnostic,
  mapPathOutcomeToFailureReasonExitPresentation,
} from "./historical-evaluator-failure-reason-deep-diagnostic";
export {
  buildHistoricalEvaluatorRrThresholdCounterfactual,
  resolveCounterfactualEvaluationStatus,
} from "./historical-evaluator-rr-threshold-counterfactual";
export { buildHistoricalEvaluatorRrThresholdTheoreticalRAnalysis } from "./historical-evaluator-rr-threshold-theoretical-r-analysis";
export {
  HISTORICAL_EVALUATOR_RR_THRESHOLD_THEORETICAL_R_ANALYSIS_SCHEMA_VERSION,
  RR_THRESHOLD_THEORETICAL_R_BASELINE_THRESHOLD,
} from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
export type {
  BuildHistoricalEvaluatorRrThresholdTheoreticalRAnalysisInput,
  HistoricalEvaluatorRrThresholdTheoreticalRAnalysisReport,
  RrThresholdTheoreticalRGroupMetrics,
} from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
export {
  CURRENT_EVALUATOR_RR_MINIMUM_THRESHOLD,
  HISTORICAL_EVALUATOR_RR_COUNTERFACTUAL_THRESHOLDS,
  HISTORICAL_EVALUATOR_RR_THRESHOLD_COUNTERFACTUAL_SCHEMA_VERSION,
} from "./historical-evaluator-rr-threshold-counterfactual-types";
export type {
  BuildHistoricalEvaluatorRrThresholdCounterfactualInput,
  CounterfactualEvaluationStatus,
  HistoricalEvaluatorRrThresholdCounterfactualReport,
  RrCounterfactualSummaryTableRow,
} from "./historical-evaluator-rr-threshold-counterfactual-types";
export {
  FAILURE_REASON_DEEP_DIAGNOSTIC_CONDITIONAL_DIMENSIONS,
  FAILURE_REASON_DEEP_DIAGNOSTIC_EXIT_PRESENTATION_IDS,
  FAILURE_REASON_DEEP_DIAGNOSTIC_POLICY_CLASSIFICATIONS,
  HISTORICAL_EVALUATOR_FAILURE_REASON_DEEP_DIAGNOSTIC_SCHEMA_VERSION,
} from "./historical-evaluator-failure-reason-deep-diagnostic-types";
export type {
  BuildHistoricalEvaluatorFailureReasonDeepDiagnosticInput,
  FailureReasonDeepDiagnosticMasterRow,
  HistoricalEvaluatorFailureReasonDeepDiagnosticReport,
} from "./historical-evaluator-failure-reason-deep-diagnostic-types";
export {
  EVALUATOR_RULE_DIAGNOSTIC_STATUSES,
  HISTORICAL_EVALUATOR_RULE_DIAGNOSTIC_SCHEMA_VERSION,
} from "./historical-evaluator-rule-diagnostic-types";
export type {
  BuildHistoricalEvaluatorRuleDiagnosticInput,
  EvaluatorMismatchQuadrantId,
  EvaluatorRuleDiagnosticFailedWinFailureReasonAnalysis,
  EvaluatorRuleDiagnosticFailureReasonAnalysis,
  EvaluatorRuleDiagnosticFailureReasonAvailable,
  EvaluatorRuleDiagnosticFailureReasonUnavailable,
  HistoricalEvaluatorRuleDiagnosticReport,
} from "./historical-evaluator-rule-diagnostic-types";
export {
  buildHistoricalEntryReferenceQualityAnalysis,
  classifyEntryReferenceRewardDistanceBucket,
  classifyEntryReferenceRiskDistanceBucket,
  mapAuditGeometryToEntryReferenceQuality,
} from "./historical-entry-reference-quality-analysis";
export {
  buildHistoricalEntryPriceMoveQualityAnalysis,
  classifyB12pProspectiveBand,
  classifyPriceMoveRewardBucket,
  classifyPriceMoveRiskBucket,
  computeGrossPriceMovePercentages,
} from "./historical-entry-price-move-quality-analysis";
export {
  buildHistoricalAlternativeTargetReachabilityReplay,
  mapReplayEventToPathOutcome,
  replayCounterfactualTargetReachability,
} from "./historical-alternative-target-reachability-replay";
export {
  HISTORICAL_ALTERNATIVE_TARGET_REACHABILITY_REPLAY_SCHEMA_VERSION,
} from "./historical-alternative-target-reachability-replay-types";
export type {
  BuildHistoricalAlternativeTargetReachabilityReplayInput,
  CounterfactualReplayEvent,
  HistoricalAlternativeTargetReachabilityReplayReport,
} from "./historical-alternative-target-reachability-replay-types";
export {
  assertReachabilityUnchanged,
  buildHistoricalCostAwareCounterfactualAnalysis,
  classifyCostMarginState,
  effectiveRiskWithCostPercentage,
  netCounterfactualRr,
  netRealizedRewardPercentage,
  netTargetMarginPercentage,
} from "./historical-cost-aware-counterfactual-analysis";
export {
  DEFAULT_ROUND_TRIP_COST_SCENARIOS_PERCENT,
  HISTORICAL_COST_AWARE_COUNTERFACTUAL_ANALYSIS_SCHEMA_VERSION,
} from "./historical-cost-aware-counterfactual-analysis-types";
export type {
  BuildHistoricalCostAwareCounterfactualAnalysisInput,
  CostMarginState,
  HistoricalCostAwareCounterfactualAnalysisReport,
  ModelCostScenarioMetrics,
  RoundTripCostScenarioPercent,
} from "./historical-cost-aware-counterfactual-analysis-types";
export {
  buildHistoricalTargetDistanceStructuralContextAnalysis,
  classifyContextHeadroomBucket,
  classifyDisplacementContextBucket,
  classifyTargetDistanceAggregateBand,
  resolveDurationBucket,
} from "./historical-target-distance-structural-context-analysis";
export {
  HISTORICAL_TARGET_DISTANCE_STRUCTURAL_CONTEXT_ANALYSIS_SCHEMA_VERSION,
} from "./historical-target-distance-structural-context-analysis-types";
export type {
  BuildHistoricalTargetDistanceStructuralContextAnalysisInput,
  HistoricalTargetDistanceStructuralContextAnalysisReport,
} from "./historical-target-distance-structural-context-analysis-types";
export {
  buildHistoricalTargetDistanceReachabilityCostBalanceAnalysis,
  targetBandToRewardBucket,
} from "./historical-target-distance-reachability-cost-balance-analysis";
export {
  HISTORICAL_TARGET_DISTANCE_REACHABILITY_COST_BALANCE_ANALYSIS_SCHEMA_VERSION,
  TARGET_DISTANCE_BAND_IDS,
} from "./historical-target-distance-reachability-cost-balance-analysis-types";
export type {
  BuildHistoricalTargetDistanceReachabilityCostBalanceAnalysisInput,
  HistoricalTargetDistanceReachabilityCostBalanceAnalysisReport,
  TargetDistanceBandId,
} from "./historical-target-distance-reachability-cost-balance-analysis-types";
export {
  buildHistoricalEntryContextTargetResearch,
  mapHeadroomToSameTargetTier,
} from "./historical-entry-context-target-research";
export {
  HISTORICAL_ENTRY_CONTEXT_TARGET_RESEARCH_SCHEMA_VERSION,
} from "./historical-entry-context-target-research-types";
export type {
  BuildHistoricalEntryContextTargetResearchInput,
  HistoricalEntryContextTargetResearchReport,
} from "./historical-entry-context-target-research-types";
export {
  buildHistoricalEntryContextFutureMoveAnalysis,
  classifyFutureMoveOutcomeBucket,
  classifyMovementOutcome,
  classifyProspectiveRrBucket,
  findFirstFutureMoveReachBar,
  measureFutureMaximumFavorableExcursion,
  measurePostEntryHorizonExcursion,
} from "./historical-entry-context-future-move-analysis";
export {
  HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
} from "./historical-entry-context-future-move-analysis-types";
export type {
  BuildHistoricalEntryContextFutureMoveAnalysisInput,
  HistoricalEntryContextFutureMoveAnalysisReport,
  FutureMoveOutcomeBucketId,
} from "./historical-entry-context-future-move-analysis-types";
export {
  buildHistoricalEntryContextFutureMovePredictivenessAnalysis,
  classifyTargetVsFutureMoveCategory,
  futureMoveReachedAtThreshold,
} from "./historical-entry-context-future-move-predictiveness-analysis";
export {
  HISTORICAL_ENTRY_CONTEXT_FUTURE_MOVE_PREDICTIVENESS_ANALYSIS_SCHEMA_VERSION,
  FUTURE_MOVE_PREDICTIVENESS_THRESHOLDS,
} from "./historical-entry-context-future-move-predictiveness-analysis-types";
export type {
  BuildHistoricalEntryContextFutureMovePredictivenessAnalysisInput,
  HistoricalEntryContextFutureMovePredictivenessAnalysisReport,
  FutureMovePredictivenessContextDimensionId,
} from "./historical-entry-context-future-move-predictiveness-analysis-types";
export {
  buildHistoricalEntryContextCombinationFutureMoveAnalysis,
  buildCombinationBucketLabel,
} from "./historical-entry-context-combination-future-move-analysis";
export {
  HISTORICAL_ENTRY_CONTEXT_COMBINATION_FUTURE_MOVE_ANALYSIS_SCHEMA_VERSION,
  COMBINATION_FUTURE_MOVE_THRESHOLDS,
} from "./historical-entry-context-combination-future-move-analysis-types";
export type {
  BuildHistoricalEntryContextCombinationFutureMoveAnalysisInput,
  HistoricalEntryContextCombinationFutureMoveAnalysisReport,
  CombinationStabilityClass,
} from "./historical-entry-context-combination-future-move-analysis-types";
export {
  buildHistoricalEntryContextSignalIndependenceAudit,
  pearsonCorrelation,
  spearmanRankCorrelation,
} from "./historical-entry-context-signal-independence-audit";
export {
  HISTORICAL_ENTRY_CONTEXT_SIGNAL_INDEPENDENCE_AUDIT_SCHEMA_VERSION,
} from "./historical-entry-context-signal-independence-audit-types";
export type {
  BuildHistoricalEntryContextSignalIndependenceAuditInput,
  HistoricalEntryContextSignalIndependenceAuditReport,
  PredictiveValidityClass,
} from "./historical-entry-context-signal-independence-audit-types";
export {
  buildHistoricalDelayedEntryResearch,
  computeCounterfactualTargetT2,
  computeDelayedEntryPrice,
  computeEntryImprovementPercent,
  DELAYED_ENTRY_SCENARIOS,
  aggregateScenario,
  collectHistoricalDelayedEntrySimulations,
} from "./historical-delayed-entry-research";
export {
  buildHistoricalDelayedEntryDecisionAudit,
} from "./historical-delayed-entry-decision-audit";
export {
  buildHistoricalPhaseBIntegratedEvidenceAudit,
} from "./historical-phase-b-integrated-evidence-audit";
export {
  buildHistoricalPhaseBMultiSymbolRegimeValidation,
  phaseBResearchScopeKey,
} from "./historical-phase-b-multi-symbol-regime-validation";
export {
  HISTORICAL_PHASE_B_MULTI_SYMBOL_REGIME_VALIDATION_SCHEMA_VERSION,
  PHASE_B_RESEARCH_PRIMARY_TIMEFRAME,
  PHASE_B_RESEARCH_TARGET_SYMBOLS,
} from "./historical-phase-b-multi-symbol-regime-validation-types";
export type {
  BuildHistoricalPhaseBMultiSymbolRegimeValidationInput,
  HistoricalPhaseBMultiSymbolRegimeValidationReport,
  PhaseBResearchDatasetRef,
  PhaseBResearchScopeKey,
  PhaseBResearchReplicationStatus,
  PhaseBResearchEvidenceTag,
} from "./historical-phase-b-multi-symbol-regime-validation-types";
export {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_CANDLE_COUNT,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH,
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
} from "./historical-frozen-ohlcv-dataset-types";
export {
  HISTORICAL_PHASE_B_INTEGRATED_EVIDENCE_AUDIT_SCHEMA_VERSION,
} from "./historical-phase-b-integrated-evidence-audit-types";
export type {
  BuildHistoricalPhaseBIntegratedEvidenceAuditInput,
  HistoricalPhaseBIntegratedEvidenceAuditReport,
  ResearchCandidate,
  EvidenceTag,
  EvidenceCoverageLevel,
} from "./historical-phase-b-integrated-evidence-audit-types";
export {
  HISTORICAL_DELAYED_ENTRY_DECISION_AUDIT_SCHEMA_VERSION,
  DECISION_AUDIT_COST_SCENARIOS_PERCENT,
} from "./historical-delayed-entry-decision-audit-types";
export type {
  BuildHistoricalDelayedEntryDecisionAuditInput,
  HistoricalDelayedEntryDecisionAuditReport,
  DecisionComparisonRow,
  CostMatrixCell,
  InvalidationModelComparisonRow,
} from "./historical-delayed-entry-decision-audit-types";
export {
  HISTORICAL_DELAYED_ENTRY_RESEARCH_SCHEMA_VERSION,
  ROUND_TRIP_COST_SCENARIOS,
} from "./historical-delayed-entry-research-types";
export type {
  BuildHistoricalDelayedEntryResearchInput,
  CounterfactualInvalidationModelId,
  CounterfactualTargetModelId,
  DelayedEntryLifecycleStatus,
  DelayedEntryModelId,
  EntryQualityComparisonRow,
  HistoricalDelayedEntryResearchReport,
  HistoricalDelayedEntrySimulationBundle,
  HistoricalDelayedEntryTradeSimResult,
  MissedEntryAnalysisRow,
  ResearchFindingTag,
} from "./historical-delayed-entry-research-types";
export {
  buildHistoricalAlternativeTargetModelAnalysis,
  classifyCounterfactualGeometry,
  computeCounterfactualTargetRr,
  computeDisplacementCounterfactualTarget,
  computeStructuralExtensionCounterfactualTarget,
  computeStructuralPrefixCounterfactualTarget,
} from "./historical-alternative-target-model-analysis";
export {
  HISTORICAL_ALTERNATIVE_TARGET_MODEL_ANALYSIS_SCHEMA_VERSION,
  ALTERNATIVE_TARGET_MODEL_IDS,
} from "./historical-alternative-target-model-analysis-types";
export type {
  AlternativeTargetModelId,
  BuildHistoricalAlternativeTargetModelAnalysisInput,
  HistoricalAlternativeTargetModelAnalysisReport,
} from "./historical-alternative-target-model-analysis-types";
export {
  buildHistoricalStructuralExtremeVsDisplacementTargetAnalysis,
  classifyStructuralHeadroomBucket,
  classifyStructuralMoveBucket,
  countB12sStructuralMoveBeyondCanonicalReward,
} from "./historical-structural-extreme-vs-displacement-target-analysis";
export {
  HISTORICAL_STRUCTURAL_EXTREME_VS_DISPLACEMENT_TARGET_ANALYSIS_SCHEMA_VERSION,
  STRUCTURAL_HEADROOM_BUCKET_IDS,
  STRUCTURAL_MOVE_BUCKET_IDS,
} from "./historical-structural-extreme-vs-displacement-target-analysis-types";
export type {
  BuildHistoricalStructuralExtremeVsDisplacementTargetAnalysisInput,
  HistoricalStructuralExtremeVsDisplacementTargetAnalysisReport,
  StructuralHeadroomBucketId,
  StructuralMoveBucketId,
} from "./historical-structural-extreme-vs-displacement-target-analysis-types";
export {
  buildHistoricalDisplacementEqualityTargetMechanicsAnalysis,
} from "./historical-displacement-equality-target-mechanics-analysis";
export {
  HISTORICAL_DISPLACEMENT_EQUALITY_TARGET_MECHANICS_ANALYSIS_SCHEMA_VERSION,
} from "./historical-displacement-equality-target-mechanics-analysis-types";
export type {
  BuildHistoricalDisplacementEqualityTargetMechanicsAnalysisInput,
  HistoricalDisplacementEqualityTargetMechanicsAnalysisReport,
} from "./historical-displacement-equality-target-mechanics-analysis-types";
export {
  buildHistoricalTargetProvenanceStructuralDistanceAnalysis,
  classifyTargetMagnitudeRewardBucket,
} from "./historical-target-provenance-structural-distance-analysis";
export {
  HISTORICAL_TARGET_PROVENANCE_STRUCTURAL_DISTANCE_ANALYSIS_SCHEMA_VERSION,
  TARGET_MAGNITUDE_REWARD_BUCKET_CONTRACT_VERSION,
  TARGET_MAGNITUDE_REWARD_BUCKET_IDS,
} from "./historical-target-provenance-structural-distance-analysis-types";
export type {
  BuildHistoricalTargetProvenanceStructuralDistanceAnalysisInput,
  HistoricalTargetProvenanceStructuralDistanceAnalysisReport,
  TargetProvenanceCategory,
} from "./historical-target-provenance-structural-distance-analysis-types";
export {
  HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION,
  PRICE_MOVE_REWARD_BUCKET_CONTRACT_VERSION,
  PRICE_MOVE_REWARD_BUCKET_IDS,
  PRICE_MOVE_RISK_BUCKET_CONTRACT_VERSION,
  PRICE_MOVE_RISK_BUCKET_IDS,
} from "./historical-entry-price-move-quality-analysis-types";
export type {
  BuildHistoricalEntryPriceMoveQualityAnalysisInput,
  HistoricalEntryPriceMoveQualityAnalysisReport,
  PriceMovePerTradeRow,
  PriceMoveRewardBucketId,
  PriceMoveRiskBucketId,
} from "./historical-entry-price-move-quality-analysis-types";
export {
  ENTRY_REFERENCE_GEOMETRY_QUALITY_ROWS,
  ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_CONTRACT_VERSION,
  ENTRY_REFERENCE_REWARD_DISTANCE_BUCKET_IDS,
  ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_CONTRACT_VERSION,
  ENTRY_REFERENCE_RISK_DISTANCE_BUCKET_IDS,
  HISTORICAL_ENTRY_REFERENCE_QUALITY_ANALYSIS_SCHEMA_VERSION,
} from "./historical-entry-reference-quality-analysis-types";
export type {
  BuildHistoricalEntryReferenceQualityAnalysisInput,
  EntryReferenceGeometryQuality,
  HistoricalEntryReferenceQualityAnalysisReport,
} from "./historical-entry-reference-quality-analysis-types";
export { buildHistoricalTheoreticalPerformanceReport } from "./historical-theoretical-performance-report";
export { HISTORICAL_THEORETICAL_PERFORMANCE_REPORT_SCHEMA_VERSION } from "./historical-theoretical-performance-report-types";
export type {
  BuildHistoricalTheoreticalPerformanceReportInput,
  HistoricalTheoreticalPerformanceReport,
  TheoreticalPerformanceInterpretationFlag,
  TheoreticalPerformanceOverall,
} from "./historical-theoretical-performance-report-types";
export type {
  AggregateIndependentTradeRMultipleStatisticsInput,
  HistoricalIndependentTradeRMultipleStatisticsReport,
  IndependentTradeRMultipleOverallStatistics,
  IndependentTradeRMultipleSliceStatistics,
} from "./historical-independent-trade-r-multiple-statistics-types";
export type {
  AnalyzeIndependentTradeEvaluatorDiagnosticInput,
  EvaluatorDiagnosticDriverNote,
  EvaluatorDiagnosticMismatchSummary,
  HistoricalIndependentTradeEvaluatorDiagnosticReport,
} from "./historical-independent-trade-evaluator-diagnostic-types";
export type { HistoricalBacktestRobustnessAuditReport } from "./historical-backtest-robustness-audit-types";
export {
  resolveRealHistoricalBacktestEvaluationRange,
  runRealHistoricalBacktest,
} from "./real-historical-backtest";
export { REAL_HISTORICAL_BACKTEST_SCHEMA_VERSION } from "./real-historical-backtest-types";
export type {
  RealHistoricalBacktestEvaluationRange,
  RealHistoricalBacktestResult,
  RunRealHistoricalBacktestInput,
} from "./real-historical-backtest-types";
export {
  auditHistoricalBacktestCandidateExpansionAtBar,
  auditHistoricalBacktestCohortFilterOrSemantics,
  auditHistoricalBacktestReport,
  auditHistoricalMeasurementRrBucketBoundaries,
} from "./historical-backtest-validation";
export {
  HISTORICAL_BACKTEST_DEMO_VALIDATION_RANGE,
  HISTORICAL_BACKTEST_VALIDATION_SCHEMA_VERSION,
} from "./historical-backtest-validation-types";
export type {
  HistoricalBacktestAuditResult,
  HistoricalBacktestDecisiveSample,
  HistoricalBacktestValidationIssue,
  HistoricalBacktestValidationSummary,
} from "./historical-backtest-validation-types";
export { HISTORICAL_BACKTEST_REPORT_SCHEMA_VERSION } from "./historical-backtest-types";
export type {
  HistoricalBacktestConfiguration,
  HistoricalBacktestReport,
  RunHistoricalBacktestInput,
} from "./historical-backtest-types";
export { HISTORICAL_POSITION_OUTCOME_STATISTICS_SCHEMA_VERSION } from "./historical-position-outcome-statistics-types";
export type {
  HistoricalPositionOutcomeCohortStatisticsMap,
  HistoricalPositionOutcomeDenominators,
  HistoricalPositionOutcomeDirectionStatisticsMap,
  HistoricalPositionOutcomeEvaluationPolicyMatrix,
  HistoricalPositionOutcomeRrBucketStatisticsMap,
  HistoricalPositionOutcomeSetupFamilyStatisticsMap,
  HistoricalPositionOutcomeStatisticRate,
  HistoricalPositionOutcomeStatisticsCounts,
  HistoricalPositionOutcomeStatisticsInput,
  HistoricalPositionOutcomeStatisticsObservation,
  HistoricalPositionOutcomeStatisticsRates,
  HistoricalPositionOutcomeStatisticsReport,
  HistoricalPositionOutcomeStatisticsSlice,
  HistoricalPositionOutcomeSymbolStatisticsMap,
  HistoricalPositionOutcomeTimeframeStatisticsMap,
} from "./historical-position-outcome-statistics-types";
export type {
  HistoricalPositionOutcomePolicyClassificationResult,
  HistoricalPositionOutcomePolicyMapperErrorCode,
} from "./historical-position-outcome-policy";
export {
  buildHistoricalPositionPathReplayInputFromArtifactEntry,
  resolveHistoricalPositionPathV1,
} from "./historical-position-path";
export type {
  HistoricalPositionPathResult,
  ResolveHistoricalPositionPathV1Input,
} from "./historical-position-path-types";
export {
  assertHistoricalPositionPathBatchCandleContract,
  HistoricalPositionPathBatchValidationError,
  runHistoricalPositionPathBatch,
} from "./historical-position-path-batch";
export { HISTORICAL_POSITION_PATH_BATCH_SCHEMA_VERSION } from "./historical-position-path-batch-types";
export type {
  HistoricalPositionPathBatchInputSummary,
  HistoricalPositionPathBatchResult,
  RunHistoricalPositionPathBatchInput,
} from "./historical-position-path-batch-types";
export type {
  HistoricalMeasurementOutcomeDistribution,
  HistoricalMeasurementStatisticsDataQuality,
  HistoricalMeasurementStatisticsDistributions,
  HistoricalMeasurementStatisticsInput,
  HistoricalMeasurementStatisticsReport,
  HistoricalMeasurementStatisticsSample,
  HistoricalMeasurementTradeEvaluationDistribution,
} from "./historical-measurement-statistics-types";
export {
  presentWaveScannerRow,
  WAVE_SCANNER_UI_LABELS,
  WAVE_SCANNER_FORBIDDEN_UI_TOKENS,
} from "./wave-scanner-presentation";
export type { ProductionWaveScannerComposedRow } from "./wave-scanner-presentation";
export {
  WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION,
} from "./wave-scanner-presentation-types";
export type {
  WaveScannerReportPresentation,
  WaveScannerRowPresentation,
} from "./wave-scanner-presentation-types";
export {
  ENTRY_PLAN_ELIGIBILITY_RULE,
  SETUP_CATALOG,
  STRUCTURAL_SETUP_CATALOG,
  TRADE_SETUP_CATALOG,
  buildTradeSetupEvaluationContext,
  detectSetups,
  detectSetupsFromScanReport,
  detectTradeSetups,
  evaluateCondition,
  evaluateTradeCondition,
  getSetupCatalogEntry,
  isEntryPlanEligibleSetup,
  listStructuralContextCatalogEntries,
  listTradeSetupCatalogEntries,
  resolveSetupLifecycleStatus,
  buildEntryPlanFromSetup,
  buildEntryPlansFromSetupReport,
  evaluationBarSourceFromBundle,
  resolveEntryPlanEligibility,
  ENTRY_PLAN_SCHEMA_VERSION,
  ENTRY_MODEL_SCHEMA_VERSION,
  buildEntryModelReport,
  entryReferencesAvailable,
  evaluateEntryModel,
  listEntryModelsForSetupType,
  STOP_LOSS_MODEL_SCHEMA_VERSION,
  buildStopLossReport,
  evaluateStopLossModel,
  stopReferencesAvailable,
  listStopLossModelsForSetupType,
  TARGET_MODEL_SCHEMA_VERSION,
  buildTargetModelReport,
  evaluateTargetModel,
  targetReferencesAvailable,
  listTargetModelsForSetupType,
  isObjectiveTargetReferenceKind,
  RISK_REWARD_MODEL_SCHEMA_VERSION,
  buildRiskRewardReport,
  evaluateRiskRewardModel,
  riskRewardReferencesAvailable,
  TRADE_SETUP_EVALUATION_SCHEMA_VERSION,
  buildTradeSetupEvaluationSnapshot,
  resolveTradeSetupEvaluationState,
  TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION,
  buildTradeSetupEvaluationPipeline,
  OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION,
  buildObjectiveTargetCandidateReport,
  evaluateObjectiveTargetSource,
  objectiveTargetCandidatesAvailable,
  listObjectiveTargetSourcesForSetupType,
  OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION,
  DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY,
  applyObjectiveTargetSelectionPolicy,
  entryPlanWithSelectedObjectiveTarget,
  objectiveTargetReferenceLevelFromCandidate,
} from "./setup";
export type {
  SetupCandidate,
  SetupCategory,
  SetupDetectionInput,
  SetupDetectionReport,
  SetupLifecycleStatus,
  ConditionEvaluation,
  ConditionOutcome,
  EntryPlanBuildInput,
  EntryPlanBuildResult,
  EntryPlanCandidate,
  EntryPlanEligibility,
  EntryPlanEligibilityReason,
  EntryPlanEvaluationBarRef,
  EntryPlanEvaluationBarSource,
  EntryPlanInvalidationRef,
  EntryPlanReport,
  EntryPlanSetupRef,
  EntryModelBuildResult,
  EntryModelEvaluateInput,
  EntryModelId,
  EntryModelPriceContext,
  EntryModelReport,
  EntryPriceReference,
  EntryReferenceOutcome,
  StopLossModelBuildResult,
  StopLossModelEvaluateInput,
  StopLossModelId,
  StopLossModelReport,
  StopLossReference,
  StopLossReferenceOutcome,
  TargetModelBuildResult,
  TargetModelEvaluateInput,
  TargetModelId,
  TargetModelReport,
  TargetReference,
  TargetReferenceOutcome,
  RiskRewardModelBuildResult,
  RiskRewardModelEvaluateInput,
  RiskRewardModelId,
  RiskRewardModelReport,
  RiskRewardReference,
  RiskRewardReferenceOutcome,
  TradeSetupEvaluationAggregateState,
  TradeSetupEvaluationComposeInput,
  TradeSetupEvaluationSnapshot,
  TradeSetupEvaluationPipelineInput,
  TradeSetupEvaluationPipelineError,
  TradeSetupEvaluationPipelineErrorPhase,
  TradeSetupEvaluationPipelineItem,
  TradeSetupEvaluationPipelineReport,
  ObjectiveTargetCandidate,
  ObjectiveTargetCandidateEvaluateInput,
  ObjectiveTargetCandidateOutcome,
  ObjectiveTargetCandidateReport,
  ObjectiveTargetSourceContext,
  ObjectiveTargetSourceId,
  ObjectiveTargetSelectionInput,
  ObjectiveTargetSelectionOutcome,
  ObjectiveTargetSelectionPolicy,
  ObjectiveTargetSelectionResult,
} from "./setup";
