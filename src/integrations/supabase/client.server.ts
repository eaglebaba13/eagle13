// Server-side Supabase client with privileged key - bypasses RLS.
// Prefers SUPABASE_SECRET_KEY, falls back to SUPABASE_SERVICE_ROLE_KEY.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
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

    // New Supabase API keys are opaque strings, not bearer JWTs.
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

type KeySource = "SECRET_KEY" | "LEGACY_SERVICE_ROLE_KEY" | "MISSING";

function resolvePrivilegedKey(): { key: string; source: KeySource } {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (secretKey) return { key: safeKey(secretKey), source: "SECRET_KEY" };
  if (legacyKey) return { key: safeKey(legacyKey), source: "LEGACY_SERVICE_ROLE_KEY" };
  return { key: "", source: "MISSING" };
}

function safeKey(key: string): string {
  // New Supabase keys (sb_secret_*) need special header handling
  if (isNewSupabaseApiKey(key)) return key;
  // Legacy JWT keys work as-is
  return key;
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const { key: privilegedKey, source } = resolvePrivilegedKey();

  if (!SUPABASE_URL || !privilegedKey) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(source === "MISSING" ? ["SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    // Never expose key values in error messages
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Check server configuration.`;
    console.error(`[Supabase] ${message} (key source: ${source})`);
    throw new Error(message);
  }

  // Diagnostic: log which key source is used (never log the key value)
  console.log(`[Supabase] Server client using key source: ${source}`);

  return createClient<Database>(SUPABASE_URL, privilegedKey, {
    global: {
      fetch: createSupabaseFetch(privilegedKey),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with privileged key - bypasses RLS.
// SECURITY: Only use this for trusted server-side operations, never expose to client code.
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
