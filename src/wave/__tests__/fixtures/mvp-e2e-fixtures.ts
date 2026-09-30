/**
 * TEST_ONLY deterministic fixtures for 14D.11 E2E validation.
 * Not market predictions, historical performance, or trade recommendations.
 */
import { buildEntryPlanFromSetup } from "../../setup/entry-plan";
import { buildTradeSetupEvaluationPipeline } from "../../setup/trade-setup-evaluation-pipeline";
import type { ObjectiveTargetSourceContext } from "../../setup/objective-target-candidate-types";
import type { EntryPlanCandidate } from "../../setup/entry-plan-types";
import type { SetupCandidate, SetupDetectionReport } from "../../setup/setup-types";
import { SETUP_SCHEMA_VERSION } from "../../setup/setup-types";
import type { TradeSetupEvaluationPipelineReport } from "../../setup/trade-setup-evaluation-pipeline-types";
import type { Candle } from "../../types";
import type { WaveScanReport } from "../../wave-scanner";

export const MVP_TF = "1H";

export const MVP_CLOSED_BAR = {
  evaluationBarIndex: 2,
  evaluationBarBoundaryEstablished: true,
  evaluationBarContractDetail: "14D.11 TEST_ONLY closedSeriesOnly attestation",
};

export const MVP_ENTRY_CANDLES: Candle[] = [
  { time: 0, open: 83_500, high: 83_600, low: 83_400, close: 84_000, volume: 1 },
  { time: 1, open: 84_000, high: 84_100, low: 83_900, close: 84_000, volume: 1 },
  { time: 2, open: 84_000, high: 84_100, low: 83_900, close: 84_000, volume: 1 },
];

/** Leg anchors tuned for TEST_ONLY target price 87_500 at extension level 1.618. */
const FIB_START_FOR_87500 = 84_000 - 3_500 / 0.618;

export function impulseContinuationSetup(
  symbol: string,
  overrides: Partial<SetupCandidate> = {}
): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: `${symbol}:${MVP_TF}:impulse-continuation:sc-imp`,
    symbol,
    timeframe: MVP_TF,
    scenarioRef: {
      scenarioId: "sc-imp",
      role: "PRIMARY",
      structure: "IMPULSE",
      waveLabel: "5",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
    },
    setupTypeId: "impulse-continuation",
    setupTypeLabel: "Impulse continuation (TEST_ONLY)",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    status: "CONFIRMED",
    directionalBias: "BULLISH",
    directionalBasis: "IMPULSE_COUNT_DIRECTION",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: {
      conditions: [
        {
          conditionId: "setup-invalidation-triggered",
          outcome: "NOT_MET",
          detail: "ok",
        },
      ],
      summary: "structural",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_END", label: "end", price: 84_500, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 82_900 },
    ],
    sourceScenario: {
      confidence: 1,
      startIndex: 0,
      endIndex: 2,
      startPrice: 83_000,
      endPrice: 84_500,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

export function correctionEndSetup(
  symbol: string,
  overrides: Partial<SetupCandidate> = {}
): SetupCandidate {
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id: `${symbol}:${MVP_TF}:correction-end:sc-corr`,
    symbol,
    timeframe: MVP_TF,
    scenarioRef: {
      scenarioId: "sc-corr",
      role: "PRIMARY",
      structure: "CORRECTIVE",
      waveLabel: "C",
      scenarioStatus: "ACTIVE",
      engineStatus: "CONFIRMED",
    },
    setupTypeId: "correction-end",
    setupTypeLabel: "Correction end (TEST_ONLY)",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    status: "CONFIRMED",
    directionalBias: "BEARISH",
    directionalBasis: "LEG_PRICE_DELTA",
    trigger: { conditions: [], summary: "" },
    confirmation: { conditions: [], summary: "" },
    invalidation: {
      conditions: [
        {
          conditionId: "setup-invalidation-triggered",
          outcome: "NOT_MET",
          detail: "ok",
        },
      ],
      summary: "structural",
      usesScenarioInvalidation: true,
    },
    referenceLevels: [
      { kind: "SEGMENT_END", label: "end", price: 81_000, index: 2 },
      { kind: "SCENARIO_INVALIDATION", label: "inv", price: 85_500 },
    ],
    sourceScenario: {
      confidence: 1,
      startIndex: 0,
      endIndex: 2,
      startPrice: 84_000,
      endPrice: 81_000,
      evidence: [],
      limitations: [],
    },
    context: {},
    setupLimitations: [],
    evaluationNotes: [],
    ...overrides,
  };
}

export function impulseObjectiveContextComplete(): ObjectiveTargetSourceContext {
  return {
    attestedFibonacciProjection: {
      rangeStartPrice: FIB_START_FOR_87500,
      rangeEndPrice: 84_000,
      extensionLevel: 1.618,
    },
  };
}

export function impulseObjectiveContextMultiAvailable(): ObjectiveTargetSourceContext {
  return {
    ...impulseObjectiveContextComplete(),
    diagnostics: {
      swingConfig: {} as never,
      confirmedSwingCount: 1,
      confirmedSwings: [
        { index: 0, type: "LOW", price: 88_100, time: 0, strength: 1 },
      ],
      structurePairs: [],
      allStructures: [],
      trendSource: { marketTrend: "BULLISH", trendRuleSummary: "TEST_ONLY" },
      waveLegs: [],
      fibonacci: { available: false },
      focus: { primary: null, alternative: null },
      overlaps: [],
      presentation: {} as never,
    },
    attestedWaveStructureTarget: {
      targetPrice: 89_000,
      evidenceRef: "TEST_ONLY structure attestation",
    },
  };
}

export function correctionObjectiveContextAbcOnly(): ObjectiveTargetSourceContext {
  return {
    attestedAbcProjection: {
      targetPrice: 78_500,
      legAStartPrice: 84_000,
      legAEndPrice: 81_000,
      legCStartPrice: 82_000,
      attestationDetail: "TEST_ONLY ABC attestation (not Wave C label inference)",
    },
  };
}

export function mvpBundle() {
  return {
    timeframeId: MVP_TF,
    evaluationBarIndex: MVP_CLOSED_BAR.evaluationBarIndex,
    evaluationBarBoundaryEstablished: MVP_CLOSED_BAR.evaluationBarBoundaryEstablished,
    evaluationBarContractDetail: MVP_CLOSED_BAR.evaluationBarContractDetail,
    candleCount: MVP_ENTRY_CANDLES.length,
    diagnostics: {} as never,
    presentation: {} as never,
  };
}

export function mvpScan(symbols: string[]): WaveScanReport {
  return {
    timeframe: MVP_TF,
    symbols,
    results: [],
    errors: [],
    limitations: [],
  };
}

export function mvpSetupReport(
  candidates: SetupCandidate[]
): SetupDetectionReport {
  const symbols = [...new Set(candidates.map((c) => c.symbol))].sort();
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    timeframe: MVP_TF,
    symbols,
    candidates,
    candidateCount: candidates.length,
    errors: [],
    limitations: [],
  };
}

export function buildMvpPipeline(input: {
  symbols: string[];
  candidates: SetupCandidate[];
  objectiveBySymbol: Record<string, ObjectiveTargetSourceContext>;
  candlesBySymbol?: Record<string, Candle[]>;
}): TradeSetupEvaluationPipelineReport {
  const scan = mvpScan(input.symbols);
  const candlesBySymbol = input.candlesBySymbol ?? {};
  for (const sym of input.symbols) {
    if (!candlesBySymbol[sym]) {
      candlesBySymbol[sym] = MVP_ENTRY_CANDLES;
    }
  }
  const bundles: Record<string, ReturnType<typeof mvpBundle>> = {};
  for (const sym of input.symbols) {
    bundles[sym] = mvpBundle();
  }
  return buildTradeSetupEvaluationPipeline({
    scanReport: scan,
    tradeContext: { scanReport: scan, bundlesBySymbol: bundles },
    candlesBySymbol,
    setupDetectionReport: mvpSetupReport(input.candidates),
    objectiveTargetSourceContextBySymbol: input.objectiveBySymbol,
  });
}

export function entryPlanFromSetup(setup: SetupCandidate): EntryPlanCandidate {
  const { plan } = buildEntryPlanFromSetup({
    setup,
    evaluationBar: MVP_CLOSED_BAR,
  });
  if (!plan) {
    throw new Error("TEST_ONLY fixture expected eligible entry plan");
  }
  return plan;
}

export const MVP_RR = {
  entry: 84_000,
  stop: 82_900,
  target: 87_500,
  risk: 1_100,
  reward: 3_500,
  ratio: 3_500 / 1_100,
};
