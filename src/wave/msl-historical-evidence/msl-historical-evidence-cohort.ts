/**
 * Known-at / disclosure cohort classification (MSL-13 leakage contract).
 */

import { passesStrictKnownAtGate } from "./msl-historical-evidence-strict";

export type MslHistoricalEvidenceKnownAtCohort =
  | "STRICT_AT_E"
  | "DISCLOSURE_HORIZON"
  | "EXCLUDED";

export { passesStrictKnownAtGate } from "./msl-historical-evidence-strict";

export function isDisclosureKnownAtBarIndex(
  knownAtBarIndex: number,
  evaluationBarIndex: number,
  observationHorizonBars: number
): boolean {
  const E = evaluationBarIndex;
  const H = observationHorizonBars;
  return (
    Number.isInteger(knownAtBarIndex) &&
    knownAtBarIndex > E &&
    knownAtBarIndex <= E + H
  );
}

export function isDisclosureKnownAtTimestamp(
  knownAtTimestamp: number,
  evaluationTimestamp: number,
  evaluationBarIndex: number,
  observationHorizonBars: number,
  candles: readonly { time: number }[]
): boolean {
  if (!Number.isFinite(knownAtTimestamp) || knownAtTimestamp <= evaluationTimestamp) {
    return false;
  }
  const horizonEndTs = candles[Math.min(evaluationBarIndex + observationHorizonBars, candles.length - 1)]?.time;
  if (horizonEndTs === undefined) {
    return false;
  }
  return knownAtTimestamp <= horizonEndTs;
}

export function classifyKnownAtCohort(input: {
  knownAtBarIndex: number;
  knownAtTimestamp: number;
  evaluationBarIndex: number;
  evaluationTimestamp: number;
  observationHorizonBars: number;
  candles: readonly { time: number }[];
}): MslHistoricalEvidenceKnownAtCohort {
  if (
    passesStrictKnownAtGate({
      knownAtBarIndex: input.knownAtBarIndex,
      knownAtTimestamp: input.knownAtTimestamp,
      evaluationBarIndex: input.evaluationBarIndex,
      evaluationTimestamp: input.evaluationTimestamp,
    })
  ) {
    return "STRICT_AT_E";
  }
  const barDisclosure = isDisclosureKnownAtBarIndex(
    input.knownAtBarIndex,
    input.evaluationBarIndex,
    input.observationHorizonBars
  );
  const tsDisclosure = isDisclosureKnownAtTimestamp(
    input.knownAtTimestamp,
    input.evaluationTimestamp,
    input.evaluationBarIndex,
    input.observationHorizonBars,
    input.candles
  );
  if (barDisclosure && tsDisclosure) {
    return "DISCLOSURE_HORIZON";
  }
  return "EXCLUDED";
}

/** @internal test export */
export function classifyKnownAtCohortBarIndexOnly(
  knownAtBarIndex: number,
  evaluationBarIndex: number,
  observationHorizonBars: number
): MslHistoricalEvidenceKnownAtCohort {
  if (knownAtBarIndex <= evaluationBarIndex) {
    return "STRICT_AT_E";
  }
  if (knownAtBarIndex <= evaluationBarIndex + observationHorizonBars) {
    return "DISCLOSURE_HORIZON";
  }
  return "EXCLUDED";
}
