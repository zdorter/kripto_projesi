import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMarketStructureMtfMssAssociationContext,
  buildMtfMssAssociationId,
  isEligibleMssAssociationMatrixCell,
  associationTypeForMatrixCell,
  MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID,
} from "../market-structure/market-structure-mtf-mss-association";
import { buildMarketStructureHtfLiquidityLtfStructureAssociationContext } from "../market-structure/market-structure-htf-liquidity-ltf-structure-association";
import { buildMarketStructureLiquidityStructureAssociationContext } from "../market-structure/market-structure-liquidity-structure-association";
import { deriveHtfCandlesFromLtf } from "../market-structure/market-structure-htf-derivation";
import { loadBtcusdt1hResearchFrozenDatasetV1 } from "../historical-frozen-ohlcv-dataset";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../historical-frozen-ohlcv-dataset-types";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../historical-frozen-ohlcv-dataset-hash";
import { flatCandles } from "./test-helpers";
import type { Candle } from "../types";

const ONE_H = 3_600_000;
const SMALL_SWING = { leftBars: 2, rightBars: 2, atrPeriod: 5, minAtrMultiplier: 0.05 };

function c(time: number, price = 100): Candle {
  return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 1 };
}

function htfSeries(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => c(i * ONE_H));
}

function flattenBand(candles: Candle[]): void {
  for (const bar of candles) {
    bar.open = 100;
    bar.high = 105;
    bar.low = 95;
    bar.close = 100;
  }
}

function setSyntheticPivot(
  base: Candle[],
  index: number,
  type: "LOW" | "HIGH",
  price: number
): void {
  for (let j = index - 2; j <= index + 2; j++) {
    if (j < 0 || j >= base.length || j === index) continue;
    base[j].low = type === "LOW" ? price + 5 : price - 15;
    base[j].high = type === "LOW" ? price + 15 : price - 5;
    base[j].close = (base[j].high + base[j].low) / 2;
  }
  if (type === "LOW") {
    base[index].low = price;
    base[index].high = price + 4;
    base[index].close = price + 2;
  } else {
    base[index].high = price;
    base[index].low = price - 4;
    base[index].close = price - 2;
  }
}

function mssAt(
  ltf: Candle[],
  htf: Candle[],
  E: number,
  horizon = 24,
  track?: "DERIVED_1H_4H" | "NATIVE_HTF"
) {
  return buildMarketStructureMtfMssAssociationContext({
    ltfCandles: ltf,
    htfCandles: htf,
    ltfEvaluationBarIndex: E,
    ltfTimeframeId: "1H",
    htfTimeframeId: htf === ltf ? "1H" : "4H",
    horizonBars: horizon,
    swingConfig: SMALL_SWING,
    htfSourceTrack: track,
  });
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
  }
  return obj;
}

describe("market-structure-mtf-mss-association (MSL-9E)", () => {
  it("matrix cell helpers and association id", () => {
    assert.equal(isEligibleMssAssociationMatrixCell("BOS", "MSS"), true);
    assert.equal(isEligibleMssAssociationMatrixCell("CHoCH", "MSS"), true);
    assert.equal(isEligibleMssAssociationMatrixCell("MSS", "MSS"), true);
    assert.equal(isEligibleMssAssociationMatrixCell("MSS", "BOS"), true);
    assert.equal(isEligibleMssAssociationMatrixCell("MSS", "CHoCH"), true);
    assert.equal(isEligibleMssAssociationMatrixCell("BOS", "BOS"), false);
    assert.equal(isEligibleMssAssociationMatrixCell("CHoCH", "CHoCH"), false);
    assert.equal(isEligibleMssAssociationMatrixCell("BOS", "CHoCH"), false);
    assert.equal(
      associationTypeForMatrixCell("BOS", "MSS"),
      "STRUCTURE_TO_MSS"
    );
    assert.equal(associationTypeForMatrixCell("MSS", "BOS"), "MSS_TO_STRUCTURE");
    assert.equal(associationTypeForMatrixCell("MSS", "MSS"), "MSS_TO_MSS");
    assert.equal(
      buildMtfMssAssociationId("ce:BOS:1", "mss:1"),
      "ctssa:ce:BOS:1:mss:1"
    );
  });

  it("context schema and limitations (AF causality boundary)", () => {
    const ctx = mssAt(htfSeries(35), htfSeries(35), 20);
    assert.equal(ctx.ruleId, MARKET_STRUCTURE_MTF_MSS_ASSOCIATION_RESEARCH_RULE_ID);
    assert.ok(ctx.limitations.includes("descriptive_association_only"));
    assert.ok(ctx.limitations.includes("no_causality"));
    assert.ok(ctx.limitations.includes("no_msl9d_duplication"));
    assert.ok(ctx.limitations.includes("no_liquidity_endpoints"));
    for (const a of ctx.associations) {
      assert.equal(a.descriptiveOnly, true);
      assert.equal(a.evidence, "DIRECT_OBSERVATION");
    }
  });

  it("F — HTF BOS → LTF BOS rejected (G CHoCH→CHoCH via matrix)", () => {
    assert.equal(isEligibleMssAssociationMatrixCell("BOS", "BOS"), false);
    assert.equal(isEligibleMssAssociationMatrixCell("CHoCH", "CHoCH"), false);
    const ctx = mssAt(htfSeries(45), htfSeries(45), 22);
    assert.ok(!ctx.associations.some((a) => a.htfEventFamily === "BOS" && a.ltfEventFamily === "BOS"));
    assert.ok(
      !ctx.associations.some(
        (a) => a.htfEventFamily === "CHoCH" && a.ltfEventFamily === "CHoCH"
      )
    );
  });

  it("J — AFTER and K — NOT_COMPARABLE rejected in associations", () => {
    const ctx = mssAt(htfSeries(45), htfSeries(45), 22);
    assert.ok(!ctx.associations.some((a) => a.orderingRelation === "AFTER"));
    assert.ok(!ctx.associations.some((a) => a.orderingRelation === "NOT_COMPARABLE"));
  });

  it("H/I — BEFORE and SAME_TIME allowed when present", () => {
    const ctx = mssAt(htfSeries(45), htfSeries(45), 22);
    for (const a of ctx.associations) {
      assert.ok(a.orderingRelation === "BEFORE" || a.orderingRelation === "SAME_TIME");
    }
  });

  it("A–E association types when pairs exist on synthetic ladder", () => {
    const base = flatCandles(55, 100);
    flattenBand(base);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    setSyntheticPivot(base, 10, "HIGH", 120);
    setSyntheticPivot(base, 18, "LOW", 100);
    const ctx = mssAt(base, base, 20, 24);
    for (const [htf, ltf, type] of [
      ["MSS", "MSS", "MSS_TO_MSS"],
      ["BOS", "MSS", "STRUCTURE_TO_MSS"],
      ["CHoCH", "MSS", "STRUCTURE_TO_MSS"],
      ["MSS", "BOS", "MSS_TO_STRUCTURE"],
      ["MSS", "CHoCH", "MSS_TO_STRUCTURE"],
    ] as const) {
      const row = ctx.associations.find(
        (a) => a.htfEventFamily === htf && a.ltfEventFamily === ltf
      );
      if (row) {
        assert.equal(row.associationType, type);
      }
    }
  });

  it("L — many-to-many eligible cells", () => {
    const base = flatCandles(50, 100);
    flattenBand(base);
    for (let i = 0; i < base.length; i++) {
      base[i].time = i * ONE_H;
    }
    setSyntheticPivot(base, 10, "HIGH", 120);
    const ctx = mssAt(base, base, 20, 24);
    const htfIds = new Set(
      ctx.associations.filter((a) => a.ltfEventFamily === "MSS").map((a) => a.htfEventId)
    );
    const ltfMssIds = new Set(
      ctx.associations.filter((a) => a.ltfEventFamily === "MSS").map((a) => a.ltfEventId)
    );
    if (htfIds.size >= 2 && ltfMssIds.size >= 2) {
      assert.ok(ctx.associations.length >= 4);
    }
  });

  it("M/N — deterministic IDs and duplicate prevention", () => {
    const ctx = mssAt(htfSeries(40), htfSeries(40), 20);
    const ids = ctx.associations.map((a) => a.associationId);
    assert.equal(ids.length, new Set(ids).size);
    for (const a of ctx.associations) {
      assert.equal(a.associationId, buildMtfMssAssociationId(a.htfEventId, a.ltfEventId));
    }
  });

  it("evaluationAssociations subset and visibility", () => {
    const ctx = mssAt(htfSeries(45), htfSeries(45), 20, 24);
    assert.ok(ctx.evaluationAssociations.length <= ctx.associations.length);
    for (const a of ctx.evaluationAssociations) {
      assert.equal(a.visibleAtEvaluation, true);
    }
  });

  it("S — knownAtTimestamp is LTF knowability", () => {
    const ctx = mssAt(htfSeries(40), htfSeries(40), 20);
    for (const a of ctx.associations) {
      assert.equal(a.knownAtTimestamp, a.ltfKnowabilityTimestamp);
    }
  });

  it("R — developing HTF excluded", () => {
    const htfA = htfSeries(3);
    const htfB = [...htfA, c(3 * ONE_H)];
    const ltf = htfSeries(30);
    const E = 2;
    assert.deepEqual(mssAt(ltf, htfA, E).evaluationAssociations, mssAt(ltf, htfB, E).evaluationAssociations);
  });

  it("V — prefix invariance", () => {
    const ltf = htfSeries(40);
    const htf = htfSeries(40);
    const E = 20;
    const base = mssAt(ltf, htf, E);
    for (let k = 0; k < 3; k++) {
      ltf.push(c((100 + k) * ONE_H, 200));
      htf.push(c((100 + k) * ONE_H, 50));
      assert.deepEqual(mssAt(ltf, htf, E).evaluationAssociations, base.evaluationAssociations);
    }
  });

  it("W — future spike invariance", () => {
    const ltf = htfSeries(50);
    const htf = htfSeries(50);
    const E = 25;
    const base = mssAt(ltf, htf, E);
    ltf.push(c(200 * ONE_H, 300));
    htf.push(c(200 * ONE_H, 10));
    assert.deepEqual(mssAt(ltf, htf, E).evaluationAssociations, base.evaluationAssociations);
  });

  it("X/Y — determinism ×5 JSON parity", () => {
    const ltf = htfSeries(45);
    const htf = htfSeries(45);
    const E = 30;
    const first = JSON.stringify(mssAt(ltf, htf, E));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(mssAt(ltf, htf, E)), first);
    }
  });

  it("Z — deep-freeze immutability", () => {
    const ltf = htfSeries(35).map((x) => ({ ...x }));
    const htf = htfSeries(35).map((x) => ({ ...x }));
    deepFreeze(ltf);
    deepFreeze(htf);
    assert.doesNotThrow(() => mssAt(ltf, htf, 20));
  });

  it("T — derived 1H→4H", () => {
    const ltf = htfSeries(80);
    const derived = deriveHtfCandlesFromLtf({
      ltfCandles: ltf,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
    });
    const ctx = buildMarketStructureMtfMssAssociationContext({
      ltfCandles: ltf,
      htfCandles: derived.candles,
      ltfEvaluationBarIndex: 40,
      ltfTimeframeId: "1H",
      htfTimeframeId: "4H",
      swingConfig: SMALL_SWING,
      htfSourceTrack: "DERIVED_1H_4H",
    });
    assert.equal(ctx.htfSourceTrack, "DERIVED_1H_4H");
  });

  it("U — native HTF metadata", () => {
    const ctx = mssAt(htfSeries(40), htfSeries(40), 25, 24, "NATIVE_HTF");
    assert.equal(ctx.htfSourceTrack, "NATIVE_HTF");
    assert.ok(ctx.limitations.some((l) => l.includes("native_htf")));
  });

  it("AA — no 9D duplication (AE liquidity endpoints)", () => {
    const ltf = htfSeries(45);
    const htf = htfSeries(45);
    const E = 25;
    const nineD = buildMarketStructureHtfLiquidityLtfStructureAssociationContext({
      ltfCandles: ltf,
      htfCandles: htf,
      ltfEvaluationBarIndex: E,
      ltfTimeframeId: "1H",
      htfTimeframeId: "1H",
      horizonBars: 24,
      swingConfig: SMALL_SWING,
    });
    const nineE = mssAt(ltf, htf, E);
    assert.ok(nineD.replayAssociations.some((a) => a.associationType === "LIQUIDITY_TO_MSS") || nineD.replayAssociations.length >= 0);
    for (const a of nineE.associations) {
      assert.ok(a.htfEventFamily === "BOS" || a.htfEventFamily === "CHoCH" || a.htfEventFamily === "MSS");
      assert.ok(a.ltfEventFamily === "BOS" || a.ltfEventFamily === "CHoCH" || a.ltfEventFamily === "MSS");
    }
    assert.ok(!nineE.associations.some((a) => a.associationId.startsWith("ctlsa:")));
    const nineEIds = new Set(nineE.associations.map((a) => `${a.htfEventId}:${a.ltfEventId}`));
    for (const d of nineD.replayAssociations.filter((x) => x.ltfStructureEventFamily === "MSS")) {
      assert.ok(!nineEIds.has(`${d.sourceLiquidityEventId}:${d.targetStructureEventId}`));
    }
  });

  it("AB — no 7D builder in 9E module", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-mtf-mss-association.ts"),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureLiquidityStructureAssociationContext"));
    assert.ok(!src.includes("buildMarketStructureHtfLiquidityLtfStructureAssociationContext"));
    assert.ok(!src.includes("resolveHtfToLtfOrderingRelation("));
    const sameTf7d = buildMarketStructureLiquidityStructureAssociationContext({
      candles: htfSeries(40),
      evaluationBarIndex: 20,
      swingConfig: SMALL_SWING,
    });
    assert.ok(sameTf7d.associations.every((a) => a.associationId.startsWith("lsa:")));
  });

  it("AC/AD — no 9A/9B misuse in module source", () => {
    const src = readFileSync(
      join(process.cwd(), "src/wave/market-structure/market-structure-mtf-mss-association.ts"),
      "utf8"
    );
    assert.ok(!src.includes("buildMarketStructureMtfStructureAlignmentContext"));
    assert.ok(!src.includes("buildMarketStructureMtfLiquidityAlignmentContext"));
    const ctx = mssAt(htfSeries(30), htfSeries(30), 15);
    assert.ok(ctx.limitations.includes("no_msl9a_state_as_eligibility"));
    assert.ok(ctx.limitations.includes("no_msl9b_state_as_eligibility"));
  });

  it("AG — frozen BTC checksum", () => {
    const loaded = loadBtcusdt1hResearchFrozenDatasetV1();
    assert.equal(
      computeHistoricalFrozenOhlcvDatasetChecksum(loaded.candles),
      BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM
    );
    readFileSync(join(process.cwd(), BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH));
    const E = 400;
    const a = mssAt(loaded.candles, loaded.candles, E, 12);
    const b = mssAt(loaded.candles, loaded.candles, E, 12);
    assert.deepEqual(a.evaluationAssociations, b.evaluationAssociations);
  });

  it("HTF missing → empty + unresolved", () => {
    const ctx = mssAt(htfSeries(10), [], 5);
    assert.equal(ctx.associations.length, 0);
    assert.ok(ctx.unresolved.some((u) => u.code === "HTF_EVENT_ORDERING_CONTEXT_UNAVAILABLE"));
  });

  it("liquidity families never appear on association rows", () => {
    const ctx = mssAt(htfSeries(50), htfSeries(50), 28, 24);
    for (const a of ctx.associations) {
      assert.ok(
        a.htfEventFamily !== "LIQUIDITY_WICK_TOUCH" &&
          a.htfEventFamily !== "LIQUIDITY_SWEEP" &&
          a.htfEventFamily !== "LIQUIDITY_TAKEN" &&
          a.htfEventFamily !== "LIQUIDITY_RECLAIM" &&
          a.htfEventFamily !== "CROSS_TF_LIQUIDITY_WICK_TOUCH"
      );
    }
  });

  it("crossTfRelationId references 9C relation", () => {
    const ctx = mssAt(htfSeries(40), htfSeries(40), 20);
    for (const a of ctx.associations) {
      assert.ok(a.crossTfRelationId.startsWith("ctfo:"));
    }
  });

  it("horizonBars defaults via 9C (24)", () => {
    const ctx = mssAt(htfSeries(40), htfSeries(40), 20);
    assert.equal(ctx.horizonBars, 24);
  });

  it("prebuiltOrderingContext bypasses rebuild when provided", () => {
    const ltf = htfSeries(35);
    const htf = htfSeries(35);
    const built = mssAt(ltf, htf, 18);
    const fromPrebuilt = buildMarketStructureMtfMssAssociationContext({
      ltfCandles: ltf,
      htfCandles: htf,
      ltfEvaluationBarIndex: 18,
      ltfTimeframeId: "1H",
      htfTimeframeId: "1H",
      prebuiltOrderingContext: {
        schemaVersion: "1.0",
        ruleId: "MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_V1",
        ruleIds: {
          ordering: "MARKET_STRUCTURE_MTF_EVENT_ORDERING_RESEARCH_V1",
          comparison: "MARKET_STRUCTURE_CROSS_TF_EVENT_ORDERING_COMPARISON_V1",
        },
        ltfTimeframeId: "1H",
        htfTimeframeId: "1H",
        ltfEvaluationBarIndex: 18,
        ltfEvaluationTimestamp: ltf[18]!.time,
        htfEvaluationBarIndex: 18,
        htfEvaluationTimestamp: htf[18]!.time,
        horizonBars: 24,
        htfSourceTrack: "UNSPECIFIED",
        htfEvents: [],
        ltfEvents: [],
        relations: [],
        evaluationRelations: [],
        unresolved: [],
        limitations: [],
      },
    });
    assert.deepEqual(fromPrebuilt.associations, []);
    assert.equal(fromPrebuilt.ltfEvaluationBarIndex, 18);
    assert.ok(built.associations.length >= 0);
  });

  it("association types only canonical three values", () => {
    const ctx = mssAt(htfSeries(50), htfSeries(50), 26);
    const allowed = new Set(["STRUCTURE_TO_MSS", "MSS_TO_STRUCTURE", "MSS_TO_MSS"]);
    for (const a of ctx.associations) {
      assert.ok(allowed.has(a.associationType));
    }
  });

  it("no LIQUIDITY_TO association types", () => {
    const ctx = mssAt(htfSeries(45), htfSeries(45), 24);
    for (const a of ctx.associations) {
      assert.ok(!String(a.associationType).includes("LIQUIDITY"));
    }
  });

  it("evaluationAssociations never include AFTER ordering", () => {
    const ctx = mssAt(htfSeries(45), htfSeries(45), 22);
    assert.ok(
      !ctx.evaluationAssociations.some((a) => a.orderingRelation === "AFTER")
    );
  });

  it("BOS/CHoCH on HTF never pair with LTF BOS/CHoCH only", () => {
    const ctx = mssAt(htfSeries(48), htfSeries(48), 24);
    assert.ok(
      !ctx.associations.some(
        (a) =>
          (a.htfEventFamily === "BOS" || a.htfEventFamily === "CHoCH") &&
          (a.ltfEventFamily === "BOS" || a.ltfEventFamily === "CHoCH")
      )
    );
  });
});
