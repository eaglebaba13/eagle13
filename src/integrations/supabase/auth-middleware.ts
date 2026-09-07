// Auth middleware — graceful authentication.
// Unauthenticated requests pass through with null context.
// Invalid tokens throw errors.
// Server functions check for auth context presence.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
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
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");

    // No auth header — pass through without auth context.
    // Server functions that require auth should check for null context.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next({
        context: { supabase: null, userId: null, claims: null },
      });
    }

    // Supabase not configured — pass through
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return next({
        context: { supabase: null, userId: null, claims: null },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.split(".").length !== 3) {
      // Invalid token format — pass through (don't crash the request)
      return next({
        context: { supabase: null, userId: null, claims: null },
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
        context: { supabase, userId: null, claims: null },
      });
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
