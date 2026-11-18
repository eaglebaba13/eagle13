// Autonomous Server-Side Scheduler Daemon for EagleBABA Workstation
// Executes:
// 1. Exact 09:20:00 IST Static Snapshot capture for major F&O underlyings.
// 2. 60-second headless smart alert heartbeat evaluating signals & dispatching to Telegram.

import { runSmartAlerts } from "./smart-alerts/persistence.functions";
import { processOptionChainToLtpCalculator } from "./options/ltp-calculator-engine.server";
import { fetchCanonicalOptionChain } from "./option-chain/canonical-snapshot.server";
import { collectOiSession } from "./options/oi-direction-scanner.server";
import { collectScheduledLiquidity } from "./market-data/liquidity-heatmap.server";

let isSchedulerRunning = false;
let lastCapturedDate = "";
let oiCollectorStarted = false;

export function ensureOiCollectorStarted(): void {
  if (oiCollectorStarted || typeof process === "undefined" || process.env.VITEST || process.env.NODE_ENV === "test") return;
  oiCollectorStarted = true;
  const collect = () => { void collectOiSession().catch(() => console.warn("[OI Scanner] Collection unavailable.")); };
  collect();
  const timer = setInterval(collect, 60_000);
  timer.unref?.();
}

export function isPastNineTwentyAmIst(): boolean {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const istMinutesSinceMidnight = (utcHours * 60 + utcMinutes + 330) % 1440;
  return istMinutesSinceMidnight >= 560; // 09:20 AM IST = 560 mins
}

export function ensureServerSchedulerStarted(): void {
  if (typeof process === "undefined" || Boolean(process.env.VITEST) || process.env.NODE_ENV === "test") {
    return;
  }
  if (isSchedulerRunning) {
    return;
  }
  isSchedulerRunning = true;

  console.log("[ServerScheduler] Autonomous background daemon initialized.");
  // OI collection is independent of open browser tabs; the collector guards overlapping runs.
  ensureOiCollectorStarted();
  const liquidityTimer = setInterval(() => { void collectScheduledLiquidity().catch(() => console.warn("[Liquidity] Snapshot collection unavailable.")); }, 120_000);
  liquidityTimer.unref?.();

  // 1. 60-Second Headless Smart Alert Heartbeat
  setInterval(async () => {
    try {
      await runSmartAlerts({
        data: {
          telegramEnabled: true,
        },
      });
    } catch {
      // Resilient continuous execution
    }
  }, 60_000);

  // 2. 30-Second Check for 09:20 IST Static Snapshot Trigger
  setInterval(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (lastCapturedDate === todayStr) return;

      const dayOfWeek = new Date().getUTCDay();
      // Monday (1) to Friday (5) only
      if (dayOfWeek === 0 || dayOfWeek === 6) return;

      if (isPastNineTwentyAmIst()) {
        lastCapturedDate = todayStr;
        console.log(`[ServerScheduler] Triggering 09:20 AM Static LTP Snapshot for ${todayStr}...`);
        for (const sym of ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"]) {
          try {
            const res = await fetchCanonicalOptionChain({ underlying: sym });
            if (res.ok && res.snapshot) {
              processOptionChainToLtpCalculator(res.snapshot, "INR", "₹");
            }
          } catch {
            // Ignore individual index snapshot errors
          }
        }
        console.log(`[ServerScheduler] 09:20 AM Static Snapshots captured successfully.`);
      }
    } catch {
      // Ignore
    }
  }, 30_000);
}
