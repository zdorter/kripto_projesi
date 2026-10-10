/**
 * Research-only: native 4H vs derived 1H→4H volume investigation.
 * Does not modify fixtures or MSL-7B.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveHtfCandlesFromLtf } from "../src/wave/market-structure/market-structure-htf-derivation";
import { utc4hBucketOpen } from "../src/wave/market-structure/native-htf-parity";
import { computeHistoricalFrozenOhlcvDatasetChecksum } from "../src/wave/historical-frozen-ohlcv-dataset-hash";
import {
  BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH,
  BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM,
} from "../src/wave/historical-frozen-ohlcv-dataset-types";
import type { Candle } from "../src/wave/types";

const ONE_H = 3_600_000;
const FOUR_H = 14_400_000;

function loadFixture(path: string): { candles: Candle[]; checksum: string } {
  const raw = readFileSync(join(process.cwd(), path), "utf8");
  const doc = JSON.parse(raw) as {
    metadata: { datasetChecksum: string };
    candles: Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  };
  const candles: Candle[] = doc.candles.map((c) => ({
    time: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  const checksum = computeHistoricalFrozenOhlcvDatasetChecksum(candles);
  return { candles, checksum: doc.metadata.datasetChecksum };
}

function decimalPlaces(n: number): number {
  const s = String(n);
  if (!s.includes(".")) return 0;
  return s.split(".")[1]?.length ?? 0;
}

function volumeDecimalPlacesFromJsonText(jsonText: string): number {
  let max = 0;
  const re = /"volume"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jsonText)) !== null) {
    const lit = m[1];
    const dp = lit.includes(".") ? lit.split(".")[1].length : 0;
    if (dp > max) max = dp;
  }
  return max;
}

/** Sum volumes using decimal literals from JSON text (avoids re-parse drift). */
function sumVolumesFromJsonLiterals(
  jsonText: string,
  times: readonly number[]
): number | null {
  const volByTime = new Map<number, string>();
  const rowRe =
    /\{\s*"timestamp"\s*:\s*(\d+)\s*,[\s\S]*?"volume"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(jsonText)) !== null) {
    volByTime.set(Number(m[1]), m[2]);
  }
  const parts: string[] = [];
  for (const t of times) {
    const lit = volByTime.get(t);
    if (lit === undefined) return null;
    parts.push(lit);
  }
  return decimalStringSum(parts);
}

function decimalStringSum(parts: readonly string[]): number {
  let maxScale = 0;
  for (const p of parts) {
    const dp = p.includes(".") ? p.split(".")[1].length : 0;
    maxScale = Math.max(maxScale, dp);
  }
  const scale = 10 ** maxScale;
  let total = 0n;
  for (const p of parts) {
    const [intPart, fracPart = ""] = p.split(".");
    const padded = fracPart.padEnd(maxScale, "0");
    const asBig = BigInt(intPart + padded);
    total += asBig;
  }
  return Number(total) / scale;
}

function roundToDecimals(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

interface BucketRow {
  bucketOpen: number;
  nativeVol: number;
  jsSum: number;
  decimalStrSum: number;
  members: Candle[];
  memberTimes: number[];
}

function main(): void {
  const path1h = BTCUSDT_1H_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH;
  const path4h = BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_DATASET_V1_RELATIVE_PATH;
  const json1h = readFileSync(join(process.cwd(), path1h), "utf8");
  const json4h = readFileSync(join(process.cwd(), path4h), "utf8");

  const oneH = loadFixture(path1h);
  const fourH = loadFixture(path4h);

  if (oneH.checksum !== BTCUSDT_1H_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new Error(`STOP: 1H checksum mismatch ${oneH.checksum}`);
  }
  if (fourH.checksum !== BTCUSDT_4H_NATIVE_RESEARCH_FROZEN_EXPECTED_DATASET_CHECKSUM) {
    throw new Error(`STOP: 4H checksum mismatch ${fourH.checksum}`);
  }

  const derived = deriveHtfCandlesFromLtf({
    ltfCandles: oneH.candles,
    ltfTimeframeId: "1H",
    htfTimeframeId: "4H",
  }).candles;

  const nativeByTime = new Map(fourH.candles.map((c) => [c.time, c]));
  const ltfByTime = new Map(oneH.candles.map((c) => [c.time, c]));

  let priceMismatch = 0;
  const rows: BucketRow[] = [];
  for (const d of derived) {
    const n = nativeByTime.get(d.time);
    if (!n) continue;
    if (
      d.time !== n.time ||
      d.open !== n.open ||
      d.high !== n.high ||
      d.low !== n.low ||
      d.close !== n.close
    ) {
      priceMismatch += 1;
    }
    const memberTimes = [0, 1, 2, 3].map((j) => d.time + j * ONE_H);
    const members = memberTimes.map((t) => ltfByTime.get(t)!);
    const jsSum = members.reduce((s, c) => s + c.volume, 0);
    const decimalStrSum = sumVolumesFromJsonLiterals(json1h, memberTimes)!;
    rows.push({
      bucketOpen: d.time,
      nativeVol: n.volume,
      jsSum,
      decimalStrSum,
      members,
      memberTimes,
    });
  }

  if (priceMismatch > 0) {
    throw new Error(`STOP: ${priceMismatch} price field mismatches found`);
  }

  const mismatches = rows.filter((r) => r.jsSum !== r.nativeVol);
  const matchedJs = rows.length - mismatches.length;

  const expMethods: Record<string, (r: BucketRow) => number> = {
    jsNumberSum: (r) => r.jsSum,
    decimalStringSum: (r) => r.decimalStrSum,
    jsSumRound3: (r) => roundToDecimals(r.jsSum, 3),
    jsSumRound8: (r) => roundToDecimals(r.jsSum, 8),
    decimalSumRound3: (r) => roundToDecimals(r.decimalStrSum, 3),
    decimalSumRound8: (r) => roundToDecimals(r.decimalStrSum, 8),
  };

  const methodStats: Record<string, { match: number; mismatch: number }> = {};
  for (const [name, fn] of Object.entries(expMethods)) {
    let match = 0;
    for (const r of rows) {
      if (fn(r) === r.nativeVol) match += 1;
    }
    methodStats[name] = { match, mismatch: rows.length - match };
  }

  const dp1hParsed = oneH.candles.reduce((m, c) => Math.max(m, decimalPlaces(c.volume)), 0);
  const dp4hParsed = fourH.candles.reduce((m, c) => Math.max(m, decimalPlaces(c.volume)), 0);
  const dp1hJson = volumeDecimalPlacesFromJsonText(json1h);
  const dp4hJson = volumeDecimalPlacesFromJsonText(json4h);

  function analyzeMismatch(r: BucketRow) {
    const diff = r.jsSum - r.nativeVol;
    const purelyRepr =
      r.decimalStrSum === r.nativeVol ||
      (Math.abs(diff) > 0 && r.jsSum !== r.decimalStrSum && r.decimalStrSum === r.nativeVol);
    return {
      bucketOpen: r.bucketOpen,
      bucketOpenIso: new Date(r.bucketOpen).toISOString(),
      nativeVol: r.nativeVol,
      nativeVolStr: String(r.nativeVol),
      jsSum: r.jsSum,
      jsSumStr: String(r.jsSum),
      decimalStrSum: r.decimalStrSum,
      absDiff: Math.abs(r.jsSum - r.nativeVol),
      memberVolumes: r.members.map((m) => ({
        time: m.time,
        volume: m.volume,
        volumeStr: String(m.volume),
        jsonDp: decimalPlaces(m.volume),
      })),
      decimalStrSumMatchesNative: r.decimalStrSum === r.nativeVol,
      jsSumMatchesNative: r.jsSum === r.nativeVol,
      classification:
        r.decimalStrSum === r.nativeVol
          ? "IEEE754_JS_SUM_ONLY"
          : r.jsSum === r.nativeVol
            ? "EXACT_JS"
            : "OTHER",
    };
  }

  const byAbsDiff = [...mismatches].sort(
    (a, b) => Math.abs(b.jsSum - b.nativeVol) - Math.abs(a.jsSum - a.nativeVol)
  );
  const first = mismatches[0];
  const middle = mismatches[Math.floor(mismatches.length / 2)];
  const largest = byAbsDiff[0];
  const smallest = byAbsDiff[byAbsDiff.length - 1];

  const classCounts = { IEEE754_JS_SUM_ONLY: 0, OTHER: 0, EXACT_JS: 0 };
  for (const r of rows) {
    const c = analyzeMismatch(r).classification;
    classCounts[c as keyof typeof classCounts] += 1;
  }

  console.log(
    JSON.stringify(
      {
        comparedBuckets: rows.length,
        jsSumMatched: matchedJs,
        jsSumMismatched: mismatches.length,
        priceMismatchCount: priceMismatch,
        precision: {
          maxDecimalPlaces1hParsed: dp1hParsed,
          maxDecimalPlaces4hParsed: dp4hParsed,
          maxDecimalPlaces1hJsonLiteral: dp1hJson,
          maxDecimalPlaces4hJsonLiteral: dp4hJson,
        },
        methodStats,
        mismatchClassificationCounts: classCounts,
        representatives: {
          first: first ? analyzeMismatch(first) : null,
          middle: middle ? analyzeMismatch(middle) : null,
          largest: largest ? analyzeMismatch(largest) : null,
          smallest: smallest ? analyzeMismatch(smallest) : null,
        },
        checksums: {
          h1: oneH.checksum,
          h4: fourH.checksum,
        },
      },
      null,
      2
    )
  );
}

main();
