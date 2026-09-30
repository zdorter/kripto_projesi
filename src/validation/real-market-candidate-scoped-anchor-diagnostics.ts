import type { ProspectiveSetupProductionCandidate } from "../wave/setup/prospective-setup-production-types";

export type RealMarketCandidateScopedAnchorDiagnostics = ReturnType<
  typeof buildCandidateScopedAnchorDiagnostics
>;

export function buildCandidateScopedAnchorDiagnostics(
  candidates: ProspectiveSetupProductionCandidate[]
) {
  let candidateScopedMode = 0;
  let globalMode = 0;
  let anchorConflict = 0;
  let anchorSelectedCandidateScoped = 0;

  for (const c of candidates) {
    const res = c.openLegResolution;
    if (res.anchorResolutionMode === "CANDIDATE_SCOPED") {
      candidateScopedMode += 1;
    }
    if (res.anchorResolutionMode === "GLOBAL") {
      globalMode += 1;
    }
    if (res.status === "ANCHOR_CONFLICT" || res.anchorSelection === "CONFLICT") {
      anchorConflict += 1;
    }
    if (
      res.anchorResolutionMode === "CANDIDATE_SCOPED" &&
      res.anchorSelection === "SELECTED"
    ) {
      anchorSelectedCandidateScoped += 1;
    }
  }

  return {
    schemaVersion: "1.0" as const,
    candidateRows: candidates.length,
    candidateScopedMode,
    globalMode,
    anchorConflict,
    anchorSelectedCandidateScoped,
    note:
      "Candidate-local anchor identity; unrelated endpoints do not create global ambiguity.",
  };
}
