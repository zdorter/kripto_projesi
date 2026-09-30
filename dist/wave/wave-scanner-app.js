// src/providers/binance-ohlcv.ts
var BINANCE_FUTURES_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
var BINANCE_FUTURES_INTERVALS = /* @__PURE__ */ new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
]);
var MIN_LIMIT = 1;
var MAX_LIMIT = 1e3;
function validateOhlcvRequest(symbol, interval, limit) {
  const sym = String(symbol ?? "").trim().toUpperCase();
  if (!sym) {
    throw new Error("symbol must not be empty");
  }
  if (!/^[A-Z0-9]{2,20}$/.test(sym)) {
    throw new Error(`invalid symbol: ${symbol}`);
  }
  const intv = String(interval ?? "").trim();
  if (!BINANCE_FUTURES_INTERVALS.has(intv)) {
    throw new Error(`invalid interval: ${interval}`);
  }
  const lim = Math.floor(Number(limit));
  if (!Number.isFinite(lim) || lim < MIN_LIMIT || lim > MAX_LIMIT) {
    throw new Error(`limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
  }
  return { symbol: sym, interval: intv, limit: lim };
}
function parseNumber(value, field) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid numeric field: ${field}`);
  }
  return n;
}
function parseBinanceKlineRow(row) {
  if (!Array.isArray(row) || row.length < 7) {
    throw new Error("malformed kline row");
  }
  const openTime = parseNumber(row[0], "openTime");
  const open = parseNumber(row[1], "open");
  const high = parseNumber(row[2], "high");
  const low = parseNumber(row[3], "low");
  const close = parseNumber(row[4], "close");
  const volume = parseNumber(row[5], "volume");
  const closeTime = parseNumber(row[6], "closeTime");
  return {
    closeTime,
    candle: {
      time: openTime,
      open,
      high,
      low,
      close,
      volume
    }
  };
}
function mapBinanceKlinesResponse(data) {
  if (!Array.isArray(data)) {
    if (data && typeof data === "object" && "code" in data && "msg" in data) {
      const err = data;
      throw new Error(`Binance API error ${err.code}: ${err.msg}`);
    }
    throw new Error("expected klines array response");
  }
  if (data.length === 0) {
    throw new Error("empty klines response");
  }
  return data.map((row) => parseBinanceKlineRow(row));
}
function filterClosedKlines(rows, nowMs = Date.now()) {
  const closed = rows.filter((r) => r.closeTime <= nowMs);
  if (closed.length === 0) {
    throw new Error("no closed candles after filtering open kline");
  }
  return normalizeCandleOrder(closed.map((r) => r.candle));
}
function normalizeCandleOrder(candles) {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time < sorted[i - 1].time) {
      throw new Error("candle ordering could not be normalized");
    }
  }
  return sorted;
}
function buildBinanceFuturesKlinesUrl(symbol, interval, limit) {
  const v = validateOhlcvRequest(symbol, interval, limit);
  const params = new URLSearchParams({
    symbol: v.symbol,
    interval: v.interval,
    limit: String(v.limit)
  });
  return `${BINANCE_FUTURES_KLINES_URL}?${params.toString()}`;
}
async function fetchBinanceFuturesKlines(symbol, interval, limit, options) {
  const v = validateOhlcvRequest(symbol, interval, limit);
  const fetchFn = options?.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch is not available");
  }
  const url = buildBinanceFuturesKlinesUrl(v.symbol, v.interval, v.limit);
  const res = await fetchFn(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "msg" in body) {
        detail = String(body.msg);
      }
    } catch {
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  const json = await res.json();
  const parsed = mapBinanceKlinesResponse(json);
  return filterClosedKlines(parsed, options?.nowMs ?? Date.now());
}
var BinanceFuturesOhlcvProvider = class {
  constructor(fetchFn = globalThis.fetch.bind(globalThis)) {
    this.fetchFn = fetchFn;
  }
  getCandles(symbol, interval, limit) {
    return fetchBinanceFuturesKlines(symbol, interval, limit, {
      fetchFn: this.fetchFn
    });
  }
};

// src/wave/fibonacci.ts
var FIB_RETRACEMENT_LEVELS = [0.382, 0.5, 0.618, 0.786];
var FIB_EXTENSION_LEVELS = [1, 1.272, 1.618];
function fibRetracementPrice(start, end, level) {
  const range = end - start;
  return end - range * level;
}
function fibExtensionPrice(start, end, level) {
  const range = end - start;
  return end + range * (level - 1);
}
var RETRACE_TOLERANCE = 0.08;
var EXTENSION_TOLERANCE = 0.1;
function nearestFibMatch(start, end, actual, _bullishMove) {
  const absRange = Math.abs(end - start);
  if (absRange <= 0) {
    return null;
  }
  let best = null;
  for (const level of FIB_RETRACEMENT_LEVELS) {
    const ideal = fibRetracementPrice(start, end, level);
    const dist = Math.abs(actual - ideal) / absRange;
    if (dist <= RETRACE_TOLERANCE) {
      if (!best || dist < best.distanceRatio) {
        best = { level, kind: "retracement", distanceRatio: dist };
      }
    }
  }
  for (const level of FIB_EXTENSION_LEVELS) {
    const ideal = fibExtensionPrice(start, end, level);
    const dist = Math.abs(actual - ideal) / absRange;
    if (dist <= EXTENSION_TOLERANCE) {
      if (!best || dist < best.distanceRatio) {
        best = { level, kind: "extension", distanceRatio: dist };
      }
    }
  }
  return best;
}
function fibConformanceScore(match) {
  if (!match) {
    return 0;
  }
  const tolerance = match.kind === "retracement" ? RETRACE_TOLERANCE : EXTENSION_TOLERANCE;
  const normalized = 1 - match.distanceRatio / tolerance;
  return Math.max(0, Math.min(1, normalized));
}

// src/wave/trend-detector.ts
function classifyHighStructure(previous, current) {
  return current.price > previous.price ? "HH" : "LH";
}
function classifyLowStructure(previous, current) {
  return current.price > previous.price ? "HL" : "LL";
}
function detectMarketStructures(swings) {
  const structures = [];
  const highs = swings.filter((s) => s.type === "HIGH" && s.confirmed);
  const lows = swings.filter((s) => s.type === "LOW" && s.confirmed);
  for (let i = 1; i < highs.length; i++) {
    structures.push(classifyHighStructure(highs[i - 1], highs[i]));
  }
  for (let i = 1; i < lows.length; i++) {
    structures.push(classifyLowStructure(lows[i - 1], lows[i]));
  }
  return structures;
}
function detectTrend(swings) {
  const highs = swings.filter((s) => s.type === "HIGH" && s.confirmed);
  const lows = swings.filter((s) => s.type === "LOW" && s.confirmed);
  if (highs.length < 2 || lows.length < 2) {
    return "NEUTRAL";
  }
  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];
  const highStructure = classifyHighStructure(prevHigh, lastHigh);
  const lowStructure = classifyLowStructure(prevLow, lastLow);
  const confirmed = swings.filter((s) => s.confirmed);
  const lastSwing = confirmed[confirmed.length - 1];
  if (highStructure === "HH" && lowStructure === "HL" && lastSwing.type === "HIGH") {
    return "BULLISH";
  }
  if (highStructure === "LH" && lowStructure === "LL" && lastSwing.type === "LOW") {
    return "BEARISH";
  }
  return "NEUTRAL";
}

// src/wave/confidence.ts
var CONFIDENCE_WEIGHTS = {
  structure: 40,
  fibonacci: 15,
  trend: 15,
  momentum: 10,
  volume: 10,
  swingQuality: 10
};
var TOTAL_WEIGHT = CONFIDENCE_WEIGHTS.structure + CONFIDENCE_WEIGHTS.fibonacci + CONFIDENCE_WEIGHTS.trend + CONFIDENCE_WEIGHTS.momentum + CONFIDENCE_WEIGHTS.volume + CONFIDENCE_WEIGHTS.swingQuality;
function averageSwingStrength(swings, waves) {
  if (waves.length === 0) {
    return 0;
  }
  const indices = /* @__PURE__ */ new Set();
  waves.forEach((w) => {
    indices.add(w.startIndex);
    indices.add(w.endIndex);
  });
  const relevant = swings.filter((s) => indices.has(s.index));
  if (relevant.length === 0) {
    return 0;
  }
  const sum = relevant.reduce((a, s) => a + s.strength, 0);
  return sum / relevant.length;
}
function structureScore(waves) {
  if (waves.length === 0) {
    return 0;
  }
  let score = 1;
  const invalidated = waves.filter((w) => w.status === "INVALIDATED").length;
  const conflicts = waves.filter((w) => w.structureConflict).length;
  score -= invalidated * 0.35;
  score -= conflicts * 0.15;
  return Math.max(0, Math.min(1, score));
}
function trendAlignmentScore(trend, impulseBullish) {
  if (trend === "NEUTRAL") {
    return 0.5;
  }
  if (impulseBullish && trend === "BULLISH") {
    return 1;
  }
  if (!impulseBullish && trend === "BEARISH") {
    return 1;
  }
  return 0.2;
}
function fibonacciScore(candles, waves, impulseBullish) {
  const wave2 = waves.find((w) => w.label === "2");
  const wave1 = waves.find((w) => w.label === "1");
  if (!wave1 || !wave2) {
    return 0.3;
  }
  const start = impulseBullish ? candles[wave1.startIndex].low : candles[wave1.startIndex].high;
  const end = impulseBullish ? candles[wave1.endIndex].high : candles[wave1.endIndex].low;
  const actual = impulseBullish ? candles[wave2.endIndex].low : candles[wave2.endIndex].high;
  const match = nearestFibMatch(start, end, actual, impulseBullish);
  const base = fibConformanceScore(match);
  return base > 0 ? base : 0.25;
}
function momentumScore(candles, waves) {
  const w3 = waves.find((w) => w.label === "3");
  const w1 = waves.find((w) => w.label === "1");
  if (!w1 || !w3) {
    return 0.4;
  }
  const len1 = Math.abs(
    candles[w1.endIndex].close - candles[w1.startIndex].close
  );
  const len3 = Math.abs(
    candles[w3.endIndex].close - candles[w3.startIndex].close
  );
  if (len1 <= 0) {
    return 0.4;
  }
  const ratio = len3 / len1;
  if (ratio >= 1.618) {
    return 1;
  }
  if (ratio >= 1) {
    return 0.75;
  }
  if (ratio >= 0.8) {
    return 0.5;
  }
  return 0.25;
}
function volumeScore(candles, waves) {
  const w3 = waves.find((w) => w.label === "3");
  if (!w3) {
    return 0.5;
  }
  const slice = candles.slice(w3.startIndex, w3.endIndex + 1);
  if (slice.length < 2) {
    return 0.5;
  }
  const waveVol = slice.reduce((a, c) => a + c.volume, 0) / slice.length;
  const priorStart = Math.max(0, w3.startIndex - slice.length);
  const prior = candles.slice(priorStart, w3.startIndex);
  if (prior.length === 0) {
    return 0.5;
  }
  const priorVol = prior.reduce((a, c) => a + c.volume, 0) / prior.length;
  if (priorVol <= 0) {
    return 0.5;
  }
  const ratio = waveVol / priorVol;
  if (ratio >= 1.2) {
    return 1;
  }
  if (ratio >= 0.9) {
    return 0.6;
  }
  return 0.35;
}
function computeConfidence(inputs) {
  const {
    candles,
    swings,
    waves,
    trend,
    impulseBullish
  } = inputs;
  const structure = structureScore(waves);
  const fibonacci = fibonacciScore(candles, waves, impulseBullish);
  const trendScore = trendAlignmentScore(trend, impulseBullish);
  const momentum = momentumScore(candles, waves);
  const volume = volumeScore(candles, waves);
  const swingQuality = averageSwingStrength(swings, waves) / 100;
  const weighted = structure * CONFIDENCE_WEIGHTS.structure + fibonacci * CONFIDENCE_WEIGHTS.fibonacci + trendScore * CONFIDENCE_WEIGHTS.trend + momentum * CONFIDENCE_WEIGHTS.momentum + volume * CONFIDENCE_WEIGHTS.volume + swingQuality * CONFIDENCE_WEIGHTS.swingQuality;
  const score = weighted / TOTAL_WEIGHT * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}
function applyPerWaveConfidence(waves, overall) {
  return waves.map((w) => {
    let factor = 1;
    if (w.status === "INVALIDATED") {
      factor = 0.35;
    } else if (w.status === "POTENTIAL") {
      factor = 0.7;
    }
    if (w.structureConflict) {
      factor *= 0.85;
    }
    const confidence = Math.round(
      Math.max(0, Math.min(100, overall * factor))
    );
    return { ...w, confidence };
  });
}

// src/wave/types.ts
var DEFAULT_SWING_CONFIG = {
  leftBars: 5,
  rightBars: 5,
  atrPeriod: 14,
  minAtrMultiplier: 0.5
};

// src/wave/swing-detector.ts
function mergeSwingConfig(partial) {
  return { ...DEFAULT_SWING_CONFIG, ...partial };
}
function trueRange(candles, index) {
  if (index <= 0) {
    return candles[index].high - candles[index].low;
  }
  const prevClose = candles[index - 1].close;
  const c = candles[index];
  return Math.max(
    c.high - c.low,
    Math.abs(c.high - prevClose),
    Math.abs(c.low - prevClose)
  );
}
function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(0);
  if (candles.length === 0 || period < 1) {
    return atr;
  }
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = trueRange(candles, i);
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        atr[i] = sum / period;
      }
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atr;
}
function isPivotHigh(candles, index, leftBars, rightBars) {
  const h = candles[index].high;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    if (j < 0 || j >= candles.length) return false;
    if (candles[j].high >= h) return false;
  }
  return true;
}
function isPivotLow(candles, index, leftBars, rightBars) {
  const l = candles[index].low;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    if (j < 0 || j >= candles.length) return false;
    if (candles[j].low <= l) return false;
  }
  return true;
}
function pivotProminence(candles, index, type, leftBars, rightBars) {
  if (type === "HIGH") {
    let minSurrounding = Infinity;
    for (let j = index - leftBars; j <= index + rightBars; j++) {
      if (j === index) continue;
      minSurrounding = Math.min(minSurrounding, candles[j].high);
    }
    return candles[index].high - minSurrounding;
  }
  let maxSurrounding = -Infinity;
  for (let j = index - leftBars; j <= index + rightBars; j++) {
    if (j === index) continue;
    maxSurrounding = Math.max(maxSurrounding, candles[j].low);
  }
  return maxSurrounding - candles[index].low;
}
function computeSwingStrength(prominence, atrAtPivot, minAtrMultiplier) {
  if (!isFinite(prominence) || prominence <= 0) {
    return 0;
  }
  const floor = Math.max(atrAtPivot * minAtrMultiplier, 1e-12);
  const ratio = prominence / floor;
  const scaled = Math.min(1, ratio / 3) * 100;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}
function detectSwings(candles, configPartial) {
  const config = mergeSwingConfig(configPartial);
  const { leftBars, rightBars, atrPeriod, minAtrMultiplier } = config;
  const swings = [];
  if (candles.length < leftBars + rightBars + 1) {
    return swings;
  }
  const atrSeries = computeAtrSeries(candles, atrPeriod);
  for (let i = leftBars; i <= candles.length - 1 - rightBars; i++) {
    const confirmed = i + rightBars < candles.length;
    const atrAt = atrSeries[i] > 0 ? atrSeries[i] : trueRange(candles, i);
    if (isPivotHigh(candles, i, leftBars, rightBars)) {
      const prominence = pivotProminence(
        candles,
        i,
        "HIGH",
        leftBars,
        rightBars
      );
      if (prominence < atrAt * minAtrMultiplier) {
        continue;
      }
      const strength = computeSwingStrength(
        prominence,
        atrAt,
        minAtrMultiplier
      );
      swings.push({
        index: i,
        time: candles[i].time,
        price: candles[i].high,
        type: "HIGH",
        strength,
        confirmed
      });
    } else if (isPivotLow(candles, i, leftBars, rightBars)) {
      const prominence = pivotProminence(
        candles,
        i,
        "LOW",
        leftBars,
        rightBars
      );
      if (prominence < atrAt * minAtrMultiplier) {
        continue;
      }
      const strength = computeSwingStrength(
        prominence,
        atrAt,
        minAtrMultiplier
      );
      swings.push({
        index: i,
        time: candles[i].time,
        price: candles[i].low,
        type: "LOW",
        strength,
        confirmed
      });
    }
  }
  return swings.sort((a, b) => a.index - b.index);
}

// src/wave/wave-detector.ts
var IMPULSE_LABELS = ["1", "2", "3", "4", "5"];
var CORRECTIVE_LABELS = ["A", "B", "C"];
var WAVE3_MIN_EXPANSION_RATIO = 0.8;
function wave2StructuralInvalidationPrice(wave1Origin) {
  return wave1Origin;
}
function applyWave2InvalidationRule(waves, wave1Origin, wave2End, bullish) {
  const w2 = waves.find((w) => w.label === "2");
  if (!w2) {
    return;
  }
  const boundary = wave2StructuralInvalidationPrice(wave1Origin);
  w2.invalidationPrice = boundary;
  const breached = bullish ? wave2End < boundary : wave2End > boundary;
  if (breached) {
    w2.status = "INVALIDATED";
  }
}
function mergeSameTypeSwings(swings) {
  if (swings.length === 0) {
    return [];
  }
  const out = [swings[0]];
  for (let i = 1; i < swings.length; i++) {
    const prev = out[out.length - 1];
    const cur = swings[i];
    if (prev.type !== cur.type) {
      out.push(cur);
      continue;
    }
    if (cur.type === "HIGH") {
      if (cur.price >= prev.price) {
        out[out.length - 1] = cur;
      }
    } else if (cur.price <= prev.price) {
      out[out.length - 1] = cur;
    }
  }
  return out;
}
function swingPriceAt(swing) {
  return swing.price;
}
function segmentStatus(start, end) {
  if (start.confirmed && end.confirmed) {
    return "CONFIRMED";
  }
  return "POTENTIAL";
}
function buildImpulseFromPivots(pivots, bullish) {
  if (pivots.length < 6) {
    return [];
  }
  const [p0, p1, p2, p3, p4, p5] = pivots.slice(-6);
  const waves = [];
  const pushWave = (label, start, end, extra) => {
    waves.push({
      label,
      startIndex: start.index,
      endIndex: end.index,
      confidence: 0,
      status: segmentStatus(start, end),
      ...extra
    });
  };
  pushWave("1", p0, p1);
  pushWave("2", p1, p2);
  pushWave("3", p2, p3);
  pushWave("4", p3, p4);
  pushWave("5", p4, p5);
  const w1Start = swingPriceAt(p0);
  const w1End = swingPriceAt(p1);
  const w2End = swingPriceAt(p2);
  applyWave2InvalidationRule(waves, w1Start, w2End, bullish);
  if (bullish) {
    const wave1Len = w1End - w1Start;
    const wave3Len = swingPriceAt(p3) - w2End;
    const w3 = waves.find((w) => w.label === "3");
    if (w3 && wave1Len > 0 && wave3Len < wave1Len * WAVE3_MIN_EXPANSION_RATIO) {
      w3.status = "POTENTIAL";
    }
    const wave1High = w1End;
    const w4End = swingPriceAt(p4);
    const w4 = waves.find((w) => w.label === "4");
    if (w4 && w4End < wave1High) {
      w4.structureConflict = true;
    }
    const w5 = waves.find((w) => w.label === "5");
    if (w5 && swingPriceAt(p5) <= swingPriceAt(p3)) {
      w5.status = "POTENTIAL";
    }
  } else {
    const wave1Len = w1Start - w1End;
    const wave3Len = w2End - swingPriceAt(p3);
    const w3 = waves.find((w) => w.label === "3");
    if (w3 && wave1Len > 0 && wave3Len < wave1Len * WAVE3_MIN_EXPANSION_RATIO) {
      w3.status = "POTENTIAL";
    }
    const wave1Low = w1End;
    const w4End = swingPriceAt(p4);
    const w4 = waves.find((w) => w.label === "4");
    if (w4 && w4End > wave1Low) {
      w4.structureConflict = true;
    }
    const w5 = waves.find((w) => w.label === "5");
    if (w5 && swingPriceAt(p5) >= swingPriceAt(p3)) {
      w5.status = "POTENTIAL";
    }
  }
  return waves;
}
function buildCorrectiveFromPivots(pivots, bullishImpulse) {
  if (pivots.length < 9) {
    return [];
  }
  const slice = pivots.slice(-9);
  const [p5, p6, p7, p8] = [slice[5], slice[6], slice[7], slice[8]];
  const expectedTypes = bullishImpulse ? ["HIGH", "LOW", "HIGH", "LOW"] : ["LOW", "HIGH", "LOW", "HIGH"];
  const seq = [p5, p6, p7, p8];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].type !== expectedTypes[i]) {
      return [];
    }
  }
  const waves = [];
  waves.push({
    label: "A",
    startIndex: p5.index,
    endIndex: p6.index,
    confidence: 0,
    status: segmentStatus(p5, p6)
  });
  waves.push({
    label: "B",
    startIndex: p6.index,
    endIndex: p7.index,
    confidence: 0,
    status: segmentStatus(p6, p7)
  });
  waves.push({
    label: "C",
    startIndex: p7.index,
    endIndex: p8.index,
    confidence: 0,
    status: segmentStatus(p7, p8)
  });
  return waves;
}
function selectPivotChain(swings, bullish) {
  const confirmed = swings.filter((s) => s.confirmed);
  const merged = mergeSameTypeSwings(confirmed);
  const wantStart = bullish ? "LOW" : "HIGH";
  let startIdx = merged.findIndex((s) => s.type === wantStart);
  if (startIdx < 0) {
    return [];
  }
  const chain = [];
  let expect = wantStart;
  for (let i = startIdx; i < merged.length; i++) {
    if (merged[i].type === expect) {
      chain.push(merged[i]);
      expect = expect === "LOW" ? "HIGH" : "LOW";
    }
  }
  return chain;
}
function tryImpulse(swings, bullish) {
  const chain = selectPivotChain(swings, bullish);
  return buildImpulseFromPivots(chain, bullish);
}
function tryCorrective(swings, impulseBullish) {
  const chain = selectPivotChain(swings, impulseBullish);
  return buildCorrectiveFromPivots(chain, impulseBullish);
}
function scoreImpulse(waves) {
  if (waves.length < 5) {
    return -1;
  }
  let score = 0;
  waves.forEach((w) => {
    if (w.status === "CONFIRMED") score += 2;
    if (w.status === "POTENTIAL") score += 1;
    if (w.status === "INVALIDATED") score -= 4;
    if (w.structureConflict) score -= 1;
  });
  return score;
}
function detectWaves(_candles, swings, trend) {
  const bullishImpulse = tryImpulse(swings, true);
  const bearishImpulse = tryImpulse(swings, false);
  let impulseBullish = true;
  let impulse = bullishImpulse;
  const bullScore = scoreImpulse(bullishImpulse);
  const bearScore = scoreImpulse(bearishImpulse);
  if (bearScore > bullScore) {
    impulse = bearishImpulse;
    impulseBullish = false;
  } else if (bullScore === bearScore && trend === "BEARISH") {
    impulse = bearishImpulse;
    impulseBullish = false;
  }
  const alternatives = [];
  if (bullishImpulse.length >= 5 && bearishImpulse.length >= 5) {
    if (impulseBullish) {
      alternatives.push(bearishImpulse);
    } else {
      alternatives.push(bullishImpulse);
    }
  }
  const corrective = tryCorrective(swings, impulseBullish);
  return {
    impulse,
    corrective,
    alternatives,
    impulseBullish
  };
}
function currentWaveLabel(waves) {
  const ordered = [...IMPULSE_LABELS, ...CORRECTIVE_LABELS];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const label = ordered[i];
    const w = waves.find((x) => x.label === label);
    if (w && w.status !== "INVALIDATED") {
      return label;
    }
  }
  return waves.length > 0 ? waves[waves.length - 1].label : void 0;
}
function primaryInvalidationPrice(waves) {
  const w2 = waves.find((w) => w.label === "2");
  if (w2?.invalidationPrice !== void 0) {
    return w2.invalidationPrice;
  }
  const withPrice = waves.find((w) => w.invalidationPrice !== void 0);
  return withPrice?.invalidationPrice;
}

// src/wave/presentation-state.ts
var IMPULSE_LABELS2 = ["1", "2", "3", "4", "5"];
var CORRECTIVE_LABELS2 = ["A", "B", "C"];
var STATUS_RANK = {
  CONFIRMED: 2,
  POTENTIAL: 1,
  INVALIDATED: 0
};
function isImpulseLabel(label) {
  return IMPULSE_LABELS2.includes(label);
}
function isCorrectiveLabel(label) {
  return CORRECTIVE_LABELS2.includes(label);
}
function labelRank(structure, label) {
  if (structure === "IMPULSE") {
    return Number(label);
  }
  const ranks = { A: 1, B: 2, C: 3 };
  return ranks[label] ?? 0;
}
function toLegView(wave, structure, scenario) {
  return {
    structure,
    scenario,
    label: wave.label,
    startIndex: wave.startIndex,
    endIndex: wave.endIndex,
    status: wave.status,
    confidence: wave.confidence,
    structureConflict: wave.structureConflict,
    invalidationPrice: wave.invalidationPrice
  };
}
function selectLeadingLeg(legs, structure) {
  const candidates = legs.filter((l) => l.status !== "INVALIDATED");
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((a, b) => {
    if (b.endIndex !== a.endIndex) {
      return b.endIndex - a.endIndex;
    }
    if (STATUS_RANK[b.status] !== STATUS_RANK[a.status]) {
      return STATUS_RANK[b.status] - STATUS_RANK[a.status];
    }
    return labelRank(structure, b.label) - labelRank(structure, a.label);
  });
  const top = sorted[0];
  return {
    label: top.label,
    status: top.status,
    confidence: top.confidence,
    startIndex: top.startIndex,
    endIndex: top.endIndex
  };
}
function compareLeadingForFocus(a, b) {
  if (a.endIndex !== b.endIndex) {
    return a.endIndex - b.endIndex;
  }
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  return a.confidence - b.confidence;
}
function invalidationForTrack(legs, structure, scenario) {
  const w2Invalid = legs.find(
    (l) => l.label === "2" && l.status === "INVALIDATED" && l.invalidationPrice !== void 0
  );
  if (w2Invalid?.invalidationPrice !== void 0) {
    return {
      structure,
      scenario,
      wave: "2",
      price: w2Invalid.invalidationPrice,
      reason: "WAVE2_BREAK"
    };
  }
  const any = legs.find((l) => l.invalidationPrice !== void 0);
  if (any?.invalidationPrice !== void 0) {
    return {
      structure,
      scenario,
      wave: any.label,
      price: any.invalidationPrice,
      reason: "OTHER"
    };
  }
  return null;
}
function buildTrack(waves, kind, scenario, countDirection, structureConformanceScore) {
  const legs = waves.map((w) => toLegView(w, kind, scenario));
  return {
    kind,
    scenario,
    countDirection,
    legs,
    leading: selectLeadingLeg(legs, kind),
    structureConformanceScore,
    invalidation: invalidationForTrack(legs, kind, scenario)
  };
}
function segmentKey(startIndex, endIndex) {
  return `${startIndex}:${endIndex}`;
}
function buildOverlaps(impulseLegs, correctiveLegs) {
  const map = /* @__PURE__ */ new Map();
  for (const leg of impulseLegs) {
    const key = segmentKey(leg.startIndex, leg.endIndex);
    const list = map.get(key) ?? [];
    list.push({
      structure: leg.structure,
      scenario: leg.scenario,
      label: leg.label,
      status: leg.status
    });
    map.set(key, list);
  }
  for (const leg of correctiveLegs) {
    const key = segmentKey(leg.startIndex, leg.endIndex);
    const list = map.get(key) ?? [];
    list.push({
      structure: leg.structure,
      scenario: leg.scenario,
      label: leg.label,
      status: leg.status
    });
    map.set(key, list);
  }
  const overlaps = [];
  for (const [key, legs] of map) {
    if (legs.length < 2) {
      continue;
    }
    const [startIndex, endIndex] = key.split(":").map(Number);
    overlaps.push({ startIndex, endIndex, legs });
  }
  overlaps.sort((a, b) => a.startIndex - b.startIndex);
  return overlaps;
}
function buildTrendContext(trend, impulseBullish) {
  if (trend === "NEUTRAL") {
    return {
      alignment: "NEUTRAL_CONTEXT",
      note: "Market trend is NEUTRAL; impulse count direction is evaluated separately."
    };
  }
  const aligned = impulseBullish && trend === "BULLISH" || !impulseBullish && trend === "BEARISH";
  if (aligned) {
    return {
      alignment: "ALIGNED",
      note: "Swing-based market trend matches selected impulse count direction."
    };
  }
  return {
    alignment: "CONFLICTING",
    note: "Swing-based market trend differs from selected impulse count direction."
  };
}
function leadingToFocus(structure, leading, scenario, trackInvalidation, selectionReason) {
  const inv = trackInvalidation?.wave === leading.label ? trackInvalidation.price : void 0;
  return {
    structure,
    scenario,
    wave: leading.label,
    status: leading.status,
    confidence: leading.confidence,
    startIndex: leading.startIndex,
    endIndex: leading.endIndex,
    invalidationPrice: inv,
    selectionReason
  };
}
function selectFocusPair(impulseTrack, correctiveTrack) {
  const impulseLead = impulseTrack.leading;
  const corrLead = correctiveTrack?.leading ?? null;
  if (!impulseLead && !corrLead) {
    return { primary: null, alternative: null };
  }
  if (impulseLead && !corrLead) {
    return {
      primary: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED",
        impulseTrack.invalidation,
        "Only SELECTED impulse track has a leading leg."
      ),
      alternative: null
    };
  }
  if (!impulseLead && corrLead && correctiveTrack) {
    return {
      primary: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED",
        correctiveTrack.invalidation,
        "Only corrective track has a leading leg."
      ),
      alternative: null
    };
  }
  if (!impulseLead || !corrLead || !correctiveTrack) {
    return { primary: null, alternative: null };
  }
  const cmp = compareLeadingForFocus(impulseLead, corrLead);
  if (cmp > 0) {
    return {
      primary: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED",
        impulseTrack.invalidation,
        "Impulse leading leg is ahead by endIndex, status, or confidence (no global structure bias)."
      ),
      alternative: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED_ALTERNATIVE",
        correctiveTrack.invalidation,
        "Corrective leading leg is the paired focus on the other structure track."
      )
    };
  }
  if (cmp < 0) {
    return {
      primary: leadingToFocus(
        "CORRECTIVE",
        corrLead,
        "SELECTED",
        correctiveTrack.invalidation,
        "Corrective leading leg is ahead by endIndex, status, or confidence (no global structure bias)."
      ),
      alternative: leadingToFocus(
        "IMPULSE",
        impulseLead,
        "SELECTED_ALTERNATIVE",
        impulseTrack.invalidation,
        "Impulse leading leg is the paired focus on the other structure track."
      )
    };
  }
  return {
    primary: leadingToFocus(
      "CORRECTIVE",
      corrLead,
      "SELECTED",
      correctiveTrack.invalidation,
      "Tie on endIndex, status, and confidence; corrective chosen as primary by stable tie-break."
    ),
    alternative: leadingToFocus(
      "IMPULSE",
      impulseLead,
      "SELECTED_ALTERNATIVE",
      impulseTrack.invalidation,
      "Tie on endIndex, status, and confidence; impulse is paired alternative focus."
    )
  };
}
function mapToPresentationState(analysis, context) {
  const impulseWaves = analysis.waves.filter((w) => isImpulseLabel(w.label));
  const correctiveWaves = analysis.waves.filter(
    (w) => isCorrectiveLabel(w.label)
  );
  const rivalWaves = analysis.alternativeScenarios[0] ?? null;
  const rivalScore = Math.round(analysis.confidence * 0.85);
  const countDirection = context.impulseBullish ? "BULLISH" : "BEARISH";
  const selectedImpulse = buildTrack(
    impulseWaves,
    "IMPULSE",
    "SELECTED",
    countDirection,
    analysis.confidence
  );
  const corrective = correctiveWaves.length > 0 ? buildTrack(
    correctiveWaves,
    "CORRECTIVE",
    "SELECTED",
    countDirection,
    analysis.confidence
  ) : null;
  const rivalImpulse = rivalWaves && rivalWaves.length > 0 ? buildTrack(
    rivalWaves,
    "IMPULSE",
    "RIVAL",
    context.impulseBullish ? "BEARISH" : "BULLISH",
    rivalScore
  ) : null;
  const overlaps = buildOverlaps(selectedImpulse.legs, corrective?.legs ?? []);
  const { primary, alternative } = selectFocusPair(selectedImpulse, corrective);
  return {
    schemaVersion: "1.0",
    marketTrend: analysis.trend,
    ruleConformanceScore: analysis.confidence,
    scoreDisclaimer: "RULE_CONFORMANCE_NOT_PROBABILITY",
    trendContext: buildTrendContext(analysis.trend, context.impulseBullish),
    primary,
    alternative,
    tracks: {
      selectedImpulse,
      corrective,
      rivalImpulse
    },
    overlaps,
    engine: {
      currentWaveLegacy: analysis.currentWave,
      flatWaves: analysis.waves
    }
  };
}

// src/wave/wave-diagnostics.ts
var IMPULSE_LABELS3 = ["1", "2", "3", "4", "5"];
function swingPriceAt2(candles, swings, index) {
  const swing = swings.find((s) => s.index === index);
  if (swing) {
    return swing.price;
  }
  const c = candles[index];
  return c?.close ?? NaN;
}
function legFromView(leg, candles, swings) {
  const startC = candles[leg.startIndex];
  const endC = candles[leg.endIndex];
  return {
    startPrice: swingPriceAt2(candles, swings, leg.startIndex),
    endPrice: swingPriceAt2(candles, swings, leg.endIndex),
    startTime: startC?.time ?? 0,
    endTime: endC?.time ?? 0
  };
}
function buildStructurePairs(swings) {
  const confirmed = swings.filter((s) => s.confirmed);
  const highs = confirmed.filter((s) => s.type === "HIGH");
  const lows = confirmed.filter((s) => s.type === "LOW");
  const pairs = [];
  for (let i = 1; i < highs.length; i++) {
    pairs.push({
      kind: "HIGH",
      fromIndex: highs[i - 1].index,
      toIndex: highs[i].index,
      fromPrice: highs[i - 1].price,
      toPrice: highs[i].price,
      structure: classifyHighStructure(highs[i - 1], highs[i])
    });
  }
  for (let i = 1; i < lows.length; i++) {
    pairs.push({
      kind: "LOW",
      fromIndex: lows[i - 1].index,
      toIndex: lows[i].index,
      fromPrice: lows[i - 1].price,
      toPrice: lows[i].price,
      structure: classifyLowStructure(lows[i - 1], lows[i])
    });
  }
  return pairs;
}
function buildTrendSource(swings, trend) {
  const confirmed = swings.filter((s) => s.confirmed);
  const highs = confirmed.filter((s) => s.type === "HIGH");
  const lows = confirmed.filter((s) => s.type === "LOW");
  let lastHighPair;
  let lastLowPair;
  if (highs.length >= 2) {
    const prev = highs[highs.length - 2];
    const last = highs[highs.length - 1];
    lastHighPair = {
      prevIndex: prev.index,
      lastIndex: last.index,
      prevPrice: prev.price,
      lastPrice: last.price,
      structure: classifyHighStructure(prev, last)
    };
  }
  if (lows.length >= 2) {
    const prev = lows[lows.length - 2];
    const last = lows[lows.length - 1];
    lastLowPair = {
      prevIndex: prev.index,
      lastIndex: last.index,
      prevPrice: prev.price,
      lastPrice: last.price,
      structure: classifyLowStructure(prev, last)
    };
  }
  const lastSwing = confirmed[confirmed.length - 1];
  const lastConfirmedSwing = lastSwing ? {
    index: lastSwing.index,
    type: lastSwing.type,
    price: lastSwing.price,
    time: lastSwing.time
  } : void 0;
  let trendRuleSummary = "Insufficient confirmed swings for trend (need 2 highs and 2 lows).";
  if (lastHighPair && lastLowPair && lastConfirmedSwing) {
    trendRuleSummary = `Trend uses last high pair \u2192 ${lastHighPair.structure}, last low pair \u2192 ${lastLowPair.structure}, last confirmed swing \u2192 ${lastConfirmedSwing.type}. Result: ${trend}.`;
  }
  return {
    marketTrend: trend,
    lastHighPair,
    lastLowPair,
    lastConfirmedSwing,
    trendRuleSummary
  };
}
function buildFibonacciDiagnostic(candles, impulseWaves, impulseBullish) {
  const wave1 = impulseWaves.find((w) => w.label === "1");
  const wave2 = impulseWaves.find((w) => w.label === "2");
  if (!wave1 || !wave2) {
    return {
      available: false,
      note: "Selected impulse waves 1\u20132 required for confidence fibonacci component."
    };
  }
  const start = impulseBullish ? candles[wave1.startIndex].low : candles[wave1.startIndex].high;
  const end = impulseBullish ? candles[wave1.endIndex].high : candles[wave1.endIndex].low;
  const actual = impulseBullish ? candles[wave2.endIndex].low : candles[wave2.endIndex].high;
  const match = nearestFibMatch(start, end, actual, impulseBullish);
  const conformanceScore = fibConformanceScore(match);
  return {
    available: true,
    impulseBullish,
    wave1StartIndex: wave1.startIndex,
    wave1EndIndex: wave1.endIndex,
    wave2EndIndex: wave2.endIndex,
    rangeStart: start,
    rangeEnd: end,
    actualRetracePrice: actual,
    nearestMatch: match ? {
      level: match.level,
      kind: match.kind,
      distanceRatio: match.distanceRatio
    } : null,
    conformanceScore,
    note: "Mirrors computeConfidence fibonacciScore inputs (exported fib helpers only)."
  };
}
function indicesToPrices(candles, swings, startIndex, endIndex) {
  const startC = candles[startIndex];
  const endC = candles[endIndex];
  return {
    startPrice: swingPriceAt2(candles, swings, startIndex),
    endPrice: swingPriceAt2(candles, swings, endIndex),
    startTime: startC?.time ?? 0,
    endTime: endC?.time ?? 0
  };
}
function focusDiagnostic(role, focus, candles, swings) {
  const prices = indicesToPrices(
    candles,
    swings,
    focus.startIndex,
    focus.endIndex
  );
  return {
    role,
    structure: focus.structure,
    wave: focus.wave,
    status: focus.status,
    confidence: focus.confidence,
    startIndex: focus.startIndex,
    endIndex: focus.endIndex,
    ...prices,
    selectionReason: focus.selectionReason
  };
}
function buildOverlaps2(presentation, candles, swings) {
  return presentation.overlaps.map((o) => {
    const impulse = o.legs.find((l) => l.structure === "IMPULSE");
    const corr = o.legs.find((l) => l.structure === "CORRECTIVE");
    const title = impulse && corr ? `Wave ${impulse.label} \u2194 Wave ${corr.label}` : o.legs.map((l) => `${l.structure} ${l.label}`).join(" \u2194 ");
    const prices = indicesToPrices(candles, swings, o.startIndex, o.endIndex);
    return {
      ...o,
      ...prices,
      summary: title
    };
  });
}
function buildWaveDiagnostics(candles, presentation, impulseBullish, options) {
  const swingConfig = mergeSwingConfig(options?.swing);
  const swings = detectSwings(candles, swingConfig);
  const trend = detectTrend(swings);
  const confirmedSwings = swings.filter((s) => s.confirmed).map((s) => ({
    index: s.index,
    type: s.type,
    price: s.price,
    time: s.time,
    strength: s.strength
  }));
  const impulseWaves = presentation.engine.flatWaves.filter(
    (w) => IMPULSE_LABELS3.includes(w.label)
  );
  const waveLegs = [];
  const pushTrack = (track, structure) => {
    if (!track) {
      return;
    }
    for (const leg of track.legs) {
      waveLegs.push({
        structure,
        scenario: leg.scenario,
        label: leg.label,
        status: leg.status,
        confidence: leg.confidence,
        startIndex: leg.startIndex,
        endIndex: leg.endIndex,
        ...legFromView(leg, candles, swings)
      });
    }
  };
  pushTrack(presentation.tracks.selectedImpulse, "IMPULSE");
  pushTrack(presentation.tracks.corrective, "CORRECTIVE");
  pushTrack(presentation.tracks.rivalImpulse, "IMPULSE");
  return {
    swingConfig,
    confirmedSwingCount: confirmedSwings.length,
    confirmedSwings,
    structurePairs: buildStructurePairs(swings),
    allStructures: detectMarketStructures(swings),
    trendSource: buildTrendSource(swings, trend),
    waveLegs,
    fibonacci: buildFibonacciDiagnostic(candles, impulseWaves, impulseBullish),
    focus: {
      primary: presentation.primary ? focusDiagnostic("PRIMARY", presentation.primary, candles, swings) : null,
      alternative: presentation.alternative ? focusDiagnostic(
        "ALTERNATIVE",
        presentation.alternative,
        candles,
        swings
      ) : null
    },
    overlaps: buildOverlaps2(presentation, candles, swings),
    presentation
  };
}

// src/wave/analysis-pipeline.ts
function buildWaveAnalysis(candles, options) {
  if (candles.length === 0) {
    return {
      analysis: {
        trend: "NEUTRAL",
        waves: [],
        confidence: 0,
        alternativeScenarios: []
      },
      impulseBullish: true
    };
  }
  const swingConfig = mergeSwingConfig(options?.swing);
  const swings = detectSwings(candles, swingConfig);
  const trend = detectTrend(swings);
  const detection = detectWaves(candles, swings, trend);
  const allWaves = [...detection.impulse, ...detection.corrective];
  const overallConfidence = computeConfidence({
    candles,
    swings,
    waves: detection.impulse,
    trend,
    impulseBullish: detection.impulseBullish
  });
  const wavesWithConfidence = applyPerWaveConfidence(
    allWaves,
    overallConfidence
  );
  return {
    impulseBullish: detection.impulseBullish,
    analysis: {
      trend,
      currentWave: currentWaveLabel(wavesWithConfidence),
      waves: wavesWithConfidence,
      confidence: overallConfidence,
      invalidationPrice: primaryInvalidationPrice(wavesWithConfidence),
      alternativeScenarios: detection.alternatives.map(
        (alt) => applyPerWaveConfidence(alt, overallConfidence * 0.85)
      )
    }
  };
}
function analyzeWaveWithDiagnostics(candles, options) {
  const result = buildWaveAnalysis(candles, options);
  const presentation = mapToPresentationState(result.analysis, {
    impulseBullish: result.impulseBullish
  });
  const diagnostics = buildWaveDiagnostics(
    candles,
    presentation,
    result.impulseBullish,
    options
  );
  return {
    analysis: result.analysis,
    presentation,
    diagnostics
  };
}

// src/wave/multi-timeframe.ts
var DEFAULT_MULTI_TIMEFRAME_CONFIG = {
  higherTimeframeId: "1H",
  lowerTimeframeId: "15M"
};
var MIN_CANDLES_FOR_CONTEXT = 2;
function timeWindowFromCandles(candles) {
  if (candles.length === 0) {
    return { startTime: 0, endTime: 0 };
  }
  return {
    startTime: candles[0].time,
    endTime: candles[candles.length - 1].time
  };
}
function overlapWindows(a, b) {
  const startTime = Math.max(a.startTime, b.startTime);
  const endTime = Math.min(a.endTime, b.endTime);
  if (endTime < startTime) {
    return null;
  }
  return { startTime, endTime };
}
function priceRangeOnSegment(candles, startIndex, endIndex) {
  if (startIndex === null || endIndex === null || candles.length === 0) {
    return { low: null, high: null };
  }
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
  let low = Infinity;
  let high = -Infinity;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!c) {
      continue;
    }
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
  }
  if (!Number.isFinite(low)) {
    return { low: null, high: null };
  }
  return { low, high };
}
function emptyFocus() {
  return {
    structure: null,
    wave: null,
    status: null,
    confidence: null,
    startIndex: null,
    endIndex: null,
    startPrice: null,
    endPrice: null,
    startTime: null,
    endTime: null,
    priceRangeLow: null,
    priceRangeHigh: null
  };
}
function focusContextFromDiagnostics(candles, presentation, diagnostics, role) {
  const focus = role === "primary" ? presentation.primary : presentation.alternative;
  if (!focus) {
    return emptyFocus();
  }
  const diagFocus = role === "primary" ? diagnostics.focus.primary : diagnostics.focus.alternative;
  const range = priceRangeOnSegment(
    candles,
    focus.startIndex,
    focus.endIndex
  );
  return {
    structure: focus.structure,
    wave: focus.wave,
    status: focus.status,
    confidence: focus.confidence,
    startIndex: focus.startIndex,
    endIndex: focus.endIndex,
    startPrice: diagFocus?.startPrice ?? null,
    endPrice: diagFocus?.endPrice ?? null,
    startTime: diagFocus?.startTime ?? null,
    endTime: diagFocus?.endTime ?? null,
    priceRangeLow: range.low,
    priceRangeHigh: range.high
  };
}
function compareTrends(higherTrend, lowerTrend) {
  if (higherTrend === "NEUTRAL" || lowerTrend === "NEUTRAL") {
    return "PARTIAL_NEUTRAL";
  }
  return higherTrend === lowerTrend ? "SAME" : "DIFFERENT";
}
function classifyMultiTimeframeRelationship(input) {
  const notes = [];
  if (input.higherCandleCount < MIN_CANDLES_FOR_CONTEXT || input.lowerCandleCount < MIN_CANDLES_FOR_CONTEXT) {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary: "Not enough closed candles on one or both timeframes."
    };
  }
  if (!input.higherPrimary.wave || !input.lowerPrimary.wave) {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary: "Primary focus missing on higher or lower timeframe."
    };
  }
  const trendCmp = compareTrends(input.higherTrend, input.lowerTrend);
  if (trendCmp === "DIFFERENT") {
    return {
      kind: "DIVERGENT",
      summary: "Higher and lower timeframe trends differ (non-neutral). Wave labels are not compared directly."
    };
  }
  const hStruct = input.higherPrimary.structure;
  const lStruct = input.lowerPrimary.structure;
  if (hStruct && lStruct && hStruct !== lStruct) {
    return {
      kind: "NESTED_POSSIBLE",
      summary: "Primary structure kinds differ (e.g. impulse vs corrective). A lower-timeframe leg may nest inside higher-timeframe structure \u2014 not mapped in this checkpoint."
    };
  }
  if (trendCmp === "PARTIAL_NEUTRAL") {
    return {
      kind: "INSUFFICIENT_CONTEXT",
      summary: "At least one timeframe trend is NEUTRAL; relationship is descriptive only."
    };
  }
  return {
    kind: "ALIGNED",
    summary: "Trend direction matches and primary structure kinds match. Label-level mapping is not performed."
  };
}
function buildTimeframeBundle(candles, timeframeId, options) {
  const { analysis, presentation, diagnostics } = analyzeWaveWithDiagnostics(
    candles,
    options
  );
  return {
    timeframeId,
    candleCount: candles.length,
    timeWindow: timeWindowFromCandles(candles),
    analysis,
    presentation,
    diagnostics,
    primaryFocus: focusContextFromDiagnostics(
      candles,
      presentation,
      diagnostics,
      "primary"
    ),
    alternativeFocus: focusContextFromDiagnostics(
      candles,
      presentation,
      diagnostics,
      "alternative"
    )
  };
}
function buildNotes(trend, relationship) {
  const notes = [];
  if (trend.comparison === "DIFFERENT" && trend.higherTrend !== "NEUTRAL" && trend.lowerTrend !== "NEUTRAL") {
    notes.push(
      "Short-term structure differs from higher timeframe."
    );
  }
  if (trend.comparison === "PARTIAL_NEUTRAL") {
    notes.push(
      "One or both timeframes report NEUTRAL trend; compare focus legs with caution."
    );
  }
  notes.push(relationship.summary);
  notes.push(
    "Multi-timeframe view does not map parent/child waves or produce trade signals."
  );
  return notes;
}
function analyzeMultiTimeframe(higherCandles, lowerCandles, config = DEFAULT_MULTI_TIMEFRAME_CONFIG, options) {
  const higherTimeframe = buildTimeframeBundle(
    higherCandles,
    config.higherTimeframeId,
    options?.higherEngineOptions
  );
  const lowerTimeframe = buildTimeframeBundle(
    lowerCandles,
    config.lowerTimeframeId,
    options?.lowerEngineOptions
  );
  const trendAlignment = {
    higherTrend: higherTimeframe.presentation.marketTrend,
    lowerTrend: lowerTimeframe.presentation.marketTrend,
    comparison: compareTrends(
      higherTimeframe.presentation.marketTrend,
      lowerTimeframe.presentation.marketTrend
    )
  };
  const relationship = classifyMultiTimeframeRelationship({
    higherCandleCount: higherTimeframe.candleCount,
    lowerCandleCount: lowerTimeframe.candleCount,
    higherTrend: trendAlignment.higherTrend,
    lowerTrend: trendAlignment.lowerTrend,
    higherPrimary: higherTimeframe.primaryFocus,
    lowerPrimary: lowerTimeframe.primaryFocus
  });
  const higherWindow = higherTimeframe.timeWindow;
  const lowerWindow = lowerTimeframe.timeWindow;
  const overlap = overlapWindows(higherWindow, lowerWindow);
  return {
    schemaVersion: "1.0",
    symbol: options?.symbol,
    higherTimeframe,
    lowerTimeframe,
    trendAlignment,
    relationship,
    timeAlignment: {
      higher: higherWindow,
      lower: lowerWindow,
      overlap,
      overlapDurationMs: overlap ? overlap.endTime - overlap.startTime : 0
    },
    notes: buildNotes(trendAlignment, relationship)
  };
}

// src/wave/wave-hierarchy.ts
var HIERARCHY_WAVE_LABELS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "A",
  "B",
  "C"
];
function structureForLabel(label) {
  return ["1", "2", "3", "4", "5"].includes(label) ? "IMPULSE" : "CORRECTIVE";
}
function segmentEnvelope(candles, startIndex, endIndex) {
  let low = Infinity;
  let high = -Infinity;
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(candles.length - 1, Math.max(startIndex, endIndex));
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!c) {
      continue;
    }
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
  }
  if (!Number.isFinite(low)) {
    return { lowPrice: 0, highPrice: 0 };
  }
  return { lowPrice: low, highPrice: high };
}
function pickLeg(legs, label) {
  const matches = legs.filter((l) => l.label === label);
  return matches.find((l) => l.scenario === "SELECTED") ?? matches.find((l) => l.scenario === "SELECTED_ALTERNATIVE") ?? matches[0];
}
function waveByLabel(waves, label) {
  return waves.find((w) => w.label === label);
}
function buildHierarchySegment(bundle, candles, label) {
  const wave = waveByLabel(bundle.analysis.waves, label);
  if (!wave) {
    return null;
  }
  const leg = pickLeg(bundle.diagnostics.waveLegs, label);
  const startIndex = leg?.startIndex ?? wave.startIndex;
  const endIndex = leg?.endIndex ?? wave.endIndex;
  const envelope = segmentEnvelope(candles, startIndex, endIndex);
  const startC = candles[startIndex];
  const endC = candles[endIndex];
  return {
    timeframeId: bundle.timeframeId,
    structure: structureForLabel(label),
    label,
    status: wave.status,
    startIndex,
    endIndex,
    startTime: leg?.startTime ?? startC?.time ?? 0,
    endTime: leg?.endTime ?? endC?.time ?? 0,
    lowPrice: envelope.lowPrice,
    highPrice: envelope.highPrice,
    invalidated: wave.status === "INVALIDATED"
  };
}
function normalizedTimeSpan(startTime, endTime) {
  return {
    start: Math.min(startTime, endTime),
    end: Math.max(startTime, endTime)
  };
}
function classifyTimeRelation(higher, lower) {
  if (!higher.startTime || !higher.endTime || !lower.startTime || !lower.endTime) {
    return "INSUFFICIENT_CONTEXT";
  }
  const h = normalizedTimeSpan(higher.startTime, higher.endTime);
  const l = normalizedTimeSpan(lower.startTime, lower.endTime);
  if (l.start >= h.start && l.end <= h.end) {
    return "TIME_CONTAINED";
  }
  if (l.start <= h.end && l.end >= h.start) {
    return "TIME_OVERLAPPING";
  }
  return "TIME_DISJOINT";
}
function classifyPriceRelation(higher, lower) {
  if (!Number.isFinite(higher.lowPrice) || !Number.isFinite(higher.highPrice) || !Number.isFinite(lower.lowPrice) || !Number.isFinite(lower.highPrice)) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (lower.lowPrice >= higher.lowPrice && lower.highPrice <= higher.highPrice) {
    return "PRICE_CONTAINED";
  }
  const overlapLow = Math.max(higher.lowPrice, lower.lowPrice);
  const overlapHigh = Math.min(higher.highPrice, lower.highPrice);
  if (overlapHigh >= overlapLow) {
    return "PRICE_OVERLAPPING";
  }
  return "PRICE_DISJOINT";
}
function classifyCandidateNesting(timeRelation, priceRelation) {
  if (timeRelation === "INSUFFICIENT_CONTEXT" || priceRelation === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (timeRelation === "TIME_DISJOINT" || priceRelation === "PRICE_DISJOINT") {
    return "NO_RELATIONSHIP";
  }
  if (timeRelation === "TIME_CONTAINED") {
    if (priceRelation === "PRICE_CONTAINED") {
      return "NESTED_CANDIDATE";
    }
    if (priceRelation === "PRICE_OVERLAPPING") {
      return "POSSIBLE_NESTING";
    }
    return "NO_RELATIONSHIP";
  }
  return "OVERLAPPING_CONTEXT";
}
function buildHierarchyReason(higher, lower, timeRelation, priceRelation, relationship) {
  const h = `${higher.timeframeId} ${higher.structure} Wave ${higher.label}`;
  const l = `${lower.timeframeId} ${lower.structure} Wave ${lower.label}`;
  if (relationship === "INSUFFICIENT_CONTEXT") {
    return `${l} vs ${h}: insufficient time or price context.`;
  }
  if (relationship === "NO_RELATIONSHIP") {
    return `${l} has no qualifying time/price overlap with ${h} (${timeRelation}, ${priceRelation}).`;
  }
  if (relationship === "NESTED_CANDIDATE") {
    return `${l} is time-contained within ${h} and its OHLC envelope lies inside ${h}'s price envelope (candidate only, not confirmed Elliott nesting).`;
  }
  if (relationship === "POSSIBLE_NESTING") {
    return `${l} is time-contained within ${h} and overlaps ${h}'s price envelope (candidate only).`;
  }
  return `${l} time-overlaps ${h} without full time containment (${timeRelation}, ${priceRelation}).`;
}
function compareCandidates(a, b) {
  const hi = HIERARCHY_WAVE_LABELS.indexOf(a.higherWave.label);
  const hj = HIERARCHY_WAVE_LABELS.indexOf(b.higherWave.label);
  if (hi !== hj) {
    return hi - hj;
  }
  return HIERARCHY_WAVE_LABELS.indexOf(a.lowerWave.label) - HIERARCHY_WAVE_LABELS.indexOf(b.lowerWave.label);
}
function buildCandidatePair(higher, lower) {
  const timeRelation = classifyTimeRelation(higher, lower);
  const priceRelation = classifyPriceRelation(higher, lower);
  const relationship = classifyCandidateNesting(timeRelation, priceRelation);
  return {
    higherWave: higher,
    lowerWave: lower,
    timeRelation,
    priceRelation,
    relationship,
    reason: buildHierarchyReason(
      higher,
      lower,
      timeRelation,
      priceRelation,
      relationship
    )
  };
}
function buildCandidateWaveHierarchy(state, higherCandles, lowerCandles) {
  const higherTf = state.higherTimeframe;
  const lowerTf = state.lowerTimeframe;
  const higherSegments = /* @__PURE__ */ new Map();
  const lowerSegments = /* @__PURE__ */ new Map();
  for (const label of HIERARCHY_WAVE_LABELS) {
    const h = buildHierarchySegment(higherTf, higherCandles, label);
    const l = buildHierarchySegment(lowerTf, lowerCandles, label);
    if (h) {
      higherSegments.set(label, h);
    }
    if (l) {
      lowerSegments.set(label, l);
    }
  }
  const candidates = [];
  for (const hLabel of HIERARCHY_WAVE_LABELS) {
    const higher = higherSegments.get(hLabel);
    if (!higher) {
      continue;
    }
    for (const lLabel of HIERARCHY_WAVE_LABELS) {
      const lower = lowerSegments.get(lLabel);
      if (!lower) {
        continue;
      }
      candidates.push(buildCandidatePair(higher, lower));
    }
  }
  candidates.sort(compareCandidates);
  let primaryPair = null;
  const hPrimary = higherTf.primaryFocus.wave;
  const lPrimary = lowerTf.primaryFocus.wave;
  if (hPrimary && lPrimary) {
    const higher = higherSegments.get(hPrimary);
    const lower = lowerSegments.get(lPrimary);
    if (higher && lower) {
      primaryPair = buildCandidatePair(higher, lower);
    }
  }
  const highlightedCandidates = candidates.filter(
    (c) => c.relationship === "NESTED_CANDIDATE" || c.relationship === "POSSIBLE_NESTING"
  );
  const counts = {
    totalPairs: candidates.length,
    nestedCandidate: candidates.filter(
      (c) => c.relationship === "NESTED_CANDIDATE"
    ).length,
    possibleNesting: candidates.filter(
      (c) => c.relationship === "POSSIBLE_NESTING"
    ).length,
    overlappingContext: candidates.filter(
      (c) => c.relationship === "OVERLAPPING_CONTEXT"
    ).length,
    noRelationship: candidates.filter(
      (c) => c.relationship === "NO_RELATIONSHIP"
    ).length,
    insufficientContext: candidates.filter(
      (c) => c.relationship === "INSUFFICIENT_CONTEXT"
    ).length
  };
  return {
    schemaVersion: "1.0",
    symbol: state.symbol,
    higherTimeframe: higherTf.timeframeId,
    lowerTimeframe: lowerTf.timeframeId,
    trendContext: {
      higherTrend: state.trendAlignment.higherTrend,
      lowerTrend: state.trendAlignment.lowerTrend
    },
    primaryPair,
    candidates,
    highlightedCandidates,
    counts
  };
}

// src/wave/wave-scenarios.ts
var STANDARD_LIMITATIONS = [
  "Scenario confidence reflects engine rule-conformance weighting, not probability.",
  "Scenarios are not ranked, selected, or promoted as trade signals.",
  "No entry, stop-loss, take-profit, or leverage is derived from this layer."
];
function structureForLabel2(label) {
  return ["1", "2", "3", "4", "5"].includes(label) ? "IMPULSE" : "CORRECTIVE";
}
function trackForFocus(presentation, focus) {
  if (focus.structure === "IMPULSE") {
    return presentation.tracks.selectedImpulse;
  }
  return presentation.tracks.corrective;
}
function invalidationRuleFromScoped(inv) {
  if (inv.reason === "WAVE2_BREAK") {
    return `Track-scoped invalidation: Wave 2 break on ${inv.structure} ${inv.scenario} (price ${inv.price}).`;
  }
  return `Track-scoped invalidation on ${inv.structure} ${inv.scenario} Wave ${inv.wave} (price ${inv.price}).`;
}
function resolveScenarioInvalidation(presentation, focus, wave) {
  if (focus) {
    const track = trackForFocus(presentation, focus);
    const scoped = track?.invalidation;
    if (scoped) {
      return {
        available: true,
        price: scoped.price,
        structure: scoped.structure,
        scenario: scoped.scenario,
        wave: scoped.wave,
        reason: scoped.reason,
        rule: invalidationRuleFromScoped(scoped),
        source: "TRACK_SCOPE"
      };
    }
    if (focus.invalidationPrice !== void 0) {
      return {
        available: true,
        price: focus.invalidationPrice,
        structure: focus.structure,
        scenario: focus.scenario,
        wave: focus.wave,
        rule: `Focus-leg invalidation price from presentation mapping (Wave ${focus.wave}).`,
        source: "FOCUS_LEG"
      };
    }
  }
  if (wave?.invalidationPrice !== void 0) {
    return {
      available: true,
      price: wave.invalidationPrice,
      structure: structureForLabel2(wave.label),
      wave: wave.label,
      rule: `Wave candidate invalidation price on engine leg Wave ${wave.label}.`,
      source: "WAVE_CANDIDATE"
    };
  }
  return {
    available: false,
    rule: "No invalidation price provided by engine tracks, focus, or wave leg.",
    source: "NONE"
  };
}
function mapEngineStatusToScenarioStatus(engineStatus, hasSegment) {
  if (!hasSegment || engineStatus === void 0) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (engineStatus === "INVALIDATED") {
    return "INVALIDATED";
  }
  return "ACTIVE";
}
function waveByLabel2(waves, label) {
  return waves.find((w) => w.label === label);
}
function mtfEvidence(bundle, mtf) {
  if (!mtf) {
    return [];
  }
  const isHigher = bundle.timeframeId === mtf.higherTimeframe.timeframeId;
  const isLower = bundle.timeframeId === mtf.lowerTimeframe.timeframeId;
  if (!isHigher && !isLower) {
    return [];
  }
  return [
    `Multi-timeframe context: ${mtf.higherTimeframe.timeframeId} trend ${mtf.trendAlignment.higherTrend}, ${mtf.lowerTimeframe.timeframeId} trend ${mtf.trendAlignment.lowerTrend} (${mtf.trendAlignment.comparison}).`,
    `MTF relationship kind: ${mtf.relationship.kind} \u2014 ${mtf.relationship.summary}`
  ];
}
function hierarchyEvidenceForLeg(timeframeId, structure, label, hierarchy) {
  if (!hierarchy) {
    return [];
  }
  const lines = [];
  const pp = hierarchy.primaryPair;
  if (pp) {
    if (timeframeId === hierarchy.higherTimeframe && pp.higherWave.label === label && pp.higherWave.structure === structure) {
      lines.push(
        `Hierarchy primary-pair (higher leg): ${pp.relationship} vs ${hierarchy.lowerTimeframe} ${pp.lowerWave.structure} ${pp.lowerWave.label}. ${pp.reason}`
      );
    }
    if (timeframeId === hierarchy.lowerTimeframe && pp.lowerWave.label === label && pp.lowerWave.structure === structure) {
      lines.push(
        `Hierarchy primary-pair (lower leg): ${pp.relationship} vs ${hierarchy.higherTimeframe} ${pp.higherWave.structure} ${pp.higherWave.label}. ${pp.reason}`
      );
    }
  }
  for (const c of hierarchy.highlightedCandidates) {
    if (timeframeId === hierarchy.higherTimeframe && c.higherWave.label === label) {
      lines.push(
        `Hierarchy nesting candidate: lower ${c.lowerWave.structure} ${c.lowerWave.label} \u2192 ${c.relationship} (${c.timeRelation}, ${c.priceRelation}).`
      );
    }
    if (timeframeId === hierarchy.lowerTimeframe && c.lowerWave.label === label) {
      lines.push(
        `Hierarchy nesting candidate: higher ${c.higherWave.structure} ${c.higherWave.label} \u2192 ${c.relationship} (${c.timeRelation}, ${c.priceRelation}).`
      );
    }
  }
  return lines;
}
function limitationsFor(invalidation) {
  const list = [...STANDARD_LIMITATIONS];
  if (!invalidation.available) {
    list.push(
      "No scoped invalidation price is available from existing engine outputs for this scenario."
    );
  }
  return list;
}
function buildScenarioCore(id, role, focus, wave, bundle, options) {
  const presentation = bundle.presentation;
  const diagnostics = bundle.diagnostics;
  if (!focus && !wave) {
    return null;
  }
  const structure = focus?.structure ?? (wave ? structureForLabel2(wave.label) : "IMPULSE");
  const waveLabel = focus?.wave ?? wave.label;
  const engineStatus = wave?.status ?? focus?.status;
  let startIndex = focus?.startIndex ?? wave?.startIndex;
  let endIndex = focus?.endIndex ?? wave?.endIndex;
  let startPrice = null;
  let endPrice = null;
  if (role === "PRIMARY") {
    startPrice = bundle.primaryFocus.startPrice;
    endPrice = bundle.primaryFocus.endPrice;
    startIndex = bundle.primaryFocus.startIndex ?? startIndex;
    endIndex = bundle.primaryFocus.endIndex ?? endIndex;
  } else if (role === "ALTERNATIVE") {
    startPrice = bundle.alternativeFocus.startPrice;
    endPrice = bundle.alternativeFocus.endPrice;
    startIndex = bundle.alternativeFocus.startIndex ?? startIndex;
    endIndex = bundle.alternativeFocus.endIndex ?? endIndex;
  } else if (wave) {
    const leg = diagnostics.waveLegs.find((l) => l.label === wave.label);
    startIndex = leg?.startIndex ?? wave.startIndex;
    endIndex = leg?.endIndex ?? wave.endIndex;
    startPrice = leg?.startPrice ?? null;
    endPrice = leg?.endPrice ?? null;
  }
  const hasSegment = startIndex !== void 0 && endIndex !== void 0 && startIndex >= 0 && endIndex >= 0;
  const hasPrices = startPrice !== null && endPrice !== null;
  const status = !hasSegment || !hasPrices ? "INSUFFICIENT_CONTEXT" : mapEngineStatusToScenarioStatus(engineStatus, true);
  const confidence = focus?.confidence ?? wave?.confidence ?? 0;
  const invalidation = resolveScenarioInvalidation(
    presentation,
    focus,
    wave
  );
  const evidence = [];
  if (focus?.selectionReason) {
    evidence.push(`Presentation focus: ${focus.selectionReason}`);
  }
  if (wave) {
    evidence.push(
      `Engine wave leg: ${structure} Wave ${wave.label} (${wave.status}).`
    );
  }
  evidence.push(...mtfEvidence(bundle, options.multiTimeframe));
  evidence.push(
    ...hierarchyEvidenceForLeg(
      bundle.timeframeId,
      structure,
      waveLabel,
      options.hierarchy
    )
  );
  return {
    id,
    role,
    structure,
    waveLabel,
    engineStatus,
    status,
    confidence,
    startIndex: startIndex ?? -1,
    endIndex: endIndex ?? -1,
    startPrice: startPrice ?? 0,
    endPrice: endPrice ?? 0,
    invalidation,
    evidence,
    limitations: limitationsFor(invalidation)
  };
}
function scenarioFromFocus(role, bundle, options) {
  const focus = role === "PRIMARY" ? bundle.presentation.primary : bundle.presentation.alternative;
  if (!focus) {
    return null;
  }
  const wave = waveByLabel2(bundle.analysis.waves, focus.wave);
  const id = `${role.toLowerCase()}-${focus.structure.toLowerCase()}-${focus.wave}`;
  return buildScenarioCore(id, role, focus, wave ?? null, bundle, options);
}
function scenarioFromCandidate(wave, bundle, options) {
  const structure = structureForLabel2(wave.label);
  const id = `candidate-${structure.toLowerCase()}-${wave.label}`;
  const focus = {
    structure,
    scenario: "SELECTED",
    wave: wave.label,
    status: wave.status,
    confidence: wave.confidence,
    startIndex: wave.startIndex,
    endIndex: wave.endIndex,
    invalidationPrice: wave.invalidationPrice,
    selectionReason: "Flat engine wave candidate."
  };
  return buildScenarioCore(
    id,
    "CANDIDATE",
    focus,
    wave,
    bundle,
    options
  );
}
function buildWaveScenarios(bundle, options = {}) {
  const scenarios = [];
  const primary = scenarioFromFocus("PRIMARY", bundle, options);
  if (primary) {
    scenarios.push(primary);
  }
  const alternative = scenarioFromFocus("ALTERNATIVE", bundle, options);
  if (alternative) {
    scenarios.push(alternative);
  }
  for (const wave of bundle.presentation.engine.flatWaves) {
    scenarios.push(scenarioFromCandidate(wave, bundle, options));
  }
  scenarios.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: "1.0",
    timeframeId: bundle.timeframeId,
    symbol: options.symbol,
    scenarios
  };
}

// src/wave/wave-scanner.ts
var ROLE_ORDER = {
  PRIMARY: 0,
  ALTERNATIVE: 1,
  CANDIDATE: 2
};
function scenarioToScanResult(symbol, timeframe, scenario) {
  return {
    symbol,
    timeframe,
    scenarioId: scenario.id,
    role: scenario.role,
    structure: scenario.structure,
    waveLabel: scenario.waveLabel,
    engineStatus: scenario.engineStatus,
    scenarioStatus: scenario.status,
    confidence: scenario.confidence,
    startIndex: scenario.startIndex,
    endIndex: scenario.endIndex,
    startPrice: scenario.startPrice,
    endPrice: scenario.endPrice,
    invalidation: scenario.invalidation,
    evidence: [...scenario.evidence],
    limitations: [...scenario.limitations]
  };
}
function compareWaveScanResults(a, b) {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const tf = a.timeframe.localeCompare(b.timeframe);
  if (tf !== 0) {
    return tf;
  }
  const role = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
  if (role !== 0) {
    return role;
  }
  return a.scenarioId.localeCompare(b.scenarioId);
}
function sortResults(results) {
  return [...results].sort(compareWaveScanResults);
}
function scanSymbolWaveScenarios(input, options) {
  const bundle = buildTimeframeBundle(
    input.candles,
    options.timeframe,
    options.engineOptions
  );
  let multiTimeframe;
  let hierarchy;
  let optionalMtf;
  if (input.lowerCandles && input.lowerCandles.length > 0) {
    const mtfConfig = options.multiTimeframeConfig ?? {
      higherTimeframeId: options.timeframe,
      lowerTimeframeId: options.lowerTimeframe ?? DEFAULT_MULTI_TIMEFRAME_CONFIG.lowerTimeframeId
    };
    multiTimeframe = analyzeMultiTimeframe(
      input.candles,
      input.lowerCandles,
      mtfConfig,
      { symbol: input.symbol }
    );
    hierarchy = buildCandidateWaveHierarchy(
      multiTimeframe,
      input.candles,
      input.lowerCandles
    );
    optionalMtf = { multiTimeframe, hierarchy };
  }
  const scenarioReport = buildWaveScenarios(bundle, {
    symbol: input.symbol,
    multiTimeframe,
    hierarchy
  });
  const results = scenarioReport.scenarios.map(
    (s) => scenarioToScanResult(input.symbol, options.timeframe, s)
  );
  return { results: sortResults(results), optionalMtf };
}
function runWaveScan(inputs, options) {
  const results = [];
  const errors = [];
  const optionalMtfBySymbol = {};
  const symbols = [];
  for (const input of inputs) {
    symbols.push(input.symbol);
    try {
      if (input.candles.length === 0) {
        throw new Error("empty candle series");
      }
      const { results: symbolResults, optionalMtf } = scanSymbolWaveScenarios(
        input,
        options
      );
      results.push(...symbolResults);
      if (optionalMtf) {
        optionalMtfBySymbol[input.symbol] = optionalMtf;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        symbol: input.symbol,
        timeframe: options.timeframe,
        message
      });
    }
  }
  const sorted = sortResults(results);
  return {
    schemaVersion: "1.0",
    timeframe: options.timeframe,
    symbols: [...symbols].sort((a, b) => a.localeCompare(b)),
    results: sorted,
    analyzedSymbolCount: symbols.length - errors.length,
    scenarioCount: sorted.length,
    errors,
    optionalMtfBySymbol: Object.keys(optionalMtfBySymbol).length > 0 ? optionalMtfBySymbol : void 0
  };
}

// src/wave/setup/trade-setup-catalog.ts
var TRADE_SETUP_CATALOG = [
  {
    setupTypeId: "impulse-continuation",
    label: "Impulse continuation",
    description: "Trade setup template for selected impulse structure continuation (not an entry signal).",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    allowedStructures: ["IMPULSE"],
    allowedRoles: ["PRIMARY", "CANDIDATE"],
    requiresMtf: false,
    prerequisiteConditions: [
      "evaluation-bar-available",
      "impulse-context-available"
    ],
    triggerConditions: ["impulse-continuation-phase-active"],
    confirmationConditions: [
      "impulse-leading-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "w4-structure-conflict-clear",
      "fib-w12-conformance-met"
    ],
    tradeConfirmationConditions: [
      "impulse-leading-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "w4-structure-conflict-clear",
      "fib-w12-conformance-met"
    ],
    optionalConditions: []
  },
  {
    setupTypeId: "correction-end",
    label: "Correction end",
    description: "Trade setup template for corrective A-B-C with Wave C completion (not an entry signal).",
    category: "TRADE_SETUP",
    isTradeSetup: true,
    allowedStructures: ["CORRECTIVE"],
    allowedRoles: ["PRIMARY", "CANDIDATE"],
    allowedWaveLabels: ["C"],
    requiresMtf: false,
    prerequisiteConditions: [
      "evaluation-bar-available",
      "corrective-abc-context-available"
    ],
    triggerConditions: ["c-leg-started"],
    confirmationConditions: [
      "c-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "fib-abc-conformance-met"
    ],
    tradeConfirmationConditions: [
      "c-leg-confirmed-at-bar",
      "w2-not-invalidated",
      "fib-abc-conformance-met"
    ],
    optionalConditions: []
  }
];

// src/wave/setup/setup-catalog.ts
var STRUCTURAL_SETUP_CATALOG = [
  {
    setupTypeId: "primary-focus-leg",
    label: "Primary focus leg",
    description: "Structural readiness / watch context for presentation primary focus (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["PRIMARY"],
    triggerConditions: ["scenario-active", "segment-defined"],
    confirmationConditions: [
      "engine-not-invalidated",
      "invalidation-available"
    ],
    optionalConditions: [
      "fib-context-available",
      "presentation-trend-alignment",
      "mtf-relationship-allows"
    ],
    requiresMtf: false
  },
  {
    setupTypeId: "alternative-focus-leg",
    label: "Alternative focus leg",
    description: "Structural watch context for presentation alternative focus (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["ALTERNATIVE"],
    triggerConditions: ["scenario-active", "segment-defined"],
    confirmationConditions: [
      "engine-not-invalidated",
      "invalidation-available"
    ],
    optionalConditions: ["fib-context-available", "presentation-trend-alignment"],
    requiresMtf: false
  },
  {
    setupTypeId: "impulse-wave-segment",
    label: "Impulse wave segment",
    description: "Impulse wave segment classification from scanner scenarios (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedStructures: ["IMPULSE"],
    triggerConditions: ["segment-defined"],
    confirmationConditions: [
      "scenario-active",
      "engine-not-invalidated"
    ],
    optionalConditions: ["invalidation-available", "ht-trend-context"],
    requiresMtf: false
  },
  {
    setupTypeId: "corrective-wave-segment",
    label: "Corrective wave segment",
    description: "Corrective wave segment classification from scanner scenarios (not a trade setup).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedStructures: ["CORRECTIVE"],
    triggerConditions: ["segment-defined"],
    confirmationConditions: [
      "scenario-active",
      "engine-not-invalidated"
    ],
    optionalConditions: ["invalidation-available", "ht-trend-context"],
    requiresMtf: false
  },
  {
    setupTypeId: "mtf-primary-pair-context",
    label: "MTF primary-pair context",
    description: "MTF + hierarchy structural context for higher-TF primary focus (not trade confirmation).",
    category: "STRUCTURAL_CONTEXT",
    isTradeSetup: false,
    allowedRoles: ["PRIMARY"],
    requiresMtf: true,
    triggerConditions: [
      "scenario-active",
      "segment-defined",
      "mtf-context-present",
      "ht-trend-context"
    ],
    confirmationConditions: [
      "engine-not-invalidated",
      "mtf-relationship-aligned",
      "hierarchy-time-contained",
      "hierarchy-nesting-not-confirmed"
    ],
    optionalConditions: [
      "invalidation-available",
      "hierarchy-context-present",
      "mtf-relationship-allows",
      "presentation-trend-alignment"
    ]
  }
];
var SETUP_CATALOG = [
  ...STRUCTURAL_SETUP_CATALOG,
  ...TRADE_SETUP_CATALOG
];

// src/wave/setup/setup-rules.ts
var STANDARD_SETUP_LIMITATIONS = [
  "Setup detection does not compute entries, stops, targets, risk/reward, leverage, or executable trade directives.",
  "CANDIDATE: structural scenario/context matches catalog; trade-setup confirmation rules are not defined or not complete.",
  "CONFIRMED: reserved for isTradeSetup catalog types when all trade-setup confirmation rules are MET (none in current catalog).",
  "Engine wave CONFIRMED and scenario ACTIVE do not imply setup CONFIRMED.",
  "MTF NESTED_POSSIBLE and hierarchy NESTED_CANDIDATE do not imply parent/child trade confirmation."
];
function evaluateCondition(conditionId, ctx) {
  const row = ctx.scanRow;
  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;
  switch (conditionId) {
    case "scenario-active":
      if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Scenario lifecycle is INSUFFICIENT_CONTEXT."
        };
      }
      return {
        conditionId,
        outcome: row.scenarioStatus === "ACTIVE" ? "MET" : "NOT_MET",
        detail: `Scenario status is ${row.scenarioStatus}.`
      };
    case "engine-not-invalidated":
      if (row.engineStatus === void 0) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Engine status not present on scan row."
        };
      }
      return {
        conditionId,
        outcome: row.engineStatus === "INVALIDATED" ? "NOT_MET" : "MET",
        detail: `Engine status is ${row.engineStatus}.`
      };
    case "segment-defined": {
      const ok = row.startIndex >= 0 && row.endIndex >= 0 && row.endIndex >= row.startIndex && Number.isFinite(row.startPrice) && Number.isFinite(row.endPrice) && !(row.startPrice === 0 && row.endPrice === 0);
      if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Scenario marked INSUFFICIENT_CONTEXT; segment not reliable."
        };
      }
      return {
        conditionId,
        outcome: ok ? "MET" : "NOT_MET",
        detail: ok ? `Segment indices ${row.startIndex}\u2013${row.endIndex} with prices.` : "Segment indices or prices missing on scan row."
      };
    }
    case "invalidation-available":
      return {
        conditionId,
        outcome: row.invalidation.available ? "MET" : "NOT_MET",
        detail: row.invalidation.available ? "Scenario invalidation object is available." : "No invalidation price in scenario layer output."
      };
    case "setup-invalidation-triggered": {
      const triggered = row.scenarioStatus === "INVALIDATED" || row.engineStatus === "INVALIDATED";
      return {
        conditionId,
        outcome: triggered ? "MET" : "NOT_MET",
        detail: triggered ? "Scenario or engine leg is INVALIDATED." : "No invalidation trigger on scenario/engine status."
      };
    }
    case "ht-trend-context":
      if (!mtf) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Higher-timeframe bundle not in optional MTF context."
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Higher TF trend ${mtf.trendAlignment.higherTrend}.`
      };
    case "mtf-context-present":
      return {
        conditionId,
        outcome: mtf ? "MET" : "INSUFFICIENT_DATA",
        detail: mtf ? "Multi-timeframe state supplied for symbol." : "MTF context missing from scan report optionalMtfBySymbol."
      };
    case "mtf-relationship-allows": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "No MTF context; relationship not evaluated."
        };
      }
      const kind = mtf.relationship.kind;
      const allows = kind === "ALIGNED" || kind === "NESTED_POSSIBLE";
      return {
        conditionId,
        outcome: allows ? "MET" : "NOT_MET",
        detail: `MTF relationship ${kind} (${mtf.relationship.summary}).`
      };
    }
    case "mtf-relationship-aligned": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "MTF required but missing."
        };
      }
      const kind = mtf.relationship.kind;
      return {
        conditionId,
        outcome: kind === "ALIGNED" ? "MET" : "NOT_MET",
        detail: kind === "NESTED_POSSIBLE" ? "NESTED_POSSIBLE does not satisfy aligned confirmation." : `MTF relationship ${kind}.`
      };
    }
    case "hierarchy-context-present":
      return {
        conditionId,
        outcome: hierarchy ? "MET" : "NOT_APPLICABLE",
        detail: hierarchy ? "Hierarchy report present." : "No hierarchy in optional context."
      };
    case "hierarchy-time-contained": {
      if (!hierarchy) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Hierarchy report required for this confirmation."
        };
      }
      const pair = hierarchy.primaryPair;
      if (!pair) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "No hierarchy primary pair."
        };
      }
      return {
        conditionId,
        outcome: pair.timeRelation === "TIME_CONTAINED" ? "MET" : "NOT_MET",
        detail: `Primary pair time relation ${pair.timeRelation}; nesting ${pair.relationship}.`
      };
    }
    case "hierarchy-nesting-not-confirmed": {
      if (!hierarchy?.primaryPair) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "No hierarchy primary pair to mis-label as confirmed nesting."
        };
      }
      const rel = hierarchy.primaryPair.relationship;
      if (rel === "NESTED_CANDIDATE" || rel === "POSSIBLE_NESTING") {
        return {
          conditionId,
          outcome: "MET",
          detail: `${rel} is not treated as confirmed parent/child.`
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Hierarchy relationship ${rel} \u2014 no false parent/child confirmation.`
      };
    }
    case "fib-context-available":
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Fibonacci context is not part of WaveScanReport input contract."
      };
    case "presentation-trend-alignment": {
      if (!mtf) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "MTF not supplied."
        };
      }
      const cmp = mtf.trendAlignment.comparison;
      return {
        conditionId,
        outcome: cmp === "SAME" || cmp === "PARTIAL_NEUTRAL" ? "MET" : "NOT_MET",
        detail: `Trend comparison ${cmp} (higher ${mtf.trendAlignment.higherTrend}, lower ${mtf.trendAlignment.lowerTrend}).`
      };
    }
    default:
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Unknown condition id."
      };
  }
}
function allRequiredMet(evaluations) {
  return evaluations.every((e) => e.outcome === "MET");
}
function hasInsufficientData(evaluations) {
  return evaluations.some((e) => e.outcome === "INSUFFICIENT_DATA");
}
function resolveSetupLifecycleStatus(row, catalog, triggerEvals, confirmationEvals, invalidationEvals, contextInsufficient) {
  if (row.scenarioStatus === "INVALIDATED") {
    return "INVALID";
  }
  if (contextInsufficient) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  const invalidationTriggered = invalidationEvals.some(
    (e) => e.conditionId === "setup-invalidation-triggered" && e.outcome === "MET"
  );
  if (invalidationTriggered) {
    return "INVALID";
  }
  const requiredEvals = [...triggerEvals, ...confirmationEvals];
  if (hasInsufficientData(requiredEvals)) {
    return "INSUFFICIENT_CONTEXT";
  }
  const triggerReady = allRequiredMet(triggerEvals);
  const confirmationReady = allRequiredMet(confirmationEvals);
  if (triggerReady && confirmationReady) {
    if (catalog.isTradeSetup) {
      return "CONFIRMED";
    }
    return "CANDIDATE";
  }
  if (row.scenarioStatus === "ACTIVE" || triggerReady) {
    return "CANDIDATE";
  }
  return "INSUFFICIENT_CONTEXT";
}
function catalogMatchesScanRow(entry, row) {
  if (entry.allowedRoles && !entry.allowedRoles.includes(row.role)) {
    return false;
  }
  if (entry.allowedStructures && !entry.allowedStructures.includes(row.structure)) {
    return false;
  }
  if (entry.allowedWaveLabels && !entry.allowedWaveLabels.includes(row.waveLabel)) {
    return false;
  }
  return true;
}
function resolveDirectionalBias(row, ctx) {
  const mtf = ctx.symbolContext?.multiTimeframe;
  const bundle = mtf?.higherTimeframe.timeframeId === row.timeframe ? mtf.higherTimeframe : mtf?.lowerTimeframe.timeframeId === row.timeframe ? mtf.lowerTimeframe : void 0;
  if (row.structure === "IMPULSE" && bundle) {
    const track = bundle.presentation.tracks.selectedImpulse;
    if (track.countDirection === "BULLISH" || track.countDirection === "BEARISH") {
      return {
        bias: track.countDirection,
        basis: "IMPULSE_COUNT_DIRECTION"
      };
    }
  }
  if (row.waveLabel === "5" || row.waveLabel === "C") {
    return { bias: null, basis: null };
  }
  if (Number.isFinite(row.startPrice) && Number.isFinite(row.endPrice) && row.startPrice !== row.endPrice) {
    return {
      bias: row.endPrice > row.startPrice ? "BULLISH" : "BEARISH",
      basis: "LEG_PRICE_DELTA"
    };
  }
  return { bias: null, basis: null };
}
function buildReferenceLevels(row, ctx) {
  const levels = [
    {
      kind: "SEGMENT_START",
      label: "Segment start",
      price: row.startPrice,
      index: row.startIndex,
      timeframe: row.timeframe
    },
    {
      kind: "SEGMENT_END",
      label: "Segment end",
      price: row.endPrice,
      index: row.endIndex,
      timeframe: row.timeframe
    }
  ];
  if (row.invalidation.available && row.invalidation.price !== void 0) {
    levels.push({
      kind: "SCENARIO_INVALIDATION",
      label: "Scenario invalidation",
      price: row.invalidation.price,
      note: row.invalidation.rule,
      invalidationSource: row.invalidation.source
    });
  }
  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;
  if (mtf && row.role === "PRIMARY") {
    const lower = mtf.lowerTimeframe.primaryFocus;
    if (lower.startPrice !== null && lower.endPrice !== null) {
      levels.push({
        kind: "MTF_LOWER_SEGMENT_START",
        label: "Lower TF primary segment start",
        price: lower.startPrice,
        index: lower.startIndex ?? void 0,
        timeframe: mtf.lowerTimeframe.timeframeId
      });
      levels.push({
        kind: "MTF_LOWER_SEGMENT_END",
        label: "Lower TF primary segment end",
        price: lower.endPrice,
        index: lower.endIndex ?? void 0,
        timeframe: mtf.lowerTimeframe.timeframeId
      });
    }
  }
  if (hierarchy?.primaryPair) {
    const pp = hierarchy.primaryPair;
    levels.push({
      kind: "HIERARCHY_HIGHER_SEGMENT",
      label: `Higher ${pp.higherWave.structure} ${pp.higherWave.label}`,
      price: pp.higherWave.lowPrice,
      index: pp.higherWave.startIndex,
      timeframe: hierarchy.higherTimeframe,
      note: pp.reason
    });
    levels.push({
      kind: "HIERARCHY_LOWER_SEGMENT",
      label: `Lower ${pp.lowerWave.structure} ${pp.lowerWave.label}`,
      price: pp.lowerWave.lowPrice,
      index: pp.lowerWave.startIndex,
      timeframe: hierarchy.lowerTimeframe,
      note: pp.relationship
    });
  }
  return levels;
}
function summarizeConditions(evaluations, prefix) {
  const parts = evaluations.map((e) => `${e.conditionId}=${e.outcome}`);
  return `${prefix}: ${parts.join("; ")}`;
}
function standardSetupLimitations() {
  return [...STANDARD_SETUP_LIMITATIONS];
}
function isContextInsufficientForCatalog(entry, ctx) {
  if (!entry.requiresMtf) {
    return false;
  }
  return !ctx.symbolContext?.multiTimeframe;
}

// src/wave/setup/trade-setup-rules.ts
var IMPULSE_PHASE_LABELS = ["3", "4", "5"];
var FIB_W12_MIN_CONFORMANCE = 0.01;
function legDiagnostic(bundle, structure, label) {
  return bundle.diagnostics.waveLegs.find(
    (l) => l.structure === structure && l.label === label
  );
}
function waveAtBar(bundle, label) {
  const w = bundle.presentation.engine.flatWaves.find((x) => x.label === label);
  if (!w) {
    return null;
  }
  return w;
}
function legConfirmedAtOrBeforeBar(bundle, label) {
  if (!bundle.evaluationBarBoundaryEstablished) {
    return false;
  }
  const w = waveAtBar(bundle, label);
  if (!w) {
    return false;
  }
  if (w.status === "POTENTIAL") {
    return false;
  }
  if (w.status !== "CONFIRMED") {
    return false;
  }
  return w.endIndex <= bundle.evaluationBarIndex;
}
function evaluateTradeCondition(conditionId, ctx) {
  const row = ctx.scanRow;
  const bundle = ctx.bundle;
  switch (conditionId) {
    case "evaluation-bar-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Symbol evaluation bundle missing from TradeSetupEvaluationContext."
        };
      }
      if (!bundle.evaluationBarBoundaryEstablished) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: bundle.evaluationBarContractDetail
        };
      }
      if (bundle.evaluationBarIndex < 0 || bundle.evaluationBarIndex >= bundle.candleCount) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: `evaluationBarIndex ${bundle.evaluationBarIndex} out of range.`
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Closed evaluation bar index ${bundle.evaluationBarIndex}: ${bundle.evaluationBarContractDetail}`
      };
    case "impulse-context-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const w1 = legDiagnostic(bundle, "IMPULSE", "1");
      const w2 = legDiagnostic(bundle, "IMPULSE", "2");
      if (w1 && w2) {
        return {
          conditionId,
          outcome: "MET",
          detail: "Impulse waves 1 and 2 present in diagnostics snapshot."
        };
      }
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Impulse waves 1\u20132 not available in diagnostics snapshot."
      };
    case "corrective-abc-context-available":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const a = legDiagnostic(bundle, "CORRECTIVE", "A");
      const b = legDiagnostic(bundle, "CORRECTIVE", "B");
      const c = legDiagnostic(bundle, "CORRECTIVE", "C");
      if (a && b && c) {
        return {
          conditionId,
          outcome: "MET",
          detail: "Corrective A, B, and C legs present in diagnostics snapshot."
        };
      }
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Corrective A-B-C context incomplete in diagnostics snapshot."
      };
    case "impulse-continuation-phase-active": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const focusLabel = row.waveLabel;
      if (!IMPULSE_PHASE_LABELS.includes(focusLabel)) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: `Scenario wave ${focusLabel} is not impulse continuation phase (3/4/5).`
        };
      }
      const w = waveAtBar(bundle, focusLabel);
      if (!w || w.endIndex > bundle.evaluationBarIndex) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Impulse phase leg not visible within evaluation bar window."
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: `Impulse wave ${focusLabel} segment within evaluation boundary.`
      };
    }
    case "c-leg-started":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const cLeg = legDiagnostic(bundle, "CORRECTIVE", "C");
      if (!cLeg || cLeg.startIndex > bundle.evaluationBarIndex) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Wave C not started within evaluation bar window."
        };
      }
      return {
        conditionId,
        outcome: "MET",
        detail: "Wave C leg started within evaluation boundary."
      };
    case "w2-not-invalidated": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const w22 = waveAtBar(bundle, "2");
      if (!w22) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "Wave 2 not in engine snapshot."
        };
      }
      return {
        conditionId,
        outcome: w22.status === "INVALIDATED" ? "NOT_MET" : "MET",
        detail: `Wave 2 status ${w22.status}.`
      };
    }
    case "w4-structure-conflict-clear": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const w4 = waveAtBar(bundle, "4");
      if (!w4) {
        return {
          conditionId,
          outcome: "NOT_APPLICABLE",
          detail: "Wave 4 not present."
        };
      }
      return {
        conditionId,
        outcome: w4.structureConflict ? "NOT_MET" : "MET",
        detail: w4.structureConflict ? "Wave 4 structure conflict flagged by engine." : "Wave 4 has no structure conflict."
      };
    }
    case "impulse-leading-leg-confirmed-at-bar": {
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const label = row.waveLabel;
      if (!IMPULSE_PHASE_LABELS.includes(label)) {
        return {
          conditionId,
          outcome: "NOT_MET",
          detail: "Not an impulse continuation leg label."
        };
      }
      const ok2 = legConfirmedAtOrBeforeBar(bundle, label);
      return {
        conditionId,
        outcome: ok2 ? "MET" : "NOT_MET",
        detail: ok2 ? `Impulse wave ${label} CONFIRMED at or before evaluation bar.` : `Impulse wave ${label} is POTENTIAL or beyond evaluation bar.`
      };
    }
    case "c-leg-confirmed-at-bar":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const ok = legConfirmedAtOrBeforeBar(bundle, "C");
      return {
        conditionId,
        outcome: ok ? "MET" : "NOT_MET",
        detail: ok ? "Wave C CONFIRMED at or before evaluation bar." : "Wave C not CONFIRMED at evaluation bar (POTENTIAL or open)."
      };
    case "fib-w12-conformance-met":
      if (!bundle) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: "Bundle required."
        };
      }
      const fib = bundle.diagnostics.fibonacci;
      if (!fib.available) {
        return {
          conditionId,
          outcome: "INSUFFICIENT_DATA",
          detail: fib.note ?? "W1\u2013W2 fibonacci not in diagnostics snapshot."
        };
      }
      const score = fib.conformanceScore ?? 0;
      const hasMatch = fib.nearestMatch != null;
      if (hasMatch && score >= FIB_W12_MIN_CONFORMANCE) {
        return {
          conditionId,
          outcome: "MET",
          detail: "W1\u2013W2 fibonacci conformance present in snapshot."
        };
      }
      return {
        conditionId,
        outcome: "NOT_MET",
        detail: "W1\u2013W2 fibonacci conformance not met in snapshot."
      };
    case "fib-abc-conformance-met":
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "A-B-C fibonacci is not part of current diagnostics contract; correction-end cannot confirm fib."
      };
    default:
      return {
        conditionId,
        outcome: "INSUFFICIENT_DATA",
        detail: "Unknown trade condition."
      };
  }
}
var SHARED_TRADE_PREREQUISITES = [
  "scenario-active",
  "engine-not-invalidated",
  "invalidation-available",
  "segment-defined"
];
function allMet(evaluations) {
  return evaluations.every((e) => e.outcome === "MET");
}
function hasInsufficient(evaluations) {
  return evaluations.some((e) => e.outcome === "INSUFFICIENT_DATA");
}
function resolveTradeSetupLifecycleStatus(row, entry, prerequisiteEvals, triggerEvals, tradeConfirmationEvals, invalidationEvals) {
  if (row.scenarioStatus === "INVALIDATED") {
    return "INVALID";
  }
  const invalidationTriggered = invalidationEvals.some(
    (e) => e.conditionId === "setup-invalidation-triggered" && e.outcome === "MET"
  );
  if (invalidationTriggered) {
    return "INVALID";
  }
  if (row.scenarioStatus === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  const required = [
    ...prerequisiteEvals,
    ...triggerEvals,
    ...tradeConfirmationEvals
  ];
  if (hasInsufficient(required)) {
    return "INSUFFICIENT_CONTEXT";
  }
  const prereqReady = allMet(prerequisiteEvals);
  const triggerReady = allMet(triggerEvals);
  const confirmReady = allMet(tradeConfirmationEvals);
  if (prereqReady && triggerReady && confirmReady) {
    return "CONFIRMED";
  }
  if (prereqReady || triggerReady || row.scenarioStatus === "ACTIVE") {
    return "CANDIDATE";
  }
  return "INSUFFICIENT_CONTEXT";
}
function evaluateSharedTradePrerequisites(ctx) {
  const base = { scanRow: ctx.scanRow, symbolContext: ctx.symbolContext };
  return SHARED_TRADE_PREREQUISITES.map((id) => evaluateCondition(id, base));
}
function resolveTradeDirectionalBias(ctx) {
  const bundle = ctx.bundle;
  if (!bundle) {
    return { bias: null, basis: null };
  }
  const track = bundle.presentation.tracks.selectedImpulse;
  if (track.countDirection === "BULLISH" || track.countDirection === "BEARISH") {
    return { bias: track.countDirection, basis: "IMPULSE_COUNT_DIRECTION" };
  }
  return { bias: null, basis: null };
}
function overlapFiveCNote(bundle) {
  if (!bundle) {
    return void 0;
  }
  const hit = bundle.diagnostics.overlaps.some((o) => {
    const labels = o.legs.map((l) => `${l.structure}${l.label}`);
    return labels.some((x) => x.includes("5")) && labels.some((x) => x.includes("C"));
  });
  if (hit) {
    return "Impulse Wave 5 and corrective Wave C share segment context; no ranking or winner selection applied.";
  }
  return void 0;
}

// src/wave/setup/setup-types.ts
var SETUP_SCHEMA_VERSION = "1.0";

// src/wave/setup/trade-setup-detector.ts
function detectTradeSetups(tradeContext, symbolContextBySymbol, errors) {
  const report = tradeContext.scanReport;
  const candidates = [];
  for (const row of report.results) {
    const bundle = tradeContext.bundlesBySymbol?.[row.symbol];
    const ctxRow = {
      scanRow: row,
      bundle,
      symbolContext: symbolContextBySymbol[row.symbol]
    };
    for (const entry of TRADE_SETUP_CATALOG) {
      if (!catalogMatchesScanRow(entry, row)) {
        continue;
      }
      try {
        candidates.push(buildTradeCandidate(row, entry, ctxRow));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          symbol: row.symbol,
          timeframe: row.timeframe,
          scenarioId: row.scenarioId,
          setupTypeId: entry.setupTypeId,
          message
        });
      }
    }
  }
  return candidates;
}
function buildTradeCandidate(row, entry, ctxRow) {
  const baseCtx = {
    scanRow: row,
    symbolContext: ctxRow.symbolContext
  };
  const sharedPrereq = evaluateSharedTradePrerequisites(ctxRow);
  const tradePrereq = entry.prerequisiteConditions.map(
    (id2) => evaluateTradeCondition(id2, ctxRow)
  );
  const prerequisiteEvals = [...sharedPrereq, ...tradePrereq];
  const triggerEvals = entry.triggerConditions.map(
    (id2) => evaluateTradeCondition(id2, ctxRow)
  );
  const tradeConfirmationEvals = entry.tradeConfirmationConditions.map(
    (id2) => evaluateTradeCondition(id2, ctxRow)
  );
  const invalidationEvals = [
    evaluateCondition("setup-invalidation-triggered", baseCtx)
  ];
  const status = resolveTradeSetupLifecycleStatus(
    row,
    entry,
    prerequisiteEvals,
    triggerEvals,
    tradeConfirmationEvals,
    invalidationEvals
  );
  const { bias, basis } = resolveTradeDirectionalBias(ctxRow);
  const evaluationNotes = [];
  if (bias === null) {
    evaluationNotes.push(
      "Directional bias not set from wave label; IMPULSE_COUNT_DIRECTION unavailable or not used."
    );
  }
  const overlap = overlapFiveCNote(ctxRow.bundle);
  if (overlap) {
    evaluationNotes.push(overlap);
  }
  for (const e of tradeConfirmationEvals) {
    if (e.conditionId === "fib-abc-conformance-met" && e.outcome === "INSUFFICIENT_DATA") {
      evaluationNotes.push(
        "correction-end: A-B-C fibonacci not in diagnostics contract \u2192 INSUFFICIENT_CONTEXT for confirmed trade setup."
      );
    }
  }
  const mtf = ctxRow.symbolContext?.multiTimeframe;
  const hierarchy = ctxRow.symbolContext?.hierarchy;
  const limitations = [
    ...standardSetupLimitations(),
    "Trade setup CONFIRMED enables Entry Plan eligibility only; it is not a trade signal.",
    ...row.limitations
  ];
  const id = `${row.symbol}:${row.timeframe}:${entry.setupTypeId}:${row.scenarioId}`;
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    scenarioRef: {
      scenarioId: row.scenarioId,
      role: row.role,
      structure: row.structure,
      waveLabel: row.waveLabel,
      scenarioStatus: row.scenarioStatus,
      engineStatus: row.engineStatus
    },
    setupTypeId: entry.setupTypeId,
    setupTypeLabel: entry.label,
    category: entry.category,
    isTradeSetup: true,
    status,
    directionalBias: bias,
    directionalBasis: basis,
    trigger: {
      conditions: triggerEvals,
      summary: summarizeConditions(triggerEvals, "Trigger")
    },
    confirmation: {
      conditions: tradeConfirmationEvals,
      summary: summarizeConditions(tradeConfirmationEvals, "TradeConfirmation")
    },
    invalidation: {
      conditions: invalidationEvals,
      summary: summarizeConditions(invalidationEvals, "Invalidation"),
      usesScenarioInvalidation: row.invalidation.available
    },
    referenceLevels: buildReferenceLevels(row, baseCtx),
    sourceScenario: {
      confidence: row.confidence,
      startIndex: row.startIndex,
      endIndex: row.endIndex,
      startPrice: row.startPrice,
      endPrice: row.endPrice,
      evidence: [...row.evidence],
      limitations: [...row.limitations]
    },
    context: {
      marketTrendHigher: mtf?.trendAlignment.higherTrend,
      marketTrendLower: mtf?.trendAlignment.lowerTrend,
      mtfRelationshipKind: mtf?.relationship.kind,
      hierarchyPrimaryRelationship: hierarchy?.primaryPair?.relationship
    },
    setupLimitations: limitations,
    evaluationNotes
  };
}

// src/wave/setup/setup-detector.ts
function compareCandidates2(a, b) {
  const sym = a.symbol.localeCompare(b.symbol);
  if (sym !== 0) {
    return sym;
  }
  const tf = a.timeframe.localeCompare(b.timeframe);
  if (tf !== 0) {
    return tf;
  }
  const type = a.setupTypeId.localeCompare(b.setupTypeId);
  if (type !== 0) {
    return type;
  }
  return a.scenarioRef.scenarioId.localeCompare(b.scenarioRef.scenarioId);
}
function symbolContextFromReport(report, symbol) {
  const block = report.optionalMtfBySymbol?.[symbol];
  if (!block) {
    return void 0;
  }
  return {
    multiTimeframe: block.multiTimeframe,
    hierarchy: block.hierarchy
  };
}
function buildCandidateForRow(row, entry, ctx) {
  const contextInsufficient = isContextInsufficientForCatalog(entry, ctx);
  const triggerEvals = entry.triggerConditions.map(
    (id2) => evaluateCondition(id2, ctx)
  );
  const confirmationEvals = entry.confirmationConditions.map(
    (id2) => evaluateCondition(id2, ctx)
  );
  const invalidationEvals = [
    evaluateCondition("setup-invalidation-triggered", ctx)
  ];
  const optionalEvals = entry.optionalConditions.map(
    (id2) => evaluateCondition(id2, ctx)
  );
  const status = resolveSetupLifecycleStatus(
    row,
    entry,
    triggerEvals,
    confirmationEvals,
    invalidationEvals,
    contextInsufficient
  );
  const { bias, basis } = resolveDirectionalBias(row, ctx);
  const evaluationNotes = [];
  if (bias === null) {
    evaluationNotes.push(
      "Directional bias not inferred from wave label; no IMPULSE_COUNT_DIRECTION or eligible LEG_PRICE_DELTA."
    );
  }
  if (contextInsufficient) {
    evaluationNotes.push(
      "Setup type requires MTF context missing from WaveScanReport.optionalMtfBySymbol."
    );
  }
  for (const o of optionalEvals) {
    if (o.outcome === "INSUFFICIENT_DATA") {
      evaluationNotes.push(`${o.conditionId}: ${o.detail}`);
    }
  }
  if (!entry.isTradeSetup && status === "CANDIDATE") {
    const triggerReady = triggerEvals.every((e) => e.outcome === "MET");
    const confirmationReady = confirmationEvals.every((e) => e.outcome === "MET");
    if (triggerReady && confirmationReady) {
      evaluationNotes.push(
        "Structural catalog conditions are MET; trade setup CONFIRMED is disabled for this type (isTradeSetup false)."
      );
    }
  }
  const mtf = ctx.symbolContext?.multiTimeframe;
  const hierarchy = ctx.symbolContext?.hierarchy;
  const limitations = [
    ...standardSetupLimitations(),
    ...row.limitations
  ];
  const id = `${row.symbol}:${row.timeframe}:${entry.setupTypeId}:${row.scenarioId}`;
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    scenarioRef: {
      scenarioId: row.scenarioId,
      role: row.role,
      structure: row.structure,
      waveLabel: row.waveLabel,
      scenarioStatus: row.scenarioStatus,
      engineStatus: row.engineStatus
    },
    setupTypeId: entry.setupTypeId,
    setupTypeLabel: entry.label,
    category: entry.category,
    isTradeSetup: entry.isTradeSetup,
    status,
    directionalBias: bias,
    directionalBasis: basis,
    trigger: {
      conditions: triggerEvals,
      summary: summarizeConditions(triggerEvals, "Trigger")
    },
    confirmation: {
      conditions: confirmationEvals,
      summary: summarizeConditions(confirmationEvals, "Confirmation")
    },
    invalidation: {
      conditions: invalidationEvals,
      summary: summarizeConditions(invalidationEvals, "Invalidation"),
      usesScenarioInvalidation: row.invalidation.available
    },
    referenceLevels: buildReferenceLevels(row, ctx),
    sourceScenario: {
      confidence: row.confidence,
      startIndex: row.startIndex,
      endIndex: row.endIndex,
      startPrice: row.startPrice,
      endPrice: row.endPrice,
      evidence: [...row.evidence],
      limitations: [...row.limitations]
    },
    context: {
      marketTrendHigher: mtf?.trendAlignment.higherTrend,
      marketTrendLower: mtf?.trendAlignment.lowerTrend,
      mtfRelationshipKind: mtf?.relationship.kind,
      hierarchyPrimaryRelationship: hierarchy?.primaryPair?.relationship
    },
    setupLimitations: limitations,
    evaluationNotes
  };
}
function detectForScanRow(row, symbolContext, errors) {
  const candidates = [];
  const ctx = { scanRow: row, symbolContext };
  for (const entry of STRUCTURAL_SETUP_CATALOG) {
    if (!catalogMatchesScanRow(entry, row)) {
      continue;
    }
    try {
      candidates.push(buildCandidateForRow(row, entry, ctx));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        symbol: row.symbol,
        timeframe: row.timeframe,
        scenarioId: row.scenarioId,
        setupTypeId: entry.setupTypeId,
        message
      });
    }
  }
  return candidates;
}
function detectSetups(input) {
  const report = input.tradeContext?.scanReport ?? input.scanReport;
  const candidates = [];
  const errors = [...report.errors.map((e) => ({
    symbol: e.symbol,
    timeframe: e.timeframe,
    message: `Scan error (setup skipped for symbol): ${e.message}`
  }))];
  const rowsBySymbol = /* @__PURE__ */ new Map();
  for (const row of report.results) {
    const list = rowsBySymbol.get(row.symbol) ?? [];
    list.push(row);
    rowsBySymbol.set(row.symbol, list);
  }
  if (input.tradeContext) {
    const ctxBySymbol = {};
    for (const sym of report.symbols) {
      ctxBySymbol[sym] = symbolContextFromReport(report, sym);
    }
    candidates.push(
      ...detectTradeSetups(input.tradeContext, ctxBySymbol, errors)
    );
  }
  for (const [symbol, rows] of rowsBySymbol) {
    const symbolContext = symbolContextFromReport(report, symbol);
    for (const row of rows) {
      try {
        candidates.push(...detectForScanRow(row, symbolContext, errors));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          symbol: row.symbol,
          timeframe: row.timeframe,
          scenarioId: row.scenarioId,
          message
        });
      }
    }
  }
  const sorted = [...candidates].sort(compareCandidates2);
  errors.sort((a, b) => {
    const sym = a.symbol.localeCompare(b.symbol);
    if (sym !== 0) {
      return sym;
    }
    return (a.setupTypeId ?? "").localeCompare(b.setupTypeId ?? "");
  });
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    timeframe: report.timeframe,
    symbols: [...report.symbols].sort((a, b) => a.localeCompare(b)),
    candidates: sorted,
    candidateCount: sorted.length,
    errors,
    limitations: standardSetupLimitations()
  };
}

// src/wave/evaluation-scoped-invariants.ts
var IMPULSE_LABELS4 = ["1", "2", "3", "4", "5"];
function pushIfOver(violations, kind, index, bar) {
  if (index > bar) {
    violations.push(`${kind} index ${index} exceeds evaluationBarIndex ${bar}`);
  }
}
function collectEvaluationScopedInvariantViolations(presentation, diagnostics, evaluationBarIndex) {
  const violations = [];
  const bar = evaluationBarIndex;
  for (const w of presentation.engine.flatWaves) {
    pushIfOver(violations, `flatWave ${w.label} start`, w.startIndex, bar);
    pushIfOver(violations, `flatWave ${w.label} end`, w.endIndex, bar);
  }
  const pushLeg = (structure, label, start, end) => {
    pushIfOver(violations, `${structure} ${label} start`, start, bar);
    pushIfOver(violations, `${structure} ${label} end`, end, bar);
  };
  for (const track of [
    presentation.tracks.selectedImpulse,
    presentation.tracks.corrective,
    presentation.tracks.rivalImpulse
  ]) {
    if (!track) {
      continue;
    }
    for (const leg of track.legs) {
      pushLeg(leg.structure, leg.label, leg.startIndex, leg.endIndex);
    }
  }
  for (const o of presentation.overlaps) {
    pushIfOver(violations, "overlap start", o.startIndex, bar);
    pushIfOver(violations, "overlap end", o.endIndex, bar);
  }
  if (presentation.primary) {
    pushIfOver(
      violations,
      "focus primary start",
      presentation.primary.startIndex,
      bar
    );
    pushIfOver(
      violations,
      "focus primary end",
      presentation.primary.endIndex,
      bar
    );
  }
  if (presentation.alternative) {
    pushIfOver(
      violations,
      "focus alternative start",
      presentation.alternative.startIndex,
      bar
    );
    pushIfOver(
      violations,
      "focus alternative end",
      presentation.alternative.endIndex,
      bar
    );
  }
  for (const s of diagnostics.confirmedSwings) {
    pushIfOver(violations, "confirmedSwing", s.index, bar);
  }
  for (const leg of diagnostics.waveLegs) {
    pushIfOver(
      violations,
      `waveLeg ${leg.structure} ${leg.label} start`,
      leg.startIndex,
      bar
    );
    pushIfOver(
      violations,
      `waveLeg ${leg.structure} ${leg.label} end`,
      leg.endIndex,
      bar
    );
  }
  const fib = diagnostics.fibonacci;
  if (fib.wave1StartIndex !== void 0) {
    pushIfOver(violations, "fib wave1Start", fib.wave1StartIndex, bar);
  }
  if (fib.wave1EndIndex !== void 0) {
    pushIfOver(violations, "fib wave1End", fib.wave1EndIndex, bar);
  }
  if (fib.wave2EndIndex !== void 0) {
    pushIfOver(violations, "fib wave2End", fib.wave2EndIndex, bar);
  }
  for (const label of IMPULSE_LABELS4) {
    const w = presentation.engine.flatWaves.find((x) => x.label === label);
    if (w && w.endIndex > bar) {
      violations.push(
        `POTENTIAL_OR_WAVE end beyond bar: ${label} endIndex=${w.endIndex}`
      );
    }
  }
  return violations;
}

// src/wave/setup/trade-setup-evaluation-bar.ts
function resolveTradeSetupEvaluationBoundary(input) {
  const n = input.candles.length;
  if (n === 0) {
    return {
      evaluationBarIndex: -1,
      boundaryEstablished: false,
      contractDetail: "Empty candle series."
    };
  }
  const lastIndex = n - 1;
  const explicit = input.evaluationBarIndex;
  if (input.closedSeriesOnly === true) {
    const bar = explicit !== void 0 ? Math.max(0, Math.min(explicit, lastIndex)) : lastIndex;
    return {
      evaluationBarIndex: bar,
      boundaryEstablished: true,
      contractDetail: "closedSeriesOnly attestation: all candles treated as closed; evaluation bar is within closed series."
    };
  }
  if (explicit !== void 0) {
    const bar = Math.max(0, Math.min(explicit, lastIndex));
    if (bar < lastIndex) {
      return {
        evaluationBarIndex: bar,
        boundaryEstablished: true,
        contractDetail: "Explicit evaluationBarIndex before final array element; final candle may be open."
      };
    }
    return {
      evaluationBarIndex: bar,
      boundaryEstablished: false,
      contractDetail: "evaluationBarIndex points at last candle without closedSeriesOnly attestation; open candle cannot be ruled out."
    };
  }
  return {
    evaluationBarIndex: -1,
    boundaryEstablished: false,
    contractDetail: "No evaluationBarIndex and no closedSeriesOnly attestation; closed boundary unknown."
  };
}

// src/wave/evaluation-scoped-analysis.ts
function insufficient(evaluationBarIndex, inputCandleCount, detail) {
  return {
    status: "INSUFFICIENT_CONTEXT",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: 0,
      maxCandleIndexUsed: -1,
      boundaryEstablished: false,
      contractDetail: detail
    },
    analysis: null,
    presentation: null,
    diagnostics: null,
    impulseBullish: true,
    futureSafe: false,
    invariantViolations: [],
    detail
  };
}
function invalidIndex(evaluationBarIndex, inputCandleCount, detail) {
  return {
    status: "INVALID_EVALUATION_INDEX",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: 0,
      maxCandleIndexUsed: -1,
      boundaryEstablished: false,
      contractDetail: detail
    },
    analysis: null,
    presentation: null,
    diagnostics: null,
    impulseBullish: true,
    futureSafe: false,
    invariantViolations: [],
    detail
  };
}
function analyzeWaveAtEvaluationBar(input) {
  const { candles, engineOptions } = input;
  const inputCandleCount = candles.length;
  if (inputCandleCount === 0) {
    return insufficient(-1, 0, "Empty candle series.");
  }
  const explicit = input.evaluationBarIndex;
  if (explicit !== void 0 && (!Number.isInteger(explicit) || explicit < 0 || explicit >= inputCandleCount)) {
    return invalidIndex(
      explicit,
      inputCandleCount,
      `evaluationBarIndex ${explicit} out of bounds [0, ${inputCandleCount - 1}].`
    );
  }
  const boundary = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: explicit,
    closedSeriesOnly: input.closedSeriesOnly
  });
  if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
    return insufficient(
      boundary.evaluationBarIndex,
      inputCandleCount,
      boundary.contractDetail
    );
  }
  const evaluationBarIndex = boundary.evaluationBarIndex;
  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1);
  const impulseResult = buildWaveAnalysis(effectiveCandles, engineOptions);
  const analysis = impulseResult.analysis;
  const presentation = mapToPresentationState(analysis, {
    impulseBullish: impulseResult.impulseBullish
  });
  const diagnostics = buildWaveDiagnostics(
    effectiveCandles,
    presentation,
    impulseResult.impulseBullish,
    engineOptions
  );
  const invariantViolations = collectEvaluationScopedInvariantViolations(
    presentation,
    diagnostics,
    evaluationBarIndex
  );
  const futureSafe = invariantViolations.length === 0;
  return {
    status: "OK",
    evaluationBarIndex,
    evidence: {
      inputCandleCount,
      usedCandleCount: effectiveCandles.length,
      maxCandleIndexUsed: evaluationBarIndex,
      boundaryEstablished: true,
      contractDetail: boundary.contractDetail
    },
    analysis,
    presentation,
    diagnostics,
    impulseBullish: impulseResult.impulseBullish,
    futureSafe,
    invariantViolations,
    detail: "Analysis run on candles[0..evaluationBarIndex] only; indices match original series positions."
  };
}

// src/wave/setup/evaluation-scoped-trade-context.ts
function buildEvaluationScopedWaveScanReport(baseReport, symbols, engineOptions) {
  const results = [];
  const errors = [...baseReport.errors];
  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly
    });
    if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
      continue;
    }
    try {
      const effective = input.candles.slice(0, boundary.evaluationBarIndex + 1);
      const symbolReport = runWaveScan(
        [{ symbol, candles: effective }],
        {
          timeframe: baseReport.timeframe,
          engineOptions
        }
      );
      results.push(...symbolReport.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, timeframe: baseReport.timeframe, message });
    }
  }
  const sorted = [...results].sort(compareWaveScanResults);
  return {
    ...baseReport,
    results: sorted,
    scenarioCount: sorted.length,
    errors
  };
}
function buildTradeSetupEvaluationContextWithScopedAnalysis(scanReport, symbols, engineOptions) {
  const bundlesBySymbol = {};
  let anyScoped = false;
  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly
    });
    if (boundary.boundaryEstablished && boundary.evaluationBarIndex >= 0) {
      anyScoped = true;
      bundlesBySymbol[symbol] = {
        ...buildSymbolEvaluationBundleAtEvaluationBar(
          input.candles,
          scanReport.timeframe,
          {
            evaluationBarIndex: input.evaluationBarIndex,
            closedSeriesOnly: input.closedSeriesOnly
          },
          engineOptions
        ),
        evaluationAnalysisScope: "EVALUATION_SCOPED"
      };
    } else {
      bundlesBySymbol[symbol] = {
        ...buildSymbolEvaluationBundle(
          input.candles,
          scanReport.timeframe,
          {
            evaluationBarIndex: input.evaluationBarIndex,
            closedSeriesOnly: input.closedSeriesOnly
          },
          engineOptions
        ),
        evaluationAnalysisScope: "FULL_SERIES"
      };
    }
  }
  const scopedScan = anyScoped ? buildEvaluationScopedWaveScanReport(scanReport, symbols, engineOptions) : scanReport;
  return {
    scanReport: scopedScan,
    bundlesBySymbol: Object.keys(bundlesBySymbol).length > 0 ? bundlesBySymbol : void 0
  };
}

// src/wave/setup/trade-setup-context.ts
function buildSymbolEvaluationBundle(candles, timeframeId, input, engineOptions) {
  const { diagnostics, presentation } = analyzeWaveWithDiagnostics(
    candles,
    engineOptions
  );
  const resolved = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly
  });
  return {
    timeframeId,
    evaluationBarIndex: resolved.evaluationBarIndex,
    evaluationBarBoundaryEstablished: resolved.boundaryEstablished,
    evaluationBarContractDetail: resolved.contractDetail,
    candleCount: candles.length,
    diagnostics,
    presentation
  };
}
function buildSymbolEvaluationBundleAtEvaluationBar(candles, timeframeId, input, engineOptions) {
  const scoped = analyzeWaveAtEvaluationBar({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly,
    engineOptions
  });
  const resolved = resolveTradeSetupEvaluationBoundary({
    candles,
    evaluationBarIndex: input.evaluationBarIndex,
    closedSeriesOnly: input.closedSeriesOnly
  });
  if (scoped.status !== "OK" || !scoped.diagnostics || !scoped.presentation) {
    throw new Error(
      `Evaluation-scoped analysis failed: ${scoped.detail} (${scoped.status})`
    );
  }
  return {
    timeframeId,
    evaluationBarIndex: scoped.evaluationBarIndex,
    evaluationBarBoundaryEstablished: scoped.evidence.boundaryEstablished,
    evaluationBarContractDetail: scoped.evidence.contractDetail,
    candleCount: candles.length,
    diagnostics: scoped.diagnostics,
    presentation: scoped.presentation
  };
}
function buildTradeSetupEvaluationContext(scanReport, symbols, engineOptions) {
  const usesEvaluationBoundary = Object.values(symbols).some((input) => {
    const boundary = resolveTradeSetupEvaluationBoundary({
      candles: input.candles,
      evaluationBarIndex: input.evaluationBarIndex,
      closedSeriesOnly: input.closedSeriesOnly
    });
    return boundary.boundaryEstablished && boundary.evaluationBarIndex >= 0;
  });
  if (usesEvaluationBoundary) {
    return buildTradeSetupEvaluationContextWithScopedAnalysis(
      scanReport,
      symbols,
      engineOptions
    );
  }
  const bundlesBySymbol = {};
  for (const [symbol, input] of Object.entries(symbols)) {
    if (input.candles.length === 0) {
      continue;
    }
    bundlesBySymbol[symbol] = {
      ...buildSymbolEvaluationBundle(
        input.candles,
        scanReport.timeframe,
        {
          evaluationBarIndex: input.evaluationBarIndex,
          closedSeriesOnly: input.closedSeriesOnly
        },
        engineOptions
      ),
      evaluationAnalysisScope: "FULL_SERIES"
    };
  }
  return {
    scanReport,
    bundlesBySymbol: Object.keys(bundlesBySymbol).length > 0 ? bundlesBySymbol : void 0
  };
}

// src/wave/setup/objective-target-eligibility-gate.ts
function evaluateObjectiveTargetEligibilityGate(prospective) {
  if (!prospective) {
    return {
      outcome: "INSUFFICIENT_CONTEXT",
      objectiveEligibility: "INSUFFICIENT_CONTEXT",
      reasonCodes: ["GATE_INPUT_MISSING"],
      detail: "No prospective setup contract result supplied."
    };
  }
  const reasonCodes = [];
  if (prospective.supportVerdict !== "SUPPORTED_BY_CONTRACT") {
    reasonCodes.push("PROSPECTIVE_CONTRACT_UNSUPPORTED");
  }
  if (prospective.objectiveEligibility !== "ELIGIBLE") {
    reasonCodes.push("OBJECTIVE_NOT_ELIGIBLE");
  }
  if (prospective.phaseStatus !== "PHASE_IN_PROGRESS") {
    reasonCodes.push("PHASE_NOT_IN_PROGRESS");
    if (prospective.openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" && prospective.structuralTransitionVerdict !== "STRUCTURAL_TRANSITION_OBSERVED") {
      reasonCodes.push("OPEN_LEG_AVAILABLE_BUT_TRANSITION_UNRESOLVED");
    }
  }
  if (!prospective.transitionEvidence.futureSafe) {
    reasonCodes.push("NOT_FUTURE_SAFE");
  }
  if (!prospective.invalidationAvailable) {
    reasonCodes.push("INVALIDATION_UNAVAILABLE");
  }
  if (reasonCodes.length === 0) {
    return {
      outcome: "PASS",
      objectiveEligibility: prospective.objectiveEligibility,
      reasonCodes: [],
      detail: "Prospective phase in progress with future-safe evidence and invalidation (gate prep only)."
    };
  }
  if (reasonCodes.includes("GATE_INPUT_MISSING")) {
    return {
      outcome: "INSUFFICIENT_CONTEXT",
      objectiveEligibility: prospective.objectiveEligibility,
      reasonCodes,
      detail: "Insufficient context for objective target eligibility gate."
    };
  }
  return {
    outcome: "FAIL",
    objectiveEligibility: prospective.objectiveEligibility,
    reasonCodes,
    detail: "Objective target eligibility gate would fail (no target price computed)."
  };
}
function objectiveEligibilityFromProspectivePhase(phaseStatus, futureSafe, invalidationAvailable) {
  if (phaseStatus === "PHASE_IN_PROGRESS" && futureSafe && invalidationAvailable) {
    return "ELIGIBLE";
  }
  if (phaseStatus === "PHASE_ALREADY_COMPLETED") {
    return "OBJECTIVE_ALREADY_COMPLETED";
  }
  if (phaseStatus === "PHASE_IN_PROGRESS") {
    return "OBJECTIVE_UNRESOLVED";
  }
  return "NOT_PROSPECTIVE";
}

// src/wave/setup/objective-wave-resolution.ts
function flatWave(bundle, label) {
  const w = bundle.presentation?.engine?.flatWaves?.find((x) => x.label === label);
  if (!w) {
    return null;
  }
  return w;
}
function characterizeImpulseLegAtBar(bundle, label, evaluationBarIndex) {
  const w = flatWave(bundle, label);
  if (!w) {
    return { state: "NOT_PRESENT", endIndex: null };
  }
  if (w.status === "INVALIDATED") {
    return { state: "INVALIDATED", endIndex: w.endIndex };
  }
  if (w.startIndex > evaluationBarIndex) {
    return { state: "NOT_STARTED", endIndex: w.endIndex };
  }
  if (w.endIndex > evaluationBarIndex) {
    return { state: "IN_PROGRESS", endIndex: w.endIndex };
  }
  if (w.status === "CONFIRMED") {
    return { state: "ENDPOINT_CONFIRMED", endIndex: w.endIndex };
  }
  return { state: "IN_PROGRESS", endIndex: w.endIndex };
}
function lookupNextImpulseLegLabel(current) {
  if (current === "3") {
    return "4";
  }
  if (current === "4") {
    return "5";
  }
  return null;
}
function buildNextStructuralEvidence(bundle, currentWaveLabel2, evaluationBarIndex) {
  const nextImpulseLegLabel = lookupNextImpulseLegLabel(currentWaveLabel2);
  if (!nextImpulseLegLabel) {
    return {
      nextImpulseLegLabel: null,
      nextLegStartIndexAtOrBeforeBar: false,
      nextLegEndConfirmedAtOrBeforeBar: false,
      nextLegStartIndex: null,
      nextLegEndIndex: null
    };
  }
  const w = flatWave(bundle, nextImpulseLegLabel);
  if (!w) {
    return {
      nextImpulseLegLabel,
      nextLegStartIndexAtOrBeforeBar: false,
      nextLegEndConfirmedAtOrBeforeBar: false,
      nextLegStartIndex: null,
      nextLegEndIndex: null
    };
  }
  const nextState = characterizeImpulseLegAtBar(
    bundle,
    nextImpulseLegLabel,
    evaluationBarIndex
  );
  return {
    nextImpulseLegLabel,
    nextLegStartIndexAtOrBeforeBar: nextState.state !== "NOT_PRESENT" && nextState.state !== "NOT_STARTED",
    nextLegEndConfirmedAtOrBeforeBar: nextState.state === "ENDPOINT_CONFIRMED",
    nextLegStartIndex: w.startIndex,
    nextLegEndIndex: w.endIndex
  };
}

// src/wave/setup/structural-anchor-identity.ts
function structuralPriceKey(price) {
  return price.toFixed(8);
}
function structuralAnchorIdentityKey(anchorIndex, anchorPrice) {
  return `${anchorIndex}:${structuralPriceKey(anchorPrice)}`;
}
function structuralAnchorPricesEqual(a, b) {
  return structuralPriceKey(a) === structuralPriceKey(b);
}
var KIND_PRECEDENCE = [
  "STRUCTURAL_ENDPOINT",
  "HIGH",
  "LOW"
];
function resolvePrimaryAnchorKind(kinds) {
  for (const k of KIND_PRECEDENCE) {
    if (kinds.includes(k)) {
      return k;
    }
  }
  return kinds[0] ?? "STRUCTURAL_ENDPOINT";
}
function mergeAnchorCandidatesByStructuralIdentity(raw) {
  const byIdentity = /* @__PURE__ */ new Map();
  for (const c of raw) {
    const key = structuralAnchorIdentityKey(c.anchorIndex, c.anchorPrice);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        anchorIndex: c.anchorIndex,
        anchorPrice: c.anchorPrice,
        anchorKind: c.anchorKind,
        sources: [...c.sources],
        futureSafe: c.futureSafe
      });
      continue;
    }
    const sources = /* @__PURE__ */ new Set([
      ...existing.sources,
      ...c.sources
    ]);
    existing.sources = [...sources].sort();
    existing.anchorKind = resolvePrimaryAnchorKind([
      existing.anchorKind,
      c.anchorKind
    ]);
    existing.futureSafe = existing.futureSafe && c.futureSafe;
  }
  return [...byIdentity.values()].sort((a, b) => a.anchorIndex - b.anchorIndex);
}

// src/wave/setup/open-structural-leg.ts
function observedDirection(anchorPrice, evaluationPrice) {
  if (!Number.isFinite(anchorPrice) || !Number.isFinite(evaluationPrice)) {
    return "UNRESOLVED";
  }
  if (evaluationPrice > anchorPrice) {
    return "BULLISH";
  }
  if (evaluationPrice < anchorPrice) {
    return "BEARISH";
  }
  return "UNRESOLVED";
}
function pricePathRange(candles, fromIndex, toIndex) {
  if (fromIndex > toIndex || fromIndex < 0 || toIndex >= candles.length) {
    return null;
  }
  let high = -Infinity;
  let low = Infinity;
  for (let i = fromIndex; i <= toIndex; i++) {
    high = Math.max(high, candles[i].high);
    low = Math.min(low, candles[i].low);
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }
  return { high, low };
}
function identityKey(c) {
  return structuralAnchorIdentityKey(c.anchorIndex, c.anchorPrice);
}
function emptyResolution(partial) {
  return {
    status: partial.status,
    anchorSelection: partial.anchorSelection ?? "NO_SELECTION",
    anchorResolutionMode: partial.anchorResolutionMode ?? "GLOBAL",
    scopedCompletedEndpointIndex: partial.scopedCompletedEndpointIndex ?? null,
    anchorCandidates: partial.anchorCandidates ?? [],
    selectedAnchorSource: partial.selectedAnchorSource ?? null,
    leg: partial.leg ?? null,
    observationSpanBars: partial.observationSpanBars ?? 0,
    futureSafe: partial.futureSafe ?? false,
    reasons: partial.reasons ?? []
  };
}
function buildLeg(anchor, evaluationBarIndex, evaluationPrice, range) {
  const dir = observedDirection(anchor.anchorPrice, evaluationPrice);
  const span = evaluationBarIndex - anchor.anchorIndex;
  return {
    anchorIndex: anchor.anchorIndex,
    anchorPrice: anchor.anchorPrice,
    anchorKind: anchor.anchorKind,
    selectedAnchorSources: [...anchor.sources],
    observationEndIndex: evaluationBarIndex,
    evaluationBarIndex,
    evaluationPrice,
    observedHigh: range.high,
    observedLow: range.low,
    observedDirection: dir,
    state: "IN_PROGRESS",
    observationSpanBars: span,
    futureSafe: anchor.futureSafe,
    evidence: [
      "Open structural leg: confirmed anchor \u2192 closed evaluation bar observation.",
      "Observation end is not a pivot or wave endpoint."
    ],
    startIndex: anchor.anchorIndex,
    startPrice: anchor.anchorPrice,
    direction: dir
  };
}
function corroborationAtStructuralPoint(input) {
  const { bundle, evaluationBarIndex, anchorIndex, anchorPrice, historicalSetup } = input;
  const raw = [];
  if (historicalSetup) {
    const endIndex = historicalSetup.sourceScenario.endIndex;
    const endPrice = historicalSetup.sourceScenario.endPrice;
    if (endIndex === anchorIndex && structuralAnchorPricesEqual(endPrice, anchorPrice)) {
      raw.push({
        anchorIndex,
        anchorPrice,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: anchorIndex <= evaluationBarIndex
      });
    }
  }
  const primary = bundle.diagnostics.focus?.primary;
  if (primary && primary.endIndex === anchorIndex && structuralAnchorPricesEqual(primary.endPrice, anchorPrice) && primary.endIndex <= evaluationBarIndex && primary.status === "CONFIRMED") {
    raw.push({
      anchorIndex,
      anchorPrice,
      anchorKind: "STRUCTURAL_ENDPOINT",
      sources: ["SCENARIO_FOCUS_ENDPOINT"],
      futureSafe: primary.endIndex <= evaluationBarIndex
    });
  }
  for (const swing of bundle.diagnostics.confirmedSwings ?? []) {
    if (swing.index === anchorIndex && structuralAnchorPricesEqual(swing.price, anchorPrice) && swing.index <= evaluationBarIndex) {
      raw.push({
        anchorIndex,
        anchorPrice,
        anchorKind: swing.type,
        sources: ["CONFIRMED_SWING"],
        futureSafe: swing.index <= evaluationBarIndex
      });
    }
  }
  return mergeAnchorCandidatesByStructuralIdentity(raw);
}
function resolveCandidateScopedOpenLeg(input) {
  const { bundle, historicalSetup, evaluationBarIndex, evaluationPrice, effectiveCandles } = input;
  const reasons = [
    "Candidate-scoped anchor: completed source endpoint only (no global best-anchor race)."
  ];
  const endIndex = historicalSetup.sourceScenario.endIndex;
  const endPrice = historicalSetup.sourceScenario.endPrice;
  const focus = historicalSetup.scenarioRef.waveLabel;
  const focusState = characterizeImpulseLegAtBar(
    bundle,
    focus,
    evaluationBarIndex
  );
  const endpointConfirmed = focusState.state === "ENDPOINT_CONFIRMED" && focusState.endIndex === endIndex && endIndex <= evaluationBarIndex && Number.isFinite(endPrice);
  if (!endpointConfirmed) {
    return emptyResolution({
      status: "ANCHOR_CONFLICT",
      anchorSelection: "CONFLICT",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      futureSafe: true,
      reasons: [
        ...reasons,
        "Source completed endpoint not confirmed by engine at evaluation bar."
      ]
    });
  }
  const anchorCandidates = corroborationAtStructuralPoint({
    bundle,
    evaluationBarIndex,
    anchorIndex: endIndex,
    anchorPrice: endPrice,
    historicalSetup
  });
  if (anchorCandidates.length !== 1) {
    return emptyResolution({
      status: "ANCHOR_CONFLICT",
      anchorSelection: "CONFLICT",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      futureSafe: true,
      reasons: [
        ...reasons,
        "Engine could not corroborate source completed endpoint identity."
      ]
    });
  }
  const selected = anchorCandidates[0];
  if (selected.anchorIndex >= evaluationBarIndex) {
    return emptyResolution({
      status: "NO_OBSERVED_SPAN",
      anchorSelection: "SELECTED",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: selected.futureSafe,
      reasons: [...reasons, "anchorIndex equals evaluationBarIndex; no observed span."]
    });
  }
  const range = pricePathRange(
    effectiveCandles,
    selected.anchorIndex,
    evaluationBarIndex
  );
  if (!range) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection: "SELECTED",
      anchorResolutionMode: "CANDIDATE_SCOPED",
      scopedCompletedEndpointIndex: endIndex,
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: false,
      reasons: [...reasons, "Could not compute observed price path range."]
    });
  }
  const leg = buildLeg(selected, evaluationBarIndex, evaluationPrice, range);
  const futureSafe = leg.futureSafe && leg.anchorIndex <= evaluationBarIndex && leg.observationEndIndex <= evaluationBarIndex;
  return emptyResolution({
    status: "AVAILABLE",
    anchorSelection: "SELECTED",
    anchorResolutionMode: "CANDIDATE_SCOPED",
    scopedCompletedEndpointIndex: endIndex,
    anchorCandidates,
    selectedAnchorSource: selected.sources.length === 1 ? selected.sources[0] : null,
    leg: { ...leg, futureSafe },
    observationSpanBars: leg.observationSpanBars,
    futureSafe,
    reasons: [
      ...reasons,
      "Open leg spans source completed endpoint through closed evaluation bar only."
    ]
  });
}
function resolveGlobalOpenLeg(input) {
  const { bundle, historicalSetup, evaluationBarIndex, evaluationPrice, effectiveCandles } = input;
  const reasons = [];
  const rawCandidates = [];
  if (historicalSetup) {
    const endIndex = historicalSetup.sourceScenario.endIndex;
    const endPrice = historicalSetup.sourceScenario.endPrice;
    const focus = historicalSetup.scenarioRef.waveLabel;
    const focusState = characterizeImpulseLegAtBar(
      bundle,
      focus,
      evaluationBarIndex
    );
    const endpointConfirmed = focusState.state === "ENDPOINT_CONFIRMED" && focusState.endIndex === endIndex;
    if (endpointConfirmed && endIndex <= evaluationBarIndex && Number.isFinite(endPrice)) {
      rawCandidates.push({
        anchorIndex: endIndex,
        anchorPrice: endPrice,
        anchorKind: "STRUCTURAL_ENDPOINT",
        sources: ["HISTORICAL_SETUP_ENDPOINT"],
        futureSafe: endIndex <= evaluationBarIndex
      });
    }
  }
  const primary = bundle.diagnostics.focus?.primary;
  if (primary && primary.endIndex <= evaluationBarIndex && primary.status === "CONFIRMED") {
    rawCandidates.push({
      anchorIndex: primary.endIndex,
      anchorPrice: primary.endPrice,
      anchorKind: "STRUCTURAL_ENDPOINT",
      sources: ["SCENARIO_FOCUS_ENDPOINT"],
      futureSafe: primary.endIndex <= evaluationBarIndex
    });
  }
  const swings = (bundle.diagnostics.confirmedSwings ?? []).filter(
    (s) => s.index <= evaluationBarIndex
  );
  if (swings.length > 0) {
    const last = swings[swings.length - 1];
    rawCandidates.push({
      anchorIndex: last.index,
      anchorPrice: last.price,
      anchorKind: last.type,
      sources: ["CONFIRMED_SWING"],
      futureSafe: last.index <= evaluationBarIndex
    });
  }
  const anchorCandidates = mergeAnchorCandidatesByStructuralIdentity(rawCandidates);
  if (anchorCandidates.length === 0) {
    return emptyResolution({
      status: "NO_ANCHOR",
      anchorResolutionMode: "GLOBAL",
      futureSafe: true,
      reasons: ["No anchor candidates within evaluation scope."]
    });
  }
  let anchorSelection = "NO_SELECTION";
  let selected = null;
  if (anchorCandidates.length === 1) {
    anchorSelection = "SELECTED";
    selected = anchorCandidates[0];
  } else {
    anchorSelection = "AMBIGUOUS";
    reasons.push(
      `Multiple distinct structural anchor identities: ${anchorCandidates.map(identityKey).join(", ")}.`
    );
  }
  if (!selected) {
    return emptyResolution({
      status: "AMBIGUOUS_ANCHOR",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      futureSafe: anchorCandidates.every((c) => c.futureSafe),
      reasons
    });
  }
  if (selected.anchorIndex >= evaluationBarIndex) {
    return emptyResolution({
      status: "NO_OBSERVED_SPAN",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: selected.futureSafe,
      reasons: [...reasons, "anchorIndex equals evaluationBarIndex; no observed span."]
    });
  }
  const range = pricePathRange(
    effectiveCandles,
    selected.anchorIndex,
    evaluationBarIndex
  );
  if (!range) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorSelection,
      anchorResolutionMode: "GLOBAL",
      anchorCandidates,
      selectedAnchorSource: selected.sources[0] ?? null,
      futureSafe: false,
      reasons: [...reasons, "Could not compute observed price path range."]
    });
  }
  const leg = buildLeg(selected, evaluationBarIndex, evaluationPrice, range);
  const futureSafe = leg.futureSafe && leg.anchorIndex <= evaluationBarIndex && leg.observationEndIndex <= evaluationBarIndex;
  return emptyResolution({
    status: "AVAILABLE",
    anchorSelection,
    anchorResolutionMode: "GLOBAL",
    anchorCandidates,
    selectedAnchorSource: selected.sources.length === 1 ? selected.sources[0] : null,
    leg: { ...leg, futureSafe },
    observationSpanBars: leg.observationSpanBars,
    futureSafe,
    reasons: [
      ...reasons,
      "Open leg spans confirmed anchor through closed evaluation bar only."
    ]
  });
}
function resolveOpenStructuralLeg(input) {
  const { bundle, candles, historicalSetup } = input;
  const mode = input.anchorResolutionMode ?? (historicalSetup ? "CANDIDATE_SCOPED" : "GLOBAL");
  const evaluationBarIndex = bundle.evaluationBarIndex;
  if (!bundle.evaluationBarBoundaryEstablished || evaluationBarIndex < 0 || candles.length === 0) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["Evaluation bar boundary not established or empty candles."]
    });
  }
  if (evaluationBarIndex >= candles.length) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["evaluationBarIndex beyond scoped candle array."]
    });
  }
  const effectiveCandles = candles.slice(0, evaluationBarIndex + 1);
  const evaluationPrice = effectiveCandles[evaluationBarIndex]?.close;
  if (!Number.isFinite(evaluationPrice)) {
    return emptyResolution({
      status: "INSUFFICIENT_CONTEXT",
      anchorResolutionMode: mode,
      reasons: ["Evaluation candle close unavailable."]
    });
  }
  if (mode === "CANDIDATE_SCOPED" && historicalSetup) {
    return resolveCandidateScopedOpenLeg({
      bundle,
      candles,
      historicalSetup,
      evaluationBarIndex,
      evaluationPrice,
      effectiveCandles
    });
  }
  return resolveGlobalOpenLeg({
    bundle,
    candles,
    historicalSetup: historicalSetup ?? null,
    evaluationBarIndex,
    evaluationPrice,
    effectiveCandles
  });
}

// src/wave/setup/open-structural-leg-comparison.ts
function compareOpenLegPaths(input) {
  const legacy = input.legacyPotentialOpenLeg !== null;
  const firstClass = input.openLegResolution?.status === "AVAILABLE" && input.openLegResolution.leg !== null;
  const notes = [];
  if (legacy && firstClass) {
    const l = input.legacyPotentialOpenLeg;
    const f = input.openLegResolution.leg;
    const sameStart = l.anchorIndex === f.anchorIndex || l.startIndex === f.anchorIndex;
    if (sameStart) {
      notes.push("Legacy POTENTIAL span and first-class leg share anchor index.");
      return {
        legacyPotentialOpenSpan: true,
        firstClassOpenLegAvailable: true,
        verdict: "BOTH_AGREE",
        notes
      };
    }
    notes.push("Legacy and first-class open legs diverge on anchor index.");
    return {
      legacyPotentialOpenSpan: true,
      firstClassOpenLegAvailable: true,
      verdict: "DIVERGENT",
      notes
    };
  }
  if (legacy) {
    notes.push("Only legacy POTENTIAL open span present.");
    return {
      legacyPotentialOpenSpan: true,
      firstClassOpenLegAvailable: false,
      verdict: "LEGACY_ONLY",
      notes
    };
  }
  if (firstClass) {
    notes.push("Only first-class open structural leg present.");
    return {
      legacyPotentialOpenSpan: false,
      firstClassOpenLegAvailable: true,
      verdict: "FIRST_CLASS_ONLY",
      notes
    };
  }
  return {
    legacyPotentialOpenSpan: false,
    firstClassOpenLegAvailable: false,
    verdict: "NEITHER",
    notes: ["No open leg representation on either path."]
  };
}

// src/wave/setup/prospective-setup-contract-types.ts
var PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY = "PROSPECTIVE_TRADE_SETUP";
var PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT = "STRUCTURAL_RESUMPTION_CONTEXT";

// src/wave/setup/trade-setup-temporal-types.ts
var TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT = "REQUIRED";

// src/wave/setup/trade-setup-temporal-semantics.ts
function semanticKindForSetupType(setupTypeId) {
  switch (setupTypeId) {
    case "impulse-continuation":
      return "IMPULSE_FOCUS_LEG_ENDPOINT_CONFIRMATION";
    case "correction-end":
      return "CORRECTIVE_C_LEG_ENDPOINT_CONFIRMATION";
    default:
      return "STRUCTURAL_CONTEXT_ONLY";
  }
}
function correctiveLegAtBar(bundle, label, evaluationBarIndex) {
  const leg = bundle.diagnostics.waveLegs.find(
    (l) => l.structure === "CORRECTIVE" && l.label === label
  );
  const w = bundle.presentation?.engine?.flatWaves?.find((x) => x.label === label);
  if (!leg && !w) {
    return { state: "NOT_PRESENT", endIndex: null };
  }
  const startIndex = leg?.startIndex ?? w?.startIndex ?? 0;
  const endIndex = leg?.endIndex ?? w?.endIndex ?? null;
  if (endIndex === null) {
    return { state: "INSUFFICIENT_CONTEXT", endIndex: null };
  }
  if (startIndex > evaluationBarIndex) {
    return { state: "NOT_STARTED", endIndex };
  }
  if (endIndex > evaluationBarIndex) {
    return { state: "IN_PROGRESS", endIndex };
  }
  const status = w?.status ?? leg?.status;
  if (status === "CONFIRMED") {
    return { state: "ENDPOINT_CONFIRMED", endIndex };
  }
  return { state: "IN_PROGRESS", endIndex };
}
function focusWaveState(setup, bundle, evaluationBarIndex) {
  const focus = setup.scenarioRef.waveLabel;
  if (setup.scenarioRef.structure === "CORRECTIVE" || setup.setupTypeId === "correction-end") {
    return correctiveLegAtBar(bundle, focus, evaluationBarIndex);
  }
  return characterizeImpulseLegAtBar(bundle, focus, evaluationBarIndex);
}
function temporalClassFromFocusState(setup, focusState) {
  if (!setup.isTradeSetup) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (focusState === "ENDPOINT_CONFIRMED") {
    return "HISTORICAL_STRUCTURE";
  }
  if (focusState === "IN_PROGRESS") {
    return "CURRENT_STRUCTURE";
  }
  if (focusState === "NOT_STARTED" || focusState === "NOT_PRESENT") {
    return "INSUFFICIENT_CONTEXT";
  }
  return "INSUFFICIENT_CONTEXT";
}
function resolveObjectiveEligibility(setup, bundle, focusState, temporalClass) {
  if (!setup.isTradeSetup || setup.status === "INSUFFICIENT_CONTEXT") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (setup.status !== "CONFIRMED" && setup.status !== "CANDIDATE") {
    return "INSUFFICIENT_CONTEXT";
  }
  if (setup.setupTypeId === "impulse-continuation") {
    if (focusState === "ENDPOINT_CONFIRMED") {
      return "OBJECTIVE_ALREADY_COMPLETED";
    }
    if (focusState === "IN_PROGRESS") {
      return "OBJECTIVE_UNRESOLVED";
    }
    return "NOT_PROSPECTIVE";
  }
  if (setup.setupTypeId === "correction-end") {
    if (focusState === "ENDPOINT_CONFIRMED") {
      return "OBJECTIVE_ALREADY_COMPLETED";
    }
    if (focusState === "IN_PROGRESS") {
      return "OBJECTIVE_UNRESOLVED";
    }
    return "NOT_PROSPECTIVE";
  }
  if (temporalClass === "PROSPECTIVE_STRUCTURE") {
    return "ELIGIBLE";
  }
  return "NOT_PROSPECTIVE";
}
function buildTransitionEvidence(setup, bundle, evaluationBarIndex) {
  const notes = [];
  const focus = setup.scenarioRef.waveLabel;
  let next = {
    nextImpulseLegLabel: null,
    nextLegStartIndexAtOrBeforeBar: false,
    nextLegEndConfirmedAtOrBeforeBar: false,
    nextLegStartIndex: null,
    nextLegEndIndex: null
  };
  if (setup.setupTypeId === "impulse-continuation" && (focus === "3" || focus === "4" || focus === "5")) {
    next = buildNextStructuralEvidence(
      bundle,
      focus,
      evaluationBarIndex
    );
  }
  if (setup.setupTypeId === "correction-end") {
    notes.push(
      "Correction-end does not establish new impulse start; correction ended \u2260 next impulse started."
    );
  }
  const focusEnd = focusWaveState(setup, bundle, evaluationBarIndex).endIndex;
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const oppositeSwingAfterFocusEnd = focusEnd !== null && swings.some(
    (s) => s.index > focusEnd && s.index <= evaluationBarIndex
  );
  const presentationFocusWave = bundle.presentation?.primary?.wave ?? null;
  const canEstablishTransition = next.nextLegStartIndexAtOrBeforeBar || oppositeSwingAfterFocusEnd;
  const canEstablishProspectiveWave = false;
  notes.push(
    "Engine does not assign prospectiveWave without domain policy (no current+1)."
  );
  return {
    nextImpulseLegLabel: next.nextImpulseLegLabel,
    nextLegStartAtOrBeforeBar: next.nextLegStartIndexAtOrBeforeBar,
    nextLegEndConfirmedAtOrBeforeBar: next.nextLegEndConfirmedAtOrBeforeBar,
    oppositeSwingAfterFocusEnd,
    presentationFocusWave,
    canEstablishTransition,
    canEstablishProspectiveWave,
    temporalSafeAtBar: true,
    notes
  };
}
function buildObjectivePhaseContext(setup, bundle) {
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const focus = setup.scenarioRef.waveLabel;
  const { state: focusState } = focusWaveState(setup, bundle, evaluationBarIndex);
  const temporalClass = temporalClassFromFocusState(setup, focusState);
  const objectiveEligibility = resolveObjectiveEligibility(
    setup,
    bundle,
    focusState,
    temporalClass
  );
  const evidence = [
    "SETUP_CONFIRMED verifies catalog conditions at evaluation bar, not prospective trade opportunity.",
    `Target generation gate verdict (design): ${TARGET_OBJECTIVE_ELIGIBILITY_GATE_VERDICT}.`
  ];
  if (setup.setupTypeId === "correction-end") {
    evidence.push(
      "Correction C leg endpoint confirmation is a completed corrective snapshot, not new impulse resumption."
    );
  }
  if (setup.setupTypeId === "impulse-continuation") {
    evidence.push(
      "Impulse continuation CONFIRMED requires leading focus leg CONFIRMED at bar (completed endpoint snapshot)."
    );
  }
  return {
    sourceSetupId: setup.id,
    sourceSetupType: setup.setupTypeId,
    temporalClass,
    completedStructuralWave: focusState === "ENDPOINT_CONFIRMED" ? focus : null,
    prospectiveWave: null,
    prospectiveWaveState: "UNRESOLVED",
    objectiveEligibility,
    evidence
  };
}
function resolveTradeSetupTemporalContext(setup, bundle) {
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const focus = setup.scenarioRef.waveLabel;
  const { state: focusState } = focusWaveState(setup, bundle, evaluationBarIndex);
  const temporalClass = temporalClassFromFocusState(setup, focusState);
  const objectiveEligibility = resolveObjectiveEligibility(
    setup,
    bundle,
    focusState,
    temporalClass
  );
  const transitionEvidence = buildTransitionEvidence(
    setup,
    bundle,
    evaluationBarIndex
  );
  const objectivePhase = buildObjectivePhaseContext(setup, bundle);
  let reason = `Focus wave ${focus} state ${focusState} at bar ${evaluationBarIndex}.`;
  if (objectiveEligibility === "OBJECTIVE_ALREADY_COMPLETED") {
    reason += " Focus leg endpoint already confirmed \u2014 not a prospective objective phase for forward targets.";
  }
  if (objectiveEligibility === "NOT_PROSPECTIVE") {
    reason += " Setup is structural snapshot, not forward-looking objective context.";
  }
  return {
    setupId: setup.id,
    setupTypeId: setup.setupTypeId,
    lifecycleStatus: setup.status,
    semanticKind: semanticKindForSetupType(setup.setupTypeId),
    temporalClass,
    focusWave: focus,
    focusWaveState: focusState,
    evaluationBarIndex,
    objectiveEligibility,
    prospectiveWave: null,
    transitionEvidence,
    objectivePhase,
    reason,
    entryPlanEligibilityNote: "EntryPlan eligibility (CONFIRMED + evaluation bar) is independent of ObjectiveEligibility."
  };
}

// src/wave/setup/prospective-structural-invalidation.ts
function resolveProspectiveStructuralInvalidation(setup) {
  const triggered = setup.invalidation.conditions.some(
    (c) => c.conditionId === "setup-invalidation-triggered" && c.outcome === "MET"
  );
  const ref = setup.referenceLevels.find(
    (l) => l.kind === "SCENARIO_INVALIDATION"
  );
  const invalidationPrice = ref?.price !== void 0 && Number.isFinite(ref.price) ? ref.price : null;
  const available = setup.invalidation.usesScenarioInvalidation && !triggered && invalidationPrice !== null;
  return { available, triggered, invalidationPrice };
}

// src/wave/setup/structural-transition-semantics.ts
var PRODUCTION_TRANSITION_RULE_ID = "CONFIRMED_SWING_AFTER_COMPLETED_ENDPOINT";
function subsequentConfirmedSwingAfterIndex(bundle, afterIndex, evaluationBarIndex) {
  const swings = bundle.diagnostics.confirmedSwings ?? [];
  const next = swings.filter((s) => s.index > afterIndex && s.index <= evaluationBarIndex).sort((a, b) => a.index - b.index)[0];
  if (!next) {
    return null;
  }
  return {
    index: next.index,
    type: next.type,
    price: next.price,
    swingConfirmationLagBars: evaluationBarIndex - next.index
  };
}
function characterizeSwingTransitionRelation(input) {
  const { completedAtIndex, subsequentSwing } = input;
  const notes = [
    "Transition swing is first confirmed swing with index > completed endpoint.",
    "Swing type is structural characterization only (not Elliott phase label)."
  ];
  if (subsequentSwing.index <= completedAtIndex) {
    notes.push("Swing index is not strictly after completed endpoint.");
  }
  return {
    swingAfterEndpoint: true,
    indexStrictlyAfterCompleted: subsequentSwing.index > completedAtIndex,
    withinEvaluationBar: true,
    subsequentSwingType: subsequentSwing.type,
    notes
  };
}
function resolveStructuralTransitionEvidenceLevel(input) {
  if (input.phaseInProgress && input.subsequentSwingObserved) {
    return "STRUCTURAL_TRANSITION_CONFIRMED";
  }
  if (input.subsequentSwingObserved) {
    return "SWING_TRANSITION_OBSERVED";
  }
  if (input.openMovementObserved) {
    return "OPEN_MOVEMENT_ONLY";
  }
  return "NO_TRANSITION";
}

// src/wave/setup/prospective-setup-contract.ts
function flatWave2(bundle, label) {
  return bundle.presentation?.engine?.flatWaves?.find((w) => w.label === label);
}
function findInProgressImpulseLegAfter(bundle, afterEndIndex, evaluationBarIndex) {
  const waves = bundle.presentation?.engine?.flatWaves ?? [];
  for (const w of waves) {
    if (!["1", "2", "3", "4", "5"].includes(w.label)) {
      continue;
    }
    if (w.startIndex <= afterEndIndex) {
      continue;
    }
    if (w.startIndex > evaluationBarIndex) {
      continue;
    }
    if (w.endIndex > evaluationBarIndex) {
      return {
        label: w.label,
        startIndex: w.startIndex,
        endIndex: w.endIndex,
        status: w.status
      };
    }
  }
  return null;
}
function scopedCandles(candles, evaluationBarIndex) {
  if (!candles?.length) {
    return [];
  }
  return candles.slice(0, evaluationBarIndex + 1);
}
function legStartPrice(bundle, label, startIndex) {
  const leg = bundle.diagnostics.waveLegs.find(
    (l) => l.structure === "IMPULSE" && l.label === label
  );
  if (leg && leg.startIndex === startIndex) {
    return leg.startPrice;
  }
  const swing = bundle.diagnostics.confirmedSwings.find(
    (s) => s.index === startIndex
  );
  return swing?.price ?? null;
}
function buildLegacyPotentialOpenLeg(bundle, candidate, evaluationBarIndex, candles) {
  const effective = scopedCandles(candles, evaluationBarIndex);
  let startPrice = legStartPrice(
    bundle,
    candidate.label,
    candidate.startIndex
  );
  if (startPrice === null) {
    startPrice = effective[candidate.startIndex]?.close ?? null;
  }
  const evaluationPrice = effective[evaluationBarIndex]?.close;
  if (startPrice === null || !Number.isFinite(evaluationPrice) || !Number.isFinite(startPrice)) {
    return null;
  }
  let high = -Infinity;
  let low = Infinity;
  for (let i = candidate.startIndex; i <= evaluationBarIndex; i++) {
    high = Math.max(high, effective[i].high);
    low = Math.min(low, effective[i].low);
  }
  const dir = evaluationPrice > startPrice ? "BULLISH" : evaluationPrice < startPrice ? "BEARISH" : "UNRESOLVED";
  return {
    anchorIndex: candidate.startIndex,
    anchorPrice: startPrice,
    anchorKind: "STRUCTURAL_ENDPOINT",
    selectedAnchorSources: [],
    observationEndIndex: evaluationBarIndex,
    evaluationBarIndex,
    evaluationPrice,
    observedHigh: high,
    observedLow: low,
    observedDirection: dir,
    state: "IN_PROGRESS",
    observationSpanBars: evaluationBarIndex - candidate.startIndex,
    futureSafe: candidate.endIndex <= evaluationBarIndex,
    evidence: [
      "LEGACY_POTENTIAL_OPEN_SPAN: WaveCandidate end beyond evaluation bar."
    ],
    startIndex: candidate.startIndex,
    startPrice,
    direction: dir
  };
}
function resolveLegacyPhase(completedAtIndex, candidate, subsequent, bundle, focus, evaluationBarIndex) {
  if (completedAtIndex === null) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (candidate) {
    return "PHASE_IN_PROGRESS";
  }
  if (subsequent) {
    return "TRANSITION_OBSERVED";
  }
  const nextLabel = focus === "3" ? "4" : focus === "4" ? "5" : null;
  if (nextLabel) {
    const nw = flatWave2(bundle, nextLabel);
    if (nw && nw.endIndex <= evaluationBarIndex && nw.status === "CONFIRMED") {
      return "PHASE_ALREADY_COMPLETED";
    }
  }
  return "NOT_ESTABLISHED";
}
function maxEvidenceIndex(transition, anchorIndex) {
  const indices = [
    transition.completedAtIndex,
    transition.subsequentSwingIndex,
    transition.candidateLegStartIndex,
    transition.candidateLegEndIndex,
    anchorIndex
  ].filter((x) => x !== null && Number.isFinite(x));
  if (indices.length === 0) {
    return null;
  }
  return Math.max(...indices);
}
function resolveProspectiveSetupContract(input) {
  const { historicalSetup, bundle, candles } = input;
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const reasons = [];
  const objectiveEligibilityReasons = [];
  const temporal = resolveTradeSetupTemporalContext(historicalSetup, bundle);
  if (temporal.temporalClass !== "HISTORICAL_STRUCTURE") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Prospective contract requires completed historical structural snapshot (HISTORICAL_STRUCTURE).",
      `Source temporal class: ${temporal.temporalClass}.`
    ]);
  }
  if (temporal.focusWaveState !== "ENDPOINT_CONFIRMED") {
    return unsupportedResult(historicalSetup, evaluationBarIndex, [
      "Prospective contract requires completed structural endpoint at evaluation bar.",
      `focusWaveState: ${temporal.focusWaveState}.`
    ]);
  }
  const focus = historicalSetup.scenarioRef.waveLabel;
  const focusState = characterizeImpulseLegAtBar(
    bundle,
    focus,
    evaluationBarIndex
  );
  const completedAtIndex = focusState.endIndex;
  const subsequentDetailed = completedAtIndex !== null ? subsequentConfirmedSwingAfterIndex(
    bundle,
    completedAtIndex,
    evaluationBarIndex
  ) : null;
  const subsequent = subsequentDetailed ? { index: subsequentDetailed.index, type: subsequentDetailed.type } : null;
  const candidate = completedAtIndex !== null ? findInProgressImpulseLegAfter(
    bundle,
    completedAtIndex,
    evaluationBarIndex
  ) : null;
  const transition = {
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    completedStructure: focusState.state === "ENDPOINT_CONFIRMED" ? focus : null,
    completedAtIndex,
    subsequentSwingIndex: subsequent?.index ?? null,
    subsequentSwingDirection: subsequent?.type ?? null,
    swingConfirmationLagBars: subsequentDetailed?.swingConfirmationLagBars ?? null,
    transitionEvidenceLevel: "NO_TRANSITION",
    transitionRuleId: PRODUCTION_TRANSITION_RULE_ID,
    candidateLegLabel: candidate?.label ?? null,
    candidateLegStartIndex: candidate?.startIndex ?? null,
    candidateLegEndIndex: candidate?.endIndex ?? null,
    candidateLegState: candidate?.status ?? null,
    evaluationBarIndex,
    futureSafe: true,
    notes: []
  };
  const legacyPhaseStatus = resolveLegacyPhase(
    completedAtIndex,
    candidate,
    subsequent,
    bundle,
    focus,
    evaluationBarIndex
  );
  if (candidate) {
    transition.notes.push(
      "LEGACY: Candidate impulse leg has end after bar (POTENTIAL open span)."
    );
  } else if (subsequent && completedAtIndex !== null) {
    const relation = characterizeSwingTransitionRelation({
      completedAtIndex,
      subsequentSwing: subsequent
    });
    transition.notes.push(...relation.notes);
    transition.notes.push(
      "Subsequent confirmed swing after completed structure (index strictly greater than endpoint)."
    );
  }
  const effectiveCandles = scopedCandles(candles, evaluationBarIndex);
  const openLegResolution = effectiveCandles.length > 0 ? resolveOpenStructuralLeg({
    bundle,
    candles: effectiveCandles,
    historicalSetup
  }) : null;
  const legacyPotentialOpenLeg = candidate && effectiveCandles.length > 0 ? buildLegacyPotentialOpenLeg(
    bundle,
    candidate,
    evaluationBarIndex,
    effectiveCandles
  ) : null;
  const openLegPathComparison = compareOpenLegPaths({
    legacyPotentialOpenLeg,
    openLegResolution
  });
  const structuralTransitionVerdict = subsequent !== null ? "STRUCTURAL_TRANSITION_OBSERVED" : "NO_STRUCTURAL_TRANSITION";
  const openMovementVerdict = openLegResolution?.status === "AVAILABLE" && openLegResolution.leg !== null && openLegResolution.leg.anchorIndex === completedAtIndex ? "OPEN_MOVEMENT_OBSERVED" : openLegResolution?.status === "AVAILABLE" ? "OPEN_MOVEMENT_OBSERVED" : "NO_OPEN_MOVEMENT";
  transition.transitionEvidenceLevel = resolveStructuralTransitionEvidenceLevel(
    {
      subsequentSwingObserved: subsequent !== null,
      openMovementObserved: openMovementVerdict === "OPEN_MOVEMENT_OBSERVED",
      phaseInProgress: false
    }
  );
  let phaseStatus = "NOT_ESTABLISHED";
  if (completedAtIndex === null) {
    phaseStatus = "INSUFFICIENT_CONTEXT";
  } else if (structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED" && openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" && openLegResolution?.anchorSelection === "SELECTED" && openLegResolution.leg?.anchorIndex === completedAtIndex) {
    phaseStatus = "PHASE_IN_PROGRESS";
    transition.transitionEvidenceLevel = "STRUCTURAL_TRANSITION_CONFIRMED";
  } else if (openMovementVerdict === "OPEN_MOVEMENT_OBSERVED") {
    phaseStatus = "OPEN_MOVEMENT_OBSERVED";
    transition.transitionEvidenceLevel = "OPEN_MOVEMENT_ONLY";
    objectiveEligibilityReasons.push(
      "OPEN_LEG_AVAILABLE_BUT_TRANSITION_UNRESOLVED"
    );
  } else if (structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED") {
    phaseStatus = "TRANSITION_OBSERVED";
    transition.transitionEvidenceLevel = "SWING_TRANSITION_OBSERVED";
  } else {
    const nextLabel = focus === "3" ? "4" : focus === "4" ? "5" : null;
    if (nextLabel) {
      const nw = flatWave2(bundle, nextLabel);
      if (nw && nw.endIndex <= evaluationBarIndex && nw.status === "CONFIRMED") {
        phaseStatus = "PHASE_ALREADY_COMPLETED";
      }
    }
  }
  const firstClassLeg = openLegResolution?.status === "AVAILABLE" ? openLegResolution.leg : null;
  const maxIdx = maxEvidenceIndex(
    transition,
    firstClassLeg?.anchorIndex ?? legacyPotentialOpenLeg?.anchorIndex ?? null
  );
  if (maxIdx !== null && maxIdx > evaluationBarIndex) {
    transition.futureSafe = false;
    reasons.push("POTENTIAL_LOOKAHEAD_RISK: evidence index exceeds evaluationBarIndex.");
  }
  if (openLegResolution && !openLegResolution.futureSafe) {
    transition.futureSafe = false;
  }
  const invalidationAvailable = resolveProspectiveStructuralInvalidation(historicalSetup).available;
  const objectiveEligibility = objectiveEligibilityFromProspectivePhase(
    phaseStatus,
    transition.futureSafe,
    invalidationAvailable
  );
  if (openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" && phaseStatus !== "PHASE_IN_PROGRESS") {
    objectiveEligibilityReasons.push(
      "Open movement alone does not establish prospective objective phase."
    );
  }
  const prospectiveWaveLabel = null;
  let supportVerdict = "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY";
  if (phaseStatus === "PHASE_IN_PROGRESS" && transition.futureSafe) {
    supportVerdict = "SUPPORTED_BY_CONTRACT";
  } else if (phaseStatus === "TRANSITION_OBSERVED" && openLegResolution?.status !== "AVAILABLE") {
    supportVerdict = "ENGINE_CANNOT_REPRESENT_OPEN_OBJECTIVE_LEG";
    reasons.push(
      "Structural transition without first-class open leg at evaluation bar."
    );
  } else if (openLegResolution?.status === "AVAILABLE" && phaseStatus === "OPEN_MOVEMENT_OBSERVED") {
    reasons.push(
      "First-class open leg observed; structural transition not fully established for phase."
    );
  }
  const productionSupportVerdicts = [];
  if (openLegResolution?.status === "AVAILABLE") {
    productionSupportVerdicts.push("EXISTING_ENGINE_SUPPORTS_PROSPECTIVE_SETUP");
  } else {
    productionSupportVerdicts.push("NEEDS_OPEN_LEG_ABSTRACTION");
  }
  if (!transition.futureSafe) {
    productionSupportVerdicts.push("NEEDS_EVALUATION_SCOPED_ENGINE");
  }
  if (supportVerdict === "NO_IMPLEMENTABLE_PROSPECTIVE_FAMILY") {
    productionSupportVerdicts.push("NEEDS_NEW_WAVE_TRANSITION_POLICY");
  }
  reasons.push(
    "Prospective setup is structural phase context only \u2014 not prediction, signal, or recommendation."
  );
  reasons.push("prospectiveWaveLabel is not inferred from currentWave+1.");
  if (openLegPathComparison.verdict === "DIVERGENT") {
    reasons.push(
      `Open leg path divergence: ${openLegPathComparison.notes.join(" ")}`
    );
  }
  const labelFreeVerdict = firstClassLeg !== null && openLegResolution?.anchorSelection === "SELECTED" ? "SUPPORTED" : "UNRESOLVED";
  return {
    semanticCategory: PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
    familyId: PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    transitionEvidence: transition,
    openLeg: firstClassLeg,
    openLegResolution,
    legacyPotentialOpenLeg,
    openLegPathComparison,
    openMovementVerdict,
    structuralTransitionVerdict,
    legacyPhaseStatus,
    phaseStatus,
    prospectiveWaveLabel,
    objectiveEligibility,
    objectiveEligibilityReasons,
    invalidationAvailable,
    labelFreeVerdict,
    supportVerdict,
    productionSupportVerdicts,
    potentialLookaheadRisk: !transition.futureSafe,
    reasons
  };
}
function unsupportedResult(historicalSetup, evaluationBarIndex, reasons) {
  return {
    semanticCategory: PROSPECTIVE_TRADE_SETUP_SEMANTIC_CATEGORY,
    familyId: PROSPECTIVE_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    sourceSetupId: historicalSetup.id,
    sourceSetupType: historicalSetup.setupTypeId,
    transitionEvidence: {
      sourceSetupId: historicalSetup.id,
      sourceSetupType: historicalSetup.setupTypeId,
      completedStructure: null,
      completedAtIndex: null,
      subsequentSwingIndex: null,
      subsequentSwingDirection: null,
      swingConfirmationLagBars: null,
      transitionEvidenceLevel: "NO_TRANSITION",
      transitionRuleId: PRODUCTION_TRANSITION_RULE_ID,
      candidateLegLabel: null,
      candidateLegStartIndex: null,
      candidateLegEndIndex: null,
      candidateLegState: null,
      evaluationBarIndex,
      futureSafe: true,
      notes: []
    },
    openLeg: null,
    openLegResolution: null,
    legacyPotentialOpenLeg: null,
    openLegPathComparison: null,
    openMovementVerdict: "NO_OPEN_MOVEMENT",
    structuralTransitionVerdict: "NO_STRUCTURAL_TRANSITION",
    legacyPhaseStatus: "INSUFFICIENT_CONTEXT",
    phaseStatus: "INSUFFICIENT_CONTEXT",
    prospectiveWaveLabel: null,
    objectiveEligibility: "INSUFFICIENT_CONTEXT",
    objectiveEligibilityReasons: [],
    invalidationAvailable: false,
    labelFreeVerdict: "UNRESOLVED",
    supportVerdict: "INSUFFICIENT_CONTEXT",
    productionSupportVerdicts: ["NEEDS_NEW_WAVE_TRANSITION_POLICY"],
    potentialLookaheadRisk: false,
    reasons
  };
}

// src/wave/setup/prospective-setup-source-policy.ts
function evaluateProspectiveSourcePolicy(input) {
  if (!input.setup.isTradeSetup) {
    return {
      verdict: "REJECTED_NOT_TRADE_SETUP",
      sourceKind: null,
      detail: "Prospective production accepts trade setups only."
    };
  }
  const temporal = resolveTradeSetupTemporalContext(input.setup, input.bundle);
  if (temporal.temporalClass !== "HISTORICAL_STRUCTURE") {
    return {
      verdict: "REJECTED_NOT_HISTORICAL_STRUCTURE",
      sourceKind: null,
      detail: `Temporal class ${temporal.temporalClass} is not completed historical structure.`
    };
  }
  if (temporal.focusWaveState !== "ENDPOINT_CONFIRMED") {
    return {
      verdict: "REJECTED_ENDPOINT_NOT_CONFIRMED",
      sourceKind: null,
      detail: "Completed structural endpoint not confirmed at evaluation bar."
    };
  }
  return {
    verdict: "ACCEPTED_HISTORICAL_TRADE_SETUP",
    sourceKind: "HISTORICAL_TRADE_SETUP",
    detail: "Historical trade setup with HISTORICAL_STRUCTURE and confirmed endpoint (lifecycle CONFIRMED not required)."
  };
}

// src/wave/setup/prospective-setup-production-types.ts
var PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT = "STRUCTURAL_RESUMPTION_CONTEXT";

// src/wave/setup/prospective-phase-semantics.ts
function evaluateProspectivePhaseTruth(input) {
  const blockingReasons = [];
  if (!input.sourceAccepted) {
    blockingReasons.push("SOURCE_NOT_ACCEPTED");
  }
  if (!input.anchorSelected || !input.anchorMatchesCompletedEndpoint) {
    blockingReasons.push("ANCHOR_NOT_AT_COMPLETED_ENDPOINT");
  }
  if (!input.openLegAvailable) {
    blockingReasons.push("OPEN_LEG_UNAVAILABLE");
  }
  if (!input.transitionObserved) {
    blockingReasons.push("TRANSITION_NOT_OBSERVED");
  }
  if (input.invalidationTriggered) {
    blockingReasons.push("INVALIDATION_TRIGGERED");
  }
  if (!input.invalidationAvailable) {
    blockingReasons.push("INVALIDATION_UNAVAILABLE");
  }
  if (!input.futureSafe) {
    blockingReasons.push("NOT_FUTURE_SAFE");
  }
  if (input.phaseStatus !== "PHASE_IN_PROGRESS") {
    blockingReasons.push(`PHASE_STATUS_${input.phaseStatus}`);
  }
  const productionConfirmed = input.sourceAccepted && input.anchorSelected && input.anchorMatchesCompletedEndpoint && input.openLegAvailable && input.transitionObserved && input.invalidationAvailable && !input.invalidationTriggered && input.futureSafe && input.phaseStatus === "PHASE_IN_PROGRESS";
  return {
    sourceAccepted: input.sourceAccepted,
    anchorMatchesCompletedEndpoint: input.anchorMatchesCompletedEndpoint,
    openLegAvailable: input.openLegAvailable,
    transitionObserved: input.transitionObserved,
    invalidationAvailable: input.invalidationAvailable,
    futureSafe: input.futureSafe,
    phaseStatus: input.phaseStatus,
    productionConfirmed,
    blockingReasons
  };
}

// src/wave/setup/prospective-setup-production.ts
function scopedCandles2(candles, evaluationBarIndex) {
  return candles.slice(0, evaluationBarIndex + 1);
}
function resolveFunnel(input) {
  if (!input.sourceOk) {
    return { stage: "SOURCE", code: "SOURCE_NOT_HISTORICAL_STRUCTURE" };
  }
  if (input.openLegStatus !== "AVAILABLE") {
    if (input.anchorSelection === "CONFLICT" || input.openLegStatus === "ANCHOR_CONFLICT") {
      return { stage: "ANCHOR", code: "ANCHOR_CONFLICT" };
    }
    if (input.anchorSelection === "AMBIGUOUS") {
      return { stage: "ANCHOR", code: "ANCHOR_AMBIGUOUS" };
    }
    if (input.openLegStatus === "NO_OBSERVED_SPAN") {
      return { stage: "OPEN_LEG", code: "NO_OBSERVED_SPAN" };
    }
    return { stage: "OPEN_LEG", code: "OPEN_LEG_UNAVAILABLE" };
  }
  if (input.anchorSelection !== "SELECTED") {
    return {
      stage: "ANCHOR",
      code: input.anchorSelection === "AMBIGUOUS" ? "ANCHOR_AMBIGUOUS" : "ANCHOR_NOT_SELECTED"
    };
  }
  if (!input.transitionObserved) {
    return {
      stage: "TRANSITION",
      code: input.openMovementOnly ? "OPEN_MOVEMENT_ONLY" : "TRANSITION_NOT_OBSERVED"
    };
  }
  if (input.invalidationTriggered) {
    return { stage: "INVALIDATION", code: "INVALIDATION_TRIGGERED" };
  }
  if (!input.invalidationOk) {
    return { stage: "INVALIDATION", code: "INVALIDATION_UNAVAILABLE" };
  }
  if (!input.futureSafe) {
    return { stage: "PROSPECTIVE_CONFIRMED", code: "NOT_FUTURE_SAFE" };
  }
  if (!input.productionConfirmed) {
    return { stage: "PROSPECTIVE_CONFIRMED", code: "PROSPECTIVE_NOT_CONFIRMED" };
  }
  if (!input.objectiveEligible) {
    return { stage: "OBJECTIVE_ELIGIBLE", code: "OBJECTIVE_NOT_ELIGIBLE" };
  }
  if (!input.targetGatePass) {
    return { stage: "TARGET_GATE", code: "TARGET_GATE_FAIL" };
  }
  return { stage: "COMPLETE", code: null };
}
function productionStatus(input) {
  if (!input.sourceOk) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (input.invalidationTriggered) {
    return "INVALIDATED";
  }
  if (input.productionConfirmed) {
    return "CONFIRMED";
  }
  return "CANDIDATE";
}
function evaluateProspectiveSetupProduction(input) {
  const { historicalSetup, bundle, candles } = input;
  const evaluationBarIndex = bundle.evaluationBarIndex;
  const effective = scopedCandles2(candles, evaluationBarIndex);
  const sourcePolicy = evaluateProspectiveSourcePolicy({
    setup: historicalSetup,
    bundle
  });
  const sourceOk = sourcePolicy.verdict === "ACCEPTED_HISTORICAL_TRADE_SETUP";
  const openLegResolution = resolveOpenStructuralLeg({
    bundle,
    candles: effective,
    historicalSetup: sourceOk ? historicalSetup : null
  });
  const contract = resolveProspectiveSetupContract({
    historicalSetup,
    bundle,
    candles: effective
  });
  const transitionObserved = contract.structuralTransitionVerdict === "STRUCTURAL_TRANSITION_OBSERVED";
  const openMovementOnly = contract.openMovementVerdict === "OPEN_MOVEMENT_OBSERVED" && !transitionObserved;
  const structuralInvalidation = resolveProspectiveStructuralInvalidation(historicalSetup);
  const invalidationTriggered = historicalSetup.status === "INVALID" || structuralInvalidation.triggered;
  const invalidationOk = structuralInvalidation.available;
  const completedAtIndex = contract.transitionEvidence.completedAtIndex;
  const anchorAtCompleted = openLegResolution.leg !== null && completedAtIndex !== null && openLegResolution.leg.anchorIndex === completedAtIndex;
  const phaseTruth = evaluateProspectivePhaseTruth({
    sourceAccepted: sourceOk,
    anchorMatchesCompletedEndpoint: anchorAtCompleted,
    openLegAvailable: openLegResolution.status === "AVAILABLE",
    anchorSelected: openLegResolution.anchorSelection === "SELECTED",
    transitionObserved,
    invalidationAvailable: invalidationOk,
    invalidationTriggered,
    futureSafe: openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    phaseStatus: contract.phaseStatus
  });
  const productionConfirmed = phaseTruth.productionConfirmed;
  const objectiveEligibility = productionConfirmed ? "ELIGIBLE" : contract.objectiveEligibility;
  const contractForGate = productionConfirmed ? {
    ...contract,
    supportVerdict: "SUPPORTED_BY_CONTRACT",
    phaseStatus: "PHASE_IN_PROGRESS",
    objectiveEligibility: "ELIGIBLE"
  } : contract;
  const targetGate = evaluateObjectiveTargetEligibilityGate(contractForGate);
  const targetGatePass = targetGate.outcome === "PASS";
  const funnel = resolveFunnel({
    sourceOk,
    openLegStatus: openLegResolution.status,
    anchorSelection: openLegResolution.anchorSelection,
    transitionObserved,
    openMovementOnly,
    invalidationOk,
    invalidationTriggered,
    futureSafe: openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    productionConfirmed,
    objectiveEligible: objectiveEligibility === "ELIGIBLE",
    targetGatePass
  });
  const status = productionStatus({
    sourceOk,
    invalidationTriggered,
    productionConfirmed
  });
  const id = `${historicalSetup.symbol}:${historicalSetup.timeframe}:prospective:${PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT}:${historicalSetup.id}`;
  return {
    schemaVersion: "1.0",
    id,
    symbol: historicalSetup.symbol,
    timeframe: historicalSetup.timeframe,
    familyId: PROSPECTIVE_PRODUCTION_FAMILY_STRUCTURAL_RESUMPTION_CONTEXT,
    semanticCategory: "PROSPECTIVE_TRADE_SETUP",
    sourceKind: "HISTORICAL_TRADE_SETUP",
    sourceSetupId: historicalSetup.id,
    sourceSetupTypeId: historicalSetup.setupTypeId,
    status,
    evaluationBarIndex,
    prospectiveWaveLabel: null,
    observedDirection: openLegResolution.leg?.observedDirection ?? null,
    openLegResolution,
    contract,
    objectiveEligibility,
    targetGateOutcome: targetGate.outcome,
    funnelFirstFailure: funnel.stage,
    funnelReasonCode: funnel.code,
    futureSafe: openLegResolution.futureSafe && contract.transitionEvidence.futureSafe,
    usesLegacyPotentialAsProductionEvidence: false
  };
}
function detectProspectiveSetupProduction(input) {
  const candidates = [];
  for (const setup of input.historicalTradeSetups) {
    const bundle = input.tradeContext.bundlesBySymbol?.[setup.symbol];
    const candles = input.candlesBySymbol[setup.symbol];
    if (!bundle || !candles?.length) {
      continue;
    }
    if (setup.setupTypeId !== "impulse-continuation" && setup.setupTypeId !== "correction-end") {
      continue;
    }
    candidates.push(
      evaluateProspectiveSetupProduction({
        historicalSetup: setup,
        bundle,
        candles
      })
    );
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  const summary = {
    candidates: candidates.length,
    confirmed: 0,
    objectiveEligible: 0,
    targetGatePass: 0
  };
  for (const c of candidates) {
    summary[`status:${c.status}`] = (summary[`status:${c.status}`] ?? 0) + 1;
    summary[`funnel:${c.funnelFirstFailure}`] = (summary[`funnel:${c.funnelFirstFailure}`] ?? 0) + 1;
    if (c.funnelReasonCode) {
      summary[`reason:${c.funnelReasonCode}`] = (summary[`reason:${c.funnelReasonCode}`] ?? 0) + 1;
    }
    if (c.status === "CONFIRMED") {
      summary.confirmed += 1;
    }
    if (c.objectiveEligibility === "ELIGIBLE") {
      summary.objectiveEligible += 1;
    }
    if (c.targetGateOutcome === "PASS") {
      summary.targetGatePass += 1;
    }
  }
  return {
    schemaVersion: "1.0",
    candidates,
    summary
  };
}

// src/wave/setup/prospective-reference-evaluation.ts
function evaluateProspectiveReferenceBundle(input) {
  const limitations = [
    "Prospective reference evaluation is not a trade signal or execution instruction.",
    "Entry reference is evaluation-bar close only (no enter-now semantics).",
    "Stop reference maps structural invalidation when on risk side of entry.",
    "Target reference uses explicit open-leg range equality projection policy."
  ];
  if (input.production.status !== "CONFIRMED") {
    return {
      schemaVersion: "1.0",
      prospectiveId: input.production.id,
      entry: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE"
      },
      stop: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE"
      },
      target: {
        outcome: "INSUFFICIENT_CONTEXT",
        referencePrice: null,
        modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
        policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY"
      },
      rr: { outcome: "INSUFFICIENT_CONTEXT", ratio: null },
      readyForFurtherEvaluation: false,
      limitations
    };
  }
  const bar = input.bundle.evaluationBarIndex;
  const close = input.candles[bar]?.close;
  const leg = input.production.openLegResolution.leg;
  const inv = resolveProspectiveStructuralInvalidation(input.historicalSetup);
  const entryOk = Number.isFinite(close);
  const entryPrice = entryOk ? close : null;
  let stopOk = false;
  let stopPrice = null;
  if (entryOk && inv.invalidationPrice !== null && leg) {
    const dir = leg.observedDirection;
    if (dir === "BULLISH" && inv.invalidationPrice < entryPrice) {
      stopOk = true;
      stopPrice = inv.invalidationPrice;
    }
    if (dir === "BEARISH" && inv.invalidationPrice > entryPrice) {
      stopOk = true;
      stopPrice = inv.invalidationPrice;
    }
  }
  let targetOk = false;
  let targetPrice = null;
  if (entryOk && leg && leg.observedDirection !== "UNRESOLVED") {
    const move = entryPrice - leg.anchorPrice;
    targetPrice = entryPrice + move;
    targetOk = Number.isFinite(targetPrice);
  }
  let rrOk = false;
  let ratio = null;
  if (entryOk && stopOk && targetOk && stopPrice !== null && targetPrice !== null) {
    const risk = Math.abs(entryPrice - stopPrice);
    const reward = Math.abs(targetPrice - entryPrice);
    if (risk > 0) {
      ratio = reward / risk;
      rrOk = Number.isFinite(ratio);
    }
  }
  const ready = entryOk && stopOk && targetOk && rrOk && input.production.targetGateOutcome === "PASS";
  return {
    schemaVersion: "1.0",
    prospectiveId: input.production.id,
    entry: {
      outcome: entryOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: entryPrice,
      modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE"
    },
    stop: {
      outcome: stopOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: stopPrice,
      modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE"
    },
    target: {
      outcome: targetOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      referencePrice: targetPrice,
      modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
      policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY"
    },
    rr: {
      outcome: rrOk ? "AVAILABLE" : "INSUFFICIENT_CONTEXT",
      ratio
    },
    readyForFurtherEvaluation: ready,
    limitations
  };
}

// src/wave/wave-scanner-presentation-types.ts
var WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION = "1.0";

// src/wave/wave-scanner-presentation.ts
function layerStatus(outcome) {
  return outcome === "AVAILABLE" ? "AVAILABLE" : "INSUFFICIENT_CONTEXT";
}
function refField(outcome, price, source) {
  return {
    status: layerStatus(outcome),
    price,
    source
  };
}
function displayStatusForRow(row) {
  if (row.loadError) {
    return "INSUFFICIENT_CONTEXT";
  }
  if (row.references.readyForFurtherEvaluation) {
    return "READY FOR EVALUATION";
  }
  if (row.production?.status) {
    return row.production.status;
  }
  return "INSUFFICIENT_CONTEXT";
}
function presentWaveScannerRow(row) {
  const production = row.production;
  const contract = production?.contract;
  const setup = row.historicalSetup;
  const entryReference = refField(
    row.references.entry.outcome,
    row.references.entry.referencePrice,
    row.references.entry.modelId
  );
  const stopReference = refField(
    row.references.stop.outcome,
    row.references.stop.referencePrice,
    row.references.stop.modelId
  );
  const targetReference = refField(
    row.references.target.outcome,
    row.references.target.referencePrice,
    row.references.target.policyId
  );
  const rr = {
    status: layerStatus(row.references.rr.outcome),
    value: row.references.rr.ratio
  };
  const prospectiveSetup = production ? {
    family: production.familyId,
    status: production.status,
    temporalState: contract?.phaseStatus ?? "NOT_ESTABLISHED"
  } : null;
  const structure = setup?.scenarioRef.structure ?? contract?.transitionEvidence.completedStructure ?? null;
  const scenarioLabel = setup ? `${setup.scenarioRef.structure} \xB7 wave ${setup.scenarioRef.waveLabel}` : null;
  const blockerStage = production?.funnelFirstFailure ?? null;
  const blockerReason = production?.funnelReasonCode ?? row.loadError;
  const trace = {
    anchorIndex: production?.openLegResolution.leg?.anchorIndex ?? null,
    anchorPrice: production?.openLegResolution.leg?.anchorPrice ?? null,
    anchorSources: production?.openLegResolution.leg?.selectedAnchorSources ?? [],
    anchorResolutionMode: production?.openLegResolution.anchorResolutionMode ?? null,
    completedEndpointIndex: contract?.transitionEvidence.completedAtIndex ?? null,
    completedEndpointPrice: setup?.sourceScenario.endPrice ?? null,
    observedDirection: production?.observedDirection ?? null,
    transitionEvidenceLevel: contract?.transitionEvidence.transitionEvidenceLevel ?? null,
    swingConfirmationLagBars: contract?.transitionEvidence.swingConfirmationLagBars ?? null,
    subsequentSwingIndex: contract?.transitionEvidence.subsequentSwingIndex ?? null,
    invalidationSource: setup?.invalidation.usesScenarioInvalidation ? "SCENARIO_INVALIDATION" : "SETUP_INVALIDATION",
    invalidationAvailable: contract?.invalidationAvailable ?? false,
    targetPolicyId: row.references.target.policyId,
    transitionRuleId: contract?.transitionEvidence.transitionRuleId ?? null
  };
  const technicalDiagnostics = production ? {
    prospectiveId: production.id,
    funnel: {
      firstFailure: production.funnelFirstFailure,
      reason: production.funnelReasonCode
    },
    openLeg: production.openLegResolution,
    contractPhase: contract?.phaseStatus,
    targetGate: production.targetGateOutcome
  } : { loadError: row.loadError };
  return {
    schemaVersion: WAVE_SCANNER_PRESENTATION_SCHEMA_VERSION,
    symbol: row.symbol,
    timeframe: row.timeframe,
    evaluationBarTime: row.evaluationBarTime,
    structure,
    scenario: scenarioLabel,
    prospectiveSetup,
    entryReference,
    stopReference,
    targetReference,
    rr,
    readyForFurtherEvaluation: row.references.readyForFurtherEvaluation,
    displayStatus: displayStatusForRow(row),
    blockerStage,
    blockerReason,
    futureSafe: production?.futureSafe ?? false,
    loadError: row.loadError,
    details: {
      market: {
        symbol: row.symbol,
        timeframe: row.timeframe,
        evaluationBarIndex: row.evaluationBarIndex,
        evaluationBarTime: row.evaluationBarTime,
        candleCount: row.candleCount
      },
      structure,
      scenario: {
        scenarioId: setup?.scenarioRef.scenarioId ?? null,
        waveLabel: setup?.scenarioRef.waveLabel ?? null,
        structure: setup?.scenarioRef.structure ?? null,
        engineStatus: setup?.scenarioRef.engineStatus ?? null
      },
      prospectiveSetup,
      historicalSetupStatus: setup?.status ?? null,
      anchor: {
        selection: production?.openLegResolution.anchorSelection ?? null,
        status: production?.openLegResolution.status ?? null
      },
      openStructuralLeg: {
        status: production?.openLegResolution.status ?? null,
        observationEndIndex: production?.openLegResolution.leg?.observationEndIndex ?? null,
        observationSpanBars: production?.openLegResolution.leg?.observationSpanBars ?? null
      },
      transition: {
        verdict: contract?.structuralTransitionVerdict ?? null,
        evidenceLevel: contract?.transitionEvidence.transitionEvidenceLevel ?? null
      },
      invalidation: {
        available: contract?.invalidationAvailable ?? false,
        triggered: setup?.status === "INVALID"
      },
      entryReference,
      stopReference,
      targetReference,
      rr,
      structuralTrace: trace,
      technicalDiagnosticsJson: JSON.stringify(technicalDiagnostics, null, 2)
    }
  };
}
var WAVE_SCANNER_UI_LABELS = {
  entryColumn: "Entry Ref",
  stopColumn: "SL Ref",
  targetColumn: "Target Ref",
  readyDisplay: "READY FOR EVALUATION"
};

// src/wave/production-wave-scanner.ts
function emptyReference() {
  return {
    schemaVersion: "1.0",
    prospectiveId: "",
    entry: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE"
    },
    stop: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE"
    },
    target: {
      outcome: "INSUFFICIENT_CONTEXT",
      referencePrice: null,
      modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
      policyId: "PROSPECTIVE_OPEN_LEG_RANGE_EQUALITY"
    },
    rr: { outcome: "INSUFFICIENT_CONTEXT", ratio: null },
    readyForFurtherEvaluation: false,
    limitations: []
  };
}
function selectDisplayProspectiveCandidate(rows) {
  if (rows.length === 0) {
    return null;
  }
  const rank = (r) => {
    if (r.references.readyForFurtherEvaluation) {
      return 0;
    }
    if (r.production.status === "CONFIRMED") {
      return 1;
    }
    if (r.production.status === "CANDIDATE") {
      return 2;
    }
    if (r.production.status === "INVALIDATED") {
      return 3;
    }
    return 4;
  };
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) {
      return d;
    }
    return a.production.id.localeCompare(b.production.id);
  })[0];
}
function composeProductionWaveScannerForSymbol(input) {
  const { symbol, candles, timeframeId, engineOptions } = input;
  if (!candles.length) {
    return {
      symbol,
      timeframe: timeframeId,
      loadError: "INSUFFICIENT_CANDLES",
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime: null,
      evaluationBarIndex: null,
      candleCount: 0
    };
  }
  const boundary = resolveTradeSetupEvaluationBoundary({
    candles,
    closedSeriesOnly: true
  });
  if (!boundary.boundaryEstablished || boundary.evaluationBarIndex < 0) {
    return {
      symbol,
      timeframe: timeframeId,
      loadError: "EVALUATION_BAR_NOT_ESTABLISHED",
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime: null,
      evaluationBarIndex: null,
      candleCount: candles.length
    };
  }
  const evaluationBarIndex = boundary.evaluationBarIndex;
  const evaluationBarTime = candles[evaluationBarIndex]?.time ?? null;
  try {
    const scan = runWaveScan([{ symbol, candles }], {
      timeframe: timeframeId,
      engineOptions
    });
    const scanError = scan.errors.find((e) => e.symbol === symbol);
    if (scanError) {
      return {
        symbol,
        timeframe: timeframeId,
        loadError: scanError.message,
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length
      };
    }
    const tradeContext = buildTradeSetupEvaluationContext(
      scan,
      {
        [symbol]: {
          candles,
          closedSeriesOnly: true,
          evaluationBarIndex
        }
      },
      engineOptions
    );
    const setupDetection = detectSetups({ scanReport: scan, tradeContext });
    const historicalTradeSetups = setupDetection.candidates.filter(
      (c) => c.isTradeSetup
    );
    const productionReport = detectProspectiveSetupProduction({
      historicalTradeSetups,
      tradeContext,
      candlesBySymbol: { [symbol]: candles }
    });
    const setupsById = new Map(historicalTradeSetups.map((s) => [s.id, s]));
    const bundle = tradeContext.bundlesBySymbol?.[symbol];
    if (!bundle) {
      return {
        symbol,
        timeframe: timeframeId,
        loadError: "ANALYSIS_BUNDLE_UNAVAILABLE",
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length
      };
    }
    const composed = productionReport.candidates.map((production) => {
      const historicalSetup = setupsById.get(production.sourceSetupId);
      const references = evaluateProspectiveReferenceBundle({
        production,
        historicalSetup,
        bundle,
        candles
      });
      return { production, references, historicalSetup };
    });
    const selected = selectDisplayProspectiveCandidate(composed);
    if (!selected) {
      return {
        symbol,
        timeframe: timeframeId,
        loadError: null,
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime,
        evaluationBarIndex,
        candleCount: candles.length
      };
    }
    return {
      symbol,
      timeframe: timeframeId,
      loadError: null,
      historicalSetup: selected.historicalSetup,
      production: selected.production,
      references: selected.references,
      evaluationBarTime,
      evaluationBarIndex,
      candleCount: candles.length
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      symbol,
      timeframe: timeframeId,
      loadError: message,
      historicalSetup: null,
      production: null,
      references: emptyReference(),
      evaluationBarTime,
      evaluationBarIndex,
      candleCount: candles.length
    };
  }
}
function runProductionWaveScanner(input) {
  const generatedAt = input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const symbolErrors = [];
  const rows = [];
  for (const symbol of input.symbols) {
    const candles = input.candlesBySymbol[symbol];
    if (!candles) {
      symbolErrors.push({ symbol, message: "NO_CANDLES" });
      rows.push({
        symbol,
        timeframe: input.timeframeId,
        loadError: "NO_CANDLES",
        historicalSetup: null,
        production: null,
        references: emptyReference(),
        evaluationBarTime: null,
        evaluationBarIndex: null,
        candleCount: 0
      });
      continue;
    }
    const composed = composeProductionWaveScannerForSymbol({
      symbol,
      candles,
      timeframeId: input.timeframeId,
      engineOptions: input.engineOptions
    });
    if (composed.loadError) {
      symbolErrors.push({ symbol, message: composed.loadError });
    }
    rows.push(composed);
  }
  return {
    schemaVersion: "1.0",
    timeframe: input.timeframeId,
    generatedAt,
    rows: rows.map(presentWaveScannerRow),
    symbolErrors
  };
}

// src/browser/default-watchlist.ts
var DEFAULT_WATCHLIST_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT"
];

// src/browser/demo-ohlcv.ts
var BASE_TIME_MS = 17e11;
var BAR_MS = 6e4;
var DEMO_PIVOTS = [
  { index: 2, type: "LOW", price: 100 },
  { index: 4, type: "HIGH", price: 120 },
  { index: 6, type: "LOW", price: 110 },
  { index: 8, type: "HIGH", price: 145 },
  { index: 10, type: "LOW", price: 128 },
  { index: 12, type: "HIGH", price: 155 },
  { index: 14, type: "LOW", price: 140 },
  { index: 16, type: "HIGH", price: 148 },
  { index: 18, type: "LOW", price: 132 }
];
var BAR_COUNT = 24;
var PIVOT_WINDOW_MARGIN = 4;
function buildDemoOhlcv() {
  const closes = new Array(BAR_COUNT).fill(115);
  for (let k = 0; k < DEMO_PIVOTS.length - 1; k++) {
    const a = DEMO_PIVOTS[k];
    const b = DEMO_PIVOTS[k + 1];
    const span = b.index - a.index;
    for (let i = a.index; i <= b.index; i++) {
      const t = span === 0 ? 0 : (i - a.index) / span;
      closes[i] = a.price + (b.price - a.price) * t;
    }
  }
  const candles = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const close = closes[i];
    candles.push({
      time: BASE_TIME_MS + i * BAR_MS,
      open: i === 0 ? close : candles[i - 1].close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1e3 + i % 10 * 50
    });
  }
  for (const pivot of DEMO_PIVOTS) {
    const bar = candles[pivot.index];
    if (pivot.type === "HIGH") {
      bar.high = pivot.price;
      bar.close = pivot.price - 0.5;
      bar.low = Math.min(bar.low, pivot.price - 3);
    } else {
      bar.low = pivot.price;
      bar.close = pivot.price + 0.5;
      bar.high = Math.max(bar.high, pivot.price + 3);
    }
    for (let j = pivot.index - 2; j <= pivot.index + 2; j++) {
      if (j < 0 || j >= BAR_COUNT || j === pivot.index) {
        continue;
      }
      if (pivot.type === "HIGH") {
        candles[j].high = Math.min(candles[j].high, pivot.price - PIVOT_WINDOW_MARGIN);
      } else {
        candles[j].low = Math.max(candles[j].low, pivot.price + PIVOT_WINDOW_MARGIN);
      }
    }
  }
  return candles;
}
var DEMO_OHLCV = buildDemoOhlcv();
var DEMO_WAVE_ENGINE_OPTIONS = {
  swing: {
    leftBars: 2,
    rightBars: 2,
    atrPeriod: 5,
    minAtrMultiplier: 0.05
  }
};

// src/browser/crypto-dashboard-alarm-types.ts
var CRYPTO_DASHBOARD_ALERTS_KEY = "crypto-dashboard-alerts-v1";
function emptyAlertsStore() {
  return { alerts: [], history: [] };
}

// src/browser/crypto-dashboard-idb.ts
var CRYPTO_DASHBOARD_IDB_NAME = "crypto-dashboard-db";
var CRYPTO_DASHBOARD_IDB_STORE = "kv";
var idbOpenPromise = null;
function openIdb() {
  if (idbOpenPromise) {
    return idbOpenPromise;
  }
  idbOpenPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(CRYPTO_DASHBOARD_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CRYPTO_DASHBOARD_IDB_STORE)) {
        req.result.createObjectStore(CRYPTO_DASHBOARD_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbOpenPromise;
}
async function cryptoDashboardIdbGet(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_DASHBOARD_IDB_STORE, "readonly");
    const req = tx.objectStore(CRYPTO_DASHBOARD_IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result === void 0 ? null : req.result);
    req.onerror = () => reject(req.error);
  });
}
async function cryptoDashboardIdbSet(key, value) {
  const db = await openIdb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_DASHBOARD_IDB_STORE, "readwrite");
    tx.objectStore(CRYPTO_DASHBOARD_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// src/browser/crypto-dashboard-alarm-store.ts
var defaultAlarmStoreBackend = {
  load: cryptoDashboardIdbGet,
  save: cryptoDashboardIdbSet
};
function isValidStore(v) {
  return !!v && typeof v === "object" && Array.isArray(v.alerts);
}
async function loadDashboardAlertsStore(backend = defaultAlarmStoreBackend) {
  const raw = await backend.load(CRYPTO_DASHBOARD_ALERTS_KEY);
  if (!isValidStore(raw)) {
    return emptyAlertsStore();
  }
  if (!Array.isArray(raw.history)) {
    raw.history = [];
  }
  return raw;
}
async function persistDashboardAlertsStore(store, backend = defaultAlarmStoreBackend) {
  await backend.save(CRYPTO_DASHBOARD_ALERTS_KEY, store);
}
function makeAlertId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    return `alert-${c.randomUUID()}`;
  }
  return `alert-${Date.now().toString(36)}`;
}
function waveScannerDuplicateKey(provenance) {
  return [
    provenance.source,
    provenance.symbol,
    provenance.timeframe,
    provenance.referenceType,
    provenance.referencePrice.toFixed(8)
  ].join("|");
}
function findWaveScannerDuplicate(store, duplicateKey) {
  return store.alerts.find(
    (a) => a.waveScanner?.duplicateKey === duplicateKey
  );
}
function derivePriceCrossOperator(currentPrice, referencePrice) {
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
function buildWaveScannerPriceAlert(input) {
  const { operator, atReference } = derivePriceCrossOperator(
    input.currentPrice,
    input.provenance.snapshotPrice
  );
  const name = input.alertName ?? `${input.provenance.symbol} ${referenceTypeLabel(input.provenance.referenceType)} (Wave Scanner)`;
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
        value: input.provenance.snapshotPrice
      }
    ],
    _wasTrue: atReference,
    waveScanner: input.provenance
  };
}
function referenceTypeLabel(t) {
  if (t === "ENTRY_REFERENCE") {
    return "Entry Ref";
  }
  if (t === "STRUCTURAL_INVALIDATION_REFERENCE") {
    return "SL Ref";
  }
  return "Target Ref";
}
function persistNewAlert(store, alert) {
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

// src/browser/wave-scanner-alarm-adapter.ts
var REF_LABELS = {
  ENTRY_REFERENCE: "Entry Ref",
  STRUCTURAL_INVALIDATION_REFERENCE: "SL Ref",
  TARGET_REFERENCE: "Target Ref"
};
function listAlarmableReferences(row) {
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
    )
  ];
}
function mapRef(referenceType, field, sourceModel, targetPolicy = null) {
  const available = field.status === "AVAILABLE" && field.price !== null && Number.isFinite(field.price);
  return {
    referenceType,
    label: REF_LABELS[referenceType],
    available,
    unavailableReason: available ? null : "INSUFFICIENT_CONTEXT",
    referencePrice: available ? field.price : null,
    sourceModel,
    targetPolicy
  };
}
function buildWaveScannerAlarmEditorModel(row, sourceMode) {
  const current = row.entryReference.status === "AVAILABLE" && row.entryReference.price !== null ? row.entryReference.price : null;
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    setupFamily: row.prospectiveSetup?.family ?? null,
    evaluationBarTime: row.evaluationBarTime,
    prospectiveCandidateId: row.details.technicalDiagnosticsJson?.includes("prospectiveId") ? extractProspectiveId(row.details.technicalDiagnosticsJson) : null,
    sourceMode,
    currentEvaluationPrice: current,
    references: listAlarmableReferences(row)
  };
}
function extractProspectiveId(json) {
  try {
    const o = JSON.parse(json);
    return o.prospectiveId ?? null;
  } catch {
    return null;
  }
}
function validateCreateInput(row, selected, currentEvaluationPrice) {
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
function previewWaveScannerAlarmsToCreate(input) {
  const refs = listAlarmableReferences(input.row);
  const out = [];
  for (const type of input.selectedReferenceTypes) {
    const ref = refs.find((r) => r.referenceType === type);
    if (!ref?.available || ref.referencePrice === null) {
      continue;
    }
    const provenance = buildProvenance(input, ref);
    out.push({
      referenceType: type,
      price: ref.referencePrice,
      duplicateKey: provenance.duplicateKey
    });
  }
  return out;
}
function buildProvenance(input, ref) {
  const price = ref.referencePrice;
  const duplicateKey = waveScannerDuplicateKey({
    source: "WAVE_SCANNER",
    symbol: input.row.symbol,
    timeframe: input.row.timeframe,
    referenceType: ref.referenceType,
    referencePrice: price
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
    duplicateKey
  };
}
function createWaveScannerAlarms(input) {
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
        alertId: null
      })),
      messageTr: "Alarm olu\u015Fturulamad\u0131."
    };
  }
  const refs = listAlarmableReferences(input.row);
  const items = [];
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
        alertId: null
      });
      continue;
    }
    const provenance = buildProvenance(input, ref);
    const alert = buildWaveScannerPriceAlert({
      provenance,
      currentPrice: input.currentEvaluationPrice
    });
    const persisted = persistNewAlert(input.store, alert);
    if (persisted.duplicate) {
      duplicates += 1;
      items.push({
        referenceType,
        ok: true,
        duplicate: true,
        error: null,
        alertId: persisted.alert.id
      });
    } else {
      created += 1;
      items.push({
        referenceType,
        ok: true,
        duplicate: false,
        error: null,
        alertId: persisted.alert.id
      });
    }
  }
  let messageTr;
  if (created === 0 && duplicates === 0 && failed > 0) {
    messageTr = "Alarm olu\u015Fturulamad\u0131.";
  } else if (duplicates > 0 && created > 0) {
    messageTr = `${created} alarm olu\u015Fturuldu, ${duplicates} mevcut alarm zaten vard\u0131.`;
  } else if (duplicates > 0 && created === 0) {
    messageTr = `0 alarm olu\u015Fturuldu, ${duplicates} mevcut alarm zaten vard\u0131.`;
  } else {
    messageTr = `${created} alarm olu\u015Fturuldu.`;
  }
  return { created, duplicates, failed, items, messageTr };
}

// src/browser/wave-scanner-alarm-ui.ts
var deps = null;
var editorRow = null;
var selectedTypes = /* @__PURE__ */ new Set();
function initWaveScannerAlarmUi(d) {
  deps = d;
  const backdrop = document.getElementById("alarm-editor-backdrop");
  const closeBtn = document.getElementById("alarm-editor-close");
  const confirmBtn = document.getElementById("alarm-editor-confirm");
  closeBtn?.addEventListener("click", closeAlarmEditor);
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeAlarmEditor();
    }
  });
  confirmBtn?.addEventListener("click", () => {
    void confirmAlarmCreation();
  });
}
function openAlarmEditor(row) {
  if (!deps) {
    return;
  }
  editorRow = row;
  selectedTypes.clear();
  const backdrop = document.getElementById("alarm-editor-backdrop");
  const body = document.getElementById("alarm-editor-body");
  const preview = document.getElementById("alarm-editor-preview");
  if (!backdrop || !body || !preview) {
    return;
  }
  const model = buildWaveScannerAlarmEditorModel(row, deps.getSourceMode());
  body.innerHTML = `
    <p><strong>${model.symbol}</strong> \xB7 ${model.timeframe} \xB7 ${model.setupFamily ?? "\u2014"}</p>
    <p class="muted">De\u011Ferlendirme: ${model.evaluationBarTime ? new Date(model.evaluationBarTime).toISOString() : "\u2014"}</p>
    <p class="muted">Kaynak: ${model.sourceMode === "DEMO" ? "DEMO (i\u015Faretli)" : "LIVE"}</p>
    <p class="muted">Alarm, referans fiyat\u0131na ula\u015F\u0131ld\u0131\u011F\u0131nda bildirim verir; i\u015Flem talimat\u0131 de\u011Fildir.</p>
    <div id="alarm-ref-checkboxes"></div>
  `;
  const boxHost = document.getElementById("alarm-ref-checkboxes");
  if (!boxHost) {
    return;
  }
  for (const ref of model.references) {
    const wrap = document.createElement("label");
    wrap.className = "alarm-ref-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = !ref.available;
    input.value = ref.referenceType;
    input.addEventListener("change", () => {
      if (input.checked) {
        selectedTypes.add(ref.referenceType);
      } else {
        selectedTypes.delete(ref.referenceType);
      }
      updatePreview();
    });
    wrap.appendChild(input);
    const text = document.createElement("span");
    text.textContent = `${ref.label} \xB7 ${ref.available ? ref.referencePrice : ref.unavailableReason}`;
    wrap.appendChild(text);
    boxHost.appendChild(wrap);
  }
  preview.textContent = "Se\xE7im yap\u0131n ve onaylay\u0131n.";
  backdrop.classList.add("visible");
  updatePreview();
}
function updatePreview() {
  const preview = document.getElementById("alarm-editor-preview");
  if (!preview || !editorRow || !deps) {
    return;
  }
  if (selectedTypes.size === 0) {
    preview.textContent = "Hen\xFCz referans se\xE7ilmedi.";
    return;
  }
  const current = editorRow.entryReference.price;
  if (current === null || !Number.isFinite(current)) {
    preview.textContent = "De\u011Ferlendirme fiyat\u0131 yok; alarm olu\u015Fturulamaz.";
    return;
  }
  const items = previewWaveScannerAlarmsToCreate({
    row: editorRow,
    sourceMode: deps.getSourceMode(),
    selectedReferenceTypes: [...selectedTypes],
    currentEvaluationPrice: current
  });
  preview.textContent = items.length ? `Olu\u015Fturulacak: ${items.map((i) => `${i.referenceType} @ ${i.price}`).join(", ")}` : "Se\xE7ili referanslar kullan\u0131lam\u0131yor.";
}
function closeAlarmEditor() {
  document.getElementById("alarm-editor-backdrop")?.classList.remove("visible");
  editorRow = null;
  selectedTypes.clear();
}
async function confirmAlarmCreation() {
  if (!deps || !editorRow) {
    return;
  }
  if (selectedTypes.size === 0) {
    setAlarmFeedback("En az bir referans se\xE7in.");
    return;
  }
  const current = editorRow.entryReference.price;
  if (current === null || !Number.isFinite(current)) {
    setAlarmFeedback("Ge\xE7erli de\u011Ferlendirme fiyat\u0131 gerekli.");
    return;
  }
  const monitor = deps.getMonitor();
  const store = monitor.getStore();
  const result = createWaveScannerAlarms({
    row: editorRow,
    sourceMode: deps.getSourceMode(),
    selectedReferenceTypes: [...selectedTypes],
    store,
    currentEvaluationPrice: current
  });
  await persistDashboardAlertsStore(store);
  await monitor.reloadStore();
  deps.onStoreChanged();
  setAlarmFeedback(result.messageTr);
  closeAlarmEditor();
}
function setAlarmFeedback(message) {
  const el = document.getElementById("alarm-feedback");
  if (el) {
    el.textContent = message;
  }
}
function renderWaveScannerAlarmList(monitor) {
  const list = document.getElementById("wave-scanner-alarm-list");
  if (!list) {
    return;
  }
  const alerts = monitor.waveScannerAlerts();
  if (alerts.length === 0) {
    list.innerHTML = `<p class="muted">Wave Scanner kaynakl\u0131 alarm yok.</p>`;
    return;
  }
  list.innerHTML = "";
  for (const alert of alerts) {
    const item = document.createElement("div");
    item.className = "alarm-list-item" + (alert.enabled ? "" : " disabled");
    const ws = alert.waveScanner;
    const demoTag = ws.sourceMode === "DEMO" ? " \xB7 DEMO" : "";
    item.innerHTML = `
      <div class="alarm-list-info">
        <div class="alarm-list-name">${alert.name}${demoTag}</div>
        <div class="alarm-list-desc">${ws.referenceType} @ ${ws.snapshotPrice} \xB7 ${ws.timeframe}</div>
      </div>`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "alarm-mini-btn";
    toggle.textContent = alert.enabled ? "Durdur" : "A\xE7";
    toggle.addEventListener("click", async () => {
      await monitor.toggleAlert(alert.id);
      renderWaveScannerAlarmList(monitor);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "alarm-mini-btn danger";
    del.textContent = "Sil";
    del.addEventListener("click", async () => {
      await monitor.deleteAlert(alert.id);
      renderWaveScannerAlarmList(monitor);
    });
    item.append(toggle, del);
    list.appendChild(item);
  }
}
function attachAlarmButtonToDetails(row) {
  const host = document.getElementById("scanner-alarm-action");
  if (!host) {
    return;
  }
  host.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scanner-alarm-btn";
  btn.textContent = "Alarm Olu\u015Ftur";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAlarmEditor(row);
  });
  host.appendChild(btn);
}

// src/browser/wave-scanner-page.ts
function formatPrice(value) {
  if (value === null || !Number.isFinite(value)) {
    return "\u2014";
  }
  return value.toLocaleString(void 0, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function formatTime(ms) {
  if (ms === null || !ms) {
    return "\u2014";
  }
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}
function refCell(ref) {
  if (ref.status === "AVAILABLE" && ref.price !== null) {
    return formatPrice(ref.price);
  }
  return ref.status === "INSUFFICIENT_CONTEXT" ? "\u2014" : "n/a";
}
function rowClass(row) {
  if (row.readyForFurtherEvaluation) {
    return "row-ready";
  }
  if (row.loadError) {
    return "row-error";
  }
  return "";
}
var selectedRowId = null;
function updateScannerSourceBanner(source) {
  const el = document.getElementById("scanner-source-banner");
  if (!el) {
    return;
  }
  if (source === "DEMO") {
    el.textContent = "Kaynak: DEMO (sentetik OHLCV \u2014 canl\u0131 piyasa de\u011Fildir)";
    el.className = "source-banner source-demo";
  } else {
    el.textContent = "Kaynak: LIVE \u2014 Binance Futures REST, kapal\u0131 1H mumlar";
    el.className = "source-banner source-live";
  }
}
function renderWaveScannerReport(report) {
  const statusEl = document.getElementById("scanner-status");
  const tbody = document.getElementById("scanner-tbody");
  const metaEl = document.getElementById("scanner-meta");
  if (!tbody || !statusEl) {
    throw new Error("wave-scanner.html: missing table elements");
  }
  if (metaEl) {
    metaEl.textContent = `Updated ${formatTime(Date.parse(report.generatedAt))} \xB7 TF ${report.timeframe}`;
  }
  if (report.symbolErrors.length > 0) {
    statusEl.textContent = `${report.symbolErrors.length} symbol(s) reported load/analysis issues (see rows).`;
  } else {
    statusEl.textContent = "";
  }
  tbody.innerHTML = "";
  for (const row of report.rows) {
    const tr = document.createElement("tr");
    tr.className = rowClass(row);
    tr.dataset.symbol = row.symbol;
    const setupLabel = row.prospectiveSetup?.status ?? (row.loadError ? row.loadError : "NO PROSPECTIVE SETUP");
    const blocker = row.blockerReason && !row.readyForFurtherEvaluation ? ` \xB7 ${row.blockerReason}` : "";
    tr.innerHTML = `
      <td>${row.symbol}</td>
      <td>${row.timeframe}</td>
      <td>${row.structure ?? "\u2014"}</td>
      <td>${setupLabel}${blocker}</td>
      <td title="${row.entryReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.entryColumn}<br>${refCell(row.entryReference)}</td>
      <td title="${row.stopReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.stopColumn}<br>${refCell(row.stopReference)}</td>
      <td title="${row.targetReference.source ?? ""}">${WAVE_SCANNER_UI_LABELS.targetColumn}<br>${refCell(row.targetReference)}</td>
      <td>${row.rr.status === "AVAILABLE" && row.rr.value !== null ? row.rr.value.toFixed(2) : "\u2014"}</td>
      <td class="status-cell">${row.displayStatus}</td>
      <td class="muted">${formatTime(row.evaluationBarTime)}</td>
    `;
    tr.addEventListener("click", () => {
      selectedRowId = row.symbol;
      document.querySelectorAll("#scanner-tbody tr").forEach(
        (r) => r.classList.remove("selected")
      );
      tr.classList.add("selected");
      renderWaveScannerDetails(row);
    });
    tbody.appendChild(tr);
  }
  if (report.rows.length > 0 && !selectedRowId) {
    const first = report.rows[0];
    selectedRowId = first.symbol;
    const firstTr = tbody.querySelector("tr");
    firstTr?.classList.add("selected");
    renderWaveScannerDetails(first);
  } else if (selectedRowId) {
    const row = report.rows.find((r) => r.symbol === selectedRowId);
    if (row) {
      renderWaveScannerDetails(row);
    }
  }
}
function renderWaveScannerDetails(row) {
  const panel = document.getElementById("scanner-details");
  if (!panel) {
    return;
  }
  const d = row.details;
  const trace = d.structuralTrace;
  panel.innerHTML = `
    <h2>Details \xB7 ${row.symbol}</h2>
    <section class="detail-section">
      <h3>Market</h3>
      <p>Evaluation bar: ${d.market.evaluationBarIndex ?? "\u2014"} \xB7 ${formatTime(d.market.evaluationBarTime)}</p>
      <p>Closed candles: ${d.market.candleCount ?? "\u2014"}</p>
    </section>
    <section class="detail-section">
      <h3>Structure &amp; scenario</h3>
      <p>${d.structure ?? "\u2014"} \xB7 ${d.scenario.waveLabel ?? "\u2014"} (${d.scenario.engineStatus ?? "\u2014"})</p>
      <p class="muted">Historical setup status (not prospective): ${d.historicalSetupStatus ?? "\u2014"}</p>
    </section>
    <section class="detail-section">
      <h3>Prospective setup</h3>
      <p>Family: ${d.prospectiveSetup?.family ?? "\u2014"}</p>
      <p>Status: ${d.prospectiveSetup?.status ?? "\u2014"} \xB7 Phase: ${d.prospectiveSetup?.temporalState ?? "\u2014"}</p>
      <p>Blocker: ${row.blockerStage ?? "\u2014"} ${row.blockerReason ? `\xB7 ${row.blockerReason}` : ""}</p>
    </section>
    <section class="detail-section">
      <h3>Anchor &amp; open leg</h3>
      <p>Selection: ${d.anchor.selection ?? "\u2014"} (${d.anchor.status ?? "\u2014"})</p>
      <p>Anchor idx ${trace.anchorIndex ?? "\u2014"} \xB7 price ${formatPrice(trace.anchorPrice)} \xB7 sources ${trace.anchorSources.join(", ") || "\u2014"}</p>
      <p>Mode: ${trace.anchorResolutionMode ?? "\u2014"} \xB7 span ${d.openStructuralLeg.observationSpanBars ?? "\u2014"} bars</p>
    </section>
    <section class="detail-section">
      <h3>Transition</h3>
      <p>${d.transition.verdict ?? "\u2014"} \xB7 ${d.transition.evidenceLevel ?? "\u2014"}</p>
      <p>Lag bars: ${trace.swingConfirmationLagBars ?? "\u2014"} \xB7 subsequent swing idx ${trace.subsequentSwingIndex ?? "\u2014"}</p>
      <p class="muted">Rule: ${trace.transitionRuleId ?? "\u2014"}</p>
    </section>
    <section class="detail-section">
      <h3>Invalidation</h3>
      <p>Available: ${d.invalidation.available} \xB7 Source: ${trace.invalidationSource ?? "\u2014"}</p>
      <p class="muted">Structural invalidation reference \u2014 not an executable stop order.</p>
    </section>
    <section class="detail-section">
      <h3>Entry reference</h3>
      <p>${formatPrice(d.entryReference.price)} \xB7 ${d.entryReference.source ?? "\u2014"}</p>
    </section>
    <section class="detail-section">
      <h3>Target reference</h3>
      <p>${formatPrice(d.targetReference.price)} \xB7 policy ${trace.targetPolicyId ?? "\u2014"}</p>
      <p class="muted">Objective reference only \u2014 not a take-profit order.</p>
    </section>
    <section class="detail-section">
      <h3>RR</h3>
      <p>${d.rr.status === "AVAILABLE" && d.rr.value !== null ? d.rr.value.toFixed(2) : "\u2014"}</p>
    </section>
    <section class="detail-section">
      <h3>Structural trace</h3>
      <p>Completed endpoint idx ${trace.completedEndpointIndex ?? "\u2014"} \xB7 price ${formatPrice(trace.completedEndpointPrice)}</p>
      <p>Direction: ${trace.observedDirection ?? "\u2014"} \xB7 future-safe: ${row.futureSafe}</p>
    </section>
    <section class="detail-section" id="scanner-alarm-action"></section>
    <details class="detail-section">
      <summary>Technical diagnostics</summary>
      <pre class="tech-pre">${d.technicalDiagnosticsJson ?? ""}</pre>
    </details>
  `;
  attachAlarmButtonToDetails(row);
}
function setScannerLoading(loading) {
  const btn = document.getElementById("scanner-refresh");
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "Loading\u2026" : "Refresh";
  }
  const statusEl = document.getElementById("scanner-status");
  if (loading && statusEl) {
    statusEl.textContent = "Loading market data and running wave scanner\u2026";
  }
}

// src/browser/alarm-fire-coordination.ts
var ALARM_FIRE_BROADCAST_CHANNEL = "crypto-dashboard-alarm-fire-v1";
function buildAlarmFireEventKey(alertId, condition) {
  return `${alertId}|${condition.type}|${condition.operator}|${condition.value}`;
}
var AlarmFireCoordinator = class {
  constructor() {
    this.remoteKeys = /* @__PURE__ */ new Set();
    if (typeof BroadcastChannel !== "undefined" && typeof globalThis.window !== "undefined") {
      this.channel = new BroadcastChannel(ALARM_FIRE_BROADCAST_CHANNEL);
      this.channel.onmessage = (ev) => {
        const data = ev.data;
        if (data?.eventKey) {
          this.remoteKeys.add(data.eventKey);
        }
      };
    } else {
      this.channel = null;
    }
  }
  claimFire(store, alert, eventKey) {
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
};

// src/browser/wave-scanner-alarm-monitor.ts
function evaluatePriceCondition(price, cond) {
  if (cond.type !== "price" || price === null || !Number.isFinite(price)) {
    return false;
  }
  return cond.operator === ">" ? price > cond.value : price < cond.value;
}
function evaluateDashboardAlertsForSymbol(store, symbol, price, onFire, coordinator) {
  const coord = coordinator ?? new AlarmFireCoordinator();
  for (const alert of store.alerts) {
    if (!alert.enabled || alert.symbol !== symbol) {
      continue;
    }
    const results = alert.conditions.map(
      (c) => evaluatePriceCondition(price, c)
    );
    const combined = alert.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
    if (combined && !alert._wasTrue) {
      const primary = alert.conditions[0];
      const eventKey = primary ? buildAlarmFireEventKey(alert.id, primary) : alert.id;
      if (coord.claimFire(store, alert, eventKey)) {
        const desc = describeAlertFire(alert);
        onFire(alert, desc);
      }
    }
    alert._wasTrue = combined;
  }
}
function describeAlertFire(alert) {
  if (alert.waveScanner) {
    return `${alert.symbol} \xB7 WAVE_SCANNER \xB7 ${alert.waveScanner.referenceType} @ ${alert.waveScanner.snapshotPrice}`;
  }
  return `${alert.symbol}: fiyat ${alert.conditions.map((c) => `${c.type} ${c.operator} ${c.value}`).join(` ${alert.logic} `)}`;
}
var WaveScannerAlarmMonitor = class {
  constructor(onFire) {
    this.timer = null;
    this.store = { alerts: [], history: [] };
    this.coordinator = new AlarmFireCoordinator();
    this.polling = false;
    this.onFire = onFire;
  }
  async reloadStore() {
    this.store = await loadDashboardAlertsStore();
    return this.store;
  }
  getStore() {
    return this.store;
  }
  waveScannerAlerts() {
    return this.store.alerts.filter((a) => a.waveScanner?.source === "WAVE_SCANNER");
  }
  async persist() {
    await persistDashboardAlertsStore(this.store);
  }
  async toggleAlert(id) {
    const alert = this.store.alerts.find((a) => a.id === id);
    if (!alert) {
      return;
    }
    alert.enabled = !alert.enabled;
    alert._wasTrue = false;
    await this.persist();
  }
  async deleteAlert(id) {
    this.store.alerts = this.store.alerts.filter((a) => a.id !== id);
    await this.persist();
  }
  symbolsToWatch() {
    const set = /* @__PURE__ */ new Set();
    for (const a of this.store.alerts) {
      if (a.enabled && a.conditions.some((c) => c.type === "price")) {
        set.add(a.symbol);
      }
    }
    return [...set];
  }
  start(intervalMs = 3e3) {
    if (this.timer) {
      return;
    }
    void this.reloadStore();
    this.timer = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async poll() {
    if (this.polling) {
      return;
    }
    this.polling = true;
    const symbols = this.symbolsToWatch();
    if (symbols.length === 0) {
      this.polling = false;
      return;
    }
    for (const symbol of symbols) {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`
        );
        if (!res.ok) {
          continue;
        }
        const data = await res.json();
        const price = Number(data.price);
        if (!Number.isFinite(price)) {
          continue;
        }
        evaluateDashboardAlertsForSymbol(
          this.store,
          symbol,
          price,
          this.onFire,
          this.coordinator
        );
      } catch {
      }
    }
    await this.persist();
    this.polling = false;
  }
};

// src/browser/wave-scanner-app.ts
var SCANNER_TIMEFRAME = "1H";
var BINANCE_INTERVAL = "1h";
var BINANCE_LIMIT = 500;
var provider = new BinanceFuturesOhlcvProvider();
var alarmMonitor = new WaveScannerAlarmMonitor((alert, desc) => {
  setAlarmFeedback(`Alarm: ${alert.name} \u2014 ${desc}`);
});
function getDataSource() {
  const select = document.getElementById("data-source");
  return select?.value === "BINANCE" ? "BINANCE" : "DEMO";
}
function getSourceMode() {
  return getDataSource() === "DEMO" ? "DEMO" : "LIVE";
}
async function fetchClosedCandles(symbol) {
  return provider.getCandles(symbol, BINANCE_INTERVAL, BINANCE_LIMIT);
}
async function loadAndRenderWaveScanner() {
  setScannerLoading(true);
  const source = getDataSource();
  updateScannerSourceBanner(source);
  try {
    const candlesBySymbol = {};
    const liveErrors = [];
    if (source === "DEMO") {
      for (const symbol of DEFAULT_WATCHLIST_SYMBOLS) {
        candlesBySymbol[symbol] = DEMO_OHLCV;
      }
    } else {
      for (const symbol of DEFAULT_WATCHLIST_SYMBOLS) {
        try {
          candlesBySymbol[symbol] = await fetchClosedCandles(symbol);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          liveErrors.push(`${symbol}: ${message}`);
          candlesBySymbol[symbol] = [];
        }
      }
      const loaded = DEFAULT_WATCHLIST_SYMBOLS.filter(
        (s) => (candlesBySymbol[s]?.length ?? 0) > 0
      );
      if (loaded.length === 0) {
        const statusEl = document.getElementById("scanner-status");
        if (statusEl) {
          statusEl.textContent = "LIVE veri al\u0131namad\u0131 (Binance REST / CORS / a\u011F). Demo moduna otomatik ge\xE7ilmedi.";
        }
        return;
      }
      if (liveErrors.length > 0) {
        const statusEl = document.getElementById("scanner-status");
        if (statusEl) {
          statusEl.textContent = `LIVE k\u0131smi hata: ${liveErrors.join("; ")}`;
        }
      }
    }
    const report = runProductionWaveScanner({
      symbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      candlesBySymbol,
      timeframeId: SCANNER_TIMEFRAME,
      engineOptions: source === "DEMO" ? DEMO_WAVE_ENGINE_OPTIONS : void 0
    });
    renderWaveScannerReport(report);
  } finally {
    setScannerLoading(false);
  }
}
var uiBound = false;
function bindUi() {
  if (uiBound) {
    return;
  }
  uiBound = true;
  initWaveScannerAlarmUi({
    getSourceMode,
    getMonitor: () => alarmMonitor,
    onStoreChanged: () => renderWaveScannerAlarmList(alarmMonitor)
  });
  document.getElementById("scanner-refresh")?.addEventListener("click", () => {
    void loadAndRenderWaveScanner();
  });
  document.getElementById("data-source")?.addEventListener("change", () => {
    void loadAndRenderWaveScanner();
  });
  window.addEventListener("beforeunload", () => {
    alarmMonitor.stop();
  });
}
bindUi();
void alarmMonitor.reloadStore().then(() => {
  renderWaveScannerAlarmList(alarmMonitor);
  alarmMonitor.start(4e3);
});
void loadAndRenderWaveScanner();
export {
  loadAndRenderWaveScanner
};
