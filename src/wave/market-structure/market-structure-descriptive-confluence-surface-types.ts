import type { MarketStructure, TrendDirection } from "../types";
import type { ClassifiedStructureEvent } from "./market-structure-break-types";
import type { LiquidityInteractionEvent } from "./market-structure-liquidity-interaction-types";
import type { AdvancedLiquidityInteractionEvent } from "./market-structure-liquidity-advanced-interaction-types";
import type { LiquidityPoolLifecycleProjection } from "./market-structure-liquidity-lifecycle-derivation";
import type { LiquidityStructureAssociation } from "./market-structure-liquidity-structure-association-types";
import type { MarketStructureMssEvent } from "./market-structure-mss-types";
import type {
  ProtectedLevelCandidate,
  UnresolvedProtectedReason,
} from "./market-structure-types";
import type {
  BslCandidate,
  EqualHighObservation,
  EqualLowObservation,
  LiquidityPoolCandidate,
  SslCandidate,
} from "./market-structure-liquidity-types";
import type { CrossTfEventOrderingRelation } from "./market-structure-mtf-event-ordering-types";
import type { HtfLiquidityLtfStructureAssociation } from "./market-structure-htf-liquidity-ltf-structure-association-types";
import type { MarketStructureMtfMssAssociation } from "./market-structure-mtf-mss-association-types";
import type { MtfStructureStateAlignment } from "./market-structure-mtf-structure-alignment-types";
import type {
  MtfLiquidityLifecycleAlignment,
  MtfLiquiditySideAlignment,
  LiquiditySideProfile,
} from "./market-structure-mtf-liquidity-alignment-types";
import type {
  MarketStructureMtfEventOrderingContext,
  MtfEventOrderingHtfSourceTrack,
} from "./market-structure-mtf-event-ordering-types";
import type { BuildMarketStructureSnapshotAtBarInput } from "./market-structure-types";
import type { Candle } from "../types";
import type { MarketStructureHtfLiquidityLtfStructureAssociationContext } from "./market-structure-htf-liquidity-ltf-structure-association-types";
import type { MarketStructureMtfStructureAlignmentContext } from "./market-structure-mtf-structure-alignment-types";
import type { MarketStructureMtfLiquidityAlignmentContext } from "./market-structure-mtf-liquidity-alignment-types";
import type { MarketStructureMtfMssAssociationContext } from "./market-structure-mtf-mss-association-types";
import type {
  ConfluencePresentationStatus,
  ConfluenceSurfacePresentationTaxonomy,
  NativeHtfResearchPresentationStatus,
} from "./market-structure-presentation-taxonomy-types";

export const MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION =
  "1.0" as const;

export const MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID =
  "MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_V1" as const;

export type TimeframeEstablishmentStatus = "ACTIVE" | "NOT_ESTABLISHED";

export interface ConfluenceSurfaceTimeframeStatus {
  timeframeId: string;
  status: TimeframeEstablishmentStatus;
}

export interface ConfluenceSurfaceStructureSection {
  highStructure: readonly MarketStructure[];
  lowStructure: readonly MarketStructure[];
  structurePairCount: number;
  zigzagSpineCount: number;
  internalStructureCount: number;
  externalStructureCount: number;
  bosEvents: readonly ClassifiedStructureEvent[];
  chochEvents: readonly ClassifiedStructureEvent[];
}

export interface ConfluenceSurfaceProtectedSection {
  protectedHighs: readonly ProtectedLevelCandidate[];
  protectedLows: readonly ProtectedLevelCandidate[];
  unresolved: readonly UnresolvedProtectedReason[];
  trendContext: TrendDirection;
}

export interface ConfluenceSurfaceLiquidityFoundationSection {
  bslCandidates: readonly BslCandidate[];
  sslCandidates: readonly SslCandidate[];
  equalHighObservations: readonly EqualHighObservation[];
  equalLowObservations: readonly EqualLowObservation[];
  liquidityPools: readonly LiquidityPoolCandidate[];
}

export interface ConfluenceSurfaceLiquidityEventsSection {
  wickTouches: readonly LiquidityInteractionEvent[];
  advancedEvents: readonly AdvancedLiquidityInteractionEvent[];
  lifecycleProjections: readonly LiquidityPoolLifecycleProjection[];
}

export interface ConfluenceSurfaceMssSection {
  researchOnly: true;
  events: readonly MarketStructureMssEvent[];
  trendContext: TrendDirection;
}

export interface ConfluenceSurfaceSameTfAssociationsSection {
  liquidityStructureAssociations: readonly LiquidityStructureAssociation[];
}

export interface ConfluenceSurfaceTimeframeResearchMetadata {
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  limitationCount: number;
}

export interface ConfluenceSurfaceTimeframeSurface {
  timeframeId: string;
  status: "ACTIVE";
  structure: ConfluenceSurfaceStructureSection;
  protected: ConfluenceSurfaceProtectedSection;
  liquidity: ConfluenceSurfaceLiquidityFoundationSection;
  events: ConfluenceSurfaceLiquidityEventsSection;
  mss: ConfluenceSurfaceMssSection;
  sameTfAssociations: ConfluenceSurfaceSameTfAssociationsSection;
  researchMetadata: ConfluenceSurfaceTimeframeResearchMetadata;
}

export interface ConfluenceSurfaceStructureAlignmentView {
  state: MtfStructureStateAlignment;
  ltfTrendContext: TrendDirection | null;
  htfTrendContext: TrendDirection | null;
  evidenceTag: "DESCRIPTIVE_MTF_STRUCTURE_STATE";
}

export interface ConfluenceSurfaceLiquidityAlignmentView {
  sideAlignment: MtfLiquiditySideAlignment;
  lifecycleAlignment: MtfLiquidityLifecycleAlignment;
  ltfSideProfile: LiquiditySideProfile | null;
  htfSideProfile: LiquiditySideProfile | null;
  evidenceTag: "DESCRIPTIVE_MTF_LIQUIDITY_STATE";
}

export interface ConfluenceSurfaceEventOrderingSummary {
  relationCount: number;
  evaluationRelationCount: number;
  htfEventFamilyCounts: Readonly<Record<string, number>>;
  ltfEventFamilyCounts: Readonly<Record<string, number>>;
  representativeEvaluationRelations: readonly CrossTfEventOrderingRelation[];
  replayRelations?: readonly CrossTfEventOrderingRelation[];
}

export interface ConfluenceSurfaceEvaluationMetadata {
  ltfEvaluationTimestamp: number;
  htfEvaluationTimestamp: number | null;
  horizonBars: number;
}

export interface ConfluenceSurfaceMtfPanel {
  htfTimeframeId: string;
  ltfTimeframeId: string;
  htfSourceTrack: MtfEventOrderingHtfSourceTrack;
  structureAlignment: ConfluenceSurfaceStructureAlignmentView | null;
  liquidityAlignment: ConfluenceSurfaceLiquidityAlignmentView | null;
  eventOrdering: ConfluenceSurfaceEventOrderingSummary | null;
  liquidityToStructureAssociations: readonly HtfLiquidityLtfStructureAssociation[];
  structureToMssAssociations: readonly MarketStructureMtfMssAssociation[];
  evaluationMetadata: ConfluenceSurfaceEvaluationMetadata | null;
  unresolved: readonly ConfluenceSurfaceSourcedUnresolved[];
}

export interface ConfluenceSurfaceSourcedUnresolved {
  sourceContext: string;
  code: string;
  message: string;
}

export interface MarketStructureDescriptiveConfluenceSurfaceContext {
  schemaVersion: typeof MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION;
  ruleId: typeof MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID;
  timeframeStatus: readonly ConfluenceSurfaceTimeframeStatus[];
  timeframeSurfaces: readonly ConfluenceSurfaceTimeframeSurface[];
  mtfPanel: ConfluenceSurfaceMtfPanel | null;
  researchFlags: readonly string[];
  limitations: readonly string[];
  unresolved: readonly ConfluenceSurfaceSourcedUnresolved[];
  /** Derived presentation taxonomy; flat `limitations` unchanged. */
  presentationTaxonomy: ConfluenceSurfacePresentationTaxonomy;
  nativeHtfResearchPresentation: NativeHtfResearchPresentationStatus;
  confluencePresentationStatus: ConfluencePresentationStatus;
}

export interface DescriptiveConfluenceTimeframeInput {
  timeframeId: string;
  candles: readonly Candle[];
  evaluationBarIndex: number;
}

export interface DescriptiveConfluencePrebuiltContexts {
  mtfStructureAlignment?: MarketStructureMtfStructureAlignmentContext;
  mtfLiquidityAlignment?: MarketStructureMtfLiquidityAlignmentContext;
  mtfEventOrdering?: MarketStructureMtfEventOrderingContext;
  htfLiquidityLtfStructure?: MarketStructureHtfLiquidityLtfStructureAssociationContext;
  mtfMssAssociation?: MarketStructureMtfMssAssociationContext;
}

export interface BuildMarketStructureDescriptiveConfluenceSurfaceContextInput {
  timeframeInputs: readonly DescriptiveConfluenceTimeframeInput[];
  ltfTimeframeId?: string;
  htfTimeframeId?: string;
  horizonBars?: number;
  swingConfig?: BuildMarketStructureSnapshotAtBarInput["swingConfig"];
  htfSourceTrack?: MtfEventOrderingHtfSourceTrack;
  includeReplayRelations?: boolean;
  prebuiltContexts?: DescriptiveConfluencePrebuiltContexts;
}
