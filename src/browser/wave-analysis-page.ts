import type { WaveAnalysis, WaveCandidate } from "../wave/types";
import type {
  FocusView,
  WavePresentationState,
} from "../wave/presentation-state";
import type { WaveDiagnostics } from "../wave/wave-diagnostics";
import type {
  SwingCalibrationDetail,
  SwingCalibrationReport,
} from "../wave/swing-calibration";
import type { WaveStabilityReport } from "../wave/wave-stability";
import type {
  FocusContextView,
  MultiTimeframeWaveState,
} from "../wave/multi-timeframe";
import type { WaveHierarchyReport } from "../wave/wave-hierarchy";
import type { MarketStructure } from "../wave/types";

export interface WaveAnalysisRenderMeta {
  dataSource: "DEMO" | "BINANCE_FUTURES_REST";
  symbol?: string;
  timeframe?: string;
  candleCount?: number;
}

function formatPrice(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
}

function formatTime(ms: number): string {
  if (!ms) {
    return "—";
  }
  return new Date(ms).toISOString();
}

function renderWaveDiagnostics(diagnostics: WaveDiagnostics): void {
  const swingsEl = document.getElementById("diag-swings");
  const structureEl = document.getElementById("diag-structure");
  const trendSourceEl = document.getElementById("diag-trend-source");
  const legsEl = document.getElementById("diag-wave-legs");
  const fibEl = document.getElementById("diag-fibonacci");
  const focusEl = document.getElementById("diag-focus");
  const overlapEl = document.getElementById("diag-overlaps");
  const jsonEl = document.getElementById("diagnostic-json");

  if (
    !swingsEl ||
    !structureEl ||
    !trendSourceEl ||
    !legsEl ||
    !fibEl ||
    !focusEl ||
    !overlapEl ||
    !jsonEl
  ) {
    throw new Error("wave-analysis.html: missing diagnostic DOM elements");
  }

  swingsEl.innerHTML = diagnostics.confirmedSwings
    .map(
      (s) =>
        `<li>idx ${s.index} · ${s.type} · ${formatPrice(s.price)} · ${formatTime(s.time)} · strength ${s.strength}</li>`
    )
    .join("");

  structureEl.innerHTML = diagnostics.structurePairs
    .map(
      (p) =>
        `<li>${p.kind}: idx ${p.fromIndex}→${p.toIndex} · ${formatPrice(p.fromPrice)}→${formatPrice(p.toPrice)} · <strong>${p.structure}</strong></li>`
    )
    .join("");

  trendSourceEl.textContent = diagnostics.trendSource.trendRuleSummary;

  legsEl.innerHTML = diagnostics.waveLegs
    .map(
      (w) =>
        `<li>${w.structure} ${w.scenario} Wave ${w.label} · ${w.status} · conf ${w.confidence} · idx ${w.startIndex}→${w.endIndex} · ${formatPrice(w.startPrice)}→${formatPrice(w.endPrice)} · ${formatTime(w.startTime)}→${formatTime(w.endTime)}</li>`
    )
    .join("");

  if (diagnostics.fibonacci.available) {
    const f = diagnostics.fibonacci;
    fibEl.innerHTML = [
      `<div>Impulse bullish: <strong>${f.impulseBullish}</strong></div>`,
      `<div>Wave 1 range: ${formatPrice(f.rangeStart)} → ${formatPrice(f.rangeEnd)} (idx ${f.wave1StartIndex}→${f.wave1EndIndex})</div>`,
      `<div>Wave 2 retrace actual: ${formatPrice(f.actualRetracePrice)} (idx ${f.wave2EndIndex})</div>`,
      f.nearestMatch
        ? `<div>Nearest fib: ${f.nearestMatch.kind} level ${f.nearestMatch.level} (distanceRatio ${f.nearestMatch.distanceRatio.toFixed(4)})</div>`
        : `<div>No nearest fib match within tolerance</div>`,
      `<div>Conformance component score: ${(f.conformanceScore ?? 0).toFixed(3)}</div>`,
      `<div class="panel-muted">${f.note ?? ""}</div>`,
    ].join("");
  } else {
    fibEl.textContent = diagnostics.fibonacci.note ?? "Fibonacci diagnostic unavailable.";
  }

  const lines: string[] = [];
  if (diagnostics.focus.primary) {
    const p = diagnostics.focus.primary;
    lines.push(
      `<p><strong>PRIMARY</strong> ${p.structure} Wave ${p.wave} · ${p.status} · ${p.confidence}/100</p>`,
      `<p>idx ${p.startIndex}→${p.endIndex} · ${formatPrice(p.startPrice)}→${formatPrice(p.endPrice)}</p>`,
      `<p>${formatTime(p.startTime)} → ${formatTime(p.endTime)}</p>`
    );
  }
  if (diagnostics.focus.alternative) {
    const a = diagnostics.focus.alternative;
    lines.push(
      `<p><strong>ALTERNATIVE</strong> ${a.structure} Wave ${a.wave} · ${a.status} · ${a.confidence}/100</p>`,
      `<p>idx ${a.startIndex}→${a.endIndex} · ${formatPrice(a.startPrice)}→${formatPrice(a.endPrice)}</p>`,
      `<p>${formatTime(a.startTime)} → ${formatTime(a.endTime)}</p>`
    );
  }
  focusEl.innerHTML = lines.join("") || "—";

  if (diagnostics.overlaps.length === 0) {
    overlapEl.textContent = "None.";
  } else {
    overlapEl.innerHTML = diagnostics.overlaps
      .map(
        (o) =>
          `<div class="overlap-item"><strong>${o.summary}</strong> [${o.startIndex}–${o.endIndex}]<br />${formatPrice(o.startPrice)} → ${formatPrice(o.endPrice)} · ${formatTime(o.startTime)} → ${formatTime(o.endTime)}</div>`
      )
      .join("");
  }

  jsonEl.textContent = JSON.stringify(diagnostics, null, 2);
}

function formatWaveRow(w: WaveCandidate): string {
  const parts = [
    `Wave ${w.label}`,
    w.status,
    `conf ${w.confidence}`,
    `[${w.startIndex}–${w.endIndex}]`,
  ];
  if (w.invalidationPrice !== undefined) {
    parts.push(`inv ${formatPrice(w.invalidationPrice)}`);
  }
  if (w.structureConflict) {
    parts.push("structure conflict");
  }
  return parts.join(" · ");
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`wave-analysis.html: missing #${id}`);
  }
  el.textContent = text;
}

function renderFocus(panelPrefix: string, focus: FocusView | null): void {
  if (!focus) {
    return;
  }
  setText(`${panelPrefix}-structure`, focus.structure);
  setText(`${panelPrefix}-wave`, focus.wave);
  setText(`${panelPrefix}-status`, focus.status);
  setText(`${panelPrefix}-confidence`, `${focus.confidence}/100`);
}

function formatInvalidation(presentation: WavePresentationState): string {
  const primary = presentation.primary;
  if (!primary) {
    return "No primary focus.";
  }

  const track =
    primary.structure === "IMPULSE"
      ? presentation.tracks.selectedImpulse
      : presentation.tracks.corrective;

  const scoped = track?.invalidation;
  if (scoped) {
    return [
      formatPrice(scoped.price),
      `(${scoped.structure} · ${scoped.scenario} · Wave ${scoped.wave} · ${scoped.reason})`,
    ].join(" ");
  }

  if (primary.invalidationPrice !== undefined) {
    return `${formatPrice(primary.invalidationPrice)} (primary focus leg)`;
  }

  return "None for primary structure track.";
}

function overlapTitle(legs: { structure: string; label: string }[]): string {
  const impulse = legs.find((l) => l.structure === "IMPULSE");
  const corr = legs.find((l) => l.structure === "CORRECTIVE");
  if (impulse && corr) {
    return `Wave ${impulse.label} ↔ Wave ${corr.label}`;
  }
  return legs.map((l) => `${l.structure} ${l.label}`).join(" ↔ ");
}

function structureCountSummary(labels: MarketStructure[]): string {
  const counts: Record<string, number> = { HH: 0, HL: 0, LH: 0, LL: 0 };
  for (const s of labels) {
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return `HH ${counts.HH} · HL ${counts.HL} · LH ${counts.LH} · LL ${counts.LL}`;
}

function renderCalibrationSwingChart(
  report: SwingCalibrationReport,
  container: HTMLElement
): void {
  const width = 720;
  const rowHeight = 28;
  const pad = 8;
  const height = report.presets.length * rowHeight + pad * 2;
  const n = Math.max(report.candleCount - 1, 1);

  const rows = report.presets
    .map((preset, row) => {
      const detail = report.detailsByConfigId[preset.id];
      const y = pad + row * rowHeight + rowHeight / 2;
      const dots = detail.diagnostics.confirmedSwings
        .map((s) => {
          const x = pad + (s.index / n) * (width - pad * 2);
          const fill = s.type === "HIGH" ? "#5b9cf5" : "#e8b84a";
          return `<circle cx="${x.toFixed(1)}" cy="${y}" r="3" fill="${fill}" opacity="0.85"><title>${preset.label} idx ${s.index} ${s.type} ${s.price}</title></circle>`;
        })
        .join("");
      return `<text x="4" y="${y + 4}" fill="#8b98a8" font-size="11">${preset.label}</text>${dots}`;
    })
    .join("");

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px;background:#1a222d;border-radius:8px;border:1px solid #2a3544">
    <text x="${width - 120}" y="12" fill="#8b98a8" font-size="10">HIGH ● / LOW ●</text>
    ${rows}
  </svg>
  <p class="panel-muted">Same candle index axis per row. Not a price chart — swing index positions only.</p>`;
}

function renderCalibrationDetail(detail: SwingCalibrationDetail): string {
  const swings = detail.lastTenConfirmedSwings
    .map(
      (s) =>
        `<li>idx ${s.index} · ${s.type} · ${formatPrice(s.price)}</li>`
    )
    .join("");
  const impulse = detail.impulseWaves
    .map((w) => `<li>Wave ${w.label} · ${w.status} · conf ${w.confidence}</li>`)
    .join("") || "<li>—</li>";
  const corrective = detail.correctiveWaves
    .map((w) => `<li>Wave ${w.label} · ${w.status} · conf ${w.confidence}</li>`)
    .join("") || "<li>—</li>";
  const fib = detail.fibonacci;
  const fibBlock = fib.available
    ? `<div>Fib: nearest ${fib.nearestMatch?.level ?? "—"} · score ${(fib.conformanceScore ?? 0).toFixed(3)}</div>`
    : `<div>Fib: ${fib.note ?? "unavailable"}</div>`;
  const lead = detail.leadingWave
    ? `Wave ${detail.leadingWave.label} · idx ${detail.leadingWave.startIndex}→${detail.leadingWave.endIndex} · ${formatPrice(detail.leadingWave.startPrice)}→${formatPrice(detail.leadingWave.endPrice)}`
    : "—";

  return `
    <div class="calibration-detail panel">
      <div class="row">Structure pairs: <strong>${structureCountSummary(detail.structureLabels)}</strong></div>
      <div class="row">Trend: <strong>${detail.marketTrend}</strong></div>
      <div class="row">Primary: <strong>${detail.primaryDisplay}</strong> · Alternative: <strong>${detail.alternativeDisplay}</strong></div>
      <div class="row">Rule conformance: <strong>${detail.ruleConformanceScore}/100</strong> · Overlaps: <strong>${detail.overlapCount}</strong></div>
      ${fibBlock}
      <div class="row">Leading (primary focus leg): <strong>${lead}</strong></div>
      <p class="panel-muted">Last 10 confirmed swings</p>
      <ul>${swings}</ul>
      <p class="panel-muted">Impulse candidates</p>
      <ul>${impulse}</ul>
      <p class="panel-muted">Corrective candidates</p>
      <ul>${corrective}</ul>
    </div>`;
}

let selectedCalibrationId: string | null = null;
let selectedStabilityWave: string | null = null;

function formatOverlap(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
}

function renderStabilityWaveDetail(
  report: WaveStabilityReport,
  waveLabel: string
): string {
  const row = report.waves.find((w) => w.wave === waveLabel);
  if (!row) {
    return "";
  }
  const matrixHeader = report.configs
    .map((c) => `<th>${c.label}</th>`)
    .join("");
  const matrixCells = report.configs
    .map((c) => {
      const on = row.matrix[c.id];
      return `<td>${on ? "✓" : "—"}</td>`;
    })
    .join("");

  const configBlocks = row.snapshots
    .map((s) => {
      if (!s.present) {
        return `<div class="row"><strong>${s.configLabel}</strong>: <span class="panel-muted">not present</span></div>`;
      }
      return `<div class="stability-config-block">
        <div class="row"><strong>${s.configLabel}</strong></div>
        <div class="row">status ${s.status} · confidence ${s.confidence} · length ${s.segmentLength}</div>
        <div class="row">idx ${s.startIndex}→${s.endIndex} · ${formatPrice(s.startPrice)}→${formatPrice(s.endPrice)}</div>
      </div>`;
    })
    .join("");

  const pairs = report.pairwise
    .filter((p) => p.wave === waveLabel)
    .map(
      (p) =>
        `<li>${p.configALabel} ↔ ${p.configBLabel}: index ${formatOverlap(p.indexOverlapRatio)}, price ${formatOverlap(p.priceOverlapRatio)}</li>`
    )
    .join("");

  return `
    <div class="calibration-detail panel">
      <div class="row">Presence: <strong>${row.summary.presenceCount}/${report.configs.length}</strong> (${row.summary.presenceRatio.toFixed(2)})</div>
      <div class="row">Configs: <strong>${row.summary.configsPresent.join(", ") || "—"}</strong></div>
      <table class="calibration-table" style="margin-top:0.5rem">
        <thead><tr><th>Wave</th>${matrixHeader}</tr></thead>
        <tbody><tr><td>${waveLabel}</td>${matrixCells}</tr></tbody>
      </table>
      ${configBlocks}
      <p class="panel-muted">Pairwise segment overlap (Jaccard)</p>
      <ul>${pairs || "<li>—</li>"}</ul>
    </div>`;
}

export function renderWaveStability(report: WaveStabilityReport): void {
  const summaryBody = document.getElementById("stability-summary-body");
  const matrixHead = document.getElementById("stability-matrix-head");
  const matrixBody = document.getElementById("stability-matrix-body");
  const detailHost = document.getElementById("stability-detail");
  const jsonEl = document.getElementById("stability-json");

  if (!summaryBody || !matrixHead || !matrixBody || !detailHost || !jsonEl) {
    throw new Error("wave-analysis.html: missing wave stability DOM elements");
  }

  matrixHead.innerHTML = `<tr><th>Wave</th>${report.configs
    .map((c) => `<th>${c.label}</th>`)
    .join("")}</tr>`;

  matrixBody.innerHTML = report.persistenceMatrix
    .map((row) => {
      const cells = report.configs
        .map((c) => `<td>${row.byConfigId[c.id] ? "✓" : "—"}</td>`)
        .join("");
      return `<tr><td>${row.wave}</td>${cells}</tr>`;
    })
    .join("");

  const visible = report.summary.filter((s) => s.presenceCount > 0);
  summaryBody.innerHTML = visible
    .map((s) => {
      const selected = selectedStabilityWave === s.wave ? " selected" : "";
      return `<tr class="stability-row${selected}" data-wave="${s.wave}" tabindex="0">
        <td>Wave ${s.wave}</td>
        <td>${s.presenceCount}/${report.configs.length}</td>
        <td>${s.configsPresent.join(", ")}</td>
        <td>${formatOverlap(s.meanIndexOverlap)}</td>
        <td>${formatOverlap(s.meanPriceOverlap)}</td>
      </tr>`;
    })
    .join("");

  const bindRow = (tr: Element) => {
    tr.addEventListener("click", () => {
      const wave = tr.getAttribute("data-wave");
      if (!wave) {
        return;
      }
      selectedStabilityWave = wave;
      detailHost.innerHTML = renderStabilityWaveDetail(report, wave);
      summaryBody.querySelectorAll(".stability-row").forEach((r) => {
        r.classList.toggle("selected", r.getAttribute("data-wave") === wave);
      });
    });
  };
  summaryBody.querySelectorAll(".stability-row").forEach(bindRow);

  if (!selectedStabilityWave && visible[0]) {
    selectedStabilityWave = visible[0].wave;
    detailHost.innerHTML = renderStabilityWaveDetail(
      report,
      selectedStabilityWave
    );
    summaryBody.querySelector(".stability-row")?.classList.add("selected");
  } else if (
    selectedStabilityWave &&
    visible.some((s) => s.wave === selectedStabilityWave)
  ) {
    detailHost.innerHTML = renderStabilityWaveDetail(
      report,
      selectedStabilityWave
    );
  } else {
    detailHost.innerHTML = "";
    selectedStabilityWave = null;
  }

  jsonEl.textContent = JSON.stringify(report, null, 2);
}

function formatFocusBlock(title: string, focus: FocusContextView): string {
  if (!focus.wave) {
    return `<div class="panel"><span class="panel-title">${title}</span><p>—</p></div>`;
  }
  const range =
    focus.priceRangeLow !== null && focus.priceRangeHigh !== null
      ? `${formatPrice(focus.priceRangeLow)} – ${formatPrice(focus.priceRangeHigh)}`
      : "—";
  return `<div class="panel">
    <span class="panel-title">${title}</span>
    <div class="row">${focus.structure} · Wave <strong>${focus.wave}</strong></div>
    <div class="row">Status <strong>${focus.status}</strong> · Confidence <strong>${focus.confidence}</strong></div>
    <div class="row">Index <strong>${focus.startIndex}→${focus.endIndex}</strong></div>
    <div class="row">Price <strong>${formatPrice(focus.startPrice)}→${formatPrice(focus.endPrice)}</strong></div>
    <div class="row">Segment range (OHLC envelope) <strong>${range}</strong></div>
    <div class="row panel-muted">${formatTime(focus.startTime ?? 0)} → ${formatTime(focus.endTime ?? 0)}</div>
  </div>`;
}

export function renderMultiTimeframe(state: MultiTimeframeWaveState): void {
  const root = document.getElementById("mtf-root");
  const relationshipEl = document.getElementById("mtf-relationship");
  const notesEl = document.getElementById("mtf-notes");
  const timelineEl = document.getElementById("mtf-timeline");
  const jsonEl = document.getElementById("multi-timeframe-json");

  if (!root || !relationshipEl || !notesEl || !timelineEl || !jsonEl) {
    throw new Error("wave-analysis.html: missing multi-timeframe DOM elements");
  }

  const higher = state.higherTimeframe;
  const lower = state.lowerTimeframe;

  root.innerHTML = `
    <div class="grid">
      <div>
        <h3 style="font-size:0.95rem;color:var(--accent);margin:0 0 0.5rem">Higher timeframe · ${higher.timeframeId}</h3>
        <div class="card"><label>Trend</label><div class="value">${state.trendAlignment.higherTrend}</div></div>
        <p class="panel-muted">${higher.candleCount} closed candles</p>
        ${formatFocusBlock("Primary", higher.primaryFocus)}
        ${formatFocusBlock("Alternative", higher.alternativeFocus)}
      </div>
      <div>
        <h3 style="font-size:0.95rem;color:var(--accent);margin:0 0 0.5rem">Lower timeframe · ${lower.timeframeId}</h3>
        <div class="card"><label>Trend</label><div class="value">${state.trendAlignment.lowerTrend}</div></div>
        <p class="panel-muted">${lower.candleCount} closed candles</p>
        ${formatFocusBlock("Primary", lower.primaryFocus)}
        ${formatFocusBlock("Alternative", lower.alternativeFocus)}
      </div>
    </div>`;

  relationshipEl.innerHTML = `
    <div class="row">Kind <strong>${state.relationship.kind}</strong></div>
    <div class="row">Trend comparison <strong>${state.trendAlignment.comparison}</strong></div>
    <p class="panel-muted">${state.relationship.summary}</p>`;

  notesEl.innerHTML = state.notes.map((n) => `<li>${n}</li>`).join("");

  const overlap = state.timeAlignment.overlap;
  timelineEl.innerHTML = `
    <div class="row">1H window: ${formatTime(state.timeAlignment.higher.startTime)} → ${formatTime(state.timeAlignment.higher.endTime)}</div>
    <div class="row">15M window: ${formatTime(state.timeAlignment.lower.startTime)} → ${formatTime(state.timeAlignment.lower.endTime)}</div>
    <div class="row">Overlap: ${
      overlap
        ? `${formatTime(overlap.startTime)} → ${formatTime(overlap.endTime)} (${state.timeAlignment.overlapDurationMs} ms)`
        : "none"
    }</div>`;

  jsonEl.textContent = JSON.stringify(state, null, 2);
}

function formatHierarchyWave(seg: {
  structure: string;
  label: string;
  invalidated?: boolean;
}): string {
  const inv = seg.invalidated ? " · invalidated" : "";
  return `${seg.structure} ${seg.label}${inv}`;
}

export function renderWaveHierarchy(report: WaveHierarchyReport): void {
  const primaryEl = document.getElementById("hierarchy-primary");
  const highlightBody = document.getElementById("hierarchy-highlight-body");
  const tableBody = document.getElementById("hierarchy-table-body");
  const jsonEl = document.getElementById("hierarchy-json");

  if (!primaryEl || !highlightBody || !tableBody || !jsonEl) {
    throw new Error("wave-analysis.html: missing wave hierarchy DOM elements");
  }

  const pp = report.primaryPair;
  if (pp) {
    primaryEl.innerHTML = `
      <div class="row">${report.higherTimeframe} → ${report.lowerTimeframe}</div>
      <div class="row">Trend context: <strong>${report.trendContext.higherTrend}</strong> (higher) · <strong>${report.trendContext.lowerTrend}</strong> (lower)</div>
      <div class="panel" style="margin-top:0.5rem">
        <div class="row">Primary (higher): <strong>${formatHierarchyWave(pp.higherWave)}</strong></div>
        <div class="row" style="text-align:center;color:var(--muted)">↓</div>
        <div class="row">Primary (lower): <strong>${formatHierarchyWave(pp.lowerWave)}</strong></div>
        <div class="row">Relationship: <strong>${pp.relationship}</strong></div>
        <p class="panel-muted">${pp.reason}</p>
      </div>`;
  } else {
    primaryEl.innerHTML = "<p>—</p>";
  }

  const rowHtml = (c: WaveHierarchyReport["candidates"][number], highlight: boolean) => {
    const cls = highlight ? ' class="hierarchy-highlight-row"' : "";
    return `<tr${cls}>
      <td>${formatHierarchyWave(c.higherWave)}</td>
      <td>${formatHierarchyWave(c.lowerWave)}</td>
      <td>${c.timeRelation.replace("TIME_", "")}</td>
      <td>${c.priceRelation.replace("PRICE_", "")}</td>
      <td>${c.relationship}</td>
    </tr>`;
  };

  highlightBody.innerHTML = report.highlightedCandidates
    .map((c) => rowHtml(c, true))
    .join("") || "<tr><td colspan=\"5\">None in this run.</td></tr>";

  tableBody.innerHTML = report.candidates.map((c) => rowHtml(c, false)).join("");

  jsonEl.textContent = JSON.stringify(report, null, 2);
}

export function renderSwingCalibration(report: SwingCalibrationReport): void {
  const tableBody = document.getElementById("calibration-table-body");
  const detailHost = document.getElementById("calibration-detail");
  const chartHost = document.getElementById("calibration-swing-chart");
  const jsonEl = document.getElementById("calibration-json");

  if (!tableBody || !detailHost || !chartHost || !jsonEl) {
    throw new Error("wave-analysis.html: missing swing calibration DOM elements");
  }

  tableBody.innerHTML = report.summaries
    .map((row) => {
      const selected = selectedCalibrationId === row.configId ? " selected" : "";
      return `<tr class="calibration-row${selected}" data-config-id="${row.configId}" tabindex="0">
        <td>${row.configLabel}</td>
        <td>${row.confirmedSwingCount}</td>
        <td>${row.marketTrend}</td>
        <td>${row.primaryDisplay}</td>
        <td>${row.alternativeDisplay}</td>
        <td>${row.ruleConformanceScore}</td>
        <td>${row.overlapCount}</td>
      </tr>`;
    })
    .join("");

  const bindRow = (tr: Element) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-config-id");
      if (!id) {
        return;
      }
      selectedCalibrationId = id;
      const detail = report.detailsByConfigId[id];
      detailHost.innerHTML = renderCalibrationDetail(detail);
      tableBody.querySelectorAll(".calibration-row").forEach((r) => {
        r.classList.toggle("selected", r.getAttribute("data-config-id") === id);
      });
    });
  };
  tableBody.querySelectorAll(".calibration-row").forEach(bindRow);

  if (!selectedCalibrationId && report.summaries[0]) {
    selectedCalibrationId = report.summaries[0].configId;
    detailHost.innerHTML = renderCalibrationDetail(
      report.detailsByConfigId[selectedCalibrationId]
    );
    const firstRow = tableBody.querySelector(".calibration-row");
    firstRow?.classList.add("selected");
  } else if (selectedCalibrationId && report.detailsByConfigId[selectedCalibrationId]) {
    detailHost.innerHTML = renderCalibrationDetail(
      report.detailsByConfigId[selectedCalibrationId]
    );
  }

  renderCalibrationSwingChart(report, chartHost);
  jsonEl.textContent = JSON.stringify(report, null, 2);
}

export function renderWaveAnalysis(
  analysis: WaveAnalysis,
  presentation: WavePresentationState,
  meta?: WaveAnalysisRenderMeta,
  diagnostics?: WaveDiagnostics
): void {
  const jsonEl = document.getElementById("analysis-json");
  const wavesEl = document.getElementById("detected-waves");
  const altPanel = document.getElementById("alternative-panel");
  const overlapsSection = document.getElementById("overlaps-section");
  const overlapsList = document.getElementById("overlaps-list");
  const rivalSection = document.getElementById("rival-section");
  const rivalPanel = document.getElementById("rival-panel");

  if (
    !jsonEl ||
    !wavesEl ||
    !altPanel ||
    !overlapsSection ||
    !overlapsList ||
    !rivalSection ||
    !rivalPanel
  ) {
    throw new Error("wave-analysis.html: missing required DOM elements");
  }

  setText(
    "score-disclaimer",
    "Rule conformance score — not trading probability."
  );
  setText("market-trend", presentation.marketTrend);
  setText(
    "rule-conformance",
    `${presentation.ruleConformanceScore}/100`
  );

  if (presentation.primary) {
    renderFocus("primary", presentation.primary);
    const reasonEl = document.getElementById("primary-reason");
    if (reasonEl) {
      reasonEl.textContent = presentation.primary.selectionReason;
    }
  } else {
    setText("primary-structure", "—");
    setText("primary-wave", "—");
    setText("primary-status", "—");
    setText("primary-confidence", "—");
    const reasonEl = document.getElementById("primary-reason");
    if (reasonEl) {
      reasonEl.textContent = "";
    }
  }

  if (presentation.alternative) {
    altPanel.classList.remove("hidden");
    renderFocus("alternative", presentation.alternative);
  } else {
    altPanel.classList.add("hidden");
  }

  setText("trend-alignment", presentation.trendContext.alignment);
  const noteEl = document.getElementById("trend-note");
  if (noteEl) {
    noteEl.textContent = presentation.trendContext.note ?? "";
  }

  setText("invalidation-content", formatInvalidation(presentation));

  if (presentation.overlaps.length > 0) {
    overlapsSection.classList.remove("hidden");
    overlapsList.innerHTML = presentation.overlaps
      .map((o) => {
        const title = overlapTitle(o.legs);
        const detail = o.legs
          .map(
            (l) =>
              `${l.structure} Wave ${l.label} (${l.status})`
          )
          .join(" · ");
        return `<div class="overlap-item">
          <div><strong>${title}</strong> [${o.startIndex}–${o.endIndex}]</div>
          <div>${detail}</div>
          <p class="hint">Same price movement, two counting interpretations.</p>
        </div>`;
      })
      .join("");
  } else {
    overlapsSection.classList.add("hidden");
    overlapsList.innerHTML = "";
  }

  const rival = presentation.tracks.rivalImpulse;
  if (rival && rival.legs.length > 0) {
    rivalSection.classList.remove("hidden");
    const lead = rival.leading;
    const leadLine = lead
      ? `Leading: Wave ${lead.label} (${lead.status}) · ${lead.confidence}/100`
      : "No leading leg.";
    const legs = rival.legs
      .map(
        (l) =>
          `Wave ${l.label} ${l.status} [${l.startIndex}–${l.endIndex}] conf ${l.confidence}`
      )
      .join("<br />");
    rivalPanel.innerHTML = `
      <div class="row">Scenario <strong>RIVAL</strong> · ${rival.countDirection} count</div>
      <div class="row">Track score <strong>${rival.structureConformanceScore}/100</strong></div>
      <div class="row">${leadLine}</div>
      <div class="panel-muted" style="margin-top:0.5rem">${legs}</div>
    `;
  } else {
    rivalSection.classList.add("hidden");
    rivalPanel.innerHTML = "";
  }

  if (analysis.waves.length === 0) {
    wavesEl.innerHTML = "<li>No waves detected.</li>";
  } else {
    wavesEl.innerHTML = analysis.waves
      .map((w) => `<li>${formatWaveRow(w)}</li>`)
      .join("");
  }

  if (diagnostics) {
    renderWaveDiagnostics(diagnostics);
  }

  jsonEl.textContent = JSON.stringify(
    {
      dataSource: meta?.dataSource,
      symbol: meta?.symbol,
      timeframe: meta?.timeframe,
      candleCount: meta?.candleCount,
      presentation,
      analysis,
      diagnostics,
    },
    null,
    2
  );
}
