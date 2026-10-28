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
  readonly errorCode?: string;
}

export function getMorningBriefDeliveryDisabledReason(): string | null {
  if (process.env.TELEGRAM_ENABLED?.trim().toLowerCase() !== "true") {
    return "TELEGRAM_DISABLED";
  }
  if (process.env.TELEGRAM_MORNING_BRIEF_ENABLED?.trim().toLowerCase() !== "true") {
    return "TELEGRAM_MORNING_BRIEF_DISABLED";
  }
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
    return "TELEGRAM_CREDENTIALS_UNCONFIGURED";
  }
  return null;
}

function logDelivery(delivered: boolean, attempted: number, errorCode?: string): void {
  console[delivered ? "info" : "warn"](
    JSON.stringify({
      event: "morning_brief.telegram_delivery",
      delivered,
      attempted,
      ...(errorCode ? { errorCode } : {}),
    }),
  );
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

  const disabledReason = getMorningBriefDeliveryDisabledReason();
  if (disabledReason) {
    const outcome: DeliveryOutcome = {
      delivered: false,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      parts,
      messageIds: [],
      errorCode: disabledReason,
    };
    logDelivery(false, outcome.attempted, outcome.errorCode);
    return outcome;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    const outcome: DeliveryOutcome = {
      delivered: false,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      parts,
      messageIds: [],
      errorCode: "TELEGRAM_CREDENTIALS_UNCONFIGURED",
    };
    logDelivery(false, outcome.attempted, outcome.errorCode);
    return outcome;
  }

  const messageIds: number[] = [];
  let succeeded = 0;
  let failed = 0;
  let firstErrorCode: string | undefined;

  for (const part of parts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: part.text, disable_web_page_preview: true }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
        error_code?: number;
      } | null;
      if (res.ok && body?.ok && typeof body.result?.message_id === "number") {
        succeeded++;
        messageIds.push(body.result.message_id);
      } else {
        failed++;
        if (!firstErrorCode) {
          firstErrorCode = !res.ok
            ? `TELEGRAM_HTTP_${res.status}`
            : body?.error_code
              ? `TELEGRAM_API_${body.error_code}`
              : "TELEGRAM_INVALID_RESPONSE";
        }
      }
    } catch (err) {
      failed++;
      if (!firstErrorCode) {
        firstErrorCode =
          err instanceof Error && err.name === "AbortError"
            ? "TELEGRAM_TIMEOUT"
            : "TELEGRAM_NETWORK_ERROR";
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const outcome: DeliveryOutcome = {
    delivered: failed === 0 && succeeded === parts.length,
    attempted: parts.length,
    succeeded,
    failed,
    parts,
    messageIds,
    ...(firstErrorCode ? { errorCode: firstErrorCode } : {}),
  };
  logDelivery(outcome.delivered, outcome.attempted, outcome.errorCode);
  return outcome;
}
