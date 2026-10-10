import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INDEPENDENT_TRADE_UNIT_DECISION_CANDLE_RANGE,
  INDEPENDENT_TRADE_UNIT_DESIGN_NON_GOALS,
  INDEPENDENT_TRADE_UNIT_DESIGN_SCHEMA_VERSION,
} from "../independent-trade-unit-design-contract";

describe("independent-trade-unit-design-contract", () => {
  it("exports B-12a documentation constants only", () => {
    assert.equal(INDEPENDENT_TRADE_UNIT_DESIGN_SCHEMA_VERSION, "1.0");
    assert.ok(INDEPENDENT_TRADE_UNIT_DECISION_CANDLE_RANGE.includes("0.."));
    assert.ok(INDEPENDENT_TRADE_UNIT_DESIGN_NON_GOALS.includes("calculatePnL"));
  });
});
