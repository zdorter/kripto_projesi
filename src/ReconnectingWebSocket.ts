import WebSocket from "ws";

export interface ReconnectingWebSocketOptions {
  /** Baglanilacak WebSocket adresi */
  url: string;
  /** Ilk yeniden baglanma bekleme suresi (ms) */
  initialRetryDelayMs?: number;
  /** Yeniden baglanma bekleme suresinin ulasabilecegi tavan (ms) */
  maxRetryDelayMs?: number;
  /** Binance sunucudan gelen ping'e karsi pong gonderim kontrolu icin */
  pingTimeoutMs?: number;
}

/**
 * Genel amacli, exponential backoff ile otomatik yeniden baglanan
 * WebSocket sarmalayicisi. Binance'e ozel hicbir sey icermez;
 * boylece baska stream'ler icin de tekrar kullanilabilir (modulerlik).
 */
export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private retryDelayMs: number;
  private isClosedByUser = false;
  private pingTimeout: NodeJS.Timeout | null = null;

  private readonly url: string;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly pingTimeoutMs: number;

  // Disaridan atanabilen event-handler'lar
  public onOpen: () => void = () => {};
  public onMessage: (raw: WebSocket.RawData) => void = () => {};
  public onClose: (code: number, reason: string) => void = () => {};
  public onError: (err: Error) => void = () => {};

  constructor(options: ReconnectingWebSocketOptions) {
    this.url = options.url;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 1000;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30000;
    this.pingTimeoutMs = options.pingTimeoutMs ?? 60000; // Binance ~3 dk'da bir ping atar
    this.retryDelayMs = this.initialRetryDelayMs;
  }

  connect(): void {
    this.isClosedByUser = false;
    console.log(`[WS] Baglaniliyor: ${this.url}`);

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      console.log("[WS] Baglanti kuruldu.");
      this.retryDelayMs = this.initialRetryDelayMs; // basarili baglantida gecikmeyi sifirla
      this.heartbeat();
      this.onOpen();
    });

    this.ws.on("message", (data) => {
      this.heartbeat();
      this.onMessage(data);
    });

    // Binance periyodik olarak ping frame'i gonderir; ws kutuphanesi
    // otomatik pong doner ama biz baglanti canliligini burada da takip ediyoruz.
    this.ws.on("ping", () => this.heartbeat());

    this.ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf.toString() || "sebep belirtilmedi";
      console.warn(`[WS] Baglanti kapandi. Kod: ${code}, Sebep: ${reason}`);
      this.clearHeartbeat();
      this.onClose(code, reason);
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error(`[WS] Hata: ${err.message}`);
      this.onError(err);
      // "close" eventi de tetiklenecegi icin yeniden baglanma orada planlaniyor.
    });
  }

  /** Baglanti canli sayilir; belirlenen sure icinde veri/ping gelmezse baglantiyi zorla kapat. */
  private heartbeat(): void {
    this.clearHeartbeat();
    this.pingTimeout = setTimeout(() => {
      console.warn("[WS] Zaman asimi: sunucudan veri/ping alinamadi, baglanti yeniden kuruluyor.");
      this.ws?.terminate();
    }, this.pingTimeoutMs);
  }

  private clearHeartbeat(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosedByUser) return;

    console.log(`[WS] ${this.retryDelayMs}ms sonra yeniden baglanma denenecek...`);
    setTimeout(() => this.connect(), this.retryDelayMs);

    // Exponential backoff (ustel artan bekleme suresi), tavan ile sinirli
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
  }

  close(): void {
    this.isClosedByUser = true;
    this.clearHeartbeat();
    this.ws?.close();
  }
}
