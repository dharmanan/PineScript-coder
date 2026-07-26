# PineForge — Devir Notu

Bu dosya, yeni bir konuşmaya kaldığı yerden devam edebilmek için yazıldı. Yeni oturumda
önce bunu oku, sonra `git status` ve `safe-npm test` çalıştır.

---

## 1. Başlangıç durumu ve ne değişti

Başlangıç: kullanıcı, üretilen Pine script'lerinin Strategy Tester'da sürekli zarar
gösterdiği için strategy modunu üründen kaldırmıştı. Elde 10 hazır preset vardı ve
hiçbiri ölçülmemişti. Soru: "bunlar %60 üstü isabetle çalışsın."

Bugün eklenen şey, sırayla:

1. **Ölçüm paneli** — üretilen indicator artık grafiğin üstünde kazanç/kayıp sayıyor
2. **Gerçekçi giriş** — sinyal mumunun kapanışı yerine sonraki mumun açılışı
3. **Komisyon** — iki yönlü, net R
4. **Puanlama modu** — filtreler veto etmek yerine puan katar
5. **Tetikleyici penceresi** — tetiklenen sinyal N mum canlı kalır (en büyük kazanç)
6. **Trailing stop + break-even** — config'te vardı, Pine'da kodu yoktu
7. **Tarama altyapısı** — 6 yıllık veride binlerce konfigürasyonu ölçer
8. **Parity** — tarama motoru ile TradingView'in aynı sonucu verdiği kanıtlandı

Test sayısı: **579**, hepsi geçiyor. Build geçiyor.

---

## 2. En önemli kural: PARİTELERİ BİRLEŞTİRME

Kullanıcı bunu iki kez söyledi, ikincisinde sinirlendi. **Sembolleri asla tek bir
toplam sayıda birleştirme.** Her zaman sembol sembol raporla.

Gerekçesi doğru: kripto sembolleri ~0.85 korelasyonlu. 15 sembol birleştirmek
`15 / (1 + 14×0.85) = 1.16` bağımsız gözlem verir. İşlem sayısı şişer, güven aralığı
daralmaz. Ayrıca birleştirme, tek bir sembolün tüm sonucu taşıdığını gizler — nitekim
son testte toplam kârın %100'ü ETH'den geliyordu.

Bağımsızlık ekseni **zaman**, sembol değil. Tarama bu yüzden çeyrek bazlı tutarlılık
kapısı kullanıyor.

---

## 3. Dosya haritası

### Derleyici zinciri
`lib/compiler.ts` → v26 → v25 → v24 → v23 → v22 → ... → v2

| Dosya | Ne yapar |
|---|---|
| `lib/compiler-v23.ts` | Kazanç/kayıp sayacı, komisyon, net R, tarih penceresi |
| `lib/compiler-v24.ts` | Sonraki-mum-açılışı dolum, limit emir, trailing/break-even, donmuş risk birimi |
| `lib/compiler-v25.ts` | Panel aç/kapa |
| `lib/compiler-v26.ts` | Sinyal puanlaması + tetikleyici penceresi |

`lib/types.ts` ve `lib/defaults.ts`'e eklenen alanlar:
`signalMode`, `scoreThreshold`, `triggerWindow`, `risk.breakEvenAtR`,
`risk.trailStartR`, `risk.trailDistanceR`.
Kaldırılan ölü alanlar: `risk.trailingEnabled`, `risk.breakEvenEnabled`.

### Tarama altyapısı — `research/preset-sweep/`

| Dosya | Ne yapar |
|---|---|
| `engine.mjs` | Panelin mantığının birebir aynısı. Sinyal → işlem → metrik |
| `indicators.mjs` | Pine göstergeleri (ısınma davranışı dahil) |
| `data.mjs` | Toplama, kesintisiz segmentlere bölme |
| `dataset.mjs` | Üç veri kaynağını birleştirir, bölümleri tanımlar |
| `archive-tools.mjs` | Binance arşivi indirme, ZIP açma, mikrosaniye normalizasyonu |
| `run-sweep-v2.mjs` | Ana tarama |
| `run-parity.mjs` | Tek konfig, tek pencere, tek sembol karşılaştırma |
| `run-holdout.mjs` | Tek atışlık holdout testi |
| `run-intrabar-compare.mjs` | Mum içi çözümün etkisini ölçer |
| `strategy-*.pine` | TradingView Strategy Tester script'leri |

### Komutlar (hepsi safe-npm üzerinden)

```
safe-npm run sweep:v2 -- --timeframes=15,30 --out=rapor.json
safe-npm run sweep:parity -- --preset=X --timeframe=15 --symbol=ETHUSDT --from=2026-01-01 --to=2026-07-01
safe-npm run sweep:holdout
safe-npm run sweep:intrabar
safe-npm run sweep:extra-data
```

`run-parity.mjs` bayrakları: `--mode=score-85`, `--window=3`, `--rr=6`,
`--trailStart=0`, `--trailDistance=1`, `--be=1`, `--stopTrigger=wick|close`, `--htf=D`.
Bayrak verilmezse preset'in kendi ayarı kullanılır.

---

## 4. Veri

| Klasör | İçerik | Boyut |
|---|---|---|
| `research/regime-trend-v1/data-5m/` | BTC, ETH, BNB · 2019-01 → 2024-12 | 269 MB |
| `research/preset-sweep/data-holdout/` | BTC, ETH, BNB · 2025 | 61 MB |
| `research/preset-sweep/data-extra/` | SOL 2020-08 → 2026-06, BTC/ETH/BNB 2026-01 → 2026-06 | 141 MB |

Hepsi `.gitignore`'da. Kaynak: `data.binance.vision`, her dosya SHA-256 doğrulanıyor.

**Bilinmesi şart:** Binance 2025'ten itibaren zaman damgalarını **mikrosaniye** veriyor.
`archive-tools.mjs` bunu milisaniyeye çeviriyor. Yeni indirme yazan biri bunu atlarsa
tüm 2025+ mumlar yüz bin yıl ileri düşer ve sessizce hiçbir pencereye girmez.

### Bölümler (`dataset.mjs`)

- **Geliştirme**: 2019-01-01 → 2023-01-01 — seçim SADECE buradan
- **Doğrulama**: 2023-01-01 → 2026-01-01 — rapor, seçim için kullanılmaz
- **Holdout**: 2026-01-01 → 2027-01-01 — iki kez okundu, artık tüketilmiş sayılır

2025 başta ayrı holdout'tu, okunduktan sonra doğrulamaya katıldı.

---

## 5. Ölçülmüş bulgular

### Zaman dilimi belirleyici (861 konfig, doğrulama beklentisi medyanı)

| Grafik | Medyan | Artıda olan |
|---|---|---|
| 5 dakika | −0.0490R | %17.7 |
| 15 dakika | +0.0031R | %53.8 |
| 30 dakika | +0.0189R | %61.4 |
| 1 saat | +0.0771R | %83.0 |
| 4 saat | +0.1702R | %100 |

Sebep: 5 dakikada 1R fiyatın ~%0.28'i, komisyon işlem başına ~0.7R yiyor. 4 saatte
1R fiyatın %4-5'i, aynı komisyon 0.04R.

### Tetikleyici penceresi en büyük tek kazanç

selective, 1 saat, rr 3.5, düz:

| Pencere | Geliştirme işlem | Beklenti |
|---|---|---|
| w1 (aynı mum) | 46 | +0.945R |
| w3 | 250 | +0.780R |
| w10 | 812 | +0.456R |

Aynı mumda ısrar etmek sinyallerin ~%80'ini atıyor.

### Trailing stop isabeti ikiye katlıyor

selective, 1 saat, w3, rr 6: düz stop %24.9 isabet → `trail-2.0/1.5` ile %49.4.

### Puanlamayı gevşetmek işe yaramıyor

Score 60 ile: 148 işlem, %39.9 isabet — RR 1.5'te başabaş tam %40. Sıfır edge.
Tetikleyiciyi tamamen kaldırmak (trend_state): 448 işlem, %24.8, başabaş %28.6 → negatif.
**Tetikleyici tek başına yazı-tura, filtreler tek başına zararlı, birlikte pozitif.**

### İsabet odaklı seçim dayanıksız

Aynı holdout'ta, sembol sembol bakıldığında isabet odaklı ayarlar tutarsız; beklenti
odaklı ayarlar daha çok preset'te pozitif kaldı. Kullanıcı yüksek isabet istiyor ama
ölçüm her seferinde tersini söylüyor. Bu gerilim çözülmedi.

### Mum içi çözüm önemsiz çıktı

20.589 işlemin sadece 8'inde bir mum hem stopu hem hedefi vurmuş. Etki +%0.6.
Tarama motorunda var, Pine'a taşınmadı (maliyeti kazancından büyük).

---

## 6. Parity durumu

`parity-report-001.md`: `vwap_session_trader`, ETH, 4 saat, 2023-12-31 → 2024-12-31.
Panel 12/33 %26.7 +14.88R, motor 12/33 %26.7 +15.02R. **Geçti.**

Sonra Strategy Tester testinde uyuşmazlık çıktı ve **gerçek bir hata yakalandı**:
kapanış onaylı stopta motor çıkışı stop seviyesinden yazıyordu, oysa mum stopun
ötesinde kapanıyor ve gerçek kayıp 1R'den büyük. Düzeltildi (`engine.mjs` ve
`compiler-v23.ts`). Bu düzeltme `selective`'in tüm eski sayılarını düşürdü —
SOL'da +0.310R → +0.086R.

**Henüz parity yapılmamış mekanizmalar:** tetikleyici penceresi, trailing/break-even.
Bunlar koda girdi ama TradingView ile satır satır doğrulanmadı.

---

## 7. Şu anki preset varsayılanları

`lib/presets.ts` içinde, her birinin yanında 2026 holdout sonucu yorum olarak yazılı.
`tests/measured-preset-defaults.test.ts` bunları kilitliyor — tarama tekrar
çalıştırılmadan bir varsayılan değişirse test kırılır.

**UYARI:** Bu varsayılanlar 30dk/60dk taramasından geldi. Sonrasında 15 dakikalık tarama
çok daha iyi sonuç verdi (7/7 preset holdout'ta pozitif) ama **preset'lere yazılmadı**.
Ayrıca kapanış-onaylı-stop düzeltmesi sonrası tüm sayılar yeniden ölçülmeli.

---

## 8. Bitmemiş işler

1. **Temmuz 2026 verisini indir** — kullanıcının TradingView'i 25 Temmuz'a kadar
   gösteriyor, veri 30 Haziran'da bitiyor. Aynı pencereyi karşılaştırmak imkânsız.
   İndirici hazır: `download-extra.mjs` içindeki `REQUESTS` tarihini uzatmak yeter.
2. **Taramayı düzeltilmiş motorla yeniden çalıştır** — kapanış-onaylı-stop düzeltmesi
   sonrası tüm raporlar eski.
3. **15 dakikalık sonuçları preset'lere yaz** — ölçüldü, uygulanmadı.
4. **Yeni mekanizmaların parity'si** — pencere ve trailing doğrulanmadı.
5. **Strategy script'ini kapanış onaylı stopla yeniden yaz** — şu anki hali
   `strategy.exit` ile fitil bazlı çalışıyor, preset'in kuralını uygulamıyor.
6. **Kohen Dive v7** — kullanıcı bu dosyayı verdiğini söylüyor, konuşmada sadece V5.3
   paylaşıldı. v7'de farklı bir mekanizma varsa istenmeli.

---

## 9. Durma kuralı (kullanıcı onayladı)

> Doğrulamada başabaşın 2 sigma üstünde olan ve 2026 holdout'unda pozitif kalan bir
> konfigürasyon yoksa: dur, elindekini dürüst etiketlerle yayınla, "kazandıran strateji"
> iddiasında bulunma.

Şu ana kadar hiçbir konfigürasyon 2 sigma eşiğini net geçmedi.

---

## 10. Çalışma kuralları

- Node/npm işlemleri **sadece** `/Users/kohen/bin/safe-npm` üzerinden
- Dev server öncesi `/Users/kohen/bin/safe-stop`, sonra `safe-npm run dev -- -H 0.0.0.0`
- Doğrulama Browser pane ile (`curl` yasak)
- Commit/push yapılmaz, kullanıcı kendi yapar
- İndirme öncesi domain ve boyut bildirilip onay alınır
- Yedek: `.backup/pineforge-20260724-222305.tar.gz`, temiz commit `6957be9`

---

## 11. Kullanıcı hakkında

- Türkçe konuşuyor, kısa ve net cevap istiyor, uzun anlatımdan rahatsız oluyor
- Tekrar edilen hatalara sinirleniyor — özellikle daha önce söylediği bir şeyin
  tekrar sorulmasına (TradingView'de 2024 verisi yok, pariteleri birleştirme)
- Ticari hedefi net: önce **dikkat çekecek kazandıran** bir şey, sonra ölçüm aracı
- Trading bilgisi iyi: korelasyon, likidite süpürmesi, mum içi hareket gibi konularda
  yaptığı itirazların hepsi teknik olarak doğru çıktı ve gerçek hatalar buldurdu
- TradingView planı **Basic**, 5000 mum sınırı var. 15 dakikada ~52 gün, 1 saatte
  ~208 gün geriye gidiyor. Bu, ölçtüğümüz pencereleri doğrulamayı sürekli engelliyor.
