import {
  MARKET_STRUCTURE_PRESENTATION_TAXONOMY_SCHEMA_VERSION,
  type ConfluenceSurfacePresentationTaxonomy,
} from "./market-structure-presentation-taxonomy-types";

export {
  MARKET_STRUCTURE_PRESENTATION_TAXONOMY_SCHEMA_VERSION,
  type ConfluencePresentationStatus,
  type ConfluenceSurfacePresentationTaxonomy,
  type NativeHtfDecimalVolumeParityPresentationStatus,
  type NativeHtfFieldParityPresentationStatus,
  type NativeHtfProductionPresentationStatus,
  type NativeHtfResearchPresentationStatus,
  type NativeHtfSemanticParityPresentationStatus,
} from "./market-structure-presentation-taxonomy-types";

export { NATIVE_HTF_RESEARCH_PRESENTATION_V1 } from "./market-structure-native-htf-research-presentation";

const CORE_LIMITATION_EXACT = new Set([
  "research_only",
  "not_production_signal",
  "no_prediction",
  "no_scoring",
  "descriptive_confluence_surface",
  "no_causality",
  "observational_co_occurrence_only",
]);

function sortUnique(items: readonly string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

export function isCorePresentationLimitation(item: string): boolean {
  if (CORE_LIMITATION_EXACT.has(item)) {
    return true;
  }
  return false;
}

export interface BuildPresentationTaxonomyInput {
  limitations: readonly string[];
  researchFlags: readonly string[];
}

/**
 * Classifies merged limitation strings for UI/research presentation.
 * Flat `limitations` on 9F is unchanged; this is a derived, deduplicated view.
 *
 * Category priority per string: CORE → RESEARCH_FLAGS → TECHNICAL.
 * `unresolved` remains a separate structured list on 9F.
 */
export function buildPresentationTaxonomy(
  input: BuildPresentationTaxonomyInput
): ConfluenceSurfacePresentationTaxonomy {
  const researchFlagSet = new Set(input.researchFlags);
  const core: string[] = [];
  const research: string[] = [];
  const technical: string[] = [];

  for (const item of input.limitations) {
    if (isCorePresentationLimitation(item)) {
      core.push(item);
    } else if (researchFlagSet.has(item)) {
      research.push(item);
    } else {
      technical.push(item);
    }
  }

  for (const flag of input.researchFlags) {
    if (isCorePresentationLimitation(flag)) {
      if (!core.includes(flag)) {
        core.push(flag);
      }
    } else if (!research.includes(flag) && !technical.includes(flag)) {
      research.push(flag);
    }
  }

  const coreSorted = sortUnique(core);
  const researchSorted = sortUnique(research);
  const technicalSorted = sortUnique(
    technical.filter((t) => !coreSorted.includes(t) && !researchSorted.includes(t))
  );

  return {
    schemaVersion: MARKET_STRUCTURE_PRESENTATION_TAXONOMY_SCHEMA_VERSION,
    coreLimitations: coreSorted,
    researchPresentationFlags: researchSorted,
    technicalLimitations: technicalSorted,
  };
}
