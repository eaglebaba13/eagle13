// Manual morning brief trigger. The automatic schedule runs inside the server.

import { createFileRoute } from "@tanstack/react-router";
import { runMorningBrief } from "@/lib/multi-asset/report.functions";

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/morning-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireStrictSuperadmin } = await import("@/lib/auth/admin-auth.server");
        try {
          await requireStrictSuperadmin(request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]);
        } catch (error) {
          if (error instanceof Error && error.message === "FORBIDDEN_ACCESS_DENIED") {
            return Response.json({ error: "forbidden" }, { status: 403 });
          }
          return unauthorized();
        }
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
