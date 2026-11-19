import { runSmartAlertsInternal } from "./persistence.functions";
import { runModularAlertJobs } from "./modular-alerts.server";

export async function runModularAlertHeartbeat(): Promise<void> {
  await runModularAlertJobs();
}

let running = false;

export async function runSmartAlertHeartbeat(): Promise<void> {
  const userId = process.env.SMART_ALERT_SCHEDULER_USER_ID?.trim();
  if (!userId || running) return;

  running = true;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await runSmartAlertsInternal(
      { userId, supabase: supabaseAdmin },
      { telegramEnabled: true },
      true,
    );
    if (result.persistenceFailed) {
      console.warn("[Smart Alert Heartbeat] Persistence failed.");
    }
  } catch {
    console.warn("[Smart Alert Heartbeat] Evaluation failed.");
  } finally {
    running = false;
  }
}
