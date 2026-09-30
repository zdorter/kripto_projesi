import type {
  ObjectiveTargetCandidate,
  ObjectiveTargetSourceId,
} from "./objective-target-candidate-types";
import { DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY } from "./objective-target-selection-policy";
import type {
  ObjectiveTargetSelectionInput,
  ObjectiveTargetSelectionResult,
} from "./objective-target-selection-types";
import { OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION } from "./objective-target-selection-types";

const SELECTION_LIMITATIONS = [
  "Selection applies deterministic source precedence only; it is not a quality estimate or trade signal.",
  "SOURCE_PRECEDENCE policy does not compare target prices or distances.",
  "Candidate producers (14D.8) are not re-run or modified by selection.",
];

function isSelectable(
  c: ObjectiveTargetCandidate,
  requiresDirectionalBias: boolean
): boolean {
  if (c.outcome !== "AVAILABLE") {
    return false;
  }
  if (c.targetPrice === undefined || !Number.isFinite(c.targetPrice)) {
    return false;
  }
  if (requiresDirectionalBias && c.directionalBias === null) {
    return false;
  }
  return true;
}

function duplicateSourceAmbiguity(
  available: ObjectiveTargetCandidate[]
): ObjectiveTargetSourceId | null {
  const counts = new Map<ObjectiveTargetCandidate["sourceId"], number>();
  for (const c of available) {
    counts.set(c.sourceId, (counts.get(c.sourceId) ?? 0) + 1);
  }
  for (const [sourceId, count] of counts) {
    if (count > 1) {
      return sourceId;
    }
  }
  return null;
}

function snapshotCandidate(
  c: ObjectiveTargetCandidate
): ObjectiveTargetCandidate {
  return {
    ...c,
    limitations: [...c.limitations],
  };
}

/**
 * Selects at most one AVAILABLE candidate by policy source precedence.
 */
export function applyObjectiveTargetSelectionPolicy(
  input: ObjectiveTargetSelectionInput
): ObjectiveTargetSelectionResult {
  const policy = input.policy ?? DEFAULT_OBJECTIVE_TARGET_SELECTION_POLICY;
  const report = input.report;
  const base = {
    schemaVersion: OBJECTIVE_TARGET_SELECTION_SCHEMA_VERSION,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    entryPlanId: report.entryPlanId,
    setupId: report.setupId,
    setupTypeId: report.setupTypeId,
    symbol: report.symbol,
    timeframe: report.timeframe,
    scenarioId: report.scenarioId,
    limitations: SELECTION_LIMITATIONS,
  };

  const available = report.candidates.filter((c) =>
    isSelectable(c, policy.requiresDirectionalBias)
  );
  const availableIgnoringBias = report.candidates.filter((c) =>
    isSelectable(c, false)
  );

  if (availableIgnoringBias.length > 0 && available.length === 0) {
    return {
      ...base,
      outcome: "INSUFFICIENT_CONTEXT",
      selectedCandidate: null,
      selectionReason:
        "AVAILABLE candidates exist but directional bias is null while policy requiresDirectionalBias is true.",
    };
  }

  if (available.length === 0) {
    return {
      ...base,
      outcome: "NO_SELECTION",
      selectedCandidate: null,
      selectionReason:
        report.candidates.length === 0
          ? "No objective target candidates in report."
          : "No AVAILABLE candidate with finite targetPrice satisfies policy eligibility.",
    };
  }

  const ambiguousSource = duplicateSourceAmbiguity(available);
  if (ambiguousSource) {
    return {
      ...base,
      outcome: "NO_SELECTION",
      selectedCandidate: null,
      selectionReason: `Multiple AVAILABLE candidates for source ${ambiguousSource}; policy does not apply price-based tie-break.`,
    };
  }

  for (const sourceId of policy.sourcePrecedence) {
    const match = available.find((c) => c.sourceId === sourceId);
    if (match) {
      return {
        ...base,
        outcome: "SELECTED",
        selectedCandidate: snapshotCandidate(match),
        selectionReason: `Selected because ${sourceId} is the first AVAILABLE source in policy precedence (not source quality).`,
      };
    }
  }

  return {
    ...base,
    outcome: "NO_SELECTION",
    selectedCandidate: null,
    selectionReason:
      "AVAILABLE candidates exist but none match a source id in policy precedence.",
  };
}
