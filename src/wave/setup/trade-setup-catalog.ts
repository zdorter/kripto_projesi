import type { TradeSetupCatalogEntry } from "./trade-setup-types";

export const TRADE_SETUP_CATALOG: readonly TradeSetupCatalogEntry[] = [
  {
    setupTypeId: "impulse-continuation",
    label: "Impulse continuation",
    description:
      "Trade setup template for selected impulse structure continuation (not an entry signal).",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    allowedStructures: ["IMPULSE"],
    allowedRoles: ["PRIMARY", "CANDIDATE"],
    requiresMtf: false,
    prerequisiteConditions: [
      "evaluation-bar-available",
      "impulse-context-available",
    ],
    triggerConditions: ["impulse-continuation-phase-active"],
    confirmationConditions: [
      "impulse-leading-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "w4-structure-conflict-clear",
      "fib-w12-conformance-met",
    ],
    tradeConfirmationConditions: [
      "impulse-leading-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "w4-structure-conflict-clear",
      "fib-w12-conformance-met",
    ],
    optionalConditions: [],
  },
  {
    setupTypeId: "correction-end",
    label: "Correction end",
    description:
      "Trade setup template for corrective A-B-C with Wave C completion (not an entry signal).",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    allowedStructures: ["CORRECTIVE"],
    allowedRoles: ["PRIMARY", "CANDIDATE"],
    allowedWaveLabels: ["C"],
    requiresMtf: false,
    prerequisiteConditions: [
      "evaluation-bar-available",
      "corrective-abc-context-available",
    ],
    triggerConditions: ["c-leg-started"],
    confirmationConditions: [
      "c-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "fib-abc-conformance-met",
    ],
    tradeConfirmationConditions: [
      "c-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "fib-abc-conformance-met",
    ],
    optionalConditions: [],
  },
];
