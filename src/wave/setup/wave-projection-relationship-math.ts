import type { FibExtensionLevel } from "../fibonacci";

/**
 * BASE_PLUS_REFERENCE_WAVE_DELTA — pure math only.
 * Policy chooses reference wave, base anchor, and ratio separately.
 */
export function projectBasePlusReferenceWaveDelta(
  basePrice: number,
  signedReferenceWaveDelta: number,
  ratio: FibExtensionLevel
): number {
  return basePrice + signedReferenceWaveDelta * ratio;
}
