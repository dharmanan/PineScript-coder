import { describe, expect, it } from "vitest";
import {
  dailyArchiveFileName,
  dailyArchiveUrl,
  insertRawKlineRows,
  selectRawKlineRows,
  unresolvedTargetsFromReport
} from "../research/regime-trend-v1/daily-gap-repair-tools.mjs";

describe("Regime Trend v1 daily gap repair helpers", () => {
  it("builds official Binance daily archive paths", () => {
    expect(dailyArchiveFileName("BTCUSDT", "2020-02-09")).toBe(
      "BTCUSDT-5m-2020-02-09.zip"
    );
    expect(dailyArchiveUrl("BTCUSDT", "2020-02-09")).toBe(
      "https://data.binance.vision/data/spot/daily/klines/BTCUSDT/5m/BTCUSDT-5m-2020-02-09.zip"
    );
  });

  it("selects and inserts missing rows in timestamp order", () => {
    const daily = [
      "300000,3,3,3,3,3,599999",
      "600000,6,6,6,6,6,899999"
    ].join("\n");
    const selected = selectRawKlineRows(daily, [300000]);
    expect(selected.get(300000)).toContain("300000,3");

    const monthly = [
      "0,1,1,1,1,1,299999",
      "600000,6,6,6,6,6,899999"
    ].join("\n");
    const result = insertRawKlineRows(monthly, [
      { timestamp: 300000, raw: selected.get(300000)! }
    ]);
    expect(result.inserted).toEqual([300000]);
    expect(result.csv.split("\n").filter(Boolean).map((row) => Number(row.split(",")[0]))).toEqual([
      0,
      300000,
      600000
    ]);
  });

  it("deduplicates unresolved targets across cost profiles", () => {
    const report = {
      partitions: [
        {
          id: "development",
          unresolved_diagnostics: {
            normal_costs: [
              {
                classification: "DATA_GAP",
                symbol: "BTCUSDT",
                missing_5m_timestamp: "2020-02-09T02:00:00.000Z"
              }
            ],
            doubled_costs: []
          }
        }
      ]
    };
    expect(unresolvedTargetsFromReport(report)).toEqual([
      {
        symbol: "BTCUSDT",
        timestamp: Date.parse("2020-02-09T02:00:00.000Z"),
        timestamp_iso: "2020-02-09T02:00:00.000Z",
        day: "2020-02-09",
        month: "2020-02",
        partitions: ["development"]
      }
    ]);
  });
});
