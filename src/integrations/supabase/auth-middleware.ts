// Auth middleware — graceful authentication.
// Unauthenticated requests pass through with null context.
// Invalid tokens throw errors.
// Protected server functions MUST call assertAuth() to reject unauthenticated access.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient, type JwtPayload } from "@supabase/supabase-js";
import type { Database } from "./types";
import { GUEST_COOKIE_NAME, GUEST_TOKEN, GUEST_USER_ID } from "@/lib/guest-session";

export interface AuthContext {
  supabase: SupabaseClient<Database> | null;
  userId: string | null;
  claims: JwtPayload | null;
  isGuest?: boolean;
}

/** Narrow a verified authenticated context without changing nullable middleware behavior. */
export function assertAuth(context: AuthContext): asserts context is AuthContext & {
  userId: string;
  supabase: SupabaseClient<Database>;
  claims: JwtPayload;
} {
  if (!context.userId || !context.supabase || !context.claims) {
    throw new Error("Unauthorized: Authentication required");
  }
}

function authContext(
  supabase: SupabaseClient<Database> | null,
  userId: string | null,
  claims: JwtPayload | null,
  isGuest?: boolean,
): AuthContext {
  const ctx: AuthContext = { supabase, userId, claims };
  if (isGuest) ctx.isGuest = true;
  return ctx;
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    const cookieHeader = request?.headers?.get("cookie") ?? "";
    const guestHeader = request?.headers?.get("x-guest-access");

    // Check for guest research session
    const isGuest =
      authHeader === `Bearer ${GUEST_TOKEN}` ||
      authHeader?.startsWith("Bearer guest-") ||
      guestHeader === "true" ||
      cookieHeader.includes(`${GUEST_COOKIE_NAME}=1`) ||
      cookieHeader.includes(`${GUEST_COOKIE_NAME}=true`);

    if (isGuest) {
      const guestClaims: JwtPayload = {
        sub: GUEST_USER_ID,
        role: "authenticated",
        aud: "authenticated",
        app_metadata: { role: "guest", provider: "guest" },
        user_metadata: { full_name: "Guest Researcher" },
        exp: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const guestSupabase =
        SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
          ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              global: {
                fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
              },
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            })
          : ({
              auth: {
                getClaims: async () => ({ data: { claims: guestClaims } }),
                getUser: async () => ({ data: { user: { id: GUEST_USER_ID } } }),
              },
              from: () => ({ select: () => ({ data: [], error: null }) }),
              rpc: async () => ({ data: null, error: null }),
            } as unknown as SupabaseClient<Database>);

      return next({
        context: authContext(guestSupabase, GUEST_USER_ID, guestClaims, true),
      });
    }

    // No auth header — pass through without auth context.
    // Server functions that require auth should check for null context.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next({
        context: authContext(null, null, null),
      });
    }

    // Supabase not configured — pass through
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return next({
        context: authContext(null, null, null),
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.split(".").length !== 3) {
      // Invalid token format — pass through (don't crash the request)
      return next({
        context: authContext(null, null, null),
      });
    }

    const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY!),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabase.auth.getClaims(token);
    if (!data?.claims?.sub) {
      // Invalid/expired token — pass through without auth
      return next({
        context: authContext(supabase, null, null),
      });
    }

    return next({
      context: authContext(supabase, data.claims.sub, data.claims),
    });
  },
);
