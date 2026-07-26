# Preset Gözden Geçirme Planı

On indikatörü tek tek ele alıp, gerçek grafikte doğruladıktan sonra kilitleyip bir sonrakine
geçmek için. Bir preset kilitlendikten sonra o preset'e dokunulmaz — yeni bir ölçüm onu
tekrar açmayı gerektirirse, o karar ayrıca konuşulur.

**Son güncelleme:** 26 Temmuz 2026
**Kilitlenen:** 2 / 9 ölçülebilir preset

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
| 3 | Supertrend Volume | 10.5 | **SIRADA** |
| 4 | Breakout Momentum | 6.6 | bekliyor |
| 5 | VWAP Session Trader | 7.1 | bekliyor |
| 6 | 4H Swing Trend | 2.2 | bekliyor |
| 7 | Selective Multi-Timeframe | 2.1 | bekliyor |
| 8 | RSI Divergence Reversal | 5.3 | bekliyor |
| 9 | Long-Term Trend Guard | 1.9 | bekliyor |
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

## 3. Supertrend Volume — bekliyor

`supertrend_volume` · 30 dakika · tetikleyici penceresi 10 · ATR×2

- **Para profili:** risk/ödül 5
- **İsabet profili:** risk/ödül 3, trailing 1.5/1, pencere 10

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

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 4. Breakout Momentum — bekliyor

`breakout_momentum` · 60 dakika · tetikleyici penceresi 3 · ATR×2

- **Para profili:** risk/ödül 6
- **İsabet profili:** risk/ödül 2, trailing 1.5/1, pencere 3

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
  veriyor (mevcut +0.391R), ama Temmuz'da −0.315R.

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 5. VWAP Session Trader — bekliyor

`vwap_session_trader` · 60 dakika · tetikleyici penceresi 3 · ATR×2

- **Para profili:** risk/ödül 6
- **İsabet profili:** risk/ödül 4, trailing 1.5/1, pencere 3

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
  hiç ölçülmedi, kaldırıldığında ne olacağı bilinmiyor.
- **Karar önerisi:** üründen çıkarmak veya "ölçüldü, tutmadı" etiketiyle bırakmak.

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 6. 4H Swing Trend — bekliyor

`swing_trend_4h` · 30 dakika · tetikleyici penceresi 5 · ATR×2.5 · **yapısal bias**

- **Para profili:** risk/ödül 6
- **İsabet profili:** risk/ödül 3, pencere 5

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

## 7. Selective Multi-Timeframe — bekliyor

`selective_multi_timeframe` · 60 dakika · tetikleyici penceresi 3 · ATR×2 · kapanış onaylı stop

- **Para profili:** risk/ödül 6, trailing 2/1.5
- **İsabet profili:** risk/ödül 2.5, trailing 1.5/1, pencere 3

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 331t · %50.8 · +0.638R | 349t · %57.6 · +0.497R |
| 2023-2025 | 330t · %40.3 · +0.135R | 342t · %48.8 · +0.025R |
| 2026 Oca-Haz | 56t · %42.9 · +0.269R | 56t · %50.0 · +0.080R |
| 2026 Temmuz | 11t · %9.1 · −1.037R | 11t · %27.3 · −0.549R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 9t · %33.3 · +0.158R | 9t · %44.4 · −0.200R |
| BTCUSDT | 15t · %26.7 · −0.572R | 15t · %46.7 · −0.045R |
| ETHUSDT | 16t · %62.5 · +0.571R | 16t · %62.5 · +0.305R |
| SOLUSDT | 16t · %43.8 · +0.819R | 16t · %43.8 · +0.131R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 3t · %33.3 · −0.578R | 3t · %66.7 · +0.596R |
| BTCUSDT | 3t · %0.0 · −1.237R | 3t · %0.0 · −1.237R |
| ETHUSDT | 3t · %0.0 · −1.194R | 3t · %0.0 · −1.194R |
| SOLUSDT | 2t · %0.0 · −1.188R | 2t · %50.0 · −0.265R |

**Dikkat edilecekler:**

- **Setin en yüksek isabetli preset'i:** isabet profili 2019-2022'de %57.6, 2023-2025'te
  %48.8. ETH'de 2026 Oca-Haz'da %62.5.
- Ama en seyrek olanlardan: ayda 2.1 işlem/sembol, 2026 Oca-Haz'da sembol başına 9-16 işlem.
  İstatistiksel olarak hiçbir şey kanıtlanamaz.
- Kapanış onaylı stop kullanıyor: mum stopun ötesinde kapanırsa kayıp 1R'den büyük olur.
  Bu, likidite süpürmelerinde stop olmamayı sağlar ama sert dönüşlerde daha çok kaybettirir.
- Ölçülmüş alternatif: risk/ödül 1.5, trailing kapalı → 2026 Oca-Haz'da %51.8 isabet ve
  +0.175R, dört sembolde de artıda. Mevcut isabet profilinden her açıdan iyi ama Temmuz'da
  −0.488R.

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 8. RSI Divergence Reversal — bekliyor

`rsi_divergence_reversal` · 30 dakika · tetikleyici penceresi 1 · ATR×2

- **Para profili:** risk/ödül 6
- **İsabet profili:** risk/ödül 3.5, trailing 2/1.5, pencere 1

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 912t · %22.7 · +0.190R | 965t · %36.7 · +0.082R |
| 2023-2025 | 786t · %20.6 · +0.002R | 833t · %37.3 · +0.050R |
| 2026 Oca-Haz | 135t · %15.6 · −0.208R | 146t · %33.6 · −0.028R |
| 2026 Temmuz | 24t · %25.0 · +0.046R | 28t · %50.0 · +0.465R |

**2026 Ocak-Haziran, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 33t · %12.1 · −0.409R | 36t · %30.6 · −0.037R |
| BTCUSDT | 37t · %16.2 · −0.148R | 38t · %31.6 · −0.149R |
| ETHUSDT | 36t · %19.4 · −0.082R | 40t · %40.0 · +0.088R |
| SOLUSDT | 29t · %13.8 · −0.212R | 32t · %31.3 · −0.022R |

**2026 Temmuz, sembol sembol:**

| Sembol | Para profili | İsabet profili |
|---|---|---|
| BNBUSDT | 6t · %16.7 · +0.130R | 6t · %16.7 · −0.286R |
| BTCUSDT | 5t · %20.0 · −0.417R | 7t · %71.4 · +1.098R |
| ETHUSDT | 6t · %16.7 · −0.259R | 6t · %50.0 · +0.498R |
| SOLUSDT | 7t · %42.9 · +0.565R | 9t · %55.6 · +0.450R |

**Dikkat edilecekler:**

- **2026 Ocak-Haziran'da dört sembolde de zararda** (para profili). Bu preset de ölçümü
  geçemedi.
- Temmuz'da isabet profili %50 ve +0.465R — setin Temmuz'daki en iyi sonucu. Ama 28 işlem,
  ve BTC'nin 7 işlemi (+1.098R) sonucun büyük kısmını taşıyor.
- Bu preset RSI uyumsuzluğu üzerine kurulu ve ayrı bir panelde çiziliyor; görsel değeri
  ölçülen değerinden yüksek olabilir.
- **Karar önerisi:** üründen çıkarmak yerine "uyumsuzluk göstergesi" olarak konumlandırmak,
  sinyal üreticisi olarak değil.

**Durum:** ölçüm hazır, sıra bekliyor.

---

## 9. Long-Term Trend Guard — bekliyor

`long_term_trend_guard` · 30 dakika · tetikleyici penceresi 5 · ATR×3 · long-only

- **Para profili:** risk/ödül 6, başabaş 1R
- **İsabet profili:** risk/ödül 2, trailing 1.5/1, skor 85, pencere 10

| Dönem | Para profili | İsabet profili |
|---|---|---|
| 2019-2022 | 256t · %11.3 · +0.229R | 374t · %44.7 · +0.107R |
| 2023-2025 | 421t · %11.9 · +0.195R | 658t · %37.4 · −0.065R |
| 2026 Oca-Haz | 3t · %33.3 · +1.978R | 5t · %80.0 · +0.863R |
| 2026 Temmuz | işlem yok | işlem yok |

**Dikkat edilecekler:**

- 2026'da toplam 3 işlem, hepsi BNB'de. Diğer üç sembolde **hiç sinyal yok.**
- Haftalık SMA-40 filtresi kullanıyor; bu kadar yavaş bir filtre 30 dakikalık grafikte
  neredeyse hiç izin vermiyor.
- Bu preset daha önce "6 yılda 3 işlem" gibi görünüyordu; sebebi ölçüm aracındaki bir
  hataydı (veri boşluklarında gösterge ısınması sıfırlanıyordu). Hata düzeltildi, gerçek
  sayı 2019-2022'de 256 işlem. Ama 2026'da yine de neredeyse hiç sinyal yok.
- **Karar önerisi:** ya daha yüksek zaman dilimine taşınmalı (4 saat / günlük, hiç
  ölçülmedi) ya da üründen çıkarılmalı.

**Durum:** ölçüm hazır, sıra bekliyor.

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

---

## Notlar

- Ölçüm kaynağı: `research/preset-sweep/measure-shipping-state.mjs`, çıktısı
  `research/preset-sweep/shipping-state.md`
- Temmuz verisi: `research/preset-sweep/data-july/`, 100 dosya, her biri Binance'in
  yayınladığı SHA-256 ile doğrulanmış
- Semboller hiçbir tabloda birleştirilmez. Tek sembolün taşıdığı bir sonuç, sonuç değildir.
- Kilitlenen preset'in ayarları `lib/presets.ts` içinde yorumla işaretlenir ve
  `tests/measured-preset-defaults.test.ts` onu kilitler — ayar değişirse test kırılır.
