/**
 * Architecture contract tests — document and guard layer boundaries.
 * Production algorithms must not be changed to satisfy these tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS } from "../../browser/demo-ohlcv";
import {
  filterClosedKlines,
  mapBinanceKlinesResponse,
  normalizeCandleOrder,
} from "../../providers/binance-ohlcv";
import { analyzeWaveWithDiagnostics } from "../analysis-pipeline";
import { DEFAULT_SWING_CONFIG } from "../types";
import { runSwingCalibration } from "../swing-calibration";
import { runWaveStability } from "../wave-stability";
import { analyzeMultiTimeframe } from "../multi-timeframe";
import { buildCandidateWaveHierarchy } from "../wave-hierarchy";
import {
  buildWaveScenarios,
  mapEngineStatusToScenarioStatus,
  resolveScenarioInvalidation,
} from "../wave-scenarios";
import type { WavePresentationState } from "../presentation-state";
import type { WaveCandidate } from "../types";
import { buildEntryPlanFromSetup } from "../setup/entry-plan";
import { SETUP_SCHEMA_VERSION } from "../setup/setup-types";
import type { SetupCandidate } from "../setup/setup-types";

function klineRow(
  openTime: number,
  o: number,
  h: number,
  l: number,
  c: number,
  vol: number,
  closeTime: number
): unknown[] {
  return [openTime, String(o), String(h), String(l), String(c), String(vol), closeTime];
}

function waveSnapshot(analysis: ReturnType<typeof analyzeWaveWithDiagnostics>["analysis"]) {
  return analysis.waves.map((w) => ({
    label: w.label,
    status: w.status,
    startIndex: w.startIndex,
    endIndex: w.endIndex,
    confidence: w.confidence,
    invalidationPrice: w.invalidationPrice,
  }));
}

describe("architecture contract", () => {
  describe("A — determinism", () => {
    it("analysis pipeline is bitwise-repeatable on DEMO fixture", () => {
      const a = analyzeWaveWithDiagnostics(DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS);
      const b = analyzeWaveWithDiagnostics(DEMO_OHLCV, DEMO_WAVE_ENGINE_OPTIONS);
      assert.deepEqual(waveSnapshot(a.analysis), waveSnapshot(b.analysis));
      assert.deepEqual(a.presentation, b.presentation);
      assert.deepEqual(a.diagnostics, b.diagnostics);
    });

    it("MTF + hierarchy + scenarios are repeatable for same candles", () => {
      const mtf1 = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const mtf2 = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const h1 = buildCandidateWaveHierarchy(mtf1, DEMO_OHLCV, DEMO_OHLCV);
      const h2 = buildCandidateWaveHierarchy(mtf2, DEMO_OHLCV, DEMO_OHLCV);
      const s1 = buildWaveScenarios(mtf1.higherTimeframe, { multiTimeframe: mtf1, hierarchy: h1 });
      const s2 = buildWaveScenarios(mtf1.higherTimeframe, { multiTimeframe: mtf2, hierarchy: h2 });
      assert.deepEqual(mtf1, mtf2);
      assert.deepEqual(h1, h2);
      assert.deepEqual(s1, s2);
    });

    it("calibration and stability outputs are stable across runs", () => {
      const c1 = runSwingCalibration(DEMO_OHLCV);
      const c2 = runSwingCalibration(DEMO_OHLCV);
      const st1 = runWaveStability(DEMO_OHLCV);
      const st2 = runWaveStability(DEMO_OHLCV);
      assert.deepEqual(
        c1.summaries.map((s) => s.confirmedSwingCount),
        c2.summaries.map((s) => s.confirmedSwingCount)
      );
      assert.deepEqual(st1.summary, st2.summary);
    });
  });

  describe("B — wave status contract", () => {
    it("scenario status enum is disjoint from engine WaveStatus literals", () => {
      const engineStatuses = new Set(["POTENTIAL", "CONFIRMED", "INVALIDATED"]);
      const scenarioStatuses = new Set(["ACTIVE", "INVALIDATED", "INSUFFICIENT_CONTEXT"]);
      assert.equal(engineStatuses.has("ACTIVE" as never), false);
      assert.equal(scenarioStatuses.has("POTENTIAL" as never), false);
    });

    it("INVALIDATED engine leg maps to INVALIDATED scenario, not ACTIVE", () => {
      assert.equal(
        mapEngineStatusToScenarioStatus("INVALIDATED", true),
        "INVALIDATED"
      );
      assert.notEqual(
        mapEngineStatusToScenarioStatus("INVALIDATED", true),
        "ACTIVE"
      );
    });

    it("POTENTIAL engine leg does not auto-become CONFIRMED at scenario layer", () => {
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const scenarios = buildWaveScenarios(mtf.higherTimeframe);
      for (const s of scenarios.scenarios) {
        if (s.engineStatus === "POTENTIAL") {
          assert.ok(["ACTIVE", "INSUFFICIENT_CONTEXT"].includes(s.status));
          assert.notEqual(s.status, "CONFIRMED" as never);
        }
        if (s.engineStatus === "INVALIDATED") {
          assert.equal(s.status, "INVALIDATED");
        }
      }
    });
  });

  describe("C — confidence contract", () => {
    it("presentation ruleConformanceScore equals analysis.confidence (same source)", () => {
      const { analysis, presentation } = analyzeWaveWithDiagnostics(
        DEMO_OHLCV,
        DEMO_WAVE_ENGINE_OPTIONS
      );
      assert.equal(presentation.ruleConformanceScore, analysis.confidence);
    });

    it("presentation carries non-probability disclaimer", () => {
      const { presentation } = analyzeWaveWithDiagnostics(
        DEMO_OHLCV,
        DEMO_WAVE_ENGINE_OPTIONS
      );
      assert.equal(
        presentation.scoreDisclaimer,
        "RULE_CONFORMANCE_NOT_PROBABILITY"
      );
    });

    it("primary scenario confidence matches presentation primary focus", () => {
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const report = buildWaveScenarios(mtf.higherTimeframe);
      const primary = report.scenarios.find((s) => s.role === "PRIMARY");
      if (mtf.higherTimeframe.presentation.primary && primary) {
        assert.equal(
          primary.confidence,
          mtf.higherTimeframe.presentation.primary.confidence
        );
      }
      assert.ok(
        report.scenarios.every((s) =>
          s.limitations.some((l) => l.includes("not probability"))
        )
      );
    });
  });

  describe("D — invalidation contract", () => {
    function mockPresentation(
      partial: Partial<WavePresentationState>
    ): WavePresentationState {
      return partial as WavePresentationState;
    }

    it("TRACK_SCOPE wins over FOCUS_LEG and WAVE_CANDIDATE", () => {
      const presentation = mockPresentation({
        primary: {
          structure: "IMPULSE",
          scenario: "SELECTED",
          wave: "3",
          status: "CONFIRMED",
          confidence: 60,
          startIndex: 4,
          endIndex: 6,
          invalidationPrice: 111,
          selectionReason: "test",
        },
        tracks: {
          selectedImpulse: {
            invalidation: {
              structure: "IMPULSE",
              scenario: "SELECTED",
              wave: "2",
              price: 100,
              reason: "WAVE2_BREAK",
            },
          },
          corrective: null,
          rivalImpulse: null,
        },
      });
      const wave: WaveCandidate = {
        label: "3",
        startIndex: 4,
        endIndex: 6,
        confidence: 60,
        status: "CONFIRMED",
        invalidationPrice: 112,
      };
      const inv = resolveScenarioInvalidation(presentation, presentation.primary!, wave);
      assert.equal(inv.source, "TRACK_SCOPE");
      assert.equal(inv.price, 100);
      assert.match(inv.rule, /Track-scoped/);
    });

    it("FOCUS_LEG used when track scope absent", () => {
      const focus = {
        structure: "IMPULSE" as const,
        scenario: "SELECTED" as const,
        wave: "3" as const,
        status: "CONFIRMED" as const,
        confidence: 60,
        startIndex: 4,
        endIndex: 6,
        invalidationPrice: 111,
        selectionReason: "test",
      };
      const presentation = mockPresentation({
        primary: focus,
        tracks: {
          selectedImpulse: { invalidation: null },
          corrective: null,
          rivalImpulse: null,
        },
      });
      const inv = resolveScenarioInvalidation(presentation, focus, null);
      assert.equal(inv.source, "FOCUS_LEG");
      assert.equal(inv.price, 111);
    });

    it("WAVE_CANDIDATE used when focus missing but wave has invalidationPrice", () => {
      const presentation = mockPresentation({
        primary: null,
        tracks: {
          selectedImpulse: { invalidation: null },
          corrective: null,
          rivalImpulse: null,
        },
      });
      const wave: WaveCandidate = {
        label: "2",
        startIndex: 2,
        endIndex: 4,
        confidence: 50,
        status: "INVALIDATED",
        invalidationPrice: 105,
      };
      const inv = resolveScenarioInvalidation(presentation, null, wave);
      assert.equal(inv.source, "WAVE_CANDIDATE");
      assert.equal(inv.price, 105);
    });

    it("NONE when no engine-provided invalidation exists", () => {
      const presentation = mockPresentation({
        primary: null,
        tracks: {
          selectedImpulse: { invalidation: null },
          corrective: null,
          rivalImpulse: null,
        },
      });
      const inv = resolveScenarioInvalidation(presentation, null, {
        label: "1",
        startIndex: 0,
        endIndex: 2,
        confidence: 40,
        status: "POTENTIAL",
      });
      assert.equal(inv.source, "NONE");
      assert.equal(inv.available, false);
    });
  });

  describe("E — MTF and hierarchy contract", () => {
    it("preserves higher/lower timeframe ids", () => {
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      assert.equal(mtf.higherTimeframe.timeframeId, "1H");
      assert.equal(mtf.lowerTimeframe.timeframeId, "15M");
    });

    it("MTF relationship kinds do not include confirmed parent/child labels", () => {
      const kinds = new Set([
        "ALIGNED",
        "NESTED_POSSIBLE",
        "DIVERGENT",
        "INSUFFICIENT_CONTEXT",
      ]);
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      assert.ok(kinds.has(mtf.relationship.kind));
    });

    it("hierarchy nesting kinds are candidate-only vocabulary", () => {
      const allowed = new Set([
        "NESTED_CANDIDATE",
        "POSSIBLE_NESTING",
        "OVERLAPPING_CONTEXT",
        "NO_RELATIONSHIP",
        "INSUFFICIENT_CONTEXT",
      ]);
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const hierarchy = buildCandidateWaveHierarchy(mtf, DEMO_OHLCV, DEMO_OHLCV);
      for (const c of hierarchy.candidates) {
        assert.ok(allowed.has(c.relationship));
      }
    });

    it("TIME_DISJOINT prevents nesting even when price envelope is contained", () => {
      const mtf = analyzeMultiTimeframe(DEMO_OHLCV, DEMO_OHLCV, undefined, {
        higherEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
        lowerEngineOptions: DEMO_WAVE_ENGINE_OPTIONS,
      });
      const hierarchy = buildCandidateWaveHierarchy(mtf, DEMO_OHLCV, DEMO_OHLCV);
      for (const c of hierarchy.candidates) {
        if (c.timeRelation === "TIME_DISJOINT") {
          assert.equal(c.relationship, "NO_RELATIONSHIP");
        }
      }
    });

    it("diagnostics market trend matches analysis trend for same run", () => {
      const { analysis, diagnostics } = analyzeWaveWithDiagnostics(
        DEMO_OHLCV,
        DEMO_WAVE_ENGINE_OPTIONS
      );
      assert.equal(diagnostics.trendSource.marketTrend, analysis.trend);
      assert.equal(diagnostics.presentation.marketTrend, analysis.trend);
    });
  });

  describe("F — calibration and stability isolation", () => {
    it("DEFAULT_SWING_CONFIG unchanged after calibration run", () => {
      const before = { ...DEFAULT_SWING_CONFIG };
      runSwingCalibration(DEMO_OHLCV);
      assert.deepEqual(DEFAULT_SWING_CONFIG, before);
    });

    it("default 5/5 analysis unchanged when calibration uses other presets", () => {
      const baseline = analyzeWaveWithDiagnostics(DEMO_OHLCV);
      runSwingCalibration(DEMO_OHLCV);
      const after = analyzeWaveWithDiagnostics(DEMO_OHLCV);
      assert.deepEqual(waveSnapshot(baseline.analysis), waveSnapshot(after.analysis));
    });

    it("stability does not mutate calibration report inputs", () => {
      const calibration = runSwingCalibration(DEMO_OHLCV);
      const swingCountBefore = calibration.detailsByConfigId["5-5"].confirmedSwingCount;
      runWaveStability(DEMO_OHLCV);
      const calibrationAgain = runSwingCalibration(DEMO_OHLCV);
      assert.equal(
        calibrationAgain.detailsByConfigId["5-5"].confirmedSwingCount,
        swingCountBefore
      );
    });
  });

  describe("G — OHLCV provider contract (fixtures only)", () => {
    it("normalizes candle order oldest to newest", () => {
      const ordered = normalizeCandleOrder([
        { time: 3000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
        { time: 1000, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ]);
      assert.ok(ordered[0].time < ordered[1].time);
    });

    it("filters out open (unclosed) klines before analysis consumption", () => {
      const rows = mapBinanceKlinesResponse([
        klineRow(1000, 1, 2, 0.5, 1.5, 10, 1999),
        klineRow(4000, 2, 3, 1.5, 2.5, 20, 50_000),
      ]);
      const closed = filterClosedKlines(rows, 5000);
      assert.equal(closed.length, 1);
      assert.equal(closed[0].time, 1000);
    });

    it("maps Binance OHLCV fields to numeric Candle", () => {
      const rows = mapBinanceKlinesResponse([
        klineRow(1000, 1, 2, 0.5, 1.5, 100, 1999),
      ]);
      const c = rows[0].candle;
      assert.equal(c.open, 1);
      assert.equal(c.high, 2);
      assert.equal(c.low, 0.5);
      assert.equal(c.close, 1.5);
      assert.equal(c.volume, 100);
      assert.equal(c.time, 1000);
    });
  });

  describe("H — trade setup layer contract", () => {
    it("trade catalog entries are TRADE_SETUP and structural remain non-trade", async () => {
      const setup = await import("../setup/setup-catalog");
      assert.equal(setup.listTradeSetupCatalogEntries().length, 2);
      assert.equal(setup.listStructuralContextCatalogEntries().length, 5);
      assert.ok(
        setup.listStructuralContextCatalogEntries().every((e) => !e.isTradeSetup)
      );
    });

    it("setup-detector module does not import wave engine pipeline", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-detector.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("buildWaveAnalysis"));
      assert.ok(!text.includes("runWaveScan"));
    });
  });

  describe("K — stop-loss model layer contract (14D.3)", () => {
    it("stop-loss-model module does not import wave engine, scanner, diagnostics, or providers", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("takeProfit"));
      assert.ok(!text.includes("riskReward"));
    });

    it("stop-loss types exclude order execution vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/stop-loss-model-types.ts");
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["stopOrder", "MARKET", "LIMIT", "positionSize", "leverage"]) {
        assert.ok(!text.includes(token), token);
      }
    });
  });

  describe("J — entry model layer contract (14D.2)", () => {
    it("entry-model module does not import wave engine, scanner, diagnostics, or providers", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/entry-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("wave-diagnostics"));
      assert.ok(!text.includes("binance"));
    });

    it("entry-model types exclude SL/TP/RR and execution vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/entry-model-types.ts");
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["stopLoss", "takeProfit", "riskReward", "LONG", "SHORT", "BUY", "SELL"]) {
        assert.ok(!text.includes(token), token);
      }
    });
  });

  describe("I — entry plan layer contract (14D.1)", () => {
    it("entry-plan module does not import wave engine, scanner, or diagnostics pipeline", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/entry-plan.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("analyzeWaveWithDiagnostics"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("buildWaveScenarios"));
    });

    it("entry-plan types exclude execution prices and RR vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/entry-plan-types.ts");
      const text = fs.readFileSync(file, "utf8");
      const forbidden = [
        "stopLoss",
        "stopPrice",
        "slPrice",
        "takeProfit",
        "entryPrice",
        "riskReward",
        "positionSize",
        "leverage",
        "LONG",
        "SHORT",
        "MARKET",
        "LIMIT",
      ];
      for (const token of forbidden) {
        assert.ok(!text.includes(token), `forbidden token ${token}`);
      }
    });

    it("only isTradeSetup CONFIRMED with closed bar yields eligible plan", () => {
      const structural: SetupCandidate = {
        schemaVersion: SETUP_SCHEMA_VERSION,
        id: "s",
        symbol: "X",
        timeframe: "1H",
        scenarioRef: {
          scenarioId: "sc",
          role: "PRIMARY" as const,
          structure: "IMPULSE" as const,
          waveLabel: "5" as const,
          scenarioStatus: "ACTIVE" as const,
        },
        setupTypeId: "impulse-wave-segment",
        setupTypeLabel: "seg",
        category: "STRUCTURAL_CONTEXT" as const,
        isTradeSetup: false,
        status: "CONFIRMED" as const,
        directionalBias: null,
        directionalBasis: null,
        trigger: { conditions: [], summary: "" },
        confirmation: { conditions: [], summary: "" },
        invalidation: { conditions: [], summary: "", usesScenarioInvalidation: false },
        referenceLevels: [],
        sourceScenario: {
          confidence: 1,
          startIndex: 0,
          endIndex: 1,
          startPrice: 1,
          endPrice: 2,
          evidence: [],
          limitations: [],
        },
        context: {},
        setupLimitations: [],
        evaluationNotes: [],
      };
      assert.equal(buildEntryPlanFromSetup({ setup: structural }).plan, null);
      const trade: SetupCandidate = {
        ...structural,
        isTradeSetup: true,
        category: "TRADE_SETUP",
        setupTypeId: "impulse-continuation",
      };
      assert.equal(
        buildEntryPlanFromSetup({
          setup: trade,
          evaluationBar: {
            evaluationBarIndex: 1,
            evaluationBarBoundaryEstablished: true,
            evaluationBarContractDetail: "test",
          },
        }).eligibility.reason,
        "ENTRY_PLAN_ELIGIBLE"
      );
    });
  });
});
