# MSL-10 — Research Trust & Presentation

**Specification version:** 1.0  
**Status:** RATIFIED / RESEARCH_ONLY  
**Program:** Market Structure Layer (MSL) research stack  
**Date:** 2026-10-09

---

## 1. Purpose

MSL-10 V1 formalizes **how research outputs are trusted, labeled, and presented** to humans. It does **not** add market-structure semantics, trading logic, or production integration.

It closes the gap between:

- a **causal-at-E research engine** (MSL-1–9F), and  
- a **safe, readable research UI** (MSL-11/12),

without implying signals, scores, or production readiness.

---

## 2. Scope

### 2.1 In scope (V1)

| ID | Deliverable | State |
|----|-------------|--------|
| **WP2** | Limitation / research **presentation taxonomy** (`coreLimitations`, `technicalLimitations`, `researchPresentationFlags`; flat `limitations[]` preserved) | COMPLETE |
| **WP3** | **Native HTF research status** presentation (strict vs normalized vs semantic vs production) | COMPLETE |
| **WP6** | **Tier 1 / Tier 2** user-facing presentation | COMPLETE |
| **WP1** | Normative **trust matrix** | [msl-10-trust-matrix.md](./msl-10-trust-matrix.md) |
| **WP4** | **MSL-7C decision record** | [decisions/msl-10-msl-7c-v1.md](./decisions/msl-10-msl-7c-v1.md) |
| **WP8** | This specification | ESTABLISHED |

### 2.2 Out of scope (explicit)

- 15M activation  
- Native HTF **production** or promotion  
- MSL-7B semantic changes (including volume normalization inside 7B)  
- Snapshot caching / shared evaluation bundle (**WP5 — DEFERRED**)  
- Confluence scoring, predictive scoring, probabilities  
- Signals, entries, SL, TP, invalidation as MSL outputs  
- Production scanner, trade evaluator, backtest integration  
- New MSS / liquidity / association **semantics**

---

## 3. Status enums (normative)

| Enum | Meaning |
|------|---------|
| **RESEARCH_ONLY** | Entire MSL-10 program and MSL research stack default. |
| **DESCRIPTIVE_ONLY** | Confluence, associations, MTF alignment, ordering — observation only. |
| **PRESENTATION_ONLY** | Taxonomy, UI tiers, chart overlay, native HTF **copy** on 9F. |
| **NOT_ESTABLISHED** | Timeframe or capability not validated (15M, native HTF production). |
| **NOT_READY** | Reserved for future gates; not used to label shipped V1 presentation. |

No signal/trading enum is introduced by MSL-10.

**Frozen program statuses (V1):**

```
CONFLUENCE_STATUS = DESCRIPTIVE_ONLY
PRODUCTION_RULE_STATUS = NOT_ESTABLISHED
NATIVE_HTF_PRODUCTION = NOT_ESTABLISHED
15M_STATUS = NOT_ESTABLISHED
```

---

## 4. Presentation taxonomy (WP2)

### 4.1 Fields

On `MarketStructureDescriptiveConfluenceSurfaceContext` (9F schema **1.0**, additive fields):

- `limitations[]` — **unchanged** merged deterministic flat list (backward compatible).  
- `presentationTaxonomy` — derived view:  
  - `coreLimitations[]`  
  - `technicalLimitations[]`  
  - `researchPresentationFlags[]`  
- `unresolved[]` — **unchanged** structured list (not folded into limitation strings).

### 4.2 Classification priority

Per string deduplication (categories only): **CORE → RESEARCH_FLAGS → TECHNICAL**.  
`unresolved` remains separate.

### 4.3 Core limitations (examples)

`research_only`, `not_production_signal`, `no_prediction`, `no_scoring`, `descriptive_confluence_surface`, `no_causality`, `observational_co_occurrence_only`.

### 4.4 Implementation guard

**DW** — taxonomy module must remain pure (no fetch, evaluator, scanner, 7B volume changes).

---

## 5. User presentation tiers (WP6)

### 5.1 Tier 1 — default (user useful)

- 4H / 1H structure (trend, HH/HL sequences, pair counts)  
- Protected level **candidates**  
- BOS / CHoCH **counts** (not row-level IDs)  
- Liquidity foundation counts  
- MTF structure & liquidity **alignment** labels  
- HTF source track (**DERIVED_1H_4H**)  
- Unresolved cases  
- Core research disclaimer  
- Native HTF **research** status block (WP3)  
- Core limitations (taxonomy)

### 5.2 Tier 2 — research / debug

- BOS/CHoCH rows (IDs, bar indices)  
- Liquidity events, lifecycle  
- MSS (with **MSS_RESEARCH_ONLY_NOT_SIGNAL**)  
- 7D same-TF associations  
- 9C ordering ( **TEMPORAL_ORDERING_ONLY** )  
- 9D / 9E associations ( **DESCRIPTIVE_ASSOCIATION_ONLY** )  
- Replay relations (optional toggle)  
- Research presentation flags, technical limitations, full flat `limitations[]`  
- Known-at debug lines  

Tier 2 must not use language implying causality or trade confirmation (“caused”, “led to”, “confirmed trade”).

### 5.3 MSL-11 / MSL-12

- **MSL-11:** Pure presenter over 9F; guard **DT**.  
- **MSL-12:** Chart overlay from 9F bundle; guard **DU**; **15M blocked**.

Neither establishes production semantics.

---

## 6. Native HTF (WP3)

### 6.1 Frozen research statuses

| Tier | Status |
|------|--------|
| Strict OHLCV field parity | **FAILED** (volume mismatch on BTC research compare) |
| Decimal normalized volume parity (3 dp, explicit opt-in) | **ESTABLISHED** (BTC research evidence) |
| Semantic parity (sampled / aligned buckets) | **ESTABLISHED** |
| Native HTF production | **NOT_ESTABLISHED** |

### 6.2 Canonical HTF path

**DERIVED_1H_4H** remains the canonical research/production-surface path for 9F/UI V1.

Native parity (guard **DV**) is an **isolated compare layer**. It does **not** switch the 9F builder to native 4H.

### 6.3 Distinctions (normative)

1. **Strict field parity** — byte/numeric field equality including volume sum semantics.  
2. **Normalized research parity** — decimal-safe volume comparison at declared precision; **research tier only**.  
3. **Semantic parity** — time-aligned bucket semantic equivalence for selected tests.  
4. **Production parity** — **NOT_ESTABLISHED**; would require separate program and guards.

3 dp volume normalization is **BTC research evidence only**; not a claim of universal Binance precision.

Presentation constants: `NATIVE_HTF_RESEARCH_PRESENTATION_V1` on 9F.

---

## 7. MSL-7C architecture (WP4)

**Ratified decision:** [decisions/msl-10-msl-7c-v1.md](./decisions/msl-10-msl-7c-v1.md)  
**Status:** RATIFIED_FOR_MSL-10_V1

Summary:

- MSL-7C feeds **MSL-9C only** in V1.  
- MSL-9F does **not** rebuild 7C or expose a standalone 7C section.  
- 7C appears indirectly via 9C (`CROSS_TF_LIQUIDITY_WICK_TOUCH`, `sourceContext: MSL-7C`).  
- Optional future: tier-2 **raw 7C projection**, presentation-only.

---

## 8. Confluence

**CONFLUENCE_STATUS = DESCRIPTIVE_ONLY**

MSL-9F is observational co-occurrence only:

- No confluence score  
- No probability  
- No prediction  
- No signal  
- Surface-level `no_causality` refers to **confluence as a product concept**, not denial of per-layer causal-at-E rules (see trust matrix).

---

## 9. 15M

**15M_STATUS = NOT_ESTABLISHED**

MSL-10 does **not** activate 15M.

Future activation gates (minimum):

1. Frozen 15M dataset **or** approved derivation policy  
2. Checksum contract  
3. MSL-7A LTF/HTF role definition for 15M  
4. 9F active timeframe tests  
5. MSL-11 / MSL-12 establishment tests  
6. Architecture guard update  
7. Prefix invariance and determinism tests on multi-TF bundle  

---

## 10. WP5 — snapshot cache

**SNAPSHOT_CACHE = DEFERRED**

Rationale: `prebuiltContexts` partially supports MTF outputs but **not** snapshot or 7A sharing. Cache design poses **high regression risk** for determinism, prefix invariance, E vs E+horizon separation, and layer isolation.

WP5 is **not** an MSL-10 closure requirement.

---

## 11. Production boundary

MSL modules must **not** be imported by:

- trade evaluation  
- production wave scanner  
- historical backtest trade path  

MSL-10 does not change that boundary.

---

## 12. Frozen research data

Do not modify fixtures as part of MSL-10.

| Dataset | Expected SHA-256 (checksum helper) |
|---------|--------------------------------------|
| BTCUSDT 1H research | `f0df8c41e3b62bf8e21fb574761be3c35e7bd54063a156ed18e074ea6fd534bc` |
| BTCUSDT 4H native research | `b63631389780c675c51520e863a9fac67afb4a0040a784037e075d26434d079e` |

---

## 13. Closure definition

| Milestone | Criterion |
|-----------|-----------|
| **MSL-10_PRESENTATION_TRANCHE** | WP2 + WP3 + WP6 implemented and tested |
| **MSL-10_FORMALIZATION** | WP1 + WP4 + WP8 artifacts in repository |
| **MSL-10 program closure (V1)** | Presentation tranche **and** formalization complete |

```
MSL-10_PRESENTATION_TRANCHE = COMPLETE
MSL-10_SPEC_STATUS = ESTABLISHED
MSL-10_FORMALIZATION = COMPLETE
MSL-10_IMPLEMENTATION_STATUS = PARTIAL  (presentation complete; no WP5/15M/native production)
```

---

## 14. References

| Artifact | Path |
|----------|------|
| Trust matrix | [msl-10-trust-matrix.md](./msl-10-trust-matrix.md) |
| 7C decision | [decisions/msl-10-msl-7c-v1.md](./decisions/msl-10-msl-7c-v1.md) |
| 9F surface | `src/wave/market-structure/market-structure-descriptive-confluence-surface.ts` |
| Taxonomy | `src/wave/market-structure/market-structure-presentation-taxonomy.ts` |
| UI presenter | `src/browser/market-structure-ui-presenter.ts` |
| Architecture guards | `src/wave/__tests__/architecture-contract.test.ts` (DA–DW) |

---

## 15. Revision history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-10-09 | Initial ratified MSL-10 V1 spec (trust, 7C decision, presentation scope) |
