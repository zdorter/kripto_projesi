import {
  discoverNaturalReplayMilestones,
  naturalPipelineCandles,
} from "../wave/setup/prospective-natural-pipeline-replay";

export type RealMarketProspectiveReplayDiagnostics = ReturnType<
  typeof buildProspectiveReplayDiagnostics
>;

export function buildProspectiveReplayDiagnostics() {
  const candles = naturalPipelineCandles();
  const milestones = discoverNaturalReplayMilestones(candles);
  return {
    schemaVersion: "1.0" as const,
    fixtureCandleCount: candles.length,
    milestones: milestones.map((m) => ({
      label: m.label,
      bar: m.bar,
      status: m.sample?.status ?? null,
      funnelFirstFailure: m.sample?.funnelFirstFailure ?? null,
      transitionLevel:
        m.sample?.contract.transitionEvidence.transitionEvidenceLevel ?? null,
    })),
    prospectiveConfirmedInFixture: milestones.some(
      (m) => m.label === "N4_PROSPECTIVE_CONFIRMED"
    ),
  };
}
