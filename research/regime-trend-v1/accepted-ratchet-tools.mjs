import {
  compareTradeWithRatchet5m,
  summarizeCorrectedRatchetCandidate
} from "./target-triggered-ratchet-corrected-tools.mjs";

export const ACCEPTED_RATCHET = Object.freeze({
  id: "touch-2.00-lock-0.00",
  activationAtr: 2,
  floorAtr: 0
});

export function applyAcceptedRatchet5m(
  trade,
  stopUpdates,
  candleByTimestamp,
  costs
) {
  return compareTradeWithRatchet5m(
    trade,
    stopUpdates,
    candleByTimestamp,
    ACCEPTED_RATCHET,
    costs
  );
}

export function summarizeAcceptedRatchet(comparisons) {
  return summarizeCorrectedRatchetCandidate(comparisons);
}
