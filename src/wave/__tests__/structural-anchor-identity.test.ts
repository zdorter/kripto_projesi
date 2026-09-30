import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeAnchorCandidatesByStructuralIdentity,
  structuralAnchorIdentityKey,
  structuralAnchorPricesEqual,
} from "../setup/structural-anchor-identity";

describe("structural anchor identity (14N-I)", () => {
  it("A: same index/price multi-provenance merges", () => {
    const merged = mergeAnchorCandidatesByStructuralIdentity([
      {
        anchorIndex: 481,
        anchorPrice: 83_824.7,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: true,
      },
      {
        anchorIndex: 481,
        anchorPrice: 83_824.7,
        anchorKind: "LOW",
        sources: ["CONFIRMED_SWING"],
        futureSafe: true,
      },
      {
        anchorIndex: 481,
        anchorPrice: 83_824.7,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["SCENARIO_FOCUS_ENDPOINT"],
        futureSafe: true,
      },
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0]!.sources.sort(), [
      "CONFIRMED_SWING",
      "HISTORICAL_SETUP_ENDPOINT",
      "SCENARIO_FOCUS_ENDPOINT",
    ]);
    assert.equal(merged[0]!.anchorKind, "STRUCTURAL_ENDPOINT");
  });

  it("B: different index remains distinct", () => {
    const merged = mergeAnchorCandidatesByStructuralIdentity([
      {
        anchorIndex: 10,
        anchorPrice: 100,
        anchorKind: "LOW",
        sources: ["CONFIRMED_SWING"],
        futureSafe: true,
      },
      {
        anchorIndex: 18,
        anchorPrice: 132,
        anchorKind: "LOW",
        sources: ["SCENARIO_FOCUS_ENDPOINT"],
        futureSafe: true,
      },
    ]);
    assert.equal(merged.length, 2);
  });

  it("C: materially different price remains distinct", () => {
    const merged = mergeAnchorCandidatesByStructuralIdentity([
      {
        anchorIndex: 18,
        anchorPrice: 132,
        anchorKind: "LOW",
        sources: ["CONFIRMED_SWING"],
        futureSafe: true,
      },
      {
        anchorIndex: 18,
        anchorPrice: 140,
        anchorKind: "LOW",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: true,
      },
    ]);
    assert.equal(merged.length, 2);
  });

  it("D-E: provenance retained; merge deterministic", () => {
    const a = mergeAnchorCandidatesByStructuralIdentity([
      {
        anchorIndex: 5,
        anchorPrice: 50,
        anchorKind: "HIGH",
        sources: ["CONFIRMED_SWING"],
        futureSafe: true,
      },
      {
        anchorIndex: 5,
        anchorPrice: 50,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["SCENARIO_FOCUS_ENDPOINT"],
        futureSafe: true,
      },
    ]);
    const b = mergeAnchorCandidatesByStructuralIdentity([
      {
        anchorIndex: 5,
        anchorPrice: 50,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["SCENARIO_FOCUS_ENDPOINT"],
        futureSafe: true,
      },
      {
        anchorIndex: 5,
        anchorPrice: 50,
        anchorKind: "HIGH",
        sources: ["CONFIRMED_SWING"],
        futureSafe: true,
      },
    ]);
    assert.deepEqual(a, b);
    assert.equal(
      structuralAnchorIdentityKey(5, 50),
      structuralAnchorIdentityKey(5, 50.000000004)
    );
    assert.ok(structuralAnchorPricesEqual(50, 50.000000004));
  });
});
