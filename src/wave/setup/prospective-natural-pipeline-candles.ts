import { DEMO_OHLCV } from "../../browser/demo-ohlcv";
import type { Candle } from "../types";

const BAR_MS = 3_600_000;
const BASE_TIME_MS = 1_700_000_000_000;

/** Tiles deterministic demo pivot geometry for longer offline replay (14N-I). */
export function buildProspectiveNaturalPipelineCandles(): Candle[] {
  const tiled: Candle[] = [];
  const reps = 8;
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < DEMO_OHLCV.length; i++) {
      const src = DEMO_OHLCV[i];
      const globalIndex = rep * DEMO_OHLCV.length + i;
      tiled.push({
        time: BASE_TIME_MS + globalIndex * BAR_MS,
        open: src.open,
        high: src.high,
        low: src.low,
        close: src.close,
        volume: src.volume,
      });
    }
  }
  return tiled;
}
