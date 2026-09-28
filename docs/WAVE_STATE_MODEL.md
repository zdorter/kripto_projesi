# Wave State Model — Checkpoint 3.6 (Tasarım)

**Durum:** Tasarım belgesi. Motor kodu (`analyzeWave`, `WaveAnalysis`) bu aşamada değiştirilmez.  
**Amaç:** `WaveAnalysis` çıktısını, kullanıcının yanlış yorumlamasını engelleyen bir **sunum katmanı (presentation state)** ile ifade etmek.

---

## 1. Mevcut motor çıktısı (gerçek davranış)

`analyzeWave()` şunları üretir:

| Alan | Kaynak | Not |
|------|--------|-----|
| `trend` | `detectTrend(swings)` | Swing HH/HL/LH/LL + son onaylı swing tipi |
| `waves` | `[...impulse, ...corrective]` | Tek düz liste; sıra önce 1–5, sonra A–C |
| `confidence` | `computeConfidence(impulse only)` | 0–100 kural uyumu; corrective dahil değil |
| `currentWave` | `currentWaveLabel(waves)` | Etiket önceliği: C→B→A→5→…→1 |
| `invalidationPrice` | `primaryInvalidationPrice(waves)` | Öncelik: INVALIDATED Wave 2 |
| `alternativeScenarios` | Karşıt **impulse** sayımı | `applyPerWaveConfidence(alt, overall×0.85)` |

`detectWaves` içinde:

- **Impulse:** Seçilen pivot zincirinin son 6 pivotu → dalga 1–5.
- **Corrective:** Aynı zincirde ≥9 pivot → p5–p8 → A–B–C (impulse yönüne bağlı tip şablonu).
- **Alternative:** Bull ve bear impulse skorları; ikisi de ≥5 dalga ise **diğeri** `alternatives`’a girer. Corrective alternatif değildir.

---

## 2. Tasarım ilkesi: üç ayrı “gerçeklik”

Kullanıcıyı korumak için motor çıktısı **üç bağımsız eksende** açıklanmalıdır:

```text
┌─────────────────────────────────────────────────────────┐
│  A) Market Trend     → swing yapısı (detectTrend)       │
│  B) Structure Tracks → IMPULSE vs CORRECTIVE (paralel)    │
│  C) Rival Scenario   → karşıt impulse (alternatives)    │
└─────────────────────────────────────────────────────────┘
```

`currentWave` tek string bu üç ekseni **birleştirip** C’yi 5’in üstüne koyar; bu, Checkpoint 3.5’teki karışıklığın ana nedeni.

**Sunum katmanı** (`WavePresentationState`) motoru değiştirmez; `WaveAnalysis` + `WaveDetectionResult` meta verisini (impulseBullish ayrı export edilmiyorsa türetilir) map eder.

---

## 3. Kavram sözlüğü

| Kavram | Anlamı |
|--------|--------|
| **Market Trend** | Piyasa yapısı özeti (BULLISH / BEARISH / NEUTRAL). Dalga sayımı değil. |
| **Structure (yapı)** | `IMPULSE` (1–5) veya `CORRECTIVE` (A–B–C). Aynı pivot zincirinde **paralel** iki sayım katmanı. |
| **Scenario (senaryo)** | `SELECTED` (skor+trend ile seçilen impulse) veya `RIVAL` (`alternativeScenarios[0]`). |
| **Wave (dalga)** | Etiket: `1`…`5` veya `A`…`C`. |
| **Leg (bacak)** | Tek `WaveCandidate`: `startIndex`, `endIndex`, `status`, `confidence`, vb. |
| **Rule conformance** | `confidence` alanının UI’daki adı; olasılık değildir. |

---

## 4. Önerilen tip: `WavePresentationState`

```typescript
type StructureKind = "IMPULSE" | "CORRECTIVE";
type ScenarioKind = "SELECTED" | "RIVAL";
type TrendAlignment = "ALIGNED" | "CONFLICTING" | "NEUTRAL_CONTEXT";

interface WaveLegView {
  structure: StructureKind;
  scenario: ScenarioKind; // CORRECTIVE için yalnızca SELECTED
  label: WaveLabel;
  startIndex: number;
  endIndex: number;
  status: WaveStatus;
  confidence: number; // per-wave (applyPerWaveConfidence)
  structureConflict?: boolean;
  invalidationPrice?: number; // yalnızca bu bacakta set ise
}

interface StructureTrackView {
  kind: StructureKind;
  scenario: ScenarioKind;
  /** impulseBullish veya rival bear/bull */
  countDirection: "BULLISH" | "BEARISH";
  legs: WaveLegView[];
  /** Bu track içinde “önde” olan dalga (bkz. §6) */
  leading: {
    label: WaveLabel;
    status: WaveStatus;
    confidence: number;
    startIndex: number;
    endIndex: number;
  } | null;
  /** Track için üst skor: impulse → overallConfidence; rival → overall×0.85 */
  structureConformanceScore: number;
  invalidation: {
    price?: number;
    sourceLabel?: WaveLabel;
    reason?: "WAVE2_BREAK" | "OTHER";
  } | null;
}

interface SegmentOverlapView {
  startIndex: number;
  endIndex: number;
  legs: Array<{
    structure: StructureKind;
    scenario: ScenarioKind;
    label: WaveLabel;
    status: WaveStatus;
  }>;
}

interface WavePresentationState {
  schemaVersion: "1.0";

  marketTrend: TrendDirection;

  /** Motor `confidence` — yalnızca SELECTED impulse üzerinden */
  ruleConformanceScore: number;
  scoreDisclaimer: "RULE_CONFORMANCE_NOT_PROBABILITY";

  trendContext: {
    alignment: TrendAlignment;
    /** impulseBullish vs marketTrend ilişkisi (confidence.trendAlignmentScore mantığı) */
    note?: string;
  };

  /** UI “Primary” — kullanıcı odağı (§7) */
  primary: FocusView;

  /** UI “Alternative” — ikincil odak (§7); her zaman rival impulse değildir */
  alternative: FocusView | null;

  /** Tam şeffaflık: iki yapı track’i + isteğe bağlı rival */
  tracks: {
    selectedImpulse: StructureTrackView;
    corrective: StructureTrackView | null;
    rivalImpulse: StructureTrackView | null;
  };

  overlaps: SegmentOverlapView[];

  /** Ham motor çıktısı (debug / ileri kullanıcı) */
  engine?: {
    currentWaveLegacy?: WaveLabel;
    flatWaves: WaveCandidate[];
  };
}

interface FocusView {
  structure: StructureKind;
  scenario: ScenarioKind;
  wave: WaveLabel;
  status: WaveStatus;
  confidence: number;
  startIndex: number;
  endIndex: number;
  invalidationPrice?: number;
  /** Neden bu odak seçildi (kısa makine-okur açıklama) */
  selectionReason: string;
}
```

---

## 5. Sorular A–J

### A) IMPULSE ve CORRECTIVE aynı seviyede mi?

**Evet — sunum modelinde eşit “structure track”**. Motor zaten aynı `selectPivotChain` üzerinde ikisini de üretir. Biri diğerinin JSON alt nesnesi değil; **kardeş track**. Impulse önce seçilir (skor), corrective aynı zincirin uzantısıdır.

### B) Biri diğerinin alt yapısı olabilir mi?

**Elliott anlamında** corrective, impulse sonrası faz olabilir; **kod bunu faz geçişi olarak işaretlemez**. Tasarımda:

- `tracks.selectedImpulse` = motive sayımı
- `tracks.corrective` = düzeltme sayımı (varsa)

Zaman ekseninde corrective pivotları impulse’tan **sonra** gelir; bu **sıralama** `legs[].endIndex` ile gösterilir, hiyerarşik `parentWaveId` yok.

### C) Wave 5 ve Wave C aynı segmenti paylaşırsa?

**Segment paylaşımı normaldir** (9 pivotlu zincirde impulse son bacak = p7→p8, C = p7→p8).

State ifadesi:

1. `overlaps[]` içinde tek kayıt: `{ startIndex, endIndex, legs: [{IMPULSE,5,POTENTIAL}, {CORRECTIVE,C,CONFIRMED}] }`
2. **Aynı `currentWave` string’i kullanılmaz**
3. UI metni: *“Aynı fiyat hareketi iki sayım katmanında yorumlanıyor.”*

### D) Current Wave — CONFIRMED / POTENTIAL ayrımı?

`currentWaveLabel()` **status görmez**. Yerine **track içi leading leg** kuralı:

1. Track’te `INVALIDATED` olmayan bacaklar.
2. En büyük `endIndex` (en güncel bacak).
3. Eşitlikte: `CONFIRMED` > `POTENTIAL`.
4. Hâlâ eşitlikte: corrective track’te C>B>A; impulse’ta 5>4>…>1.

**Global** C>5 önceliği **kaldırılır**; öncelik yalnızca **focus seçimi** için (§7).

### E) Trend hangi seviyeyi temsil ediyor?

**Market Trend** = yalnızca `detectTrend`: son iki tepe + son iki dip yapısı ve son onaylı swing tipi. **Dalga fazını temsil etmez** (Wave 5 veya C değil).

### F) Trend ile wave arasında zorunlu tutarlılık?

**Motor zorunlu kılmaz; sunum katmanı uyarı üretir, veriyi düzeltmez.**

```typescript
trendContext.alignment =
  (impulseBullish && trend === "BULLISH") || (!impulseBullish && trend === "BEARISH")
    ? "ALIGNED"
    : trend === "NEUTRAL"
      ? "NEUTRAL_CONTEXT"
      : "CONFLICTING";
```

UI: `CONFLICTING` iken trend rozeti ile wave track yönü ayrı gösterilir; otomatik eşleştirme yapılmaz.

### G) Primary ve Alternative hangi koşulla?

**Motor `alternativeScenarios` ≠ UI Primary/Alternative.**

| UI alanı | Önerilen kural (demo davranışıyla uyumlu) |
|----------|-------------------------------------------|
| **primary** | İki track’in `leading` bacaklarından **daha ileri** olan: önce `endIndex`, sonra `CONFIRMED` > `POTENTIAL`. Çoğu 9-pivot demoda corrective `C` CONFIRMED @18, impulse `5` POTENTIAL @18 → primary = CORRECTIVE / C. |
| **alternative** | Diğer track’in aynı tail’deki leading bacak (ör. IMPULSE / 5 / POTENTIAL). `confidence` = ilgili bacak `confidence`. |

**Rival impulse** (`alternativeScenarios`):

- Üçüncü bir blok: `tracks.rivalImpulse`
- UI’da **“Alternatif sayım (karşı yön impulse)”** başlığı; primary/alternative focus ile karıştırılmaz
- Varsa: `rivalImpulse.leading`, `structureConformanceScore = round(overall × 0.85)`

Öncelik sırası UI’da:

1. Focus pair (impulse track vs corrective track)
2. Rival impulse (ayrı kart)

### H) Invalidation hangi senaryoya ait?

**Evet, scope zorunlu.**

| Kaynak | Scope |
|--------|--------|
| Wave 2 break | `structure: IMPULSE`, `scenario: SELECTED` veya `RIVAL`, `sourceLabel: "2"` |
| `primaryInvalidationPrice` bugün tüm `waves` listesinde arar | Sunumda: önce selected impulse, sonra rival, corrective’te varsa ayrı |

`primary.invalidationPrice` yalnızca **primary focus’un track’i** için hesaplanır; rival impulse INVALIDATED Wave 2 ayrı `tracks.rivalImpulse.invalidation` altında.

### I) UI için gerekli alanlar

**Üst banner**

- `marketTrend`
- `ruleConformanceScore` + disclaimer
- `trendContext.alignment` (ikon/uyarı)

**Kart: Primary focus**

- structure, wave, status, confidence, invalidation, `selectionReason`
- `startIndex`–`endIndex` (bar veya zaman)

**Kart: Alternative focus** (focus pair)

- Aynı alanlar; overlap varsa “shared segment” linki

**Kart: Selected impulse track** (1–5 tablo)

**Kart: Corrective track** (A–C) veya “Yok”

**Kart: Rival impulse** (varsa)

**Overlap şeridi**

- `overlaps[]` görselleştirme

**Gizle / göster**

- `engine.currentWaveLegacy` (geliştirici)

### J) JSON API için gerekli alanlar

**Minimum (mobil/istemci):**

```json
{
  "schemaVersion": "1.0",
  "marketTrend": "BEARISH",
  "ruleConformanceScore": 68,
  "scoreDisclaimer": "RULE_CONFORMANCE_NOT_PROBABILITY",
  "trendContext": { "alignment": "CONFLICTING", "note": "..." },
  "primary": { ... },
  "alternative": { ... },
  "overlaps": [ ... ]
}
```

**Tam (dashboard):**

- `tracks.selectedImpulse`, `tracks.corrective`, `tracks.rivalImpulse`
- `engine.flatWaves` (opsiyonel debug)

**Stabil sözleşme:** `schemaVersion` artışı; `currentWave` deprecated alias (`primary.wave` + uyarı).

---

## 6. Leading leg seçimi (track içi)

```
function leadingLeg(track: WaveLegView[]): Leading | null
  candidates = track.filter(l => l.status !== "INVALIDATED")
  if empty return null
  sort by endIndex desc, then statusRank(CONFIRMED=2, POTENTIAL=1), then labelRank
  return first
```

Label rank impulse: 5>4>3>2>1; corrective: C>B>A.

---

## 7. Primary / Alternative focus (özet algoritma)

```
impulseLead = leadingLeg(selectedImpulse.legs)
corrLead = corrective ? leadingLeg(corrective.legs) : null

if corrLead && impulseLead:
  primary = argmax by (endIndex, statusRank, structureRank)
    // structureRank: tie-break yoksa CORRECTIVE öncelikli DEĞİL — sadece endIndex/status
    // Demo: endIndex eşit → CONFIRMED (C) beats POTENTIAL (5) → primary = CORRECTIVE C
  alternative = other track's lead at tail (impulse 5)
else if impulseLead:
  primary = impulseLead; alternative = null
else if corrLead:
  primary = corrLead; alternative = null
else:
  primary = empty state
```

`selectionReason` örnekleri:

- `"CORRECTIVE leading leg C is CONFIRMED at same end as IMPULSE 5 POTENTIAL"`
- `"Only SELECTED impulse track available"`

---

## 8. Demo çıktısı mapping (Checkpoint 3 browser)

| Sunum alanı | Değer | Türetim |
|-------------|-------|---------|
| marketTrend | BEARISH | `trend` |
| ruleConformanceScore | 68 | `confidence` |
| primary.structure | CORRECTIVE | focus kuralı |
| primary.wave | C | corrective leading |
| primary.status | CONFIRMED | bacak status |
| primary.confidence | ~68 | `round(68 × 1.0)` |
| alternative.structure | IMPULSE | diğer track |
| alternative.wave | 5 | impulse leading |
| alternative.status | POTENTIAL | W5 kuralı |
| alternative.confidence | ~48 | `round(68 × 0.7)` |
| rivalImpulse | (varsa) | `alternativeScenarios[0]` — ayrı kart |

---

## 9. Map fonksiyonu (gelecek implementasyon — şimdi yok)

```text
WaveAnalysis + { impulseBullish, impulse, corrective, alternatives }
        → mapToPresentationState()
        → WavePresentationState
```

`impulseBullish` bugün `WaveAnalysis`’te yok; map için `detectWaves` sonucunun adapter’da tutulması gerekir (Checkpoint 4+).

---

## 10. Cevap: Binance’te tek `currentWave` yerine ne?

**Kullanıcıyı yanlış yönlendirmemek için** canlı veri şu modelle temsil edilmelidir:

1. **`marketTrend`** — swing yapısı; “piyasa rejimi” etiketi.
2. **İki paralel structure track** — `selectedImpulse` (1–5) ve `corrective` (A–C); birleştirilmiş liste veya tek `currentWave` **birincil UI göstergesi olmamalı**.
3. **`primary` / `alternative` focus pair** — aynı segmentte çift yorum varsa açıkça iki kart; `overlaps[]` ile.
4. **`ruleConformanceScore`** — adı ve disclaimer ile; “Primary Confidence” bu skor veya bacak skoru; olasılık değil.
5. **`tracks.rivalImpulse`** — motor `alternativeScenarios`; “Alternatif **yön** impulse” olarak ayrı; focus pair ile karıştırılmamalı.
6. **`trendContext.alignment`** — trend ile seçilen impulse yönü çelişiyorsa uyarı; otomatik düzeltme yok.
7. **Scope’lu `invalidation`** — hangi track/senaryo/dalga için geçerli.
8. **`currentWave` (legacy)** — yalnızca geriye dönük alias; dokümantasyonda deprecated.

Özet cümle:

> **“Şu an piyasada swing trendi X; seçilen impulse sayımında önde Y (durum Z); düzeltme sayımında önde W; aynı son bacakta çakışma varsa iki yorum birlikte gösterilir; karşı yönlü impulse alternatifi ayrıdır; skor kural uyumudur, işlem olasılığı değildir.”**

Bu cümle `WavePresentationState` ile yapılandırılmış veriye karşılık gelir; tek bir `currentWave: "C"` string’i bu bilginin çoğunu gizler ve Wave 5 / trend / rival impulse ile çelişkili izlenim verir.
