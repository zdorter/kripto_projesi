import type { FocusView } from "../wave/presentation-state";
import type { StructureKind } from "../wave/presentation-state";
import { enumerateScenarioInvalidationCandidates } from "../wave/wave-scenarios";
import type { WaveScanReport, WaveScanResult } from "../wave/wave-scanner";
import type { TradeSetupEvaluationContext } from "../wave/setup/trade-setup-types";
import type { WaveLabel } from "../wave/types";
import type {
  RealMarketInvalidationScopeDetailRow,
  RealMarketInvalidationScopeSummary,
  RealMarketScenarioInvalidationCandidateReport,
  RealMarketScopeCompatibilityRow,
  RealMarketStopPlanDiagnostic,
  RealMarketStopScopeCompatibilitySummary,
} from "./real-market-validation-types";
import { stopGeometryValid } from "./real-market-stop-diagnostics";

function structureForLabel(label: WaveLabel): StructureKind {
  return ["1", "2", "3", "4", "5"].includes(label) ? "IMPULSE" : "CORRECTIVE";
}

function focusAndWaveForScanRow(
  bundle: NonNullable<TradeSetupEvaluationContext["bundlesBySymbol"]>[string],
  row: WaveScanResult
): { focus: FocusView | null; wave: import("../wave/types").WaveCandidate | null } {
  const presentation = bundle.presentation;
  const wave =
    presentation.engine.flatWaves.find((w) => w.label === row.waveLabel) ?? null;

  if (row.role === "PRIMARY") {
    return { focus: presentation.primary, wave };
  }
  if (row.role === "ALTERNATIVE") {
    return { focus: presentation.alternative, wave };
  }
  if (wave) {
    const structure = structureForLabel(wave.label);
    const focus: FocusView = {
      structure,
      scenario: "SELECTED",
      wave: wave.label,
      status: wave.status,
      confidence: wave.confidence,
      startIndex: wave.startIndex,
      endIndex: wave.endIndex,
      invalidationPrice: wave.invalidationPrice,
      selectionReason: "Flat engine wave candidate (diagnostics).",
    };
    return { focus, wave };
  }
  return { focus: null, wave };
}

function detailRowFromScan(row: WaveScanResult): RealMarketInvalidationScopeDetailRow {
  return {
    symbol: row.symbol,
    scenarioId: row.scenarioId,
    waveLabel: row.waveLabel,
    structure: row.structure,
    role: row.role,
    price: row.invalidation.price ?? null,
  };
}

export function buildInvalidationScopeSummary(
  scanReport: WaveScanReport
): RealMarketInvalidationScopeSummary {
  const bySource: Record<string, number> = {
    TRACK_SCOPE: 0,
    FOCUS_LEG: 0,
    WAVE_CANDIDATE: 0,
    NONE: 0,
  };
  const bySourceDetails: Record<string, RealMarketInvalidationScopeDetailRow[]> =
    {
      TRACK_SCOPE: [],
      FOCUS_LEG: [],
      WAVE_CANDIDATE: [],
      NONE: [],
    };
  let availableCount = 0;
  for (const row of scanReport.results) {
    const src = row.invalidation.available
      ? row.invalidation.source ?? "NONE"
      : "NONE";
    bySource[src] = (bySource[src] ?? 0) + 1;
    bySourceDetails[src].push(detailRowFromScan(row));
    if (row.invalidation.available) {
      availableCount++;
    }
  }
  return {
    bySource,
    scanResultCount: scanReport.results.length,
    availableCount,
    bySourceDetails,
  };
}

export function buildStopScopeCompatibilitySummary(
  stopDiagnostics: RealMarketStopPlanDiagnostic[]
): RealMarketStopScopeCompatibilitySummary {
  const bySource: Record<
    string,
    { considered: number; geometryAccepted: number; geometryRejected: number }
  > = {};

  for (const d of stopDiagnostics) {
    const src = d.invalidationSource ?? "NONE";
    if (!bySource[src]) {
      bySource[src] = {
        considered: 0,
        geometryAccepted: 0,
        geometryRejected: 0,
      };
    }
    bySource[src].considered++;
    if (d.geometryValid === true) {
      bySource[src].geometryAccepted++;
    } else if (d.geometryValid === false) {
      bySource[src].geometryRejected++;
    }
  }

  return { bySource };
}

export function scopeCompatibilityMatrix(): RealMarketScopeCompatibilityRow[] {
  return [
    {
      source: "TRACK_SCOPE",
      structuralMeaning:
        "Impulse/corrective track invalidation from presentation tracks (e.g. Wave 2 break / leg with invalidationPrice).",
      segmentEnvelopeRequired: true,
      currentStopModelVerdict: "CONTRACT_REJECTED",
    },
    {
      source: "FOCUS_LEG",
      structuralMeaning:
        "Focus leg invalidationPrice when track scope absent; may align with leading leg boundary.",
      segmentEnvelopeRequired: true,
      currentStopModelVerdict: "UNKNOWN",
    },
    {
      source: "WAVE_CANDIDATE",
      structuralMeaning:
        "Per flat engine wave invalidationPrice when focus path unavailable.",
      segmentEnvelopeRequired: true,
      currentStopModelVerdict: "UNKNOWN",
    },
    {
      source: "NONE",
      structuralMeaning: "No structural invalidation in scenario layer output.",
      segmentEnvelopeRequired: false,
      currentStopModelVerdict: "UNSUPPORTED",
    },
  ];
}

export function buildScenarioInvalidationCandidateReports(
  scanReport: WaveScanReport,
  tradeContext: TradeSetupEvaluationContext
): RealMarketScenarioInvalidationCandidateReport[] {
  const reports: RealMarketScenarioInvalidationCandidateReport[] = [];
  const bundles = tradeContext.bundlesBySymbol ?? {};

  for (const row of scanReport.results) {
    const bundle = bundles[row.symbol];
    if (!bundle) {
      continue;
    }
    const { focus, wave } = focusAndWaveForScanRow(bundle, row);
    const candidates = enumerateScenarioInvalidationCandidates(
      bundle.presentation,
      focus,
      wave
    );
    const shadowed = candidates.filter((c) => !c.selectedByPolicy).length;
    reports.push({
      symbol: row.symbol,
      scenarioId: row.scenarioId,
      waveLabel: row.waveLabel,
      role: row.role,
      selectedSource: row.invalidation.available
        ? row.invalidation.source ?? "NONE"
        : "NONE",
      selectedPrice: row.invalidation.price ?? null,
      candidates,
      shadowedCandidateCount: shadowed,
    });
  }

  reports.sort(
    (a, b) =>
      a.symbol.localeCompare(b.symbol) ||
      a.scenarioId.localeCompare(b.scenarioId)
  );
  return reports;
}

export function analyzeInvalidationPrecedenceFindings(
  candidateReports: RealMarketScenarioInvalidationCandidateReport[],
  stopDiagnostics: RealMarketStopPlanDiagnostic[]
): string[] {
  const findings: string[] = [];
  const multi = candidateReports.filter((r) => r.candidates.length > 1);
  if (multi.length > 0) {
    findings.push(
      `${multi.length} scan scenario(s) have multiple structural invalidation candidates before policy collapse.`
    );
  }
  const trackShadowsFocus = candidateReports.filter(
    (r) =>
      r.selectedSource === "TRACK_SCOPE" &&
      r.candidates.some(
        (c) => c.source === "FOCUS_LEG" && c.price !== r.selectedPrice
      )
  );
  if (trackShadowsFocus.length > 0) {
    findings.push(
      `${trackShadowsFocus.length} scenario(s): TRACK_SCOPE selected while FOCUS_LEG candidate exists at a different price (precedence per resolveScenarioInvalidation).`
    );
  }

  for (const d of stopDiagnostics) {
    if (d.invalidationSource !== "TRACK_SCOPE" || d.geometryValid !== false) {
      continue;
    }
    const report = candidateReports.find(
      (r) => r.symbol === d.symbol && r.waveLabel === d.scenarioWaveLabel
    );
    const alt = report?.candidates.find(
      (c) => !c.selectedByPolicy && c.source !== "TRACK_SCOPE"
    );
    if (alt && d.directionalBias) {
      const altGeom = stopGeometryValid(
        d.directionalBias as "BULLISH" | "BEARISH",
        alt.price,
        d.segmentStartPrice,
        d.segmentEndPrice
      );
      if (altGeom) {
        findings.push(
          `Setup ${d.setupId}: shadowed ${alt.source} at ${alt.price} would pass segment geometry but is not on Entry Plan (policy-selected TRACK_SCOPE ${d.invalidationPrice}).`
        );
      }
    }
    if (
      d.entryReferencePrice !== null &&
      d.invalidationPrice !== null &&
      d.directionalBias === "BULLISH"
    ) {
      if (d.invalidationPrice < d.entryReferencePrice) {
        findings.push(
          `Setup ${d.setupId}: TRACK_SCOPE ${d.invalidationPrice} is below entry ${d.entryReferencePrice} (risk side) but fails segment-envelope stop geometry.`
        );
      }
    }
  }

  return findings;
}

export function correctiveTrackInvalidationNote(
  tradeContext: TradeSetupEvaluationContext
): string {
  const bundles = tradeContext.bundlesBySymbol ?? {};
  let correctiveWithTrack = 0;
  let correctiveNoInvalidation = 0;
  for (const bundle of Object.values(bundles)) {
    const track = bundle.presentation?.tracks?.corrective;
    if (!track) {
      continue;
    }
    if (track.invalidation) {
      correctiveWithTrack++;
    } else {
      correctiveNoInvalidation++;
    }
  }
  return (
    `Corrective tracks observed: ${correctiveWithTrack + correctiveNoInvalidation}; ` +
    `with track invalidation: ${correctiveWithTrack}; ` +
    `without (NONE at track layer when legs lack invalidationPrice): ${correctiveNoInvalidation}. ` +
    `Corrective invalidation uses same invalidationForTrack as impulse (leg invalidationPrice only).`
  );
}
