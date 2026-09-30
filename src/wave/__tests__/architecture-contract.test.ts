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

  describe("M — risk/reward model layer contract (14D.5)", () => {
    it("risk-reward-model module does not import wave engine, scanner, or producer models", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/risk-reward-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("evaluateEntryModel"));
      assert.ok(!text.includes("evaluateStopLossModel"));
      assert.ok(!text.includes("evaluateTargetModel"));
      assert.ok(!text.includes("buildEntryModelReport"));
    });

    it("risk-reward types exclude quality and probability vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/risk-reward-model-types.ts");
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["probability", "GOOD_RR", "positionSize", "leverage"]) {
        assert.ok(!text.includes(token), token);
      }
    });
  });

  describe("L — target model layer contract (14D.4)", () => {
    it("target-model module does not import wave engine, scanner, diagnostics, or providers", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/target-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("riskReward"));
      assert.ok(!text.includes("entry-model"));
      assert.ok(!text.includes("stop-loss-model"));
    });

    it("target-model types exclude order execution vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/target-model-types.ts");
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["takeProfitOrder", "MARKET", "LIMIT", "positionSize", "leverage"]) {
        assert.ok(!text.includes(token), token);
      }
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

  describe("AG — evaluation-scoped analysis (14N-F)", () => {
    it("slice before engine; no filter-after-analysis; no target/ratio", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = fs.readFileSync(
        path.join(process.cwd(), "src/wave/evaluation-scoped-analysis.ts"),
        "utf8"
      );
      assert.ok(file.includes("candles.slice(0, evaluationBarIndex + 1)"));
      assert.ok(file.includes("effectiveCandles"));
      assert.ok(file.includes("analyzeWaveAtEvaluationBar"));
      assert.ok(!file.includes("fibExtensionPrice"));
      assert.ok(!file.includes("flatWaves.filter"));
    });
  });

  describe("AF — prospective setup contract (14N-E)", () => {
    it("historical setups preserved; no target/ratio/future evidence", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/prospective-setup-contract.ts"),
        "utf8"
      );
      assert.ok(file.includes("resolveProspectiveSetupContract"));
      assert.ok(file.includes("prospectiveWaveLabel = null"));
      assert.ok(!file.includes("fibExtensionPrice"));
      assert.ok(!file.includes("analyzeWave"));
    });
  });

  describe("AE — trade setup temporal semantics (14N-D)", () => {
    it("setup confirmed != prospective; objective eligibility separate", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/trade-setup-temporal-semantics.ts"),
        "utf8"
      );
      assert.ok(file.includes("resolveTradeSetupTemporalContext"));
      assert.ok(file.includes("OBJECTIVE_ALREADY_COMPLETED"));
      assert.ok(file.includes("EntryPlan eligibility"));
      assert.ok(!file.includes("fibExtensionPrice"));
      assert.ok(!file.includes("BUY"));
    });
  });

  describe("AD — objective wave resolution (14N-C)", () => {
    it("no current+1 objective, no target price, setup confirmed != objective resolved", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/objective-wave-resolution.ts"),
        "utf8"
      );
      const policy = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
        "utf8"
      );
      assert.ok(file.includes("resolveObjectiveWaveContext"));
      assert.ok(file.includes("OBJECTIVE_WAVE_UNRESOLVED"));
      assert.ok(file.includes("currentWave+1"));
      assert.ok(!file.match(/objectiveWaveLabel\s*=\s*lookupNextImpulseLegLabel/));
      assert.ok(!file.includes("fibExtensionPrice"));
      assert.ok(policy.includes("PRODUCTION_FIBONACCI_PROJECTION_POLICIES"));
    });
  });

  describe("AC — wave projection context (14N-B)", () => {
    it("characterizes relationships without production policy or ratio selection", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const ctx = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/wave-projection-context.ts"),
        "utf8"
      );
      const policy = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
        "utf8"
      );
      assert.ok(ctx.includes("resolveWaveProjectionContext"));
      assert.ok(ctx.includes("OBJECTIVE_WAVE_UNRESOLVED"));
      assert.ok(!ctx.includes("1.618"));
      assert.ok(!ctx.includes("nearestFibMatch"));
      assert.ok(policy.includes("PRODUCTION_FIBONACCI_PROJECTION_POLICIES"));
    });
  });

  describe("AB — Fibonacci anchor semantics (14M)", () => {
    it("production policy registry empty; no implicit anchor model in resolver", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const policy = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
        "utf8"
      );
      const semantics = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/fibonacci-anchor-semantics.ts"),
        "utf8"
      );
      assert.ok(policy.includes("PRODUCTION_FIBONACCI_PROJECTION_POLICIES"));
      assert.ok(policy.includes("anchorModel"));
      assert.ok(policy.includes("ANCHOR_TEMPORALLY_INVALID"));
      assert.ok(!policy.includes("DEFAULT_FIB"));
      assert.ok(!semantics.includes("fetch("));
      assert.ok(!semantics.includes("analyzeWave"));
    });
  });

  describe("AA — Fibonacci projection policy (14L)", () => {
    it("no implicit ratio or nearestMatch in production policy registry", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const policy = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/fibonacci-projection-policy.ts"),
        "utf8"
      );
      const sources = fs.readFileSync(
        path.join(
          process.cwd(),
          "src/wave/setup/objective-target-candidate-sources.ts"
        ),
        "utf8"
      );
      assert.ok(policy.includes("PRODUCTION_FIBONACCI_PROJECTION_POLICIES"));
      assert.ok(!policy.includes("nearestFibMatch"));
      assert.ok(!policy.includes("DEFAULT_FIB"));
      assert.ok(sources.includes("TARGET_RATIO_POLICY_MISSING"));
    });
  });

  describe("Z — production objective target contract (14K)", () => {
    it("production context builder does not run engine or fetch", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/objective-target-production-context.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("analyzeWaveWithDiagnostics"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("fibExtensionPrice"));
    });

    it("candidate sources still require attestation for fib and wave structure", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/objective-target-candidate-sources.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("attestedFibonacciProjection"));
      assert.ok(text.includes("attestedWaveStructureTarget"));
      assert.ok(!text.includes("nearestSwing"));
    });
  });

  describe("Y — scope-aware stop reference (14J)", () => {
    it("segment stop model geometry unchanged; track model requires TRACK_SCOPE and entry reference", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("evaluateTrackScopeInvalidationReference"));
      assert.ok(text.includes("invalidationPrice >= envelopeLow"));
      assert.ok(text.includes("selectedEntryReference"));
      assert.ok(!text.includes("candles"));
      assert.ok(!text.includes("ATR"));
    });

    it("catalog lists segment model before track model for impulse-continuation", async () => {
      const { listStopLossModelsForSetupType } = await import(
        "../setup/stop-loss-model-catalog"
      );
      const ids = listStopLossModelsForSetupType("impulse-continuation");
      assert.deepEqual(ids[0], "SCENARIO_INVALIDATION_REFERENCE");
      assert.ok(ids.includes("TRACK_SCOPE_INVALIDATION_REFERENCE"));
    });
  });

  describe("X — invalidation scope / stop contract (14I)", () => {
    it("stop-loss-model geometry unchanged; scope layer is reporting-only", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const scope = fs.readFileSync(
        path.join(process.cwd(), "src/validation/real-market-invalidation-scope.ts"),
        "utf8"
      );
      const model = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts"),
        "utf8"
      );
      assert.ok(scope.includes("enumerateScenarioInvalidationCandidates"));
      assert.ok(!scope.includes("evaluateStopLossModel"));
      assert.ok(model.includes("invalidationPrice >= envelopeLow"));
      assert.ok(!scope.includes("ATR"));
      assert.ok(!scope.includes("nearestSwing"));
    });

    it("enumerateScenarioInvalidationCandidates does not alter resolveScenarioInvalidation", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/wave-scenarios.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("function resolveScenarioInvalidation"));
      assert.ok(text.includes("export function enumerateScenarioInvalidationCandidates"));
      const resolveBody = text.slice(
        text.indexOf("export function resolveScenarioInvalidation"),
        text.indexOf("export interface ScenarioInvalidationCandidate")
      );
      assert.ok(!resolveBody.includes("enumerateScenarioInvalidationCandidates"));
    });
  });

  describe("W — stop reference diagnostics (14H)", () => {
    it("stop diagnostics layer does not change stop-loss-model geometry", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const diag = fs.readFileSync(
        path.join(process.cwd(), "src/validation/real-market-stop-diagnostics.ts"),
        "utf8"
      );
      const model = fs.readFileSync(
        path.join(process.cwd(), "src/wave/setup/stop-loss-model.ts"),
        "utf8"
      );
      assert.ok(diag.includes("evaluateStopLossModel"));
      assert.ok(
        diag.includes("outcomeRef.stopPrice") || diag.includes("ref.stopPrice")
      );
      assert.ok(!diag.includes("ATR"));
      assert.ok(!model.includes("ATR"));
    });

    it("validation stop diagnostics do not alter confirmation or target layers", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/validation/real-market-stop-diagnostics.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("buildTargetModelReport"));
      assert.ok(!text.includes("resolveTradeSetupLifecycleStatus"));
      assert.ok(!text.includes("attestedFibonacciProjection"));
    });
  });

  describe("V — upstream structural invalidation (14G)", () => {
    it("wave-detector exposes Wave 2 boundary without separate formula", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/wave-detector.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("wave2StructuralInvalidationPrice"));
      assert.ok(text.includes("applyWave2InvalidationRule"));
      assert.ok(!text.includes("ATR"));
      assert.ok(!text.includes("nearestSwing"));
    });

    it("invalidation wiring does not add execution or confirmation shortcuts", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/wave-detector.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("BUY"));
      assert.ok(!text.includes("SELL"));
      assert.ok(!text.includes("stopLoss"));
    });
  });

  describe("U — production setup confirmation / invalidation (14F)", () => {
    it("trade-setup-rules do not shortcut ACTIVE or POTENTIAL into CONFIRMED", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-rules.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("resolveTradeSetupLifecycleStatus"));
      assert.ok(!text.includes("scenarioStatus === \"ACTIVE\"") || text.includes('row.scenarioStatus === "ACTIVE"'));
      assert.ok(!text.includes("POTENTIAL") || text.includes('w.status === "POTENTIAL"'));
      assert.ok(!text.includes("return \"CONFIRMED\"") || text.includes("confirmReady"));
    });

    it("setup reference levels map existing scanner invalidation only", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/setup-rules.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("SCENARIO_INVALIDATION"));
      assert.ok(text.includes("row.invalidation.available"));
      assert.ok(!text.includes("attestedFibonacciProjection"));
    });

    it("validation diagnostics stay reporting-only", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/validation/real-market-setup-diagnostics.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("buildConditionSummary"));
      assert.ok(!text.includes("resolveTradeSetupLifecycleStatus"));
      assert.ok(!text.includes("return \"CONFIRMED\""));
    });
  });

  describe("T — real market validation (14E)", () => {
    it("validation runner script uses Binance provider and pipeline APIs", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const script = fs.readFileSync(
        path.join(process.cwd(), "scripts/validate-real-market.ts"),
        "utf8"
      );
      assert.ok(script.includes("runRealMarketValidation"));
      assert.ok(!script.includes("detectWaves"));
      assert.ok(!script.includes("buildWaveScenarios"));

      const validation = fs.readFileSync(
        path.join(process.cwd(), "src/validation/real-market-validation.ts"),
        "utf8"
      );
      assert.ok(validation.includes("runWaveScan"));
      assert.ok(validation.includes("buildTradeSetupEvaluationPipeline"));
      assert.ok(validation.includes("BinanceFuturesOhlcvProvider"));
      assert.ok(!validation.includes("attestedFibonacciProjection"));
      assert.ok(!validation.includes("attestedAbcProjection"));
      assert.ok(!validation.includes("candles.length - 1"));
    });

    it("wave/setup layers do not import real-market validation or Binance", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "src/wave/setup");
      const names = fs.readdirSync(dir).filter((n) => n.endsWith(".ts"));
      for (const name of names) {
        const text = fs.readFileSync(path.join(dir, name), "utf8");
        assert.ok(!text.includes("real-market-validation"));
        assert.ok(!text.includes("binance"));
      }
    });

    it("real-market validation tests stay offline", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/validation/__tests__/real-market-validation.test.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("runRealMarketValidation"));
      assert.ok(!text.includes("BinanceFuturesOhlcvProvider"));
    });
  });

  describe("S — MVP E2E fixture validation (14D.11)", () => {
    it("fixture validation tests are TEST_ONLY and do not import Binance", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/__tests__/mvp-e2e-fixture-validation.test.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("TEST_ONLY"));
      assert.ok(!text.includes("fetch("));
      assert.ok(!/from\s+["'].*binance/i.test(text));
      assert.ok(!text.includes("candles.length - 1"));
    });

    it("fixture helpers use pipeline API without hidden target generation", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/__tests__/fixtures/mvp-e2e-fixtures.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("buildTradeSetupEvaluationPipeline"));
      assert.ok(!text.includes("fibExtensionPrice"));
      assert.ok(!text.includes("analyzeWave"));
    });
  });

  describe("R — objective target evaluation wiring (14D.10)", () => {
    it("evaluation composition wires candidates → selection → target without RR math", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("buildObjectiveTargetCandidateReport"));
      assert.ok(text.includes("applyObjectiveTargetSelectionPolicy"));
      assert.ok(text.includes("entryPlanWithSelectedObjectiveTarget"));
      assert.ok(text.includes("buildTargetModelReport"));
      assert.ok(!text.includes("fibExtensionPrice"));
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
    });

    it("pipeline passes objective context by symbol only", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-pipeline.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("objectiveTargetSourceContextBySymbol"));
      assert.ok(text.includes("buildTradeSetupEvaluationSnapshot"));
      assert.ok(!text.includes("buildObjectiveTargetCandidateReport"));
    });
  });

  describe("Q — objective target selection policy (14D.9)", () => {
    it("selection layer does not run wave engine or compute targets", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/objective-target-selection.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("fibExtensionPrice"));
      assert.ok(!text.includes("buildObjectiveTargetCandidateReport"));
      assert.ok(!text.includes("binance"));
    });

    it("selection types exclude quality ranking vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const files = [
        "objective-target-selection-types.ts",
        "objective-target-selection-policy.ts",
      ];
      for (const name of files) {
        const text = fs.readFileSync(
          path.join(process.cwd(), "src/wave/setup", name),
          "utf8"
        );
        assert.ok(!text.includes("bestTarget"));
        assert.ok(!text.includes("probability"));
        assert.ok(!text.includes("optimalTarget"));
      }
    });
  });

  describe("P — objective target candidate sources (14D.8)", () => {
    it("candidate source layer does not run wave engine, scanner, or swing detection", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/objective-target-candidate-sources.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("detectSwings"));
      assert.ok(!text.includes("detectWaves"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("buildWaveScenarios"));
    });

    it("candidate layer has no selection or ranking API", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "src/wave/setup");
      const files = [
        "objective-target-candidate-sources.ts",
        "objective-target-candidate-types.ts",
      ];
      for (const name of files) {
        const text = fs.readFileSync(path.join(dir, name), "utf8");
        assert.ok(!text.includes("selectBestTarget"));
        assert.ok(!text.includes("rankTargets"));
        assert.ok(!text.includes("chooseTarget"));
      }
    });

    it("target-model.ts unchanged in selection responsibility", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(process.cwd(), "src/wave/setup/target-model.ts");
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("objective-target-candidate"));
      assert.ok(!text.includes("selectBest"));
    });
  });

  describe("O — trade setup evaluation pipeline wiring (14D.7)", () => {
    it("pipeline wires scanner → setup → entry plan → snapshot without new engine imports", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-pipeline.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("detectSetups"));
      assert.ok(text.includes("buildEntryPlansFromSetupReport"));
      assert.ok(text.includes("buildTradeSetupEvaluationSnapshot"));
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("buildEntryModelReport"));
      assert.ok(!text.includes("buildRiskRewardReport"));
      assert.ok(!text.includes("candles.length - 1"));
    });

    it("pipeline types exclude trade execution vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-pipeline-types.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["BUY", "SELL", "LONG", "SHORT", "positionSize"]) {
        assert.ok(!text.includes(token), token);
      }
    });
  });

  describe("N — trade setup evaluation composition (14D.6)", () => {
    it("composition module does not import wave engine, scanner, Binance, or diagnostics", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!text.includes("analyzeWave"));
      assert.ok(!text.includes("runWaveScan"));
      assert.ok(!text.includes("binance"));
      assert.ok(!text.includes("wave-diagnostics"));
      assert.ok(!text.includes("multi-timeframe"));
    });

    it("composition delegates to model builders without inline RR or fallback prices", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.includes("buildEntryModelReport"));
      assert.ok(text.includes("buildStopLossReport"));
      assert.ok(text.includes("buildTargetModelReport"));
      assert.ok(text.includes("buildRiskRewardReport"));
      assert.ok(!text.includes("riskAmount"));
      assert.ok(!text.includes("rewardAmount"));
      assert.ok(!text.includes("EXPLICIT_OBJECTIVE_TARGET"));
      assert.ok(!text.includes("candles.length - 1"));
    });

    it("evaluation snapshot types exclude trade signal vocabulary", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const file = path.join(
        process.cwd(),
        "src/wave/setup/trade-setup-evaluation-types.ts"
      );
      const text = fs.readFileSync(file, "utf8");
      for (const token of ["BUY", "SELL", "LONG", "SHORT", "ENTER", "DO_NOT_ENTER"]) {
        assert.ok(!text.includes(token), token);
      }
    });
  });
});
