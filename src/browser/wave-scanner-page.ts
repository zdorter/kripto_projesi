import type {
  WaveScannerReportPresentation,
  WaveScannerRowPresentation,
} from "../wave/wave-scanner-presentation-types";
import { WAVE_SCANNER_UI_LABELS } from "../wave/wave-scanner-presentation";
import { attachAlarmButtonToDetails } from "./wave-scanner-alarm-ui";

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(ms: number | null): string {
  if (ms === null || !ms) {
    return "—";
  }
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function refCell(ref: WaveScannerRowPresentation["entryReference"]): string {
  if (ref.status === "AVAILABLE" && ref.price !== null) {
    return formatPrice(ref.price);
  }
  return ref.status === "INSUFFICIENT_CONTEXT" ? "—" : "n/a";
}

function rowClass(row: WaveScannerRowPresentation): string {
  if (row.readyForFurtherEvaluation) {
    return "row-ready";
  }
  if (row.loadError) {
    return "row-error";
  }
  return "";
}

let selectedRowId: string | null = null;

function funnelDetailLine(row: WaveScannerRowPresentation): string {
  if (row.readyForFurtherEvaluation) {
    return "Funnel: tamamlandı (READY FOR EVALUATION)";
  }
  if (row.blockerStage === "COMPLETE") {
    return "Funnel: tamamlandı";
  }
  const parts = [row.blockerStage, row.blockerReason].filter(Boolean);
  return parts.length ? `Engel: ${parts.join(" · ")}` : "Engel: —";
}

function structuralStopNote(row: WaveScannerRowPresentation): string {
  const dir = row.details.structuralTrace.observedDirection;
  if (dir === "BEARISH") {
    return "Bearish gözlem: SL Ref genelde girişin üst tarafında (yapısal invalidation) konumlanır; emir değildir.";
  }
  if (dir === "BULLISH") {
    return "Bullish gözlem: SL Ref genelde girişin alt tarafında (yapısal invalidation) konumlanır; emir değildir.";
  }
  return "SL Ref yapısal invalidation referansıdır; emir değildir.";
}

export function updateScannerSourceBanner(source: "DEMO" | "BINANCE"): void {
  const el = document.getElementById("scanner-source-banner");
  if (!el) {
    return;
  }
  if (source === "DEMO") {
    el.textContent =
      "Kaynak: DEMO (sentetik OHLCV — canlı piyasa değildir). Tabloda yalnızca BTCUSDT örnek satırı gösterilir; tüm demo sembolleri aynı fixture'ı paylaşır.";
    el.className = "source-banner source-demo";
  } else {
    el.textContent = "Kaynak: LIVE — Binance Futures REST, kapalı 1H mumlar";
    el.className = "source-banner source-live";
  }
}

export function renderWaveScannerReport(
  report: WaveScannerReportPresentation,
  options?: { demoRepresentativeSymbol?: string }
): void {
  const statusEl = document.getElementById("scanner-status");
  const tbody = document.getElementById("scanner-tbody");
  const metaEl = document.getElementById("scanner-meta");
  if (!tbody || !statusEl) {
    throw new Error("wave-scanner.html: missing table elements");
  }

  if (metaEl) {
    metaEl.textContent = `Updated ${formatTime(Date.parse(report.generatedAt))} · TF ${report.timeframe}`;
  }

  const rows =
    options?.demoRepresentativeSymbol != null
      ? report.rows.filter((r) => r.symbol === options.demoRepresentativeSymbol)
      : report.rows;

  if (options?.demoRepresentativeSymbol != null) {
    statusEl.textContent =
      "Demo: ETH/BNB/SOL/XRP/ADA aynı sentetik seriyi kullanır; yalnızca BTCUSDT örnek satırı listelenir. Sembol bazlı analiz için LIVE seçin.";
  } else if (report.symbolErrors.length > 0) {
    statusEl.textContent = `${report.symbolErrors.length} symbol(s) reported load/analysis issues (see rows).`;
  } else {
    statusEl.textContent = "";
  }

  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = rowClass(row);
    tr.dataset.symbol = row.symbol;
    const setupLabel =
      row.prospectiveSetup?.status ??
      (row.loadError ? row.loadError : "NO PROSPECTIVE SETUP");
    const blocker =
      row.blockerReason && !row.readyForFurtherEvaluation
        ? ` · ${row.blockerReason}`
        : "";
    tr.innerHTML = `
      <td>${row.symbol}</td>
      <td>${row.timeframe}</td>
      <td>${row.structure ?? "—"}</td>
      <td>${setupLabel}${blocker}</td>
      <td title="${row.entryReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.entryColumn}<br>${refCell(row.entryReference)}</td>
      <td title="${row.stopReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.stopColumn}<br>${refCell(row.stopReference)}</td>
      <td title="${row.targetReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.targetColumn}<br>${refCell(row.targetReference)}</td>
      <td>${row.rr.status === "AVAILABLE" && row.rr.value !== null ? row.rr.value.toFixed(2) : "—"}</td>
      <td class="status-cell">${row.displayStatus}</td>
      <td class="muted">${formatTime(row.evaluationBarTime)}</td>
    `;
    tr.addEventListener("click", () => {
      selectedRowId = row.symbol;
      document.querySelectorAll("#scanner-tbody tr").forEach((r) =>
        r.classList.remove("selected")
      );
      tr.classList.add("selected");
      renderWaveScannerDetails(row);
    });
    tbody.appendChild(tr);
  }

  if (rows.length > 0 && !selectedRowId) {
    const first = rows[0]!;
    selectedRowId = first.symbol;
    const firstTr = tbody.querySelector("tr");
    firstTr?.classList.add("selected");
    renderWaveScannerDetails(first);
  } else if (selectedRowId) {
    const row = rows.find((r) => r.symbol === selectedRowId);
    if (row) {
      renderWaveScannerDetails(row);
    }
  }
}

export function renderWaveScannerDetails(row: WaveScannerRowPresentation): void {
  const panel = document.getElementById("scanner-details");
  if (!panel) {
    return;
  }
  const d = row.details;
  const trace = d.structuralTrace;
  panel.innerHTML = `
    <h2>Details · ${row.symbol}</h2>
    <section class="detail-section">
      <h3>Market</h3>
      <p>Evaluation bar: ${d.market.evaluationBarIndex ?? "—"} · ${formatTime(d.market.evaluationBarTime)}</p>
      <p>Closed candles: ${d.market.candleCount ?? "—"}</p>
    </section>
    <section class="detail-section">
      <h3>Structure &amp; scenario</h3>
      <p>${d.structure ?? "—"} · ${d.scenario.waveLabel ?? "—"} (${d.scenario.engineStatus ?? "—"})</p>
      <p class="muted">Historical setup status (not prospective): ${d.historicalSetupStatus ?? "—"}</p>
    </section>
    <section class="detail-section">
      <h3>Prospective setup</h3>
      <p>Family: ${d.prospectiveSetup?.family ?? "—"}</p>
      <p>Status: ${d.prospectiveSetup?.status ?? "—"} · Phase: ${d.prospectiveSetup?.temporalState ?? "—"}</p>
      <p>${funnelDetailLine(row)}</p>
    </section>
    <section class="detail-section">
      <h3>Anchor &amp; open leg</h3>
      <p>Selection: ${d.anchor.selection ?? "—"} (${d.anchor.status ?? "—"})</p>
      <p>Anchor idx ${trace.anchorIndex ?? "—"} · price ${formatPrice(trace.anchorPrice)} · sources ${trace.anchorSources.join(", ") || "—"}</p>
      <p>Mode: ${trace.anchorResolutionMode ?? "—"} · span ${d.openStructuralLeg.observationSpanBars ?? "—"} bars</p>
    </section>
    <section class="detail-section">
      <h3>Transition</h3>
      <p>${d.transition.verdict ?? "—"} · ${d.transition.evidenceLevel ?? "—"}</p>
      <p>Lag bars: ${trace.swingConfirmationLagBars ?? "—"} · subsequent swing idx ${trace.subsequentSwingIndex ?? "—"}</p>
      <p class="muted">Rule: ${trace.transitionRuleId ?? "—"}</p>
    </section>
    <section class="detail-section">
      <h3>Invalidation</h3>
      <p>Available: ${d.invalidation.available} · Source: ${trace.invalidationSource ?? "—"}</p>
      <p class="muted">Structural invalidation reference — not an executable stop order.</p>
    </section>
    <section class="detail-section">
      <h3>SL reference</h3>
      <p>${formatPrice(d.stopReference.price)} · ${d.stopReference.source ?? "—"}</p>
      <p class="muted">${structuralStopNote(row)}</p>
    </section>
    <section class="detail-section">
      <h3>Entry reference</h3>
      <p>${formatPrice(d.entryReference.price)} · ${d.entryReference.source ?? "—"}</p>
    </section>
    <section class="detail-section">
      <h3>Target reference</h3>
      <p>${formatPrice(d.targetReference.price)} · policy ${trace.targetPolicyId ?? "—"}</p>
      <p class="muted">${WAVE_SCANNER_UI_LABELS.targetPolicyDescription}</p>
      <p class="muted">Objective reference only — not a take-profit order.</p>
    </section>
    <section class="detail-section">
      <h3>RR</h3>
      <p>${d.rr.status === "AVAILABLE" && d.rr.value !== null ? d.rr.value.toFixed(2) : "—"}</p>
    </section>
    <section class="detail-section">
      <h3>Structural trace</h3>
      <p>Completed endpoint idx ${trace.completedEndpointIndex ?? "—"} · price ${formatPrice(trace.completedEndpointPrice)}</p>
      <p>Direction: ${trace.observedDirection ?? "—"} · future-safe: ${row.futureSafe}</p>
    </section>
    <section class="detail-section" id="scanner-alarm-action"></section>
    <details class="detail-section">
      <summary>Technical diagnostics</summary>
      <pre class="tech-pre">${d.technicalDiagnosticsJson ?? ""}</pre>
    </details>
  `;
  attachAlarmButtonToDetails(row);
}

export function setScannerLoading(loading: boolean): void {
  const btn = document.getElementById("scanner-refresh");
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "Loading…" : "Refresh";
  }
  const statusEl = document.getElementById("scanner-status");
  if (loading && statusEl) {
    statusEl.textContent = "Loading market data and running wave scanner…";
  }
}
