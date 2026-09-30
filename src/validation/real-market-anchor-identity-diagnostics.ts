import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";

export type RealMarketAnchorIdentityDiagnostics = ReturnType<
  typeof buildAnchorIdentityDiagnostics
>;

export function buildAnchorIdentityDiagnostics(
  candidates: ProspectiveSetupProductionCandidate[]
) {
  let anchorAmbiguous = 0;
  let anchorSelected = 0;
  let multiSourceMerged = 0;

  for (const c of candidates) {
    const res = c.openLegResolution;
    if (!res) {
      continue;
    }
    if (res.anchorSelection === "AMBIGUOUS") {
      anchorAmbiguous += 1;
    }
    if (res.anchorSelection === "SELECTED") {
      anchorSelected += 1;
    }
    for (const a of res.anchorCandidates) {
      if (a.sources.length > 1) {
        multiSourceMerged += 1;
      }
    }
  }

  return {
    schemaVersion: "1.0" as const,
    candidateRows: candidates.length,
    anchorAmbiguous,
    anchorSelected,
    multiSourceMergedAnchors: multiSourceMerged,
    /** Pre-14N-I ambiguous counts were inflated by per-provenance-kind keys. */
    resolvedByIdentityMergeNote:
      "Same index+price provenance kinds merge into one structural anchor identity.",
  };
}
