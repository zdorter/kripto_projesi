import type { WaveLabel } from "../types";
import type { ObjectiveEligibility } from "./trade-setup-temporal-types";
import type { OpenStructuralLegResolution } from "./open-structural-leg-types";
import type {
  ObjectiveTargetEligibilityGateOutcome,
  ProspectiveSetupContractResult,
} from "./prospective-setup-contract-types";

export const PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT =
  "STRUCTURAL_RESUMPTION_CONTEXT" as const;

export type ProspectiveProductionFamilyId =
  typeof PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT;

export type ProspectiveSetupSourceKind = "HISTORICAL_TRADE_SETUP";

export type ProspectiveSetupProductionStatus =
  | "CANDIDATE"
  | "CONFIRMED"
  | "INVALIDATED"
  | "INSUFFICIENT_CONTEXT";

export type ProspectiveFunnelStage =
  | "SOURCE"
  | "OPEN_LEG"
  | "ANCHOR"
  | "TRANSITION"
  | "INVALIDATION"
  | "PROSPECTIVE_CONFIRMED"
  | "OBJECTIVE_ELIGIBLE"
  | "TARGET_GATE"
  | "COMPLETE";

export type ProspectiveFunnelReasonCode =
  | "SOURCE_NOT_HISTORICAL_STRUCTURE"
  | "SOURCE_ENDPOINT_NOT_CONFIRMED"
  | "OPEN_LEG_UNAVAILABLE"
  | "ANCHOR_NOT_SELECTED"
  | "ANCHOR_AMBIGUOUS"
  | "NO_OBSERVED_SPAN"
  | "TRANSITION_NOT_OBSERVED"
  | "OPEN_MOVEMENT_ONLY"
  | "INVALIDATION_UNAVAILABLE"
  | "INVALIDATION_TRIGGERED"
  | "NOT_FUTURE_SAFE"
  | "PROSPECTIVE_NOT_CONFIRMED"
  | "OBJECTIVE_NOT_ELIGIBLE"
  | "TARGET_GATE_FAIL";

export interface ProspectiveSetupProductionCandidate {
  schemaVersion: "1.0";
  id: string;
  symbol: string;
  timeframe: string;
  familyId: ProspectiveProductionFamilyId;
  semanticCategory: "PROSPECTIVE_TRADE_SETUP";
  sourceKind: ProspectiveSetupSourceKind;
  sourceSetupId: string;
  sourceSetupTypeId: string;
  status: ProspectiveSetupProductionStatus;
  evaluationBarIndex: number;
  prospectiveWaveLabel: WaveLabel | null;
  observedDirection: string | null;
  openLegResolution: OpenStructuralLegResolution;
  contract: ProspectiveSetupContractResult;
  objectiveEligibility: ObjectiveEligibility;
  targetGateOutcome: ObjectiveTargetEligibilityGateOutcome;
  funnelFirstFailure: ProspectiveFunnelStage;
  funnelReasonCode: ProspectiveFunnelReasonCode | null;
  futureSafe: boolean;
  usesLegacyPotentialAsProductionEvidence: false;
}

export interface ProspectiveSetupProductionReport {
  schemaVersion: "1.0";
  candidates: ProspectiveSetupProductionCandidate[];
  summary: Record<string, number>;
}

export const PROSPECTIVE_ENTRY_PLAN_COMPATIBILITY_VERDICT =
  "ENTRY_PLAN_REDESIGN_REQUIRED" as const;

export const PROSPECTIVE_STOP_COMPATIBILITY_VERDICT =
  "STOP_ADAPTER_NOT_WIRED" as const;
