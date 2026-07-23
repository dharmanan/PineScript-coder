import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAcceptedPine } from "./pine-readiness-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pinePath = join(scriptDirectory, "pine", "regime-trend-v1-ratchet-v1.pine");
const reportPath = join(scriptDirectory, "results", "pine-readiness-report.json");
const correctedReportPath = join(
  scriptDirectory,
  "results",
  "target-triggered-ratchet-corrected-report.json"
);

async function main() {
  const code = await readFile(pinePath, "utf8");
  const validation = validateAcceptedPine(code);
  const corrected = JSON.parse(await readFile(correctedReportPath, "utf8"));
  const candidateId = "touch-2.00-lock-0.00";

  const partitions = corrected.partitions.map((partition) => ({
    id: partition.id,
    normal: partition.normal_costs[candidateId],
    doubled: partition.doubled_costs[candidateId]
  }));

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    strategy_id: "regime-trend-v1-ratchet",
    pine_file: "research/regime-trend-v1/pine/regime-trend-v1-ratchet-v1.pine",
    pine_sha256: validation.sha256,
    static_validation_passed: validation.passed,
    static_checks: validation.checks,
    forbidden_checks: validation.forbidden,
    accepted_candidate_id: candidateId,
    corrected_reference_partitions: partitions,
    final_holdout_opened: false,
    tradingview_compile_verified: false,
    tradingview_trade_parity_verified: false,
    remaining_external_verification: [
      "Paste the Pine file into TradingView Pine Editor on a 5-minute Binance Spot chart and confirm compilation.",
      "Export TradingView trades for the frozen 2019-2024 research window and compare them against the accepted reference ledger before opening the final holdout."
    ]
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const check of [...validation.checks, ...validation.forbidden]) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}`);
  }
  console.log(`Pine SHA-256: ${validation.sha256}`);
  console.log(`Static validation: ${validation.passed ? "PASS" : "FAIL"}`);
  console.log(`Report written to ${reportPath}`);
  console.log("Final holdout was not opened.");

  if (!validation.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
