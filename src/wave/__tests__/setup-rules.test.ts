import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSetupCatalogEntry } from "../setup/setup-catalog";
import {
  evaluateCondition,
  resolveDirectionalBias,
  resolveSetupLifecycleStatus,
} from "../setup/setup-rules";
import type { WaveScanResult } from "../wave-scanner";

function baseRow(overrides: Partial<WaveScanResult> = {}): WaveScanResult {
  return {
    symbol: "BTCUSDT",
    timeframe: "1H",
    scenarioId: "primary-impulse-5",
    role: "PRIMARY",
    structure: "IMPULSE",
    waveLabel: "5",
    engineStatus: "CONFIRMED",
    scenarioStatus: "ACTIVE",
    confidence: 72,
    startIndex: 10,
    endIndex: 20,
    startPrice: 100,
    endPrice: 120,
    invalidation: {
      available: true,
      price: 95,
      rule: "Focus-leg invalidation.",
      source: "FOCUS_LEG",
    },
    evidence: ["test"],
    limitations: [],
    ...overrides,
  };
}

describe("setup-rules", () => {
  it("scenario-active MET only for ACTIVE lifecycle", () => {
    const ctx = { scanRow: baseRow() };
    assert.equal(evaluateCondition("scenario-active", ctx).outcome, "MET");
    assert.equal(
      evaluateCondition("scenario-active", {
        scanRow: baseRow({ scenarioStatus: "INVALIDATED" }),
      }).outcome,
      "NOT_MET"
    );
  });

  it("fib-context-available is always INSUFFICIENT_DATA on scan contract", () => {
    const out = evaluateCondition("fib-context-available", {
      scanRow: baseRow(),
    });
    assert.equal(out.outcome, "INSUFFICIENT_DATA");
  });

  it("mtf-relationship-aligned is NOT_MET for NESTED_POSSIBLE", () => {
    const out = evaluateCondition("mtf-relationship-aligned", {
      scanRow: baseRow(),
      symbolContext: {
        multiTimeframe: {
          schemaVersion: "1.0",
          higherTimeframe: {} as never,
          lowerTimeframe: {} as never,
          trendAlignment: {
            higherTrend: "BULLISH",
            lowerTrend: "BULLISH",
            comparison: "SAME",
          },
          relationship: {
            kind: "NESTED_POSSIBLE",
            summary: "nested possible",
          },
          timeAlignment: {} as never,
          notes: [],
        },
      },
    });
    assert.equal(out.outcome, "NOT_MET");
  });

  it("resolveSetupLifecycleStatus caps structural types at CANDIDATE when conditions MET", () => {
    const entry = getSetupCatalogEntry("primary-focus-leg")!;
    const row = baseRow();
    const ctx = { scanRow: row };
    const trigger = entry.triggerConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const confirmation = entry.confirmationConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const invalidation = [
      evaluateCondition("setup-invalidation-triggered", ctx),
    ];
    assert.equal(
      resolveSetupLifecycleStatus(
        row,
        entry,
        trigger,
        confirmation,
        invalidation,
        false
      ),
      "CANDIDATE"
    );
  });

  it("resolveSetupLifecycleStatus CONFIRMED only when isTradeSetup true", () => {
    const entry = {
      ...getSetupCatalogEntry("primary-focus-leg")!,
      isTradeSetup: true,
      category: "TRADE_SETUP" as const,
    };
    const row = baseRow();
    const ctx = { scanRow: row };
    const trigger = entry.triggerConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const confirmation = entry.confirmationConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const invalidation = [
      evaluateCondition("setup-invalidation-triggered", ctx),
    ];
    assert.equal(
      resolveSetupLifecycleStatus(
        row,
        entry,
        trigger,
        confirmation,
        invalidation,
        false
      ),
      "CONFIRMED"
    );
  });

  it("resolveSetupLifecycleStatus CANDIDATE when confirmation incomplete", () => {
    const entry = getSetupCatalogEntry("primary-focus-leg")!;
    const row = baseRow({
      invalidation: {
        available: false,
        rule: "none",
        source: "NONE",
      },
    });
    const ctx = { scanRow: row };
    const trigger = entry.triggerConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const confirmation = entry.confirmationConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const invalidation = [
      evaluateCondition("setup-invalidation-triggered", ctx),
    ];
    assert.equal(
      resolveSetupLifecycleStatus(
        row,
        entry,
        trigger,
        confirmation,
        invalidation,
        false
      ),
      "CANDIDATE"
    );
  });

  it("INVALIDATED scenario maps to INVALID", () => {
    const entry = getSetupCatalogEntry("primary-focus-leg")!;
    const row = baseRow({ scenarioStatus: "INVALIDATED" });
    const ctx = { scanRow: row };
    const trigger = entry.triggerConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const confirmation = entry.confirmationConditions.map((id) =>
      evaluateCondition(id, ctx)
    );
    const invalidation = [
      evaluateCondition("setup-invalidation-triggered", ctx),
    ];
    assert.equal(
      resolveSetupLifecycleStatus(
        row,
        entry,
        trigger,
        confirmation,
        invalidation,
        false
      ),
      "INVALID"
    );
  });

  it("Wave 5 does not use LEG_PRICE_DELTA for bullish bias", () => {
    const row = baseRow({
      waveLabel: "5",
      startPrice: 100,
      endPrice: 200,
    });
    const { bias, basis } = resolveDirectionalBias(row, { scanRow: row });
    assert.equal(bias, null);
    assert.equal(basis, null);
  });

  it("Wave C does not use LEG_PRICE_DELTA for bearish bias", () => {
    const row = baseRow({
      waveLabel: "C",
      structure: "CORRECTIVE",
      startPrice: 200,
      endPrice: 100,
    });
    const { bias } = resolveDirectionalBias(row, { scanRow: row });
    assert.equal(bias, null);
  });

  it("wave 3 may use LEG_PRICE_DELTA when prices trend up", () => {
    const row = baseRow({
      waveLabel: "3",
      startPrice: 100,
      endPrice: 110,
    });
    const { bias, basis } = resolveDirectionalBias(row, { scanRow: row });
    assert.equal(bias, "BULLISH");
    assert.equal(basis, "LEG_PRICE_DELTA");
  });
});
