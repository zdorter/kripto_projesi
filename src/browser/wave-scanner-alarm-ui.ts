import type { WaveScannerRowPresentation } from "../wave/wave-scanner-presentation-types";
import type { WaveScannerAlarmSourceMode } from "./crypto-dashboard-alarm-types";
import {
  createWaveScannerAlarms,
  buildWaveScannerAlarmEditorModel,
  previewWaveScannerAlarmsToCreate,
  type WaveScannerReferenceType,
} from "./wave-scanner-alarm-adapter";
import type { DashboardAlertsStore } from "./crypto-dashboard-alarm-types";
import { persistDashboardAlertsStore } from "./crypto-dashboard-alarm-store";
import type { WaveScannerAlarmMonitor } from "./wave-scanner-alarm-monitor";

export interface WaveScannerAlarmUiDeps {
  getSourceMode: () => WaveScannerAlarmSourceMode;
  getMonitor: () => WaveScannerAlarmMonitor;
  onStoreChanged: () => void;
}

let deps: WaveScannerAlarmUiDeps | null = null;
let editorRow: WaveScannerRowPresentation | null = null;
const selectedTypes = new Set<WaveScannerReferenceType>();

export function initWaveScannerAlarmUi(d: WaveScannerAlarmUiDeps): void {
  deps = d;
  const backdrop = document.getElementById("alarm-editor-backdrop");
  const closeBtn = document.getElementById("alarm-editor-close");
  const confirmBtn = document.getElementById("alarm-editor-confirm");
  closeBtn?.addEventListener("click", closeAlarmEditor);
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeAlarmEditor();
    }
  });
  confirmBtn?.addEventListener("click", () => {
    void confirmAlarmCreation();
  });
}

export function openAlarmEditor(row: WaveScannerRowPresentation): void {
  if (!deps) {
    return;
  }
  editorRow = row;
  selectedTypes.clear();
  const backdrop = document.getElementById("alarm-editor-backdrop");
  const body = document.getElementById("alarm-editor-body");
  const preview = document.getElementById("alarm-editor-preview");
  if (!backdrop || !body || !preview) {
    return;
  }
  const model = buildWaveScannerAlarmEditorModel(row, deps.getSourceMode());
  body.innerHTML = `
    <p><strong>${model.symbol}</strong> · ${model.timeframe} · ${model.setupFamily ?? "—"}</p>
    <p class="muted">Değerlendirme: ${model.evaluationBarTime ? new Date(model.evaluationBarTime).toISOString() : "—"}</p>
    <p class="muted">Kaynak: ${model.sourceMode === "DEMO" ? "DEMO (işaretli)" : "LIVE"}</p>
    <p class="muted">Alarm, referans fiyatına ulaşıldığında bildirim verir; işlem talimatı değildir.</p>
    <div id="alarm-ref-checkboxes"></div>
  `;
  const boxHost = document.getElementById("alarm-ref-checkboxes");
  if (!boxHost) {
    return;
  }
  for (const ref of model.references) {
    const wrap = document.createElement("label");
    wrap.className = "alarm-ref-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = !ref.available;
    input.value = ref.referenceType;
    input.addEventListener("change", () => {
      if (input.checked) {
        selectedTypes.add(ref.referenceType);
      } else {
        selectedTypes.delete(ref.referenceType);
      }
      updatePreview();
    });
    wrap.appendChild(input);
    const text = document.createElement("span");
    text.textContent = `${ref.label} · ${ref.available ? ref.referencePrice : ref.unavailableReason}`;
    wrap.appendChild(text);
    boxHost.appendChild(wrap);
  }
  preview.textContent = "Seçim yapın ve onaylayın.";
  backdrop.classList.add("visible");
  updatePreview();
}

function updatePreview(): void {
  const preview = document.getElementById("alarm-editor-preview");
  if (!preview || !editorRow || !deps) {
    return;
  }
  if (selectedTypes.size === 0) {
    preview.textContent = "Henüz referans seçilmedi.";
    return;
  }
  const current = editorRow.entryReference.price;
  if (current === null || !Number.isFinite(current)) {
    preview.textContent = "Değerlendirme fiyatı yok; alarm oluşturulamaz.";
    return;
  }
  const items = previewWaveScannerAlarmsToCreate({
    row: editorRow,
    sourceMode: deps.getSourceMode(),
    selectedReferenceTypes: [...selectedTypes],
    currentEvaluationPrice: current,
  });
  preview.textContent = items.length
    ? `Oluşturulacak: ${items.map((i) => `${i.referenceType} @ ${i.price}`).join(", ")}`
    : "Seçili referanslar kullanılamıyor.";
}

function closeAlarmEditor(): void {
  document.getElementById("alarm-editor-backdrop")?.classList.remove("visible");
  editorRow = null;
  selectedTypes.clear();
}

async function confirmAlarmCreation(): Promise<void> {
  if (!deps || !editorRow) {
    return;
  }
  if (selectedTypes.size === 0) {
    setAlarmFeedback("En az bir referans seçin.");
    return;
  }
  const current = editorRow.entryReference.price;
  if (current === null || !Number.isFinite(current)) {
    setAlarmFeedback("Geçerli değerlendirme fiyatı gerekli.");
    return;
  }
  const monitor = deps.getMonitor();
  const store = monitor.getStore();
  const result = createWaveScannerAlarms({
    row: editorRow,
    sourceMode: deps.getSourceMode(),
    selectedReferenceTypes: [...selectedTypes],
    store,
    currentEvaluationPrice: current,
  });
  await persistDashboardAlertsStore(store);
  await monitor.reloadStore();
  deps.onStoreChanged();
  setAlarmFeedback(result.messageTr);
  closeAlarmEditor();
}

export function setAlarmFeedback(message: string): void {
  const el = document.getElementById("alarm-feedback");
  if (el) {
    el.textContent = message;
  }
}

export function renderWaveScannerAlarmList(monitor: WaveScannerAlarmMonitor): void {
  const list = document.getElementById("wave-scanner-alarm-list");
  if (!list) {
    return;
  }
  const alerts = monitor.waveScannerAlerts();
  if (alerts.length === 0) {
    list.innerHTML = `<p class="muted">Wave Scanner kaynaklı alarm yok.</p>`;
    return;
  }
  list.innerHTML = "";
  for (const alert of alerts) {
    const item = document.createElement("div");
    item.className = "alarm-list-item" + (alert.enabled ? "" : " disabled");
    const ws = alert.waveScanner!;
    const demoTag = ws.sourceMode === "DEMO" ? " · DEMO" : "";
    item.innerHTML = `
      <div class="alarm-list-info">
        <div class="alarm-list-name">${alert.name}${demoTag}</div>
        <div class="alarm-list-desc">${ws.referenceType} @ ${ws.snapshotPrice} · ${ws.timeframe}</div>
      </div>`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "alarm-mini-btn";
    toggle.textContent = alert.enabled ? "Durdur" : "Aç";
    toggle.addEventListener("click", async () => {
      await monitor.toggleAlert(alert.id);
      renderWaveScannerAlarmList(monitor);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "alarm-mini-btn danger";
    del.textContent = "Sil";
    del.addEventListener("click", async () => {
      await monitor.deleteAlert(alert.id);
      renderWaveScannerAlarmList(monitor);
    });
    item.append(toggle, del);
    list.appendChild(item);
  }
}

export function attachAlarmButtonToDetails(row: WaveScannerRowPresentation): void {
  const host = document.getElementById("scanner-alarm-action");
  if (!host) {
    return;
  }
  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scanner-alarm-btn";
  btn.textContent = "Alarm Oluştur";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAlarmEditor(row);
  });
  host.appendChild(btn);
}
