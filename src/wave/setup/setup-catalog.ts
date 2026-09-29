import type { SetupCatalogEntry, SetupLifecycleStatus } from "./setup-types";
import { TRADE_SETUP_CATALOG } from "./trade-setup-catalog";

/**
 * Declarative setup catalog — metadata only; no price/trend/wave computation.
 *
 * DEFER (future TRADE_SETUP types, not in 14B.6):
 * - IMPULSE_CONTINUATION
 * - CORRECTION_END
 * - WAVE_5_CONTINUATION
 * - WAVE_C_COMPLETION
 *
 * Entry Plan whitelist: see ENTRY_PLAN_ELIGIBILITY_RULE in setup-types.
 */
export const STRUCTURAL_SETUP_CATALOG: readonly SetupCatalogEntry[] = [
  {
    setupTypeId: "primary-focus-leg",
    label: "Primary focus leg",
    description:
      "Structural readiness / watch context for presentation primary focus (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["PRIMARY"],
    triggerConditions: ["scenario-active", "segment-defined"],
    confirmationConditions: [
      "engine-not-invalidated",
      "invalidation-available",
    ],
    optionalConditions: [
      "fib-context-available",
      "presentation-trend-alignment",
      "mtf-relationship-allows",
    ],
    requiresMtf: false,
  },
  {
    setupTypeId: "alternative-focus-leg",
    label: "Alternative focus leg",
    description:
      "Structural watch context for presentation alternative focus (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["ALTERNATIVE"],
    triggerConditions: ["scenario-active", "segment-defined"],
    confirmationConditions: [
      "engine-not-invalidated",
      "invalidation-available",
    ],
    optionalConditions: ["fib-context-available", "presentation-trend-alignment"],
    requiresMtf: false,
  },
  {
    setupTypeId: "impulse-wave-segment",
    label: "Impulse wave segment",
    description:
      "Impulse wave segment classification from scanner scenarios (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedStructures: ["IMPULSE"],
    triggerConditions: ["segment-defined"],
    confirmationConditions: [
      "scenario-active",
      "engine-not-invalidated",
    ],
    optionalConditions: ["invalidation-available", "ht-trend-context"],
    requiresMtf: false,
  },
  {
    setupTypeId: "corrective-wave-segment",
    label: "Corrective wave segment",
    description:
      "Corrective wave segment classification from scanner scenarios (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedStructures: ["CORRECTIVE"],
    triggerConditions: ["segment-defined"],
    confirmationConditions: [
      "scenario-active",
      "engine-not-invalidated",
    ],
    optionalConditions: ["invalidation-available", "ht-trend-context"],
    requiresMtf: false,
  },
  {
    setupTypeId: "mtf-primary-pair-context",
    label: "MTF primary-pair context",
    description:
      "MTF + hierarchy structural context for higher-TF primary focus (not trade confirmation).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["PRIMARY"],
    requiresMtf: true,
    triggerConditions: [
      "scenario-active",
      "segment-defined",
      "mtf-context-present",
      "ht-trend-context",
    ],
    confirmationConditions: [
      "engine-not-invalidated",
      "mtf-relationship-aligned",
      "hierarchy-time-contained",
      "hierarchy-nesting-not-confirmed",
    ],
    optionalConditions: [
      "invalidation-available",
      "hierarchy-context-present",
      "mtf-relationship-allows",
      "presentation-trend-alignment",
    ],
  },
];

/** Structural + trade entries (lookup only). */
export const SETUP_CATALOG: readonly SetupCatalogEntry[] = [
  ...STRUCTURAL_SETUP_CATALOG,
  ...TRADE_SETUP_CATALOG,
];

export function listStructuralContextCatalogEntries(): SetupCatalogEntry[] {
  return STRUCTURAL_SETUP_CATALOG.filter((e) => !e.isTradeSetup);
}

export function getSetupCatalogEntry(
  setupTypeId: string
): SetupCatalogEntry | undefined {
  return SETUP_CATALOG.find((e) => e.setupTypeId === setupTypeId);
}

export function listTradeSetupCatalogEntries(): SetupCatalogEntry[] {
  return [...TRADE_SETUP_CATALOG];
}

export function isEntryPlanEligibleSetup(candidate: {
  isTradeSetup: boolean;
  status: SetupLifecycleStatus;
}): boolean {
  return candidate.isTradeSetup && candidate.status === "CONFIRMED";
}
