import { ALERT_JOBS, type AlertJob } from "./modular-alert-schedule";
import { ALERT_DISCLAIMER } from "./types";

const guidance: Record<AlertJob, readonly [why: string, discipline: string]> = {
  panchang: ["Timing context helps organize the research session.", "Treat timing as context. Wait for price confirmation."],
  morning: ["The prior session and volatility frame today’s scenarios.", "Set an invalidation level before acting. Skip the setup if it is unclear."],
  context: ["Volatility and sector leadership show where participation is concentrated.", "Confirm breadth before following an isolated mover."],
  nifty: ["The prior session’s levels define the current research range.", "Wait for confirmation at the level. Avoid chasing a gap."],
  banknifty: ["Bank leadership can confirm or diverge from the broader index.", "Respect invalidation when the index crosses back into its range."],
  sensex: ["SENSEX levels give a second view of large-cap price structure.", "Use SENSEX confirmation before relying on levels from another index."],
  commodity: ["The ratio compares relative pricing while each contract has its own range.", "Check the contract and expiry before comparing levels."],
  crypto: ["The rolling range shows where price sits in a continuously traded market.", "Check quote freshness and avoid chasing a move outside your plan."],
  flows: ["Published cash flows describe institutional activity for the reported session.", "Use the trade date and confirm with current price structure."],
  navagraha: ["Entry, stop and targets define a research scenario around the timing levels.", "Wait for the stated trigger and respect the hard stop."],
  cube: ["Agreement across pillars helps distinguish a confirmed setup from a watch item.", "Wait for confirmation and skip incomplete setups."],
  chronowheel: ["Historical windows provide context for the ranked, MWPL-screened watchlist.", "Past outcomes do not predict the next move. Recheck price and eligibility."],
  ban: ["Exchange restrictions and rising utilization can change position eligibility.", "Verify the current exchange restriction before considering a fresh position."],
  coa: ["The option chain shows which support and resistance levels are shifting.", "Confirm the shift in live data before using the scenario."],
  screener: ["The list highlights eligible stocks near a defined research level.", "Proximity is a watch condition. Wait for confirmation and define risk."],
  pcr: ["Index and combined PCR put the option positioning signal in context.", "Require price confirmation. Avoid decisions based on one PCR reading."],
  optionBuying: ["The decision reflects the latest available weighted inputs.", "Respect WAIT and NO_TRADE. Check strike liquidity and downside first."],
  terminal: ["The weighted contributions show what changed in the decision.", "Review conflicts and liquidity before considering the research strike."],
  bells: ["A session boundary can change liquidity and spreads.", "Confirm the exchange is open and let spreads settle."],
};

export function formatAlertNarrative(job: AlertJob, text: string, test = false): string {
  const [why, discipline] = guidance[job];
  const headline = `${test ? "[Test Dispatch] " : ""}${ALERT_JOBS[job][0]}`;
  const trim = (value: string, max: number) => value.length <= max
    ? value : `${value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "")}…`;
  const [first, ...details] = text.trim().split(/\r?\n/);
  const summary = trim(first || "Research update", 200);
  return [
    headline,
    `Aaj Ka Crux: ${summary}`,
    `Why It Matters: ${test ? "This checks the configured Telegram destination." : why}`,
    `Discipline Guardrail: ${test ? "Test message only. No research signal was generated." : discipline}`,
    first && first.length > 200 ? trim(text.trim(), 3300) : trim(details.join("\n").trim(), 3300),
    ALERT_DISCLAIMER,
  ].filter(Boolean).join("\n\n");
}
