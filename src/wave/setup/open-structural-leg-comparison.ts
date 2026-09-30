import type {
  OpenLegComparisonVerdict,
  OpenLegPathComparison,
  OpenStructuralLeg,
  OpenStructuralLegResolution,
} from "./open-structural-leg-types";

export function compareOpenLegPaths(input: {
  legacyPotentialOpenLeg: OpenStructuralLeg | null;
  openLegResolution: OpenStructuralLegResolution | null;
}): OpenLegPathComparison {
  const legacy = input.legacyPotentialOpenLeg !== null;
  const firstClass =
    input.openLegResolution?.status === "AVAILABLE" &&
    input.openLegResolution.leg !== null;
  const notes: string[] = [];

  if (legacy && firstClass) {
    const l = input.legacyPotentialOpenLeg!;
    const f = input.openLegResolution!.leg!;
    const sameStart = l.anchorIndex === f.anchorIndex || l.startIndex === f.anchorIndex;
    if (sameStart) {
      notes.push("Legacy POTENTIAL span and first-class leg share anchor index.");
      return {
        legacyPotentialOpenSpan: true,
        firstClassOpenLegAvailable: true,
        verdict: "BOTH_AGREE",
        notes,
      };
    }
    notes.push("Legacy and first-class open legs diverge on anchor index.");
    return {
      legacyPotentialOpenSpan: true,
      firstClassOpenLegAvailable: true,
      verdict: "DIVERGENT",
      notes,
    };
  }
  if (legacy) {
    notes.push("Only legacy POTENTIAL open span present.");
    return {
      legacyPotentialOpenSpan: true,
      firstClassOpenLegAvailable: false,
      verdict: "LEGACY_ONLY",
      notes,
    };
  }
  if (firstClass) {
    notes.push("Only first-class open structural leg present.");
    return {
      legacyPotentialOpenSpan: false,
      firstClassOpenLegAvailable: true,
      verdict: "FIRST_CLASS_ONLY",
      notes,
    };
  }
  return {
    legacyPotentialOpenSpan: false,
    firstClassOpenLegAvailable: false,
    verdict: "NEITHER",
    notes: ["No open leg representation on either path."],
  };
}
