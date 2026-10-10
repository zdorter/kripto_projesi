import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { presentMarketStructureUiViewModel } from "../market-structure-ui-presenter";
import { buildMarketStructureDescriptiveConfluenceSurfaceContext } from "../../wave/market-structure/market-structure-descriptive-confluence-surface";
import type { Candle } from "../../wave/types";

const ONE_H = 3_600_000;
const SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

describe("market-structure-ui-page (MSL-10 WP6 tiers)", () => {
  it("page source uses tier1/tier2 and temporal-only ordering copy", () => {
    const src = readFileSync(join(process.cwd(), "src/browser/market-structure-ui-page.ts"), "utf8");
    assert.ok(src.includes("tier1"));
    assert.ok(src.includes("tier2"));
    assert.ok(src.includes("orderingPresentationNote"));
    assert.ok(src.includes("associationPresentationNote"));
    assert.ok(src.includes("mssPresentationNote"));
    assert.ok(src.includes("temporal only"));
    assert.ok(!src.includes("led to"));
    assert.ok(!src.includes("caused"));
  });

  it("view-model tier2 holds flat limitations for backward compat", () => {
    const surface = buildMarketStructureDescriptiveConfluenceSurfaceContext({
      timeframeInputs: [{ timeframeId: "1H", candles: Array.from({ length: 55 }, (_, i) => c(i * ONE_H)), evaluationBarIndex: 28 }],
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      swingConfig: SWING,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    const vm = presentMarketStructureUiViewModel({
      surface,
      symbol: "BTCUSDT",
      dataMode: "LIVE",
      loadStatus: "ready",
    });
    assert.deepEqual(vm.tier2!.limitations, vm.limitations);
  });
});
