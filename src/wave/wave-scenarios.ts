import type { MultiTimeframeWaveState, TimeframeWaveBundle } from "./multi-timeframe";
import type { WaveHierarchyReport } from "./wave-hierarchy";
import type {
  FocusView,
  ScenarioKind,
  StructureKind,
  StructureTrackView,
  WavePresentationState,
} from "./presentation-state";
import type { WaveCandidate, WaveLabel, WaveStatus } from "./types";

export type ScenarioLifecycleStatus =
  | "ACTIVE"
  | "INVALIDATED"
  | "INSUFFICIENT_CONTEXT";

export type ScenarioRole = "PRIMARY" | "ALTERNATIVE" | "CANDIDATE";

export type InvalidationSource =
  | "TRACK_SCOPE"
  | "FOCUS_LEG"
  | "WAVE_CANDIDATE"
  | "NONE";

export interface ScenarioInvalidationView {
  available: boolean;
  price?: number;
  structure?: StructureKind;
  scenario?: ScenarioKind | FocusView["scenario"];
  wave?: WaveLabel;
  reason?: string;
  rule: string;
  source: InvalidationSource;
}

export interface WaveScenario {
  id: string;
  role: ScenarioRole;
  structure: StructureKind;
  waveLabel: WaveLabel;
  engineStatus?: WaveStatus;
  status: ScenarioLifecycleStatus;
  confidence: number;
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  invalidation: ScenarioInvalidationView;
  evidence: string[];
  limitations: string[];
}

export interface WaveScenarioReport {
  schemaVersion: "1.0";
  timeframeId: string;
  symbol?: string;
  scenarios: WaveScenario[];
}

export interface WaveScenarioBuildOptions {
  symbol?: string;
  multiTimeframe?: MultiTimeframeWaveState;
  hierarchy?: WaveHierarchyReport;
}

export interface WaveScenarioSet {
  higher: WaveScenarioReport;
  lower: WaveScenarioReport;
}

const STANDARD_LIMITATIONS = [
  "Scenario confidence reflects engine rule-conformance weighting, not probability.",
  "Scenarios are not ranked, selected, or promoted as trade signals.",
  "No entry, stop-loss, take-profit, or leverage is derived from this layer.",
];

function structureForLabel(label: WaveLabel): StructureKind {
  return ["1", "2", "3", "4", "5"].includes(label) ? "IMPULSE" : "CORRECTIVE";
}

function trackForFocus(
  presentation: WavePresentationState,
  focus: FocusView
): StructureTrackView | null {
  if (focus.structure === "IMPULSE") {
    return presentation.tracks.selectedImpulse;
  }
  return presentation.tracks.corrective;
}

function invalidationRuleFromScoped(
  inv: NonNullable<StructureTrackView["invalidation"]>
): string {
  if (inv.reason === "WAVE2_BREAK") {
    return `Track-scoped invalidation: Wave 2 break on ${inv.structure} ${inv.scenario} (price ${inv.price}).`;
  }
  return `Track-scoped invalidation on ${inv.structure} ${inv.scenario} Wave ${inv.wave} (price ${inv.price}).`;
}

export function resolveScenarioInvalidation(
  presentation: WavePresentationState,
  focus: FocusView | null,
  wave: WaveCandidate | null
): ScenarioInvalidationView {
  if (focus) {
    const track = trackForFocus(presentation, focus);
    const scoped = track?.invalidation;
    if (scoped) {
      return {
        available: true,
        price: scoped.price,
        structure: scoped.structure,
        scenario: scoped.scenario,
        wave: scoped.wave,
        reason: scoped.reason,
        rule: invalidationRuleFromScoped(scoped),
        source: "TRACK_SCOPE",
      };
    }
    if (focus.invalidationPrice !== undefined) {
      return {
        available: true,
        price: focus.invalidationPrice,
        structure: focus.structure,
        scenario: focus.scenario,
        wave: focus.wave,
        rule: `Focus-leg invalidation price from presentation mapping (Wave ${focus.wave}).`,
        source: "FOCUS_LEG",
      };
    }
  }
  if (wave?.invalidationPrice !== undefined) {
    return {
      available: true,
      price: wave.invalidationPrice,
      structure: structureForLabel(wave.label),
      wave: wave.label,
      rule: `Wave candidate invalidation price on engine leg Wave ${wave.label}.`,
      source: "WAVE_CANDIDATE",
    };
  }
  return {
    available: false,
    rule: "No invalidation price provided by engine tracks, focus, or wave leg.",
    source: "NONE",
  };
}

export interface ScenarioInvalidationCandidate {
  source: InvalidationSource;
  price: number;
  wave?: WaveLabel;
  rule: string;
  /** True when this candidate is the one `resolveScenarioInvalidation` would select. */
  selectedByPolicy: boolean;
}

/**
 * Lists structural invalidation candidates before policy collapse (diagnostics / contract).
 * Does not change `resolveScenarioInvalidation` precedence.
 */
export function enumerateScenarioInvalidationCandidates(
  presentation: WavePresentationState,
  focus: FocusView | null,
  wave: WaveCandidate | null
): ScenarioInvalidationCandidate[] {
  const selected = resolveScenarioInvalidation(presentation, focus, wave);
  const candidates: ScenarioInvalidationCandidate[] = [];

  if (focus) {
    const track = trackForFocus(presentation, focus);
    const scoped = track?.invalidation;
    if (scoped) {
      candidates.push({
        source: "TRACK_SCOPE",
        price: scoped.price,
        wave: scoped.wave,
        rule: invalidationRuleFromScoped(scoped),
        selectedByPolicy:
          selected.available &&
          selected.source === "TRACK_SCOPE" &&
          selected.price === scoped.price,
      });
    }
    if (focus.invalidationPrice !== undefined) {
      candidates.push({
        source: "FOCUS_LEG",
        price: focus.invalidationPrice,
        wave: focus.wave,
        rule: `Focus-leg invalidation price from presentation mapping (Wave ${focus.wave}).`,
        selectedByPolicy:
          selected.available &&
          selected.source === "FOCUS_LEG" &&
          selected.price === focus.invalidationPrice,
      });
    }
  }
  if (wave?.invalidationPrice !== undefined) {
    candidates.push({
      source: "WAVE_CANDIDATE",
      price: wave.invalidationPrice,
      wave: wave.label,
      rule: `Wave candidate invalidation price on engine leg Wave ${wave.label}.`,
      selectedByPolicy:
        selected.available &&
        selected.source === "WAVE_CANDIDATE" &&
        selected.price === wave.invalidationPrice,
    });
  }

  return candidates;
}

export function mapEngineStatusToScenarioStatus(
  engineStatus: WaveStatus | undefined,
  hasSegment: boolean
): ScenarioLifecycleStatus {
  if (!hasSegment || engineStatus === undefined) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (engineStatus === "INVALIDATED") {
    return "INVALIDATED";
  }
  return "ACTIVE";
}

function waveByLabel(
  waves: WaveCandidate[],
  label: WaveLabel
): WaveCandidate | undefined {
  return waves.find((w) => w.label === label);
}

function mtfEvidence(
  bundle: TimeframeWaveBundle,
  mtf?: MultiTimeframeWaveState
): string[] {
  if (!mtf) {
    return [];
  }
  const isHigher = bundle.timeframeId === mtf.higherTimeframe.timeframeId;
  const isLower = bundle.timeframeId === mtf.lowerTimeframe.timeframeId;
  if (!isHigher && !isLower) {
    return [];
  }
  return [
    `Multi-timeframe context: ${mtf.higherTimeframe.timeframeId} trend ${mtf.trendAlignment.higherTrend}, ${mtf.lowerTimeframe.timeframeId} trend ${mtf.trendAlignment.lowerTrend} (${mtf.trendAlignment.comparison}).`,
    `MTF relationship kind: ${mtf.relationship.kind} — ${mtf.relationship.summary}`,
  ];
}

function hierarchyEvidenceForLeg(
  timeframeId: string,
  structure: StructureKind,
  label: WaveLabel,
  hierarchy?: WaveHierarchyReport
): string[] {
  if (!hierarchy) {
    return [];
  }
  const lines: string[] = [];
  const pp = hierarchy.primaryPair;
  if (pp) {
    if (
      timeframeId === hierarchy.higherTimeframe &&
      pp.higherWave.label === label &&
      pp.higherWave.structure === structure
    ) {
      lines.push(
        `Hierarchy primary-pair (higher leg): ${pp.relationship} vs ${hierarchy.lowerTimeframe} ${pp.lowerWave.structure} ${pp.lowerWave.label}. ${pp.reason}`
      );
    }
    if (
      timeframeId === hierarchy.lowerTimeframe &&
      pp.lowerWave.label === label &&
      pp.lowerWave.structure === structure
    ) {
      lines.push(
        `Hierarchy primary-pair (lower leg): ${pp.relationship} vs ${hierarchy.higherTimeframe} ${pp.higherWave.structure} ${pp.higherWave.label}. ${pp.reason}`
      );
    }
  }
  for (const c of hierarchy.highlightedCandidates) {
    if (
      timeframeId === hierarchy.higherTimeframe &&
      c.higherWave.label === label
    ) {
      lines.push(
        `Hierarchy nesting candidate: lower ${c.lowerWave.structure} ${c.lowerWave.label} → ${c.relationship} (${c.timeRelation}, ${c.priceRelation}).`
      );
    }
    if (
      timeframeId === hierarchy.lowerTimeframe &&
      c.lowerWave.label === label
    ) {
      lines.push(
        `Hierarchy nesting candidate: higher ${c.higherWave.structure} ${c.higherWave.label} → ${c.relationship} (${c.timeRelation}, ${c.priceRelation}).`
      );
    }
  }
  return lines;
}

function limitationsFor(
  invalidation: ScenarioInvalidationView
): string[] {
  const list = [...STANDARD_LIMITATIONS];
  if (!invalidation.available) {
    list.push(
      "No scoped invalidation price is available from existing engine outputs for this scenario."
    );
  }
  return list;
}

function buildScenarioCore(
  id: string,
  role: ScenarioRole,
  focus: FocusView | null,
  wave: WaveCandidate | null,
  bundle: TimeframeWaveBundle,
  options: WaveScenarioBuildOptions
): WaveScenario | null {
  const presentation = bundle.presentation;
  const diagnostics = bundle.diagnostics;

  if (!focus && !wave) {
    return null;
  }

  const structure =
    focus?.structure ?? (wave ? structureForLabel(wave.label) : "IMPULSE");
  const waveLabel = focus?.wave ?? wave!.label;
  const engineStatus = wave?.status ?? focus?.status;

  let startIndex = focus?.startIndex ?? wave?.startIndex;
  let endIndex = focus?.endIndex ?? wave?.endIndex;
  let startPrice: number | null = null;
  let endPrice: number | null = null;

  if (role === "PRIMARY") {
    startPrice = bundle.primaryFocus.startPrice;
    endPrice = bundle.primaryFocus.endPrice;
    startIndex = bundle.primaryFocus.startIndex ?? startIndex;
    endIndex = bundle.primaryFocus.endIndex ?? endIndex;
  } else if (role === "ALTERNATIVE") {
    startPrice = bundle.alternativeFocus.startPrice;
    endPrice = bundle.alternativeFocus.endPrice;
    startIndex = bundle.alternativeFocus.startIndex ?? startIndex;
    endIndex = bundle.alternativeFocus.endIndex ?? endIndex;
  } else if (wave) {
    const leg = diagnostics.waveLegs.find((l) => l.label === wave.label);
    startIndex = leg?.startIndex ?? wave.startIndex;
    endIndex = leg?.endIndex ?? wave.endIndex;
    startPrice = leg?.startPrice ?? null;
    endPrice = leg?.endPrice ?? null;
  }

  const hasSegment =
    startIndex !== undefined &&
    endIndex !== undefined &&
    startIndex >= 0 &&
    endIndex >= 0;
  const hasPrices = startPrice !== null && endPrice !== null;

  const status: ScenarioLifecycleStatus = !hasSegment || !hasPrices
    ? "INSUFFICIENT_CONTEXT"
    : mapEngineStatusToScenarioStatus(engineStatus, true);

  const confidence =
    focus?.confidence ?? wave?.confidence ?? 0;

  const invalidation = resolveScenarioInvalidation(
    presentation,
    focus,
    wave
  );

  const evidence: string[] = [];
  if (focus?.selectionReason) {
    evidence.push(`Presentation focus: ${focus.selectionReason}`);
  }
  if (wave) {
    evidence.push(
      `Engine wave leg: ${structure} Wave ${wave.label} (${wave.status}).`
    );
  }
  evidence.push(...mtfEvidence(bundle, options.multiTimeframe));
  evidence.push(
    ...hierarchyEvidenceForLeg(
      bundle.timeframeId,
      structure,
      waveLabel,
      options.hierarchy
    )
  );

  return {
    id,
    role,
    structure,
    waveLabel,
    engineStatus,
    status,
    confidence,
    startIndex: startIndex ?? -1,
    endIndex: endIndex ?? -1,
    startPrice: startPrice ?? 0,
    endPrice: endPrice ?? 0,
    invalidation,
    evidence,
    limitations: limitationsFor(invalidation),
  };
}

function scenarioFromFocus(
  role: ScenarioRole,
  bundle: TimeframeWaveBundle,
  options: WaveScenarioBuildOptions
): WaveScenario | null {
  const focus =
    role === "PRIMARY"
      ? bundle.presentation.primary
      : bundle.presentation.alternative;
  if (!focus) {
    return null;
  }
  const wave = waveByLabel(bundle.analysis.waves, focus.wave);
  const id = `${role.toLowerCase()}-${focus.structure.toLowerCase()}-${focus.wave}`;
  return buildScenarioCore(id, role, focus, wave ?? null, bundle, options);
}

function scenarioFromCandidate(
  wave: WaveCandidate,
  bundle: TimeframeWaveBundle,
  options: WaveScenarioBuildOptions
): WaveScenario {
  const structure = structureForLabel(wave.label);
  const id = `candidate-${structure.toLowerCase()}-${wave.label}`;
  const focus: FocusView = {
    structure,
    scenario: "SELECTED",
    wave: wave.label,
    status: wave.status,
    confidence: wave.confidence,
    startIndex: wave.startIndex,
    endIndex: wave.endIndex,
    invalidationPrice: wave.invalidationPrice,
    selectionReason: "Flat engine wave candidate.",
  };
  return buildScenarioCore(
    id,
    "CANDIDATE",
    focus,
    wave,
    bundle,
    options
  )!;
}

export function buildWaveScenarios(
  bundle: TimeframeWaveBundle,
  options: WaveScenarioBuildOptions = {}
): WaveScenarioReport {
  const scenarios: WaveScenario[] = [];

  const primary = scenarioFromFocus("PRIMARY", bundle, options);
  if (primary) {
    scenarios.push(primary);
  }
  const alternative = scenarioFromFocus("ALTERNATIVE", bundle, options);
  if (alternative) {
    scenarios.push(alternative);
  }

  for (const wave of bundle.presentation.engine.flatWaves) {
    scenarios.push(scenarioFromCandidate(wave, bundle, options));
  }

  scenarios.sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: "1.0",
    timeframeId: bundle.timeframeId,
    symbol: options.symbol,
    scenarios,
  };
}

export function buildWaveScenarioSet(
  mtf: MultiTimeframeWaveState,
  options: {
    symbol?: string;
    hierarchy?: WaveHierarchyReport;
  } = {}
): WaveScenarioSet {
  const shared = {
    symbol: options.symbol ?? mtf.symbol,
    multiTimeframe: mtf,
    hierarchy: options.hierarchy,
  };
  return {
    higher: buildWaveScenarios(mtf.higherTimeframe, shared),
    lower: buildWaveScenarios(mtf.lowerTimeframe, shared),
  };
}
