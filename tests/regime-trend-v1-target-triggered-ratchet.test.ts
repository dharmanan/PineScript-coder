import { describe, expect, it } from "vitest";
import {
  applyTargetTriggeredRatchet,
  TARGET_TRIGGERED_RATCHET_CANDIDATES
} from "../research/regime-trend-v1/target-triggered-ratchet-tools.mjs";

const FIVE = 5 * 60 * 1000;

function trade(overrides = {}) {
  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "test",
    dataset_hash: "test",
    symbol: "TESTUSDT",
    timeframe: "4h",
    direction: "long",
    signal_timestamp: -4 * 60 * 60 * 1000,
    entry_timestamp: 0,
    raw_entry_open: 100,
    entry_fill: 100,
    entry_atr: 10,
    initial_stop: 90,
    exit_timestamp: 3