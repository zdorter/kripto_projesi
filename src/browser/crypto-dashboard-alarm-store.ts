import {
  CRYPTO_DASHBOARD_ALERTS_KEY,
  type DashboardAlert,
  type DashboardAlertsStore,
  type DashboardPriceConditionOperator,
  type WaveScannerAlarmProvenance,
  emptyAlertsStore,
} from "./crypto-dashboard-alarm-types";
import {
  cryptoDashboardIdbGet,
  cryptoDashboardIdbSet,
} from "./crypto-dashboard-idb";

export interface AlarmStoreBackend {
  load(key: string): Promise<unknown>;
  save(key: string, value: unknown): Promise<void>;
}

export const defaultAlarmStoreBackend: AlarmStoreBackend = {
  load: cryptoDashboardIdbGet,
  save: cryptoDashboardIdbSet,
};

function isValidStore(v: unknown): v is DashboardAlertsStore {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as DashboardAlertsStore).alerts)
  );
}

export async function loadDashboardAlertsStore(
  backend: AlarmStoreBackend = defaultAlarmStoreBackend
): Promise<DashboardAlertsStore> {
  const raw = await backend.load(CRYPTO_DASHBOARD_ALERTS_KEY);
  if (!isValidStore(raw)) {
    return emptyAlertsStore();
  }
  if (!Array.isArray(raw.history)) {
    raw.history = [];
  }
  return raw;
}

export async function persistDashboardAlertsStore(
  store: DashboardAlertsStore,
  backend: AlarmStoreBackend = defaultAlarmStoreBackend
): Promise<void> {
  await backend.save(CRYPTO_DASHBOARD_ALERTS_KEY, store);
}

export function makeAlertId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) {
    return `alert-${c.randomUUID()}`;
  }
  return `alert-${Date.now().toString(36)}`;
}

export function waveScannerDuplicateKey(
  provenance: Pick<
    WaveScannerAlarmProvenance,
    "symbol" | "timeframe" | "referenceType" | "referencePrice" | "source"
  >
): string {
  return [
    provenance.source,
    provenance.symbol,
    provenance.timeframe,
    provenance.referenceType,
    provenance.referencePrice.toFixed(8),
  ].join("|");
}

export function findWaveScannerDuplicate(
  store: DashboardAlertsStore,
  duplicateKey: string
): DashboardAlert | undefined {
  return store.alerts.find(
    (a) => a.waveScanner?.duplicateKey === duplicateKey
  );
}

export function derivePriceCrossOperator(
  currentPrice: number,
  referencePrice: number
): { operator: DashboardPriceConditionOperator; atReference: boolean } {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(referencePrice)) {
    return { operator: ">", atReference: false };
  }
  if (currentPrice < referencePrice) {
    return { operator: ">", atReference: false };
  }
  if (currentPrice > referencePrice) {
    return { operator: "<", atReference: false };
  }
  return { operator: ">", atReference: true };
}

export function buildWaveScannerPriceAlert(input: {
  provenance: WaveScannerAlarmProvenance;
  currentPrice: number;
  alertName?: string;
}): DashboardAlert {
  const { operator, atReference } = derivePriceCrossOperator(
    input.currentPrice,
    input.provenance.snapshotPrice
  );
  const name =
    input.alertName ??
    `${input.provenance.symbol} ${referenceTypeLabel(input.provenance.referenceType)} (Wave Scanner)`;
  return {
    id: makeAlertId(),
    name,
    symbol: input.provenance.symbol,
    enabled: true,
    logic: "AND",
    conditions: [
      {
        type: "price",
        operator,
        value: input.provenance.snapshotPrice,
      },
    ],
    _wasTrue: atReference,
    waveScanner: input.provenance,
  };
}

function referenceTypeLabel(t: WaveScannerAlarmProvenance["referenceType"]): string {
  if (t === "ENTRY_REFERENCE") {
    return "Entry Ref";
  }
  if (t === "STRUCTURAL_INVALIDATION_REFERENCE") {
    return "SL Ref";
  }
  return "Target Ref";
}

export type PersistAlertResult =
  | { ok: true; alert: DashboardAlert; duplicate: false }
  | { ok: true; alert: DashboardAlert; duplicate: true };

export function persistNewAlert(
  store: DashboardAlertsStore,
  alert: DashboardAlert
): PersistAlertResult {
  if (alert.waveScanner) {
    const existing = findWaveScannerDuplicate(
      store,
      alert.waveScanner.duplicateKey
    );
    if (existing) {
      return { ok: true, alert: existing, duplicate: true };
    }
  }
  store.alerts.push(alert);
  return { ok: true, alert, duplicate: false };
}
