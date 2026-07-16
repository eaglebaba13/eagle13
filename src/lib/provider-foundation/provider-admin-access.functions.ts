import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminAccessBlocker =
  | "AUTH_REQUIRED"
  | "PROFILE_MISSING"
  | "ADMIN_ROLE_MISSING"
  | "HAS_ROLE_RPC_FAILED"
  | "APPLICATION_FORBIDDEN";

export interface ProviderAdminAccess {
  readonly authenticated: boolean;
  readonly userIdPresent: boolean;
  readonly profilePresent: boolean;
  readonly adminRolePresent: boolean;
  readonly hasRoleRpcOk: boolean;
  readonly canRunSmokeTest: boolean;
  readonly blocker: AdminAccessBlocker | null;
  readonly safeMessage: string;
}

/**
 * Admin-only access diagnostics for `/admin/providers`. Read-only; never
 * returns tokens, provider bodies, emails, or raw Supabase error payloads.
 * The middleware itself enforces authentication; if the request lacks a
 * valid bearer token it 401s before this handler runs and the client
 * surfaces AUTH_REQUIRED.
 */
export const getProviderAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProviderAdminAccess> => {
    const userIdPresent = typeof context.userId === "string" && context.userId.length > 0;

    let profilePresent = false;
    try {
      const { data } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("id", context.userId)
        .maybeSingle();
      profilePresent = !!data;
    } catch {
      profilePresent = false;
    }

    let hasRoleRpcOk = false;
    let adminRolePresent = false;
    try {
      const { data, error } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      hasRoleRpcOk = !error;
      adminRolePresent = data === true;
    } catch {
      hasRoleRpcOk = false;
    }

    let blocker: AdminAccessBlocker | null = null;
    if (!userIdPresent) blocker = "AUTH_REQUIRED";
    else if (!profilePresent) blocker = "PROFILE_MISSING";
    else if (!hasRoleRpcOk) blocker = "HAS_ROLE_RPC_FAILED";
    else if (!adminRolePresent) blocker = "ADMIN_ROLE_MISSING";

    const canRunSmokeTest = blocker === null;
    const safeMessage = describeBlocker(blocker);

    return {
      authenticated: userIdPresent,
      userIdPresent,
      profilePresent,
      adminRolePresent,
      hasRoleRpcOk,
      canRunSmokeTest,
      blocker,
      safeMessage,
    };
  });

export function describeBlocker(blocker: AdminAccessBlocker | null): string {
  switch (blocker) {
    case null:
      return "Admin access granted.";
    case "AUTH_REQUIRED":
      return "Sign in to access provider diagnostics.";
    case "PROFILE_MISSING":
      return "Your account profile is missing. Contact support.";
    case "ADMIN_ROLE_MISSING":
      return "Admin role required to run the live provider test.";
    case "HAS_ROLE_RPC_FAILED":
      return "Role check RPC is unavailable. Contact support.";
    case "APPLICATION_FORBIDDEN":
      return "Application forbidden.";
  }
}