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

## CP2 — Seçilen coin için 5m ölçümleri

- Grafik zaman dilimi değişse de ölçümler doğrudan 5m mumlarından hesaplanır.
- 5/15/30 dakika fiyat değişimi: ilk mum açılışı ile son kapanış karşılaştırılır.
- Hacim, ilgili kapanmış mumların quote hacmi toplamıdır (USDT).
- Hacim değişimi, önceki eşit uzunluktaki dönemle karşılaştırılır.
- `/futures/data/openInterestHist` endpoint'inden `period=5m`, `limit=10` alınır.
- OI değişimi aynı sembolün tam 5/15/30 dakika aralıklı örnekleriyle hesaplanır.
- Son OI örneği ve son kapanmış 5m mumunun zamanları ayrı gösterilir.
- Son OI örneği 10 dakikadan eskiyse; mumlar eksik, aralıklı veya eskiyse;
  karşılaştırma tabanı sıfırsa ilgili ölçüm hesaplanmaz ve neden gösterilir.
- OI geçmişindeki hata, fiyat/hacim ölçümlerini veya grafiği engellemez.
- Coin değiştirildiğinde önceki coinin ölçümleri temizlenir; geç gelen yanıtlar atılır.
- 5m grafikte aynı mum isteği yeniden kullanılır. Diğer grafik aralıklarında yalnız
  seçilen coin için ek 5m isteği yapılır; tüm piyasaya OI isteği yapılmaz.
- OI ölçümleri bu aşamada tarama filtresine dahil değildir.

## Görüntüleme

Bu dosyalar bilgisayarınıza aktarıldıktan sonra depo kökünde:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Tarayıcıda yerel sunucunun 8000 portundaki `/futures-opportunity.html` sayfasını açın.
Node derlemesi bu bağımsız sayfa için gerekli değildir. Sadece HTML dosyasını değil,
`futures/market-data.js` ve `futures/detail-data.js` dosyalarını da aynı dizin düzeninde bulundurun.
API anahtarı gerekmez. Binance bölgesel erişim kısıtları geçerlidir.

## Doğrulama

```bash
node --test tests/futures-*.test.cjs
```

CP1 için beş, CP2 için altı test vardır. CP1: sembol kapsamı/veri eşleştirme, funding yüzde dönüşümü ve filtre,
eksik veri, eski/gelecek zaman damgaları, geçersiz sayılar ve hatalı API yanıtı.
Chromium ile kontrollü API yanıtları kullanılarak tablo, filtre, arama,
sembol seçimiyle detay yükleme ve HTTP 451 hata akışı ayrıca kontrol edildi.
Bu kontroller canlı veri doğrulaması değildir. Bulut ortamında gerçek Binance
exchangeInfo isteği HTTP 451 (bölgesel kısıtlama) döndürdü.

CP2 testleri kapanmamış mumun dışlanmasını, dönem ve önceki dönem hesabını,
eksik/eski/hatalı veriyi, tam zaman aralıklı OI örneklerini ve sıfır tabanı kapsar.
Chromium'da kontrollü yanıtlarla 5m ölçümler, OI değişimleri, farklı grafik
zaman diliminde ölçümlerin korunması ve OI HTTP 403 kısmi hata akışı kontrol edilir.

## Sonraki checkpoint'ler

- CP3: Funding, fiyat, hacim ve OI birleşimli, yönü açık fırsat kuralları.
- CP4: Gerektiğinde IndexedDB kayıtları ve ileriye dönük gözlem.

Backtest ve otomatik emir kapsam dışındadır.
