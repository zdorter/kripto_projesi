/**
 * Binance Futures combined stream sarmalayici formati:
 * { "stream": "<streamName>", "data": <payload> }
 */
export interface CombinedStreamMessage<T = unknown> {
  stream: string;
  data: T;
}

/**
 * bookTicker stream'i -> en iyi alis/satis fiyati (canli "fiyat adimi")
 * Binance Futures alanlari: e (event), u (updateId), s (symbol),
 * b (bestBidPrice), B (bestBidQty), a (bestAskPrice), A (bestAskQty), T, E
 */
export interface RawBookTicker {
  e: string;
  u: number;
  s: string;
  b: string;
  B: string;
  a: string;
  A: string;
  T: number;
  E: number;
}

/** kline (mum) stream'inin ic veri objesi */
export interface RawKline {
  t: number; // kline acilis zamani (ms)
  T: number; // kline kapanis zamani (ms)
  s: string; // sembol
  i: string; // interval, orn "1m"
  o: string; // acilis fiyati
  c: string; // kapanis fiyati (mum bitene kadar guncellenir)
  h: string; // en yuksek fiyat
  l: string; // en dusuk fiyat
  v: string; // taban varlik hacmi
  n: number; // islem sayisi
  x: boolean; // bu mum kapandi mi?
  q: string; // kota varlik hacmi
}

export interface RawKlineEvent {
  e: string;
  E: number;
  s: string;
  k: RawKline;
}

/** Konsola basilacak, sadelestirilmis fiyat adimi objesi */
export interface NormalizedTick {
  type: "tick";
  symbol: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  eventTime: string; // ISO tarih
}

/** Konsola basilacak, sadelestirilmis mum (kline) objesi */
export interface NormalizedKline {
  type: "kline";
  symbol: string;
  interval: string;
  isClosed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  openTime: string; // ISO tarih
  closeTime: string; // ISO tarih
}

export type NormalizedMessage = NormalizedTick | NormalizedKline;
