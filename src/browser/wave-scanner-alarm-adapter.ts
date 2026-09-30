import type { WaveScannerRowPresentation } from "../wave/wave-scanner-presentation-types";
import {
  buildWaveScannerPriceAlert,
  persistNewAlert,
  waveScannerDuplicateKey,
  type PersistAlertResult,
} from "./crypto-dashboard-alarm-store";
import type {
  DashboardAlertsStore,
  WaveScannerAlarmProvenance,
  WaveScannerAlarmSourceMode,
  WaveScannerReferenceType,
} from "./crypto-dashboard-alarm-types";

export const WAVE_SCANNER_ALARM_ADAPTER_SCHEMA = "1.0" as const;

export interface WaveScannerAlarmableReference {
  referenceType: WaveScannerReferenceType;
  label: string;
  available: boolean;
  unavailableReason: string | null;
  referencePrice: number | null;
  sourceModel: string | null;
  targetPolicy: string | null;
}

export interface WaveScannerAlarmEditorModel {
  symbol: string;
  timeframe: string;
  setupFamily: string | null;
  evaluationBarTime: number | null;
  prospectiveCandidateId: string | null;
  sourceMode: WaveScannerAlarmSourceMode;
  currentEvaluationPrice: number | null;
  references: WaveScannerAlarmableReference[];
}

export interface CreateWaveScannerAlarmsInput {
  row: WaveScannerRowPresentation;
  sourceMode: WaveScannerAlarmSourceMode;
  selectedReferenceTypes: WaveScannerReferenceType[];
  store: DashboardAlertsStore;
  currentEvaluationPrice: number;
}

export interface CreateWaveScannerAlarmsItemResult {
  referenceType: WaveScannerReferenceType;
  ok: boolean;
  duplicate: boolean;
  error: string | null;
  alertId: string | null;
}

export interface CreateWaveScannerAlarmsResult {
  created: number;
  duplicates: number;
  failed: number;
  items: CreateWaveScannerAlarmsItemResult[];
  messageTr: string;
}

const REF_LABELS: Record<WaveScannerReferenceType, string> = {
  ENTRY_REFERENCE: "Entry Ref",
  STRUCTURAL_INVALIDATION_REFERENCE: "SL Ref",
  TARGET_REFERENCE: "Target Ref",
};

export function listAlarmableReferences(
  row: WaveScannerRowPresentation
): WaveScannerAlarmableReference[] {
  return [
    mapRef(
      "ENTRY_REFERENCE",
      row.entryReference,
      row.entryReference.source
    ),
    mapRef(
      "STRUCTURAL_INVALIDATION_REFERENCE",
      row.stopReference,
      row.stopReference.source
    ),
    mapRef(
      "TARGET_REFERENCE",
      row.targetReference,
      row.targetReference.source,
      row.targetReference.source
    ),
  ];
}

function mapRef(
  referenceType: WaveScannerReferenceType,
  field: WaveScannerRowPresentation["entryReference"],
  sourceModel: string | null,
  targetPolicy: string | null = null
): WaveScannerAlarmableReference {
  const available =
    field.status === "AVAILABLE" &&
    field.price !== null &&
    Number.isFinite(field.price);
  return {
    referenceType,
    label: REF_LABELS[referenceType],
    available,
    unavailableReason: available ? null : "INSUFFICIENT_CONTEXT",
    referencePrice: available ? field.price : null,
    sourceModel,
    targetPolicy,
  };
}

export function buildWaveScannerAlarmEditorModel(
  row: WaveScannerRowPresentation,
  sourceMode: WaveScannerAlarmSourceMode
): WaveScannerAlarmEditorModel {
  const current =
    row.entryReference.status === "AVAILABLE" && row.entryReference.price !== null
      ? row.entryReference.price
      : null;
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    setupFamily: row.prospectiveSetup?.family ?? null,
    evaluationBarTime: row.evaluationBarTime,
    prospectiveCandidateId:
      row.details.technicalDiagnosticsJson?.includes("prospectiveId")
        ? extractProspectiveId(row.details.technicalDiagnosticsJson)
        : null,
    sourceMode,
    currentEvaluationPrice: current,
    references: listAlarmableReferences(row),
  };
}

function extractProspectiveId(json: string): string | null {
  try {
    const o = JSON.parse(json) as { prospectiveId?: string };
    return o.prospectiveId ?? null;
  } catch {
    return null;
  }
}

function validateCreateInput(
  row: WaveScannerRowPresentation,
  selected: WaveScannerReferenceType[],
  currentEvaluationPrice: number
): string | null {
  if (selected.length === 0) {
    return "NO_REFERENCE_SELECTED";
  }
  if (!Number.isFinite(currentEvaluationPrice)) {
    return "INVALID_EVALUATION_PRICE";
  }
  if (!row.symbol?.trim()) {
    return "INVALID_SYMBOL";
  }
  return null;
}

export function previewWaveScannerAlarmsToCreate(
  input: Omit<CreateWaveScannerAlarmsInput, "store">
): Array<{ referenceType: WaveScannerReferenceType; price: number; duplicateKey: string }> {
  const refs = listAlarmableReferences(input.row);
  const out: Array<{
    referenceType: WaveScannerReferenceType;
    price: number;
    duplicateKey: string;
  }> = [];
  for (const type of input.selectedReferenceTypes) {
    const ref = refs.find((r) => r.referenceType === type);
    if (!ref?.available || ref.referencePrice === null) {
      continue;
    }
    const provenance = buildProvenance(input, ref);
    out.push({
      referenceType: type,
      price: ref.referencePrice,
      duplicateKey: provenance.duplicateKey,
    });
  }
  return out;
}

function buildProvenance(
  input: CreateWaveScannerAlarmsInput,
  ref: WaveScannerAlarmableReference
): WaveScannerAlarmProvenance {
  const price = ref.referencePrice as number;
  const duplicateKey = waveScannerDuplicateKey({
    source: "WAVE_SCANNER",
    symbol: input.row.symbol,
    timeframe: input.row.timeframe,
    referenceType: ref.referenceType,
    referencePrice: price,
  });
  return {
    source: "WAVE_SCANNER",
    sourceMode: input.sourceMode,
    symbol: input.row.symbol,
    timeframe: input.row.timeframe,
    referenceType: ref.referenceType,
    referencePrice: price,
    setupFamily: input.row.prospectiveSetup?.family ?? null,
    prospectiveCandidateId: buildWaveScannerAlarmEditorModel(
      input.row,
      input.sourceMode
    ).prospectiveCandidateId,
    evaluationBarTime: input.row.evaluationBarTime,
    targetPolicy: ref.targetPolicy,
    snapshotPrice: price,
    duplicateKey,
  };
}

export function createWaveScannerAlarms(
  input: CreateWaveScannerAlarmsInput
): CreateWaveScannerAlarmsResult {
  const validation = validateCreateInput(
    input.row,
    input.selectedReferenceTypes,
    input.currentEvaluationPrice
  );
  if (validation) {
    return {
      created: 0,
      duplicates: 0,
      failed: input.selectedReferenceTypes.length,
      items: input.selectedReferenceTypes.map((referenceType) => ({
        referenceType,
        ok: false,
        duplicate: false,
        error: validation,
        alertId: null,
      })),
      messageTr: "Alarm oluşturulamadı.",
    };
  }

  const refs = listAlarmableReferences(input.row);
  const items: CreateWaveScannerAlarmsItemResult[] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const referenceType of input.selectedReferenceTypes) {
    const ref = refs.find((r) => r.referenceType === referenceType);
    if (!ref?.available || ref.referencePrice === null) {
      failed += 1;
      items.push({
        referenceType,
        ok: false,
        duplicate: false,
        error: "REFERENCE_UNAVAILABLE",
        alertId: null,
      });
      continue;
    }
    const provenance = buildProvenance(input, ref);
    const alert = buildWaveScannerPriceAlert({
      provenance,
      currentPrice: input.currentEvaluationPrice,
    });
    const persisted: PersistAlertResult = persistNewAlert(input.store, alert);
    if (persisted.duplicate) {
      duplicates += 1;
      items.push({
        referenceType,
        ok: true,
        duplicate: true,
        error: null,
        alertId: persisted.alert.id,
      });
    } else {
      created += 1;
      items.push({
        referenceType,
        ok: true,
        duplicate: false,
        error: null,
        alertId: persisted.alert.id,
      });
    }
  }

  let messageTr: string;
  if (created === 0 && duplicates === 0 && failed > 0) {
    messageTr = "Alarm oluşturulamadı.";
  } else if (duplicates > 0 && created > 0) {
    messageTr = `${created} alarm oluşturuldu, ${duplicates} mevcut alarm zaten vardı.`;
  } else if (duplicates > 0 && created === 0) {
    messageTr = `0 alarm oluşturuldu, ${duplicates} mevcut alarm zaten vardı.`;
  } else {
    messageTr = `${created} alarm oluşturuldu.`;
  }

  return { created, duplicates, failed, items, messageTr };
}

/** RR and READY are not alarmable reference types. */
export function isAlarmableReferenceType(
  value: string
): value is WaveScannerReferenceType {
  return (
    value === "ENTRY_REFERENCE" ||
    value === "STRUCTURAL_INVALIDATION_REFERENCE" ||
    value === "TARGET_REFERENCE"
  );
}
