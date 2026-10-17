# Futures Opportunity Scanner

Çalışma dalı: `feature/futures-opportunity-scanner`.
Bağımsız giriş sayfası: `futures-opportunity.html`.
Mevcut Wave/MSL ekranları bu geliştirmede değiştirilmez.

## CP1 — Piyasa listesi

- Binance exchangeInfo üzerinden TRADING durumundaki USDT PERPETUAL sözleşmeler seçilir.
- Toplu ticker/24hr ve premiumIndex yanıtları sembole göre birleştirilir.
- Futures fiyatı, 24 saatlik değişim/hacim ve funding yüzde olarak listelenir.
- Hacme göre sıralama, sembol arama ve ön filtre görünümü vardır.
- Ana mod pozitif 24H yükseliş ve minimum hacimdir; negatif funding ayrı bir moddur.
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
- OI artışı bir ön filtre zorunluluğu değildir; CP3 izleme değerlendirmesinde yönü ayrıca açıklanır.

## CP3 — Yönlü aday taraması ve otomatik izleme

- Varsayılan araştırma eşikleri: 24H yükseliş en az %20 ve hacim en az 30M USDT.
  Ana modda funding yönü serbesttir. Negatif funding modunda ayrıca funding
  en fazla -%0,10 olmalıdır. Sıfır/düşen fiyat aday değildir. Eşikler değiştirilebilir.
- Hacme göre ilk 5 uygun coin otomatik izlenir; iki işçi istekleri sınırlar.
- İzlenen coin filtre dışına çıkarsa silinmez; durum değişimi gösterilir.
  Listeyi temizleme mevcut eşiklerle yeni aday seçer. Boş slotlar yeni adaylarla dolar.
- Her adayda ilk tespit zamanı, ilk fiyat/funding, güncel funding ve ilk tespite
  göre funding farkı (yüzde puan) gösterilir. Funding geçmişi endpoint'i kullanılmaz;
  farklı sözleşmelerin ödeme aralıkları aynı varsayılmaz.
- Son OI örneğinin bittiği noktaya hizalı 15m fiyat, hacim değişimi ve OI kullanılır.
  OI artışı ve azalışı ayrı açıklanır; short squeeze kesinliği iddia edilmez.
- İlk güncel kapanmış 5m mumun dibi sabit gözlem referansıdır; fiyat bunun altına
  inerse referans kaybı yazılır. Bu referans giriş/stop emri değildir.
- Fiyatın yükselmemesi, önceki eşit döneme göre hacim azalması, ön filtre kaybı
  ve eksik/eski veri ayrı durumlar olarak gösterilir.
- İsteğe bağlı spot primi: spot exchangeInfo ile birebir baseAsset/USDT eşleşmesi
  doğrulanır. Sözleşme çarpanları tahmin edilmez. Eşleşme yoksa veri eksik kalır.
- Spot ve Futures bookTicker istekleri birlikte yapılır. 10 saniyeyi aşan yanıtlar
  kabul edilmez; prim bid/ask orta fiyatlarının farkıdır, işlem yapılabilir getiri değildir.
  Spot veri kaynağı api.binance.com'dur; engellenirse hata açıkça yazılır.
- Kontrol sayfa görünürken dakikada birdir; anlık giriş/çıkış veya bildirim yoktur.
- Kayıtlar sekmenin belleğindedir. Sayfa yenilemede silinir, kapalı tarayıcı veri toplamaz.

## Konumlanma oranları ve iki tarama modu

- “Yükseliş + hacim” varsayılan moddur. Pozitif funding adaylığı engellemez.
  “Yükseliş + negatif funding” eski yaklaşımı ayrıca korur.
- İzlenen en fazla 5 coin için üç ek endpoint kullanılır (`period=5m`, `limit=1`):
  `/futures/data/globalLongShortAccountRatio`,
  `/futures/data/topLongShortAccountRatio`,
  `/futures/data/topLongShortPositionRatio`.
- Genel hesap, büyük hesap ve büyük pozisyon short yüzdeleri ayrı gösterilir.
  İlk ikisi hesap dağılımı, üçüncüsü ilgili grubun pozisyon büyüklüğü dağılımıdır.
  Paydaları farklıdır; birleştirilmez ve tüm piyasanın net short miktarı sayılmaz.
- Short açıklama eşiği varsayılan %60'tır. Bu değer aday seçimini değil
  gözlem açıklamasını belirler; oranların eksik olduğu coinler dışlanmaz.
- Örnekler sembol, sayısal alanlar, toplam pay ve zaman damgasına göre doğrulanır.
  10 dakikadan eski örnekler kullanılamaz. Her grubun örnek zamanı ayrı yazılır.
- Bir endpoint başarısızsa diğer gruplar gösterilmeye devam eder. Eksik veriyle
  “short ağırlığı yok” sonucu üretilmez; bilinmiyor veya hata gösterilir.
- Genel hesaplar short ağırlıklıyken büyük pozisyonlar long ağırlıklı olabilir;
  tüm grupların short olma koşulu aranmaz. Sağlayıcıya özgü Market Exposure
  hesaplaması taklit edilmez. Short squeeze veya yükseliş garantisi çıkarılmaz.

## Görüntüleme

Bu dosyalar bilgisayarınıza aktarıldıktan sonra depo kökünde:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Tarayıcıda yerel sunucunun 8000 portundaki `/futures-opportunity.html` sayfasını açın.
Node derlemesi bu bağımsız sayfa için gerekli değildir. Sadece HTML dosyasını değil,
`futures/` klasöründeki JavaScript dosyalarını da aynı dizin düzeninde bulundurun.
API anahtarı gerekmez. Binance bölgesel erişim kısıtları geçerlidir.

## Doğrulama

```bash
node --test tests/futures-*.test.cjs
```

CP1 için beş, CP2 için altı, CP3 için altı test vardır. CP1: sembol kapsamı/veri eşleştirme, funding yüzde dönüşümü ve filtre,
eksik veri, eski/gelecek zaman damgaları, geçersiz sayılar ve hatalı API yanıtı.
Chromium ile kontrollü API yanıtları kullanılarak tablo, filtre, arama,
sembol seçimiyle detay yükleme ve HTTP 451 hata akışı ayrıca kontrol edildi.
Bu kontroller canlı veri doğrulaması değildir. Bulut ortamında gerçek Binance
exchangeInfo isteği HTTP 451 (bölgesel kısıtlama) döndürdü.

CP2 testleri kapanmamış mumun dışlanmasını, dönem ve önceki dönem hesabını,
eksik/eski/hatalı veriyi, tam zaman aralıklı OI örneklerini ve sıfır tabanı kapsar.
Chromium'da kontrollü yanıtlarla 5m ölçümler, OI değişimleri, farklı grafik
zaman diliminde ölçümlerin korunması ve OI HTTP 403 kısmi hata akışı kontrol edilir.

CP3 tarayıcı kontrolleri kontrollü API yanıtlarıyla: yönlü seçim, beş slot,
OI artışı/azalışı, isteğe bağlı spot primi, koşulu bozulan adayın listede tutulması,
eksik OI/spot, liste temizleme ve yeniden seçim. Bu yeni akışın canlı erişimi
bulut ortamındaki Binance konum kısıtları nedeniyle doğrulanmış değildir.

## Sonraki checkpoint'ler

- CP4: Gerektiğinde IndexedDB kayıtları ve ileriye dönük gözlem.

Backtest ve otomatik emir kapsam dışındadır.

## Scalp araştırması — geri çekilme ve dönüş

Yeni `futures/scalp-setup.js` modülü, mevcut iki tarama modunun yanında,
izlenen adayları ayrı bir tabloda değerlendirir. Otomatik emir ve backtest yoktur.

- Sıralama kayan 24H değişime göre, geçerli USDT perpetual verileri içinde yapılır.
  Varsayılan ilk 20 sınırı kullanıcı tarafından değiştirilebilir. Yeni izleme slotlarında
  bu aralıktaki adaylar önceliklidir; her grup içinde hacim sırası korunur.
  Mevcut izleme slotları otomatik silinmez; yeni seçim için liste temizlenebilir.
- Ortam: yükseliş/hacim eşiği, pozitif 15m OI değişimi, negatif ve daha negatifleşen
  funding, genel short hesap payının eşiği geçmesi ve 15m içinde artması.
- Short değişimi `globalLongShortAccountRatio` endpoint'inin 4 adet 5m örneğinden
  tam 15 dakika arayla hesaplanır. Diğer iki oran da 4 örnekle alınır ama stratejide
  kullanılmaz. Short ve OI son örnek zamanları eşleşmezse değerlendirme bekler.
- Funding geçmiş ödemelerden hesaplanmaz. Sayfa açıkken gözlenen mark zamanlı güncel
  funding oranları 30 dakika bellekte tutulur. En az 15 dakika gerekir; 15–17 dakika
  önceki gözlem karşılaştırılır, 3 dakikadan büyük gözlem boşluğu kabul edilmez.
  Kıyas başlangıç/bitişi Türkiye saatiyle gösterilir. Funding farkı yüzde puandır.
- Bu yaklaşımda “FR artışı” daha negatif hale gelmek olarak tanımlanmıştır:
  örneğin -%0,10'dan -%0,20'ye geçiş. Negatifliğin azalması ortam koşulunu geçmez.
- Yapı son 20 kapanmış ve ardışık 5m mumunda aranır: önceki tepeye göre en az
  %0,3 geri çekilme, her iki yanında birer mumla onaylı iki dip, daha yüksek ikinci
  dip, aradaki tepenin önceki ana tepeden aşağıda olması ve bu ara tepe üstünde
  en son mumun yeni kapanışı. Dip ve ara tepe seviyeleri tabloda yazılır.
- İlk dip kaybedilirse yapı geçersizdir. Kırılım önceki mumda gerçekleşmişse
  eski kırılım olarak işaretlenir; tekrar yeni tetik üretilmez.
- Bütün ortam koşulları ve yeni kırılım birlikte varsa “Long inceleme adayı”
  gösterilir. Eksik veri, eski mum, eksik gözlem veya hizasız örneklerde aday üretilmez.
- Bu başlangıç araştırma tanımı hocanın kurallarının birebir kopyası veya doğrulanmış
  kârlı strateji değildir. Spread, komisyon, slippage, hedef ve RR hesabı henüz yoktur.
  İzleme dakikada birdir; tarayıcı kapalıyken sürmez, sayfa yenilenince gözlemler silinir.

Doğrulama: `node --test tests/futures-*.test.cjs` toplam 22 test içerir.
Chromium'da kontrollü API yanıtları ve simüle edilmiş funding gözlemleriyle
ilk bekleme, tüm koşullar + yeni kırılımda aday, geçmiş silinince bekleme ve liste
sıfırlama kontrol edildi. Bu kontrol canlı 15 dakika izleme veya backtest değildir.

## RSI paneli ve 5m uyumsuzluk gözlemi

- `futures/rsi.js`: Wilder RSI(14), başlangıçta 14 değişimin ortalaması ve devamında
  Wilder yumuşatması. Düz seride 50, yalnız yükselişte 100, yalnız düşüşte 0.
- Grafik altındaki RSI paneli seçilen zaman dilimini izler. 30/50/70 referansları
  ve 0–100 ölçeği vardır; fiyat/hacim/RSI yatay kaydırma ve yakınlaştırması eşlenir.
- Seçilen coinin ayrı metin değerlendirmesi daima kapanmış 5m verisini kullanır.
  Diğer grafik aralıklarında da 300 adet 5m mum istenir. Canlı son mum dışlanır.
- 30 altında yükseliş, 30 yukarı kesişimi ve yeni kesişim olmadan RSI yükselişi
  ayrı açıklanır. Son sekiz mumda iki yanlı ikişer mumla doğrulanan ve korunmuş RSI
  dibi varsa, son RSI da yükseliyorsa dipten yükseliş ayrıca belirtilir.
- Klasik pozitif uyumsuzluk: ardışık iki doğrulanmış fiyat dibi daha aşağıdayken
  aynı mumlardaki RSI daha yukarıdadır. Negatif uyumsuzluk bunun tepe karşılığıdır.
- Fiyat pivotları sağda/solda ikişer kapalı mumla doğrulanır. Araları 3–60 mumdur.
  Dolayısıyla pivot anında değil, iki mum sonra bilinir; onay zamanı metinde verilir.
- Son üç olay fiyat ve RSI üzerinde Bull/Bear okları ve RSI bağlantı çizgileriyle
  gösterilir. Sonraki fiyat referansı aşmışsa olay gri ve geçmiş olarak işaretlenir.
  Geçerli görünen eski olaylar da yeni tetik olarak sunulmaz; olay tarihleri gösterilir.
- Uyumsuzluk ile aşırı satım ayrı gözlemlerdir: pozitif uyumsuzluk için RSI'ın 30
  altında olması şart değildir. Gizli uyumsuzluk yoktur. RSI mevcut scalp koşuluna
  otomatik eklenmemiştir; işlem emri veya kârlılık iddiası üretilmez.
- Eksik/eski/aralıklı 5m verisinde değerlendirme yapılmaz. Yeni coin yüklemesinde
  eski grafik ve RSI özeti temizlenir. 300 mumla başlatılan RSI, daha uzun geçmişle
  hesaplanan başka ekranlardan küçük farklılık gösterebilir.

Doğrulama: 28 Futures testi (RSI için 6 test dahil) ve 645 mevcut test geçti.
RSI referans değerleri, yatay/yükselen/düşen seri, 30 çıkışı, dip teyidi, pivot
onay gecikmesi, iki yönde uyumsuzluk ve geçersizleşme test edildi. Chromium'da
gerçek Lightweight Charts 4.2.3 ile RSI çizimi, zaman ekseni eşleme, zaman dilimi
geçişi ve 5m API hatası kontrol edildi; Binance yanıtları kontrollü örneklerdi.

### Fiyat/hacim/RSI hizalama düzeltmesi

Hacim ayrı bir overlay ölçeği yerine sağ eksene bağlandı. Üç panelin sağ eksen
boşluğu ölçülerek eşitlenir; yeniden boyutlandırmada güncellenir. Görünür mantıksal
zaman aralığı ve dikey imleç üç panelde çift yönlü eşlenir. Panel kaldırıldığında
abonelikler ve ResizeObserver temizlenir. Gerçek grafik kütüphanesiyle aynı mumun
x koordinatları en fazla 1 piksel farkla doğrulandı; hacim panelini fareyle sürükleme,
çift yönlü imleç, zaman dilimi değiştirme ve grafik yeniden oluşturma kontrol edildi.
