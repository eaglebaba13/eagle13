// Phase 43 — INDmoney referral constants.
// Public information; safe to ship in client bundle.

export const INDMONEY_REFERRAL_URL =
  "https://indmoney.onelink.me/RmHC/0mewvsqe";
export const INDMONEY_REFERRAL_CODE = "QUJLFDEOIND";
export const REFERRAL_REWARD_DAYS = 7;
export const REFERRAL_REQUEST_TTL_DAYS = 30;

/** Mask everything except the last 4 characters. Used before submit. */
export function maskClientId(raw: string): string {
  const s = (raw ?? "").trim();
  if (s.length <= 4) return s.padStart(4, "•");
  return "•".repeat(Math.min(6, s.length - 4)) + s.slice(-4);
}

/** Copy a string to the clipboard; resolves to `true` on success. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}