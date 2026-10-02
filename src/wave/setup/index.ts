export {
  SETUP_CATALOG,
  STRUCTURAL_SETUP_CATALOG,
  getSetupCatalogEntry,
  isEntryPlanEligibleSetup,
  listStructuralContextCatalogEntries,
  listTradeSetupCatalogEntries,
} from "./setup-catalog";
export { TRADE_SETUP_CATALOG } from "./trade-setup-catalog";
export {
  buildSymbolEvaluationBundle,
  buildSymbolEvaluationBundleAtEvaluationBar,
  buildTradeSetupEvaluationContext,
} from "./trade-setup-context";
export {
  resolveTradeSetupEvaluationBoundary,
} from "./trade-setup-evaluation-bar";
export {
  buildEntryPlanFromSetup,
  buildEntryPlansFromSetupReport,
  evaluationBarSourceFromBundle,
  resolveEntryPlanEligibility,
} from "./entry-plan";
export type {
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
} from "./entry-plan-types";
export { ENTRY_PLAN_SCHEMA_VERSION } from "./entry-plan-types";
export {
  ENTRY_MODEL_DEFINITIONS,
  ENTRY_MODELS_BY_SETUP_TYPE,
  getEntryModelDefinition,
  listEntryModelsForSetupType,
} from "./entry-model-catalog";
export {
  buildEntryModelReport,
  entryReferencesAvailable,
  evaluateEntryModel,
} from "./entry-model";
export type {
  EntryModelBuildResult,
  EntryModelEvaluateInput,
  EntryModelId,
  EntryModelPriceContext,
  EntryModelReport,
  EntryPriceReference,
  EntryReferenceOutcome,
} from "./entry-model-types";
export { ENTRY_MODEL_SCHEMA_VERSION } from "./entry-model-types";
export {
  STOP_LOSS_MODEL_DEFINITIONS,
  STOP_LOSS_MODELS_BY_SETUP_TYPE,
  getStopLossModelDefinition,
  listStopLossModelsForSetupType,
} from "./stop-loss-model-catalog";
export {
  buildStopLossReport,
  evaluateStopLossModel,
  stopReferencesAvailable,
} from "./stop-loss-model";
export type {
  StopLossModelBuildResult,
  StopLossModelEvaluateInput,
  StopLossModelId,
  StopLossModelReport,
  StopLossReference,
  StopLossReferenceOutcome,
} from "./stop-loss-model-types";
export { STOP_LOSS_MODEL_SCHEMA_VERSION } from "./stop-loss-model-types";
export {
  OBJECTIVE_TARGET_REFERENCE_KINDS,
  TARGET_MODEL_DEFINITIONS,
  TARGET_MODELS_BY_SETUP_TYPE,
  getTargetModelDefinition,
  isObjectiveTargetReferenceKind,
  listTargetModelsForSetupType,
} from "./target-model-catalog";
export {
  buildTargetModelReport,
  evaluateTargetModel,
  targetReferencesAvailable,
} from "./target-model";
export type {
  TargetModelBuildResult,
  TargetModelEvaluateInput,
  TargetModelId,
  TargetModelReport,
  TargetReference,
  TargetReferenceOutcome,
} from "./target-model-types";
export { TARGET_MODEL_SCHEMA_VERSION } from "./target-model-types";
export {
  RISK_REWARD_MODEL_DEFINITIONS,
  getRiskRewardModelDefinition,
} from "./risk-reward-model-catalog";
export {
  buildRiskRewardReport,
  evaluateRiskRewardModel,
  riskRewardReferencesAvailable,
} from "./risk-reward-model";
export type {
  RiskRewardModelBuildResult,
  RiskRewardModelEvaluateInput,
  RiskRewardModelId,
  RiskRewardModelReport,
  RiskRewardReference,
  RiskRewardReferenceOutcome,
} from "./risk-reward-model-types";
export { RISK_REWARD_MODEL_SCHEMA_VERSION } from "./risk-reward-model-types";
export {
  buildTradeSetupEvaluationSnapshot,
  resolveTradeSetupEvaluationState,
} from "./trade-setup-evaluation";
export { buildTradeSetupEvaluationPipeline } from "./trade-setup-evaluation-pipeline";
export type { TradeSetupEvaluationPipelineInput } from "./trade-setup-evaluation-pipeline";
export type {
  TradeSetupEvaluationPipelineError,
  TradeSetupEvaluationPipelineErrorPhase,
  TradeSetupEvaluationPipelineItem,
  TradeSetupEvaluationPipelineReport,
} from "./trade-setup-evaluation-pipeline-types";
export { TRADE_SETUP_EVALUATION_PIPELINE_SCHEMA_VERSION } from "./trade-setup-evaluation-pipeline-types";
export type {
  TradeSetupEvaluationAggregateState,
  TradeSetupEvaluationComposeInput,
  TradeSetupEvaluationSnapshot,
} from "./trade-setup-evaluation-types";
export { TRADE_SETUP_EVALUATION_SCHEMA_VERSION } from "./trade-setup-evaluation-types";
export {
  OBJECTIVE_TARGET_SOURCE_DEFINITIONS,
  OBJECTIVE_TARGET_SOURCES_BY_SETUP_TYPE,
  getObjectiveTargetSourceDefinition,
  isObjectiveTargetSourceApplicable,
  listObjectiveTargetSourcesForSetupType,
} from "./objective-target-source-catalog";
export {
  buildObjectiveTargetCandidateReport,
  evaluateObjectiveTargetSource,
  objectiveTargetCandidatesAvailable,
} from "./objective-target-candidate-sources";
export {
  PRODUCTION_FIBONACCI_PROJECTION_POLICIES,
  extractW1LegAnchorsFromFibonacciDiagnostic,
  resolveFibonacciProjectionPolicy,
} from "./fibonacci-projection-policy";
export type {
  FibonacciObjectiveTargetProjectionPolicy,
  FibonacciProjectionPolicyResolution,
  FibonacciProjectionPolicyStatus,
} from "./fibonacci-projection-policy-types";
export {
  auditFibonacciAnchorLookahead,
  buildDiagnosticRatioProjections,
  buildImpulsePivotDiagnostics,
  compareDiagnosticsToPivotPrices,
  computeProjectionForAnchorModel,
  diagnosticProjectModelA,
  diagnosticProjectModelB,
  extractW1W2FibonacciAnchors,
} from "./fibonacci-anchor-semantics";
export type {
  FibonacciAnchorModelSupportVerdict,
  FibonacciProjectionAnchorModel,
  FibonacciProjectionScope,
} from "./fibonacci-anchor-semantics-types";
export { projectBasePlusReferenceWaveDelta } from "./wave-projection-relationship-math";
export { resolveWaveProjectionContext } from "./wave-projection-context";
export {
  characterizeImpulseLegAtBar,
  buildNextStructuralEvidence,
  resolveObjectiveWaveContext,
} from "./objective-wave-resolution";
export type {
  CurrentWaveLabel,
  ObjectiveWaveLabel,
  ObjectiveWaveResolutionContext,
  ObjectiveWaveResolutionStatus,
  ImpulseLegTemporalState,
  ObjectiveWaveTemporalCompatibility,
  RelationshipTemplateKeyingVerdict,
} from "./objective-wave-resolution-types";
export {
  buildObjectivePhaseContext,
  prospectiveSetupSupportVerdict,
  resolveTradeSetupTemporalContext,
} from "./trade-setup-temporal-semantics";
export {
  TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT,
} from "./trade-setup-temporal-types";
export type {
  ObjectiveEligibility,
  ObjectivePhaseContext,
  TradeSetupSemanticKind,
  TradeSetupTemporalClass,
  TradeSetupTemporalContext,
} from "./trade-setup-temporal-types";
export {
  evaluateObjectiveTargetEligibilityGate,
} from "./objective-target-eligibility-gate";
export { resolveProspectiveSetupContract } from "./prospective-setup-contract";
export {
  detectProspectiveSetupProduction,
  evaluateProspectiveSetupProduction,
  PRODUCTION_STRUCTURAL_TRANSITION_RULE,
} from "./prospective-setup-production";
export { evaluateProspectiveReferenceBundle } from "./prospective-reference-evaluation";
export {
  TRADE_EVALUATION_ENTRY_FRESHNESS_TOLERANCE,
  TRADE_EVALUATION_MIN_RR,
  TRADE_EVALUATION_SCHEMA_VERSION,
} from "./trade-evaluation-contract";
export { evaluateTradeEvaluation, tradeEvaluationCanonicalRr } from "./trade-evaluation";
export {
  formatTradeEvaluationDetailsSection,
  formatTradeEvaluationStatusColumn,
  mapTradeEvaluationPresentation,
} from "./trade-evaluation-presentation";
export type {
  TradeEvaluationResult,
  TradeEvaluationInput,
  TradeEvaluationFirstFailureCode,
} from "./trade-evaluation-types";
export {
  PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY,
  PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY_LEGACY,
  describeProspectiveOpenLegDisplacementEqualityContract,
  isProspectiveOpenLegDisplacementEqualityPolicyId,
  normalizeProspectiveTargetPolicyId,
  projectProspectiveOpenLegDisplacementEqualityTarget,
} from "./prospective-open-leg-displacement-equality-policy";
export { evaluateProspectiveSourcePolicy } from "./prospective-setup-source-policy";
export {
  PROSPECTIVE_ENTRY_PLAN_COMPATIBILITY_VERDICT,
  PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
  PROSPECTIVE_STOP_COMPATIBILITY_VERDICT,
} from "./prospective-setup-production-types";
export type {
  ProspectiveSetupProductionCandidate,
  ProspectiveSetupProductionReport,
  ProspectiveFunnelReasonCode,
  ProspectiveFunnelStage,
} from "./prospective-setup-production-types";
export {
  buildEvaluationScopedWaveScanReport,
  buildTradeSetupEvaluationContextWithScopedAnalysis,
} from "./evaluation-scoped-trade-context";
export { resolveOpenStructuralLeg } from "./open-structural-leg";
export { compareOpenLegPaths } from "./open-structural-leg-comparison";
export type {
  OpenStructuralLegResolution,
  OpenStructuralLegStatus,
  OpenStructuralLegAnchorSource,
  OpenStructuralLegAnchorCandidate,
  OpenLegPathComparison,
} from "./open-structural-leg-types";
export type {
  ObjectiveTargetEligibilityGateResult,
  ProspectiveSetupContractResult,
  ProspectivePhaseStatus,
  OpenStructuralLeg,
  ProspectiveTransitionEvidence,
} from "./prospective-setup-contract-types";
export type {
  WaveProjectionContext,
  WaveProjectionContextStatus,
  WaveProjectionRelationshipCandidate,
  WaveProjectionMathContract,
  WaveProjectionBaseAnchorKind,
} from "./wave-projection-relationship-types";
export {
  buildObjectiveTargetSourceContextForPlan,
  buildObjectiveTargetSourceContextBySetupId,
  buildObjectiveTargetSourceContextBySetupIdFromTradeContext,
} from "./objective-target-production-context";
export type {
  ObjectiveTargetCandidate,
  ObjectiveTargetCandidateEvaluateInput,
  ObjectiveTargetCandidateOutcome,
  ObjectiveTargetCandidateReport,
  ObjectiveTargetSourceContext,
  ObjectiveTargetSourceId,
  ObjectiveTargetSourceProvenance,
} from "./objective-target-candidate-types";
export { OBJECTIVE_TARGET_CANDIDATE_SCHEMA_VERSION } from "./objective-target-candidate-types";
export { DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY } from "./objective-target-selection-policy";
export { applyObjectiveTargetSelectionPolicy } from "./objective-target-selection";
export {
  entryPlanWithSelectedObjectiveTarget,
  objectiveTargetReferenceLevelFromCandidate,
} from "./objective-target-selection-bridge";
export type {
  ObjectiveTargetSelectionInput,
  ObjectiveTargetSelectionOutcome,
  ObjectiveTargetSelectionPolicy,
  ObjectiveTargetSelectionResult,
} from "./objective-target-selection-types";
export { OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION } from "./objective-target-selection-types";
export { detectTradeSetups } from "./trade-setup-detector";
export {
  evaluateTradeCondition,
  resolveTradeSetupLifecycleStatus,
} from "./trade-setup-rules";
export {
  detectSetups,
  detectSetupsFromScanReport,
} from "./setup-detector";
export {
  buildReferenceLevels,
  catalogMatchesScanRow,
  evaluateCondition,
  isContextInsufficientForCatalog,
  resolveDirectionalBias,
  resolveSetupLifecycleStatus,
  standardSetupLimitations,
  summarizeConditions,
} from "./setup-rules";
export type {
  ConditionEvaluation,
  ConditionOutcome,
  ReferenceLevel,
  ReferenceLevelKind,
  SetupCandidate,
  SetupCatalogEntry,
  SetupConditionId,
  SetupConfirmationView,
  SetupDetectionInput,
  SetupDetectionReport,
  SetupDetectionSymbolError,
  SetupDirectionalBasis,
  SetupDirectionalBias,
  SetupEvaluationContext,
  SetupInvalidationView,
  SetupLifecycleStatus,
  SetupScenarioRef,
  SetupSourceScenarioView,
  SetupSymbolContext,
  SetupTriggerView,
} from "./setup-types";
export {
  ENTRY_PLAN_ELIGIBILITY_RULE,
  SETUP_SCHEMA_VERSION,
} from "./setup-types";
export type { SetupCategory } from "./setup-types";
export type {
  SymbolEvaluationBundle,
  TradeSetupCatalogEntry,
  TradeSetupConditionId,
  TradeSetupEvaluationContext,
  TradeSetupSymbolBuildInput,
} from "./trade-setup-types";
