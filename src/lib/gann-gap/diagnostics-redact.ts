// Phase 2I-C — Safe redaction helper for Gann Gap diagnostics exports.
// Strips URLs, bearer tokens, JWT-like strings, keys named authorization/api key/service role.

const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/gi;
const BEARER_RE = /\b[Bb]earer\s+[A-Za-z0-9._-]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const SENSITIVE_KEYS = /^(authorization|api[-_]?key|secret|token|service[-_]?role|password|supabase[-_]?url)$/i;

export function redactString(s: string): string {
  return s
    .replace(URL_RE, "[REDACTED_URL]")
    .replace(BEARER_RE, "[REDACTED_BEARER]")
    .replace(JWT_RE, "[REDACTED_JWT]");
}

export function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}

export function safeDiagnosticsJson(payload: unknown): string {
  return JSON.stringify(redactValue(payload), null, 2);
}
