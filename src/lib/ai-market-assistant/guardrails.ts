// Phase 3B — Guardrails. Reject execution or certainty wording.

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /guaranteed profit/i,
  /sure[- ]?shot/i,
  /100\s?% accurate/i,
  /risk[- ]?free/i,
  /\bbuy now\b/i,
  /\bsell now\b/i,
  /place (an? )?order/i,
  /target guaranteed/i,
  /guaranteed (return|target|gain)/i,
];

export interface GuardrailResult {
  readonly text: string;
  readonly violations: number;
}

export function sanitize(text: string): GuardrailResult {
  let out = text;
  let violations = 0;
  for (const rx of FORBIDDEN_PATTERNS) {
    if (rx.test(out)) {
      violations++;
      out = out.replace(rx, "[research language redacted]");
    }
  }
  return { text: out, violations };
}

export function sanitizeAll(items: readonly string[]): { items: string[]; violations: number } {
  let violations = 0;
  const cleaned: string[] = [];
  for (const it of items) {
    const r = sanitize(it);
    violations += r.violations;
    cleaned.push(r.text);
  }
  return { items: cleaned, violations };
}