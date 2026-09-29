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
