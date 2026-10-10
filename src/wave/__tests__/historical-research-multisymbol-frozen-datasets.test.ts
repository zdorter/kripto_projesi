import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  freezeHistoricalOhlcvDataset,
  InsufficientFrozenDatasetError,
  serializeHistoricalFrozenOhlcvDatasetDocument,
} from "../historical-frozen-ohlcv-dataset-freeze";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import {
  loadBtcusdt1hResearchFrozenDatasetV1,
  validateLoadedFrozenOhlcvDataset,
} from "../historical-frozen-ohlcv-dataset";
import {
  assertBtcResearchDatasetChecksumUnchanged,
  buildPhaseBResearchDatasetRefsFromManifest,
  loadHistoricalResearchDatasetManifestV1,
  loadMultiSymbol1hResearchFrozenDatasetV1,
} from "../historical-research-dataset-manifest";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH,
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
} from "../historical-frozen-ohlcv-dataset-types";
import { buildHistoricalPhaseBMultiSymbolRegimeValidation } from "../historical-phase-b-multi-symbol-regime-validation";
import { phaseBResearchScopeKey } from "../historical-phase-b-multi-symbol-regime-validation";
import type { Candle } from "../types";

const ALT_SYMBOLS = ["ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"] as const;

function fixtureExists(relativePath: string): boolean {
  return existsSync(join(process.cwd(), relativePath));
}

function validateSymbolFixture(symbol: (typeof ALT_SYMBOLS)[number] | "BTCUSDT") {
  const loaded = loadMultiSymbol1hResearchFrozenDatasetV1(symbol);
  assert.equal(loaded.document.metadata.symbol, symbol);
  assert.equal(loaded.document.metadata.timeframe, "1H");
  assert.equal(loaded.candles.length, RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT);
  const validation = validateLoadedFrozenOhlcvDataset(loaded);
  assert.equal(validation.ok, true);
  const times = new Set(loaded.candles.map((c) => c.time));
  assert.equal(times.size, loaded.candles.length);
  for (let i = 1; i < loaded.candles.length; i++) {
    assert.equal(loaded.candles[i].time - loaded.candles[i - 1].time, 3_600_000);
  }
  assert.equal(
    computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
    loaded.document.metadata.datasetChecksum
  );
  return loaded;
}

describe("historical-research-multisymbol-frozen-datasets (B-22)", () => {
  it("A. BTC checksum unchanged", () => {
    assertBtcResearchDatasetChecksumUnchanged();
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(loaded.document.metadata.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("P. BTC immutability (fixture file hash stable)", () => {
    const text = readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH), "utf8");
    const before = JSON.parse(text).metadata.datasetChecksum;
    assertBtcResearchDatasetChecksumUnchanged();
    const after = JSON.parse(readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH), "utf8"))
      .metadata.datasetChecksum;
    assert.equal(before, after);
    assert.equal(before, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  for (const [label, symbol] of [
    ["B", "ETHUSDT"],
    ["C", "BNBUSDT"],
    ["D", "SOLUSDT"],
    ["E", "XRPUSDT"],
    ["F", "ADAUSDT"],
  ] as const) {
    it(`${label}. ${symbol} dataset validation`, () => {
      const path = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
      if (!fixtureExists(path)) {
        assert.fail(`DATASET_NOT_AVAILABLE: run npm run freeze:multisymbol-1h-research — missing ${path}`);
      }
      validateSymbolFixture(symbol);
    });
  }

  it("G. candle count 3000 for available alt fixtures", () => {
    for (const symbol of ALT_SYMBOLS) {
      const path = RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol];
      if (!fixtureExists(path)) continue;
      assert.equal(loadMultiSymbol1hResearchFrozenDatasetV1(symbol).candles.length, 3000);
    }
  });

  it("N. manifest", () => {
    if (!fixtureExists(HISTORICAL_RESEARCH_DATASET_MANIFEST_V1_RELATIVE_PATH)) {
      const built = loadHistoricalResearchDatasetManifestV1();
      assert.equal(built.entries.length, MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS.length);
      const btc = built.entries.find((e) => e.symbol === "BTCUSDT")!;
      assert.equal(btc.status, "DATASET_AVAILABLE");
      assert.equal(btc.checksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
      return;
    }
    const manifest = loadHistoricalResearchDatasetManifestV1();
    assert.equal(manifest.schemaVersion, "1.0");
    const btc = manifest.entries.find((e) => e.symbol === "BTCUSDT")!;
    assert.equal(btc.checksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("O. deterministic serialization", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    const a = serializeHistoricalFrozenOhlcvDatasetDocument(loaded.document);
    const b = serializeHistoricalFrozenOhlcvDatasetDocument(loaded.document);
    assert.equal(a, b);
  });

  it("Q. B-21 dataset compatibility", () => {
    const refs = buildPhaseBResearchDatasetRefsFromManifest();
    assert.ok(refs.some((r) => r.symbol === "BTCUSDT"));
    for (const r of refs) {
      assert.equal(r.status, "AVAILABLE");
      assert.equal(r.candleCount, RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT);
      assert.ok(r.candles && r.candles.length === r.candleCount);
    }
    const report = buildHistoricalPhaseBMultiSymbolRegimeValidation({
      datasets: refs,
      lifecycleReports: {},
    });
    assert.ok(report.datasetMatrix.find((d) => d.symbol === "BTCUSDT")?.status === "AVAILABLE");
    for (const symbol of ALT_SYMBOLS) {
      const row = report.datasetMatrix.find((d) => d.symbol === symbol)!;
      if (fixtureExists(RESEARCH_FROZEN_1H_DATASET_V1_PATH_BY_SYMBOL[symbol])) {
        assert.equal(row.status, "AVAILABLE");
      }
    }
  });

  it("S. insufficient data handling", () => {
    const candle: Candle = {
      time: 1_700_000_000_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 10,
    };
    assert.throws(
      () =>
        freezeHistoricalOhlcvDataset({
          candles: [candle],
          symbol: "TESTUSDT",
          timeframe: "1H",
          relativePath: "tmp/test-fixture.json",
          expectedCandleCount: 3000,
        }),
      (err: unknown) => err instanceof InsufficientFrozenDatasetError && err.code === "INSUFFICIENT_DATASET"
    );
  });

  it("T. architecture guard (freeze module no fetch)", () => {
    const mod = readFileSync(join(process.cwd(), "src/wave/historical-frozen-ohlcv-dataset-freeze.ts"), "utf8");
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!mod.includes("fetch("));
  });

  it("U. freeze script present", () => {
    assert.ok(existsSync(join(process.cwd(), "scripts/freeze-multisymbol-1h-research-dataset.ts")));
    assert.ok(existsSync(join(process.cwd(), "scripts/freeze-btcusdt-1h-research-dataset.ts")));
  });
});
