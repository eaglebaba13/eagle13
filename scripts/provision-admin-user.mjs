#!/usr/bin/env node
/**
 * EagleBABA Operator Provisioning Utility
 *
 * Provisions an administrator or researcher account directly in Supabase
 * with pre-confirmed email and grants the specified role.
 *
 * Usage:
 *   node scripts/provision-admin-user.mjs <email> <password> [role]
 *
 * Example:
 *   node scripts/provision-admin-user.mjs trader@example.com StrongPassword123 admin
 */

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
const role = (process.argv[4]?.trim().toLowerCase() || "admin");

if (!email || !password) {
  console.error("Usage: node scripts/provision-admin-user.mjs <email> <password> [role]");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[Provision] Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`[Provision] Checking account for: ${email}`);

  // 1. Check existing users
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("[Provision] Failed to list users:", listError.message);
    process.exit(1);
  }

  let user = userList.users.find((u) => u.email?.toLowerCase() === email);

  if (user) {
    console.log(`[Provision] Existing user found (${user.id}). Updating password and confirming email...`);
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        password,
        email_confirm: true,
        user_metadata: { full_name: email.split("@")[0] },
      }
    );
    if (updateError) {
      console.error("[Provision] Failed to update user:", updateError.message);
      process.exit(1);
    }
    user = updated.user;
  } else {
    console.log(`[Provision] Creating new confirmed user...`);
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: email.split("@")[0] },
    });
    if (createError) {
      console.error("[Provision] Failed to create user:", createError.message);
      process.exit(1);
    }
    user = created.user;
  }

  const userId = user.id;
  console.log(`[Provision] User ID: ${userId}`);

  // 2. Upsert profile
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      display_name: email.split("@")[0],
      primary_role: role,
      active_plan: role === "admin" ? "Enterprise" : "Pro",
    },
    { onConflict: "id" }
  );
  if (profileError) {
    console.warn("[Provision] Profile warning:", profileError.message);
  }

  // 3. Upsert user role
  const { error: roleError } = await supabase.from("user_roles").upsert(
    {
      user_id: userId,
      role,
    },
    { onConflict: "user_id,role" }
  );
  if (roleError) {
    console.warn("[Provision] Role warning:", roleError.message);
  }

  console.log(`[Provision] SUCCESS: ${email} is provisioned with role "${role}" and confirmed email.`);
}

main().catch((err) => {
  console.error("[Provision] Unexpected error:", err);
  process.exit(1);
});
