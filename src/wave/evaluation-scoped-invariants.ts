import type { WaveDiagnostics } from "./wave-diagnostics";
import type { WavePresentationState } from "./presentation-state";
import type { WaveLabel } from "./types";

const IMPULSE_LABELS: WaveLabel[] = ["1", "2", "3", "4", "5"];

function pushIfOver(
  violations: string[],
  kind: string,
  index: number,
  bar: number
): void {
  if (index > bar) {
    violations.push(`${kind} index ${index} exceeds evaluationBarIndex ${bar}`);
  }
}

export function collectEvaluationScopedInvariantViolations(
  presentation: WavePresentationState,
  diagnostics: WaveDiagnostics,
  evaluationBarIndex: number
): string[] {
  const violations: string[] = [];
  const bar = evaluationBarIndex;

  for (const w of presentation.engine.flatWaves) {
    pushIfOver(violations, `flatWave ${w.label} start`, w.startIndex, bar);
    pushIfOver(violations, `flatWave ${w.label} end`, w.endIndex, bar);
  }

  const pushLeg = (structure: string, label: string, start: number, end: number) => {
    pushIfOver(violations, `${structure} ${label} start`, start, bar);
    pushIfOver(violations, `${structure} ${label} end`, end, bar);
  };

  for (const track of [
    presentation.tracks.selectedImpulse,
    presentation.tracks.corrective,
    presentation.tracks.rivalImpulse,
  ]) {
    if (!track) {
      continue;
    }
    for (const leg of track.legs) {
      pushLeg(leg.structure, leg.label, leg.startIndex, leg.endIndex);
    }
  }

  for (const o of presentation.overlaps) {
    pushIfOver(violations, "overlap start", o.startIndex, bar);
    pushIfOver(violations, "overlap end", o.endIndex, bar);
  }

  if (presentation.primary) {
    pushIfOver(
      violations,
      "focus primary start",
      presentation.primary.startIndex,
      bar
    );
    pushIfOver(
      violations,
      "focus primary end",
      presentation.primary.endIndex,
      bar
    );
  }
  if (presentation.alternative) {
    pushIfOver(
      violations,
      "focus alternative start",
      presentation.alternative.startIndex,
      bar
    );
    pushIfOver(
      violations,
      "focus alternative end",
      presentation.alternative.endIndex,
      bar
    );
  }

  for (const s of diagnostics.confirmedSwings) {
    pushIfOver(violations, "confirmedSwing", s.index, bar);
  }

  for (const leg of diagnostics.waveLegs) {
    pushIfOver(
      violations,
      `waveLeg ${leg.structure} ${leg.label} start`,
      leg.startIndex,
      bar
    );
    pushIfOver(
      violations,
      `waveLeg ${leg.structure} ${leg.label} end`,
      leg.endIndex,
      bar
    );
  }

  const fib = diagnostics.fibonacci;
  if (fib.wave1StartIndex !== undefined) {
    pushIfOver(violations, "fib wave1Start", fib.wave1StartIndex, bar);
  }
  if (fib.wave1EndIndex !== undefined) {
    pushIfOver(violations, "fib wave1End", fib.wave1EndIndex, bar);
  }
  if (fib.wave2EndIndex !== undefined) {
    pushIfOver(violations, "fib wave2End", fib.wave2EndIndex, bar);
  }

  for (const label of IMPULSE_LABELS) {
    const w = presentation.engine.flatWaves.find((x) => x.label === label);
    if (w && w.endIndex > bar) {
      violations.push(
        `POTENTIAL_OR_WAVE end beyond bar: ${label} endIndex=${w.endIndex}`
      );
    }
  }

  return violations;
}

export function assertScenarioIndicesWithinBar(
  scenarios: { startIndex: number; endIndex: number }[],
  evaluationBarIndex: number
): string[] {
  const violations: string[] = [];
  for (const s of scenarios) {
    pushIfOver(violations, "scenario start", s.startIndex, evaluationBarIndex);
    pushIfOver(violations, "scenario end", s.endIndex, evaluationBarIndex);
  }
  return violations;
}
