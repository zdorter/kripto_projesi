import type { NativeHtfResearchPresentationStatus } from "./market-structure-presentation-taxonomy-types";

export const NATIVE_HTF_RESEARCH_PRESENTATION_V1: NativeHtfResearchPresentationStatus = {
  fieldParityStatus: "FIELD_PARITY_FAILED",
  decimalNormalizedVolumeParityStatus: "DECIMAL_NORMALIZED_VOLUME_PARITY_ESTABLISHED",
  semanticParityStatus: "SEMANTIC_PARITY_ESTABLISHED",
  nativeHtfProductionStatus: "NOT_ESTABLISHED",
  canonicalHtfSourceTrack: "DERIVED_1H_4H",
  researchDisclaimer:
    "Native HTF parity is research-only. Strict OHLCV field parity failed (volume). " +
    "Decimal-normalized volume tier (3 dp) is established for BTC research samples only and " +
    "does not enable native HTF production. Canonical HTF path remains DERIVED_1H_4H.",
};
