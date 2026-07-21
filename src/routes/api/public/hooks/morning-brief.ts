// Phase 44B — Public cron hook that triggers the morning brief.
// Called by pg_cron at 02:45 UTC (08:15 IST). Authenticated by the standard
// Supabase anon apikey header, matching the pattern documented in the
// scheduler knowledge card.

import { createFileRoute } from "@tanstack/react-router";
import { runMorningBrief } from "@/lib/multi-asset/report.functions";

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401, headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/morning-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) return unauthorized();
        try {
          const record = await runMorningBrief();
          return Response.json({
            ok: true,
            reportId: record.payload.reportId,
            deliveryStatus: record.deliveryStatus,
            deliveryAttempts: record.deliveryAttempts,
            attempted: record.telegramMessageIds.length,
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});