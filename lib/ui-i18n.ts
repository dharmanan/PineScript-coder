import type { StrategyConfig } from "./types";

export type UiLanguage = "tr" | "en";

export const UI_LANGUAGE_STORAGE_KEY = "kohen-pine-studio-language";
export const UI_LANGUAGE_COOKIE_KEY = "kohen_pine_studio_language";

export const detectUiLanguage = (languages: readonly string[]): UiLanguage =>
  languages[0]?.toLowerCase().startsWith("tr") ? "tr" : "en";

export const isUiLanguage = (value: string | null): value is UiLanguage =>
  value === "tr" || value === "en";

export const readUiLanguageCookie = (cookieHeader: string): UiLanguage | null => {
  const value = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${UI_LANGUAGE_COOKIE_KEY}=`))
    ?.slice(UI_LANGUAGE_COOKIE_KEY.length + 1);
  const normalizedValue = value ?? null;
  return isUiLanguage(normalizedValue) ? normalizedValue : null;
};

export const serializeUiLanguageCookie = (language: UiLanguage): string =>
  `${UI_LANGUAGE_COOKIE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;

export const resolveUiLanguage = (
  cookieLanguage: UiLanguage | null,
  storedLanguage: string | null,
  browserLanguages: readonly string[]
): UiLanguage =>
  cookieLanguage
  ?? (isUiLanguage(storedLanguage) ? storedLanguage : detectUiLanguage(browserLanguages));

const turkish: Record<string, string> = {
  "OPEN SOURCE · DETERMINISTIC · PINE SCRIPT v6": "AÇIK KAYNAK · DETERMINİSTİK · PINE SCRIPT v6",
  "Choose how you trade, inspect the exact behavior in plain language, and generate editable Pine Script indicators without hidden AI decisions.":
    "Nasıl işlem yaptığınızı seçin, davranışı açık bir dille inceleyin ve gizli yapay zekâ kararları olmadan düzenlenebilir Pine Script indikatörleri üretin.",
  "Language": "Dil",
  "Copy Pine": "Pine Kodunu Kopyala",
  "Download .pine": ".pine İndir",
  "Guided Builder": "Rehberli Oluşturucu",
  "Generated Script": "Üretilen Kod",
  "Optional AI Planner": "İsteğe Bağlı AI Planlayıcı",
  "Selected preset": "Seçili preset",
  "Indicator": "İndikatör",
  "Start from a complete indicator": "Hazır bir indikatörle başlayın",
  "Custom configuration": "Özel yapılandırma",
  "Profile": "Profil",
  "Money — fewer, larger wins": "Kazanç — daha az, daha büyük kazanan işlem",
  "Win rate — more, smaller wins": "Kazanma oranı — daha çok, daha küçük kazanan işlem",
  "Both settings were measured on the same data and both are compiled into the script. This picks the one it opens with; the other stays one dropdown away in the indicator's own settings, alongside a Custom option that hands every input back to you.":
    "İki ayar da aynı veride ölçüldü ve ikisi de koda eklenir. Bu seçim indikatörün hangi profille açılacağını belirler; diğeri, tüm girdileri size bırakan Özel seçeneğiyle birlikte indikatör ayarlarında tek bir açılır menü uzaklığında kalır.",
  "Script name": "Kod adı",
  "Trading style": "İşlem tarzı",
  "Scalp": "Scalp",
  "Intraday": "Gün içi",
  "Swing": "Swing",
  "Spot": "Spot",
  "Long term": "Uzun vadeli",
  "Direction": "Yön",
  "Long + Short": "Long + Short",
  "Long only": "Yalnızca Long",
  "Spot buy + exit": "Spot alım + çıkış",
  "Chart timeframe": "Grafik zaman dilimi",
  "Signal frequency": "Sinyal sıklığı",
  "More frequent": "Daha sık",
  "Balanced": "Dengeli",
  "More selective": "Daha seçici",
  "Entry trigger": "Giriş tetikleyicisi",
  "Conditions remain valid": "Koşullar geçerli kalır",
  "EMA crossover": "EMA kesişimi",
  "Fast EMA reclaim": "Hızlı EMA geri kazanımı",
  "VWAP reclaim": "VWAP geri kazanımı",
  "Supertrend flip": "Supertrend yön değişimi",
  "Recent high/low breakout": "Yakın tepe/dip kırılımı",
  "Indicator only:": "Yalnızca indikatör:",
  "Kohen Pine Studio generates chart signals, visual risk levels, dashboards and alerts. It does not generate Strategy Tester orders.":
    "Kohen Pine Studio grafik sinyalleri, görsel risk seviyeleri, dashboard ve alarmlar üretir. Strategy Tester emirleri üretmez.",
  "Spot exit logic": "Spot çıkış mantığı",
  "Combined reversal events": "Birleşik dönüş olayları",
  "Break below long MA": "Uzun MA altına kırılım",
  "Bearish EMA crossover": "Ayı EMA kesişimi",
  "RSI leaves overbought zone": "RSI aşırı alım bölgesinden çıkar",
  "Higher timeframe turns bearish": "Üst zaman dilimi ayıya döner",
  "Higher-timeframe bias": "Üst zaman dilimi yön eğilimi",
  "Use higher-timeframe bias": "Üst zaman dilimi yön eğilimini kullan",
  "Timeframe": "Zaman dilimi",
  "Method": "Yöntem",
  "Length": "Uzunluk",
  "Use only the last closed higher-timeframe candle": "Yalnızca son kapanmış üst zaman dilimi mumunu kullan",
  "Block counter-trend signals": "Trend karşıtı sinyalleri engelle",
  "Trend filters": "Trend filtreleri",
  "EMA trend": "EMA trendi",
  "Fast EMA": "Hızlı EMA",
  "Slow EMA": "Yavaş EMA",
  "Long moving average": "Uzun hareketli ortalama",
  "MA type": "MA türü",
  "ATR length": "ATR uzunluğu",
  "Factor": "Faktör",
  "Breakout lookback": "Kırılım geri bakışı",
  "Momentum, volume and divergence": "Momentum, hacim ve uyumsuzluk",
  "RSI confirmation": "RSI onayı",
  "RSI length": "RSI uzunluğu",
  "Buy RSI ≥": "Alım RSI ≥",
  "Long RSI ≥": "Long RSI ≥",
  "Short RSI ≤": "Short RSI ≤",
  "Exit RSI": "Çıkış RSI",
  "MACD confirmation": "MACD onayı",
  "ADX trend strength": "ADX trend gücü",
  "ADX length": "ADX uzunluğu",
  "Minimum ADX": "Minimum ADX",
  "Confirmed RSI divergence": "Onaylanmış RSI uyumsuzluğu",
  "Pivot strength": "Pivot gücü",
  "Volume confirmation": "Hacim onayı",
  "Volume average": "Hacim ortalaması",
  "Minimum multiplier": "Minimum çarpan",
  "Visual profile": "Görsel profil",
  "Chart presentation": "Grafik sunumu",
  "Clean": "Sade",
  "Enhanced": "Gelişmiş",
  "Advanced": "İleri",
  "Clean keeps the chart minimal. Enhanced adds setup bar colors and a trend ribbon. Advanced uses the strongest visual emphasis while keeping the same signal rules.":
    "Sade profil grafiği minimum düzeyde tutar. Gelişmiş profil hazırlık mum renkleri ve trend şeridi ekler. İleri profil aynı sinyal kurallarını korurken en güçlü görsel vurguyu kullanır.",
  "Risk and execution": "Risk ve uygulama",
  "Confirmed candle only": "Yalnızca onaylanmış mum",
  "Cooldown bars": "Bekleme mumu",
  "Restrict to a session": "Bir seansla sınırla",
  "Session": "Seans",
  "24 hours": "24 saat",
  "US regular session": "ABD normal seansı",
  "Europe session": "Avrupa seansı",
  "Asia session": "Asya seansı",
  "Stop-loss": "Zarar durdur",
  "Take profit": "Kâr al",
  "Percent": "Yüzde",
  "Swing level": "Swing seviyesi",
  "None": "Yok",
  "Risk/reward": "Risk/ödül",
  "Opposite/reversal signal": "Karşıt/dönüş sinyali",
  "ATR multiple": "ATR çarpanı",
  "Stop percent": "Stop yüzdesi",
  "Swing lookback": "Swing geri bakışı",
  "Take-profit percent": "Kâr al yüzdesi",
  "TradingView alerts": "TradingView alarmları",
  "Dashboard": "Dashboard",
  "Bias background": "Yön eğilimi arka planı",
  "PLAIN-LANGUAGE BEHAVIOR": "AÇIK DİLDE DAVRANIŞ",
  "What this indicator will do": "Bu indikatör ne yapacak?",
  "Important:": "Önemli:",
  "This is a deterministic signal generator, not a profitability guarantee. Review every signal and test the exact output before real use.":
    "Bu deterministik bir sinyal üreticisidir; kârlılık garantisi değildir. Gerçek kullanım öncesinde her sinyali inceleyin ve üretilen sonucu test edin.",
  "Generate and inspect indicator": "İndikatörü üret ve incele",
  "DETERMINISTIC INDICATOR OUTPUT": "DETERMİNİSTİK İNDİKATÖR ÇIKTISI",
  "Copy": "Kopyala",
  "Download": "İndir",
  "indicator": "indikatör",
  "OPTIONAL · USER-SUPPLIED API KEY": "İSTEĞE BAĞLI · KULLANICI API ANAHTARI",
  "AI can fill the deterministic indicator form": "AI deterministik indikatör formunu doldurabilir",
  "AI does not directly own the Pine output. It interprets a plain-language request into the same visible configuration used by the guided builder. Review every selected value before generation.":
    "AI, Pine çıktısını doğrudan yönetmez. Açık dille yazılmış isteği, rehberli oluşturucunun kullandığı aynı görünür yapılandırmaya dönüştürür. Üretimden önce seçilen her değeri inceleyin.",
  "Example: Build a selective 15-minute long/short indicator using 4H bias, VWAP, volume and confirmed candles.":
    "Örnek: 4 saatlik yön eğilimi, VWAP, hacim ve onaylanmış mumlar kullanan seçici bir 15 dakikalık long/short indikatörü oluştur.",
  "Analyzing…": "Analiz ediliyor…",
  "Analyze request": "İsteği analiz et",
  "Designed by": "Designed by",
  "X profile": "X profili",
  "GitHub repository": "GitHub deposu",
  "Not investment advice.": "Yatırım tavsiyesi değildir.",
  "The signals, analyses and information in this application are provided for educational and research purposes only. They are not guaranteed to be accurate, complete, current or profitable, and may be misleading. Trading involves risk; you are solely responsible for your decisions.":
    "Bu uygulamadaki sinyaller, analizler ve bilgiler yalnızca eğitim ve araştırma amaçlıdır. Doğruluk, eksiksizlik, güncellik veya kârlılık garantisi vermez; yanıltıcı olabilir. İşlem yapmak risk içerir ve kararlarınızdan yalnızca siz sorumlusunuz."
};

const presetNames: Record<string, string> = {
  "Kohen Dive Adaptive": "Kohen Dive Adaptive",
  "VWAP Reclaim": "VWAP Geri Kazanımı",
  "Balanced Intraday": "Dengeli Gün İçi",
  "Long-Term Trend Guard": "Uzun Vadeli Trend Koruması",
  "Selective Multi-Timeframe": "Seçici Çoklu Zaman Dilimi",
  "Breakout Momentum": "Kırılım Momentumu",
  "Supertrend Volume": "Supertrend Hacim",
  "Fast EMA Scalper": "Hızlı EMA Scalper",
  "Swing Structure Trend": "Swing Yapı Trendi"
};

export const uiText = (language: UiLanguage, text: string): string =>
  language === "tr" ? turkish[text] ?? text : text;

export const presetDisplayName = (language: UiLanguage, name: string): string =>
  language === "tr" ? presetNames[name] ?? uiText(language, name) : name;

export const directionDisplayName = (
  language: UiLanguage,
  direction: StrategyConfig["direction"]
): string => {
  const english = direction === "long_short"
    ? "Long + Short"
    : direction === "long_only"
      ? "Long only"
      : "Spot buy + exit";
  return uiText(language, english);
};

export const timeframeDisplayName = (language: UiLanguage, value: string): string => {
  if (language === "tr") {
    if (value === "D") return "1 gün";
    if (value === "W") return "1 hafta";
    if (value === "M") return "1 ay";
    const number = Number(value);
    return number >= 60 ? `${number / 60} saat` : `${number} dakika`;
  }

  if (value === "D") return "1 day";
  if (value === "W") return "1 week";
  if (value === "M") return "1 month";
  const number = Number(value);
  return number >= 60 ? `${number / 60} hour${number > 60 ? "s" : ""}` : `${number} minutes`;
};
