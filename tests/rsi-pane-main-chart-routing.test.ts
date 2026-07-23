import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const rsiPanePresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Session Trader",
  "4H Swing Trend",
  "Spot Accumulation",
  "Breakout Momentum",
  "RSI Divergence Reversal",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard