import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import { detectSwings } from "../swing-detector";
import { analyzeWaveWithDiagnostics } from "../analysis-pipeline";
import {
  analyzeWaveAtEvaluationBar,
  analyzeWaveAtEvaluationBarFromSeries,
  buildWaveScenariosAtEvaluationBar,
  compareFullVsScopedWaveAnalysis,
  evaluationScopedOpenLegVerdict,
  scanSymbolWaveScenariosAtEvaluationBar,
} from "../evaluation-scoped-analysis";
import { collectEvaluationScopedInvariantViolations } from "../evaluation-scoped-invariants";
import { buildSymbolEvaluationBundleAtEvaluationBar } from "../setup/trade-setup-context";
import { resolveProspectiveSetupContract } from "../setup/prospective-setup-contract";
import { PRODUCTION_FIBONACCI_PROJECTION_POLICIES } from "../setup/fibonacci-projection-policy";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { Candle } from "../types";
import type { SetupCandidate } from "../setup/setup-types";

function syntheticSeries(length: number, post60Amplitude = 0): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    const base = 100 + Math.sin(i / 8) * 5 + i * 0.02;
    const shock = i > 60 ? post60Amplitude * Math.sin(i / 2) : 0;
    const close = base + shock;
    candles.push({
      time: i * 3_600_000,
      open: close - 0.5,
      high: close + 1 + Math.abs(shock),
      low: close - 1 - Math.abs(shock),
      close,
      volume: 1000 + i,
    });
  }
  return candles;
}

function mutateFutureTail(candles: Candle[], factor: number): Candle[] {
  const out = candles.map((c) => ({ ...c }));
  for (let i = 61; i < out.length; i++) {
    out[i] = {
      ...out[i],
      open: out[i].open * factor,
      high: out[i].high * factor,
      low: out[i].low * factor,
      close: out[i].close * factor,
      volume: out[i].volume * (factor > 0 ? 2 : 1),
    };
  }
  return out;
}

describe("evaluation-scoped wave analysis (14N-F)", () => {
  it("A: slice before analysis — used count is N+1", () => {
    const N = 20;
    const r = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(r.status, "OK");
    assert.equal(r.evidence.usedCandleCount, N + 1);
    assert.equal(r.evidence.maxCandleIndexUsed, N);
  });

  it("B: invalid evaluation index", () => {
    const r = analyzeWaveAtEvaluationBar({
      candles: DEMO_OHLCV,
      evaluationBarIndex: DEMO_OHLCV.length + 5,
      closedSeriesOnly: true,
    });
    assert.equal(r.status, "INVALID_EVALUATION_INDEX");
  });

  it("C: engine path does not read candles beyond N", () => {
    const base = syntheticSeries(101, 50);
    const mutated = mutateFutureTail(base, 1.5);
    const N = 60;
    const a = analyzeWaveAtEvaluationBarFromSeries(base, N, {
      closedSeriesOnly: true,
    });
    const b = analyzeWaveAtEvaluationBarFromSeries(mutated, N, {
      closedSeriesOnly: true,
    });
    assert.equal(a.status, "OK");
    assert.equal(b.status, "OK");
    assert.deepEqual(a.analysis, b.analysis);
    assert.deepEqual(a.diagnostics?.confirmedSwings, b.diagnostics?.confirmedSwings);
  });

  it("D: swing confirmation lag — scoped has no post-bar confirmed swings", () => {
    const N = 18;
    const full = analyzeWaveWithDiagnostics(DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS);
    const scoped = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(scoped.status, "OK");
    const scopedSwings = scoped.diagnostics!.confirmedSwings;
    assert.ok(scopedSwings.every((s) => s.index <= N));
    const fullAfterN = full.diagnostics.confirmedSwings.filter((s) => s.index > N);
    if (fullAfterN.length > 0) {
      assert.ok(
        scopedSwings.length <= full.diagnostics.confirmedSwingCount
      );
    }
  });

  it("E–G: wave/presentation/diagnostics indices <= N", () => {
    const N = 22;
    const r = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    assert.equal(r.status, "OK");
    assert.equal(r.futureSafe, true);
    assert.equal(r.invariantViolations.length, 0);
    const violations = collectEvaluationScopedInvariantViolations(
      r.presentation!,
      r.diagnostics!,
      N
    );
    assert.equal(violations.length, 0);
  });

  it("H: scenario indices <= N", () => {
    const N = 22;
    const { scoped, scenarioInvariantViolations } =
      buildWaveScenariosAtEvaluationBar(DEMO_OHLCV, "1H", "BTCUSDT", N, {
        closedSeriesOnly: true,
        engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
    assert.equal(scoped.status, "OK");
    assert.equal(scenarioInvariantViolations.length, 0);
  });

  it("I: prefix invariance (main regression)", () => {
    const base = syntheticSeries(101, 40);
    const alt = mutateFutureTail(base, 0.5);
    const N = 60;
    const a = analyzeWaveAtEvaluationBarFromSeries(base, N, {
      closedSeriesOnly: true,
    });
    const b = analyzeWaveAtEvaluationBarFromSeries(alt, N, {
      closedSeriesOnly: true,
    });
    assert.deepEqual(a.analysis, b.analysis);
    assert.deepEqual(a.presentation, b.presentation);
    assert.deepEqual(a.diagnostics, b.diagnostics);
  });

  it("J: extreme future mutation invariance", () => {
    const base = syntheticSeries(101, 10);
    for (const factor of [1.5, 0.5, 2.0, 0.3]) {
      const alt = mutateFutureTail(base, factor);
      const N = 60;
      const a = analyzeWaveAtEvaluationBarFromSeries(base, N, {
        closedSeriesOnly: true,
      });
      const b = analyzeWaveAtEvaluationBarFromSeries(alt, N, {
        closedSeriesOnly: true,
      });
      assert.deepEqual(a.analysis, b.analysis);
    }
  });

  it("K: deterministic replay N / N+5", () => {
    const N = 15;
    const opts = {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    };
    const r1 = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, opts);
    const r2 = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, opts);
    assert.deepEqual(r1, r2);
    const r5 = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N + 5, opts);
    assert.notDeepEqual(r1.analysis, r5.analysis);
  });

  it("L: live last-bar parity with closedSeriesOnly", () => {
    const last = DEMO_OHLCV.length - 1;
    const cmp = compareFullVsScopedWaveAnalysis(DEMO_OHLCV, last, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      timeframeId: "1H",
      symbol: "BTCUSDT",
    });
    assert.equal(cmp.parityAtLastClosedBar, true);
  });

  it("M: diagnostics recompute uses sliced candles only", () => {
    const N = 21;
    const effective = DEMO_OHLCV.slice(0, N + 1);
    const scoped = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const directSwings = detectSwings(effective, DEMO_WAVE_ENGINE_OPTIONS.swing);
    const scopedConfirmed = scoped.diagnostics!.confirmedSwings;
    const directConfirmed = directSwings
      .filter((s) => s.confirmed)
      .map((s) => s.index);
    assert.deepEqual(
      scopedConfirmed.map((s) => s.index),
      directConfirmed
    );
  });

  it("N: prospective contract with scoped bundle — no lookahead when futureSafe", () => {
    const setup: SetupCandidate = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      id: "t:impulse-continuation:3",
      symbol: "BTCUSDT",
      timeframe: "1H",
      scenarioRef: {
        scenarioId: "s",
        role: "CANDIDATE",
        structure: "IMPULSE",
        waveLabel: "3",
        scenarioStatus: "ACTIVE",
        engineStatus: "CONFIRMED",
      },
      setupTypeId: "impulse-continuation",
      setupTypeLabel: "x",
      category: "TRADE_SETUP",
      isTradeSetup: true,
      status: "CONFIRMED",
      directionalBias: "BULLISH",
      directionalBasis: "IMPULSE_COUNT_DIRECTION",
      trigger: { conditions: [], summary: "" },
      confirmation: { conditions: [], summary: "" },
      invalidation: {
        conditions: [{ conditionId: "x", outcome: "MET", detail: "" }],
        summary: "x",
        usesScenarioInvalidation: true,
      },
      referenceLevels: [],
      sourceScenario: {
        confidence: 1,
        startIndex: 10,
        endIndex: 20,
        startPrice: 1,
        endPrice: 2,
        evidence: [],
        limitations: [],
      },
      context: {},
      setupLimitations: [],
      evaluationNotes: [],
    };
    const N = 22;
    const bundle = buildSymbolEvaluationBundleAtEvaluationBar(
      DEMO_OHLCV,
      "1H",
      { evaluationBarIndex: N, closedSeriesOnly: true },
      DEMO_WAVE_ENGINE_OPTIONS
    );
    const r = resolveProspectiveSetupContract({
      historicalSetup: setup,
      bundle,
      candles: DEMO_OHLCV.slice(0, N + 1),
    });
    if (bundle.diagnostics.confirmedSwings.every((s) => s.index <= N)) {
      const waves = bundle.presentation?.engine?.flatWaves ?? [];
      const noFutureEnd = waves.every((w) => w.endIndex <= N);
      if (noFutureEnd) {
        assert.equal(r.potentialLookaheadRisk, false);
      }
    }
  });

  it("O: no fake pivot at N — evaluation bar is not injected as swing", () => {
    const N = 20;
    const r = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const swingAtN = r.diagnostics!.confirmedSwings.find((s) => s.index === N);
    if (swingAtN) {
      const eff = DEMO_OHLCV.slice(0, N + 1);
      const swings = detectSwings(eff, DEMO_WAVE_ENGINE_OPTIONS.swing);
      const pivot = swings.find((s) => s.index === N && s.confirmed);
      assert.ok(pivot);
    }
  });

  it("P: production Fib registry empty", () => {
    assert.equal(PRODUCTION_FIBONACCI_PROJECTION_POLICIES.length, 0);
  });

  it("open leg verdict with scoped engine", () => {
    const N = 20;
    const scoped = analyzeWaveAtEvaluationBarFromSeries(DEMO_OHLCV, N, {
      closedSeriesOnly: true,
      engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
    });
    const verdict = evaluationScopedOpenLegVerdict(scoped);
    const bar = N;
    const hasOpen = scoped.presentation?.engine.flatWaves.some(
      (w) => w.startIndex <= bar && w.endIndex > bar
    );
    if (hasOpen) {
      assert.equal(verdict, "OPEN_LEG_REPRESENTABLE_WITH_SCOPED_ENGINE");
    } else {
      assert.equal(verdict, "NEEDS_OPEN_LEG_ABSTRACTION");
    }
  });

  it("scoped scan uses sliced candles", () => {
    const N = 22;
    const { results } = scanSymbolWaveScenariosAtEvaluationBar(
      { symbol: "BTCUSDT", candles: DEMO_OHLCV },
      N,
      {
        timeframe: "1H",
        closedSeriesOnly: true,
        engineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      }
    );
    assert.ok(results.every((r) => r.endIndex <= N && r.startIndex <= N));
  });

  it("historical fixture N=60 unaffected by tail", () => {
    const series = syntheticSeries(101, 80);
    const at60 = analyzeWaveAtEvaluationBarFromSeries(series, 60, {
      closedSeriesOnly: true,
    });
    const wild = mutateFutureTail(series, 2);
    const at60Wild = analyzeWaveAtEvaluationBarFromSeries(wild, 60, {
      closedSeriesOnly: true,
    });
    assert.deepEqual(at60.analysis, at60Wild.analysis);
  });
});
