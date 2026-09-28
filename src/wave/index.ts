export {
  analyzeWave,
  analyzeWaveWithDiagnostics,
  analyzeWaveWithPresentation,
  buildWaveAnalysis,
} from "./analysis-pipeline";
export type { WaveAnalysisResult } from "./analysis-pipeline";

export { computeAtrSeries, computeSwingStrength, detectSwings } from "./swing-detector";
export {
  classifyHighStructure,
  classifyLowStructure,
  detectMarketStructures,
  detectTrend,
} from "./trend-detector";
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
} from "./wave-scenarios";
export type {
  InvalidationSource,
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
