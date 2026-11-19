import { getRequest } from "@tanstack/react-start/server";

/** Admin actions require a real Supabase session and a server-verified role. */
export async function requireStrictSuperadmin(accessToken?: string): Promise<{ userId: string; role: "SUPERADMIN" }> {
  const requestToken = getRequest()?.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = accessToken || requestToken;
  if (!token || token.startsWith("guest-")) throw new Error("UNAUTHORIZED_SUPERADMIN_REQUIRED");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("UNAUTHORIZED_SUPERADMIN_REQUIRED");
  const user = data.user;
  const { data: roles, error: roleError } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", user.id);
  if (roleError) throw new Error("FORBIDDEN_ACCESS_DENIED");
  const designatedIds = (process.env.SUPERADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const isSuperadmin = user.app_metadata?.role === "superadmin" ||
    (designatedIds.includes(user.id) && roles?.some((row) => row.role === "admin"));
  if (!isSuperadmin) throw new Error("FORBIDDEN_ACCESS_DENIED");
  return { userId: user.id, role: "SUPERADMIN" };
}
