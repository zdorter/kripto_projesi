import type { DashboardAlert, DashboardAlertsStore } from "./crypto-dashboard-alarm-types";
import { loadDashboardAlertsStore, persistDashboardAlertsStore } from "./crypto-dashboard-alarm-store";

export type WaveScannerAlarmFireHandler = (alert: DashboardAlert, desc: string) => void;

function evaluatePriceCondition(
  price: number | null,
  cond: { type: string; operator: string; value: number }
): boolean {
  if (cond.type !== "price" || price === null || !Number.isFinite(price)) {
    return false;
  }
  return cond.operator === ">" ? price > cond.value : price < cond.value;
}

export function evaluateDashboardAlertsForSymbol(
  store: DashboardAlertsStore,
  symbol: string,
  price: number | null,
  onFire: WaveScannerAlarmFireHandler
): void {
  for (const alert of store.alerts) {
    if (!alert.enabled || alert.symbol !== symbol) {
      continue;
    }
    const results = alert.conditions.map((c) =>
      evaluatePriceCondition(price, c)
    );
    const combined =
      alert.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
    if (combined && !alert._wasTrue) {
      const desc = `${alert.symbol}: fiyat ${alert.conditions
        .map((c) => `${c.type} ${c.operator} ${c.value}`)
        .join(` ${alert.logic} `)}`;
      onFire(alert, desc);
    }
    alert._wasTrue = combined;
  }
}

export class WaveScannerAlarmMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private store: DashboardAlertsStore = { alerts: [], history: [] };
  private onFire: WaveScannerAlarmFireHandler;

  constructor(onFire: WaveScannerAlarmFireHandler) {
    this.onFire = onFire;
  }

  async reloadStore(): Promise<DashboardAlertsStore> {
    this.store = await loadDashboardAlertsStore();
    return this.store;
  }

  getStore(): DashboardAlertsStore {
    return this.store;
  }

  waveScannerAlerts(): DashboardAlert[] {
    return this.store.alerts.filter((a) => a.waveScanner?.source === "WAVE_SCANNER");
  }

  async persist(): Promise<void> {
    await persistDashboardAlertsStore(this.store);
  }

  async toggleAlert(id: string): Promise<void> {
    const alert = this.store.alerts.find((a) => a.id === id);
    if (!alert) {
      return;
    }
    alert.enabled = !alert.enabled;
    alert._wasTrue = false;
    await this.persist();
  }

  async deleteAlert(id: string): Promise<void> {
    this.store.alerts = this.store.alerts.filter((a) => a.id !== id);
    await this.persist();
  }

  symbolsToWatch(): string[] {
    const set = new Set<string>();
    for (const a of this.store.alerts) {
      if (a.enabled && a.conditions.some((c) => c.type === "price")) {
        set.add(a.symbol);
      }
    }
    return [...set];
  }

  start(intervalMs = 3000): void {
    this.stop();
    void this.reloadStore();
    this.timer = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    const symbols = this.symbolsToWatch();
    if (symbols.length === 0) {
      return;
    }
    for (const symbol of symbols) {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`
        );
        if (!res.ok) {
          continue;
        }
        const data = (await res.json()) as { price?: string };
        const price = Number(data.price);
        if (!Number.isFinite(price)) {
          continue;
        }
        evaluateDashboardAlertsForSymbol(this.store, symbol, price, this.onFire);
      } catch {
        /* per-symbol failure */
      }
    }
    await this.persist();
  }
}
