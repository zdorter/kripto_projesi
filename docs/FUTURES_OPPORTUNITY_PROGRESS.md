# Futures Opportunity Scanner

Çalışma dalı: `feature/futures-opportunity-scanner`.
Bağımsız giriş sayfası: `futures-opportunity.html`.
Mevcut Wave/MSL ekranları bu geliştirmede değiştirilmez.

## CP1 — Piyasa listesi

- Binance exchangeInfo üzerinden TRADING durumundaki USDT PERPETUAL sözleşmeler seçilir.
- Toplu ticker/24hr ve premiumIndex yanıtları sembole göre birleştirilir.
- Futures fiyatı, 24 saatlik değişim/hacim ve funding yüzde olarak listelenir.
- Hacme göre sıralama, sembol arama ve ön filtre görünümü vardır.
- Filtreler mutlak fiyat değişimi/funding ve minimum hacim içindir; yönlü strateji henüz yoktur.
- Eksik, eski veya geleceğe uyumsuz zaman damgalı veriler aday olamaz.
- Yalnız seçilen coin için güncel OI ve mum verileri istenir; grafik varsayılanı 5m'dir.
- Piyasa ve seçili coin, sayfa görünürken 60 saniyede bir yenilenir.
- Spot API bağımlılığı kaldırılmıştır; spot farkı ileriki aşamaya bırakılmıştır.
- Grafik için Lightweight Charts CDN erişimi gerekir.

## Görüntüleme

Bu dosyalar bilgisayarınıza aktarıldıktan sonra depo kökünde:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Tarayıcıda yerel sunucunun 8000 portundaki `/futures-opportunity.html` sayfasını açın.
Node derlemesi bu bağımsız sayfa için gerekli değildir. Sadece HTML dosyasını değil,
`futures/market-data.js` dosyasını da aynı dizin düzeninde bulundurun.
API anahtarı gerekmez. Binance bölgesel erişim kısıtları geçerlidir.

## Doğrulama

```bash
node --test tests/futures-market-data.test.cjs
```

Beş test: sembol kapsamı/veri eşleştirme, funding yüzde dönüşümü ve filtre,
eksik veri, eski/gelecek zaman damgaları, geçersiz sayılar ve hatalı API yanıtı.
Chromium ile kontrollü API yanıtları kullanılarak tablo, filtre, arama,
sembol seçimiyle detay yükleme ve HTTP 451 hata akışı ayrıca kontrol edildi.
Bu kontroller canlı veri doğrulaması değildir. Bulut ortamında gerçek Binance
exchangeInfo isteği HTTP 451 (bölgesel kısıtlama) döndürdü.

## Sonraki checkpoint'ler

- CP2: 5m OI geçmişi/değişimi, 5/15/30 dakika fiyat ve hacim ölçümleri.
- CP3: Funding, fiyat, hacim ve OI birleşimli, yönü açık fırsat kuralları.
- CP4: Gerektiğinde IndexedDB kayıtları ve ileriye dönük gözlem.

Backtest ve otomatik emir kapsam dışındadır.
