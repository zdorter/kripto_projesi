/**
 * MSL-15 read-only artifact analysis (no MSL semantics, no network).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "validation-output/msl-14-research-audit-v1");
const OUT = join(process.cwd(), "validation-output/msl-15-research-findings-v1");
mkdirSync(OUT, { recursive: true });

const audit = JSON.parse(readFileSync(join(ROOT, "msl-14-measurement-audit-report-v1.json"), "utf8"));
const cohortReport = JSON.parse(readFileSync(join(ROOT, "msl-13-cohort-analytics-report-v1.json"), "utf8"));
const batch = JSON.parse(readFileSync(join(ROOT, "msl-13-batch-research-report-v1.json"), "utf8"));

const HORIZONS = [4, 8, 12, 24, 48];
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"];

function weightedRollup(rows, pickStats) {
  let w = 0;
  let meanAcc = 0;
  let min = null;
  let max = null;
  let p25Acc = 0;
  let p50Acc = 0;
  let p75Acc = 0;
  for (const r of rows) {
    const s = pickStats(r);
    if (!s || s.count === 0 || s.mean === null) continue;
    const c = r.sampleCount;
    w += c;
    meanAcc += s.mean * c;
    if (s.min !== null) min = min === null ? s.min : Math.min(min, s.min);
    if (s.max !== null) max = max === null ? s.max : Math.max(max, s.max);
    if (s.p25 !== null) p25Acc += s.p25 * c;
    if (s.p50 !== null) p50Acc += s.p50 * c;
    if (s.p75 !== null) p75Acc += s.p75 * c;
  }
  if (w === 0) return null;
  return {
    sampleCount: w,
    mean: meanAcc / w,
    median: p50Acc / w,
    p25: p25Acc / w,
    p50: p50Acc / w,
    p75: p75Acc / w,
    min,
    max,
    note: "Cohort-level weighted rollup; not a pooled empirical distribution across all evidence rows.",
  };
}

const cohorts = cohortReport.cohorts.filter(
  (c) => c.cohortDefinition.sampleStatus === "SUFFICIENT_HORIZON"
);

const forwardByHorizon = {};
const mfeByHorizon = {};
const maeByHorizon = {};
const rangeByHorizon = {};
for (const H of HORIZONS) {
  const rows = cohorts.filter((c) => c.cohortDefinition.observationHorizonBars === H);
  forwardByHorizon[H] = weightedRollup(rows, (r) => r.forwardReturnStats);
  mfeByHorizon[H] = weightedRollup(rows, (r) => r.mfeStats);
  maeByHorizon[H] = weightedRollup(rows, (r) => r.maeStats);
  rangeByHorizon[H] = weightedRollup(rows, (r) => r.rangeExpansionStats);
}

const forwardBySymbolHorizon = {};
const mfeBySymbolHorizon = {};
const eventCountBySymbol = {};
for (const sym of SYMBOLS) {
  eventCountBySymbol[sym] = {};
  forwardBySymbolHorizon[sym] = {};
  mfeBySymbolHorizon[sym] = {};
  for (const H of HORIZONS) {
    const rows = cohorts.filter(
      (c) => c.cohortDefinition.symbol === sym && c.cohortDefinition.observationHorizonBars === H
    );
    forwardBySymbolHorizon[sym][H] = weightedRollup(rows, (r) => r.forwardReturnStats);
    mfeBySymbolHorizon[sym][H] = weightedRollup(rows, (r) => r.mfeStats);
  }
  for (const c of cohorts.filter((x) => x.cohortDefinition.symbol === sym)) {
    const fam = c.cohortDefinition.eventFamily;
    eventCountBySymbol[sym][fam] = (eventCountBySymbol[sym][fam] || 0) + c.eventCount;
  }
}

const eventFamilyTotals = { ...batch.evidenceSummary.eventFamilyCounts };
const cohortCountBySymbol = Object.fromEntries(
  SYMBOLS.map((s) => [
    s,
    cohortReport.cohorts.filter((c) => c.cohortDefinition.symbol === s).length,
  ])
);

function svgBarChart(title, series, valueKey, width = 720, height = 320) {
  const pad = { l: 56, r: 20, t: 40, b: 48 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const vals = series.map((d) => d[valueKey] ?? 0);
  const minV = Math.min(0, ...vals);
  const maxV = Math.max(...vals, 0.0001);
  const zeroY = pad.t + innerH * (maxV / (maxV - minV));
  const barW = innerW / series.length;
  const bars = series
    .map((d, i) => {
      const v = d[valueKey] ?? 0;
      const h = Math.abs(v) / (maxV - minV) * innerH;
      const x = pad.l + i * barW + barW * 0.15;
      const w = barW * 0.7;
      const y = v >= 0 ? zeroY - h : zeroY;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#4a90d9"/>`;
    })
    .join("");
  const labels = series
    .map((d, i) => {
      const x = pad.l + i * barW + barW / 2;
      return `<text x="${x}" y="${height - 12}" text-anchor="middle" font-size="12">H=${d.H}</text>`;
    })
    .join("");
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${pad.l}" y="24" font-size="14" font-weight="bold">${title}</text><line x1="${pad.l}" y1="${zeroY.toFixed(1)}" x2="${width - pad.r}" y2="${zeroY.toFixed(1)}" stroke="#333"/>${bars}${labels}</svg>`;
}

const horizonSeries = HORIZONS.map((H) => ({
  H,
  meanForward: forwardByHorizon[H]?.mean ?? null,
  meanMfe: mfeByHorizon[H]?.mean ?? null,
  meanMae: maeByHorizon[H]?.mean ?? null,
}));

writeFileSync(
  join(OUT, "chart-horizon-mean-forward-return.svg"),
  svgBarChart("Historical Descriptive Measurement — Mean forward return by horizon (cohort rollup)", horizonSeries, "meanForward"),
  "utf8"
);
writeFileSync(
  join(OUT, "chart-horizon-mean-mfe.svg"),
  svgBarChart("Historical Descriptive Measurement — Mean MFE by horizon (cohort rollup)", horizonSeries, "meanMfe"),
  "utf8"
);

const symFreq = SYMBOLS.map((s) => ({
  symbol: s,
  totalEvents: Object.values(eventCountBySymbol[s] || {}).reduce((a, b) => a + b, 0),
}));
const maxE = Math.max(...symFreq.map((x) => x.totalEvents));
const symBars = symFreq
  .map((d, i) => {
    const barW = 600 / symFreq.length;
    const x = 80 + i * barW + 8;
    const h = (d.totalEvents / maxE) * 200;
    return `<rect x="${x}" y="${240 - h}" width="${barW - 16}" height="${h}" fill="#6b8e23"/><text x="${x + (barW - 16) / 2}" y="260" text-anchor="middle" font-size="11">${d.symbol.replace("USDT", "")}</text>`;
  })
  .join("");
writeFileSync(
  join(OUT, "chart-symbol-event-frequency.svg"),
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="720" height="300"><text x="80" y="24" font-size="14" font-weight="bold">Historical Descriptive Measurement — Event count rollup by symbol (cohort eventCount sum)</text>${symBars}</svg>`,
  "utf8"
);

const out = {
  disclaimer: {
    descriptive: [
      "historical observation",
      "frequency",
      "distribution rollup",
      "co-occurrence",
      "time-to-event",
      "MFE/MAE",
      "forward return",
    ],
    notEstablished: [
      "causality",
      "prediction",
      "signal",
      "trading edge",
      "strategy",
      "entry/exit/SL/TP",
      "expectancy",
      "profitability",
      "statistical significance",
    ],
  },
  coverage: batch.coverage,
  skippedEvaluations: batch.evaluationConfig.skippedEvaluations,
  eventInventory: audit.eventInventory,
  eventFamilyTotals,
  forwardByHorizon,
  mfeByHorizon,
  maeByHorizon,
  rangeByHorizon,
  forwardBySymbolHorizon,
  mfeBySymbolHorizon,
  eventCountBySymbol,
  cohortCountBySymbol,
  horizonComparisonBatch: batch.horizonComparisons,
  coOccurrenceAudit: audit.coOccurrenceAudit,
  associationInventory: audit.associationInventory,
  overlap: batch.overlap,
  leakageAudit: audit.leakageAudit,
  futureSpikeAudit: audit.futureSpikeAudit,
  timeToEventAudit: audit.timeToEventAudit,
  measurementModeAudit: audit.measurementModeAudit,
  dataQualityAudit: audit.dataQualityAudit,
};

writeFileSync(join(OUT, "msl-15-analysis.json"), `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log("MSL-15 analysis written to", OUT);
