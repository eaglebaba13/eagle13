// Phase 44B — Scheduled hook for the morning brief.

import { createFileRoute } from "@tanstack/react-router";
import { runMorningBrief } from "@/lib/multi-asset/report.functions";
import { authorizeMorningBriefCronRequest } from "@/lib/multi-asset/morning-brief-cron-auth.server";

function logEvent(level: "info" | "warn" | "error", event: string, fields: object = {}): void {
  console[level](JSON.stringify({ event, ...fields }));
}

export async function handleMorningBriefRequest(request: Request): Promise<Response> {
  const authorization = authorizeMorningBriefCronRequest(request);
  if (!authorization.authorized) {
    logEvent("warn", "morning_brief.scheduler_auth_rejected", { reason: authorization.reason });
    const notConfigured = authorization.reason === "not_configured";
    return Response.json(
      {
        ok: false,
        error: notConfigured ? "scheduler_auth_not_configured" : "unauthorized",
        ...(notConfigured
          ? { message: "Configure MORNING_BRIEF_CRON_SECRET on the application server." }
          : {}),
      },
      { status: notConfigured ? 503 : 401 },
    );
  }

  logEvent("info", "morning_brief.scheduler_invoked");
  try {
    const record = await runMorningBrief();
    logEvent("info", "morning_brief.scheduler_completed", {
      reportId: record.payload.reportId,
      dataQuality: record.dataQuality,
      deliveryStatus: record.deliveryStatus,
      deliveryAttempts: record.deliveryAttempts,
    });
    return Response.json({
      ok: true,
      reportId: record.payload.reportId,
      dataQuality: record.dataQuality,
      deliveryStatus: record.deliveryStatus,
      deliveryAttempts: record.deliveryAttempts,
      attempted: record.telegramMessageIds.length,
    });
  } catch {
    logEvent("error", "morning_brief.scheduler_failed", { errorCode: "MORNING_BRIEF_RUN_FAILED" });
    return Response.json({ ok: false, error: "morning_brief_run_failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/hooks/morning-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMorningBriefRequest(request),
    },
  },
});
