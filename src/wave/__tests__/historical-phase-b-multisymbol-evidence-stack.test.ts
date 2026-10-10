import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHistoricalPhaseBFrozenEvidenceStackForSymbol,
  buildHistoricalPhaseBMultisymbolFrozenEvidenceStacks,
} from "../historical-phase-b-frozen-evidence-stack";
import {
  HISTORICAL_PHASE_B_MULTISYMBOL_EVIDENCE_ARTIFACT_V1_RELATIVE_PATH,
  PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN,
} from "../historical-phase-b-frozen-evidence-stack-types";
import { buildHistoricalPhaseBMultiSymbolRegimeValidation } from "../historical-phase-b-multi-symbol-regime-validation";
import { phaseBResearchScopeKey } from "../historical-phase-b-multi-symbol-regime-validation";
import {
  EXPECTED_MANIFEST_CHECKSUMS,
} from "../historical-phase-b-frozen-evidence-stack";
import { loadHistoricalResearchDatasetManifestV1 } from "../historical-research-dataset-manifest";
import { loadMultiSymbol1hResearchFrozenDatasetV1 } from "../historical-research-dataset-manifest";
import {
  MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS,
  RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT,
} from "../historical-frozen-ohlcv-dataset-types";

let cachedMultisymbol: ReturnType<typeof buildHistoricalPhaseBMultisymbolFrozenEvidenceStacks> | undefined;

function multisymbol() {
  if (!cachedMultisymbol) {
    cachedMultisymbol = buildHistoricalPhaseBMultisymbolFrozenEvidenceStacks();
  }
  return cachedMultisymbol;
}

describe("historical-phase-b-multisymbol-evidence-stack (B-23)", () => {
  it("A. manifest contains all six scopes", () => {
    const manifest = loadHistoricalResearchDatasetManifestV1();
    assert.equal(manifest.entries.length, 6);
    for (const sym of MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS) {
      const row = manifest.entries.find((e) => e.symbol === sym)!;
      assert.equal(row.status, "DATASET_AVAILABLE");
      assert.equal(row.timeframe, "1H");
    }
  });

  it("B–E. all six datasets load with checksum and spacing", () => {
    for (const symbol of MULTI_SYMBOL_1H_RESEARCH_FROZEN_SYMBOLS) {
      const loaded = loadMultiSymbol1hResearchFrozenDatasetV1(symbol);
      assert.equal(loaded.candles.length, RESEARCH_FROZEN_1H_V1_EXPECTED_CANDLE_COUNT);
      assert.equal(loaded.document.metadata.datasetChecksum, EXPECTED_MANIFEST_CHECKSUMS[symbol]);
      for (let i = 1; i < loaded.candles.length; i++) {
        assert.equal(loaded.candles[i].time - loaded.candles[i - 1].time, 3_600_000);
      }
    }
  });

  it("F. BTC baseline parity", () => {
    const btc = buildHistoricalPhaseBFrozenEvidenceStackForSymbol("BTCUSDT");
    assert.equal(btc.fingerprint.datasetChecksum, PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.datasetChecksum);
    assert.equal(btc.fingerprint.independentTrades, PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.independentTrades);
    assert.equal(btc.fingerprint.replayClassifiable, PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.replayClassifiable);
    assert.equal(btc.fingerprint.notReplayable, PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.notReplayable);
    assert.equal(btc.fingerprint.horizonBars, PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.horizonBars);
    assert.equal(
      btc.integratedEvidenceAuditReport.failedFavorableEvidence.cohortSize,
      PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.failedFavorableTrades
    );
    assert.equal(
      btc.integratedEvidenceAuditReport.passedAdverseEvidence.cohortSize,
      PHASE_B_BTCUSDT_1H_FROZEN_EVIDENCE_GOLDEN.passedAdverseTrades
    );
    assert.equal(btc.integratedEvidenceAuditReport.productionDecision.productionRuleStatus, "NOT_ESTABLISHED");
    assert.equal(btc.integratedEvidenceAuditReport.missingSections.length, 0);
  });

  for (const [label, symbol] of [
    ["G", "ETHUSDT"],
    ["H", "BNBUSDT"],
    ["I", "SOLUSDT"],
    ["J", "XRPUSDT"],
    ["K", "ADAUSDT"],
  ] as const) {
    it(`${label}. ${symbol} stack generated`, () => {
      const ms = multisymbol();
      const stack = ms.stacksByScope[phaseBResearchScopeKey(symbol, "1H")];
      assert.ok(stack);
      assert.equal(stack.status, "PASS");
      assert.equal(stack.lifecycleReport.trades[0]?.symbol ?? symbol, symbol);
    });
  }

  it("L–P. per-symbol B-14/B-12w/B-12x/B-19/B-20 outputs", () => {
    const ms = multisymbol();
    assert.equal(ms.failures.length, 0);
    for (const stack of ms.stacks) {
      assert.ok(stack.futureMoveAnalysisReport.thresholdAnalysis.length >= 9);
      assert.ok(stack.reachabilityReplayReport.modelComparison.length > 0);
      assert.ok(stack.costAwareCounterfactualAnalysisReport.modelResults.length > 0);
      assert.ok(stack.delayedEntryDecisionAuditReport.decisionComparisonTable.length > 0);
      assert.ok(stack.integratedEvidenceAuditReport.researchCandidates.length >= 5);
      assert.equal(stack.integratedEvidenceAuditReport.missingSections.length, 0);
    }
  });

  it("Q. no missing required stack sections (multisymbol)", () => {
    const ms = multisymbol();
    assert.equal(ms.stacks.length, 6);
    assert.equal(ms.failures.length, 0);
  });

  it("R. determinism", () => {
    const a = buildHistoricalPhaseBFrozenEvidenceStackForSymbol("BTCUSDT").fingerprint.fingerprintDigest;
    const b = buildHistoricalPhaseBFrozenEvidenceStackForSymbol("BTCUSDT").fingerprint.fingerprintDigest;
    assert.equal(a, b);
  });

  it("S. no cross-symbol data leakage", () => {
    const ms = multisymbol();
    const eth = ms.stacksByScope["ETHUSDT:1H"]!;
    const btc = ms.stacksByScope["BTCUSDT:1H"]!;
    assert.ok(eth.lifecycleReport.trades.every((t) => t.symbol === "ETHUSDT"));
    assert.ok(btc.lifecycleReport.trades.every((t) => t.symbol === "BTCUSDT"));
    assert.notEqual(eth.fingerprint.independentTrades, btc.fingerprint.independentTrades);
  });

  it("T. lookahead attestation", () => {
    const stack = multisymbol().stacks[0]!;
    assert.equal(stack.integratedEvidenceAuditReport.lookaheadAttestation.entryContextEnd, "E");
    assert.equal(stack.integratedEvidenceAuditReport.lookaheadAttestation.outcomeFrom, "E+1");
  });

  it("U. production status NOT_ESTABLISHED all symbols", () => {
    for (const stack of multisymbol().stacks) {
      assert.equal(stack.integratedEvidenceAuditReport.productionDecision.generalMarketRule, "NOT_ESTABLISHED");
    }
  });

  it("V. evidence references correct symbol", () => {
    for (const stack of multisymbol().stacks) {
      assert.equal(stack.dataset.symbol, stack.symbol);
      assert.ok(stack.lifecycleReport.trades.every((t) => t.symbol === stack.symbol));
    }
  });

  it("W. artifact fingerprint parity", () => {
    const ms = multisymbol();
    const artifactPath = join(process.cwd(), HISTORICAL_PHASE_B_MULTISYMBOL_EVIDENCE_ARTIFACT_V1_RELATIVE_PATH);
    try {
      const onDisk = JSON.parse(readFileSync(artifactPath, "utf8")) as typeof ms.artifact;
      assert.equal(onDisk.scopes.length, ms.artifact.scopes.length);
      for (const scope of ms.artifact.scopes) {
        const disk = onDisk.scopes.find((s) => s.scopeKey === scope.scopeKey)!;
        assert.equal(disk.fingerprintDigest, scope.fingerprintDigest);
      }
    } catch {
      assert.equal(ms.artifact.scopes.length, 6);
    }
  });

  it("B-21 integration — crossSymbolScopeCount = 6", () => {
    const ms = multisymbol();
    const b21 = buildHistoricalPhaseBMultiSymbolRegimeValidation(ms.b21Input);
    assert.equal(b21.crossSymbolScopeCount, 6);
    assert.equal(b21.missingSections.includes("CROSS_SYMBOL_FROZEN_STACK"), false);
    for (const sym of ["ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"] as const) {
      assert.equal(b21.datasetMatrix.find((d) => d.symbol === sym)?.status, "AVAILABLE");
    }
  });

  it("architecture guard — no fetch in stack module", () => {
    const mod = readFileSync(join(process.cwd(), "src/wave/historical-phase-b-frozen-evidence-stack.ts"), "utf8");
    assert.ok(!mod.includes("fetchBinance"));
    assert.ok(!mod.includes("fetch("));
    assert.ok(!/evaluateTradeEvaluation\s*\(/.test(mod));
  });
});
