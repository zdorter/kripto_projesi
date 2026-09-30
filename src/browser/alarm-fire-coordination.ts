import type { DashboardAlert, DashboardAlertsStore } from "./crypto-dashboard-alarm-types";
import type { DashboardPriceCondition } from "./crypto-dashboard-alarm-types";

export const ALARM_FIRE_BROADCAST_CHANNEL = "crypto-dashboard-alarm-fire-v1";

export function buildAlarmFireEventKey(
  alertId: string,
  condition: Pick<DashboardPriceCondition, "type" | "operator" | "value">
): string {
  return `${alertId}|${condition.type}|${condition.operator}|${condition.value}`;
}

/**
 * Prevents duplicate user-visible fires when dashboard + scanner tabs both monitor prices.
 */
export class AlarmFireCoordinator {
  private readonly remoteKeys = new Set<string>();
  private readonly channel: BroadcastChannel | null;

  constructor() {
    if (
      typeof BroadcastChannel !== "undefined" &&
      typeof globalThis.window !== "undefined"
    ) {
      this.channel = new BroadcastChannel(ALARM_FIRE_BROADCAST_CHANNEL);
      this.channel.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { eventKey?: string } | null;
        if (data?.eventKey) {
          this.remoteKeys.add(data.eventKey);
        }
      };
    } else {
      this.channel = null;
    }
  }

  claimFire(
    store: DashboardAlertsStore,
    alert: DashboardAlert,
    eventKey: string
  ): boolean {
    if (this.remoteKeys.has(eventKey)) {
      return false;
    }
    const persisted = store.alerts.find((a) => a.id === alert.id);
    if (alert.lastFiredEventKey === eventKey) {
      return false;
    }
    if (persisted?.lastFiredEventKey === eventKey) {
      return false;
    }
    alert.lastFiredEventKey = eventKey;
    if (persisted) {
      persisted.lastFiredEventKey = eventKey;
    }
    this.channel?.postMessage({ eventKey, alertId: alert.id });
    this.remoteKeys.add(eventKey);
    return true;
  }
}
