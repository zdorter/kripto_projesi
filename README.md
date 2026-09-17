# Binance Futures WebSocket Client (BTCUSDT)

BTCUSDT için canlı fiyat adımlarını (`bookTicker`) ve 1 dakikalık kline (mum) verisini
Binance Futures WebSocket API üzerinden çeken, otomatik yeniden bağlanan modüler istemci.

## Dosya yapısı

- `src/types.ts` — Binance ham veri tipleri ve normalize edilmiş çıktı tipleri
- `src/ReconnectingWebSocket.ts` — Binance'ten bağımsız, genel amaçlı auto-reconnect
  WebSocket sarmalayıcısı (exponential backoff + heartbeat/timeout kontrolü)
- `src/BinanceFuturesClient.ts` — Binance'e özel stream URL'si, mesaj ayrıştırma ve
  verinin sade bir objeye dönüştürülmesi
- `src/index.ts` — Uygulama giriş noktası, gelen her mesajı JSON olarak konsola basar

## Kurulum

```bash
npm install
```

> Not: Önceki bir sürümde `dev` script'i `ts-node` kullanıyordu. Node.js 20+ (özellikle
> Node 24) ile `ts-node`'da `MODULE_NOT_FOUND: Cannot find module './index.ts'` hatası
> veren bilinen bir uyumluluk sorunu var. Bu yüzden `dev` script'i artık `tsx` kullanıyor.
> Eğer `package.json` dosyanız hâlâ eski sürümdeyse, güncellenmiş `package.json`'ı
> indirip `npm install` komutunu tekrar çalıştırmanız yeterli.

## Çalıştırma

Geliştirme modunda (derlemeden, tsx ile):

```bash
npm run dev
```

Derleyip çalıştırmak için:

```bash
npm run build
npm start
```

## Notlar

- Sembol ve kline periyodu `src/index.ts` içindeki `SYMBOL` ve `KLINE_INTERVAL`
  sabitlerinden değiştirilebilir.
- `ReconnectingWebSocket` sınıfı Binance'e özgü bir şey içermez; başka bir stream
  veya borsa için de yeniden kullanılabilir.
- Bağlantı koptuğunda (ağ hatası, sunucu kapanışı, zaman aşımı vb.) istemci artan
  gecikmelerle (1sn, 2sn, 4sn ... en fazla 30sn) otomatik olarak yeniden bağlanır
  ve aynı stream'lere tekrar abone olur.
- Binance sunucusu periyodik `ping` frame'i gönderir; bu proje `ws` kütüphanesinin
  otomatik `pong` cevabına ek olarak, belirli bir süre (varsayılan 60sn) hiç veri/ping
  gelmezse bağlantıyı kendisi sonlandırıp yeniden kurar (donmuş bağlantı koruması).
