// Phase 3C — Text guardrails for alert titles/summaries.

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bguaranteed\b/i,
  /\bsure[- ]?shot\b/i,
  /\b100\s*%\s*accurate\b/i,
  /\brisk[- ]?free\b/i,
  /\bbuy\s+immediately\b/i,
  /\bsell\s+immediately\b/i,
  /\bplace\s+order\b/i,
  /\bguaranteed\s+target\b/i,
  /\bcertain(ty)?\s+profit\b/i,
];

export function sanitizeAlertText(text: string): { text: string; violations: number } {
  let out = text;
  let violations = 0;
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(out)) {
      violations++;
      out = out.replace(pat, "[redacted]");
    }
  }
  return { text: out, violations };
}