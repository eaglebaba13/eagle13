// Phase 44B — Server-only Telegram delivery for the morning brief.
// Reuses the Phase 44A splitter and inherits the "silent no-op when
// credentials are missing" contract from the referrals notifier.

import { splitBriefIntoParts, type BriefSection, type BriefPart } from "./telegram-splitter";

export interface DeliveryOutcome {
  readonly delivered: boolean;
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly parts: readonly BriefPart[];
  readonly messageIds: readonly number[];
  readonly error?: string;
}

export async function deliverMorningBrief(input: {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly sections: readonly BriefSection[];
}): Promise<DeliveryOutcome> {
  const parts = splitBriefIntoParts({
    reportId: input.reportId,
    generatedAt: input.generatedAt,
    sections: input.sections,
  });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return {
      delivered: false, attempted: 0, succeeded: 0, failed: 0,
      parts, messageIds: [], error: "TELEGRAM_CREDENTIALS_UNCONFIGURED",
    };
  }

  const messageIds: number[] = [];
  let succeeded = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const part of parts) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: part.text, disable_web_page_preview: true }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
      if (res.ok && body?.ok && typeof body.result?.message_id === "number") {
        succeeded++;
        messageIds.push(body.result.message_id);
      } else {
        failed++;
        if (!firstError) firstError = body?.description ?? `HTTP ${res.status}`;
      }
    } catch (err) {
      failed++;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    delivered: failed === 0 && succeeded === parts.length,
    attempted: parts.length,
    succeeded,
    failed,
    parts,
    messageIds,
    error: firstError,
  };
}