import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MSL_14_V1_EVALUATION_INDICES,
  MSL_14_V1_OBSERVATION_HORIZON_BARS,
} from "../msl-historical-evidence/msl-historical-research-audit-grid";
import { runMsl14HistoricalResearchAudit } from "../msl-historical-evidence/msl-historical-research-audit-run";
import { assertNoForbiddenMslHistoricalResearchPipelineKeys } from "../msl-historical-evidence/msl-historical-research-pipeline-forbidden";
import { resolveAvailableHistoricalResearchDatasets } from "../msl-historical-evidence/msl-historical-research-pipeline-dataset";
import { BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM } from "../historical-frozen-ohlcv-dataset-types";

describe("MSL-14 complete measurement integration", () => {
  it("locked v1 E and H grids", () => {
    assert.deepEqual([...MSL_14_V1_EVALUATION_INDICES], [
      150, 450, 750, 1050, 1350, 1650, 1950, 2250, 2550, 2850,
    ]);
    assert.deepEqual([...MSL_14_V1_OBSERVATION_HORIZON_BARS], [4, 8, 12, 24, 48]);
  });

  it("multisymbol discovery from manifest", () => {
    const { datasets } = resolveAvailableHistoricalResearchDatasets({});
    assert.ok(datasets.length >= 1);
    const btc = datasets.find((d) => d.symbol === "BTCUSDT");
    assert.ok(btc);
    assert.equal(btc!.datasetChecksum, BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM);
  });

  it("deterministic serialized exports (no evidence NDJSON)", () => {
    const outA = join(process.cwd(), "validation-output/msl-14-determinism-a");
    const outB = join(process.cwd(), "validation-output/msl-14-determinism-b");
    const opts = {
      evaluationIndices: [450, 750],
      observationHorizonBars: [8, 24],
      exportEvidenceNdjson: false,
      symbols: ["BTCUSDT", "ETHUSDT"] as const,
    };
    runMsl14HistoricalResearchAudit({ ...opts, outputDir: outA });
    runMsl14HistoricalResearchAudit({ ...opts, outputDir: outB });
    const auditA = readFileSync(join(outA, "msl-14-measurement-audit-report-v1.json"), "utf8");
    const auditB = readFileSync(join(outB, "msl-14-measurement-audit-report-v1.json"), "utf8");
    assert.equal(auditA, auditB);
    assert.doesNotThrow(() =>
      assertNoForbiddenMslHistoricalResearchPipelineKeys(JSON.parse(auditA))
    );
  });

  it("ALL_SYMBOLS aggregate when multisymbol", () => {
    const { batchReport } = runMsl14HistoricalResearchAudit({
      evaluationIndices: [450],
      observationHorizonBars: [12],
      exportEvidenceNdjson: false,
      symbols: ["BTCUSDT", "ETHUSDT"],
      outputDir: join(process.cwd(), "validation-output/msl-14-multisymbol-mini"),
    });
    const { datasets } = resolveAvailableHistoricalResearchDatasets({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });
    if (datasets.length < 2) {
      return;
    }
    assert.ok(batchReport.crossSymbolAggregate);
    assert.equal(batchReport.crossSymbolAggregate!.aggregateLabel, "ALL_SYMBOLS");
    assert.ok(
      batchReport.crossSymbolAggregate!.limitations.some((l) => l.includes("not_independent"))
    );
  });
});
