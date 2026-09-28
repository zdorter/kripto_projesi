import {
  TrendDirection,
  WaveAnalysis,
  WaveCandidate,
  WaveLabel,
  WaveStatus,
} from "./types";

export type StructureKind = "IMPULSE" | "CORRECTIVE";
export type ScenarioKind = "SELECTED" | "RIVAL";
export type TrendAlignment = "ALIGNED" | "CONFLICTING" | "NEUTRAL_CONTEXT";
export type ScoreDisclaimer = "RULE_CONFORMANCE_NOT_PROBABILITY";
export type InvalidationReason = "WAVE2_BREAK" | "OTHER";

const IMPULSE_LABELS: WaveLabel[] = ["1", "2", "3", "4", "5"];
const CORRECTIVE_LABELS: WaveLabel[] = ["A", "B", "C"];

const STATUS_RANK: Record<WaveStatus, number> = {
  CONFIRMED: 2,
  POTENTIAL: 1,
  INVALIDATED: 0,
};

export interface PresentationMappingContext {
  /** From `WaveDetectionResult.impulseBullish` — not present on `WaveAnalysis`. */
  impulseBullish: boolean;
}

export interface WaveLegView {
  structure: StructureKind;
  scenario: ScenarioKind;
  label: WaveLabel;
  startIndex: number;
  endIndex: number;
  status: WaveStatus;
  confidence: number;
  structureConflict?: boolean;
  invalidationPrice?: number;
}

export interface LeadingLegView {
  label: WaveLabel;
  status: WaveStatus;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface ScopedInvalidationView {
  structure: StructureKind;
  scenario: ScenarioKind;
  wave: WaveLabel;
  price: number;
  reason: InvalidationReason;
}

export interface StructureTrackView {
  kind: StructureKind;
  scenario: ScenarioKind;
  countDirection: "BULLISH" | "BEARISH";
  legs: WaveLegView[];
  leading: LeadingLegView | null;
  structureConformanceScore: number;
  invalidation: ScopedInvalidationView | null;
}

export interface SegmentOverlapLegView {
  structure: StructureKind;
  scenario: ScenarioKind;
  label: WaveLabel;
  status: WaveStatus;
}

export interface SegmentOverlapView {
  startIndex: number;
  endIndex: number;
  legs: SegmentOverlapLegView[];
}

export interface FocusView {
  structure: StructureKind;
  scenario: "SELECTED" | "SELECTED_ALTERNATIVE";
  wave: WaveLabel;
  status: WaveStatus;
  confidence: number;
  startIndex: number;
  endIndex: number;
  invalidationPrice?: number;
  selectionReason: string;
}

export interface WavePresentationState {
  schemaVersion: "1.0";
  marketTrend: TrendDirection;
  ruleConformanceScore: number;
  scoreDisclaimer: ScoreDisclaimer;
  trendContext: {
    alignment: TrendAlignment;
    note?: string;
  };
  primary: FocusView | null;
  alternative: FocusView | null;
  tracks: {
    selectedImpulse: StructureTrackView;
    corrective: StructureTrackView | null;
    rivalImpulse: StructureTrackView | null;
  };
  overlaps: SegmentOverlapView[];
  engine: {
    currentWaveLegacy?: WaveLabel;
    flatWaves: WaveCandidate[];
  };
}

function isImpulseLabel(label: WaveLabel): boolean {
  return IMPULSE_LABELS.includes(label);
}

function isCorrectiveLabel(label: WaveLabel): boolean {
  return CORRECTIVE_LABELS.includes(label);
}

function labelRank(structure: StructureKind, label: WaveLabel): number {
  if (structure === "IMPULSE") {
    return Number(label);
  }
  const ranks: Record<string, number> = { A: 1, B: 2, C: 3 };
  return ranks[label] ?? 0;
}

function toLegView(
  wave: WaveCandidate,
  structure: StructureKind,
  scenario: ScenarioKind
): WaveLegView {
  return {
    structure,
    scenario,
    label: wave.label,
    startIndex: wave.startIndex,
    endIndex: wave.endIndex,
    status: wave.status,
    confidence: wave.confidence,
    structureConflict: wave.structureConflict,
    invalidationPrice: wave.invalidationPrice,
  };
}

function selectLeadingLeg(
  legs: WaveLegView[],
  structure: StructureKind
): LeadingLegView | null {
  const candidates = legs.filter((l) => l.status !== "INVALIDATED");
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((a, b) => {
    if (b.endIndex !== a.endIndex) {
      return b.endIndex - a.endIndex;
    }
    if (STATUS_RANK[b.status] !== STATUS_RANK[a.status]) {
      return STATUS_RANK[b.status] - STATUS_RANK[a.status];
    }
    return labelRank(structure, b.label) - labelRank(structure, a.label);
  });
  const top = sorted[0];
  return {
    label: top.label,
    status: top.status,
    confidence: top.confidence,
    startIndex: top.startIndex,
    endIndex: top.endIndex,
  };
}

function compareLeadingForFocus(a: LeadingLegView, b: LeadingLegView): number {
  if (a.endIndex !== b.endIndex) {
    return a.endIndex - b.endIndex;
  }
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  return a.confidence - b.confidence;
}

function invalidationForTrack(
  legs: WaveLegView[],
  structure: StructureKind,
  scenario: ScenarioKind
): ScopedInvalidationView | null {
  const w2Invalid = legs.find(
    (l) =>
      l.label === "2" &&
      l.status === "INVALIDATED" &&
      l.invalidationPrice !== undefined
  );
  if (w2Invalid?.invalidationPrice !== undefined) {
    return {
      structure,
      scenario,
      wave: "2",
      price: w2Invalid.invalidationPrice,
      reason: "WAVE2_BREAK",
    };
  }
  const any = legs.find((l) => l.invalidationPrice !== undefined);
  if (any?.invalidationPrice !== undefined) {
    return {
      structure,
      scenario,
      wave: any.label,
      price: any.invalidationPrice,
      reason: "OTHER",
    };
  }
  return null;
}

function buildTrack(
  waves: WaveCandidate[],
  kind: StructureKind,
  scenario: ScenarioKind,
  countDirection: "BULLISH" | "BEARISH",
  structureConformanceScore: number
): StructureTrackView {
  const legs = waves.map((w) => toLegView(w, kind, scenario));
  return {
    kind,
    scenario,
    countDirection,
    legs,
    leading: selectLeadingLeg(legs, kind),
    structureConformanceScore,
    invalidation: invalidationForTrack(legs, kind, scenario),
  };
}

function segmentKey(startIndex: number, endIndex: number): string {
  return `${startIndex}:${endIndex}`;
}

function buildOverlaps(
  impulseLegs: WaveLegView[],
  correctiveLegs: WaveLegView[]
): SegmentOverlapView[] {
  const map = new Map<string, SegmentOverlapLegView[]>();

  for (const leg of impulseLegs) {
    const key = segmentKey(leg.startIndex, leg.endIndex);
    const list = map.get(key) ?? [];
    list.push({
      structure: leg.structure,
      scenario: leg.scenario,
      label: leg.label,
      status: leg.status,
    });
    map.set(key, list);
  }

  for (const leg of correctiveLegs) {
    const key = segmentKey(leg.startIndex, leg.endIndex);
    const list = map.get(key) ?? [];
    list.push({
      structure: leg.structure,
      scenario: leg.scenario,
      label: leg.label,
      status: leg.status,
    });
    map.set(key, list);
  }

  const overlaps: SegmentOverlapView[] = [];
  for (const [key, legs] of map) {
    if (legs.length < 2) {
      continue;
    }
    const [startIndex, endIndex] = key.split(":").map(Number);
    overlaps.push({ startIndex, endIndex, legs });
  }

  overlaps.sort((a, b) => a.startIndex - b.startIndex);
  return overlaps;
}

function buildTrendContext(
  trend: TrendDirection,
  impulseBullish: boolean
): WavePresentationState["trendContext"] {
  if (trend === "NEUTRAL") {
    return {
      alignment: "NEUTRAL_CONTEXT",
      note: "Market trend is NEUTRAL; impulse count direction is evaluated separately.",
    };
  }
  const aligned =
    (impulseBullish && trend === "BULLISH") ||
    (!impulseBullish && trend === "BEARISH");
  if (aligned) {
    return {
      alignment: "ALIGNED",
      note: "Swing-based market trend matches selected impulse count direction.",
    };
  }
  return {
    alignment: "CONFLICTING",
    note: "Swing-based market trend differs from selected impulse count direction.",
  };
}

function leadingToFocus(
  structure: StructureKind,
  leading: LeadingLegView,
  scenario: FocusView["scenario"],
  trackInvalidation: ScopedInvalidationView | null,
  selectionReason: string
): FocusView {
  const inv =
    trackInvalidation?.wave === leading.label
      ? trackInvalidation.price
      : undefined;
  return {
    structure,
    scenario,
    wave: leading.label,
    status: leading.status,
    confidence: leading.confidence,
    startIndex: leading.startIndex,
    endIndex: leading.endIndex,
    invalidationPrice: inv,
    selectionReason,
  };
}

function selectFocusPair(
  impulseTrack: StructureTrackView,
  correctiveTrack: StructureTrackView | null
): { primary: FocusView | null; alternative: FocusView | null } {
  const impulseLead = impulseTrack.leading;
  const corrLead = correctiveTrack?.leading ?? null;

  if (!impulseLead && !corrLead) {
    return { primary: null, alternative: null };
  }
  if (impulseLead && !corrLead) {
    return {
      primary: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED",
        impulseTrack.invalidation,
        "Only SELECTED impulse track has a leading leg."
      ),
      alternative: null,
    };
  }
  if (!impulseLead && corrLead && correctiveTrack) {
    return {
      primary: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED",
        correctiveTrack.invalidation,
        "Only corrective track has a leading leg."
      ),
      alternative: null,
    };
  }

  if (!impulseLead || !corrLead || !correctiveTrack) {
    return { primary: null, alternative: null };
  }

  const cmp = compareLeadingForFocus(impulseLead, corrLead);
  if (cmp > 0) {
    return {
      primary: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED",
        impulseTrack.invalidation,
        "Impulse leading leg is ahead by endIndex, status, or confidence (no global structure bias)."
      ),
      alternative: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED_ALTERNATIVE",
        correctiveTrack.invalidation,
        "Corrective leading leg is the paired focus on the other structure track."
      ),
    };
  }
  if (cmp < 0) {
    return {
      primary: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED",
        correctiveTrack.invalidation,
        "Corrective leading leg is ahead by endIndex, status, or confidence (no global structure bias)."
      ),
      alternative: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED_ALTERNATIVE",
        impulseTrack.invalidation,
        "Impulse leading leg is the paired focus on the other structure track."
      ),
    };
  }

  return {
    primary: leadingToFocus(
      "CORRECTIVE",
      corrLead,
      "SELECTED",
      correctiveTrack.invalidation,
      "Tie on endIndex, status, and confidence; corrective chosen as primary by stable tie-break."
    ),
    alternative: leadingToFocus(
      "IMPULSE",
      impulseLead,
      "SELECTED_ALTERNATIVE",
      impulseTrack.invalidation,
      "Tie on endIndex, status, and confidence; impulse is paired alternative focus."
    ),
  };
}

export function mapToPresentationState(
  analysis: WaveAnalysis,
  context: PresentationMappingContext
): WavePresentationState {
  const impulseWaves = analysis.waves.filter((w) => isImpulseLabel(w.label));
  const correctiveWaves = analysis.waves.filter((w) =>
    isCorrectiveLabel(w.label)
  );

  const rivalWaves = analysis.alternativeScenarios[0] ?? null;
  const rivalScore = Math.round(analysis.confidence * 0.85);

  const countDirection: "BULLISH" | "BEARISH" = context.impulseBullish
    ? "BULLISH"
    : "BEARISH";

  const selectedImpulse = buildTrack(
    impulseWaves,
    "IMPULSE",
    "SELECTED",
    countDirection,
    analysis.confidence
  );

  const corrective =
    correctiveWaves.length > 0
      ? buildTrack(
          correctiveWaves,
          "CORRECTIVE",
          "SELECTED",
          countDirection,
          analysis.confidence
        )
      : null;

  const rivalImpulse =
    rivalWaves && rivalWaves.length > 0
      ? buildTrack(
          rivalWaves,
          "IMPULSE",
          "RIVAL",
          context.impulseBullish ? "BEARISH" : "BULLISH",
          rivalScore
        )
      : null;

  const overlaps = buildOverlaps(selectedImpulse.legs, corrective?.legs ?? []);

  const { primary, alternative } = selectFocusPair(selectedImpulse, corrective);

  return {
    schemaVersion: "1.0",
    marketTrend: analysis.trend,
    ruleConformanceScore: analysis.confidence,
    scoreDisclaimer: "RULE_CONFORMANCE_NOT_PROBABILITY",
    trendContext: buildTrendContext(analysis.trend, context.impulseBullish),
    primary,
    alternative,
    tracks: {
      selectedImpulse,
      corrective,
      rivalImpulse,
    },
    overlaps,
    engine: {
      currentWaveLegacy: analysis.currentWave,
      flatWaves: analysis.waves,
    },
  };
}
