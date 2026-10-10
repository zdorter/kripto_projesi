# Decision: MSL-7C consumption in MSL-10 V1

**Decision ID:** MSL-10-DEC-001  
**Status:** RATIFIED_FOR_MSL-10_V1  
**Date:** 2026-10-09  
**Scope:** Research architecture only — no semantic change to MSL-7C or MSL-9C.

---

## Context

MSL-7C (`buildMarketStructureCrossTfLiquidityInteractionContext`) produces cross-timeframe research events: visible HTF liquidity pools interacting with LTF wick touches within a bounded observation window.

MSL-9F (descriptive confluence surface) orchestrates per-timeframe surfaces and an MTF panel but does not import MSL-7C directly.

MSL-9C (`buildMarketStructureMtfEventOrderingContext`) already consumes MSL-7C and normalizes events as:

- `eventFamily`: `CROSS_TF_LIQUIDITY_WICK_TOUCH`
- `sourceContext`: `MSL-7C`

Same-TF wick touches may be deduplicated when a cross-TF 7C event covers the same touch key.

---

## Decision

**MSL-7C feeds MSL-9C only in V1.**

1. MSL-7C remains a **standalone research builder** (guard **DJ**).
2. **MSL-9C is the canonical consumer** of MSL-7C for integrated MTF event ordering.
3. **MSL-9F does not independently rebuild MSL-7C** and does not add duplicate 7C computation.
4. **MSL-9F does not expose a standalone 7C section** in V1.
5. 7C information is available **indirectly** through 9C ordering (representative evaluation relations, family counts, tier-2 UI).
6. A **future tier-2 raw 7C projection** (presentation-only, read-only) may be added **without changing MSL-7C semantics**.

---

## Consequences

### In scope for V1

- 9C continues to call `buildMarketStructureCrossTfLiquidityInteractionContext` internally.
- UI tier 2 may show 9C temporal ordering that includes 7C-derived families.

### Out of scope for V1

- Duplicate 7C builder invocation inside 9F for a parallel event list.
- Treating 7C or 9C ordering as trade confirmation, setup sequence, or causality.

---

## Explicit non-claims

This decision does **not**:

- establish liquidity **causality**;
- establish a **trading signal**;
- establish **predictive value** or profitability;
- change **MSL-7C semantics**, rules, or tests;
- promote native HTF or alter MSL-7B;
- integrate MSL into production scanner, trade evaluation, or backtest.

Ordering relations (`BEFORE`, `AFTER`, `SAME_TIME`, `NOT_COMPARABLE`) remain **temporal and descriptive only**.

---

## References

- Implementation: `src/wave/market-structure/market-structure-cross-tf-liquidity-interaction.ts`
- Consumer: `src/wave/market-structure/market-structure-mtf-event-ordering.ts`
- Architecture guards: **DJ** (7C), **DP** (9C), **DS** (9F)
- Trust matrix: [msl-10-trust-matrix.md](../msl-10-trust-matrix.md)
- Program spec: [msl-10-spec.md](../msl-10-spec.md)
