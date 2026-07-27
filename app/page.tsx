"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { compilePine } from "@/lib/compiler";
import { defaultConfig } from "@/lib/defaults";
import { explainConfig } from "@/lib/explain";
import { orderPresetsForDisplay } from "@/lib/preset-display-order";
import { presets } from "@/lib/presets";
import { toPublicIndicatorConfig } from "@/lib/public-indicator-config";
import {
  directionDisplayName,
  presetDisplayName,
  readUiLanguageCookie,
  resolveUiLanguage,
  serializeUiLanguageCookie,
  timeframeDisplayName,
  UI_LANGUAGE_STORAGE_KEY,
  uiText
} from "@/lib/ui-i18n";
import { applyVisualProfile } from "@/lib/visual-profile-config";
import type { StrategyConfig, VisualProfile } from "@/lib/types";
import type { UiLanguage } from "@/lib/ui-i18n";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const timeframeOptions = ["1", "3", "5", "15", "30", "45", "60", "120", "240", "D", "W", "M"];
const maLengths = [5, 8, 9, 10, 12, 14, 20, 21, 25, 34, 50, 55, 89, 100, 144, 200];
const rsiLengths = [5, 7, 9, 14, 21, 28];
const rsiLevels = [30, 35, 40, 45, 48, 50, 52, 55, 60, 65, 70];
const averageLengths = [5, 10, 14, 20, 30, 50, 100];
const multipliers = [0.8, 1, 1.1, 1.2, 1.25, 1.5, 2];
const cooldowns = [0, 1, 2, 3, 5, 8, 10, 15, 20];
const atrMultiples = [1, 1.25, 1.5, 2, 2.5, 3, 4];
const percentages = [0.5, 1, 1.5, 2, 3, 5, 8, 10];
const riskRewards = [1, 1.5, 2, 2.5, 3, 4, 5];
const pivotLengths = [2, 3, 5, 7, 10];
const breakoutLengths = [10, 14, 20, 30, 50, 100];
const displayPresets = orderPresetsForDisplay(presets);
const UiLanguageContext = createContext<UiLanguage>("en");

export default function Home() {
  const [language, setLanguage] = useState<UiLanguage>("en");
  const [config, setConfig] = useState<StrategyConfig>(toPublicIndicatorConfig(clone(defaultConfig)));
  const [selectedPreset, setSelectedPreset] = useState<string>("Custom configuration");
  const [tab, setTab] = useState<"builder" | "code" | "ai">("builder");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const publicConfig = useMemo(() => toPublicIndicatorConfig(config), [config]);
  const code = useMemo(() => compilePine(publicConfig), [publicConfig]);
  const explanation = useMemo(() => explainConfig(publicConfig, language), [publicConfig, language]);
  const selectedPresetDisplay = presetDisplayName(language, selectedPreset);
  const t = (text: string) => uiText(language, text);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    const cookieLanguage = readUiLanguageCookie(document.cookie);
    setLanguage(resolveUiLanguage(cookieLanguage, storedLanguage, window.navigator.languages));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const chooseLanguage = (nextLanguage: UiLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
    document.cookie = serializeUiLanguageCookie(nextLanguage);
  };

  const setNested = (section: keyof StrategyConfig, key: string, value: unknown) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => toPublicIndicatorConfig({
      ...current,
      [section]: typeof current[section] === "object" ? { ...(current[section] as object), [key]: value } : value
    } as StrategyConfig));
  };

  const setTop = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => toPublicIndicatorConfig({ ...current, [key]: value }));
  };

  const choosePreset = (preset: StrategyConfig) => {
    setConfig(toPublicIndicatorConfig(clone(preset)));
    setSelectedPreset(preset.name);
  };

  const applySensitivity = (value: StrategyConfig["sensitivity"]) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => toPublicIndicatorConfig({
      ...current,
      sensitivity: value,
      execution: { ...current.execution, cooldownBars: value === "frequent" ? 2 : value === "balanced" ? 5 : 10 },
      volume: { ...current.volume, multiplier: value === "frequent" ? 1 : value === "balanced" ? 1.1 : 1.25 },
      momentum: { ...current.momentum, adxThreshold: value === "frequent" ? 15 : value === "balanced" ? 20 : 25 }
    }));
  };

  const chooseVisualProfile = (profile: VisualProfile) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => toPublicIndicatorConfig(applyVisualProfile(current, profile)));
  };

  // Picking a profile is not editing the preset: both settings were measured together and
  // both are compiled in, so this only decides which one the script opens with. The preset
  // stays selected, unlike every other control here.
  const chooseTradeProfile = (profile: StrategyConfig["activeProfile"]) => {
    setConfig((current) => toPublicIndicatorConfig({ ...current, activeProfile: profile }));
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${publicConfig.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pine`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const askAI = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch("/api/ai-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, language }) });
      setAiResult(await response.json());
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <UiLanguageContext.Provider value={language}>
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">{t("OPEN SOURCE · DETERMINISTIC · PINE SCRIPT v6")}</span>
          <h1>Kohen Pine Studio</h1>
          <p>{t("Choose how you trade, inspect the exact behavior in plain language, and generate editable Pine Script indicators without hidden AI decisions.")}</p>
        </div>
        <div className="hero-actions">
          <div className="language-switch" role="group" aria-label={t("Language")}>
            <button className={language === "tr" ? "active" : ""} aria-pressed={language === "tr"} onClick={() => chooseLanguage("tr")}>TR</button>
            <button className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>EN</button>
          </div>
          <div className="social-links" aria-label="Social links">
            <a href="https://x.com/KohenEric" target="_blank" rel="noreferrer" aria-label={t("X profile")} title={t("X profile")}>
              <XIcon />
            </a>
            <a href="https://github.com/dharmanan/PineScript-coder" target="_blank" rel="noreferrer" aria-label={t("GitHub repository")} title={t("GitHub repository")}>
              <GitHubIcon />
            </a>
          </div>
          <button onClick={() => navigator.clipboard.writeText(code)}>{t("Copy Pine")}</button>
          <button className="primary" onClick={download}>{t("Download .pine")}</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>{t("Guided Builder")}</button>
        <button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")}>{t("Generated Script")}</button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>{t("Optional AI Planner")}</button>
      </nav>

      {tab === "builder" && (
        <div className="workspace">
          <section className="panel controls">
            <div className="selected-strip"><span>{t("Selected preset")}</span><strong>{selectedPresetDisplay}</strong><span>{t("Indicator")} · {directionDisplayName(language, publicConfig.direction)} · {publicConfig.chartTimeframe}</span></div>
            <h2>{t("Start from a complete indicator")}</h2>
            <div className="preset-grid">
              {displayPresets.map((p) => <button className={selectedPreset === p.name ? "selected" : ""} key={p.name} onClick={() => choosePreset(p)}>{selectedPreset === p.name ? "✓ " : ""}{presetDisplayName(language, p.name)}</button>)}
            </div>

            {publicConfig.winRateProfile && (
              <div className="profile-choice">
                <SelectField
                  label="Profile"
                  value={publicConfig.activeProfile ?? "win_rate"}
                  onChange={(v) => chooseTradeProfile(v as StrategyConfig["activeProfile"])}
                  options={[["money", "Money — fewer, larger wins"], ["win_rate", "Win rate — more, smaller wins"]]}
                />
                <p className="notice">
                  {t("Both settings were measured on the same data and both are compiled into the script. This picks the one it opens with; the other stays one dropdown away in the indicator's own settings, alongside a Custom option that hands every input back to you.")}
                </p>
              </div>
            )}

            <Field label="Script name"><input value={publicConfig.name} onChange={(e) => setTop("name", e.target.value)} /></Field>
            <div className="two">
              <SelectField label="Trading style" value={publicConfig.style} onChange={(v) => setTop("style", v as any)} options={[["scalp", "Scalp"], ["intraday", "Intraday"], ["swing", "Swing"], ["spot", "Spot"], ["long_term", "Long term"]]} />
              <SelectField label="Direction" value={publicConfig.direction} onChange={(v) => setTop("direction", v as any)} options={[["long_short", "Long + Short"], ["long_only", "Long only"], ["spot_buy_exit", "Spot buy + exit"]]} />
              <SelectField label="Chart timeframe" value={publicConfig.chartTimeframe} onChange={(v) => setTop("chartTimeframe", v)} options={timeframeOptions.map((v) => [v, timeframeDisplayName(language, v)])} />
              <SelectField label="Signal frequency" value={publicConfig.sensitivity} onChange={(v) => applySensitivity(v as any)} options={[["frequent", "More frequent"], ["balanced", "Balanced"], ["selective", "More selective"]]} />
              <SelectField label="Entry trigger" value={publicConfig.entryTrigger} onChange={(v) => setTop("entryTrigger", v as any)} options={[["trend_state", "Conditions remain valid"], ["ema_cross", "EMA crossover"], ["pullback_reclaim", "Fast EMA reclaim"], ["vwap_reclaim", "VWAP reclaim"], ["supertrend_flip", "Supertrend flip"], ["breakout", "Recent high/low breakout"]]} />
            </div>
            <p className="notice"><strong>{t("Indicator only:")}</strong> {t("Kohen Pine Studio generates chart signals, visual risk levels, dashboards and alerts. It does not generate Strategy Tester orders.")}</p>

            {publicConfig.direction === "spot_buy_exit" && (
              <SelectField label="Spot exit logic" value={publicConfig.spotExitMode} onChange={(v) => setTop("spotExitMode", v as any)} options={[["combined", "Combined reversal events"], ["trend_break", "Break below long MA"], ["ema_cross", "Bearish EMA crossover"], ["rsi_overbought", "RSI leaves overbought zone"], ["htf_bearish", "Higher timeframe turns bearish"]]} />
            )}

            <Group title="Higher-timeframe bias">
              <Check label="Use higher-timeframe bias" checked={publicConfig.higherTimeframe.enabled} onChange={(v) => setNested("higherTimeframe", "enabled", v)} />
              {publicConfig.higherTimeframe.enabled && <>
                <div className="three">
                  <SelectField label="Timeframe" value={publicConfig.higherTimeframe.timeframe} onChange={(v) => setNested("higherTimeframe", "timeframe", v)} options={timeframeOptions.map((v) => [v, timeframeDisplayName(language, v)])} />
                  <SelectField label="Method" value={publicConfig.higherTimeframe.method} onChange={(v) => setNested("higherTimeframe", "method", v)} options={[["ema", "EMA"], ["sma", "SMA"], ["supertrend", "Supertrend"]]} />
                  <NumberSelect label="Length" value={publicConfig.higherTimeframe.length} onChange={(v) => setNested("higherTimeframe", "length", v)} options={maLengths} />
                </div>
                <Check label="Use only the last closed higher-timeframe candle" checked={publicConfig.higherTimeframe.closedBarOnly} onChange={(v) => setNested("higherTimeframe", "closedBarOnly", v)} />
                <Check label="Block counter-trend signals" checked={publicConfig.higherTimeframe.blockCounterTrend} onChange={(v) => setNested("higherTimeframe", "blockCounterTrend", v)} />
              </>}
            </Group>

            <Group title="Trend filters">
              <Check label="EMA trend" checked={publicConfig.trend.emaEnabled} onChange={(v) => setNested("trend", "emaEnabled", v)} />
              {(publicConfig.trend.emaEnabled || ["ema_cross", "pullback_reclaim"].includes(publicConfig.entryTrigger) || publicConfig.spotExitMode === "ema_cross" || publicConfig.spotExitMode === "combined") && <div className="two"><NumberSelect label="Fast EMA" value={publicConfig.trend.emaFast} onChange={(v) => setNested("trend", "emaFast", v)} options={maLengths} /><NumberSelect label="Slow EMA" value={publicConfig.trend.emaSlow} onChange={(v) => setNested("trend", "emaSlow", v)} options={maLengths} /></div>}
              <Check label="Long moving average" checked={publicConfig.trend.longMaEnabled} onChange={(v) => setNested("trend", "longMaEnabled", v)} />
              {(publicConfig.trend.longMaEnabled || publicConfig.spotExitMode === "trend_break" || publicConfig.spotExitMode === "combined") && <div className="two"><SelectField label="MA type" value={publicConfig.trend.longMaType} onChange={(v) => setNested("trend", "longMaType", v)} options={[["sma", "SMA"], ["ema", "EMA"]]} /><NumberSelect label="Length" value={publicConfig.trend.longMaLength} onChange={(v) => setNested("trend", "longMaLength", v)} options={maLengths} /></div>}
              <Check label="VWAP" checked={publicConfig.trend.vwapEnabled} onChange={(v) => setNested("trend", "vwapEnabled", v)} />
              <Check label="Supertrend" checked={publicConfig.trend.supertrendEnabled} onChange={(v) => setNested("trend", "supertrendEnabled", v)} />
              {(publicConfig.trend.supertrendEnabled || publicConfig.entryTrigger === "supertrend_flip" || publicConfig.higherTimeframe.method === "supertrend") && <div className="two"><NumberSelect label="ATR length" value={publicConfig.trend.supertrendAtrLength} onChange={(v) => setNested("trend", "supertrendAtrLength", v)} options={[5, 7, 10, 14, 20]} /><NumberSelect label="Factor" value={publicConfig.trend.supertrendFactor} onChange={(v) => setNested("trend", "supertrendFactor", v)} options={[1, 1.5, 2, 2.5, 3, 4, 5]} /></div>}
              {publicConfig.entryTrigger === "breakout" && <NumberSelect label="Breakout lookback" value={publicConfig.trend.breakoutLength} onChange={(v) => setNested("trend", "breakoutLength", v)} options={breakoutLengths} />}
            </Group>

            <Group title="Momentum, volume and divergence">
              <Check label="RSI confirmation" checked={publicConfig.momentum.rsiEnabled} onChange={(v) => setNested("momentum", "rsiEnabled", v)} />
              {(publicConfig.momentum.rsiEnabled || publicConfig.momentum.divergenceEnabled || publicConfig.direction === "spot_buy_exit") && <div className={publicConfig.direction === "long_short" ? "three" : "two"}>
                <NumberSelect label="RSI length" value={publicConfig.momentum.rsiLength} onChange={(v) => setNested("momentum", "rsiLength", v)} options={rsiLengths} />
                <NumberSelect label={publicConfig.direction === "spot_buy_exit" ? "Buy RSI ≥" : "Long RSI ≥"} value={publicConfig.momentum.rsiLong} onChange={(v) => setNested("momentum", "rsiLong", v)} options={rsiLevels} />
                {publicConfig.direction === "long_short" && <NumberSelect label="Short RSI ≤" value={publicConfig.momentum.rsiShort} onChange={(v) => setNested("momentum", "rsiShort", v)} options={rsiLevels} />}
                {publicConfig.direction === "spot_buy_exit" && ["combined", "rsi_overbought"].includes(publicConfig.spotExitMode) && <NumberSelect label="Exit RSI" value={publicConfig.momentum.rsiExit} onChange={(v) => setNested("momentum", "rsiExit", v)} options={rsiLevels} />}
              </div>}
              <Check label="MACD confirmation" checked={publicConfig.momentum.macdEnabled} onChange={(v) => setNested("momentum", "macdEnabled", v)} />
              <Check label="ADX trend strength" checked={publicConfig.momentum.adxEnabled} onChange={(v) => setNested("momentum", "adxEnabled", v)} />
              {publicConfig.momentum.adxEnabled && <div className="two"><NumberSelect label="ADX length" value={publicConfig.momentum.adxLength} onChange={(v) => setNested("momentum", "adxLength", v)} options={[7, 10, 14, 20, 28]} /><NumberSelect label="Minimum ADX" value={publicConfig.momentum.adxThreshold} onChange={(v) => setNested("momentum", "adxThreshold", v)} options={[15, 18, 20, 22, 25, 30, 35]} /></div>}
              <Check label="Confirmed RSI divergence" checked={publicConfig.momentum.divergenceEnabled} onChange={(v) => setNested("momentum", "divergenceEnabled", v)} />
              {publicConfig.momentum.divergenceEnabled && <NumberSelect label="Pivot strength" value={publicConfig.momentum.divergencePivot} onChange={(v) => setNested("momentum", "divergencePivot", v)} options={pivotLengths} />}
              <Check label="Volume confirmation" checked={publicConfig.volume.enabled} onChange={(v) => setNested("volume", "enabled", v)} />
              {publicConfig.volume.enabled && <div className="two"><NumberSelect label="Volume average" value={publicConfig.volume.averageLength} onChange={(v) => setNested("volume", "averageLength", v)} options={averageLengths} /><NumberSelect label="Minimum multiplier" value={publicConfig.volume.multiplier} onChange={(v) => setNested("volume", "multiplier", v)} options={multipliers} /></div>}
            </Group>

            <Group title="Visual profile">
              <SelectField label="Chart presentation" value={publicConfig.visual.profile} onChange={(v) => chooseVisualProfile(v as VisualProfile)} options={[["clean", "Clean"], ["enhanced", "Enhanced"], ["advanced", "Advanced"]]} />
              <p className="notice">{t("Clean keeps the chart minimal. Enhanced adds setup bar colors and a trend ribbon. Advanced uses the strongest visual emphasis while keeping the same signal rules.")}</p>
            </Group>

            <Group title="Risk and execution">
              <Check label="Confirmed candle only" checked={publicConfig.confirmedBarsOnly} onChange={(v) => setTop("confirmedBarsOnly", v)} />
              <NumberSelect label="Cooldown bars" value={publicConfig.execution.cooldownBars} onChange={(v) => setNested("execution", "cooldownBars", v)} options={cooldowns} />
              <Check label="Restrict to a session" checked={publicConfig.execution.sessionEnabled} onChange={(v) => setNested("execution", "sessionEnabled", v)} />
              {publicConfig.execution.sessionEnabled && <SelectField label="Session" value={publicConfig.execution.session} onChange={(v) => setNested("execution", "session", v)} options={[["0000-2359", "24 hours"], ["0930-1600", "US regular session"], ["0800-1700", "Europe session"], ["0000-0800", "Asia session"], ["0900-1700", "09:00–17:00"]]} />}
              <div className="two"><SelectField label="Stop-loss" value={publicConfig.risk.stopMode} onChange={(v) => setNested("risk", "stopMode", v)} options={[["atr", "ATR"], ["percent", "Percent"], ["swing", "Swing level"], ["none", "None"]]} /><SelectField label="Take profit" value={publicConfig.risk.takeProfitMode} onChange={(v) => setNested("risk", "takeProfitMode", v)} options={[["risk_reward", "Risk/reward"], ["percent", "Percent"], ["opposite_signal", "Opposite/reversal signal"], ["none", "None"]]} /></div>
              {publicConfig.risk.stopMode === "atr" && <div className="two"><NumberSelect label="ATR length" value={publicConfig.risk.atrLength} onChange={(v) => setNested("risk", "atrLength", v)} options={[7, 10, 14, 20, 28]} /><NumberSelect label="ATR multiple" value={publicConfig.risk.atrMultiple} onChange={(v) => setNested("risk", "atrMultiple", v)} options={atrMultiples} /></div>}
              {publicConfig.risk.stopMode === "percent" && <NumberSelect label="Stop percent" value={publicConfig.risk.stopPercent} onChange={(v) => setNested("risk", "stopPercent", v)} options={percentages} />}
              {publicConfig.risk.stopMode === "swing" && <NumberSelect label="Swing lookback" value={publicConfig.risk.swingLength} onChange={(v) => setNested("risk", "swingLength", v)} options={[5, 10, 14, 20, 30, 50]} />}
              {publicConfig.risk.takeProfitMode === "risk_reward" && <NumberSelect label="Risk/reward" value={publicConfig.risk.riskReward} onChange={(v) => setNested("risk", "riskReward", v)} options={riskRewards} />}
              {publicConfig.risk.takeProfitMode === "percent" && <NumberSelect label="Take-profit percent" value={publicConfig.risk.takeProfitPercent} onChange={(v) => setNested("risk", "takeProfitPercent", v)} options={percentages} />}
              <Check label="TradingView alerts" checked={publicConfig.execution.alertsEnabled} onChange={(v) => setNested("execution", "alertsEnabled", v)} />
              <Check label="Dashboard" checked={publicConfig.execution.showDashboard} onChange={(v) => setNested("execution", "showDashboard", v)} />
              <Check label="Bias background" checked={publicConfig.execution.showBackground} onChange={(v) => setNested("execution", "showBackground", v)} />
            </Group>
          </section>

          <aside className="panel summary sticky">
            <span className="eyebrow">{t("PLAIN-LANGUAGE BEHAVIOR")}</span>
            <h2>{t("What this indicator will do")}</h2>
            <div className="summary-badge">{selectedPresetDisplay}</div>
            {explanation.map((line) => <p key={line}>{line}</p>)}
            <div className="notice"><strong>{t("Important:")}</strong> {t("This is a deterministic signal generator, not a profitability guarantee. Review every signal and test the exact output before real use.")}</div>
            <button className="primary wide" onClick={() => setTab("code")}>{t("Generate and inspect indicator")}</button>
          </aside>
        </div>
      )}

      {tab === "code" && <section className="panel"><div className="code-head"><div><span className="eyebrow">{t("DETERMINISTIC INDICATOR OUTPUT")}</span><h2>{publicConfig.name}</h2><p>{selectedPresetDisplay} · {directionDisplayName(language, publicConfig.direction)} · {t("indicator")}</p></div><div><button onClick={() => navigator.clipboard.writeText(code)}>{t("Copy")}</button><button className="primary" onClick={download}>{t("Download")}</button></div></div><pre>{code}</pre></section>}

      {tab === "ai" && <section className="panel ai-panel"><span className="eyebrow">{t("OPTIONAL · USER-SUPPLIED API KEY")}</span><h2>{t("AI can fill the deterministic indicator form")}</h2><p>{t("AI does not directly own the Pine output. It interprets a plain-language request into the same visible configuration used by the guided builder. Review every selected value before generation.")}</p><textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={t("Example: Build a selective 15-minute long/short indicator using 4H bias, VWAP, volume and confirmed candles.")} /><button className="primary" disabled={!aiPrompt || aiLoading} onClick={askAI}>{t(aiLoading ? "Analyzing…" : "Analyze request")}</button>{aiResult && <pre>{JSON.stringify(aiResult, null, 2)}</pre>}</section>}

      <footer className="site-footer">
        <div className="footer-credit">
          <span>{t("Designed by")}</span>
          <a href="https://koraycifci.com/" target="_blank" rel="noreferrer" aria-label="Koray Cifci" title="Koray Cifci">
            <img src="/brand/koray-cifci.png" alt="Koray Cifci" />
          </a>
        </div>
        <p className="financial-disclaimer"><strong>{t("Not investment advice.")}</strong> {t("The signals, analyses and information in this application are provided for educational and research purposes only. They are not guaranteed to be accurate, complete, current or profitable, and may be misleading. Trading involves risk; you are solely responsible for your decisions.")}</p>
      </footer>
    </main>
    </UiLanguageContext.Provider>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) { const language = useContext(UiLanguageContext); return <section className="group"><h3>{uiText(language, title)}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { const language = useContext(UiLanguageContext); return <label className="field"><span>{uiText(language, label)}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { const language = useContext(UiLanguageContext); return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{uiText(language, label)}</span></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { const language = useContext(UiLanguageContext); return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{uiText(language, l)}</option>)}</select></Field>; }
function NumberSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) { const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b); return <Field label={label}><select value={value} onChange={(e) => onChange(Number(e.target.value))}>{values.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>; }

function XIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2.25h3.68l-8.04 9.19L24 21.75h-7.41l-5.8-7.59-6.64 7.59H.46l8.6-9.83L0 2.25h7.6l5.24 6.93 6.06-6.93Zm-1.29 17.29h2.04L6.49 4.34H4.3l13.31 15.2Z" /></svg>;
}

function GitHubIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.13.64-1.39-2.22-.26-4.56-1.15-4.56-5.09 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.4c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.95-2.35 4.82-4.58 5.08.36.32.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" /></svg>;
}
