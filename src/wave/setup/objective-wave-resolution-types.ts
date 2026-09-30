import type { WaveLabel } from "../types";

/**
 * Scenario/setup focus leg (leading impulse leg for impulse-continuation).
 * Not interchangeable with objective (projection target) wave.
 */
export type CurrentWaveLabel = WaveLabel;

/**
 * Wave label for which an objective projection would be defined (policy/engine contract).
 * Distinct type alias — same union as WaveLabel but must not be confused with CurrentWaveLabel.
 */
export type ObjectiveWaveLabel = WaveLabel;

export type ImpulseLegTemporalState =
  | "NOT_PRESENT"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "ENDPOINT_CONFIRMED"
  | "INVALIDATED"
  | "INSUFFICIENT_CONTEXT";

export type ObjectiveWaveResolutionStatus =
  | "NOT_APPLICABLE"
  | "INSUFFICIENT_CONTEXT"
  | "OBJECTIVE_WAVE_UNRESOLVED"
  | "OBJECTIVE_WAVE_RESOLVED"
  | "CURRENT_WAVE_ALREADY_COMPLETED"
  | "NEXT_WAVE_NOT_ESTABLISHED";

export type ObjectiveWaveTemporalCompatibility =
  | "NOT_APPLICABLE"
  | "CURRENT_LEG_IN_PROGRESS"
  | "COMPATIBLE_WITH_FORWARD_OBJECTIVE"
  | "TEMPORALLY_LATE_FOR_OBJECTIVE_W3"
  | "TEMPORALLY_LATE_FOR_OBJECTIVE_W5";

export type RelationshipTemplateKeyingVerdict =
  | "CURRENT_WAVE_KEYED"
  | "OBJECTIVE_WAVE_KEYED_REQUIRED"
  | "UNKNOWN";

export interface NextStructuralEvidence {
  /** Next impulse leg label in engine flat count (structural lookup only — not objective assignment). */
  nextImpulseLegLabel: WaveLabel | null;
  nextLegStartIndexAtOrBeforeBar: boolean;
  nextLegEndConfirmedAtOrBeforeBar: boolean;
  nextLegStartIndex: number | null;
  nextLegEndIndex: number | null;
}

export interface ObjectiveWaveResolutionContext {
  setupId: string;
  setupTypeId: string;
  setupConfirmed: boolean;
  currentWaveLabel: CurrentWaveLabel;
  currentWaveState: ImpulseLegTemporalState;
  currentWaveEndIndex: number | null;
  evaluationBarIndex: number;
  objectiveWaveLabel: ObjectiveWaveLabel | null;
  objectiveWaveState: ImpulseLegTemporalState;
  status: ObjectiveWaveResolutionStatus;
  nextStructuralEvidence: NextStructuralEvidence;
  temporalCompatibility: ObjectiveWaveTemporalCompatibility;
  relationshipTemplateKeyingVerdict: RelationshipTemplateKeyingVerdict;
  setupNameSemanticMismatch: boolean;
  evidence: string[];
}
