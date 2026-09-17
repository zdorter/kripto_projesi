import { ReconnectingWebSocket } from "./ReconnectingWebSocket";
import {
  CombinedStreamMessage,
  RawBookTicker,
  RawKlineEvent,
  NormalizedMessage,
} from "./types";

const FUTURES_WS_BASE_URL = "wss://fstream.binance.com/stream";

export interface BinanceFuturesClientOptions {
  /** Orn: "btcusdt" (kucuk harf, Binance stream isimlendirmesi kucuk harf ister) */
  symbol: string;
  /** Orn: "1m", "5m", "1h" ... */
  klineInterval?: string;
  /** Her normalize edilmis mesaj geldiginde cagrilir */
  onData: (message: NormalizedMessage) => void;
}

/**
 * Binance Futures WebSocket combined stream istemcisi.
 * - <symbol>@bookTicker  -> canli en iyi alis/satis fiyati (fiyat adimlari)
 * - <symbol>@kline_<interval> -> mum verisi
 *
 * Baglanti kopmasi durumunda ReconnectingWebSocket katmani otomatik
 * olarak yeniden baglanmayi ve stream'lere devam etmeyi saglar.
 */
export class BinanceFuturesClient {
  private readonly symbol: string;
  private readonly klineInterval: string;
  private readonly onData: (message: NormalizedMessage) => void;
  private readonly socket: ReconnectingWebSocket;

  constructor(options: BinanceFuturesClientOptions) {
    this.symbol = options.symbol.toLowerCase();
    this.klineInterval = options.klineInterval ?? "1m";
    this.onData = options.onData;

    const streamNames = [
      `${this.symbol}@bookTicker`,
      `${this.symbol}@kline_${this.klineInterval}`,
    ].join("/");

    const url = `${FUTURES_WS_BASE_URL}?streams=${streamNames}`;

    this.socket = new ReconnectingWebSocket({ url });
    this.socket.onMessage = (raw) => this.handleRawMessage(raw);
    this.socket.onOpen = () =>
      console.log(
        `[Binance] ${this.symbol.toUpperCase()} icin bookTicker ve ${this.klineInterval} kline stream'lerine abone olundu.`
      );
  }

  start(): void {
    this.socket.connect();
  }

  stop(): void {
    this.socket.close();
  }

  private handleRawMessage(raw: unknown): void {
    let parsed: CombinedStreamMessage;

    try {
      parsed = JSON.parse(raw as string) as CombinedStreamMessage;
    } catch (err) {
      console.error("[Binance] Gelen mesaj JSON olarak ayristirilamadi:", err);
      return;
    }

    if (!parsed.stream || parsed.data === undefined) {
      console.warn("[Binance] Beklenmeyen mesaj formati:", parsed);
      return;
    }

    if (parsed.stream.endsWith("@bookTicker")) {
      this.onData(this.normalizeBookTicker(parsed.data as RawBookTicker));
    } else if (parsed.stream.includes("@kline_")) {
      this.onData(this.normalizeKline(parsed.data as RawKlineEvent));
    } else {
      console.warn("[Binance] Taninmayan stream:", parsed.stream);
    }
  }

  private normalizeBookTicker(data: RawBookTicker): NormalizedMessage {
    const bestBid = parseFloat(data.b);
    const bestAsk = parseFloat(data.a);

    return {
      type: "tick",
      symbol: data.s,
      bestBid,
      bestAsk,
      spread: parseFloat((bestAsk - bestBid).toFixed(2)),
      eventTime: new Date(data.E).toISOString(),
    };
  }

  private normalizeKline(event: RawKlineEvent): NormalizedMessage {
    const k = event.k;

    return {
      type: "kline",
      symbol: k.s,
      interval: k.i,
      isClosed: k.x,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      trades: k.n,
      openTime: new Date(k.t).toISOString(),
      closeTime: new Date(k.T).toISOString(),
    };
  }
}
