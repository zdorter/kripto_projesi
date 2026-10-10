import type { MarketStructureDescriptiveConfluenceSurfaceContext } from "../wave/market-structure/market-structure-descriptive-confluence-surface-types";
import type {
  ConfluenceSurfacePresentationTaxonomy,
  NativeHtfResearchPresentationStatus,
} from "../wave/market-structure/market-structure-presentation-taxonomy-types";

export type MarketStructureUiDataMode = "LIVE" | "DEMO";

export type MarketStructureUiLoadStatus =
  | "ready"
  | "demo_unavailable"
  | "error"
  | "loading";

export interface MarketStructureUiCompactRow {
  id: string;
  summary: string;
}

export interface MarketStructureUiProtectedCandidateRow {
  index: number;
  price: string;
  pivotIndex: number;
  statusAtE: string;
  type: string;
}

export interface MarketStructureUiStructureEventsSummary {
  bosCount: number;
  chochCount: number;
  bosRows: readonly MarketStructureUiCompactRow[];
  chochRows: readonly MarketStructureUiCompactRow[];
}

export interface MarketStructureUiTimeframeCard {
  timeframeId: string;
  trendContext: string;
  highStructure: readonly string[];
  lowStructure: readonly string[];
  structurePairCount: number;
  zigzagSpineCount: number;
  internalStructureCount: number;
  externalStructureCount: number;
  structureEvents: MarketStructureUiStructureEventsSummary;
  protectedHighs: readonly MarketStructureUiProtectedCandidateRow[];
  protectedLows: readonly MarketStructureUiProtectedCandidateRow[];
  multipleProtectedHighs: boolean;
  multipleProtectedLows: boolean;
  bslCount: number;
  sslCount: number;
  eqhCount: number;
  eqlCount: number;
  poolCount: number;
  wickTouchCount: number;
  sweepCount: number;
  takenCount: number;
  reclaimCount: number;
  lifecycleCounts: Readonly<Record<string, number>>;
  mssEventRows: readonly MarketStructureUiCompactRow[];
  mssCount: number;
  sameTfAssociationCount: number;
  sameTfAssociationRows: readonly MarketStructureUiCompactRow[];
  evaluationBarIndex: number;
  evaluationTimestampUtc: string;
}

export interface MarketStructureUiMtfSummary {
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfSourceTrack: string;
  structureAlignment: string | null;
  liquiditySideAlignment: string | null;
  liquidityLifecycleAlignment: string | null;
  relationCount: number;
  evaluationRelationCount: number;
  htfEventFamilyCounts: Readonly<Record<string, number>>;
  ltfEventFamilyCounts: Readonly<Record<string, number>>;
  representativeRelationRows: readonly MarketStructureUiCompactRow[];
  replayRelationRows: readonly MarketStructureUiCompactRow[] | null;
  liquidityToStructureCount: number;
  liquidityToStructureRows: readonly MarketStructureUiCompactRow[];
  structureToMssCount: number;
  structureToMssRows: readonly MarketStructureUiCompactRow[];
  ltfEvaluationTimestampUtc: string | null;
  htfEvaluationTimestampUtc: string | null;
}

/** Tier 1 — default user-useful MTF fields (no association/ordering detail rows). */
export interface MarketStructureUiMtfTier1Summary {
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfSourceTrack: string;
  structureAlignment: string | null;
  liquiditySideAlignment: string | null;
  liquidityLifecycleAlignment: string | null;
  ltfEvaluationTimestampUtc: string | null;
  htfEvaluationTimestampUtc: string | null;
}

/** Tier 2 — research/debug MTF detail. */
export interface MarketStructureUiMtfTier2Summary {
  relationCount: number;
  evaluationRelationCount: number;
  htfEventFamilyCounts: Readonly<Record<string, number>>;
  ltfEventFamilyCounts: Readonly<Record<string, number>>;
  representativeRelationRows: readonly MarketStructureUiCompactRow[];
  replayRelationRows: readonly MarketStructureUiCompactRow[] | null;
  liquidityToStructureCount: number;
  liquidityToStructureRows: readonly MarketStructureUiCompactRow[];
  structureToMssCount: number;
  structureToMssRows: readonly MarketStructureUiCompactRow[];
  /** Temporal ordering only — not causality or trade confirmation. */
  orderingPresentationNote: "TEMPORAL_ORDERING_ONLY";
  /** Descriptive association — not setup sequence or trade confirmation. */
  associationPresentationNote: "DESCRIPTIVE_ASSOCIATION_ONLY";
}

export interface MarketStructureUiTimeframeTier1Card {
  timeframeId: string;
  trendContext: string;
  highStructure: readonly string[];
  lowStructure: readonly string[];
  structurePairCount: number;
  bosCount: number;
  chochCount: number;
  protectedHighs: readonly MarketStructureUiProtectedCandidateRow[];
  protectedLows: readonly MarketStructureUiProtectedCandidateRow[];
  multipleProtectedHighs: boolean;
  multipleProtectedLows: boolean;
  bslCount: number;
  sslCount: number;
  eqhCount: number;
  eqlCount: number;
  poolCount: number;
}

export interface MarketStructureUiTimeframeTier2Card {
  timeframeId: string;
  zigzagSpineCount: number;
  internalStructureCount: number;
  externalStructureCount: number;
  structureEvents: MarketStructureUiStructureEventsSummary;
  wickTouchCount: number;
  sweepCount: number;
  takenCount: number;
  reclaimCount: number;
  lifecycleCounts: Readonly<Record<string, number>>;
  /** MSS research-only — not a trading signal or direction. */
  mssPresentationNote: "MSS_RESEARCH_ONLY_NOT_SIGNAL";
  mssEventRows: readonly MarketStructureUiCompactRow[];
  mssCount: number;
  sameTfAssociationCount: number;
  sameTfAssociationRows: readonly MarketStructureUiCompactRow[];
  evaluationBarIndex: number;
  evaluationTimestampUtc: string;
}

export interface MarketStructureUiScenarioCard {
  role: "PRIMARY" | "ALTERNATIVE";
  scenarioTypeLabel: string;
  statusLabel: string;
  htfTrend: string | null;
  ltfTrend: string | null;
  observedEvidence: readonly string[];
  requiredTransitions: readonly string[];
  structuralInvalidationLabel: string;
  structuralInvalidationNote: string;
  liquiditySummary: string;
  liquidityInteractionFamilies: readonly string[];
  interpretation: string;
}

export interface MarketStructureUiScenarioInterpretationPanel {
  schemaVersion: string;
  globalDisclaimer: string;
  researchOnlyBanner: string;
  primary: MarketStructureUiScenarioCard | null;
  alternative: MarketStructureUiScenarioCard | null;
  globalInterpretation: string;
  limitations: readonly string[];
}

export interface MarketStructureUiTier1Presentation {
  timeframeCards: {
    fourH: MarketStructureUiTimeframeTier1Card | null;
    oneH: MarketStructureUiTimeframeTier1Card | null;
  };
  mtfSummary: MarketStructureUiMtfTier1Summary | null;
  scenarioInterpretation: MarketStructureUiScenarioInterpretationPanel | null;
  coreLimitations: readonly string[];
  coreResearchDisclaimer: string;
  unresolved: readonly MarketStructureUiUnresolvedRow[];
  nativeHtfResearchPresentation: NativeHtfResearchPresentationStatus;
  confluencePresentationStatus: "DESCRIPTIVE_CONFLUENCE_ONLY";
}

export interface MarketStructureUiTier2Presentation {
  timeframeCards: {
    fourH: MarketStructureUiTimeframeTier2Card | null;
    oneH: MarketStructureUiTimeframeTier2Card | null;
  };
  mtfSummary: MarketStructureUiMtfTier2Summary | null;
  researchPresentationFlags: readonly string[];
  technicalLimitations: readonly string[];
  limitations: readonly string[];
  debugDetailLines: readonly string[];
}

export interface MarketStructureUiUnresolvedRow {
  sourceContext: string;
  code: string;
  message: string;
}

export interface MarketStructureUiViewModel {
  loadStatus: MarketStructureUiLoadStatus;
  symbol: string;
  dataMode: MarketStructureUiDataMode;
  demoUnavailableMessage: string | null;
  errorMessage: string | null;
  researchFlags: readonly string[];
  limitations: readonly string[];
  presentationTaxonomy: ConfluenceSurfacePresentationTaxonomy | null;
  evaluationLtfUtc: string | null;
  evaluationHtfUtc: string | null;
  fifteenMStatus: "NOT_ESTABLISHED";
  /** Full card (backward compatible); prefer tier1/tier2 for UI layout. */
  timeframeCards: {
    fourH: MarketStructureUiTimeframeCard | null;
    oneH: MarketStructureUiTimeframeCard | null;
  };
  mtfSummary: MarketStructureUiMtfSummary | null;
  tier1: MarketStructureUiTier1Presentation | null;
  tier2: MarketStructureUiTier2Presentation | null;
  scenarioInterpretation: MarketStructureUiScenarioInterpretationPanel | null;
  unresolved: readonly MarketStructureUiUnresolvedRow[];
  debugDetailLines: readonly string[];
  forbiddenTokenScan: { ok: true };
}

export interface PresentMarketStructureUiInput {
  surface: MarketStructureDescriptiveConfluenceSurfaceContext | null;
  symbol: string;
  dataMode: MarketStructureUiDataMode;
  loadStatus: MarketStructureUiLoadStatus;
  demoUnavailableMessage?: string | null;
  errorMessage?: string | null;
  includeReplayRelations?: boolean;
}

export function assertNoForbiddenTradingTokens(payload: string): void {
  const forbidden = [
    '"BUY"',
    '"SELL"',
    '"LONG"',
    '"SHORT"',
    '"ENTRY"',
    '"EXIT"',
    '"SIGNAL"',
    '"confluenceScore"',
    '"probability"',
    '"signalStrength"',
    '"causedBy"',
    '"triggeredBy"',
    '"caused"',
    '"led to"',
    '"confirmed trade"',
  ];
  for (const token of forbidden) {
    if (payload.includes(token)) {
      throw new Error(`forbidden token in UI view-model: ${token}`);
    }
  }
}
