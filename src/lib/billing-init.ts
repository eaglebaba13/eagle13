/**
 * Phase 20.3B — Install the Razorpay adapter as the active provider.
 *
 * The publishable Razorpay Key ID is the ONLY billing value that may ship to
 * the browser, and only when explicitly baked in as VITE_RAZORPAY_KEY_ID.
 * All other secrets (key secret, webhook secret, service role) MUST stay
 * server-side.
 */
import { setBillingAdapter } from "./billing-adapter";
import { RazorpayBillingAdapter } from "./razorpay-adapter";

let installed = false;

export function installBillingAdapter(): void {
  if (installed) return;
  installed = true;
  const publishableKeyId =
    (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined) ?? null;
  setBillingAdapter(new RazorpayBillingAdapter({ publishableKeyId }));
}