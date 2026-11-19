import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { alertJobIds, defaultJobSettings, evaluateAlertSchedule, type AlertJob, type AlertJobSettings } from "./modular-alert-schedule";
import { createAlertContentLoader, type AlertContent } from "./modular-alert-content.server";
import { postModularAlertTest, postTelegramMessage } from "./telegram-delivery.server";
import { formatAlertNarrative } from "./alert-narrative";

export async function loadModularAlertSettings() {
  const { data, error } = await supabaseAdmin.from("modular_alert_settings").select("*");
  if (error) throw new Error("Alert settings unavailable");
  const rows = new Map(data.map((row) => [row.job, row]));
  return alertJobIds.map((id) => {
    const row = rows.get(id);
    return { id, ...(row ? { enabled: row.enabled, schedule: row.schedule, cooldownMinutes: row.cooldown_minutes } : defaultJobSettings(id)) };
  });
}

export async function saveModularAlertSettings(id: AlertJob, settings: AlertJobSettings) {
  const { error } = await supabaseAdmin.from("modular_alert_settings").upsert({
    job: id, enabled: settings.enabled, schedule: settings.schedule, cooldown_minutes: settings.cooldownMinutes,
  });
  if (error) throw new Error("Could not save alert settings");
}

async function recordStatus(userId: string, id: AlertJob, key: string, status: string) {
  const { error } = await supabaseAdmin.from("modular_alert_claims").update({ status })
    .eq("user_id", userId).eq("job", id).eq("fingerprint", key);
  if (error) throw new Error("Could not persist alert delivery status");
}

export async function testModularAlert(userId: string, id: AlertJob) {
  const key = `test:${crypto.randomUUID()}`;
  const { error } = await supabaseAdmin.from("modular_alert_claims").insert({ user_id: userId, job: id, fingerprint: key });
  if (error) throw new Error("Could not create test delivery audit");
  const result = await postModularAlertTest(formatAlertNarrative(id, "Operator delivery check.", true));
  await recordStatus(userId, id, key, result.status);
  return { status: result.status, errorCode: result.errorCode };
}

async function deliver(userId: string, settings: AlertJobSettings & { id: AlertJob }, content: AlertContent, key: string) {
  const { data: claim, error } = await supabaseAdmin.rpc("claim_modular_alert", {
    p_user: userId, p_job: settings.id, p_key: key, p_version: content.version ?? null, p_cooldown: settings.cooldownMinutes,
  });
  if (error) throw new Error("Could not claim alert fingerprint");
  if (!claim) return;
  const result = await postTelegramMessage(formatAlertNarrative(settings.id, content.text));
  await recordStatus(userId, settings.id, claim, result.status);
}

let loading = false;
const inFlight = new Set<AlertJob>();
const lastMinute = new Map<AlertJob, number>();

export async function runModularAlertJobs(now = new Date()) {
  const userId = process.env.SMART_ALERT_SCHEDULER_USER_ID?.trim();
  if (loading || !userId || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  loading = true;
  let settings: Awaited<ReturnType<typeof loadModularAlertSettings>>;
  try {
    settings = await loadModularAlertSettings();
  } catch {
    console.warn("[Modular Alerts] Settings unavailable.");
    return;
  } finally {
    loading = false;
  }
  const load = createAlertContentLoader(now);
  const minute = Math.floor(now.getTime() / 60_000);
  await Promise.all(settings.map(async (job) => {
    const { slots, watch } = evaluateAlertSchedule(job.id, job, now);
    if ((!slots.length && !watch) || inFlight.has(job.id) || lastMinute.get(job.id) === minute) return;
    inFlight.add(job.id);
    lastMinute.set(job.id, minute);
    try {
      const content = watch || slots.some((slot) => !slot.message) ? await load(job.id) : null;
      for (const slot of slots) {
        const payload: AlertContent | null = slot.message ? { text: slot.message } : content;
        if (payload) await deliver(userId, job, payload, payload.key ?? slot.key);
      }
      if (watch && content && (content.key || (!slots.length && content.version))) {
        await deliver(userId, job, content, content.key ?? "");
      }
    } catch {
      console.warn(`[Modular Alerts] ${job.id} evaluation or delivery failed.`);
    } finally {
      inFlight.delete(job.id);
    }
  }));
}
