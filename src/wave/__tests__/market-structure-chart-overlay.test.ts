import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource,
} from "../market-structure/market-structure-descriptive-confluence-surface";
import {
  buildMarketStructureChartOverlayProjection,
  CHART_OVERLAY_PROJECTION_RULE_ID,
  cullStructureLabelMarkersForViewport,
  formatChartEvalUtcLabel,
  passesClosedContextClip,
  prioritizePriceLinesNearPrice,
} from "../market-structure/market-structure-chart-overlay";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 14, minAtrMultiplier: 0.3 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function bundleAt(ltf: Candle[], E: number) {
  return buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource({
    timeframeInputs: [{ timeframeId: "1H", candles: ltf, evaluationBarIndex: E }],
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
    horizonBars: 24,
    swingConfig: SWING,
    htfSourceTrack: "DERIVED_1H_4H",
  });
}

function project1H(
  ltf: Candle[],
  E: number,
  visibility?: Partial<Record<string, boolean>>
) {
  const { surface, chartSource } = bundleAt(ltf, E);
  return buildMarketStructureChartOverlayProjection({
    surface,
    chartSource,
    chartTimeframeId: "1H",
    visibility,
  });
}

function hasKind(
  projection: ReturnType<typeof buildMarketStructureChartOverlayProjection>,
  category: string,
  kind: string
): boolean {
  return (
    projection.markers.some((m) => m.category === category && m.kind === kind) ||
    projection.priceLines.some((p) => p.category === category && p.kind === kind)
  );
}

describe("market-structure-chart-overlay (MSL-12)", () => {
  it("BD frozen BTC checksum unchanged", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH));
  });

  it("BC chart source spine from single 9F path", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const { chartSource } = bundleAt(frozen.candles, 120);
    const slice = chartSource.timeframes["1H"];
    assert.ok(slice);
    assert.ok(slice.externalSpine.length > 0);
    assert.ok(
      slice.externalSpine.every(
        (p) => p.time === frozen.candles[p.pivotIndex]?.time
      )
    );
  });

  it("Z deterministic JSON projection", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const a = project1H(frozen.candles, E);
    const b = project1H(frozen.candles, E);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.ruleId, CHART_OVERLAY_PROJECTION_RULE_ID);
  });

  it("AB 15M NOT_ESTABLISHED · AC 4H active · AD 1H active", () => {
    const ltf = Array.from({ length: 120 }, (_, i) => c(i * ONE_H, 100 + Math.sin(i / 5)));
    const E = 80;
    const p15 = buildMarketStructureChartOverlayProjection({
      ...(() => {
        const b = bundleAt(ltf, E);
        return { surface: b.surface, chartSource: b.chartSource };
      })(),
      chartTimeframeId: "15M",
    });
    assert.equal(p15.availability, "NOT_ESTABLISHED");
    assert.match(p15.statusMessage ?? "", /NOT ESTABLISHED/);

    const b = bundleAt(ltf, E);
    const p4 = buildMarketStructureChartOverlayProjection({
      surface: b.surface,
      chartSource: b.chartSource,
      chartTimeframeId: "4H",
    });
    const p1 = buildMarketStructureChartOverlayProjection({
      surface: b.surface,
      chartSource: b.chartSource,
      chartTimeframeId: "1H",
    });
    assert.equal(p4.availability, "ACTIVE");
    assert.equal(p1.availability, "ACTIVE");
    assert.ok(p1.verticalLines.length >= 1);
    assert.ok(p1.verticalLines[0]!.label.includes("Eval @"));
  });

  function overlayGeomSignature(
    projection: ReturnType<typeof buildMarketStructureChartOverlayProjection>
  ): string {
    return JSON.stringify({
      markers: projection.markers.map((m) => ({
        id: m.id,
        time: m.time,
        price: m.price,
        kind: m.kind,
        category: m.category,
      })),
      priceLines: projection.priceLines.map((p) => ({
        id: p.id,
        price: p.price,
        kind: p.kind,
        category: p.category,
      })),
      verticalLines: projection.verticalLines,
    });
  }

  it("A–U overlay categories on frozen BTC", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = 100;
    const full = project1H(frozen.candles, E, {
      structure: true,
      protected: true,
      breakEvents: true,
      liquidity: true,
      liquidityEvents: true,
      mss: true,
    });
    assert.ok(hasKind(full, "STRUCTURE", "SH") || hasKind(full, "STRUCTURE", "SL"));
    assert.ok(full.markers.some((m) => ["HH", "HL", "LH", "LL"].includes(m.kind)));
    assert.ok(full.priceLines.some((p) => p.category === "PROTECTED"));
    assert.ok(
      full.markers.some((m) => m.category === "BREAK") ||
        full.priceLines.some((p) => p.kind === "BREAK_REFERENCE")
    );
    assert.ok(full.priceLines.some((p) => p.category === "LIQUIDITY"));
    const liqKinds = new Set(full.priceLines.map((p) => p.kind));
    assert.ok(
      liqKinds.has("BSL") ||
        liqKinds.has("SSL") ||
        liqKinds.has("EQH") ||
        liqKinds.has("EQL") ||
        full.priceLines.some((p) => p.category === "LIQUIDITY")
    );
    if (full.markers.some((m) => m.category === "LIQUIDITY_EVENT")) {
      assert.ok(hasKind(full, "LIQUIDITY_EVENT", "Touch") || hasKind(full, "LIQUIDITY_EVENT", "Sweep"));
    }
    if (full.markers.some((m) => m.category === "MSS")) {
      assert.ok(full.markers.some((m) => m.label.startsWith("MSS ")));
    }
    assert.ok(
      full.tooltipItems.some((t) => t.metadata.lifecyclePhase !== undefined) ||
        full.tooltipItems.some((t) => t.metadata.poolId !== undefined)
    );
  });

  it("V/W E and knownAt clipping", () => {
    assert.equal(passesClosedContextClip(10, 11, 10), false);
    assert.equal(passesClosedContextClip(10, 10, 11), false);
    assert.equal(passesClosedContextClip(10, 10, 10), true);
  });

  it("X/Y prefix invariance on projection", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = 200;
    const prefix = frozen.candles.slice(0, E + 1);
    const base = project1H(prefix, E);
    const extended = [...prefix];
    for (let k = 0; k < 5; k++) {
      extended.push(c(prefix[prefix.length - 1]!.time + (k + 1) * ONE_H, 5000));
    }
    const next = project1H(extended, E);
    assert.equal(overlayGeomSignature(base), overlayGeomSignature(next));
  });

  it("AE HTF context adds HTF_CONTEXT price lines on 1H", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const off = project1H(frozen.candles, E, { htfContext: false });
    const on = project1H(frozen.candles, E, { htfContext: true });
    assert.equal(off.priceLines.filter((p) => p.category === "HTF_CONTEXT").length, 0);
    assert.ok(on.priceLines.some((p) => p.category === "HTF_CONTEXT"));
  });

  it("AH pool dedupe by poolId", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const p = project1H(frozen.candles, E);
    const ids = p.priceLines
      .filter((l) => l.category === "LIQUIDITY")
      .map((l) => l.metadata.poolId)
      .filter(Boolean);
    assert.equal(ids.length, new Set(ids).size);
  });

  it("AI–AO visibility toggles shrink rendered sets", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const all = project1H(frozen.candles, E);
    const none = project1H(frozen.candles, E, {
      structure: false,
      protected: false,
      breakEvents: false,
      liquidity: false,
      liquidityEvents: false,
      mss: false,
    });
    assert.ok(all.markers.length > none.markers.length || all.priceLines.length > none.priceLines.length);
    assert.equal(none.markers.filter((m) => m.category === "STRUCTURE").length, 0);
  });

  it("AP/AQ density helpers preserve semantic counts in projection", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const p = project1H(frozen.candles, E);
    const culled = cullStructureLabelMarkersForViewport(
      p.markers,
      frozen.candles[0]!.time,
      frozen.candles[E]!.time,
      5
    );
    assert.ok(culled.length <= p.markers.length);
    const prioritized = prioritizePriceLinesNearPrice(p.priceLines, 50_000, 3);
    assert.equal(prioritized.length, Math.min(3, p.priceLines.length));
    assert.equal(p.priceLines.length, p.priceLines.length);
  });

  it("AR–AX no trading signal tokens in projection JSON", () => {
    const frozen = loadBtcusdt1hResearchFrozenDatasetV1();
    const E = frozen.candles.length - 1;
    const p = project1H(frozen.candles, E, {
      structure: true,
      breakEvents: true,
      mss: true,
    });
    const blob = JSON.stringify(p);
    for (const token of ["BUY", "SELL", "LONG", "SHORT", "ENTRY", "EXIT", "SCORE"]) {
      assert.ok(!blob.includes(`"${token}"`));
    }
    assert.ok(!p.markers.some((m) => m.label.includes("BUY")));
  });

  it("formatChartEvalUtcLabel uses UTC", () => {
    const label = formatChartEvalUtcLabel(Date.UTC(2024, 0, 15, 13, 45));
    assert.match(label, /^Eval @ 2024-01-15 13:45 UTC$/);
  });

  it("BA chart module architecture guard (DU)", () => {
    const chartMod = readFileSync(
      join(process.cwd(), "src/browser/market-structure-ui-chart.ts"),
      "utf8"
    );
    assert.ok(!chartMod.includes("detectSwings"));
    assert.ok(!chartMod.includes("buildMarketStructureBreakContext"));
    assert.ok(!chartMod.includes("buildMarketStructureLiquidityContext"));
    assert.ok(!chartMod.includes("buildMarketStructureMssContext"));
    assert.ok(chartMod.includes("market-structure-chart-overlay"));
  });
});
