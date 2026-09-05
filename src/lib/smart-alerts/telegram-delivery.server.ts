// Server-only Telegram delivery provider for Smart Alerts.
// NEVER expose TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID to the browser.

import type {
  AlertDeliveryAttempt,
  AlertDeliveryProviderId,
  AlertEvent,
  AlertSubscription,
} from "./types";
import type { AlertDeliveryProvider } from "./delivery";

export type TelegramDeliveryStatus =
  | "DELIVERED"
  | "FAILED"
  | "DISABLED"
  | "RETRYABLE_FAILURE"
  | "CONFIGURATION_ERROR";

function getTelegramEnv(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

function formatTelegramMessage(event: AlertEvent): string {
  const lines: string[] = [];

  const priorityEmoji: Record<string, string> = {
    CRITICAL: "\u26a0\ufe0f",
    HIGH: "\ud83d\udd34",
    MEDIUM: "\ud83d\udfe1",
    LOW: "\ud83d\udfe2",
    INFO: "\u2139\ufe0f",
  };

  lines.push(`${priorityEmoji[event.priority] ?? ""} **${event.title}**`);
  lines.push("");

  if (event.instrument) {
    lines.push(`\ud83c\udfaf Instrument: ${event.instrument}`);
  }

  lines.push(`\ud83d\udcca Type: ${event.type}`);
  lines.push(`\u2696\ufe0f Priority: ${event.priority}`);
  lines.push(`\ud83d\udcc5 Date: ${event.tradingDate}`);

  if (event.previousState || event.currentState) {
    lines.push("");
    lines.push(`\u2b05\ufe0f Previous: ${event.previousState ?? "N/A"}`);
    lines.push(`\u27a1\ufe0f Current: ${event.currentState ?? "N/A"}`);
  }

  if (event.summary) {
    lines.push("");
    lines.push(event.summary);
  }

  if (event.evidence.length > 0) {
    lines.push("");
    lines.push("\ud83d\udcdd Evidence:");
    for (const e of event.evidence.slice(0, 5)) {
      const avail = e.available ? "\u2705" : "\u274c";
      lines.push(
        `  ${avail} ${e.module}: ${e.previous ?? "N/A"} \u2192 ${e.current ?? "N/A"} [${e.freshness}]`,
      );
    }
  }

  lines.push("");
  lines.push(`\ud83d\udce1 Source: ${event.sourceModules.join(", ")}`);
  lines.push(`\u23f0 Freshness: ${event.freshness}`);
  lines.push(`\ud83d\udd17 Run: ${event.id.slice(0, 8)}`);
  lines.push("");
  lines.push(`_${event.disclaimer}_`);

  return lines.join("\n");
}

export async function sendTelegramMessage(
  event: AlertEvent,
): Promise<{ status: TelegramDeliveryStatus; errorCode: string | null }> {
  const env = getTelegramEnv();
  if (!env) {
    return { status: "CONFIGURATION_ERROR", errorCode: "MISSING_TELEGRAM_CREDENTIALS" };
  }

  const message = formatTelegramMessage(event);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `https://api.telegram.org/bot${env.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.chatId,
          text: message,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const isRetryable = response.status === 429 || response.status >= 500;
      return {
        status: isRetryable ? "RETRYABLE_FAILURE" : "FAILED",
        errorCode: `TELEGRAM_HTTP_${response.status}: ${body.slice(0, 100)}`,
      };
    }

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return {
        status: "FAILED",
        errorCode: `TELEGRAM_API_ERROR: ${data.description ?? "unknown"}`,
      };
    }

    return { status: "DELIVERED", errorCode: null };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "RETRYABLE_FAILURE", errorCode: "TELEGRAM_TIMEOUT" };
    }
    return {
      status: "RETRYABLE_FAILURE",
      errorCode: `TELEGRAM_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const TelegramServerAlertDeliveryProvider: AlertDeliveryProvider = {
  id: "TELEGRAM" as AlertDeliveryProviderId,
  get enabled() {
    return getTelegramEnv() !== null;
  },
  async deliver(
    event: AlertEvent,
    sub: AlertSubscription | null,
    nowIso: string,
  ): Promise<AlertDeliveryAttempt> {
    const telegramEnabled = sub?.telegramEnabled ?? true;
    if (!telegramEnabled) {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "SKIPPED",
        errorCode: null,
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }

    const env = getTelegramEnv();
    if (!env) {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "DISABLED",
        errorCode: "MISSING_TELEGRAM_CREDENTIALS",
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }

    const result = await sendTelegramMessage(event);
    return {
      provider: "TELEGRAM",
      attemptedAt: nowIso,
      status: result.status === "DELIVERED" ? "DELIVERED" : result.status === "CONFIGURATION_ERROR" ? "DISABLED" : result.status === "RETRYABLE_FAILURE" ? "RETRY" : "FAILED",
      errorCode: result.errorCode,
      retryable: result.status === "RETRYABLE_FAILURE",
      fingerprint: event.fingerprint,
    };
  },
};
