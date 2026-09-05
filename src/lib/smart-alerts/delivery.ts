// Phase 3C — Delivery adapters. In-app implemented; external via server-only providers.

import type {
  AlertDeliveryAttempt,
  AlertDeliveryProviderId,
  AlertEvent,
  AlertSubscription,
} from "./types";

export interface AlertDeliveryProvider {
  readonly id: AlertDeliveryProviderId;
  readonly enabled: boolean;
  deliver(
    event: AlertEvent,
    subscription: AlertSubscription | null,
    nowIso: string,
  ): AlertDeliveryAttempt | Promise<AlertDeliveryAttempt>;
}

export const InAppAlertDeliveryProvider: AlertDeliveryProvider = {
  id: "IN_APP",
  enabled: true,
  deliver(event, sub, nowIso) {
    const enabled = sub?.inAppEnabled ?? true;
    return {
      provider: "IN_APP",
      attemptedAt: nowIso,
      status: enabled ? "DELIVERED" : "SKIPPED",
      errorCode: null,
      retryable: false,
      fingerprint: event.fingerprint,
    };
  },
};

function makeDisabledProvider(id: AlertDeliveryProviderId): AlertDeliveryProvider {
  return {
    id,
    enabled: false,
    deliver(event, _sub, nowIso) {
      return {
        provider: id,
        attemptedAt: nowIso,
        status: "DISABLED",
        errorCode: null,
        retryable: false,
        fingerprint: event.fingerprint,
      };
    },
  };
}

export const EmailAlertDeliveryProvider = makeDisabledProvider("EMAIL");
export const WebhookAlertDeliveryProvider = makeDisabledProvider("WEBHOOK");

/**
 * Telegram provider is loaded lazily from the server-only module.
 * On the client or when credentials are absent, it returns DISABLED.
 */
export const TelegramAlertDeliveryProvider: AlertDeliveryProvider = {
  id: "TELEGRAM",
  enabled: typeof process !== "undefined" && !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
  async deliver(event, sub, nowIso) {
    if (typeof process === "undefined" || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "DISABLED",
        errorCode: "MISSING_TELEGRAM_CREDENTIALS",
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }
    try {
      const { TelegramServerAlertDeliveryProvider } = await import("./telegram-delivery.server");
      return TelegramServerAlertDeliveryProvider.deliver(event, sub, nowIso);
    } catch {
      return {
        provider: "TELEGRAM",
        attemptedAt: nowIso,
        status: "FAILED",
        errorCode: "TELEGRAM_PROVIDER_LOAD_ERROR",
        retryable: false,
        fingerprint: event.fingerprint,
      };
    }
  },
};

export const DEFAULT_DELIVERY_PROVIDERS: readonly AlertDeliveryProvider[] = [
  InAppAlertDeliveryProvider,
  EmailAlertDeliveryProvider,
  TelegramAlertDeliveryProvider,
  WebhookAlertDeliveryProvider,
];

export async function deliverEvent(
  event: AlertEvent,
  sub: AlertSubscription | null,
  nowIso: string,
  providers: readonly AlertDeliveryProvider[] = DEFAULT_DELIVERY_PROVIDERS,
): Promise<AlertDeliveryAttempt[]> {
  return Promise.all(providers.map((p) => p.deliver(event, sub, nowIso)));
}
