import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist/wave", { recursive: true });

await esbuild.build({
  entryPoints: {
    "wave-engine": "src/wave/index.ts",
    "demo-ohlcv": "src/browser/demo-ohlcv.ts",
    "wave-analysis-page": "src/browser/wave-analysis-page.ts",
    "wave-analysis-app": "src/browser/wave-analysis-app.ts",
    "wave-scanner-app": "src/browser/wave-scanner-app.ts",
    "wave-scanner-page": "src/browser/wave-scanner-page.ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outdir: "dist/wave",
  logLevel: "info",
});
