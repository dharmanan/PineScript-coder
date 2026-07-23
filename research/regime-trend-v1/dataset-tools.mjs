import { createHash } from "node:crypto";

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const DATASET_START_MS = Date.parse("2019-01-01T00:00:00.000Z");
export const DATASET_END_EXCLUSIVE_MS = Date.parse("2026-07-01T00:00:00.000Z");
export const DATASET_SYMBOLS = Object.freeze(["BTCUSDT", "ETHUSDT", "BNBUSDT"]);
export const BINANCE_SPOT_API_BASE = "https://api.binance.com