import type {
  TradeEvaluationCheckOutcome,
  TradeEvaluationFirstFailureCode,
  TradeEvaluationResult,
  TradeEvaluationStatus,
} from "./setup/trade-evaluation-types";

export const WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION = "1.0" as const;

export type WaveScannerLayerStatus =
  | "AVAILABLE"
  | "INSUFFICIENT_CONTEXT"
  | "NOT_APPLICABLE";

export interface WaveScannerReferencePresentation {
  status: WaveScannerLayerStatus;
  price: number | null;
  source: string | null;
}

export interface WaveScannerProspectiveSetupPresentation {
  family: string;
  status: string;
  temporalState: string;
}

export interface WaveScannerStructuralTracePresentation {
  anchorIndex: number | null;
  anchorPrice: number | null;
  anchorSources: string[];
  anchorResolutionMode: string | null;
  completedEndpointIndex: number | null;
  completedEndpointPrice: number | null;
  observedDirection: string | null;
  transitionEvidenceLevel: string | null;
  swingConfirmationLagBars: number | null;
  subsequentSwingIndex: number | null;
  invalidationSource: string | null;
  invalidationAvailable: boolean;
  targetPolicyId: string | null;
  transitionRuleId: string | null;
}

export interface WaveScannerRowDetailsPresentation {
  market: {
    symbol: string;
    timeframe: string;
    evaluationBarIndex: number | null;
    evaluationBarTime: number | null;
    candleCount: number | null;
  };
  structure: string | null;
  scenario: {
    scenarioId: string | null;
    waveLabel: string | null;
    structure: string | null;
    engineStatus: string | null;
  };
  prospectiveSetup: WaveScannerProspectiveSetupPresentation | null;
  historicalSetupStatus: string | null;
  anchor: {
    selection: string | null;
    status: string | null;
  };
  openStructuralLeg: {
    status: string | null;
    observationEndIndex: number | null;
    observationSpanBars: number | null;
  };
  transition: {
    verdict: string | null;
    evidenceLevel: string | null;
  };
  invalidation: {
    available: boolean;
    triggered: boolean;
  };
  entryReference: WaveScannerReferencePresentation;
  stopReference: WaveScannerReferencePresentation;
  targetReference: WaveScannerReferencePresentation;
  rr: { status: WaveScannerLayerStatus; value: number | null };
  structuralTrace: WaveScannerStructuralTracePresentation;
  tradeEvaluation: TradeEvaluationResult;
  technicalDiagnosticsJson: string | null;
}

export interface WaveScannerTradeEvaluationPresentation {
  status: TradeEvaluationStatus;
  passed: boolean;
  firstFailure: TradeEvaluationFirstFailureCode;
  entry: TradeEvaluationCheckOutcome;
  stop: TradeEvaluationCheckOutcome;
  target: TradeEvaluationCheckOutcome;
  rr: TradeEvaluationCheckOutcome;
}

export interface WaveScannerRowPresentation {
  schemaVersion: typeof WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION;
  symbol: string;
  timeframe: string;
  evaluationBarTime: number | null;
  structure: string | null;
  scenario: string | null;
  prospectiveSetup: WaveScannerProspectiveSetupPresentation | null;
  entryReference: WaveScannerReferencePresentation;
  stopReference: WaveScannerReferencePresentation;
  targetReference: WaveScannerReferencePresentation;
  rr: { status: WaveScannerLayerStatus; value: number | null };
  tradeEvaluation: WaveScannerTradeEvaluationPresentation;
  readyForFurtherEvaluation: boolean;
  displayStatus: string;
  blockerStage: string | null;
  blockerReason: string | null;
  futureSafe: boolean;
  loadError: string | null;
  details: WaveScannerRowDetailsPresentation;
}

export interface WaveScannerReportPresentation {
  schemaVersion: typeof WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION;
  timeframe: string;
  generatedAt: string;
  rows: WaveScannerRowPresentation[];
  symbolErrors: Array<{ symbol: string; message: string }>;
}
