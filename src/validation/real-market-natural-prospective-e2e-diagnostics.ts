import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../browser/demo-ohlcv";
import { buildTradeSetupEvaluationContext } from "../wave/setup/trade-setup-context";
import { detectSetups } from "../wave/setup/setup-detector";
import {
  detectProspectiveSetupProduction,
  evaluateProspectiveSetupProduction,
} from "../wave/setup/prospective-setup-production";
import { evaluateProspectiveReferenceBundle } from "../wave/setup/prospective-reference-evaluation";
import { runWaveScan } from "../wave/wave-scanner";

export type RealMarketNaturalProspectiveE2EDiagnostics = ReturnType<
  typeof buildNaturalProspectiveE2EDiagnostics
>;

/** Offline deterministic fixture (demo OHLCV bar 22), not live market counts. */
export function buildNaturalProspectiveE2EDiagnostics() {
  const bar = 22;
  const scan = runWaveScan([{ symbol: "BTCUSDT", candles: DEMO_OHLCV }], {
    timeframe: "1H",
    engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
  });
  const tradeContext = buildTradeSetupEvaluationContext(
    scan,
    {
      BTCUSDT: {
        candles: DEMO_OHLCV,
        closedSeriesOnly: true,
        evaluationBarIndex: bar,
      },
    },
    DEMO_WAVE_ENGINE_OPTIONS
  );
  const setups = detectSetups({ scanReport: scan, tradeContext }).candidates.filter(
    (c) => c.isTradeSetup
  );
  const production = detectProspectiveSetupProduction({
    historicalTradeSetups: setups,
    tradeContext,
    candlesBySymbol: { BTCUSDT: DEMO_OHLCV },
  });
  const impulse = setups.find((c) => c.id.endsWith("candidate-impulse-1"));
  const bundle = tradeContext.bundlesBySymbol!.BTCUSDT;
  let referenceReady = false;
  if (impulse) {
    const row = evaluateProspectiveSetupProduction({
      historicalSetup: impulse,
      bundle,
      candles: DEMO_OHLCV,
    });
    const refs = evaluateProspectiveReferenceBundle({
      production: row,
      historicalSetup: impulse,
      bundle,
      candles: DEMO_OHLCV,
    });
    referenceReady = refs.readyForFurtherEvaluation;
  }

  return {
    schemaVersion: "1.0" as const,
    fixture: "DEMO_OHLCV",
    evaluationBarIndex: bar,
    prospectiveConfirmed: production.summary.confirmed ?? 0,
    objectiveEligible: production.summary.objectiveEligible ?? 0,
    targetGatePass: production.summary.targetGatePass ?? 0,
    referenceReadyForFurtherEvaluation: referenceReady,
    prefixInvariantCheckedInUnitTests: true,
  };
}
