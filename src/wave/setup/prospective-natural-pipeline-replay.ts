import { DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import type { Candle, WaveEngineOptions } from "../types";
import { runWaveScan } from "../wave-scanner";
import { buildTradeSetupEvaluationContext } from "./trade-setup-context";
import { detectSetups } from "./setup-detector";
import { detectProspectiveSetupProduction } from "./prospective-setup-production";
import type { ProspectiveSetupProductionCandidate } from "./prospective-setup-production-types";
import { buildProspectiveNaturalPipelineCandles } from "./prospective-natural-pipeline-candles";

export const NATURAL_PIPELINE_SYMBOL = "BTCUSDT";
export const NATURAL_PIPELINE_TF = "1H";

export const NATURAL_PIPELINE_ENGINE_OPTIONS: WaveEngineOptions =
  DEMO_WAVE_ENGINE_OPTIONS;

export function naturalPipelineCandles(): Candle[] {
  return buildProspectiveNaturalPipelineCandles();
}

export function runProspectiveProductionPipelineAtBar(
  candles: Candle[],
  evaluationBarIndex: number
) {
  const scan = runWaveScan(
    [{ symbol: NATURAL_PIPELINE_SYMBOL, candles }],
    {
      timeframe: NATURAL_PIPELINE_TF,
      engineOptions: NATURAL_PIPELINE_ENGINE_OPTIONS,
    }
  );
  const tradeContext = buildTradeSetupEvaluationContext(
    scan,
    {
      [NATURAL_PIPELINE_SYMBOL]: {
        candles,
        closedSeriesOnly: true,
        evaluationBarIndex,
      },
    },
    NATURAL_PIPELINE_ENGINE_OPTIONS
  );
  const setupDetection = detectSetups({
    scanReport: scan,
    tradeContext,
  });
  const production = detectProspectiveSetupProduction({
    historicalTradeSetups: setupDetection.candidates.filter((c) => c.isTradeSetup),
    tradeContext,
    candlesBySymbol: { [NATURAL_PIPELINE_SYMBOL]: candles },
  });
  return { tradeContext, setupDetection, production };
}

export type NaturalReplayMilestone = {
  bar: number;
  label: string;
  sample: ProspectiveSetupProductionCandidate | null;
};

export function discoverNaturalReplayMilestones(
  candles: Candle[],
  minBar = 55,
  maxBar = candles.length - 1
): NaturalReplayMilestone[] {
  const milestones: NaturalReplayMilestone[] = [];
  let sawSource = false;
  let sawOpenOnly = false;
  let sawSwingTransition = false;
  let sawConfirmed = false;

  for (let bar = minBar; bar <= maxBar; bar++) {
    const { production } = runProspectiveProductionPipelineAtBar(candles, bar);
    const ranked = [...production.candidates].sort((a, b) => {
      const score = (c: ProspectiveSetupProductionCandidate) => {
        if (c.status === "CONFIRMED") return 5;
        if (
          c.contract.transitionEvidence.transitionEvidenceLevel ===
          "STRUCTURAL_TRANSITION_CONFIRMED"
        ) {
          return 4;
        }
        if (
          c.contract.structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED"
        ) {
          return 3;
        }
        if (c.openLegResolution?.status === "AVAILABLE") return 2;
        if (c.funnelFirstFailure !== "SOURCE") return 1;
        return 0;
      };
      return score(b) - score(a);
    });
    const best = ranked[0] ?? null;

    if (!sawSource && best && best.funnelFirstFailure !== "SOURCE") {
      sawSource = true;
      milestones.push({ bar, label: "N1_HISTORICAL_SOURCE", sample: best });
    }
    if (
      !sawOpenOnly &&
      best &&
      best.contract.transitionEvidence.transitionEvidenceLevel ===
        "OPEN_MOVEMENT_ONLY"
    ) {
      sawOpenOnly = true;
      milestones.push({ bar, label: "N2_OPEN_MOVEMENT_ONLY", sample: best });
    }
    if (
      !sawSwingTransition &&
      best &&
      (best.contract.transitionEvidence.transitionEvidenceLevel ===
        "SWING_TRANSITION_OBSERVED" ||
        best.contract.structuralTransitionVerdict ===
          "STRUCTURAL_TRANSITION_OBSERVED")
    ) {
      sawSwingTransition = true;
      milestones.push({ bar, label: "N3_SWING_TRANSITION", sample: best });
    }
    if (
      !sawConfirmed &&
      production.candidates.some((c) => c.status === "CONFIRMED")
    ) {
      sawConfirmed = true;
      const confirmed = production.candidates.find((c) => c.status === "CONFIRMED")!;
      milestones.push({
        bar,
        label: "N4_PROSPECTIVE_CONFIRMED",
        sample: confirmed,
      });
      break;
    }
  }
  return milestones;
}
