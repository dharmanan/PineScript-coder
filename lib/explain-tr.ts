import { buildBehaviorPlan } from "./behavior-plan";
import { buildVisualPlan } from "./visual-plan";
import type { StrategyConfig } from "./types";

const VALIDATED_BNB_PROFILE = "bnb_30m_ema_confirmed_regular_divergence_v1";
const KOHEN_DIVE_ADAPTIVE_PROFILE = "kohen_dive_adaptive_v1";

const styleLabels: Record<StrategyConfig["style"], string> = {
  scalp: "çok kısa vadeli scalp işlemleri",
  intraday: "gün içi işlemler",
  swing: "swing işlemleri",
  spot: "spot işlemler",
  long_term: "uzun vadeli trend takibi"
};

const timeframeLabel = (value: string): string => {
  if (value === "D") return "günlük";
  if (value === "W") return "haftalık";
  if (value === "M") return "aylık";
  const minutes = Number(value);
  return minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} saatlik`
    : `${minutes} dakikalık`;
};

const triggerLabel = (c: StrategyConfig): string => {
  switch (c.entryTrigger) {
    case "ema_cross": return "hızlı EMA yavaş EMA'yı kestiğinde";
    case "pullback_reclaim": return "fiyat geri çekilme sonrasında hızlı EMA'yı geri kazandığında";
    case "vwap_reclaim": return "fiyat VWAP'ı geri kazandığında";
    case "supertrend_flip": return "Supertrend yön değiştirdiğinde";
    case "breakout": return `fiyat önceki ${c.trend.breakoutLength} mumun tepe veya dip seviyesini kırdığında`;
    case "trend_state":
    default: return "seçilen tüm koşullar geçerli kalırken";
  }
};

const filterLabels = (c: StrategyConfig): string[] => {
  const labels: string[] = [];
  if (c.trend.emaEnabled) labels.push(`EMA ${c.trend.emaFast}/${c.trend.emaSlow} trendi`);
  if (c.trend.longMaEnabled) labels.push(`fiyatın ${c.trend.longMaType.toUpperCase()} ${c.trend.longMaLength}'e göre konumu`);
  if (c.trend.vwapEnabled) labels.push("fiyatın VWAP'a göre konumu");
  if (c.trend.supertrendEnabled) labels.push("Supertrend yönü");
  if (c.momentum.rsiEnabled) labels.push(`RSI ${c.momentum.rsiLength} eşikleri ${c.momentum.rsiLong}/${c.momentum.rsiShort}`);
  if (c.momentum.macdEnabled) labels.push("MACD yönü ve histogramı");
  if (c.momentum.adxEnabled) labels.push(`en az ${c.momentum.adxThreshold} ADX ve yön onayı`);
  if (c.momentum.divergenceEnabled) labels.push(`${c.momentum.divergencePivot} mumluk pivotlarla onaylanmış RSI uyumsuzluğu`);
  if (c.volume.enabled) labels.push(`hacmin ${c.volume.averageLength} mumluk ortalamasının en az ${c.volume.multiplier} katı olması`);
  if (c.biasSource !== "swing_structure" && c.higherTimeframe.enabled && c.higherTimeframe.blockCounterTrend) {
    labels.push("üst zaman dilimi yön eğilimi");
  }
  if (c.execution.sessionEnabled) {
    labels.push(/^0000-(2359|2400)$/.test(c.execution.session)
      ? "varsayılan olarak günün tamamını kapsayan işlem seansı"
      : `borsa saatine göre ${c.execution.session} seansı`);
  }
  return labels;
};

const spotExitLabel = (mode: StrategyConfig["spotExitMode"]): string => {
  switch (mode) {
    case "trend_break": return "fiyat uzun hareketli ortalamanın altına indiğinde";
    case "ema_cross": return "hızlı EMA yavaş EMA'nın altına indiğinde";
    case "rsi_overbought": return "RSI seçilen çıkış seviyesinin altına geri düştüğünde";
    case "htf_bearish": return "üst zaman dilimi yön eğilimi ayıya döndüğünde";
    case "combined": return "yapılandırılmış trend, EMA, RSI veya üst zaman dilimi dönüş olaylarından biri oluştuğunda";
  }
};

const riskLabels = (c: StrategyConfig): string[] => {
  const labels: string[] = [];
  switch (c.risk.stopMode) {
    case "atr": labels.push(`${c.risk.atrMultiple} ATR stop`); break;
    case "percent": labels.push(`%${c.risk.stopPercent} stop`); break;
    case "swing": labels.push(`${c.risk.swingLength} mumluk swing stop`); break;
  }
  switch (c.risk.takeProfitMode) {
    case "risk_reward": labels.push(`${c.risk.riskReward}:1 risk/ödül hedefi`); break;
    case "percent": labels.push(`%${c.risk.takeProfitPercent} hedef`); break;
    case "opposite_signal": labels.push("yapılandırılmış karşıt sinyalde çıkış"); break;
  }
  return labels;
};

export function explainConfigTr(c: StrategyConfig): string[] {
  if (c.researchProfile === KOHEN_DIVE_ADAPTIVE_PROFILE) {
    return [
      "Kohen Dive Adaptive, 4 saatlik grafik için hazırlanmış bir baskı indikatörüdür. Varsayılan ayarı Active 4H sinyal profilidir.",
      "Basitçe: Alış veya satış baskısının yeniden güçlenmesini bekler. Tek başına bir RSI uyumsuzluğu al ya da sat sinyali oluşturmaz.",
      "Fiyat hâlâ güçlü bir karşı trendle mücadele ediyorsa dönüş sinyali vermez; önce piyasanın toparlandığını gösteren bir işaret arar. Böylece erken dönüş tahminlerini azaltmaya çalışır.",
      "Active 4H, trend yönündeki geri çekilme bittikten sonra da sinyal verebilir. Bunun için RSI, EMA veya baskı göstergesinden en az birinin yeniden iyileşmesi gerekir. Daha seçici sürüm olan Strict 4H da ayarlarda kalır.",
      "Karşıt sinyalde otomatik yön değiştirme varsayılan olarak kapalıdır. Diğer yöndeki zayıf bir sinyal, açık risk rehberini kendiliğinden kapatmaz veya tersine çevirmez. Onaylanan sinyal bir sonraki mum açılışını, ATR 14 × 1.75 riski ve 1.75R hedefi kullanır.",
      "Dashboard sonuçları anlaşılır biçimde ayırır: long/short ile devam/dönüş sinyallerinin kazanç ve kayıpları; ayrıca net R, kâr faktörü, en yüksek düşüş ve filtrenin atladığı ham dönüş sayısı."
    ];
  }

  if (c.researchProfile === VALIDATED_BNB_PROFILE) {
    const lines = [
      "Bu dar kapsamlı araştırma preseti yalnızca BINANCE:BNBUSDT'nin 30 dakikalık grafiği içindir. Başka sembol veya zaman diliminde sinyal vermez.",
      "Önce normal RSI uyumsuzluğunu arar, sonra EMA 9 / WMA 45 kesişiminin aynı yönü onaylamasını bekler. Yani uyumsuzluk dikkat çeker; kesişim son onayı verir.",
      "Yalnızca büyük trend yönünde işlem arar: long için EMA 50 ve fiyat EMA 200'ün üzerinde olmalı; short için tersi geçerlidir. Hacim de 20 mumluk ortalamasının en az 0.8 katı olmalıdır.",
      "Sinyaller yalnızca mum kapandığında kesinleşir. Her sinyal, sabit 15 mumluk swing stop ve 1.8:1 risk/ödül hedefi kullanır."
    ];
    lines.push(c.outputMode === "indicator"
      ? "İndikatör bu seviyeleri görsel rehber olarak çizer; Strategy Tester emri göndermez."
      : "Strategy Tester emirleri aynı stop ve hedefi kullanır.");
    lines.push("Long ve short sinyalleri için TradingView alarm koşulları eklenmiştir. Bu test edilmiş bir araştırma profilidir; evrensel öneri veya kâr garantisi değildir.");
    return lines;
  }

  const plan = buildBehaviorPlan(c);
  const visual = buildVisualPlan(c);
  const lines: string[] = [];
  const direction = plan.mode === "long_short"
    ? "long ve short"
    : plan.mode === "long_only"
      ? "yalnızca long"
      : "spot alım ve çıkış";

  lines.push(`Bu kod ${styleLabels[c.style]} için tasarlanmıştır ve ${timeframeLabel(plan.chartTimeframe)} grafikte ${direction} sinyalleri üretir.`);

  if (c.tradesPerMonth !== undefined) {
    lines.push(c.tradesPerMonth < 4
      ? `Sembol başına ayda yaklaşık ${c.tradesPerMonth} sinyal beklenir. Bu preset bilinçli olarak seçicidir; bir haftalık sessizlik normaldir.`
      : `Sembol başına ayda yaklaşık ${c.tradesPerMonth} sinyal beklenir.`);
  }

  lines.push(c.execution.enforceChartTimeframe
    ? `${timeframeLabel(plan.chartTimeframe)} grafiği kullanın. Başka bir zaman diliminde sinyal üretmez.`
    : `Her zaman diliminde çalışır; ancak önerilen görünüm ${timeframeLabel(plan.chartTimeframe)} grafiğidir.`);
  lines.push(`Sinyal, ${triggerLabel(c)} oluştuğunda gelebilir. Aşağıdaki diğer kontrollerin de aynı anda uygun olması gerekir.`);

  const filters = filterLabels(c);
  if (filters.length) lines.push(`Sinyal göstermeden önce şunları kontrol eder: ${filters.join(", ")}.`);

  const blocking = plan.mode === "long_short"
    ? "Ayı yön eğilimi long sinyalleri, boğa yön eğilimi short sinyalleri engeller."
    : "Ayı yön eğilimi long veya alım sinyallerini engeller.";

  if (c.biasSource === "swing_structure") {
    lines.push(
      `Yön için üst zaman dilimi ortalaması yerine onaylanmış swing yapısını izler. Daha yüksek tepe ve dipler boğa, daha düşük tepe ve dipler ayı kabul edilir. ` +
      `Bir swing ancak sonraki ${c.swingLookback} mum kapandıktan sonra onaylanır. ${blocking}`
    );
  }

  if (plan.higherTimeframe) {
    const candle = plan.higherTimeframe.closedBarOnly
      ? "son kapanmış üst zaman dilimi mumunu"
      : "oluşmakta olan üst zaman dilimi mumunu";
    const note = plan.higherTimeframe.blocksCounterTrend
      ? blocking
      : c.biasSource === "swing_structure"
        ? "Yalnızca bağlam için gösterilir; izin verilen yönü swing yapısı belirler."
        : "Yön eğilimi bağlam için gösterilir ve girişleri engellemez.";
    lines.push(`Yönü anlamak için ${timeframeLabel(plan.higherTimeframe.timeframe)} grafikte ${plan.higherTimeframe.method.toUpperCase()} ${plan.higherTimeframe.length} ve ${candle} kullanır. ${note}`);
  }

  if (plan.spotExit) lines.push(`Spot kullanımda ${spotExitLabel(plan.spotExit.mode)} çıkış sinyali verir. Kod hiçbir zaman short giriş oluşturmaz.`);
  if (plan.execution.confirmedBarsOnly || plan.execution.cooldownBars > 0) {
    const timing = [
      plan.execution.confirmedBarsOnly ? "Sinyaller yalnızca mum kapandıktan sonra kesinleşir" : null,
      plan.execution.cooldownBars > 0 ? `ardından aynı türde yeni giriş için ${plan.execution.cooldownBars} mum bekler` : null
    ].filter((value): value is string => Boolean(value));
    lines.push(`${timing.join(" ve ")}.`);
  }
  if (plan.execution.session) {
    lines.push(/^0000-(2359|2400)$/.test(plan.execution.session)
      ? "Şu anda günün tamamında sinyal arayabilir."
      : `Yalnızca borsa saatine göre ${plan.execution.session} seansında sinyal arar.`);
  }

  if (plan.risk.enabled) {
    const labels = riskLabels(c);
    if (plan.risk.visualOnly) {
      lines.push(`${labels.join(" ve ")} seviyelerini görsel rehber olarak çizer; Strategy Tester emri göndermez. Bir mum iki seviyeye de değerse sonucu belirsiz olarak işaretler.`);
    } else {
      lines.push(`Strategy Tester emirleri ${labels.join(" ve ")} kullanır.`);
    }
  } else if (plan.output === "indicator") {
    lines.push("İndikatör modu sinyal ve alarm üretir, ancak Strategy Tester emri göndermez.");
  }

  const profile = visual.profile === "clean" ? "Sade" : visual.profile === "enhanced" ? "Gelişmiş" : "İleri";
  lines.push(`${profile}, varsayılan grafik görünümüdür. Renkleri veya trend şeridini değiştirmek sinyalleri değiştirmez.`);

  if (plan.entry.trigger.plotsBreakoutLevels) lines.push("Her sinyalin görsel olarak doğrulanabilmesi için önceki kırılım tepe ve dip seviyeleri grafikte çizilir.");
  if (plan.execution.alertsEnabled) lines.push("Üretilen her sinyal için TradingView alarm koşulları eklenmiştir.");
  return lines;
}
