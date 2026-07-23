"use client";

import { useMemo, useState } from "react";
import { presets } from "@/lib/presets";
import { compileRsiDivergenceCompanion } from "@/lib/rsi-divergence-companion";

const fileSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function RsiCompanionPage() {
  const [sourceName, setSourceName] = useState("Fast EMA Scalper");
  const code = useMemo(() => compileRsiDivergenceCompanion(sourceName), [sourceName]);

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileSlug(sourceName)}-rsi-divergence-companion.pine`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <section className="panel">
        <span className="eyebrow">PINEFORGE COMPANION</span>
        <h1>RSI Divergence Companion</h1>
        <p>
          Add this as a second TradingView indicator beside the selected PineForge preset. It opens in a separate pane and does not change the main script&apos;s signals.
        </p>

        <label className="field">
          <span>Preset name</span>
          <select value={sourceName} onChange={(event) => setSourceName(event.target.value)}>
            {presets.map((preset) => (
              <option key={preset.name} value={preset.name}>{preset.name}</option>
            ))}
          </select>
        </label>

        <div className="hero-actions">
          <button onClick={() => navigator.clipboard.writeText(code)}>Copy RSI Companion</button>
          <button className="primary" onClick={download}>Download RSI Companion</button>
        </div>

        <div className="notice">
          Regular Bull, Hidden Bull, Regular Bear and Hidden Bear are enabled by default. Pivot confirmation uses 5 bars left and 5 bars right.
        </div>

        <pre>{code}</pre>
      </section>
    </main>
  );
}
