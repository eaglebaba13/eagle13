/**
 * Guest Research Session Utility
 *
 * Provides persistent guest access for research workstation routes without
 * requiring mandatory Supabase email/password sign-in.
 */

export const GUEST_COOKIE_NAME = "eb_guest_session";
export const GUEST_TOKEN = "guest-research-token";
export const GUEST_USER_ID = "guest-researcher";

export function isGuestSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hasStorage = window.localStorage.getItem(GUEST_COOKIE_NAME) === "true";
    const hasCookie = document.cookie
      .split(";")
      .some((item) => item.trim().startsWith(`${GUEST_COOKIE_NAME}=`));
    return hasStorage || hasCookie;
  } catch {
    return false;
  }
}

export function enableGuestSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_COOKIE_NAME, "true");
    // 30 days expiry
    document.cookie = `${GUEST_COOKIE_NAME}=1; Path=/; Max-Age=2592000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function clearGuestSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_COOKIE_NAME);
    document.cookie = `${GUEST_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}
