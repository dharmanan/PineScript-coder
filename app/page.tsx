"use client";

import { useMemo, useState } from "react";
import { compilePine } from "@/lib/compiler";
import { defaultConfig } from "@/lib/defaults";
import { explainConfig } from "@/lib/explain";
import { presets } from "@/lib/presets";
import type { StrategyConfig } from "@/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export default function Home() {
  const [config, setConfig] = useState<StrategyConfig>(clone(defaultConfig));
  const [tab, setTab] = useState<"builder" | "code" | "ai">("builder");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const code = useMemo(() => compilePine(config), [config]);
  const explanation = useMemo(() => explainConfig(config), [config]);

  const setNested = (section: keyof StrategyConfig, key: string, value: unknown) => {
    setConfig((current) => ({
      ...current,
      [section]: typeof current[section] === "object" ? { ...(current[section] as object), [key]: value } : value
    } as StrategyConfig));
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
          <p>Answer practical trading questions, understand exactly what the script will do, then generate editable Pine Script.</p>
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
            <h2>Start from a complete script</h2>
            <div className="preset-grid">
              {presets.map((p) => <button key={p.name} onClick={() => setConfig(clone(p))}>{p.name}</button>)}
            </div>

            <Field label="Script name"><input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} /></Field>
            <div className="two">
              <Field label="Trading style"><select value={config.style} onChange={(e) => setConfig({ ...config, style: e.target.value as any })}><option value="scalp">Scalp</option><option value="intraday">Intraday</option><option value="swing">Swing</option><option value="spot">Spot</option><option value="long_term">Long term</option></select></Field>
              <Field label="Direction"><select value={config.direction} onChange={(e) => setConfig({ ...config, direction: e.target.value as any })}><option value="long_short">Long + Short</option><option value="long_only">Long only</option><option value="spot_buy_exit">Spot buy + exit</option></select></Field>
              <Field label="Output"><select value={config.outputMode} onChange={(e) => setConfig({ ...config, outputMode: e.target.value as any })}><option value="indicator">Indicator</option><option value="strategy">Strategy Tester</option></select></Field>
              <Field label="Chart timeframe"><input value={config.chartTimeframe} onChange={(e) => setConfig({ ...config, chartTimeframe: e.target.value })} /></Field>
            </div>

            <Group title="Higher-timeframe bias">
              <Check label="Use higher-timeframe bias" checked={config.higherTimeframe.enabled} onChange={(v) => setNested("higherTimeframe", "enabled", v)} />
              <div className="three"><Field label="Timeframe"><input value={config.higherTimeframe.timeframe} onChange={(e) => setNested("higherTimeframe", "timeframe", e.target.value)} /></Field><Field label="Method"><select value={config.higherTimeframe.method} onChange={(e) => setNested("higherTimeframe", "method", e.target.value)}><option value="ema">EMA</option><option value="sma">SMA</option></select></Field><NumberField label="Length" value={config.higherTimeframe.length} onChange={(v) => setNested("higherTimeframe", "length", v)} /></div>
              <Check label="Block counter-trend signals" checked={config.higherTimeframe.blockCounterTrend} onChange={(v) => setNested("higherTimeframe", "blockCounterTrend", v)} />
            </Group>

            <Group title="Trend filters">
              <Check label="EMA trend" checked={config.trend.emaEnabled} onChange={(v) => setNested("trend", "emaEnabled", v)} />
              <div className="two"><NumberField label="Fast EMA" value={config.trend.emaFast} onChange={(v) => setNested("trend", "emaFast", v)} /><NumberField label="Slow EMA" value={config.trend.emaSlow} onChange={(v) => setNested("trend", "emaSlow", v)} /></div>
              <Check label="Long moving average" checked={config.trend.longMaEnabled} onChange={(v) => setNested("trend", "longMaEnabled", v)} />
              <div className="two"><Field label="MA type"><select value={config.trend.longMaType} onChange={(e) => setNested("trend", "longMaType", e.target.value)}><option value="sma">SMA</option><option value="ema">EMA</option></select></Field><NumberField label="Length" value={config.trend.longMaLength} onChange={(v) => setNested("trend", "longMaLength", v)} /></div>
              <Check label="VWAP" checked={config.trend.vwapEnabled} onChange={(v) => setNested("trend", "vwapEnabled", v)} />
              <Check label="Supertrend" checked={config.trend.supertrendEnabled} onChange={(v) => setNested("trend", "supertrendEnabled", v)} />
            </Group>

            <Group title="Momentum, volume and divergence">
              <Check label="RSI confirmation" checked={config.momentum.rsiEnabled} onChange={(v) => setNested("momentum", "rsiEnabled", v)} />
              <div className="three"><NumberField label="RSI length" value={config.momentum.rsiLength} onChange={(v) => setNested("momentum", "rsiLength", v)} /><NumberField label="Long ≥" value={config.momentum.rsiLong} onChange={(v) => setNested("momentum", "rsiLong", v)} /><NumberField label="Short ≤" value={config.momentum.rsiShort} onChange={(v) => setNested("momentum", "rsiShort", v)} /></div>
              <Check label="MACD confirmation" checked={config.momentum.macdEnabled} onChange={(v) => setNested("momentum", "macdEnabled", v)} />
              <Check label="ADX trend strength" checked={config.momentum.adxEnabled} onChange={(v) => setNested("momentum", "adxEnabled", v)} />
              <Check label="Confirmed RSI divergence" checked={config.momentum.divergenceEnabled} onChange={(v) => setNested("momentum", "divergenceEnabled", v)} />
              <Check label="Volume confirmation" checked={config.volume.enabled} onChange={(v) => setNested("volume", "enabled", v)} />
              <div className="two"><NumberField label="Volume average" value={config.volume.averageLength} onChange={(v) => setNested("volume", "averageLength", v)} /><NumberField label="Multiplier" step={0.05} value={config.volume.multiplier} onChange={(v) => setNested("volume", "multiplier", v)} /></div>
            </Group>

            <Group title="Risk and execution">
              <Check label="Confirmed candle only" checked={config.confirmedBarsOnly} onChange={(v) => setConfig({ ...config, confirmedBarsOnly: v })} />
              <NumberField label="Cooldown bars" value={config.execution.cooldownBars} onChange={(v) => setNested("execution", "cooldownBars", v)} />
              <div className="two"><Field label="Stop-loss"><select value={config.risk.stopMode} onChange={(e) => setNested("risk", "stopMode", e.target.value)}><option value="atr">ATR</option><option value="percent">Percent</option><option value="swing">Swing level</option><option value="none">None</option></select></Field><Field label="Take profit"><select value={config.risk.takeProfitMode} onChange={(e) => setNested("risk", "takeProfitMode", e.target.value)}><option value="risk_reward">Risk/reward</option><option value="percent">Percent</option><option value="opposite_signal">Opposite signal</option><option value="none">None</option></select></Field></div>
              <Check label="TradingView alerts" checked={config.execution.alertsEnabled} onChange={(v) => setNested("execution", "alertsEnabled", v)} />
              <Check label="Dashboard" checked={config.execution.showDashboard} onChange={(v) => setNested("execution", "showDashboard", v)} />
              <Check label="Bias background" checked={config.execution.showBackground} onChange={(v) => setNested("execution", "showBackground", v)} />
            </Group>
          </section>

          <aside className="panel summary sticky">
            <span className="eyebrow">PLAIN-LANGUAGE BEHAVIOR</span>
            <h2>What this script will do</h2>
            {explanation.map((line) => <p key={line}>{line}</p>)}
            <div className="notice"><strong>Important:</strong> This is a rule generator, not a profitability guarantee. Test the output in TradingView before real use.</div>
            <button className="primary wide" onClick={() => setTab("code")}>Generate and inspect script</button>
          </aside>
        </div>
      )}

      {tab === "code" && <section className="panel code-panel"><div className="code-head"><div><span className="eyebrow">DETERMINISTIC OUTPUT</span><h2>{config.name}</h2></div><div><button onClick={() => navigator.clipboard.writeText(code)}>Copy</button><button className="primary" onClick={download}>Download</button></div></div><pre>{code}</pre></section>}

      {tab === "ai" && <section className="panel ai-panel"><span className="eyebrow">OPTIONAL · USER-SUPPLIED API KEY</span><h2>Let an LLM interpret the request, not write hidden logic</h2><p>The AI planner returns a readable plan. The user then applies the choices in the deterministic builder. Configure Gemini or OpenAI in <code>.env.local</code>.</p><textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Example: I want a selective 15-minute long/short script. Do not allow longs when the 4-hour trend is bearish. Use VWAP, volume and divergence." /><button className="primary" disabled={aiLoading || aiPrompt.length < 10} onClick={askAI}>{aiLoading ? "Analyzing…" : "Analyze request"}</button>{aiResult && <pre>{JSON.stringify(aiResult, null, 2)}</pre>}</section>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) { return <Field label={label}><input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>; }
function Group({ title, children }: { title: string; children: React.ReactNode }) { return <div className="group"><h3>{title}</h3>{children}</div>; }
