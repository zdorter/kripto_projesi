import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPresentationTaxonomy,
  isCorePresentationLimitation,
} from "../market-structure/market-structure-presentation-taxonomy";
import { buildMarketStructureDescriptiveConfluenceSurfaceContext } from "../market-structure/market-structure-descriptive-confluence-surface";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

describe("market-structure-presentation-taxonomy (MSL-10 WP2)", () => {
  it("classifies core vs research vs technical without overlap", () => {
    const taxonomy = buildPresentationTaxonomy({
      limitations: [
        "research_only",
        "not_production_signal",
        "native_htf_parity_not_established",
        "swing_confirmation_lag_bars=2",
        "no_scoring",
      ],
      researchFlags: ["research_only", "native_htf_parity_not_established", "no_scoring"],
    });
    assert.ok(isCorePresentationLimitation("no_causality"));
    assert.ok(taxonomy.coreLimitations.includes("research_only"));
    assert.ok(taxonomy.coreLimitations.includes("no_scoring"));
    assert.ok(taxonomy.researchPresentationFlags.includes("native_htf_parity_not_established"));
    assert.ok(taxonomy.technicalLimitations.includes("swing_confirmation_lag_bars=2"));
    const all = [
      ...taxonomy.coreLimitations,
      ...taxonomy.researchPresentationFlags,
      ...taxonomy.technicalLimitations,
    ];
    assert.equal(all.length, new Set(all).size);
  });

  it("deterministic sorted taxonomy", () => {
    const input = {
      limitations: ["z_last", "research_only", "a_first"],
      researchFlags: ["research_only"],
    };
    const a = buildPresentationTaxonomy(input);
    const b = buildPresentationTaxonomy(input);
    assert.deepEqual(a, b);
    assert.deepEqual(a.coreLimitations, [...a.coreLimitations].sort((x, y) => x.localeCompare(y)));
  });

  it("9F flat limitations unchanged with taxonomy attached", () => {
    const ltf = Array.from({ length: 70 }, (_, i) => c(i * ONE_H));
    const ctx = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [{ timeframeId: "1H", candles: ltf, evaluationBarIndex: 35 }],
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      horizonBars: 24,
      swingConfig: SWING,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    const rebuilt = buildPresentationTaxonomy({
      limitations: ctx.limitations,
      researchFlags: ctx.researchFlags,
    });
    assert.deepEqual(ctx.presentationTaxonomy, rebuilt);
    assert.equal(ctx.confluencePresentationStatus, "DESCRIPTIVE_CONFLUENCE_ONLY");
    assert.equal(ctx.nativeHtfResearchPresentation.nativeHtfProductionStatus, "NOT_ESTABLISHED");
    assert.equal(ctx.nativeHtfResearchPresentation.fieldParityStatus, "FIELD_PARITY_FAILED");
    assert.equal(
      ctx.nativeHtfResearchPresentation.decimalNormalizedVolumeParityStatus,
      "DECIMAL_NORMALIZED_VOLUME_PARITY_ESTABLISHED"
    );
    assert.notEqual(
      ctx.nativeHtfResearchPresentation.fieldParityStatus,
      ctx.nativeHtfResearchPresentation.decimalNormalizedVolumeParityStatus
    );
  });

  it("frozen BTC EOD — limitations count stable with taxonomy", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    const E = loaded.candles.length - 1;
    const ctx = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [{ timeframeId: "1H", candles: loaded.candles, evaluationBarIndex: E }],
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      horizonBars: 24,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    assert.equal(ctx.limitations.length, 113);
    const merged = [
      ...ctx.presentationTaxonomy.coreLimitations,
      ...ctx.presentationTaxonomy.researchPresentationFlags,
      ...ctx.presentationTaxonomy.technicalLimitations,
    ];
    assert.equal(merged.length, new Set(merged).size);
    const ctx2 = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [{ timeframeId: "1H", candles: loaded.candles, evaluationBarIndex: E }],
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      horizonBars: 24,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    assert.deepEqual(ctx.limitations, ctx2.limitations);
    assert.deepEqual(ctx.presentationTaxonomy, ctx2.presentationTaxonomy);
  });

  it("15M remains NOT_ESTABLISHED on 9F", () => {
    const ctx = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [{ timeframeId: "1H", candles: Array.from({ length: 40 }, (_, i) => c(i * ONE_H)), evaluationBarIndex: 20 }],
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const m15 = ctx.timeframeStatus.find((t) => t.timeframeId === "15M");
    assert.equal(m15?.status, "NOT_ESTABLISHED");
  });
});
