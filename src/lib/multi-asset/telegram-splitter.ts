// Phase 44A — Deterministic Telegram message splitter for the master brief.
//
// Rules:
//   - Every part shares reportId + generatedAt + (seq, total).
//   - Sections are kept intact — a section is NEVER split across parts.
//   - Levels and Disclaimers sections must never be truncated.
//   - If a single section exceeds the budget, it becomes its own part
//     (raw content preserved) rather than silently truncated.

export const TELEGRAM_MAX_CHARS = 4000; // safe budget under Telegram's 4096 hard limit

export interface BriefSection {
  readonly id: string;                 // e.g. "A_HEADER", "C_NIFTY", ...
  readonly title: string;
  readonly body: string;
  readonly protectFromTruncation?: boolean; // true for LEVELS and DISCLAIMERS
}

export interface BriefPart {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly seq: number;
  readonly total: number;
  readonly text: string;
  readonly sectionIds: readonly string[];
}

function renderSection(s: BriefSection): string {
  const title = s.title.trim();
  const body = s.body.trim();
  return title ? `${title}\n${body}` : body;
}

function withHeader(reportId: string, generatedAt: string, seq: number, total: number, body: string): string {
  return `EagleBABA · Report ${reportId} · ${seq}/${total} · ${generatedAt}\n\n${body}`;
}

/**
 * Splits the ordered list of sections into 1..N Telegram parts. Section order
 * is preserved. Two consecutive sections are packed into the same part iff
 * the resulting text (including the shared header) fits under `maxChars`.
 */
export function splitBriefIntoParts(input: {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly sections: readonly BriefSection[];
  readonly maxChars?: number;
}): readonly BriefPart[] {
  const maxChars = input.maxChars ?? TELEGRAM_MAX_CHARS;
  const sections = input.sections.filter((s) => s.body.trim().length > 0);
  if (sections.length === 0) return [];

  // First pass: group sections into buckets that fit under maxChars.
  const buckets: BriefSection[][] = [];
  let current: BriefSection[] = [];
  const fits = (parts: BriefSection[]): boolean => {
    if (parts.length === 0) return true;
    const body = parts.map(renderSection).join("\n\n");
    // Reserve room for the shared header (dummy 1/1 first; seq/total width tiny).
    const preview = withHeader(input.reportId, input.generatedAt, 99, 99, body);
    return preview.length <= maxChars;
  };

  for (const section of sections) {
    const attempt = current.concat(section);
    if (fits(attempt)) {
      current = attempt;
      continue;
    }
    if (current.length > 0) buckets.push(current);
    // Section alone might still exceed budget; if it's protected, we
    // still emit it whole rather than truncate.
    current = [section];
  }
  if (current.length > 0) buckets.push(current);

  const total = buckets.length;
  return buckets.map((bucket, i) => {
    const seq = i + 1;
    const body = bucket.map(renderSection).join("\n\n");
    const text = withHeader(input.reportId, input.generatedAt, seq, total, body);
    return {
      reportId: input.reportId,
      generatedAt: input.generatedAt,
      seq,
      total,
      text,
      sectionIds: bucket.map((s) => s.id),
    };
  });
}