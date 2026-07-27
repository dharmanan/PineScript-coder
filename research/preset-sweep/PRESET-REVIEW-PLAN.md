# Preset Gözden Geçirme Planı

> ## Yeni oturum buradan başlar
>
> **Durum:** Ölçülebilir dokuz preset'in tamamı kilitlendi.
>
> Selective Multi-Timeframe kilitlendi; isabet profili yeni yapıya karşı henüz
> tam ızgarayla taranmadı (`run-winrate-axes.mjs`), o da o preset'in açık işi.
>
> **İlk üç komut:**
> ```
> git status --short
> /Users/kohen/bin/safe-npm test
> /Users/kohen/bin/safe-npm run dev -- -H 0.0.0.0
> ```
> 718 test geçmeli. Doğrulama Browser pane ile yapılır, `curl` yasak.
>
> **Git işlemleri yalnız açık kullanıcı isteğiyle yapılır.** Stage için
> `/Users/kohen/bin/safe-git-stage DOSYA`, tek tek; `git add .` asla. Push ayrıca
> istenmedikçe yapılmaz; `reset`, `rebase` ve force işlemleri kullanılmaz.
>
> **Node/npm sadece** `/Users/kohen/bin/safe-npm` üzerinden. Dev server öncesi
> `/Users/kohen/bin/safe-stop`. Tarama çalıştırmadan önce de dev server durdurulmalı,
> yoksa port 3000 çakışır.
>
> ### Bu projede öğrenilmiş, tekrar tartışılmayacak kurallar
>
> 1. **Sembolleri asla birleştirme.** Her sayı BTC/ETH/BNB/SOL ayrı raporlanır. Kripto
>    sembolleri ~0.85 korelasyonlu; birleştirmek işlem sayısını şişirir, güven aralığını
>    daraltmaz ve tek sembolün taşıdığı sonucu gizler.
>    **Araç bunu artık zorluyor:** `research/preset-sweep/report.mjs` ortak raporlayıcıdır
>    ve havuzlama yapan bir fonksiyon dışa açmaz. Onbir ölçüm aracı da ona bağlandı.
>    Bu kural 27 Temmuz'da ihlal edildi ve suçlu araçtı — manşet satır havuzlanmıştı,
>    sembol kırılımı dipnottaydı. Yanlış aday üretti.
> 2. **İsabet oranı tek başına anlamsız.** Başabaş isabet `1/(1+rr)`. Ödül hedefini
>    düşürünce isabet de eşik de aynı anda yükselir. Kâr, ikisi arasındaki farktan gelir.
> 3. **Seçim sadece geliştirme döneminden.** Holdout'a bakarak konfig seçmek holdout'u
>    yakar. 2026 Ocak–Haziran dört kez okundu, artık bir şey kanıtlamıyor. Temmuz 2026
>    (`data-july/`) daha az yıpranmış.
> 4. **Medyan bulgusuna güvenme, izole test yap.** "11.520 konfigün medyanı ATR 3'ü
>    destekliyor" dendi, tek değişkenli testte 4 preset iyileşti 4 kötüleşti. Karıştırıcı
>    değişken.
> 5. **Grafikte doğrulama şart.** Panel sayıları ölçümle uyuşmadan hiçbir preset kilitlenmez.
>    Şu ana kadar hepsi uydu — isabet oranları yarım puan içinde.
> 6. **TradingView'de profil seçiliyken input alanları yok sayılır.** Panel `CUSTOM · rr X`
>    yazmıyorsa değer geçmemiştir. Ayrıca isabet oranı ödül hedefini ele verir: rr 1.5
>    testinde isabet %40 civarı çıkmıyorsa ayar uygulanmamıştır.
> 7. **Sadece ödül hedefini oynatmak inceleme değil.** İlk üç preset böyle kilitlendi ve
>    Kohen bunu durdurdu: *"tüm olasılıkları düşünmeden sadece rr değiştirerek mi başarı
>    arıyoruz"*. Bir preset'in **kendi yapısı** ölçülmeden inceleme bitmez — kırılma kanalı,
>    EMA'lar, zaman dilimi, stop onayı, filtre eşikleri, MACD. Breakout Momentum'da asıl
>    kazanım tam buradan çıktı, ödül hedefi ayrıntı kaldı. Araç: `run-structure-axes.mjs`.
>    **Yapı değişirse isabet profili baştan ölçülür** (`run-winrate-axes.mjs`), çünkü eski
>    ödül hedefi eski yapıya karşı seçilmişti.
> 8. **Panelle ölçümü karşılaştırmadan önce `countUntil`'i 2026-07-01 yap.** Ürün default'u
>    `countFrom` 2026-01-01 → `countUntil` 2029-01-01; yani `countFrom` zaten ölçümün holdout
>    başlangıcıyla aynı, sadece üst sınır Temmuz'u ve sonrasını içine alıyor. Ölçüm tablosu
>    Haziran'da bitiyor. Supertrend Volume'da bu fark 1.6 puanlık sahte sapma üretti, üst sınır
>    daraltılınca 0.3 puana indi. Tek alan, script yazmaya gerek yok. **Okuma bitince default'a
>    geri al** — 2029 sınırı ürünün kasıtlı tercihi, tarih geçtikçe panelin donmuş görünmemesi
>    için (üst sınır dışlayıcı, 2029-01-01 = 2028 sonuna kadar).
>
> ### Bilinmesi gereken üç ölçüm gerçeği
>
> - **Edge 2023'te üçte bire indi.** Dokuz preset birlikte, işlem başına 2019-2022'de
>   +0.30R, 2023 sonrası +0.09R. Dört sembolde de, aynı yıl.
> - **2026 Temmuz'da 34 adaydan 31'i zararda.** O ay yatay geçti; trend takip eden
>   sistemler yatayda zarar eder, bu beklenen davranıştır.
> - **Denenip reddedilen her şey aşağıdaki tabloda.** ICT'nin dört mekanizması, filtre
>   eşikleri, dönem değiştirme, düşük ödül hedefleri. Aynı yoldan tekrar geçilmesin.
>
> ---


On indikatörü tek tek ele alıp, gerçek grafikte doğruladıktan sonra kilitleyip bir sonrakine
geçmek için. Bir preset kilitlendikten sonra o preset'e dokunulmaz — yeni bir ölçüm onu
tekrar açmayı gerektirirse, o karar ayrıca konuşulur.

**Son güncelleme:** 27 Temmuz 2026
**Kilitlenen:** 9 / 9 ölçülebilir preset

---

## Aşamalar

Her preset için sırayla:

| # | Aşama | Kim yapar |
|---|---|---|
| 1 | Ölçüm tablosu hazır — dört dönem, iki profil, sembol sembol | Claude (tamamlandı, aşağıda) |
| 2 | Script üretilir, TradingView'e yapıştırılır, derlenir | Kohen |
| 3 | Dört sembolde ayrı ayrı grafiğe eklenir, panel sayıları okunur | Kohen |
| 4 | Panel sayıları ile ölçüm tablosu karşılaştırılır | Claude |
| 5 | Fark varsa sebebi bulunur; ölçüm hatasıysa düzeltilir | Claude |
| 6 | Gerekiyorsa iyileştirme ölçülür — sadece tek değişkenli, izole test | Claude |
| 7 | Karar: bu haliyle kilitle / değiştir / üründen çıkar | Kohen |
| 8 | Karar preset dosyasına yorum olarak yazılır, bu dosyada işaretlenir | Claude |

**Kilitleme kuralı:** bir preset ancak dört sembolde de grafikte görüldükten ve panel
sayıları ölçümle uyuştuktan sonra kilitlenir.

---

## Sıra ve durum

| # | Preset | İşlem/ay | Durum |
|---|---|---|---|
| 1 | Balanced Intraday | 5.7 | **KİLİTLENDİ** ✓ |
| 2 | Fast EMA Scalper | 21.5 | **KİLİTLENDİ** ✓ |
| 3 | Supertrend Volume | 10.5 | **KİLİTLENDİ** ✓ |
| 4 | Breakout Momentum | 6.6 | **KİLİTLENDİ** ✓ |
| 5 | VWAP Reclaim | 7.1 | **KİLİTLENDİ** ✓ |
| 6 | Swing Structure Trend | 2.2 | **KİLİTLENDİ** ✓ |
| 7 | Selective Multi-Timeframe | 5.5 | **KİLİTLENDİ** ✓ |
| 8 | Kohen Dive Adaptive | ≈3.8 | **KİLİTLENDİ** ✓ |
| 9 | Long-Term Trend Guard | ≈5.0 | **KİLİTLENDİ** ✓ |
| — | Spot Accumulation | — | ölçülemez (stop/hedef yok) |

---

## Bu tablolar nasıl okunur

**Dönemler.** 2019-2022 ayarların seçildiği dönem, dolayısıyla en iyimser sayılar orada.
2023-2025 ve 2026 Ocak-Haziran doğrulama. **2026 Temmuz hiçbir konfigürasyonun görmediği
veri** — tek dürüst sınav o, ve 25 günlük olduğu için örneklem küçük.

**R nedir.** İşlem başına riske atılan miktar. +0.3R, riske attığının %30'u kadar kâr.

**İki profil.** Para profili az kazanır çok kazandırır; isabet profili çok kazanır az
kazandırır. İkisi de üründe, indikatör ayarlarından tek tıkla değişiyor.

**Bilinmesi gereken bağlam:** dokuz preset birlikte, işlem başına beklenti 2019-2022'de
+0.30R, 2023 sonrası +0.09R. Piyasa değişti, bütün bu mekanizmalar üçte bir güçte çalışıyor.
2026 Temmuz'da 34 adaydan 31'i zararda — o ay ETH 1780-1950 bandında yatay gitti.

---

## 1. Balanced Intraday — ✅ KİLİTLENDİ (26 Temmuz 2026)

`balanced_intraday` · 30 dakika · ATR×2

- **Para profili:** risk/ödül 5, pencere 1 — *değişmedi*
- **İsabet profili:** risk/ödül **1.25**, pencere **10**, trailing yok — *inceleme sonucu değişti*

### İncelemede ne yapıldı

1. Dört sembolde de TradingView'de çalıştırıldı, iki profil ayrı ayrı okundu.
2. Panel sayıları ölçümle karşılaştırıldı — **isabet oranları yarım puan içinde uyuştu**,
   işlem sayıları %10 içinde. Ölçüm aracı bağımsız olarak doğrulanmış oldu.
3. Grafikte para profilinin dört sembolün üçünde zarar ettirdiği görüldü.
4. Ölçülmüş alternatif (risk/ödül 1.25, pencere 10) dört sembolde de denendi.
5. Alternatif her ölçütte daha iyi çıktı, isabet profili ona çevrildi ve kilitlendi.

### Kilitleme öncesi ve sonrası (TradingView paneli, Nisan–Temmuz 2026)

| Sembol | Eski isabet profili (rr 2) | **Yeni (rr 1.25, w10)** |
|---|---|---|
| BTC | 219t · %41.1 · **−0.87R** | 191t · %50.3 · **+19.95R** |
| BNB | 230t · %40.0 · +0.33R | 195t · %47.2 · **+6.99R** |
| ETH | 199t · %49.7 · +44.89R | 179t · %51.4 · +24.53R |
| SOL | 212t · %43.9 · +13.49R | 196t · %46.9 · +7.65R |
| **Toplam** | 860t · +57.84R | 761t · **+59.12R** |

Toplam kâr neredeyse aynı, ama dağılım değişti: eskiden kârın **%78'i ETH'den** geliyordu
ve BTC zarardaydı. Yenisinde ETH %41, BTC %34, SOL %13, BNB %12 — **dört sembol de
kazandırıyor**, hiçbiri diğerini taşımıyor. İsabet dört sembolde de %46–51.

BTC'deki dönüşün sebebi: risk/ödül 2'de hedef fazla uzaktı, BTC'nin testere hareketi hedefe
varmadan stopa dönüyordu. 1.25'te hedef ulaşılabilir mesafede.

### Kilitlenen ayarın ölçümü

| Dönem | Para profili | İsabet profili (yeni) |
|---|---|---|
| 2019-2022 | 951t · %22.1 · +0.311R | — |
| 2023-2025 | 879t · %17.2 · −0.002R | — |
| 2026 Oca-Haz | 151t · %19.2 · +0.138R | 711t · %49.2 · **+0.086R** |
| 2026 Temmuz | 19t · %10.5 · −0.395R | 96t · %43.8 · **−0.042R** |

Temmuz'da hiçbir konfigürasyonun görmediği veride ölçülen 34 adayın **en iyisi** bu oldu
(−0.042R). Yine de zararda; Temmuz'da 34 adaydan 31'i zarardaydı.

### Bu incelemede bulunan ve düzeltilen ürün hatası

Profil seçiliyken risk/ödül gibi alanlar **sessizce yok sayılıyordu** — kullanıcı değeri
değiştiriyor, hiçbir şey olmuyor, sebebi görünmüyordu. Artık bu alanların etiketinde
`— only in Custom profile` yazıyor. Düzeltme **dokuz preset'in hepsinde** geçerli.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` içindeki `locked presets` bölümü her iki profilin de tam
değerlerini tutuyor. Bir ayar değişirse üç test birden kırılır. Kilit, ayar bozularak
sınandı: iki test kırıldı, sonra geri alındı.

### Açık kalan not

İsabet profili dört sembolde de zarar ettirmiyor ama "kazandıran" da denemez — 761 işlemde
toplam +59R, sembol başına işlem başına yaklaşık +0.08R. ETH ve BTC kazandırıyor, SOL ve
BNB masrafını çıkarıyor. Ürün etiketinde bu şekilde anlatılmalı.

---

## Eski ölçüm kaydı — Balanced Intraday (kilitleme öncesi)

- **Para profili:** risk/ödül 5
- **Eski isabet profili:** risk/ödül 2, trailing 1.5/1, skor 85, pencere 10

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 951t · %22.1 · +0.311R | 5198t · %42.8 · +0.067R |
| 2023-2025 | 879t · %17.2 · −0.002R | 4509t · %41.5 · +0.032R |
| 2026 Oca-Haz | 151t · %19.2 · +0.138R | 767t · %44.7 · +0.108R |
| 2026 Temmuz | 19t · %10.5 · −0.395R | 116t · %36.2 · −0.198R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 36t · %8.3 · −0.524R | 206t · %42.7 · +0.096R |
| BTCUSDT | 35t · %14.3 · −0.138R | 200t · %42.0 · +0.023R |
| ETHUSDT | 40t · %35.0 · +1.079R | 177t · %50.8 · +0.251R |
| SOLUSDT | 40t · %17.5 · +0.033R | 184t · %44.0 · +0.074R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 3t · %0.0 · −1.037R | 33t · %24.2 · −0.503R |
| BTCUSDT | 6t · %0.0 · −1.030R | 23t · %34.8 · −0.204R |
| ETHUSDT | 5t · %20.0 · +0.177R | 29t · %44.8 · +0.058R |
| SOLUSDT | 5t · %20.0 · +0.181R | 31t · %41.9 · −0.110R |

**Dikkat edilecekler:**

- Para profilinin tüm kârını ETH taşıyor (+1.079R). ETH olmadan BNB ve BTC zararda. Bu
  preset'in para profili tek sembole bağlı.
- İsabet profili dört sembolde de artıda ve beş kat fazla işlem üretiyor (767 vs 151).
  Ölçüme göre burada doğru seçim isabet profili.
- Temmuz'da her iki profil de zararda, ama isabet profili daha az (−0.198R vs −0.395R) ve
  116 işlemle anlamlı bir örnekleme sahip.
- Ölçülmüş ama uygulanmamış alternatif: risk/ödül 1.25, pencere 10 → 2026 Oca-Haz 711
  işlem %49.2 +0.086R, Temmuz 96 işlem %43.8 −0.042R (başabaşa en yakın sonuç).

Bu bölüm kilitleme öncesi durumu kayıt için tutuluyor. Geçerli ayar yukarıdaki kilitli
bölümde.

---

## 2. Fast EMA Scalper — ✅ KİLİTLENDİ (26 Temmuz 2026)

`fast_ema_scalper` · 30 dakika · tetikleyici penceresi 5 · ATR×1.5

- **Para profili:** risk/ödül 6, başabaş 1R — *değişmedi*
- **İsabet profili:** risk/ödül **1.5**, trailing **yok** — *inceleme sonucu değişti*

### İncelemede ne yapıldı

1. Dört sembolde iki profil grafikte okundu, panel ölçümle karşılaştırıldı — uydu.
2. Risk/ödül 1.25 denendi, üç ölçütte de para profilinin gerisinde kaldı.
3. Preset "değişiklik yok" diye kilitlendi.
4. Sonra risk/ödül 1.5 ölçümü fark edildi (ölçülmüştü ama test listesine konmamıştı),
   grafikte denendi, **kilit gerekçeli olarak açıldı** ve isabet profili ona çevrildi.
5. %63–68 isabet iddiası ayrıca kovalandı ve açıklandı (aşağıda).

### Kilitleme öncesi ve sonrası (TradingView paneli)

| Sembol | Eski isabet profili (rr 2 + trailing) | **Yeni (rr 1.5, trailing yok)** |
|---|---|---|
| BTC | %41.7 · **−7.42R** | %43.7 · **+8.34R** |
| SOL | %44.4 · +8.95R | %44.1 · **+12.47R** |
| BNB | %34.0 · −32.28R | %35.0 · **−26.17R** |
| ETH | %49.3 · +30.58R | %49.0 · +27.3R |
| **Toplam** | **−0.17R** | **+21.94R** |

Artıda olan sembol sayısı ikiden üçe çıktı. BNB hâlâ zararda.

### Aranan %63–68 isabet: bulundu, ama para yok

Fast EMA Scalper, grafik × ödül hedefi, 2026 Ocak–Haziran:

| Grafik | rr | İsabet | Beklenti | Artıda sembol |
|---|---|---|---|---|
| 5dk | 0.5 | **%63.3** | −0.141R | 0/4 |
| 15dk | 0.5 | **%65.8** | −0.058R | 0/4 |
| 30dk | 0.5 | **%67.9** | −0.012R | 2/4 |
| 30dk | 1.5 | %43.5 | **+0.056R** | 3/4 |

Başabaş isabet `1/(1+rr)` — risk/ödül 0.5'te **%66.7.** Yani %63–68 isabet gerçek ama
eşiğin ya altında ya da yarım puan üstünde, komisyon o farkı siliyor. **İsabeti yükseltmek
kârı yükseltmiyor: hedefi düşürdükçe geçilmesi gereken eşik de aynı hızda yükseliyor.**

Ayrıca 5 dakika her ödül hedefinde 30 dakikadan kötü (rr 1.5'te −0.087R'ye karşı +0.056R).
Sebebi komisyon: aynı dönemde 5 dakikada 2503, 30 dakikada 591 işlem açılıyor, komisyon
işlem başına sabit.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` içindeki `locked presets` bölümü. Kilit bu preset'te
gerçekten iş gördü: rr 1.5 değişikliği testi kırdı, gerekçe yazıldıktan sonra güncellendi.

### Açık kalan not

BNB dört ayarın hiçbirinde artıya geçmedi. Bu preset ETH ve SOL ile yaşıyor, BTC masrafını
çıkarıyor, BNB zarar ettiriyor.

---

## Eski ölçüm kaydı — Fast EMA Scalper (kilitleme öncesi)

- **Para profili:** risk/ödül 6, başabaş 1R
- **Eski isabet profili:** risk/ödül 2, trailing 1.5/1, pencere 5

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 3571t · %13.4 · +0.258R | 3910t · %43.8 · +0.098R |
| 2023-2025 | 3327t · %11.0 · +0.056R | 3600t · %41.8 · +0.027R |
| 2026 Oca-Haz | 519t · %11.9 · +0.103R | 559t · %43.8 · +0.032R |
| 2026 Temmuz | 67t · %9.0 · −0.228R | 72t · %33.3 · −0.193R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 131t · %10.7 · −0.042R | 144t · %36.8 · −0.156R |
| BTCUSDT | 130t · %12.3 · +0.102R | 140t · %44.3 · −0.005R |
| ETHUSDT | 128t · %13.3 · +0.250R | 135t · %51.1 · +0.252R |
| SOLUSDT | 130t · %11.5 · +0.106R | 140t · %43.6 · +0.053R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 19t · %15.8 · −0.020R | 21t · %23.8 · −0.389R |
| BTCUSDT | 17t · %5.9 · −0.272R | 19t · %36.8 · −0.124R |
| ETHUSDT | 16t · %12.5 · −0.118R | 17t · %35.3 · −0.050R |
| SOLUSDT | 15t · %0.0 · −0.560R | 15t · %40.0 · −0.169R |

**Dikkat edilecekler:**

- En çok sinyal üreten preset (ayda 21.5 işlem/sembol), dolayısıyla grafikte en hızlı
  doğrulanabilen. Örneklem büyüklüğü en güvenilir olan da bu.
- Bu preset'te grafikte "yanlış long açıyor" gözlemi yapılmıştı. Sebebi ölçüldü: 60
  dakikalık EMA-50 filtresi geç dönüyor, fiyat dönmüşken hâlâ yükseliş diyor.
- Denenen ve tutmayan düzeltmeler: skor modu (işlem %63 artıyor ama artıdan eksiye
  düşüyor), süpürme girişi (2026 Oca-Haz'da iyi, Temmuz'da −0.126R), ATR 3.0 (Temmuz
  −0.511R).

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 3. Supertrend Volume — ✅ KİLİTLENDİ (26 Temmuz 2026)

`supertrend_volume` · 30 dakika · tetikleyici penceresi 10 · ATR×2

- **Para profili:** risk/ödül 5 — *değişmedi*
- **İsabet profili:** risk/ödül **1.25**, trailing **yok** — *inceleme sonucu değişti*

### İncelemede ne yapıldı

1. Dört sembolde grafikte okundu. İlk okumada panel ölçümden 1.6 puan aşağı çıktı.
2. Sebebi bulundu: panel `countFrom` 2015 olduğu için **Temmuz dahil** bütün yüklü geçmişi
   sayıyor, ölçüm tablosu ise Haziran'da bitiyor. Temmuz bu profilde −0.377R.
3. Panelde tarih aralığı 2026-01-01 → 2026-07-01 yapıldı, fark kapandı (aşağıda).
4. rr 1.25 grafikte denendi, dört sembolde de okundu, isabet profili ona çevrildi.

### Ölçüm aracının doğrulaması (aynı pencere, 2026 Oca–Haz)

| Sembol | Panel (rr 3) | Ölçüm | İsabet farkı |
|---|---|---|---|
| ETH | 76t · %48.7 · +0.207R | 79t · %48.1 · +0.192R | +0.6 pt |
| SOL | 79t · %45.6 · +0.254R | 82t · %46.3 · +0.284R | −0.7 pt |
| BNB | 87t · %37.9 · −0.112R | 92t · %38.0 · −0.108R | −0.1 pt |
| BTC | 82t · %37.8 · −0.093R | 85t · %38.8 · −0.068R | −1.0 pt |
| **Toplam** | 324t · %42.3 · +0.057R | 338t · %42.6 · +0.067R | −0.3 pt |

İşlem sayıları %4–5 düşük, panel biraz az sayıyor. Önceki iki preset'te %10 içindeydi.

### Kilitleme öncesi ve sonrası (TradingView paneli, 2026 Oca–Haz)

| Sembol | Eski isabet profili (rr 3 + trailing) | **Yeni (rr 1.25, trailing yok)** |
|---|---|---|
| ETH | 76t · %48.7 · +15.76R | 84t · **%58.3** · **+24.62R** |
| SOL | 79t · %45.6 · **+20.05R** | 83t · %50.6 · +10.04R |
| BTC | 82t · %37.8 · −7.62R | 89t · %44.9 · **−1.27R** |
| BNB | 87t · %37.9 · −9.73R | 89t · %41.6 · **−8.34R** |
| **Toplam** | 324t · %42.3 · **+18.46R** | 345t · **%48.7** · **+25.05R** |

Ölçüm rr 1.25 için %48.8 ve +0.076R demişti; panel %48.7 ve +0.073R verdi.

### Kural 2 grafikte doğrulandı

rr 1.25'te başabaş isabet `1/(1+1.25)` = **%44.4**. Dört sembolün dördü de bu eşiğe göre
doğru tarafta çıktı: ETH %58.3 (+0.293R), SOL %50.6 (+0.121R), BTC %44.9 (−0.014R),
BNB %41.6 (−0.094R). BTC'nin eşiğin yarım puan üstünde olması −0.014R'yi tam açıklıyor —
komisyon o yarım puanı siliyor.

Ölçüm BTC için "+0.027R, artıya döner" demişti, grafikte −0.014R çıktı. İkisi de sıfırın
gürültüsünde; doğru ifade **"BTC zarardan başabaşa geldi"**, artıya geçti değil.

### Neden değiştirildi

- Aynı pencerede +6.6R fazla, işlem başına +0.057R → +0.073R
- İsabet altı puan yukarı, dört sembolün üçü iyileşti
- **Temmuz'da da daha az kötü:** rr 1.25 −0.233R, rr 3 −0.377R. Seçim dört kez okunmuş
  holdout'a değil, kimsenin görmediği veriye de dayanıyor
- Trailing zaten işlevsiz kalıyor: 1.5R'de başlıyor, hedef 1.25R, hiç kurulmuyor

### Açık kalan not

**Bedeli yoğunlaşma.** SOL yarıya iniyor (+20.05R → +10.04R) ve kârın ETH payı %46'dan
%71'e çıkıyor. Balanced Intraday'de bunun tam tersi olmuştu — orada değişiklik kârı dört
sembole yaymıştı. Burada tek sembole topluyor. Ürün etiketinde bu şekilde anlatılmalı:
bu preset ETH ile yaşıyor, SOL katkı veriyor, BTC masrafını çıkarıyor, BNB zarar ettiriyor.

Para profili 2026 Oca-Haz'da dört sembolde de artıda (+0.240R) — bu listede iki preset'te
görülen bir özellik. Ama Temmuz'da 29 işlemde bir kazanan.

### Bu incelemede bulunan ve düzeltilen ürün hatası

Supertrend Volume, çizimleri ana grafiğe çivilenmeyen **tek** preset'ti: `overlay=true`
üretiliyor ama hiçbir `plot`/`label`/tablo satırında `force_overlay=true` yoktu. RSI paneli
olan dokuz preset'te bu koruma zaten vardı (`compiler-v14`). Gösterge bir kez ayrı panele
düştüğünde supertrend, stop ve hedef o panelin kendi ölçeğine çiziliyor, dashboard da altı
satıra kırpılıyordu — kural 6'nın okuduğu `Profile` satırı tam kesilen yerdeydi.
`lib/compiler-v29.ts` eklendi, `tests/main-chart-pin.test.ts` koruyor.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` içindeki `locked presets` bölümü.

---

## Eski ölçüm kaydı — Supertrend Volume (kilitleme öncesi)

- **Para profili:** risk/ödül 5
- **Eski isabet profili:** risk/ödül 3, trailing 1.5/1, pencere 10

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 1662t · %22.4 · +0.321R | 2191t · %44.9 · +0.154R |
| 2023-2025 | 1677t · %17.9 · +0.051R | 2099t · %40.5 · +0.029R |
| 2026 Oca-Haz | 272t · %21.0 · +0.235R | 338t · %42.6 · +0.067R |
| 2026 Temmuz | 29t · %3.4 · −0.817R | 36t · %27.8 · −0.377R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 71t · %22.5 · +0.327R | 92t · %38.0 · −0.108R |
| BTCUSDT | 67t · %17.9 · +0.050R | 85t · %38.8 · −0.068R |
| ETHUSDT | 69t · %24.6 · +0.458R | 79t · %48.1 · +0.192R |
| SOLUSDT | 65t · %18.5 · +0.090R | 82t · %46.3 · +0.284R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 11t · %0.0 · −1.029R | 12t · %16.7 · −0.719R |
| BTCUSDT | 7t · %0.0 · −1.024R | 9t · %22.2 · −0.139R |
| ETHUSDT | 6t · %0.0 · −1.018R | 9t · %33.3 · −0.331R |
| SOLUSDT | 5t · %20.0 · +0.182R | 6t · %50.0 · −0.122R |

**Dikkat edilecekler:**

- Para profili 2026 Ocak-Haziran'da dört sembolde de artıda — bu listede az rastlanan bir
  özellik.
- Temmuz'da para profili 29 işlemde sadece 1 kazanan (%3.4). Yatay piyasada supertrend
  dönüşleri sürekli yanlış sinyal veriyor.
- ATR 3.0 denendi: 2026 Oca-Haz +0.086R iyileşme, Temmuz 22 işlemde sıfır kazanan.

Bu bölüm kilitleme öncesi durumu kayıt için tutuluyor. Geçerli ayar yukarıdaki kilitli
bölümde.

---

## 4. Breakout Momentum — ✅ KİLİTLENDİ (26 Temmuz 2026)

`breakout_momentum` · 60 dakika · **kırılma kanalı 10** · **ADX 30** · ATR×2 ·
**kapanış onaylı stop** · tetikleyici penceresi 3

- **Para profili:** risk/ödül 6 — *değişmedi*
- **İsabet profili:** risk/ödül **1.25**, trailing **1R'de kurulur, 0.5R takip** — *değişti*

### Bu inceleme diğerlerinden farklı yürüdü

İlk üç preset'te sadece **ödül hedefi** oynatıldı, çünkü o güne kadar yapılmış hiçbir tarama
başka bir eksene bakmamıştı. Kohen bunu şu sözlerle durdurdu: *"tüm olasılıkları düşünmeden
sadece rr değiştirerek mi başarı arıyoruz"*. Haklıydı.

Bu preset'te ilk kez **preset'in kendi yapısı** ölçüldü: kırılma kanalı uzunluğu, grafik zaman
dilimi, EMA'lar, MACD, stop onayı, üst zaman dilimi ayarı. Bir kırılma sisteminde kanal
uzunluğu sistemin **ne olduğunu** belirleyen sayıdır ve altı yıl boyunca elle konmuş 20'de
kalmıştı.

Bulgu: rr'yi 2'den 3'e çekmek ayrıntıydı. Asıl kazanım **kanal 10 + ADX 30 + kapanış stopu**
üçlüsünde çıktı.

### Ne değişti ve neden

| Ayar | Eski | Yeni | Gerekçe |
|---|---|---|---|
| Kırılma kanalı | 20 | **10** | Tek değişkenli testte dört dönemin üçünde iyi, işlem sayısı da artıyor. 30 ve 50 denendi, ikisi de holdout'ta kötüleşti ve ETH'yi eksiye düşürdü. Yön tek taraflı: kısa kanal daha iyi. |
| ADX eşiği | 20 | **30** | 2019-2022'de kötü (+0.317 vs +0.415), 2023 sonrasının **üç döneminde de** iyi. Projenin kendi bulgusuyla örtüşüyor: edge 2023'te üçte bire indi, yüksek eşik yeni piyasaya uyuyor. |
| Stop onayı | wick | **kapanış** | Kohen'in kararı. İsabet profilinde %46.1 → %51.3, para profilinde bedeli var ama isabet onun önceliği. Tek input, iki profil için ortak. |

Üçü birlikte, tek değişkenli testten sonra **açıkça bileşik olarak** ölçüldü:

| Konfig | 2019-22 | 2023-25 | 2026 holdout | Temmuz | Sembol |
|---|---|---|---|---|---|
| eski ürün | +0.415R | +0.200R | +0.391R | −0.648R | 4/4 |
| kanal 10 | +0.441R | +0.202R | +0.478R | −0.666R | 4/4 |
| ADX 30 | +0.317R | +0.303R | +0.530R | −0.315R | 4/4 |
| kanal10 + ADX30 | +0.291R | +0.283R | +0.537R | −0.315R | 4/4 |
| **üçü birlikte** | **+0.447R** | **+0.305R** | **+0.432R** | **−0.515R** | **4/4** |

Üçü birlikte, **dört dönemin dördünde de** eski ürünü geçen tek konfigürasyon. `kanal10 +
ADX30` holdout'ta ve Temmuz'da daha iyi ama geliştirme döneminde eski ürünün **altında** —
kural 3'e göre seçilemez.

### Grafikte doğrulama (2026 Oca–Haz, dört sembol)

Para profili, iki stop onayı yan yana:

| Sembol | Candle close | Wick touch |
|---|---|---|
| BTC | 32t · %25.0 · +16.77R | 32t · %25.0 · **+24.21R** |
| ETH | 26t · %23.1 · +7.13R | 29t · %20.7 · +8.83R |
| BNB | 28t · %21.4 · +4.96R | 29t · %20.7 · +8.49R |
| SOL | 26t · %30.8 · +25.26R | 26t · %30.8 · **+29.74R** |
| **Toplam** | 112t · %25.0 · **+54.12R** | 116t · %24.1 · **+71.27R** |

**Ölçüm BNB ve BTC'de üç ondalık basamağa kadar tuttu:** panel +0.177R / +0.524R, ölçüm
+0.177R / +0.524R. ETH ve SOL'de panel ölçümden **iyi** çıktı, yani ölçüm muhafazakâr.

Wick para profilinde önde ama candle close isabet profilinde önde, ve `Stop confirmation` tek
input — iki profil için ayrı seçilemiyor. Kohen isabeti öncelediği için candle close default.

### İsabet profili yapı değiştikten sonra baştan ölçüldü

Eski ödül hedefi (rr 2) **eski yapıya karşı** seçilmişti, o yüzden taşınamazdı. Altı çıkış
şekli × altı ödül hedefi birlikte tarandı (`run-winrate-axes.mjs`) — tek başına ödül taramak
anlamsız, çünkü 1.5R'de kurulan trailing 2R üstündeki her hedefi ulaşılmaz kılıyor.

Seçim ölçütü **kazanan işlem sayısı**: hem işlem sayısını hem isabeti aynı anda ölçen tek sayı,
ve Kohen'in önceliği o.

| Ayar | İşlem | İsabet | Kazanan işlem | Kârda sembol |
|---|---|---|---|---|
| eski yapı + eski profil | 270 | %42.2 | **114** | 2/4 |
| **yeni yapı + rr 1.25 + trail 1/0.5** | 193 | **%56.5** | **109** | **4/4** |
| yeni yapı + rr 3 + trail 1.5/1 | 160 | %51.2 | 82 | 4/4 |

Beş kazanan işlem eksik, on dört puan fazla isabet, ve zarar eden sembol kalmıyor.

Reddedilen: rr 3 + trail 1.5/1 beklentide en iyi (+0.222R) ama 82 kazanan işlem. Beklentiyi
büyütmek isteyen için doğru ayar, isabet profili için yanlış — zaten rr 6'lık bir para profili
var, ikincisine gerek yok.

Pencere 3'te kaldı: 1/3/5/10 ölçüldü, pencere 1 holdout'ta +0.005R'ye çöküyor çünkü filtrelerin
kırılma mumunda hazır olmasını şart koşuyor.

### Bu incelemede reddedilen büyük fikirler

4 saatlik grafik, üst zaman dilimi 200, mum içi giriş, limit giriş. Hepsi yukarıdaki
**Ölçülmüş ve reddedilmiş fikirler** bölümünde, giriş modeli araştırması ayrı bir başlıkta.

MACD ölçülebilir hiçbir katkı sağlamıyor ama **kalıyor** — kullanıcıya gösterilen bir filtre,
kaldırmak ürün kararı.

### Açık kalan iki not

**BTC bu değişikliğin bedeli.** Eski ayarda en iyi semboldü (+1.131R), yeni ayarda yarısını
veriyor. Kanal 10 ve ADX 30 onun kazandığı işlemleri eliyor. Kazanç SOL ve ETH'den geliyor.

**Temmuz hâlâ zararda** (−0.515R). Hiçbir varyant o ayı kurtarmıyor; en iyisi ADX 30 tek
başına −0.315R veriyor, o da 10 işlemde.

**Bir dürüstlük notu:** yapı seçilirken 21 varyant denendi. Bir varyantın dört dönemde de
rastgele kazanma şansı kabaca ½⁴ = %6, yani 21 denemede şans eseri ~1.3 tane beklenir ve tam
1 tane bulundu. Buna karşı duran şeyler: üç bileşenin ikisi tek başına da kazandı, her birinin
mekanik gerekçesi var, ve grafikte dört sembolde birden doğrulandı. Yine de bu "kanıtlandı"
değil, "ölçüldü ve grafikte tutarlı çıktı" seviyesinde.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` — hem `locked presets` bölümü (iki profil), hem ayrı bir test
**üç yapısal ayarı** sabitliyor (kanal 10, ADX 30, kapanış stopu) ve derlenen script'te de
kontrol ediyor. Sadece profilleri kilitlemek yetmezdi: ödül hedefi sabit kalırken kanal
uzunluğu sessizce 20'ye dönebilirdi ve ölçüm ürünü anlatmayı bırakırdı.

---

## Eski ölçüm kaydı — Breakout Momentum (kilitleme öncesi)

`breakout_momentum` · 60 dakika · kırılma kanalı 20 · ADX 20 · wick stop · ATR×2

- **Para profili:** risk/ödül 6
- **Eski isabet profili:** risk/ödül 2, trailing 1.5/1, pencere 3

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 1093t · %22.0 · +0.415R | 1731t · %45.8 · +0.134R |
| 2023-2025 | 1027t · %18.4 · +0.200R | 1524t · %43.0 · +0.066R |
| 2026 Oca-Haz | 171t · %21.6 · +0.391R | 270t · %42.2 · +0.079R |
| 2026 Temmuz | 19t · %5.3 · −0.648R | 22t · %27.3 · −0.307R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 39t · %20.5 · +0.197R | 65t · %40.0 · +0.022R |
| BTCUSDT | 37t · %32.4 · +1.131R | 66t · %51.5 · +0.290R |
| ETHUSDT | 48t · %18.8 · +0.182R | 71t · %43.7 · +0.112R |
| SOLUSDT | 47t · %17.0 · +0.181R | 68t · %33.8 · −0.105R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 8t · %0.0 · −1.020R | 8t · %12.5 · −0.645R |
| BTCUSDT | 4t · %0.0 · −1.015R | 4t · %25.0 · −0.583R |
| ETHUSDT | 4t · %25.0 · +0.735R | 7t · %57.1 · +0.538R |
| SOLUSDT | 3t · %0.0 · −1.011R | 3t · %0.0 · −1.011R |

**Dikkat edilecekler:**

- Doğrulama döneminde başabaşın 2 sigma üstünde çıkan **tek** preset (t = 2.07). Bu
  çalışmanın en güçlü sonucu.
- Para profili 2026 Oca-Haz'da dört sembolde de artıda.
- Temmuz'da 19 işlemde 1 kazanan. Örneklem çok küçük ama sonuç kötü.
- Ölçülmüş alternatif: 2023-2024'ten seçilen adx30/atr2 ayarı 2026 Oca-Haz'da +0.598R
  veriyor (mevcut +0.391R), ama Temmuz'da −0.315R. **İncelemede bu iz takip edildi ve ADX 30
  gerçekten kazandı** — o satır doğru yere işaret ediyormuş.

Bu bölüm kilitleme öncesi durumu kayıt için tutuluyor. Geçerli ayar yukarıdaki kilitli
bölümde.

---

## 5. VWAP Reclaim — ✅ KİLİTLENDİ (26 Temmuz 2026)

*Eski adı: VWAP Session Trader. `presetId` değişmedi (`vwap_session_trader`) — diskteki tarama
sonuçları ve bu dosya o kimliğe bağlı, değiştirmek ölçüm geçmişini kopartırdı.*

`vwap_session_trader` · 60 dakika · **seans 24 saat** · **hacim 1.5x** · ATR×2 · pencere 3

- **Para profili:** risk/ödül 6 — *değişmedi*
- **İsabet profili:** risk/ödül 4, trailing **1R'de kurulur, 0.5R takip** — *değişti*

### Bu preset "ölçümü geçemedi" diye duruyordu, sebebi kendi adıydı

Eski notu şöyleydi: *"2026 Ocak-Haziran'da dört sembolde de zararda. Bu preset ölçümü geçemedi.
Karar önerisi: üründen çıkarmak."*

Sebep, aynı notta yazılıydı ama ölçülmemişti: *"Seans kısıtı var (New York 09:30-16:00) —
kripto 7/24 işlem gördüğü için bu kısıt hiç ölçülmedi."*

Ölçüldü. **Kısıt preset'i öldüren şeymiş.**

| | İşlem | 2026 holdout | Artıda sembol |
|---|---|---|---|
| Seans AÇIK (NY 09:30-16:00) | 182 | **−0.240R** | **0/4** |
| Seans KAPALI (7/24) | 348 | **+0.263R** | 3/4 |

İşlemlerin **yarısını atıyordu ve attığı yarı daha iyiydi.** Kripto her saat işlem görürken
New York borsa saatlerine hapsetmek, ölçülmemiş bir varsayımdı.

### Hacim 1.5 dördüncü sembolü de artıya geçiriyor

| Konfig | dev | val | holdout | Temmuz | Artıda |
|---|---|---|---|---|---|
| eski ürün | +0.262R | +0.106R | −0.240R | +0.702R | 0/4 |
| seans yok | +0.201R | +0.102R | +0.263R | −0.200R | 3/4 |
| **seans yok + hacim 1.5** | **+0.283R** ✓ | **+0.146R** ✓ | **+0.267R** ✓ | −0.120R | **4/4** |

Üç dönemde eski ürünü geçiyor. Temmuz'da geçmiyor ama eski ürünün Temmuz'daki +0.702R'si **15
işlemden** geliyor ve bu dosyanın kendi notu "anlamlı değil" diyor.

### Seans kaldırılmadı, 24 saate açıldı

`compiler-v2` seans girdilerini **sadece seans etkinken** üretiyor. Kapatmak, ayarları script'ten
silmek demekti — New York saatlerini isteyen kullanıcının geri dönüşü olmazdı. O yüzden filtre
etkin kaldı, penceresi `0000-2359` yapıldı.

"24 saatlik seans = seans yok" iddiası ölçüldü, dört dönemde de **birebir aynı**:

```
seans 0000-2359 ACIK   1762t %26.3 +0.283R | 1700t %25.0 +0.146R | 272t %26.8 +0.267R | 34t %23.5 -0.120R
seans yok              1762t %26.3 +0.283R | 1700t %25.0 +0.146R | 272t %26.8 +0.267R | 34t %23.5 -0.120R
```

Pine'ın seans ayrıştırıcısı sadece 00-23 saatlerini kabul ediyor, o yüzden 24 saatin dürüst
yazımı `0000-2359`.

### İsabet profili: ödül hedefi aynı, trailing değişti

Yeni yapıya karşı altı çıkış şekli × altı ödül hedefi tarandı. Kazanan, ödül hedefini
oynatmak **değil**, trailing'i sıkmak oldu:

| Ayar | dev | val | **holdout** | Temmuz | Artıda |
|---|---|---|---|---|---|
| rr 4 + trail 1.5/1 (eski) | %43.4 · +0.121R | %41.3 · +0.093R | %43.3 · +0.163R | %44.0 · −0.088R | 4/4 |
| **rr 4 + trail 1R/0.5R** | **%53.7** · +0.135R | **%50.5** · +0.083R | **%56.4** · **+0.184R** | **%56.4** · **+0.119R** | **4/4** |

İsabet 13 puan yükseliyor, beklenti de yükseliyor, ve **Temmuz'da artıda** — bu preset için ilk kez.

Ödül hedefi rr 4'te kaldı ama artık büyük ölçüde işlevsiz: işlemlerin çoğu 1R'de kurulan
trailing'den çıkıyor, hedefe varmıyor.

### Grafikte doğrulama (dört sembol, 2026 Ocak–Temmuz)

| Sembol | Panel | Ölçüm (holdout) |
|---|---|---|
| BNB | 101t · %52.5 · **+0.069R** | **+0.070R** |
| ETH | 107t · %56.1 · +0.170R | +0.177R |
| SOL | 114t · %61.4 · +0.284R | +0.314R |
| BTC | 124t · %54.8 · +0.139R | +0.167R |
| **Toplam** | 446t · **%56.3** · **+74.69R** | %56.4 |

İsabet **0.1 puan** farkla tuttu, BNB neredeyse birebir. Panelin 446 işlemi, ölçümün holdout
392 + Temmuz 55 = 447'siyle örtüşüyor — okuma sırasında tarih üst sınırı daraltılmamıştı,
yani Temmuz da içinde.

### İsim değişti

**VWAP Session Trader → VWAP Reclaim.** Seans kısıtı kalktığına göre eski isim, artık
uygulanmayan bir kısıtı anlatıyordu. Preset ismi ürünün kullanıcıya verdiği ilk bilgi.

Açıklama metni de düzeltildi: 24 saatlik bir seansı "kısıt" diye anlatmak yanlış olurdu.
`lib/behavior-plan.ts` ve `lib/explain.ts` artık açık pencereyi *"a trading-session filter is
available and set to every hour"* diye anlatıyor. İkisi de `0000-2359` ve `0000-2400`
yazımlarını tanıyor.

### Bu incelemede reddedilenler

4 saatlik grafik (dev +0.478R, holdout +0.002R — Breakout Momentum'daki tuzağın aynısı),
üst zaman dilimi açmak (holdout'ta en iyi ama BNB −0.590R), 30 dakikalık grafik (Temmuz'da
tek artıda olan ama dev/val'de belirgin kötü), hacim 0.8/1.25, ATR 2.5/3.

### Açık kalan not

**Setin en tutarlı preset'i oldu.** 446 işlemde %56.3 isabet, dört sembolde de kârda, Temmuz'da
bile artıda. "Üründen çıkarmak" önerilen preset, incelemeden sonra en iyisi çıktı.

Bunu bulan şey ödül hedefi oynatmak değil, **hiç ölçülmemiş yapısal bir varsayımı ölçmek** oldu.
Kural 7'nin neden var olduğunun en net örneği.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` — `locked presets` bölümü iki profili, ayrı bir test de ismi,
seansın açık olduğunu, pencerenin `0000-2359` olduğunu ve hacim çarpanını sabitliyor. Seans en
kolay sessizce geri alınabilecek ayar, çünkü zararsız bir varsayılan gibi okunuyor. Değil.

---

## Eski ölçüm kaydı — VWAP Session Trader (kilitleme öncesi)

`vwap_session_trader` · 60 dakika · seans NY 09:30-16:00 · hacim 1.0x · ATR×2 · pencere 3

- **Para profili:** risk/ödül 6
- **Eski isabet profili:** risk/ödül 4, trailing 1.5/1, pencere 3

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 1085t · %25.2 · +0.262R | 1318t · %45.0 · +0.163R |
| 2023-2025 | 1185t · %22.9 · +0.106R | 1452t · %40.3 · +0.085R |
| 2026 Oca-Haz | 182t · %17.0 · −0.240R | 210t · %37.6 · −0.020R |
| 2026 Temmuz | 15t · %40.0 · +0.702R | 26t · %42.3 · −0.111R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 38t · %15.8 · −0.218R | 42t · %38.1 · −0.089R |
| BTCUSDT | 48t · %14.6 · −0.350R | 61t · %34.4 · −0.121R |
| ETHUSDT | 48t · %20.8 · −0.032R | 52t · %40.4 · +0.132R |
| SOLUSDT | 48t · %16.7 · −0.354R | 55t · %38.2 · +0.001R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 5t · %40.0 · −0.310R | 8t · %37.5 · +0.006R |
| BTCUSDT | 2t · %50.0 · +2.484R | 4t · %25.0 · −0.526R |
| ETHUSDT | 4t · %50.0 · +2.485R | 5t · %80.0 · +0.353R |
| SOLUSDT | 4t · %25.0 · −0.708R | 9t · %33.3 · −0.288R |

**Dikkat edilecekler:**

- **2026 Ocak-Haziran'da dört sembolde de zararda.** Bu preset ölçümü geçemedi.
- Temmuz'da +0.702R görünüyor ama 15 işlem, ve tamamı iki sembolün 2-4 işleminden geliyor.
  Anlamlı değil.
- Seans kısıtı var (New York 09:30-16:00) — kripto 7/24 işlem gördüğü için bu kısıt
  hiç ölçülmedi, kaldırıldığında ne olacağı bilinmiyor. **← incelemede ölçüldü, preset'i
  öldüren şey buymuş.**
- **Karar önerisi:** üründen çıkarmak veya "ölçüldü, tutmadı" etiketiyle bırakmak.
  **← yanlış öneriydi; kısıt kaldırılınca setin en tutarlı preset'i oldu.**

Bu bölüm kilitleme öncesi durumu kayıt için tutuluyor. Geçerli ayar yukarıdaki kilitli
bölümde.

---

## 6. Swing Structure Trend — ✅ KİLİTLENDİ (27 Temmuz 2026)

*Eski adı: 4H Swing Trend. `presetId` değişmedi (`swing_trend_4h`).*

`swing_trend_4h` · 30 dakika · pencere 5 · ATR×2.5 · yapısal bias · **SMA-200 kapalı** · **üst zaman dilimi kapalı**

- **Para profili:** risk/ödül 6 — *değişmedi*
- **İsabet profili:** risk/ödül **1.25**, trailing **1R/0.5R** — *değişti*
- **Sıklık ürün metninde:** ayda ~2.2 sinyal/sembol

### "Neden bu kadar az işlem" sorusu ölçüldü

Her filtre tek tek kapatıldı — bu eksen daha önce hiçbir preset'te yapılmamıştı:

| Kapatılan | İşlem (dev) | holdout | Sonuç |
|---|---|---|---|
| **SMA-200** | 366 *(364)* | +0.313R *(+0.336)* | **Hiçbir şey yapmıyor** |
| EMA trendi | 697 *(2 kat)* | **+0.005R** | Edge sıfırlanıyor |
| ADX | 965 *(2.6 kat)* | **−0.010R** | Edge sıfırlanıyor |
| Hacim | 449 | +0.168R | Yarıya düşüyor |
| RSI | 465 | +0.113R | Üçte birine düşüyor |

**Cevap:** işlem sayısı az çünkü filtreler gerçekten iş yapıyor. Herhangi birini kaldırınca
işlem artıyor, edge gidiyor. Az işlem bu preset'in **bedeli**, kazası değil.

Tek istisna SMA-200: swing yapısı bias'ı ve EMA 50/100 zaten aynı bilgiyi veriyor, üçüncü bir
yön filtresi hiçbir şeyi veto etmiyor. Kaldırıldı — bedava sadeleştirme, ama işlem sayısını da
artırmıyor.

İşlem sayısını artırmayı deneyen her yol ölçüldü ve reddedildi: pivot 5 + EMA 20/50 (1126 işlem,
holdout **−0.192R**), pivot 5 + ADX 15 (791 işlem, −0.076R), SMA-200 kapalı + EMA 20/50
(1261 işlem, −0.030R). Üçe katlanabiliyor, her seferinde edge yok oluyor.

### İsabet profili: burada bir hata yaptım ve düzelttim

Profil, adı *"Win rate — more, smaller wins"* olmasına rağmen **%27.9** isabet veriyordu.
Kohen bunu grafikte gördü: BTC'de %15.

Ölçümde çözümü vardı ve ben **yanlış ölçütle** elemiştim:

| | İsabet | Beklenti (holdout) |
|---|---|---|
| rr 3, trailing yok (eski) | %27.9 | +0.100R |
| **rr 1.25 + trail 1R/0.5R** | **%53.1** | +0.084R |

İsabeti "beklentisi düşük" diye reddetmiştim. Ama **isabet profilinin işi isabet** — beklenti
için zaten rr 6'lık para profili var. Ölçüt hatası. Kayda geçiyor ki tekrarlanmasın.

### Grafikte doğrulama (2026 Ocak–Temmuz)

| Sembol | Panel |
|---|---|
| BTC | 21t · %38.1 · **−5.38R** |
| ETH | 21t · **%61.9** · +4.20R |
| BNB | 16t · %43.8 · −1.20R |
| SOL | 14t · **%57.1** · +2.65R |
| **Toplam** | **72t · %50.0 · +0.27R** |

Ölçümün holdout+Temmuz tahmini **72 işlem, %50.0 isabet** — işlem sayısı ve isabet **birebir**.

### Kilitlendi ama iki uyarıyla

**1. İsabetini tutuyor, para kazanmıyor.** 72 işlemde +0.27R. Ocak–Haziran +5.4R'ydi, Temmuz'un
sekiz işlemi −4.4R'sini geri aldı. Kilitli setin en ince edge'i, ve ETH ile SOL taşıyor.

**2. Doğrulanamıyor.** Sembol başına 16-21 işlem, yedi ayda. Bu örneklem "edge var mı" sorusunu
çözmez. Grafik okuması **ölçüm aracının ürünle uyuştuğunu** doğruladı, **ürünün çalıştığını**
değil. İkisi farklı şeyler ve bu preset'te sadece birincisi elimizde.

### Seyreklik artık ürün metninde

`tradesPerMonth` alanı eklendi ve `lib/explain.ts` şunu yazıyor:

> *"Expect roughly 2.2 signals per symbol per month. This is a sparse preset: quiet stretches of
> a week or more are normal and are not a fault."*

Alan **isteğe bağlı** ve sadece ölçülmüş yerde dolduruluyor. Eski bir sayı yazmak hiç yazmamaktan
kötü olurdu: yirmi sinyal bekleyip iki tane alan kullanıcıyı piyasa değil ürün yanıltmış olur.
Kalan preset'lere incelendikçe eklenecek. 4'ün altındaki değerlerde "sessiz haftalar normaldir"
cümlesi ayrıca çıkıyor.

### İsim değişti, ve isim kontrolü bir hata ortaya çıkardı

**4H Swing Trend → Swing Structure Trend.** Grafik **30 dakika**, yön kararı grafiğin kendi
3-barlık pivotlarından geliyor. Hiçbir yerde 4 saat yoktu. Yeni isim preset'i benzersiz yapan
kapıyı söylüyor: setteki tek swing yapısı preset'i.

İsmi kontrol ederken üretilen script'e bakıldı ve **iki ölü parça** bulundu.

**1. Üst zaman dilimi girdisi hiçbir şey yapmıyordu.** Script'te duruyordu:

```
htf     = input.timeframe("D", "Higher timeframe")
htfBull = request.security(..., close[1] > ta.ema(close, 200)[1], ...)
```

Ama sinyal satırında yoktu:

```
longSetup = emaFast > emaSlow and rsiValue >= ... and adxValue >= ... and structureBull and ...
```

Swing yapısı üst zaman dilimini **değiştiriyor** — bu kasıtlı ve doğru. Ama input kalmıştı,
kullanıcı değiştirdiğinde hiçbir şey olmuyordu. Kaldırıldı.

VWAP Reclaim'de seans filtresini **tutmuştuk**, burada kaldırıldı. Fark: seansı kullanıcı
açabilirdi. Burada açılacak bir şey yok, çünkü swing yapısı seçiliyken üst zaman dilimi tanım
gereği devre dışı. Çalışmayan bir düğme bırakmak, kullanıcıya olmayan bir kontrol vaat etmek.

**2. Grafik arka planı yanlış kaynağı gösteriyordu.** Bu bir hataydı:

```
bgcolor(... htfBull ? lime : red ..., title="Trend ribbon")
```

Arka plan, sinyalleri **hiç etkilemeyen** günlük EMA-200'e göre boyanıyordu. Yani kullanıcı
kırmızı arka planda long sinyali görebiliyordu, ve dashboard'daki `Structure` satırı aynı anda
`BULL` diyordu. Kohen'in grafik ekran görüntülerinde bu çelişki görünüyor.

`compiler-v3` düzeltildi: `biasSource` swing yapısıysa ribbon `structureBull`'a bakıyor.
Sadece bu preset'i etkiliyor, diğer sekizinde ribbon aynen eskisi gibi.

### Ölçüm etkilenmedi — iddia değil, ölçüm

İsim, arka plan ve üst zaman dilimi değişikliklerinden **önce ve sonra**, dört dönem:

| | Önce | Sonra |
|---|---|---|
| 2019-22 | 366t · %22.4 · +0.486R | 366t · %22.4 · +0.486R |
| 2023-25 | 341t · %18.2 · +0.211R | 341t · %18.2 · +0.211R |
| holdout | 58t · %19.0 · +0.313R | 58t · %19.0 · +0.313R |
| Temmuz | 8t · %12.5 · −0.145R | 8t · %12.5 · −0.145R |

Birebir aynı. Sebebi: motor `higherTimeframe`'i sadece `htf_bias` filtresi için kullanıyor ve
swing yapısı seçiliyken o filtre plana hiç girmiyor; arka plan rengi motorda zaten yok.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` — `locked presets` iki profili, ayrı bir test de SMA-200'ün
kapalı olduğunu, `tradesPerMonth`'un 2.2 olduğunu ve ürün metninde seyrekliğin yazdığını
sabitliyor.

---

## Eski ölçüm kaydı — 4H Swing Trend, şimdi Swing Structure Trend (kilitleme öncesi)

`swing_trend_4h` · 30 dakika · tetikleyici penceresi 5 · ATR×2.5 · **yapısal bias** · SMA-200 açık

- **Para profili:** risk/ödül 6
- **Eski isabet profili:** risk/ödül 3, pencere 5

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 364t · %22.5 · +0.495R | 398t · %32.9 · +0.310R |
| 2023-2025 | 340t · %18.2 · +0.215R | 359t · %29.2 · +0.155R |
| 2026 Oca-Haz | 57t · %19.3 · +0.336R | 60t · %26.7 · +0.052R |
| 2026 Temmuz | 8t · %12.5 · −0.145R | 8t · %12.5 · −0.520R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 13t · %15.4 · +0.059R | 14t · %21.4 · −0.160R |
| BTCUSDT | 17t · %11.8 · −0.193R | 17t · %17.6 · −0.311R |
| ETHUSDT | 17t · %23.5 · +0.633R | 18t · %33.3 · +0.319R |
| SOLUSDT | 10t · %30.0 · +1.089R | 11t · %36.4 · +0.443R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 2t · %50.0 · +2.478R | 2t · %50.0 · +0.979R |
| BTCUSDT | 3t · %0.0 · −1.023R | 3t · %0.0 · −1.023R |
| ETHUSDT | 1t · %0.0 · −1.017R | 1t · %0.0 · −1.017R |
| SOLUSDT | 2t · %0.0 · −1.016R | 2t · %0.0 · −1.016R |

**Bu oturumda değişen tek preset.** Günlük EMA-200 bias'ı yerine swing yapısı (son iki
onaylı tepe ve dip) kullanıyor. Gerekçe: eski hali doğrulamada −0.105R ve holdout'ta
−0.292R veriyordu, yeni hali +0.215R ve +0.336R. Eşli karşılaştırmada doğrulamanın 40
çiftinin 40'ında, holdout'un 24 çiftinin 21'inde daha iyi.

**Dikkat edilecekler:**

- Ayda 2.2 işlem/sembol — en seyrek üç preset'ten biri. Grafikte doğrulaması yavaş olacak.
- Temmuz'da toplam 8 işlem. Hiçbir şey söylemiyor.
- Yüksek isabet alternatifi ölçüldü: risk/ödül 0.5 ile 2026 Oca-Haz'da **%73.4 isabet**
  ve +0.086R, ama Temmuz'da −0.270R.

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 7. Selective Multi-Timeframe — ✅ KİLİTLENDİ (27 Temmuz 2026)

`selective_multi_timeframe` · 60 dakika · tetikleyici penceresi 3 · ATR×2 · kapanış onaylı stop

**Ne değişti:** üç yapı ayarı. Hiçbir profil değişmedi.

| | önce | sonra |
|---|---|---|
| hacim çarpanı | 1.2 | **0.8** |
| ADX filtresi | açık, eşik 20 | **kapalı** |
| uzun MA filtresi | açık, SMA 100 | **kapalı** |

### Bu inceleme önce ölçüm aracını kırdı

İlk tarama bu preset'in 2026 holdout'unda `+0.269R` diyordu. O sayı dört sembolün
havuzlanmış hâliydi. Sembol sembol bakınca BTC 15 işlemde **−0.572R**, BNB 9 işlemde
+0.158R — yani tek sembolün taşıdığı, diğer üçünde kullanılamayan bir preset.

Havuzlanmış tablo aynı zamanda **yanlış aday** üretti: `htf uzunluk 50` üç dönemde
referansı geçiyor göründü, sembol sembol bakınca dört sembolden **birinde** iyileşiyordu.

Bu, planın 1. kuralının ihlaliydi ve suçlu araçtı: her araç havuzlanmış satırı manşet
yapıp sembol kırılımını dipnota atıyordu. Onbir aracın hepsi düzeltildi ve ortak bir
`report.mjs` yazıldı — havuzlama yapacak bir fonksiyon **artık dışa açılmıyor**.

### Tek değişkenli tarama, sembol sembol (2026 Oca–Haz, isabet · işlem)

| | BNB | BTC | ETH | SOL | iyileşen |
|---|---|---|---|---|---|
| referans | %33.3 · 9t | %26.7 · 15t | %62.5 · 16t | %43.8 · 16t | — |
| **hacim 0.8** | %40.0 · 10t | %35.3 · 17t | %64.7 · 17t | %47.1 · 17t | **4/4** |
| ADX kapalı | %39.1 · 23t | %37.5 · 32t | %58.6 · 29t | %44.4 · 27t | 3/4 |
| uzun MA kapalı | referansla **birebir aynı** | | | | 0/4 |
| chart 30dk | %47.1 · 17t | %46.2 · 26t | %38.5 · 26t | %46.9 · 32t | 3/4 |
| adx 25 | %0.0 · 2t | %11.1 · 9t | %50.0 · 8t | %40.0 · 10t | 0/4 |

`hacim 0.8` bütün taramanın **tek 4/4'ü** — dört sembolde birden hem isabeti hem işlem
sayısını yükselten tek ayar. `uzun MA kapalı` dört sembolde ve dört dönemde referansla
birebir aynı: hiçbir şeye karar vermeyen bir kontroldü.

### Bileşik, ve grafikte doğrulama

Kilitlenen bileşik: **hacim 0.8 + ADX kapalı + uzun MA kapalı.**

TradingView'de dört sembolde okundu. İsabet profili (rr 2.5, trailing 1.5/1),
2026-01-01 → 2026-07-27, eski ayarlara karşı **aynı profil ve aynı pencere**:

| | | işlem | isabet | net |
|---|---|---|---|---|
| **ETH** | eski | 19 | %52.6 | +1.30R |
| | **kilitli** | **40** | **%55.0** | **+9.81R** |
| **BTC** | eski | 18 | %38.9 | **−4.38R** |
| | **kilitli** | **42** | **%50.0** | **+7.09R** |
| **BNB** | eski | 12 | %50.0 | −0.01R |
| | **kilitli** | **36** | **%55.6** | **+14.42R** |
| **SOL** | eski | 18 | %44.4 | +1.56R |
| | **kilitli** | **38** | **%44.7** | **+3.86R** |

Dört sembolde de işlem sayısı yaklaşık ikiye katlandı, dördünde de isabet yükseldi,
dördü de artıda. BTC zarardan kâra geçti, BNB tam sıfırdan setin en iyi sembolü oldu.
Eski hâli BNB'de altı ayda **12 işlem** üretiyordu — zaten kullanılabilir değildi.

**Parite:** ETH, BNB ve SOL panelle ondalığına kadar aynı. BTC'de motor 42 işlemde bir
tane fazla kayıp saydı (%50.0 / +7.09R, panelde %51.2 / +8.12R).

### `sensitivity: "selective"` kaldırıldı

O alan bir arayüz makrosu: bir değer seçmek cooldown, hacim çarpanı ve ADX eşiğini aynı
anda eziyor. `"selective"` = cooldown 10, hacim 1.25, ADX 25. Preset bunların hiçbirinde
değildi (cooldown 5, hacim 1.2, ADX 20) ve artık **ADX filtresi hiç yok**, yani o
dropdown'daki hiçbir değer bu preset için doğru değil. Bırakmak, ayarlarının tam tersini
iddia eden bir "More selective" etiketi göstermek olurdu.

**Açık kalan not:** "Signal frequency" dropdown'ının kendisi hatalı bir kalıp — üç ayarı
sessizce ezen bir makro. Ayrı bir karar konusu, bu kilitle çözülmedi.

### Ölçülüp reddedilenler

Zemin ikinci kez taranmasın diye kayıtta: ADX 25 ve 30 (geliştirmede daha iyi, örneklem
2–10 işleme düşüyor, holdout'ta negatif), 30 dakikalık grafik (örneklemi açıyor ama ETH'nin
isabetinden 24 puan götürüyor), 4 saatlik grafik, üst zaman dilimi uzunluğu 50/200/günlük,
RSI 60/40, EMA 9/21 ve 50/100, wick stop onayı, hacim 1.25–2.0, ATR 2.5 ve 3.0.

**MACD'nin tersi çıktı:** Breakout Momentum'da hiçbir şey yapmıyordu, burada taşıyıcı —
kapatınca holdout +0.269R'den +0.060R'ye düşüyor. Kaldı.

### Kilit nasıl korunuyor

`tests/profile-selector.test.ts` — kilitli preset kaydına eklendi, ayrıca üç yapı ayarı
ve `sensitivity` iddiası ayrı testlerle sabitlendi. Uzun MA testi çizgiye değil **vetoya**
bakıyor: `spotExitMode` varsayılanı yüzünden çizgi hâlâ çiziliyor, ama `longSetup` satırında
artık yok.

**Sıradaki:** isabet profili yapı değiştiği için planın kendi kuralına göre baştan
ölçülmeli (`run-winrate-axes.mjs`). Şu anki rr 2.5 + trailing 1.5/1 yeni yapıda dört
sembolde de başabaşın çok üstünde, ama tam ızgara taranmadı.

---

## 8. Kohen Dive Adaptive — ✅ KİLİTLENDİ (27 Temmuz 2026)

### Tarihsel başlangıç: RSI Divergence Reversal — tamamlandı, üründen çıkarıldı

`rsi_divergence_reversal` · 30 dakika · tetikleyici penceresi 1 · ATR×2

- **Para profili:** risk/ödül 6
- **İsabet profili:** risk/ödül 3.5, trailing 2/1.5, pencere 1

### TradingView panel paritesi

Kohen TradingView'de `2026-01-01`–`2026-07-01` aralığını sabitledi. `WIN RATE · rr 3.5`
profili için okunan panel ile düzeltilmiş bağımsız motor:

| Sembol | TradingView | Yerel beklenti | Sonuç |
|---|---|---|---|
| BTCUSDT | 16 / 57 · 73t · %21.9 · −27.97R | 73t · %21.9 · −27.97R | tam eşleşme |
| ETHUSDT | 25 / 51 · 76t · %32.9 · −6.95R | 26 / 51 · 77t · %33.8 · −6.87R | 1 işlem / 0.08R fark |
| BNBUSDT | 27 / 46 · 73t · %37.0 · +4.51R | 73t · %37.0 · +4.52R | yuvarlama farkı |
| SOLUSDT | 24 / 50 · 74t · %32.4 · −8.12R | 74t · %32.4 · −8.12R | tam eşleşme |

ETH'deki tek işlem farkı başlangıç ısınma sınırında; yön ve büyüklük aynı. Panel paritesi
geçti. Dört sembolden yalnız BNB artıda olduğu için mevcut isabet profili başarılı bir
çapraz-sembol varsayılan sayılmadı.

### Bu okumada bulunan ölçüm motoru hatası

İlk motor beklentisi TradingView'den kabaca yarı yarıya az işlem üretti. Sebep tarih
ayarından ayrı bir parite hatasıydı:

- Pine yalnız **RSI pivotunu** buluyor ve fiyatı o RSI pivot barından örnekliyor.
- Sweep motoru yanlışlıkla RSI pivotu ile fiyat pivotunun aynı barda olmasını istiyordu.
- Pine önceki pivot için 5–60 bar aralığını uyguluyor; sweep motoru bunu uygulamıyordu.

Motor Pine'in kuralına getirildi ve sentetik regresyon testi eklendi. Düzeltmeden önceki
bu preset'e ait bütün dönem, yapı ve profil sayıları geri çekildi; iyileştirme kararında
kullanılmayacak.

TradingView'de `countUntil=2029-01-01` ile gönderilen ilk isabet profili ekranları,
yalnız hata teşhisinde kullanıldı:

| Sembol | TradingView, 27 Temmuz | Yerel motor, veri 25 Temmuz sonunda |
|---|---|---|
| BTCUSDT | 23 / 64 · %26.4 · −21.92R | 23 / 63 · %26.7 · −21.30R |
| ETHUSDT | 28 / 60 · %31.8 · −11.73R | 29 / 60 · %32.6 · −11.65R |
| BNBUSDT | 30 / 54 · %35.7 · +0.98R | 30 / 53 · %36.1 · +2.04R |
| SOLUSDT | 30 / 62 · %32.6 · −11.66R | 29 / 61 · %32.2 · −12.27R |

Yerel arşiv bir gün geride olmasına rağmen işlem sayıları sembol başına 1–2 içinde,
R sonuçları da aynı yönde ve yakındı. Ortak `2026-01-01`–`2026-07-01` penceresi yukarıdaki
kesin kilit paritesini verdi.

### Yapı ve zaman dilimi araştırması

Seçim 2023–2024 geliştirmede, doğrulama 2025'te yapıldı; semboller havuzlanmadı.
Şu eksenler tek tek ve sonra seçilen yapılarda çıkış ızgarasıyla ölçüldü:

- grafik: 5dk, 15dk, 30dk, 1sa, 4sa;
- RSI: 7, 9, 14, 21;
- pivot: 2/2, 3/3, 5/5, 8/8, 10/10, 3/5, 5/3;
- pivot aralığı: 2–30, 5–30, 5–60, 10–60, 5–90, 5–120;
- RSI teyidi: 30/70, 35/65, 40/60, 45/55, 50/50 ve kapalı;
- cooldown 0/2/5/10, ATR 1.5/2/2.5/3, wick/close stop;
- hedef 1/1.25/1.5/2/2.5/3.5R; trailsiz, başabaş 1R ve dört trailing düzeni.

RSI 7 geliştirmede dört sembolde birden hem isabeti hem işlem sayısını artırdı. 1R
hedefle geliştirme isabeti %47.1–54.1 ve sembol başına 381–439 işleme çıktı. Fakat bir
sonraki takvim döneminde:

| Sembol | 30dk · RSI 7 · 1R doğrulama |
|---|---|
| BNBUSDT | 242t · %46.7 · −0.080R/işlem |
| BTCUSDT | 224t · %53.6 · +0.040R/işlem |
| ETHUSDT | 209t · %50.7 · −0.003R/işlem |
| SOLUSDT | 238t · %51.7 · +0.023R/işlem |

Başlık win rate yükseldi, ama BNB hâlâ anlamlı eksi ve ETH başabaş. 5dk grafik işlem
sayısını yaklaşık dört katına çıkardı fakat geliştirmede dört sembolün tamamı eksideydi.
15dk, 1sa ve 4sa da dört sembolde birlikte doğrulamayı geçmedi. Bu nedenle RSI 7 / 1R
ürüne taşınmadı; yalnız win rate'i yüksek gösteren zarar eden bir profil olacaktı.

### Kodda olmayan yapıların araştırması

Düzenli/gizli divergence, EMA200 rejimi, düşük ADX, EMA20 reclaim, önceki mum kırılımı,
4s trend hizası, pivot kalitesi, ters sinyalde kapatma ve süre çıkışı aileleri de
çalıştırıldı; hiçbiri dört sembolde doğrulama kapılarını geçmedi.

Geçmiş çalışmada yalnız `BNBUSDT 30dk · divergence → EMA9/WMA45 teyidi · EMA50/200
rejimi · hacim ≥ SMA20×0.8 · 15-bar swing stop · 1.8R` profili 2023–2024 doğrulamayı
geçmişti. Dondurulmuş hali ileri dönemlerde tekrar açıldı:

| Dönem | Normal maliyet | Stres maliyeti |
|---|---|---|
| 2025 | 25t · %52.0 · +0.051 dönüş birimi · PF 1.231 | 25t · %48.0 · −0.039 · PF 0.858 |
| 2026 Oca–Haz | 12t · %50.0 · +0.087 · PF 2.104 | 12t · %50.0 · +0.058 · PF 1.601 |
| 2026 Temmuz | 1t · %0 · −0.009 | 1t · %0 · −0.012 |

Normal maliyette ileri dönem artıda, fakat 2025 stres testini kaybediyor ve yılda 12–25
işlem kullanıcının yüksek işlem sayısı hedefine uymuyor. Bu yüzden dört coine açılmadı ve
ürünün yeni RSI varsayılanı yapılmadı.

### Uygulanan iyileştirmeler

- Sweep motorunun divergence kuralı Pine ile aynı hale getirildi ve üç regresyon testi eklendi.
- 31 yapısal varyant ile 210 yapı/çıkış çiftini yeniden çalıştırabilen özel runner'lar eklendi.
- BNB profilinin 2025+ ileri-test runner'ı eklendi; eski “holdout açılmadı” açıklaması düzeltildi.
- PineForge açıklamasına, oluşturulan Pine koduna ve arayüze bu preset'in deneysel sinyal
  statüsü eklendi; divergence çizimleri görsel araştırma olarak kaldı.
- Ölçülen sıklık yaklaşık **sembol başına ayda 12.4 işlem** olarak üründe gösteriliyor.

**Karar:** ayarlar değiştirilmedi ve yüksek görünen ama zarar eden win-rate profili
kilitlenmedi. Sonraki Kohen Dive karşılaştırması tamamlandıktan sonra bu preset hazır
indikatör listesinden çıkarıldı; geçmiş ölçümleri yalnız reddedilmiş araştırma kaydı olarak
bu bölümde korunuyor.

---

## 8A. Kohen Dive V4.6 — tamamlanan geçici karşılaştırma

Kohen'in özgün `Dive V4.6` kodu #8'in yerine doğrudan geçirilmedi; PineForge'a ayrı bir
deneysel preset olarak eklendi. Böylece aynı sembol ve tarih aralığında iki gösterge yan yana
ölçülmeden çalışan bir preset silinmiyor.

### Korunan yapı

- yükselen `DI+` / `DI−` sayaçlarından trend basıncı ve gradient;
- güçlü sniper buy/sell ailesi;
- rolling 15-bar RSI divergence-pressure sinyalleri;
- 100-bar premium/discount haritası;
- alt panel histogramı, mum/wick boyaması ve zayıf B/S görsel işaretleri.

### Düzeltilen ve eklenen yapı

- Eski VWAP akümülatörü yalnız yeni dipte sıfırlanıyor, seçilen 200-bar pencerenin dışına
  çıkan eski bir anchor'ı taşımaya devam edebiliyordu. Yeni sürüm her mumda gerçek
  `ta.lowestbars(low, lookback)` barını bulup kümülatif fiyat×hacim farkından VWAP hesaplıyor.
- Yalnız kapanmış mumdaki **güçlü** sinyaller ölçülen işleme dönüşüyor; zayıf B/S etiketleri
  işlem sayılmıyor.
- Sinyal mumu ATR mesafesini donduruyor, giriş bir sonraki mum açılışında yapılıyor.
- Stop/target aynı mumda görülürse sonuç korumacı biçimde tam zarar sayılıyor.
- Dashboard: setup/signal, chart TF, trend pressure, PD bölgesi, VWAP tarafı, risk state,
  son sonuç ve tarihleri, wins/losses, net win rate, toplam R, profit factor, maksimum
  drawdown ve iki tarafın canlı sinyal skoru.
- Generic preset sweep bu özel compiler profilini bilerek dışarıda bırakıyor; ayrı referans
  motoru yazılmadan başka bir stratejiymiş gibi sessizce ölçülmeyecek.

### İlk TradingView karşılaştırması

İlk okuma sırasında aşağıdaki ayarlar değiştirilmez:

| Ayar | Değer |
|---|---|
| Grafik | 30 dakika |
| Confirmed candles only | açık |
| Signal mode | All filters |
| Cooldown | 5 bar |
| Trigger window | 1 bar |
| RSI | 14 · buy ceiling 40 · sell floor 60 |
| Strong threshold | 0.80 |
| PD / VWAP lookback | 100 / 200 |
| Giriş | Market, bir sonraki açılış |
| Risk | ATR 14 × 2 · hedef 2R · wick stop |
| Maliyet | taraf başına %0.01 |
| Sayaç | `2026-01-01` dahil, `2026-07-01` hariç |

BTCUSDT, ETHUSDT, BNBUSDT ve SOLUSDT için şu beş değer gönderilecek:
`Wins / Losses`, `Win rate (net)`, `Net result`, `Profit factor`, `Max drawdown`.
İşlem sayısı ve isabet birlikte yükselirken dört sembolün en az üçü artıda kalırsa çıkış
ızgarası araştırmasına geçilecek. Dört sembolde yalnız biri taşıyorsa #8 gibi evrensel
varsayılan yapılmayacak.

**Durum:** ilk TradingView panel okuması tamamlandı. V4.6 yalnız geçici kontrol grubuydu;
final Active 4H kararı verildikten sonra hazır indikatör listesinden çıkarıldı.

---

## 8B. Kohen Dive Adaptive — ACTIVE 4H KİLİTLENDİ ✓

27 Temmuz 2026 TradingView okumalarında V4.6 baseline aşağıdaki sonucu verdi:

| Sembol | W / L | Win rate | Net R | PF | Max DD |
|---|---:|---:|---:|---:|---:|
| BTCUSDT | 105 / 180 | %36.8 | +3.32R | 1.02 | 12.94R |
| ETHUSDT | 94 / 189 | %33.2 | −26.93R | 0.86 | 28.04R |
| BNBUSDT | 97 / 191 | %33.7 | −23.54R | 0.88 | 28.75R |
| SOLUSDT | 97 / 189 | %33.9 | −21.81R | 0.89 | 31.79R |

Dört panel birlikte 1.142 kapanmış işlem, 393 kazanç / 749 kayıp ve −68.96R gösteriyor.
Bu toplam bir seçim ölçütü değil; yalnız sorunun büyüklüğünü özetliyor. Karar yine sembol
başına verilecek. Ekranlardaki son girişler 26–27 Temmuz olduğu için bu okuma, 8A'da
planlanan `2026-07-01` hariç bitişe ait değil. Adaptive A/B'de iki gösterge mutlaka aynı
`countFrom/countUntil` değerleriyle çalıştırılacak.

### Görsel teşhis

BTC, ETH, BNB ve SOL ekranlarının ortak kaybı, `trend pressure` pozitif, EMA/VWAP rejimi
yukarı ve fiyat anchored VWAP üstündeyken premium bölgedeki RSI divergence işaretinin
doğrudan short işleme dönüşmesi. Divergence trendin yorulabileceğini söylüyor; trendin
döndüğünü kanıtlamıyor. Özellikle ETH, BNB ve SOL'da yükseliş boyunca peş peşe strong sell
ve stop dizisi bunun doğrudan örneği.

### İlk Adaptive değişiklikleri

- `EMA 20 > EMA 50`, fiyat fast EMA ve anchored VWAP üstünde, rolling VWAP yükseliyorsa
  strong bull regime; simetriği strong bear regime sayılıyor.
- Ham counter-trend divergence/sniper sinyali işlem açmıyor. Sekiz barlık pencere içinde
  fiyat fast EMA'yı kırmalı veya basınç yön değiştirmeli ve güçlü karşı rejim zayıflamalı.
- Frekansın tamamen çökmesini önlemek için trend yönünde RSI-50 geri alma ve yeniden
  hızlanan basınçla continuation sinyali eklendi.
- Aynı mumdaki long/short çakışmasında yüksek skor seçiliyor; skor eşitse işlem yok.
- Adaptive varsayılanında opposite signal otomatik reversal kapalı. Kanıtlanmamış ters
  sinyal çalışan pozisyonu erken kesmiyor.
- ATR 14 × 2, 2R hedef, 5-bar cooldown ve sonraki açılış girişi baseline ile aynı kaldı.
  İlk A/B sinyal mimarisini ölçüyor; çıkış hedefini değil.
- Dashboard ayrıca `Long W/L`, `Short W/L`, `Continuation W/L`, `Reversal W/L` ve
  `Raw reversals gated` sayaçlarını gösteriyor.

### Terfi eşiği

Adaptive sürüm “daha iyi” sayılmak için:

1. dört sembolün en az üçünde `PF > 1.05` ve `Net R > 0`;
2. hiçbir sembolde max drawdown baseline'dan yüksek değil;
3. tamamlanan işlem sayısı baseline'ın en az %35'i;
4. continuation ve reversal ayrımlarından en az biri tek başına pozitif yapı gösteriyor.

İşlem sayısı %35'in altına düşerse isabet artsa bile evrensel varsayılan yapılmayacak.
İlk eşik geçilirse ikinci aşamada yalnız risk/çıkış ızgarası (`1R–2R`, ATR `1.5–2.5`) ayrı
bir tarih bölümünde ölçülecek; ilk sonuçtan hedef seçilip aynı veri üzerinde parlatılmayacak.

**Durum:** ilk Adaptive sürüm uygulamaya eklendi ve aynı tarihli TradingView okumaları
tamamlandı. Aşağıdaki Active 4H turu bu ilk sürümün yerini aldı ve final ürün kararı oldu.

### ETH zaman dilimi pilotu — 27 Temmuz 2026

Kullanıcının aynı Adaptive yapıyla yaptığı ilk ETHUSDT zaman dilimi okumaları:

| TF | W / L | Win rate | Net R | PF | Max DD | Aile |
|---|---:|---:|---:|---:|---:|---|
| 4 saat | 6 / 4 | %60.0 | +7.95R | 2.98 | 2.01R | reversal 6/4, continuation 0/0 |
| 1 saat | 10 / 23 | %30.3 | −3.43R | 0.85 | 6.23R | reversal 8/23, continuation 2/0 |
| 30 dakika | 23 / 44 | %34.3 | +0.78R | 1.02 | 11.24R | reversal 22/43, continuation 1/1 |
| 15 dakika | 11 / 23 | %32.4 | −1.88R | 0.92 | 11.41R | reversal 11/22, continuation 0/1 |
| 5 dakika | 14 / 29 | %32.6 | −3.69R | 0.88 | 8.54R | reversal 14/27, continuation 0/2 |

ETH pilotunda 4 saat açık ara iyi; fakat yalnız 10 kapanmış işlem var ve kazancın tamamı
reversal ailesinden geliyor. Bu nedenle henüz parametre değiştirilmedi. Önce aynı 4 saat
varsayılanı BTC, BNB ve SOL'da okunacak. En az üç sembolde pozitif kalırsa 4 saate özgü
lookback/cooldown/confirmation ızgarası açılacak; tek ETH sonucu üzerinde ayar seçilmeyecek.

Dashboard yalnız Kohen Dive özel compiler'ında 27 satırdan 19 satıra indirildi. Ayrı
setup/signal satırları `Long state` ve `Short state` altında birleşti; son giriş/sonuç
fiyatları, iki tarih, kapalı skor ve tekrarlanan profil satırı panelden çıkarıldı.
Diğer hazır preset'lerin dashboard üreticisi değiştirilmedi.

### Dört sembol 4 saat okuması ve tarih etkisi — 27 Temmuz 2026

2026 başlangıcı:

| Sembol | W / L | Win rate | Net R | PF | Max DD |
|---|---:|---:|---:|---:|---:|
| BTC | 2 / 7 | %22.2 | −3.07R | 0.57 | 5.04R |
| ETH | 6 / 4 | %60.0 | +7.95R | 2.98 | 2.01R |
| BNB | 4 / 6 | %40.0 | +1.93R | 1.32 | 2.02R |
| SOL | 7 / 7 | %50.0 | +6.93R | 1.98 | 4.02R |

2024 başlangıcı:

| Sembol | W / L | Win rate | Net R | PF | Max DD | Continuation / reversal |
|---|---:|---:|---:|---:|---:|---:|
| BTC | 17 / 20 | %45.9 | +13.71R | 1.68 | 5.06R | 1/0 · 16/20 |
| ETH | 20 / 21 | %48.8 | +18.79R | 1.89 | 8.07R | 0/1 · 20/20 |
| BNB | 14 / 25 | %35.9 | +2.75R | 1.11 | 8.05R | 2/0 · 12/25 |
| SOL | 19 / 24 | %44.2 | +13.82R | 1.57 | 5.02R | 1/1 · 18/23 |

Sonuç: 4 saat yapısı dört sembolde 2024–bugün artıda, fakat yalnız 37–43 kapanmış
işlem var. Continuation ailesi toplam örnekte sekiz kapanıştan ibaret; frekans pratikte
reversal ailesine bağlı. Adaptive preset'in beklenen grafik zaman dilimi bu kanıta göre
`240`, sayaç başlangıcı `2024-01-01` yapıldı. V4.6 baseline bu aşamada karşılaştırma için
korundu, final kilitte hazır indikatör listesinden çıkarıldı.

### Yerel 4 saat yapı/risk taraması

`research/kohen-dive/run-4h-study.mjs`, Binance spot 5 dakikalık mumlarını 4 saate
toplayıp 2024 geliştirme, 2025 doğrulama ve 2026 ileri dönem olarak ayırıyor. Dört sembol
hiçbir raporda tek havuzda toplanmıyor. Taranan eksenler:

- reversal teyit penceresi `8/12/16/24`;
- fresh break, confirmed state, EMA break ve pressure break teyitleri;
- strict RSI+gamma, RSI, EMA ve birleşik continuation;
- cooldown `2/5`;
- rolling-low ve simetrik rolling-high bearish VWAP;
- ATR `1.5–2.5`, hedef `1R–2R`.

Ham karşı-rejim sayacı TradingView'e çok yaklaştı: BTC `512/507`, ETH `527/519`,
BNB `498/498`, SOL `539/537`. Buna karşılık kapanmış işlem sayısı yerel referansta
TradingView'den belirgin yüksek kaldı; teyitten risk kabulüne giden katmanda parite henüz
tam değil. Bu yüzden tarama yön gösterir, ürün varsayılanını tek başına terfi ettirmez.

En önemli reddetme: 2024 ve 2025'te hem frekansı hem isabeti yükselten agresif
`confirmed state + hybrid continuation` yapısı 2026'da BTC ve BNB'de eksiye döndü.
Kısıtlı ızgaradaki hiçbir aday üç yıl × dört sembolün 12 hücresinin tamamında pozitif
kalmadı; en iyi aday yalnız `10/12` hücreyi geçti.

İlk uygulamada bu risk nedeniyle yalnız zaman dilimi ve tarih değiştirildi; TradingView
sonucunun birebir aynı kalması kullanıcının istediği frekans iyileştirmesini karşılamadı.
Bunun üzerine Adaptive Pine içinde iki açık A/B profili oluşturuldu:

- `Active 4H` (yeni varsayılan): state recovery + hybrid RSI/EMA/pressure continuation,
  cooldown 2, ATR×1.75, hedef 1.75R;
- `Strict 4H`: önceki fresh-break + RSI/gamma confirmation davranışı.

### Active 4H final TradingView doğrulaması ve kilit — 27 Temmuz 2026

Eski göstergeler TradingView'den tamamen kaldırıldı, PineForge'dan yeniden üretilen
`Kohen Dive Adaptive` dört sembole aynı ayarlarla eklendi. Dashboard dört ekranda da
`ACTIVE 4H` ve `Chart TF: OK` gösterdi.

| Sembol | W / L | Win rate | Net R | PF | Max DD | Continuation W / L | Reversal W / L |
|---|---:|---:|---:|---:|---:|---:|---:|
| BTCUSDT | 58 / 71 | %45.0 | +29.33R | 1.41 | 10R | 24 / 33 | 34 / 38 |
| ETHUSDT | 45 / 63 | %41.7 | +15.12R | 1.24 | 6.17R | 13 / 24 | 32 / 39 |
| BNBUSDT | 45 / 68 | %39.8 | +9.92R | 1.14 | 8.41R | 18 / 29 | 27 / 39 |
| SOLUSDT | 56 / 67 | %45.5 | +30.41R | 1.45 | 6.03R | 22 / 23 | 34 / 44 |

Bu değerler 13:34'te korunan Active 4H kontrol sonuçlarıyla sembol bazında birebir
eşleşti. Kilitlenen yapı:

- grafik `4H / 240`, sayaç başlangıcı `2024-01-01`;
- varsayılan profil `Active 4H`; `Strict 4H` aynı Pine içinde izole A/B seçeneği;
- reversal teyidi state recovery;
- continuation teyidi RSI **veya** EMA **veya** pressure recovery;
- confirmed candles açık, cooldown `2`;
- ATR `14 × 1.75`, hedef `1.75R`;
- giriş `Market (next open)`;
- Active profilde opposite signal reversal kapalı;
- dashboard `2 × 19`; başlık `ACTIVE 4H` / `STRICT 4H`;
- dashboard aile sayaçları: long/short, continuation/reversal ve raw reversals gated.

**Kilit kararı:** #8 artık yalnız `Kohen Dive Adaptive` olarak ürün listesinde bulunur.
`RSI Divergence Reversal`, geçici `Kohen Dive V4.6` ve “Experimental comparison preset”
metni üründen çıkarıldı. Active 4H kontrol grubudur; kullanıcı açıkça yeniden açmadan sinyal
motoru, varsayılan ayarlar veya dashboard genişletilmez. Yeni deneyler tek eksenli ve bağımsız
A/B olmalı; her turda önceki deney varsayılana geri alınır ve dört sembol aynı tarihle ayrı
raporlanır.

Kilit regresyonları: Kohen Dive `12/12`, hedefli paket `470/470`, tam paket `717/717`;
production build geçti. Hazır indikatör listesi yerel tarayıcıda doğrulandı.

---

## 9. Long-Term Trend Guard — ✅ KİLİTLENDİ (27 Temmuz 2026)

`long_term_trend_guard` · 30 dakika · long + short · EMA 50/100 kesişimi · haftalık
SMA40 · ATR×3

- **Para profili:** risk/ödül 6, başabaş 1R, tetikleyici penceresi 5
- **Varsayılan isabet profili:** risk/ödül 2, trailing 1.5/1, skor 85, pencere 10

Eski long-only kontrol 2026 Ocak-Haziran'da BTC, ETH ve SOL'da hiç işlem üretmedi;
yalnız BNB'de 4/1, +4.32R vardı. Başka hiçbir ayar değişmeden short tarafının açılması
dört sembolde de okunabilir örneklem ve pozitif net sonuç verdi.

**TradingView — 2026-01-01 dahil, 2026-07-01 hariç:**

| Sembol | Kazanç / kayıp | İşlem | İsabet | Net sonuç |
|---|---:|---:|---:|---:|
| BTCUSDT | 14 / 12 | 26 | %53.8 | +10.74R |
| ETHUSDT | 16 / 15 | 31 | %51.6 | +10.54R |
| BNBUSDT | 18 / 11 | 29 | %62.1 | +16.57R |
| SOLUSDT | 14 / 19 | 33 | %42.4 | +1.13R |

BTC, ETH ve BNB paneli offline motorla işlem ve net R düzeyinde birebir eşleşti.
SOL offline motorda 15/19 ve +3.12R gösterdi: Pine tarafında bir adet yaklaşık +1.99R
hedef işlemi hiç kabul edilmedi. Kullanıcı bu tek işlem parity farkını daha fazla takip
etmeden, TradingView sonucunu gerçek kabul ederek adayı kilitleme kararı verdi.

**İzole A/B kararları:**

- `ema_cross → pullback_reclaim`: işlem sayısını artırdı fakat BTC geliştirmeyi negatife
  çevirdi ve ETH drawdown'ını belirgin artırdı; reddedildi.
- Minimum skor `85 → 90/95`: 90 ile 95 aynı sinyalleri verdi. 2026 Oca-Haz neti BTC
  +10.74R→+10.65R, ETH +10.54R→+8.77R, BNB +16.57R→+12.41R,
  SOL +3.12R→+2.19R düştü; reddedildi.
- Grafik `30dk → 60dk`, short açık: 2026 Oca-Haz neti BTC +5.77R, ETH −3.76R,
  BNB +3.66R, SOL +1.38R oldu; Temmuz'da BTC, BNB ve SOL negatife döndü; reddedildi.

**Kilit kararı:** 30 dakika, long + short, EMA-cross, skor 85 ve mevcut risk ayarları
kontrol grubudur. Kullanıcı açıkça yeniden açmadan yön, zaman dilimi, skor, giriş motoru
ve dashboard değiştirilmez.

Kilit regresyonu: preset yönü `long_short`, chart `30`, win-rate skoru `85`.

---

## Ölçülmüş ve reddedilmiş fikirler

Bu preset'ler üzerinde denenip **uygulanmayan** her şey, bir daha aynı yoldan geçilmesin diye:

| Fikir | Sonuç |
|---|---|
| ICT süpürme girişi | 2026 Oca-Haz'da iyi, Temmuz'da 27 kombinasyonun hepsi zararda |
| ICT FVG girişi | Doğrulama ve holdout'ta baseline'dan iyi, Temmuz'da hepsi zararda |
| ICT order block girişi | Geliştirmede en kötü varyant, Temmuz'da zararda |
| Yapısal bias (diğer preset'lerde) | Sadece 4H Swing Trend'de üç dönemde birden kanıtlandı |
| ATR stop çarpanını 3'e çekmek | 11.520 konfigün medyanı destekliyordu, izole testte 4 iyileşti 4 kötüleşti |
| ADX eşiğini 15'e çekmek | Medyan destekliyordu, izole testte test edilen üç preset'te de kötüleşti |
| Hacim çarpanını 0.8'e çekmek | Karışık, tutarlı bir kazanım yok |
| Skor modunu açmak | İşlem %63 artıyor, beklenti artıdan eksiye düşüyor |
| Seçimi 2023-2024'ten yapmak | 5 preset'te iyi, 4'ünde kötü — genel kural değil |
| Risk/ödül 0.5-1 (yüksek isabet) | %70+ isabet gerçek, ama Temmuz'da hepsi zararda |
| **Mum içi giriş** (kırılma anında al) | Fiyat farkı sıfır: 2659 sinyalde mum içi giriş sadece %45 daha iyi fiyat, ortalama +0.008R. Dört dönemin 1'inde iyi. Aşağıda ayrıntı. |
| **Limit giriş** (geri çekilmeyi bekle) | Hiçbir varyant dört dönemde market'i geçmiyor. Dolum %28-48'e düşüyor ve kaçırdığı işlemler çalışan kırılmalar. Aşağıda ayrıntı. |
| 4 saatlik grafiğe taşımak (Breakout M.) | Geliştirme ve doğrulamada bütün varyantların en iyisi (+0.521R / +0.276R), holdout'ta +0.112R ve iki anlamlı sembolün sıfırı artıda. Örneklem dışında çöküyor. |
| MACD'yi kaldırmak (Breakout M.) | Ölçülebilir hiçbir fark yok (+0.421 / +0.192 / +0.386 vs +0.415 / +0.200 / +0.391). Kaldırılabilir ama kullanıcıya gösterilen bir filtre olduğu için Kohen kalsın dedi. |
| Üst zaman dilimi uzunluğu 200 (Breakout M.) | Üç dönemde iyi, Temmuz'da −1.016R. |

---

## Giriş modeli araştırması — iki fikir, ikisi de tutmadı (26 Temmuz 2026)

Kohen bir SOL grafiğinde şunu gösterdi: fiyat büyük bir saatlik mumun içinde direnci kırdı,
gösterge girişi **bir sonraki saatin açılışında** yaptı — hareketin tepesinde — ve stop oldu.
Kırılma olduğu anda görülebilirdi, script mumun kapanmasını bekledi.

Bu haklı bir şikayetti ve tuning sorusu değil, **giriş modelinin kendisi** sorusuydu. Bu
projenin ürettiği bütün sayılar o geç girişi ölçüyor. İki yönde çözüm denendi.

### 1. Mum içi giriş — erken al

Filtreler ve seviyeler son kapanmış saatlik mumdan, kesişme anı 5 dakikalık mumlardan.
İleriye bakma yok, çünkü seviye önceden belli ve 5 dakikalık mum da kapanıyor.
`engine.mjs` içinde `buildIntrabarSignals`, ölçüm `run-intrabar-entry.mjs`.

| Dönem | Mum kapanışı | Mum içi |
|---|---|---|
| 2019-22 | +0.447R | +0.396R |
| 2023-25 | +0.305R | +0.292R |
| 2026 holdout | +0.432R | **+0.611R** |
| Temmuz | −0.515R | −0.943R |

Dört dönemin birinde iyi. İsabet profilinde de aynı desen.

**Kararı veren sayı bu:** 2659 sinyalde iki girişin fiyatı yan yana konuldu — aynı sinyal, iki
fiyat, başka hiçbir fark yok. **Mum içi giriş sadece %45 oranında daha iyi fiyat aldı,
ortalama kazanç +0.008R.** Yani sıfır. %55 oranında beklemek daha iyi fiyat verdi, çünkü
kırılmaların çoğu geri çekiliyor.

Karşılaştırmanın kirli yeri: mum kapanışı modeli tetikleyici penceresi 3 kullanıyor, mum içi
modelde pencere yok. Yani iki fark var, sadece giriş anı değil. İşlem sayıları yakın (701'e
704) olduğu için etki küçük görünüyor ama temiz bir A/B değil. Temiz olan tek şey +0.008R.

**Ayrıca:** mum içi giriş sadece **fiyat seviyesi kırılması** olan tetikleyicilerde anlamlı —
kırılma, EMA geri alma, VWAP geri alma. `ema_cross` ve `supertrend_flip` gösterge durumu
değişimi, mum kapanmadan olmaz. Yani Fast EMA Scalper ve Supertrend Volume bundan etkilenmez.

### 2. Limit giriş — geri çekilmeyi bekle

Yukarıdaki "kırılmalar geri çekiliyor" bulgusunun doğal sonucu. Sinyal mumunun kapanışından
riskin bir kesri kadar geride bekleyen emir, süre içinde fiyat gelirse doluyor.
`engine.mjs` içinde `simulate`'in opt-in dalı, ölçüm `run-entry-type.mjs`.

| Giriş | 2019-22 | 2023-25 | holdout | Temmuz | Dolum | Artıda |
|---|---|---|---|---|---|---|
| market | +0.447R | +0.305R | **+0.432R** | **−0.515R** | %55 | **4/4** |
| limit 0.25×R | +0.479R | +0.414R | +0.274R | −0.495R | %48 | 4/4 |
| limit 0.5×R | +0.628R | +0.353R | +0.182R | −1.253R | %39 | 3/4 |
| limit 0.75×R | +0.624R | +0.561R | +0.591R | −1.102R | %28 | 2/4 |

Hiçbiri dört dönemde market'i geçmiyor.

**Desen:** geri çekilme mesafesi arttıkça geliştirme dönemi sürekli iyileşiyor, ama dolum
oranı çöküyor ve artıda sembol sayısı düşüyor. 0.75×R'de holdout iyi görünüyor (+0.591R) ama
o sonuç ETH'nin **12 işleminden** geliyor (+1.738R); BNB aynı ayarda −0.138R.

**Sebebi seçim yanlılığı.** Fiyatın geri gelmediği kırılmalar tam olarak çalışan kırılmalar.
Limit emri onları sistematik olarak kaçırıyor, geride kalanların ortalaması iyi görünüyor.
BNB'de net: market +0.177R (28 işlem), limit 0.5×R −0.566R (19 işlem) — dolan 19, dolmayan
9'dan kötü.

### Sonuç

İki fikir zıt yönde ve ikisi de kazandırmıyor. **Mevcut giriş modeli — mum kapanışında karar,
sonraki açılışta al — bu preset için zaten iyi bir denge.** Grafikteki tek kötü giriş gerçek
ama sistematik değil.

**Motorda kalan altyapı:** `buildIntrabarSignals` ve `simulate`'in limit dalı duruyor, ikisi de
opt-in. Market yolu bit bit aynı kaldı — Balanced Intraday'in kayıtlı dört sayısıyla
doğrulandı (151t %19.2 +0.138R ve 711t %49.2 +0.086R, ikisi de değişmedi). Başka bir preset
için tekrar sorulursa araç hazır, ama **Pine tarafına hiç dokunulmadı**: `request.security_lower_tf`
üründe yok ve mum içi girişin parity'si hiç yapılmadı. Ölçüm o yüzden "bu fikir tutmuyor"
demek için yeterli, "bunu ürüne koyalım" demek için değil.

**Öğrenilen kısıt:** 1 saatlik grafikte 5 dakikalık mum içi veri TradingView Basic'te 17 gün
geriye gidiyor (5000 mum × 5 dakika). 15 dakikalık 52 gün, 1 saatlik 208 gün. Mum içi bir
şeyin parity'si bu pencerelerle sınırlı.

---

## Notlar

- Ölçüm kaynağı: `research/preset-sweep/measure-shipping-state.mjs`, çıktısı
  `research/preset-sweep/shipping-state.md`
- Bir preset'in **kendi yapısını** taramak için `run-structure-axes.mjs` — kırılma uzunluğu,
  zaman dilimi, EMA'lar, MACD, stop onayı, üst zaman dilimi, ADX. Tek değişkenli, dört dönem.
  Bu eksenler 26 Temmuz 2026'ya kadar hiçbir taramada yoktu; o güne kadar sadece ödül hedefi,
  çıkış yönetimi ve dört filtre eşiği taranmıştı.
- Bir preset'in **isabet profilini** yapı değiştikten sonra baştan ölçmek için
  `run-winrate-axes.mjs`. Ödül hedefini altı farklı çıkış şekliyle birlikte tarıyor, tek
  başına değil — 1.5R'de kurulan bir trailing 2R üstündeki her hedefi ulaşılmaz kıldığı için
  tek bir trailing ayarında ölçülen ödül ızgarası başka bir trailing için hiçbir şey söylemez.
- Giriş anı ve giriş tipi için `run-intrabar-entry.mjs` ve `run-entry-type.mjs` (ikisi de
  reddedildi, yukarıdaki bölüme bakın).
- Temmuz verisi: `research/preset-sweep/data-july/`, 100 dosya, her biri Binance'in
  yayınladığı SHA-256 ile doğrulanmış
- Semboller hiçbir tabloda birleştirilmez. Tek sembolün taşıdığı bir sonuç, sonuç değildir.
- Kilitlenen preset'in ayarları `lib/presets.ts` içinde yorumla işaretlenir ve
  `tests/measured-preset-defaults.test.ts` onu kilitler — ayar değişirse test kırılır.
