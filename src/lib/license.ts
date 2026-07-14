import { PLAN_FOR_ROLE, type AppRole } from "./roles";

export interface SubscriptionRow {
  plan: string;
  license_key: string | null;
  status: string;
  activated_at: string;
  expires_at: string | null;
  engine_version: string;
}

export interface LicenseView {
  plan: string;
  planLabel: string;
  licenseKey: string;
  status: "active" | "expired" | "trial" | "inactive";
  activatedAt: Date;
  expiresAt: Date | null;
  daysRemaining: number | null;
  engineVersion: string;
}

export function buildLicenseView(
  row: SubscriptionRow | null,
  role: AppRole,
  now: Date = new Date(),
): LicenseView {
  if (!row) {
    return {
      plan: role,
      planLabel: PLAN_FOR_ROLE[role],
      licenseKey: "—",
      status: "active",
      activatedAt: now,
      expiresAt: null,
      daysRemaining: null,
      engineVersion: "v1.0",
    };
  }
  const activatedAt = new Date(row.activated_at);
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000))
    : null;
  const rawStatus = row.status.toLowerCase();
  const status: LicenseView["status"] =
    expiresAt && expiresAt.getTime() < now.getTime()
      ? "expired"
      : rawStatus === "trial"
        ? "trial"
        : rawStatus === "inactive"
          ? "inactive"
          : "active";
  return {
    plan: row.plan,
    planLabel: PLAN_FOR_ROLE[role] ?? row.plan,
    licenseKey: row.license_key ?? "—",
    status,
    activatedAt,
    expiresAt,
    daysRemaining,
    engineVersion: row.engine_version,
  };
}