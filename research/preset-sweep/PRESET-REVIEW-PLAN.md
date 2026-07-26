# Preset Gözden Geçirme Planı

> ## Yeni oturum buradan başlar
>
> **Sıradaki iş:** VWAP Session Trader incelemesi (5. sıra, aşağıdaki tabloda).
>
> **İlk üç komut:**
> ```
> git status --short
> /Users/kohen/bin/safe-npm test
> /Users/kohen/bin/safe-npm run dev -- -H 0.0.0.0
> ```
> 737 test geçmeli. Doğrulama Browser pane ile yapılır, `curl` yasak.
>
> **Commit bekleyen değişiklikler stage'de.** Kohen commit'i kendi atar; Claude
> `git commit`, `push`, `pull`, `fetch`, `reset`, `rebase` çalıştırmaz. Stage için
> `/Users/kohen/bin/safe-git-stage DOSYA`, tek tek, `git add .` asla.
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

**Son güncelleme:** 26 Temmuz 2026
**Kilitlenen:** 4 / 9 ölçülebilir preset

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
| 5 | VWAP Session Trader | 7.1 | **SIRADA** |
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
