// Phase 3C — Delivery adapters. In-app implemented; external disabled by default.

import type {
  AlertDeliveryAttempt,
  AlertDeliveryProviderId,
  AlertEvent,
  AlertSubscription,
} from "./types";

export interface AlertDeliveryProvider {
  readonly id: AlertDeliveryProviderId;
  readonly enabled: boolean;
  deliver(event: AlertEvent, subscription: AlertSubscription | null, nowIso: string): AlertDeliveryAttempt;
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
export const TelegramAlertDeliveryProvider = makeDisabledProvider("TELEGRAM");
export const WebhookAlertDeliveryProvider = makeDisabledProvider("WEBHOOK");

export const DEFAULT_DELIVERY_PROVIDERS: readonly AlertDeliveryProvider[] = [
  InAppAlertDeliveryProvider,
  EmailAlertDeliveryProvider,
  TelegramAlertDeliveryProvider,
  WebhookAlertDeliveryProvider,
];

export function deliverEvent(
  event: AlertEvent,
  sub: AlertSubscription | null,
  nowIso: string,
  providers: readonly AlertDeliveryProvider[] = DEFAULT_DELIVERY_PROVIDERS,
): AlertDeliveryAttempt[] {
  return providers.map((p) => p.deliver(event, sub, nowIso));
}