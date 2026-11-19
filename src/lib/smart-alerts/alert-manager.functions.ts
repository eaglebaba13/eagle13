import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { alertJobIds, type AlertJob } from "./modular-alert-schedule";

const job = z.custom<AlertJob>((value) => alertJobIds.includes(value as AlertJob));
const credentials = z.object({ accessToken: z.string().optional() });
const settings = credentials.extend({
  id: job,
  enabled: z.boolean(),
  schedule: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/),
  cooldownMinutes: z.number().int().min(0).max(1440),
});

export const getAlertManager = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => credentials.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireStrictSuperadmin } = await import("../auth/admin-auth.server");
    await requireStrictSuperadmin(data.accessToken);
    const { loadModularAlertSettings } = await import("./modular-alerts.server");
    const { getFoBanTrackerReport } = await import("../market-data/fo-ban-tracker.server");
    const { isVerifiedFoAlertEligible } = await import("./ban-filter");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [jobs, report, audit] = await Promise.all([
      loadModularAlertSettings(), getFoBanTrackerReport(),
      supabaseAdmin.from("modular_alert_claims").select("job,status,claimed_at,fingerprint").order("claimed_at", { ascending: false }).limit(30),
    ]);
    if (audit.error) throw new Error("Alert delivery audit unavailable");
    return {
      jobs,
      audit: audit.data.map((row) => ({ job: row.job, status: row.status, timestamp: row.claimed_at, test: row.fingerprint.startsWith("test:") })),
      excluded: Object.entries(report.allMap).filter(([, row]) => !isVerifiedFoAlertEligible(row))
        .map(([symbol, row]) => ({ symbol, status: row.status, verifiedLive: row.verifiedLive === true, asOfTimestamp: row.asOfTimestamp ?? null })),
      tracked: Object.keys(report.allMap).length,
      asOfTimestamp: report.fetchedAt,
    };
  });

export const updateAlertJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settings.parse(input))
  .handler(async ({ data }) => {
    const { requireStrictSuperadmin } = await import("../auth/admin-auth.server");
    await requireStrictSuperadmin(data.accessToken);
    const { saveModularAlertSettings } = await import("./modular-alerts.server");
    await saveModularAlertSettings(data.id, data);
    return { ok: true };
  });

export const testAlertJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.extend({ id: job }).parse(input))
  .handler(async ({ data }) => {
    const { requireStrictSuperadmin } = await import("../auth/admin-auth.server");
    const actor = await requireStrictSuperadmin(data.accessToken);
    const { testModularAlert } = await import("./modular-alerts.server");
    return testModularAlert(actor.userId, data.id);
  });
