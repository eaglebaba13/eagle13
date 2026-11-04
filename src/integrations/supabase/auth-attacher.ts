import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";
import { isGuestSessionActive, GUEST_TOKEN } from "@/lib/guest-session";

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      /* ignore Supabase client session read errors */
    }

    if (!token && isGuestSessionActive()) {
      token = GUEST_TOKEN;
    }

    return next({
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            ...(token === GUEST_TOKEN ? { "x-guest-access": "true" } : {}),
          }
        : {},
    });
  },
);
