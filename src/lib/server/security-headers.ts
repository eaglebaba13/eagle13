/**
 * EagleBABA Platform Security Hardening — HTTP Security Headers & Information Masking
 *
 * Enforces Zero-Trust header policies to prevent:
 * - Clickjacking (X-Frame-Options: DENY, frame-ancestors 'none')
 * - MIME-sniffing (X-Content-Type-Options: nosniff)
 * - SSL-stripping (HSTS with 2-year preload)
 * - Referrer leakage (Referrer-Policy: strict-origin-when-cross-origin)
 * - Hardware device probing (Permissions-Policy)
 * - Tech-stack fingerprinting (Stripping Server, X-Powered-By, X-Nitro-Cache)
 */

export const ZERO_TRUST_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss: ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
};

export const MASKED_SERVER_HEADERS: readonly string[] = [
  "x-powered-by",
  "server",
  "x-nitro-cache",
  "x-nitro-version",
  "x-h3-version",
];

/**
 * Apply strict security headers and strip all fingerprinting headers.
 */
export function applySecurityHeaders(headers: Headers): Headers {
  // Strip fingerprinting headers
  for (const name of MASKED_SERVER_HEADERS) {
    headers.delete(name);
  }

  // Inject strict Zero-Trust security headers
  for (const [key, value] of Object.entries(ZERO_TRUST_SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  return headers;
}
