import { BinanceFuturesClient } from "./BinanceFuturesClient";
import { NormalizedMessage } from "./types";

const SYMBOL = "btcusdt";
const KLINE_INTERVAL = "1m";

function printAsJson(message: NormalizedMessage): void {
  // Her mesaji, turune gore etiketlenmis, okunakli bir JSON olarak basiyoruz.
  if (message.type === "tick") {
    console.log(
      JSON.stringify(
        {
          tur: "canli_fiyat",
          sembol: message.symbol,
          en_iyi_alis: message.bestBid,
          en_iyi_satis: message.bestAsk,
          fark: message.spread,
          zaman: message.eventTime,
        },
        null,
        2
      )
    );
  } else {
    console.log(
      JSON.stringify(
        {
          tur: "mum_verisi",
          sembol: message.symbol,
          periyot: message.interval,
          mum_kapandi_mi: message.isClosed,
          acilis: message.open,
          en_yuksek: message.high,
          en_dusuk: message.low,
          kapanis: message.close,
          hacim: message.volume,
          islem_sayisi: message.trades,
          acilis_zamani: message.openTime,
          kapanis_zamani: message.closeTime,
        },
        null,
        2
      )
    );
  }
}

const client = new BinanceFuturesClient({
  symbol: SYMBOL,
  klineInterval: KLINE_INTERVAL,
  onData: printAsJson,
});

client.start();

// Ctrl+C ile temiz kapanis
process.on("SIGINT", () => {
  console.log("\n[Uygulama] Kapatiliyor...");
  client.stop();
  process.exit(0);
});
