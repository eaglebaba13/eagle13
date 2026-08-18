// Phase P1 — Server-only Telegram delivery for signal transitions.
// Reuses the same credential validation and delivery pattern as the
// morning-brief pipeline (report-telegram.server.ts).
// Diagnostics expose only presence/status, never token values, chat IDs,
// headers, or raw Telegram responses.

import {
  formatSignalTelegramMessage,
  computeTransitionFingerprint,
} from "./engine";
import type {
  SignalTransition,
  SignalTelegramDeliveryResult,
} from "./types";
import {
  type TelegramConfigurationPresence,
  type TelegramDeliveryStatus,
  validateTelegramMorningBriefConfiguration,
  resetTelegramMorningBriefDeliveryForTests,
} from "@/lib/multi-asset/report-telegram.server";

// Re-export for downstream consumers
export type { TelegramConfigurationPresence, TelegramDeliveryStatus };

// ---------------------------------------------------------------------------
// In-memory dedup (process-lifetime, mirrors morning-brief pattern)
// ---------------------------------------------------------------------------

const deliveredSignalIds = new Set<string>();
const inFlightSignalIds = new Set<string>();

export function resetSignalTelegramDeliveryForTests(): void {
  deliveredSignalIds.clear();
  inFlightSignalIds.clear();
  resetTelegramMorningBriefDeliveryForTests();
}

function redactError(message: string): string {
  return message
    .replace(/token|secret|authorization|cookie|api[-_]?key|bearer|chat[_ -]?id/gi, "[REDACTED]")
    .slice(0, 160);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

type FetchLike = typeof fetch;

interface TelegramEnvLike {
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_CHAT_ID?: string;
  readonly TELEGRAM_ENABLED?: string;
  readonly TELEGRAM_MORNING_BRIEF_ENABLED?: string;
  readonly TELEGRAM_SIGNAL_ALERTS_ENABLED?: string;
}

/**
 * Validate Telegram configuration for signal alerts.
 * Reuses the same credential validation as morning brief.
 * Adds an optional TELEGRAM_SIGNAL_ALERTS_ENABLED flag.
 */
export function validateSignalAlertTelegramConfiguration(
  env: TelegramEnvLike = process.env as TelegramEnvLike,
): TelegramConfigurationPresence & { readonly signalAlertsEnabled: boolean } {
  const base = validateTelegramMorningBriefConfiguration(env);
  const signalAlertsRaw = env.TELEGRAM_SIGNAL_ALERTS_ENABLED;
  const signalAlertsEnabled = signalAlertsRaw == null
    ? true // default on if base config is ready
    : /^(1|true|yes|enabled|on)$/i.test(signalAlertsRaw.trim());
  return { ...base, signalAlertsEnabled };
}

/**
 * Deliver a single signal transition notification to Telegram.
 * Deduplicates by transition fingerprint. Never exposes secrets.
 */
export async function deliverSignalAlert(input: {
  readonly signal: SignalTransition;
  readonly env?: TelegramEnvLike;
  readonly fetchImpl?: FetchLike;
}): Promise<SignalTelegramDeliveryResult> {
  const fingerprint = computeTransitionFingerprint(input.signal.key);
  const deliveryId = `signal:${fingerprint}`;

  // Deduplication
  if (deliveredSignalIds.has(deliveryId)) {
    return { delivered: false, status: "DUPLICATE", messageId: null };
  }
  if (inFlightSignalIds.has(deliveryId)) {
    return { delivered: false, status: "SENDING", messageId: null, error: "DELIVERY_IN_FLIGHT" };
  }

  // Skip non-directional (WAIT) unless explicitly transitioning to WAIT
  // WAIT transitions ARE notified per spec (BUY→WAIT, SELL→WAIT)

  // Validate configuration
  const env = input.env ?? (process.env as TelegramEnvLike);
  const config = validateSignalAlertTelegramConfiguration(env);
  if (config.status !== "READY") {
    return {
      delivered: false,
      status: "CONFIG_MISSING",
      messageId: null,
      error: config.status,
    };
  }
  if (!config.signalAlertsEnabled) {
    return {
      delivered: false,
      status: "SKIPPED",
      messageId: null,
      error: "SIGNAL_ALERTS_DISABLED",
    };
  }

  // Format message
  const msg = formatSignalTelegramMessage(input.signal);

  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = env.TELEGRAM_CHAT_ID?.trim() ?? "";
  const fetcher = input.fetchImpl ?? fetch;

  inFlightSignalIds.add(deliveryId);
  try {
    const res = await fetcher(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg.text,
          parse_mode: msg.parseMode ?? "HTML",
          disable_web_page_preview: true,
        }),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    } | null;

    if (res.ok && body?.ok && typeof body.result?.message_id === "number") {
      deliveredSignalIds.add(deliveryId);
      return {
        delivered: true,
        status: "DELIVERED",
        messageId: body.result.message_id,
      };
    }

    return {
      delivered: false,
      status: "FAILED",
      messageId: null,
      error: redactError(body?.description ?? `HTTP ${res.status}`),
    };
  } catch (err) {
    return {
      delivered: false,
      status: "FAILED",
      messageId: null,
      error: redactError(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    inFlightSignalIds.delete(deliveryId);
  }
}
