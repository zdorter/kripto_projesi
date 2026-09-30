import { getRiskRewardModelDefinition } from "./risk-reward-model-catalog";
import type {
  RiskRewardModelBuildResult,
  RiskRewardModelEvaluateInput,
  RiskRewardModelId,
  RiskRewardReference,
  RiskRewardReferenceOutcome,
} from "./risk-reward-model-types";
import { RISK_REWARD_MODEL_SCHEMA_VERSION } from "./risk-reward-model-types";
import type { SetupDirectionalBias } from "./setup-types";

const REPORT_LIMITATIONS = [
  "Risk/reward figures are mathematical references from entry, stop, and target prices only.",
  "RR ratio is not trade quality, expected return, or a recommendation.",
  "No position sizing, leverage, or order execution is derived from this layer.",
  "This model does not produce entry, stop, or target references.",
];

function baseReference(
  modelId: RiskRewardModelId,
  modelLabel: string,
  outcome: RiskRewardReferenceOutcome,
  directionalBias: SetupDirectionalBias | null,
  rationale: string,
  limitations: string[],
  extra?: Partial<
    Pick<
      RiskRewardReference,
      | "entryPlanId"
      | "setupTypeId"
      | "entryPrice"
      | "stopPrice"
      | "targetPrice"
      | "riskAmount"
      | "rewardAmount"
      | "riskRewardRatio"
    >
  >
): RiskRewardReference {
  return {
    schemaVersion: RISK_REWARD_MODEL_SCHEMA_VERSION,
    modelId,
    modelLabel,
    outcome,
    directionalBias,
    rationale,
    limitations,
    ...extra,
  };
}

function finitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function resolveDirectionalBias(
  input: RiskRewardModelEvaluateInput
): SetupDirectionalBias | null {
  if (
    input.entry?.directionalBias == null ||
    input.stop?.directionalBias == null ||
    input.target?.directionalBias == null
  ) {
    return null;
  }
  const biases = [
    input.entry.directionalBias,
    input.stop.directionalBias,
    input.target.directionalBias,
  ];
  const first = biases[0];
  if (!biases.every((b) => b === first)) {
    return null;
  }
  return first;
}

function evaluateReferenceTripletRiskReward(
  input: RiskRewardModelEvaluateInput
): RiskRewardReference {
  const def = getRiskRewardModelDefinition("REFERENCE_TRIPLET_RISK_REWARD")!;
  const limitations = [
    "Prices are reference values from upstream models, not executable order prices.",
  ];

  const entry = input.entry;
  const stop = input.stop;
  const target = input.target;

  if (!entry || entry.outcome !== "ENTRY_REFERENCE_AVAILABLE") {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      entry?.directionalBias ?? null,
      "Entry reference is missing or not ENTRY_REFERENCE_AVAILABLE.",
      limitations
    );
  }
  if (!stop || stop.outcome !== "STOP_REFERENCE_AVAILABLE") {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      stop?.directionalBias ?? entry.directionalBias,
      "Stop reference is missing or not STOP_REFERENCE_AVAILABLE.",
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
      }
    );
  }
  if (!target || target.outcome !== "TARGET_REFERENCE_AVAILABLE") {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      target?.directionalBias ?? entry.directionalBias,
      "Target reference is missing or not TARGET_REFERENCE_AVAILABLE.",
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
      }
    );
  }

  const bias = resolveDirectionalBias(input);
  if (bias === null) {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      null,
      "Directional bias is null or inconsistent across references.",
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
      }
    );
  }

  const entryPrice = entry.referencePrice;
  const stopPrice = stop.stopPrice;
  const targetPrice = target.targetPrice;

  if (
    entryPrice === undefined ||
    stopPrice === undefined ||
    targetPrice === undefined ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopPrice) ||
    !Number.isFinite(targetPrice)
  ) {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      bias,
      "Entry, stop, or target reference price is missing or non-finite.",
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
        entryPrice,
        stopPrice,
        targetPrice,
      }
    );
  }

  let risk: number;
  let reward: number;

  if (bias === "BULLISH") {
    if (!(stopPrice < entryPrice && entryPrice < targetPrice)) {
      return baseReference(
        "REFERENCE_TRIPLET_RISK_REWARD",
        def.label,
        "INSUFFICIENT_CONTEXT",
        bias,
        `BULLISH geometry requires stopPrice < entryPrice < targetPrice; got ${stopPrice}, ${entryPrice}, ${targetPrice}.`,
        limitations,
        {
          entryPlanId: entry.entryPlanId,
          setupTypeId: entry.setupTypeId,
          entryPrice,
          stopPrice,
          targetPrice,
        }
      );
    }
    risk = entryPrice - stopPrice;
    reward = targetPrice - entryPrice;
  } else {
    if (!(targetPrice < entryPrice && entryPrice < stopPrice)) {
      return baseReference(
        "REFERENCE_TRIPLET_RISK_REWARD",
        def.label,
        "INSUFFICIENT_CONTEXT",
        bias,
        `BEARISH geometry requires targetPrice < entryPrice < stopPrice; got ${targetPrice}, ${entryPrice}, ${stopPrice}.`,
        limitations,
        {
          entryPlanId: entry.entryPlanId,
          setupTypeId: entry.setupTypeId,
          entryPrice,
          stopPrice,
          targetPrice,
        }
      );
    }
    risk = stopPrice - entryPrice;
    reward = entryPrice - targetPrice;
  }

  if (!finitePositive(risk) || !finitePositive(reward)) {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      bias,
      `Risk and reward must be finite and > 0; risk=${risk}, reward=${reward}.`,
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
        entryPrice,
        stopPrice,
        targetPrice,
        riskAmount: risk,
        rewardAmount: reward,
      }
    );
  }

  const riskRewardRatio = reward / risk;

  if (!Number.isFinite(riskRewardRatio)) {
    return baseReference(
      "REFERENCE_TRIPLET_RISK_REWARD",
      def.label,
      "INSUFFICIENT_CONTEXT",
      bias,
      "Risk/reward ratio is not finite.",
      limitations,
      {
        entryPlanId: entry.entryPlanId,
        setupTypeId: entry.setupTypeId,
        entryPrice,
        stopPrice,
        targetPrice,
        riskAmount: risk,
        rewardAmount: reward,
      }
    );
  }

  return baseReference(
    "REFERENCE_TRIPLET_RISK_REWARD",
    def.label,
    "RR_REFERENCE_AVAILABLE",
    bias,
    `Risk ${risk}, reward ${reward}, ratio ${riskRewardRatio} from reference triplet.`,
    limitations,
    {
      entryPlanId: entry.entryPlanId,
      setupTypeId: entry.setupTypeId,
      entryPrice,
      stopPrice,
      targetPrice,
      riskAmount: risk,
      rewardAmount: reward,
      riskRewardRatio,
    }
  );
}

export function evaluateRiskRewardModel(
  modelId: RiskRewardModelId,
  input: RiskRewardModelEvaluateInput
): RiskRewardReference {
  const def = getRiskRewardModelDefinition(modelId);
  if (!def) {
    return baseReference(
      modelId,
      modelId,
      "NOT_APPLICABLE",
      null,
      "Unknown risk/reward model id.",
      []
    );
  }
  if (modelId === "REFERENCE_TRIPLET_RISK_REWARD") {
    return evaluateReferenceTripletRiskReward(input);
  }
  return baseReference(
    modelId,
    def.label,
    "NOT_APPLICABLE",
    null,
    "Model not implemented.",
    []
  );
}

export function buildRiskRewardReport(
  input: RiskRewardModelEvaluateInput
): RiskRewardModelBuildResult {
  const ref = evaluateRiskRewardModel("REFERENCE_TRIPLET_RISK_REWARD", input);
  return {
    report: {
      schemaVersion: RISK_REWARD_MODEL_SCHEMA_VERSION,
      references: [ref],
      limitations: REPORT_LIMITATIONS,
    },
  };
}

export function riskRewardReferencesAvailable(
  report: RiskRewardModelBuildResult["report"]
): RiskRewardReference[] {
  return report.references.filter((r) => r.outcome === "RR_REFERENCE_AVAILABLE");
}
