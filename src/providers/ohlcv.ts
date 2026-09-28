import type { Candle } from "../wave/types";

export interface OhlcvProvider {
  getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<Candle[]>;
}
