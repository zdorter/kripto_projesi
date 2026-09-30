/**
 * First-class open structural leg (14N-G) — not a WaveCandidate, pivot, target, or signal.
 */

export type OpenStructuralLegAnchorSource =
  | "HISTORICAL_SETUP_ENDPOINT"
  | "SCENARIO_FOCUS_ENDPOINT"
  | "CONFIRMED_SWING";

export type OpenStructuralLegAnchorKind = "HIGH" | "LOW" | "STRUCTURAL_ENDPOINT";

export type ObservedDirection = "BULLISH" | "BEARISH" | "UNRESOLVED";

export type OpenStructuralLegStatus =
  | "AVAILABLE"
  | "NO_ANCHOR"
  | "AMBIGUOUS_ANCHOR"
  | "NO_OBSERVED_SPAN"
  | "INSUFFICIENT_CONTEXT";

export type OpenStructuralLegAnchorSelection =
  | "SELECTED"
  | "NO_SELECTION"
  | "AMBIGUOUS";

export interface OpenStructuralLegAnchorCandidate {
  anchorIndex: number;
  anchorPrice: number;
  /** Primary structural characterization; provenance is in sources[]. */
  anchorKind: OpenStructuralLegAnchorKind;
  sources: OpenStructuralLegAnchorSource[];
  futureSafe: boolean;
}

export interface OpenStructuralLeg {
  /** Confirmed structural anchor index (not an open pivot). */
  anchorIndex: number;
  anchorPrice: number;
  anchorKind: OpenStructuralLegAnchorKind;
  selectedAnchorSources: OpenStructuralLegAnchorSource[];
  /** Observation end — closed evaluation bar; not a pivot. */
  observationEndIndex: number;
  evaluationBarIndex: number;
  /** Evaluation candle close — not objective target or entry signal. */
  evaluationPrice: number;
  observedHigh: number;
  observedLow: number;
  observedDirection: ObservedDirection;
  state: "IN_PROGRESS";
  observationSpanBars: number;
  futureSafe: boolean;
  evidence: string[];

  /** @deprecated Use anchorIndex — retained for 14N-E consumers. */
  startIndex: number;
  /** @deprecated Use anchorPrice */
  startPrice: number | null;
  /** @deprecated Use observedDirection */
  direction: ObservedDirection;
}

export interface OpenStructuralLegResolution {
  status: OpenStructuralLegStatus;
  anchorSelection: OpenStructuralLegAnchorSelection;
  anchorCandidates: OpenStructuralLegAnchorCandidate[];
  selectedAnchorSource: OpenStructuralLegAnchorSource | null;
  leg: OpenStructuralLeg | null;
  observationSpanBars: number;
  futureSafe: boolean;
  reasons: string[];
}

export type OpenLegComparisonVerdict =
  | "LEGACY_ONLY"
  | "FIRST_CLASS_ONLY"
  | "BOTH_AGREE"
  | "DIVERGENT"
  | "NEITHER";

export interface OpenLegPathComparison {
  legacyPotentialOpenSpan: boolean;
  firstClassOpenLegAvailable: boolean;
  verdict: OpenLegComparisonVerdict;
  notes: string[];
}

export type OpenMovementVerdict =
  | "OPEN_MOVEMENT_OBSERVED"
  | "NO_OPEN_MOVEMENT";

export type StructuralTransitionVerdict =
  | "STRUCTURAL_TRANSITION_OBSERVED"
  | "NO_STRUCTURAL_TRANSITION";
