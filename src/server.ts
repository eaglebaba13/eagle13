import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage, renderRateLimitPage } from "./lib/error-page";
import { checkRateLimit } from "./lib/server/rate-limiter.server";
import { applySecurityHeaders } from "./lib/server/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function withSecurityHeaders(response: Response): Response {
  try {
    applySecurityHeaders(response.headers);
    return response;
  } catch {
    const newHeaders = new Headers(response.headers);
    applySecurityHeaders(newHeaders);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // 0. Canonical /login -> /auth redirect
    if (url.pathname === "/login" || url.pathname === "/login/") {
      const target = `/auth${url.search}`;
      const headers = new Headers({ location: target });
      applySecurityHeaders(headers);
      return new Response(null, {
        status: 302,
        headers,
      });
    }

    // 1. Sliding-window distributed rate limiting check
    const rateLimit = checkRateLimit(request);
    if (!rateLimit.allowed) {
      const retryAfter = rateLimit.retryAfter ?? 60;
      const url = new URL(request.url);
      const isApi =
        url.pathname.startsWith("/api/") ||
        (request.headers.get("accept")?.includes("application/json") ?? false);

      const headers = new Headers({
        "content-type": isApi ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
        "retry-after": String(retryAfter),
      });
      applySecurityHeaders(headers);

      const body = isApi
        ? JSON.stringify({
            error: "Too Many Requests",
            message: "Institutional rate limit threshold exceeded. Please retry after cooldown.",
            retryAfter,
            tier: rateLimit.tier,
          })
        : renderRateLimitPage(retryAfter);

      return new Response(body, {
        status: 429,
        headers,
      });
    }

    // 2. Main request processing with security headers & catastrophic error recovery
    try {
      const handler = await getServerEntry();
      const rawResponse = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(rawResponse);
      return withSecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      const errorHeaders = new Headers({ "content-type": "text/html; charset=utf-8" });
      applySecurityHeaders(errorHeaders);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: errorHeaders,
      });
    }
  },
};
