# MSL-13 — Leakage contract (LOCKED)

**Status:** LOCKED for Phase A+  
**Scope:** Historical evidence measurement only — not trading semantics.

## Evaluation

- `evaluationBarIndex = E`
- `evaluationTimestamp = candles[E].time`
- **Event/state input candles:** `candles[0..E]` inclusive (via `buildMarketStructureSnapshotAtBar` at E)

## Forward observation

- **Window:** `candles[E+1 .. min(E+H, lastIndex)]` inclusive
- Bar **E** is never included in forward OHLCV math
- Bar **E+H** is excluded when `E+H > lastIndex` (partial window + `INSUFFICIENT_HORIZON` status)

## STRICT_AT_E cohort

An entity may appear as a strict event only if:

- `knownAtBarIndex <= E`, and
- `knownAtTimestamp <= evaluationTimestamp` (bar-close time at known-at index)

If `knownAt > E`, it **must not** be reported as `STRICT_AT_E`.

## Phase A strict sources

- MSL-1–5 and MSL-8 via snapshot (+ MSL-8 context from snapshot only)
- **Not** MSL-6, 7E, 7C, 7D, 9C–9F in Phase A

## Prefix invariance

Appending candles after E must not change strict event/state at E; only forward observations may change.
