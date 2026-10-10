import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMarketStructureDescriptiveConfluenceSurfaceContext } from "../../wave/market-structure/market-structure-descriptive-confluence-surface";
import {
  presentMarketStructureUiViewModel,
  formatUtcTimestamp,
} from "../market-structure-ui-presenter";
import { assertNoForbiddenTradingTokens } from "../market-structure-ui-presenter-types";
import type { Candle } from "../../wave/types";

const ONE_H = 3_600_000;
const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function surfaceFrom(ltf: Candle[], E: number, replay = false) {
  return buildMarketStructureDescriptiveConfluenceSurfaceContext({
    timeframeInputs: [{ timeframeId: "1H", candles: ltf, evaluationBarIndex: E }],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    horizonBars: 24,
    swingConfig: SWING,
    htfSourceTrack: "DERIVED_1H_4H",
    includeReplayRelations: replay,
  });
}

function readyVm(ltf: Candle[], E: number, replay = false) {
  return presentMarketStructureUiViewModel({
    surface: surfaceFrom(ltf, E, replay),
    symbol: "BTCUSDT",
    dataMode: "LIVE",
    loadStatus: "ready",
    includeReplayRelations: replay,
  });
}

describe("market-structure-ui-presenter (MSL-11)", () => {
  it("A/B — 4H and 1H rendering models", () => {
    const vm = readyVm(Array.from({ length: 70 }, (_, i) => c(i * ONE_H)), 35);
    assert.ok(vm.timeframeCards.fourH);
    assert.ok(vm.timeframeCards.oneH);
    assert.equal(vm.timeframeCards.fourH!.timeframeId, "4H");
    assert.equal(vm.timeframeCards.oneH!.timeframeId, "1H");
  });

  it("C — 15M NOT_ESTABLISHED", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 25);
    assert.equal(vm.fifteenMStatus, "NOT_ESTABLISHED");
  });

  it("D — MTF summary", () => {
    const vm = readyVm(Array.from({ length: 60 }, (_, i) => c(i * ONE_H)), 30);
    assert.ok(vm.mtfSummary);
    assert.equal(vm.mtfSummary!.htfTimeframeId, "4H");
    assert.equal(vm.mtfSummary!.ltfTimeframeId, "1H");
  });

  it("E — structure sections", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    const oneH = vm.timeframeCards.oneH!;
    assert.ok(Array.isArray(oneH.highStructure));
    assert.ok(Array.isArray(oneH.lowStructure));
    assert.ok(oneH.structureEvents.bosCount >= 0);
  });

  it("F — protected candidates", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    assert.ok(Array.isArray(vm.timeframeCards.oneH!.protectedHighs));
    assert.ok(Array.isArray(vm.timeframeCards.oneH!.protectedLows));
  });

  it("G — liquidity foundation counts", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    const card = vm.timeframeCards.oneH!;
    assert.ok(card.poolCount >= 0);
    assert.ok(card.bslCount >= 0);
  });

  it("H — liquidity events counts", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    const card = vm.timeframeCards.oneH!;
    assert.ok(card.wickTouchCount >= 0);
    assert.ok(card.sweepCount >= 0);
  });

  it("I — lifecycle counts object", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.ok(typeof vm.timeframeCards.oneH!.lifecycleCounts === "object");
  });

  it("J — MSS rows", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    assert.ok(vm.timeframeCards.oneH!.mssCount >= 0);
    assert.ok(Array.isArray(vm.timeframeCards.oneH!.mssEventRows));
  });

  it("K — 9A structure alignment passthrough", () => {
    const vm = readyVm(Array.from({ length: 60 }, (_, i) => c(i * ONE_H)), 30);
    const state = vm.mtfSummary!.structureAlignment;
    assert.ok(
      state === null ||
        ["ALIGNED", "COUNTER_ALIGNED", "NEUTRAL", "UNRESOLVED"].includes(state)
    );
  });

  it("L — 9B liquidity alignment passthrough", () => {
    const vm = readyVm(Array.from({ length: 60 }, (_, i) => c(i * ONE_H)), 30);
    const side = vm.mtfSummary!.liquiditySideAlignment;
    assert.ok(
      side === null ||
        ["MATCHING", "DIVERGENT", "MIXED", "NONE", "UNRESOLVED"].includes(side)
    );
  });

  it("M — 9C summary without replay by default", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28, false);
    assert.ok(vm.mtfSummary!.evaluationRelationCount <= vm.mtfSummary!.relationCount);
    assert.equal(vm.mtfSummary!.replayRelationRows, null);
  });

  it("N — 9D association rows", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.ok(vm.mtfSummary!.liquidityToStructureCount >= 0);
    assert.ok(Array.isArray(vm.mtfSummary!.liquidityToStructureRows));
  });

  it("O — 9E association rows", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.ok(vm.mtfSummary!.structureToMssCount >= 0);
  });

  it("P — unresolved preserved", () => {
    const vm = readyVm(Array.from({ length: 45 }, (_, i) => c(i * ONE_H)), 22);
    for (const u of vm.unresolved) {
      assert.ok(u.sourceContext.length > 0);
      assert.ok(u.code.length > 0);
    }
  });

  it("Q — research flags from 9F", () => {
    const vm = readyVm(Array.from({ length: 45 }, (_, i) => c(i * ONE_H)), 22);
    assert.ok(vm.researchFlags.includes("descriptive_confluence_surface"));
    assert.ok(vm.researchFlags.includes("no_scoring"));
  });

  it("R — deterministic unresolved ordering", () => {
    const vm1 = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    const vm2 = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    assert.deepEqual(vm1.unresolved, vm2.unresolved);
  });

  it("S — empty surface input demo unavailable", () => {
    const vm = presentMarketStructureUiViewModel({
      surface: null,
      symbol: "BTCUSDT",
      dataMode: "DEMO",
      loadStatus: "demo_unavailable",
    });
    assert.equal(vm.timeframeCards.fourH, null);
    assert.match(vm.demoUnavailableMessage ?? "", /1H-aligned/);
  });

  it("T — multiple protected candidates flag", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 28);
    const card = vm.timeframeCards.oneH!;
    if (card.protectedHighs.length > 1) {
      assert.equal(card.multipleProtectedHighs, true);
    }
  });

  it("U — missing HTF mtf null when no inputs", () => {
    const vm = presentMarketStructureUiViewModel({
      surface: buildMarketStructureDescriptiveConfluenceSurfaceContext({
        timeframeInputs: [],
      }),
      symbol: "BTCUSDT",
      dataMode: "LIVE",
      loadStatus: "ready",
    });
    assert.equal(vm.mtfSummary, null);
  });

  it("V — evaluation timestamps from closed bar metadata only", () => {
    const vm = readyVm(Array.from({ length: 48 }, (_, i) => c(i * ONE_H)), 30);
    assert.ok(vm.evaluationLtfUtc);
    assert.ok(!vm.evaluationLtfUtc!.toLowerCase().includes("developing"));
  });

  it("W — view-model JSON excludes future-data UI fields", () => {
    const vm = readyVm(Array.from({ length: 48 }, (_, i) => c(i * ONE_H)), 30);
    const json = JSON.stringify(vm);
    assert.ok(!json.includes("futureSpike"));
    assert.ok(!json.includes("developingCandle"));
  });

  it("X–AA — no score/signal/prediction/causality tokens", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.doesNotThrow(() => assertNoForbiddenTradingTokens(JSON.stringify(vm)));
  });

  it("AB — no chart fields in view-model", () => {
    const vm = readyVm(Array.from({ length: 50 }, (_, i) => c(i * ONE_H)), 26);
    const json = JSON.stringify(vm);
    assert.ok(!json.includes("canvas"));
    assert.ok(!json.includes("svg"));
    assert.ok(!json.includes("marker"));
  });

  it("AC — presenter source does not import production or MSL builders", () => {
    const src = readFileSync(
      join(process.cwd(), "src/browser/market-structure-ui-presenter.ts"),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureBreakContext"));
    assert.ok(!src.includes("detectSwings"));
    assert.ok(!src.includes("production-wave-scanner"));
    assert.ok(!src.includes("trade-evaluation"));
    assert.ok(!src.includes("buildMarketStructureDescriptiveConfluenceSurfaceContext"));
  });

  it("AD — tests consume 9F output only in presenter layer", () => {
    const src = readFileSync(
      join(process.cwd(), "src/browser/market-structure-ui-presenter.ts"),
      "utf8"
    );
    assert.ok(src.includes("MarketStructureDescriptiveConfluenceSurfaceContext"));
  });

  it("formatUtcTimestamp helper", () => {
    assert.equal(formatUtcTimestamp(null), null);
    assert.match(formatUtcTimestamp(1_700_000_000_000)!, /UTC/);
  });

  it("replay toggle surfaces replay rows", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28, true);
    assert.ok(
      vm.mtfSummary!.replayRelationRows === null ||
        Array.isArray(vm.mtfSummary!.replayRelationRows)
    );
  });

  it("MSL-10 WP2 — presentation taxonomy on view-model", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.ok(vm.presentationTaxonomy);
    assert.ok(vm.presentationTaxonomy!.coreLimitations.includes("research_only"));
    assert.deepEqual(vm.limitations, [...vm.limitations].sort((a, b) => a.localeCompare(b)));
    const cats = [
      ...vm.presentationTaxonomy!.coreLimitations,
      ...vm.presentationTaxonomy!.researchPresentationFlags,
      ...vm.presentationTaxonomy!.technicalLimitations,
    ];
    assert.equal(cats.length, new Set(cats).size);
  });

  it("MSL-10 WP3 — native HTF presentation not production", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    const n = vm.tier1!.nativeHtfResearchPresentation;
    assert.equal(n.nativeHtfProductionStatus, "NOT_ESTABLISHED");
    assert.equal(n.fieldParityStatus, "FIELD_PARITY_FAILED");
    assert.equal(n.canonicalHtfSourceTrack, "DERIVED_1H_4H");
    assert.equal(vm.tier1!.confluencePresentationStatus, "DESCRIPTIVE_CONFLUENCE_ONLY");
  });

  it("MSL-10 WP6 — tier1 excludes MSS rows; tier2 includes them", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    const oneHT1 = vm.tier1!.timeframeCards.oneH!;
    const oneHT2 = vm.tier2!.timeframeCards.oneH!;
    assert.ok(!("mssEventRows" in oneHT1));
    assert.ok(Array.isArray(oneHT2.mssEventRows));
    assert.equal(oneHT2.mssPresentationNote, "MSS_RESEARCH_ONLY_NOT_SIGNAL");
    assert.equal(vm.tier2!.mtfSummary!.orderingPresentationNote, "TEMPORAL_ORDERING_ONLY");
    assert.equal(vm.tier2!.mtfSummary!.associationPresentationNote, "DESCRIPTIVE_ASSOCIATION_ONLY");
    assert.equal(vm.tier1!.mtfSummary!.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("MSL-10 WP6 — tier1 MTF has no association rows", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    const m1 = vm.tier1!.mtfSummary!;
    assert.ok(!("liquidityToStructureRows" in m1));
    assert.ok(vm.tier2!.mtfSummary!.liquidityToStructureRows.length >= 0);
  });

  it("MSL-16 — scenario interpretation panel on tier1", () => {
    const vm = readyVm(Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), 28);
    assert.ok(vm.scenarioInterpretation);
    assert.ok(vm.tier1!.scenarioInterpretation);
    assert.ok(vm.scenarioInterpretation!.primary);
    assert.match(vm.scenarioInterpretation!.globalDisclaimer, /not a trading signal/i);
    assert.doesNotThrow(() => assertNoForbiddenTradingTokens(JSON.stringify(vm.scenarioInterpretation)));
  });
});
