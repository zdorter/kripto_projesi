import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketStructureUiCacheKey,
  closedEvaluationBarIndex,
} from "../market-structure-ui-data";
import {
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
  MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
} from "../../wave/market-structure/market-structure-descriptive-confluence-surface-types";

describe("market-structure-ui-app helpers (MSL-11)", () => {
  it("evaluation bar is last closed index", () => {
    assert.equal(closedEvaluationBarIndex(500), 499);
    assert.equal(closedEvaluationBarIndex(1), 0);
  });

  it("cache key canonical format", () => {
    const key = buildMarketStructureUiCacheKey({
      symbol: "BTCUSDT",
      schemaVersion: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_CONTEXT_SCHEMA_VERSION,
      ruleId: MARKET_STRUCTURE_DESCRIPTIVE_CONFLUENCE_SURFACE_RESEARCH_RULE_ID,
      ltfEvalTs: 1_700_000_000_000,
      ltfLen: 500,
      htfSourceTrack: "DERIVED_1H_4H",
      includeReplay: false,
    });
    assert.ok(key.startsWith("BTCUSDT|"));
    assert.ok(key.endsWith("|replay0"));
  });

  it("cache key changes when replay enabled", () => {
    const base = {
      symbol: "ETHUSDT",
      schemaVersion: "1.0",
      ruleId: "RULE",
      ltfEvalTs: 100,
      ltfLen: 50,
      htfSourceTrack: "DERIVED_1H_4H" as const,
    };
    const off = buildMarketStructureUiCacheKey({ ...base, includeReplay: false });
    const on = buildMarketStructureUiCacheKey({ ...base, includeReplay: true });
    assert.notEqual(off, on);
  });
});
