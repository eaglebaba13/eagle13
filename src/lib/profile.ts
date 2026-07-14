import type { AppRole } from "./roles";

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  country: string | null;
  currency: string | null;
  preferred_broker: string | null;
  preferred_instrument: string | null;
  language: string | null;
  theme: string | null;
}

export interface SerializedProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  country: string;
  currency: string;
  preferredBroker: string | null;
  preferredInstrument: string;
  language: string;
  theme: string;
  role: AppRole;
}

export function serializeProfile(row: ProfileRow, role: AppRole): SerializedProfile {
  const email = row.email ?? "";
  return {
    id: row.id,
    email,
    displayName: row.display_name?.trim() || email.split("@")[0] || "Trader",
    avatarUrl: row.avatar_url,
    timezone: row.timezone ?? "Asia/Kolkata",
    country: row.country ?? "IN",
    currency: row.currency ?? "INR",
    preferredBroker: row.preferred_broker,
    preferredInstrument: row.preferred_instrument ?? "NIFTY",
    language: row.language ?? "en",
    theme: row.theme ?? "dark",
    role,
  };
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("") || "U";
}