export const MARKET_STRUCTURE_PRESENTATION_TAXONOMY_SCHEMA_VERSION = "1.0" as const;

export interface ConfluenceSurfacePresentationTaxonomy {
  schemaVersion: typeof MARKET_STRUCTURE_PRESENTATION_TAXONOMY_SCHEMA_VERSION;
  coreLimitations: readonly string[];
  technicalLimitations: readonly string[];
  researchPresentationFlags: readonly string[];
}

export type ConfluencePresentationStatus = "DESCRIPTIVE_CONFLUENCE_ONLY";

export type NativeHtfFieldParityPresentationStatus = "FIELD_PARITY_FAILED";

export type NativeHtfDecimalVolumeParityPresentationStatus =
  "DECIMAL_NORMALIZED_VOLUME_PARITY_ESTABLISHED";

export type NativeHtfSemanticParityPresentationStatus = "SEMANTIC_PARITY_ESTABLISHED";

export type NativeHtfProductionPresentationStatus = "NOT_ESTABLISHED";

export interface NativeHtfResearchPresentationStatus {
  fieldParityStatus: NativeHtfFieldParityPresentationStatus;
  decimalNormalizedVolumeParityStatus: NativeHtfDecimalVolumeParityPresentationStatus;
  semanticParityStatus: NativeHtfSemanticParityPresentationStatus;
  nativeHtfProductionStatus: NativeHtfProductionPresentationStatus;
  canonicalHtfSourceTrack: "DERIVED_1H_4H";
  /** Research-only; normalized 3 dp tier is not production parity. */
  researchDisclaimer: string;
}
