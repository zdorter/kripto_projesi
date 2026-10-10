# MSL-10 — Normative Trust Matrix

**Status:** RATIFIED / RESEARCH_ONLY  
**Version:** 1.0  
**Purpose:** Define what each MSL layer may and may not mean for manual research use.  
**Authority:** Repository evidence (modules, guards, tests). This document does not upgrade any layer to production or signal status.

**Related:** [msl-10-spec.md](./msl-10-spec.md) · [decisions/msl-10-msl-7c-v1.md](./decisions/msl-10-msl-7c-v1.md)

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **CAUSAL_AT_E** | Outputs at evaluation bar `E` use only prefix `candles[0..E]` (and explicit horizon rules); known-at/confirmation gates apply. |
| **DESCRIPTIVE_ONLY** | Labels, alignment, associations, or ordering for observation — not trade rules or predictions. |
| **DATA_TRANSFORM** | OHLCV or compare transforms; not event causality at `E`. |
| **PRESENTATION_ONLY** | UI/taxonomy/chart projection; no new market facts. |
| **MIXED** | Contains both causal-at-E subsets and explicitly descriptive/replay subsets. |
| **NOT_ESTABLISHED** | Timeframe or production path not validated for use. |

**Production status** for all MSL research layers below: **NOT_ESTABLISHED** (no production scanner / trade-evaluation integration).

**Signal interpretation:** Layers must **not** be read as entry, exit, SL, TP, invalidation, or confluence score unless a future, separate production program explicitly establishes that (outside MSL-10).

---

## Layer matrix

### MSL-1 — Snapshot foundation

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Inclusive `evaluationBarIndex` = E; candles after E never read. |
| **Known-at** | Swings included only when `pivotIndex + rightBars ≤ E`. |
| **Future-data protection** | Slice-first; `MarketStructureInvalidEvaluationBarIndexError` on invalid E. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Descriptive structure snapshot; not a trade setup. |
| **Architecture guard** | **DA** |
| **Important limitations** | `swing_confirmation_lag_bars`; insufficient pivot window; single-swing diagnostics. |

**Module:** `market-structure-snapshot.ts` — composes MSL-2–5 inside one snapshot build.

---

### MSL-2 — Zigzag / internal–external

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Via MSL-1 confirmed swings at E. |
| **Known-at** | Annotation `knownAtBarIndex` on swing spine. |
| **Future-data protection** | Via MSL-1 slice. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Scope labels (internal/external) are descriptive. |
| **Architecture guard** | **DB** |
| **Important limitations** | Research rule `ZIGZAG_SPINE_EXTERNAL_LEG_CONTAINMENT_V1`. |

---

### MSL-3 — Protected levels

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Candidates evaluated at E (`statusAtE`). |
| **Known-at** | Pivot confirmation aligned with swing rules. |
| **Future-data protection** | Via snapshot E. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **Candidates**, not guaranteed institutional levels; multiple candidates may be unresolved. |
| **Architecture guard** | **DC** |
| **Important limitations** | `MARKET_STRUCTURE_PROTECTED_LEVEL_RESEARCH_V1`; unresolved reasons (e.g. neutral trend, multiple highs). |

---

### MSL-4 — BOS / CHoCH

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Classified events at E; trigger bar ≤ E for eval snapshot path. |
| **Known-at** | Reference known-at from pivot confirmation; event `knownAtBarIndex` on trigger. |
| **Future-data protection** | Eval path uses prefix; extended bar only where a consumer explicitly uses horizon (e.g. 9C replay). |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **Structure events**, not signals; counts are not strength scores. |
| **Architecture guard** | **DD** |
| **Important limitations** | Wick-inclusive trigger research rules; break registry research-only. |

---

### MSL-5 — Liquidity foundation

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Pools/candidates from snapshot at E. |
| **Known-at** | Derived from pivots/observations confirmed at E. |
| **Future-data protection** | Via snapshot E. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | BSL/SSL/EQH/EQL/pools are **research constructs**, not order-book truth. |
| **Architecture guard** | **DE** |
| **Important limitations** | Hybrid equality tolerance; protected ≠ liquidity. |

---

### MSL-6 — Liquidity interaction (same TF)

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Horizon from E on same timeframe. |
| **Known-at** | Interaction trigger bars within horizon policy. |
| **Future-data protection** | Horizon capped; no unbounded forward read beyond policy. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Wick touches — not sweep/taken unless MSL-7E. |
| **Architecture guard** | **DF** |
| **Important limitations** | Default horizon bars; research-only. |

---

### MSL-7A — MTF causal alignment

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | LTF E; HTF resolved **closed** bar aligned to LTF eval timestamp. |
| **Known-at** | Bar-close timestamps; cross-TF visibility sets (break IDs, pool IDs). |
| **Future-data protection** | HTF prefix only; `htf_closed_bar_prefix_only`; no developing HTF bar as “known” at eval. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Alignment context only; **does not run 7C** (`no_cross_tf_liquidity_interaction` on 7A limitations). |
| **Architecture guard** | **DH** |
| **Important limitations** | Not wave multi-timeframe module; not production signal. |

---

### MSL-7B — HTF derivation (1H→4H)

| Field | Value |
|-------|--------|
| **Status** | DATA_TRANSFORM |
| **Evaluation boundary** | Aggregates supplied LTF prefix into HTF buckets. |
| **Known-at** | N/A (candle synthesis). |
| **Future-data protection** | Only input candles provided. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **Canonical research HTF path:** `DERIVED_1H_4H`. Volume uses JS floating-point sum (strict native field parity failed). |
| **Architecture guard** | **DI** |
| **Important limitations** | No direct `detectSwings`; not native production feed. |

---

### MSL-7C — Cross-TF liquidity interaction

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | HTF visible pools at causal HTF E; LTF touches in `(E_LTF, E_LTF + horizon]`. |
| **Known-at** | HTF visibility via 7A; touch bars on LTF. |
| **Future-data protection** | `causal_htf_visibility`, `no_future_pool_rebuild`, observation window policy. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **Wick touch only** — no sweep/taken/reclaim/MSS/BOS coupling in 7C. |
| **Architecture guard** | **DJ** |
| **Important limitations** | Consumed by **9C only** in V1 (see decision MSL-10-DEC-001). |

---

### MSL-7D — Same-TF liquidity → structure association

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E (visibility) + **DESCRIPTIVE_ONLY** (association semantics) |
| **Evaluation boundary** | E; may rebuild snapshot at E and struct leg. |
| **Known-at** | Association timestamps from event contexts. |
| **Future-data protection** | Evaluation bar scoped. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **DESCRIPTIVE_ASSOCIATION_ONLY** — not setup sequence or trade confirmation. |
| **Architecture guard** | **DK** |
| **Important limitations** | Not a causal chain narrative. |

---

### MSL-7E — Advanced liquidity + lifecycle

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Horizon from E on snapshot. |
| **Known-at** | Advanced event trigger bars. |
| **Future-data protection** | Horizon capped. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Lifecycle phases are descriptive state labels. |
| **Architecture guard** | **DL** |
| **Important limitations** | Research interaction types (sweep/taken/reclaim). |

---

### MSL-8 — MSS

| Field | Value |
|-------|--------|
| **Status** | CAUSAL_AT_E |
| **Evaluation boundary** | Snapshot at E. |
| **Known-at** | `knownAtBarIndex` tied to trigger bar. |
| **Future-data protection** | Via snapshot E. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **`researchOnly`** — not signal, entry, or direction. |
| **Architecture guard** | **DM** |
| **Important limitations** | Easily misread; tier-2 UI must keep research-only context. |

---

### MSL-9A — MTF structure alignment

| Field | Value |
|-------|--------|
| **Status** | DESCRIPTIVE_ONLY |
| **Evaluation boundary** | Consumes **7A only**. |
| **Known-at** | Trend context at LTF/HTF eval. |
| **Future-data protection** | Via 7A. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | `DESCRIPTIVE_MTF_STRUCTURE_STATE` — not aligned = not “go trade”. |
| **Architecture guard** | **DN** |
| **Important limitations** | No rebuild of lower layers beyond 7A contract. |

---

### MSL-9B — MTF liquidity alignment

| Field | Value |
|-------|--------|
| **Status** | DESCRIPTIVE_ONLY |
| **Evaluation boundary** | Consumes **7A only**. |
| **Known-at** | Side/lifecycle profiles at eval. |
| **Future-data protection** | Via 7A. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Side/lifecycle enums — observational. |
| **Architecture guard** | **DO** |
| **Important limitations** | Not pool-level identity mapping across TFs. |

---

### MSL-9C — MTF event ordering

| Field | Value |
|-------|--------|
| **Status** | **MIXED** |
| **Evaluation boundary** | Eval relations at LTF/HTF eval timestamps; **replay** relations may use extended E explicitly. |
| **Known-at** | Per-relation timestamps; 7C events as `CROSS_TF_LIQUIDITY_WICK_TOUCH`. |
| **Future-data protection** | Eval subset causal visibility; replay labeled and optional in UI. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **TEMPORAL_ORDERING_ONLY** — not causality, not “confirmed” trades. |
| **Architecture guard** | **DP** |
| **Important limitations** | Calls **7C** internally; does not import 9D/9E builders. |

---

### MSL-9D — HTF liquidity → LTF structure association

| Field | Value |
|-------|--------|
| **Status** | DESCRIPTIVE_ONLY (with visibility causal flags) |
| **Evaluation boundary** | Consumes **9C only**. |
| **Known-at** | `knownAtTimestamp`, `visibleAtEvaluation`. |
| **Future-data protection** | Via 9C eval visibility. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **DESCRIPTIVE_ASSOCIATION_ONLY**. |
| **Architecture guard** | **DQ** |
| **Important limitations** | Ordering relation is not trade sequencing advice. |

---

### MSL-9E — MTF MSS association

| Field | Value |
|-------|--------|
| **Status** | DESCRIPTIVE_ONLY (with visibility causal flags) |
| **Evaluation boundary** | Consumes **9C only**. |
| **Known-at** | Same pattern as 9D. |
| **Future-data protection** | Via 9C. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | **DESCRIPTIVE_ASSOCIATION_ONLY**; MSS remains research-only. |
| **Architecture guard** | **DR** |
| **Important limitations** | Not MSS as signal. |

---

### MSL-9F — Descriptive confluence surface

| Field | Value |
|-------|--------|
| **Status** | DESCRIPTIVE_ONLY |
| **Evaluation boundary** | Orchestrates per-TF builds at each TF’s E; MTF panel from 9A–9E. |
| **Known-at** | Aggregates child metadata; does not invent new known-at rules. |
| **Future-data protection** | Delegates to children; active TFs **4H, 1H** only. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | `confluencePresentationStatus`: **DESCRIPTIVE_CONFLUENCE_ONLY**; flags `no_causality`, `no_scoring`, `no_prediction`. |
| **Architecture guard** | **DS** |
| **Important limitations** | No standalone 7C section (decision MSL-10-DEC-001); merged limitations list is exhaustive not prescriptive. |

---

### MSL-10 — WP2 / WP6 (presentation tranche)

| Field | Value |
|-------|--------|
| **Status** | PRESENTATION_ONLY |
| **Evaluation boundary** | N/A — classifies and displays existing 9F strings/DTOs. |
| **Known-at** | N/A |
| **Future-data protection** | N/A |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Taxonomy and tiers do not add market facts. |
| **Architecture guard** | **DW** |
| **Important limitations** | CORE vs TECHNICAL vs RESEARCH flags dedupe for UX only. |

**WP3 (native HTF research presentation)** is PRESENTATION_ONLY constants on 9F — not parity recomputation.

---

### MSL-11 — Research UI

| Field | Value |
|-------|--------|
| **Status** | PRESENTATION_ONLY |
| **Evaluation boundary** | Consumes 9F via presenter only. |
| **Known-at** | Debug lines display child known-at — no recompute. |
| **Future-data protection** | No MSL builders in presenter/page. |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Forbidden trading tokens enforced in view-model JSON scan. |
| **Architecture guard** | **DT** |
| **Important limitations** | Tier 1 vs tier 2 layout; 15M shown as NOT_ESTABLISHED. |

---

### MSL-12 — Chart overlay

| Field | Value |
|-------|--------|
| **Status** | PRESENTATION_ONLY |
| **Evaluation boundary** | Overlay source from 9F bundle. |
| **Known-at** | N/A |
| **Future-data protection** | N/A |
| **Production** | NOT_ESTABLISHED |
| **Interpretation restrictions** | Visual research aid only. |
| **Architecture guard** | **DU** |
| **Important limitations** | **15M** chart TF: NOT_ESTABLISHED. |

---

### Native HTF parity (DV)

| Field | Value |
|-------|--------|
| **Status** | DATA_TRANSFORM + PRESENTATION_ONLY (report) |
| **Evaluation boundary** | Compare fixtures / aligned buckets — isolated from 9F builder path. |
| **Known-at** | N/A |
| **Future-data protection** | Frozen datasets; no silent feed switch. |
| **Production** | **NATIVE_HTF_PRODUCTION = NOT_ESTABLISHED** |
| **Interpretation restrictions** | Strict field parity **FAILED** (volume); D-VOL-1 normalized tier **ESTABLISHED** for BTC research sample only; semantic parity **ESTABLISHED** (sampled). |
| **Architecture guard** | **DV** |
| **Important limitations** | Does not change MSL-7B; canonical surface remains **DERIVED_1H_4H**. |

---

## Timeframes

| Timeframe | Status |
|-----------|--------|
| **4H, 1H** | ACTIVE in 9F V1 |
| **15M** | **NOT_ESTABLISHED** (metadata, UI, chart blocked) |

---

## Change control

Updates to this matrix require alignment with architecture guards and tests. Stronger trust (e.g. production signal) is **out of MSL-10** scope.
