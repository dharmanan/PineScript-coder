"use client";

import { useMemo, useState } from "react";
import { compilePine } from "@/lib/compiler";
import { defaultConfig } from "@/lib/defaults";
import { explainConfig } from "@/lib/explain";
import { presets } from "@/lib/presets";
import { applyVisualProfile } from "@/lib/visual-profile-config";
import type { StrategyConfig, VisualProfile } from "@/lib/types";

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

export default function Home() {
  const [config, setConfig] = useState<StrategyConfig>(clone(defaultConfig));
  const [selectedPreset, setSelectedPreset] = useState<string>("Custom configuration");
  const [tab, setTab] = useState<"builder" | "code" | "ai">("builder");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const code = useMemo(() => compilePine(config), [config]);
  const explanation = useMemo(() => explainConfig(config), [config]);

  const setNested = (section: keyof StrategyConfig, key: string, value: unknown) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => ({
      ...current,
      [section]: typeof current[section] === "object" ? { ...(current[section] as object), [key]: value } : value
    } as StrategyConfig));
  };

  const setTop = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const choosePreset = (preset: StrategyConfig) => {
    setConfig(clone(preset));
    setSelectedPreset(preset.name);
  };

  const applySensitivity = (value: StrategyConfig["sensitivity"]) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => ({
      ...current,
      sensitivity: value,
      execution: { ...current.execution, cooldownBars: value === "frequent" ? 2 : value === "balanced" ? 5 : 10 },
      volume: { ...current.volume, multiplier: value === "frequent" ? 1 : value === "balanced" ? 1.1 : 1.25 },
      momentum: { ...current.momentum, adxThreshold: value === "frequent" ? 15 : value === "balanced" ? 20 : 25 }
    }));
  };

  const chooseVisualProfile = (profile: VisualProfile) => {
    setSelectedPreset("Custom configuration");
    setConfig((current) => applyVisualProfile(current, profile));
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pine`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const askAI = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch("/api/ai-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt }) });
      setAiResult(await response.json());
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">OPEN SOURCE · DETERMINISTIC · PINE SCRIPT v6</span>
          <h1>PineForge Studio</h1>
          <p>Choose how you trade, inspect the exact behavior in plain language, and generate editable Pine Script without hidden AI decisions.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => navigator.clipboard.writeText(code)}>Copy Pine</button>
          <button className="primary" onClick={download}>Download .pine</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>Guided Builder</button>
        <button className={tab === "code" ? "active" : ""} onClick={() => setTab("code")}>Generated Script</button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>Optional AI Planner</button>
      </nav>

      {tab === "builder" && (
        <div className="workspace">
          <section className="panel controls">
            <div className="selected-strip"><span>Selected preset</span><strong>{selectedPreset}</strong><span>{config.direction.replaceAll("_", " ")} · {config.chartTimeframe}</span></div>
            <h2>Start from a complete script</h2>
            <div className="preset-grid">
              {presets.map((p) => <button className={selectedPreset === p.name ? "selected" : ""} key={p.name} onClick={() => choosePreset(p)}>{selectedPreset === p.name ? "✓ " : ""}{p.name}</button>)}
            </div>

            <Field label="Script name"><input value={config.name} onChange={(e) => setTop("name", e.target.value)} /></Field>
            <div className="two">
              <SelectField label="Trading style" value={config.style} onChange={(v) => setTop("style", v as any)} options={[["scalp", "Scalp"], ["intraday", "Intraday"], ["swing", "Swing"], ["spot", "Spot"], ["long_term", "Long term"]]} />
              <SelectField label="Direction" value={config.direction} onChange={(v) => setTop("direction", v as any)} options={[["long_short", "Long + Short"], ["long_only", "Long only"], ["spot_buy_exit", "Spot buy + exit"]]} />
              <SelectField label="Output" value={config.outputMode} onChange={(v) => setTop("outputMode", v as any)} options={[["indicator", "Indicator"], ["strategy", "Strategy Tester"]]} />
              <SelectField label="Chart timeframe" value={config.chartTimeframe} onChange={(v) => setTop("chartTimeframe", v)} options={timeframeOptions.map((v) => [v, timeframeLabel(v)])} />
              <SelectField label="Signal frequency" value={config.sensitivity} onChange={(v) => applySensitivity(v as any)} options={[["frequent", "More frequent"], ["balanced", "Balanced"], ["selective", "More selective"]]} />
              <SelectField label="Entry trigger" value={config.entryTrigger} onChange={(v) => setTop("entryTrigger", v as any)} options={[["trend_state", "Conditions remain valid"], ["ema_cross", "EMA crossover"], ["pullback_reclaim", "Fast EMA reclaim"], ["vwap_reclaim", "VWAP reclaim"], ["supertrend_flip", "Supertrend flip"], ["breakout", "Recent high/low breakout"]]} />
            </div>

            {config.direction === "spot_buy_exit" && (
              <SelectField label="Spot exit logic" value={config.spotExitMode} onChange={(v) => setTop("spotExitMode", v as any)} options={[["combined", "Combined reversal events"], ["trend_break", "Break below long MA"], ["ema_cross", "Bearish EMA crossover"], ["rsi_overbought", "RSI leaves overbought zone"], ["htf_bearish", "Higher timeframe turns bearish"]]} />
            )}

            <Group title="Higher-timeframe bias">
              <Check label="Use higher-timeframe bias" checked={config.higherTimeframe.enabled} onChange={(v) => setNested("higherTimeframe", "enabled", v)} />
              {config.higherTimeframe.enabled && <>
                <div className="three">
                  <SelectField label="Timeframe" value={config.higherTimeframe.timeframe} onChange={(v) => setNested("higherTimeframe", "timeframe", v)} options={timeframeOptions.map((v) => [v, timeframeLabel(v)])} />
                  <SelectField label="Method" value={config.higherTimeframe.method} onChange={(v) => setNested("higherTimeframe", "method", v)} options={[["ema", "EMA"], ["sma", "SMA"], ["supertrend", "Supertrend"]]} />
                  <NumberSelect label="Length" value={config.higherTimeframe.length} onChange={(v) => setNested("higherTimeframe", "length", v)} options={maLengths} />
                </div>
                <Check label="Use only the last closed higher-timeframe candle" checked={config.higherTimeframe.closedBarOnly} onChange={(v) => setNested("higherTimeframe", "closedBarOnly", v)} />
                <Check label="Block counter-trend signals" checked={config.higherTimeframe.blockCounterTrend} onChange={(v) => setNested("higherTimeframe", "blockCounterTrend", v)} />
              </>}
            </Group>

            <Group title="Trend filters">
              <Check label="EMA trend" checked={config.trend.emaEnabled} onChange={(v) => setNested("trend", "emaEnabled", v)} />
              {(config.trend.emaEnabled || ["ema_cross", "pullback_reclaim"].includes(config.entryTrigger) || config.spotExitMode === "ema_cross" || config.spotExitMode === "combined") && <div className="two"><NumberSelect label="Fast EMA" value={config.trend.emaFast} onChange={(v) => setNested("trend", "emaFast", v)} options={maLengths} /><NumberSelect label="Slow EMA" value={config.trend.emaSlow} onChange={(v) => setNested("trend", "emaSlow", v)} options={maLengths} /></div>}
              <Check label="Long moving average" checked={config.trend.longMaEnabled} onChange={(v) => setNested("trend", "longMaEnabled", v)} />
              {(config.trend.longMaEnabled || config.spotExitMode === "trend_break" || config.spotExitMode === "combined") && <div className="two"><SelectField label="MA type" value={config.trend.longMaType} onChange={(v) => setNested("trend", "longMaType", v)} options={[["sma", "SMA"], ["ema", "EMA"]]} /><NumberSelect label="Length" value={config.trend.longMaLength} onChange={(v) => setNested("trend", "longMaLength", v)} options={maLengths} /></div>}
              <Check label="VWAP" checked={config.trend.vwapEnabled} onChange={(v) => setNested("trend", "vwapEnabled", v)} />
              <Check label="Supertrend" checked={config.trend.supertrendEnabled} onChange={(v) => setNested("trend", "supertrendEnabled", v)} />
              {(config.trend.supertrendEnabled || config.entryTrigger === "supertrend_flip" || config.higherTimeframe.method === "supertrend") && <div className="two"><NumberSelect label="ATR length" value={config.trend.supertrendAtrLength} onChange={(v) => setNested("trend", "supertrendAtrLength", v)} options={[5, 7, 10, 14, 20]} /><NumberSelect label="Factor" value={config.trend.supertrendFactor} onChange={(v) => setNested("trend", "supertrendFactor", v)} options={[1, 1.5, 2, 2.5, 3, 4, 5]} /></div>}
              {config.entryTrigger === "breakout" && <NumberSelect label="Breakout lookback" value={config.trend.breakoutLength} onChange={(v) => setNested("trend", "breakoutLength", v)} options={breakoutLengths} />}
            </Group>

            <Group title="Momentum, volume and divergence">
              <Check label="RSI confirmation" checked={config.momentum.rsiEnabled} onChange={(v) => setNested("momentum", "rsiEnabled", v)} />
              {(config.momentum.rsiEnabled || config.momentum.divergenceEnabled || config.direction === "spot_buy_exit") && <div className={config.direction === "long_short" ? "three" : "two"}>
                <NumberSelect label="RSI length" value={config.momentum.rsiLength} onChange={(v) => setNested("momentum", "rsiLength", v)} options={rsiLengths} />
                <NumberSelect label={config.direction === "spot_buy_exit" ? "Buy RSI ≥" : "Long RSI ≥"} value={config.momentum.rsiLong} onChange={(v) => setNested("momentum", "rsiLong", v)} options={rsiLevels} />
                {config.direction === "long_short" && <NumberSelect label="Short RSI ≤" value={config.momentum.rsiShort} onChange={(v) => setNested("momentum", "rsiShort", v)} options={rsiLevels} />}
                {config.direction === "spot_buy_exit" && ["combined", "rsi_overbought"].includes(config.spotExitMode) && <NumberSelect label="Exit RSI" value={config.momentum.rsiExit} onChange={(v) => setNested("momentum", "rsiExit", v)} options={rsiLevels} />}
              </div>}
              <Check label="MACD confirmation" checked={config.momentum.macdEnabled} onChange={(v) => setNested("momentum", "macdEnabled", v)} />
              <Check label="ADX trend strength" checked={config.momentum.adxEnabled} onChange={(v) => setNested("momentum", "adxEnabled", v)} />
              {config.momentum.adxEnabled && <div className="two"><NumberSelect label="ADX length" value={config.momentum.adxLength} onChange={(v) => setNested("momentum", "adxLength", v)} options={[7, 10, 14, 20, 28]} /><NumberSelect label="Minimum ADX" value={config.momentum.adxThreshold} onChange={(v) => setNested("momentum", "adxThreshold", v)} options={[15, 18, 20, 22, 25, 30, 35]} /></div>}
              <Check label="Confirmed RSI divergence" checked={config.momentum.divergenceEnabled} onChange={(v) => setNested("momentum", "divergenceEnabled", v)} />
              {config.momentum.divergenceEnabled && <NumberSelect label="Pivot strength" value={config.momentum.divergencePivot} onChange={(v) => setNested("momentum", "divergencePivot", v)} options={pivotLengths} />}
              <Check label="Volume confirmation" checked={config.volume.enabled} onChange={(v) => setNested("volume", "enabled", v)} />
              {config.volume.enabled && <div className="two"><NumberSelect label="Volume average" value={config.volume.averageLength} onChange={(v) => setNested("volume", "averageLength", v)} options={averageLengths} /><NumberSelect label="Minimum multiplier" value={config.volume.multiplier} onChange={(v) => setNested("volume", "multiplier", v)} options={multipliers} /></div>}
            </Group>

            <Group title="Visual profile">
              <SelectField label="Chart presentation" value={config.visual.profile} onChange={(v) => chooseVisualProfile(v as VisualProfile)} options={[["clean", "Clean"], ["enhanced", "Enhanced"], ["advanced", "Advanced"]]} />
              <p className="notice">Clean keeps the chart minimal. Enhanced adds setup bar colors and a trend ribbon. Advanced uses the strongest visual emphasis while keeping the same signal rules.</p>
            </Group>

            <Group title="Risk and execution">
              <Check label="Confirmed candle only" checked={config.confirmedBarsOnly} onChange={(v) => setTop("confirmedBarsOnly", v)} />
              <NumberSelect label="Cooldown bars" value={config.execution.cooldownBars} onChange={(v) => setNested("execution", "cooldownBars", v)} options={cooldowns} />
              <Check label="Restrict to a session" checked={config.execution.sessionEnabled} onChange={(v) => setNested("execution", "sessionEnabled", v)} />
              {config.execution.sessionEnabled && <SelectField label="Session" value={config.execution.session} onChange={(v) => setNested("execution", "session", v)} options={[["0000-2359", "24 hours"], ["0930-1600", "US regular session"], ["0800-1700", "Europe session"], ["0000-0800", "Asia session"], ["0900-1700", "09:00–17:00"]]} />}
              <div className="two"><SelectField label="Stop-loss" value={config.risk.stopMode} onChange={(v) => setNested("risk", "stopMode", v)} options={[["atr", "ATR"], ["percent", "Percent"], ["swing", "Swing level"], ["none", "None"]]} /><SelectField label="Take profit" value={config.risk.takeProfitMode} onChange={(v) => setNested("risk", "takeProfitMode", v)} options={[["risk_reward", "Risk/reward"], ["percent", "Percent"], ["opposite_signal", "Opposite/reversal signal"], ["none", "None"]]} /></div>
              {config.risk.stopMode === "atr" && <div className="two"><NumberSelect label="ATR length" value={config.risk.atrLength} onChange={(v) => setNested("risk", "atrLength", v)} options={[7, 10, 14, 20, 28]} /><NumberSelect label="ATR multiple" value={config.risk.atrMultiple} onChange={(v) => setNested("risk", "atrMultiple", v)} options={atrMultiples} /></div>}
              {config.risk.stopMode === "percent" && <NumberSelect label="Stop percent" value={config.risk.stopPercent} onChange={(v) => setNested("risk", "stopPercent", v)} options={percentages} />}
              {config.risk.stopMode === "swing" && <NumberSelect label="Swing lookback" value={config.risk.swingLength} onChange={(v) => setNested("risk", "swingLength", v)} options={[5, 10, 14, 20, 30, 50]} />}
              {config.risk.takeProfitMode === "risk_reward" && <NumberSelect label="Risk/reward" value={config.risk.riskReward} onChange={(v) => setNested("risk", "riskReward", v)} options={riskRewards} />}
              {config.risk.takeProfitMode === "percent" && <NumberSelect label="Take-profit percent" value={config.risk.takeProfitPercent} onChange={(v) => setNested("risk", "takeProfitPercent", v)} options={percentages} />}
              <Check label="TradingView alerts" checked={config.execution.alertsEnabled} onChange={(v) => setNested("execution", "alertsEnabled", v)} />
              <Check label="Dashboard" checked={config.execution.showDashboard} onChange={(v) => setNested("execution", "showDashboard", v)} />
              <Check label="Bias background" checked={config.execution.showBackground} onChange={(v) => setNested("execution", "showBackground", v)} />
            </Group>
          </section>

          <aside className="panel summary sticky">
            <span className="eyebrow">PLAIN-LANGUAGE BEHAVIOR</span>
            <h2>What this script will do</h2>
            <div className="summary-badge">{selectedPreset}</div>
            {explanation.map((line) => <p key={line}>{line}</p>)}
            <div className="notice"><strong>Important:</strong> This is a deterministic rule generator, not a profitability guarantee. Test the exact output in TradingView before real use.</div>
            <button className="primary wide" onClick={() => setTab("code")}>Generate and inspect script</button>
          </aside>
        </div>
      )}

      {tab === "code" && <section className="panel"><div className="code-head"><div><span className="eyebrow">DETERMINISTIC OUTPUT</span><h2>{config.name}</h2><p>{selectedPreset} · {config.direction.replaceAll("_", " ")} · {config.outputMode}</p></div><div><button onClick={() => navigator.clipboard.writeText(code)}>Copy</button><button className="primary" onClick={download}>Download</button></div></div><pre>{code}</pre></section>}

      {tab === "ai" && <section className="panel ai-panel"><span className="eyebrow">OPTIONAL · USER-SUPPLIED API KEY</span><h2>AI can fill the deterministic form</h2><p>AI does not directly own the Pine output. It interprets a plain-language request into the same visible configuration used by the guided builder. Review every selected value before generation.</p><textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Example: Build a selective 15-minute long/short setup using 4H bias, VWAP, volume and confirmed candles." /><button className="primary" disabled={!aiPrompt || aiLoading} onClick={askAI}>{aiLoading ? "Analyzing…" : "Analyze request"}</button>{aiResult && <pre>{JSON.stringify(aiResult, null, 2)}</pre>}</section>}
    </main>
  );
}

function timeframeLabel(value: string) {
  if (value === "D") return "1 day";
  if (value === "W") return "1 week";
  if (value === "M") return "1 month";
  const number = Number(value);
  return number >= 60 ? `${number / 60} hour${number > 60 ? "s" : ""}` : `${number} minutes`;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) { return <section className="group"><h3>{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>; }
function NumberSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) { const values = options.includes(value) ? options : [...options, value].sort((a, b) => a - b); return <Field label={label}><select value={value} onChange={(e) => onChange(Number(e.target.value))}>{values.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>; }
