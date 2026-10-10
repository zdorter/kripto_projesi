import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src/browser");

function readModule(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

describe("DT — market structure research UI (MSL-11)", () => {
  it("app uses 9F only; page/presenter no MSL builders or production imports", () => {
    const app = readModule("market-structure-ui-app.ts");
    const presenter = readModule("market-structure-ui-presenter.ts");
    const page = readModule("market-structure-ui-page.ts");

    assert.ok(app.includes("buildMarketStructureDescriptiveConfluenceSurfaceWithChartSource"));
    assert.ok(app.includes("buildMarketStructureChartOverlayProjection"));
    assert.ok(!app.includes("detectSwings"));
    assert.ok(!app.includes("runProductionWaveScanner"));
    assert.ok(!app.includes("trade-evaluation"));

    for (const mod of [presenter, page]) {
      assert.ok(!mod.includes("buildMarketStructureBreakContext"));
      assert.ok(!mod.includes("buildMarketStructureLiquidityContext"));
      assert.ok(!mod.includes("buildMarketStructureLiquidityInteractionContext"));
      assert.ok(!mod.includes("buildMarketStructureMssContext"));
      assert.ok(!mod.includes("buildMarketStructureMtfStructureAlignmentContext"));
      assert.ok(!mod.includes("buildMarketStructureMtfLiquidityAlignmentContext"));
      assert.ok(!mod.includes("buildMarketStructureMtfEventOrderingContext"));
      assert.ok(
        !mod.includes("buildMarketStructureHtfLiquidityLtfStructureAssociationContext")
      );
      assert.ok(!mod.includes("buildMarketStructureMtfMssAssociationContext"));
      assert.ok(!mod.includes("detectSwings"));
      assert.ok(!mod.includes("production-wave-scanner"));
      assert.ok(!mod.includes("trade-evaluation"));
    }

    assert.ok(!page.includes("createChart"));
    assert.ok(!page.includes("<canvas"));
    assert.ok(!presenter.includes("buildMarketStructureDescriptiveConfluenceSurfaceContext"));
  });
});
