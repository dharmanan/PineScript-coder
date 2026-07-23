"use client";

import { useMemo, useState } from "react";
import { presets } from "@/lib/presets";
import { compileRsiDivergenceCompanion } from "@/lib/rsi-divergence-companion";

const fileSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function RsiCompanionPage() {
  const [sourceName, setSourceName] = useState("Fast EMA Scalper");
