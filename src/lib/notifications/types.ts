// Phase 44 — Notification Center types.
//
// Mirrors the `public.notifications` table (see migration in phase 44).
// Kept dependency-free so it can be imported by both client and server code.

export type NotificationType =
  | "BUY_CE"
  | "BUY_PE"
  | "EXIT"
  | "HIGH_RISK"
  | "REFERRAL_SUBMITTED"
  | "REFERRAL_APPROVED"
  | "REFERRAL_REJECTED"
  | "TRIAL_EXPIRING"
  | "SUBSCRIPTION_EXPIRED";

export type NotificationPayload =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: NotificationPayload }
  | readonly NotificationPayload[];

export interface NotificationRow {
  readonly id: string;
  readonly user_id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  readonly payload: NotificationPayload;
  readonly read_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  BUY_CE: "Buy CE",
  BUY_PE: "Buy PE",
  EXIT: "Exit",
  HIGH_RISK: "High risk",
  REFERRAL_SUBMITTED: "Referral submitted",
  REFERRAL_APPROVED: "Referral approved",
  REFERRAL_REJECTED: "Referral rejected",
  TRIAL_EXPIRING: "Trial expiring",
  SUBSCRIPTION_EXPIRED: "Subscription expired",
};

export const NOTIFICATION_TYPE_TONE: Record<NotificationType, "info" | "success" | "warn" | "danger"> = {
  BUY_CE: "success",
  BUY_PE: "success",
  EXIT: "info",
  HIGH_RISK: "danger",
  REFERRAL_SUBMITTED: "info",
  REFERRAL_APPROVED: "success",
  REFERRAL_REJECTED: "warn",
  TRIAL_EXPIRING: "warn",
  SUBSCRIPTION_EXPIRED: "danger",
};

export const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = [
  "BUY_CE",
  "BUY_PE",
  "EXIT",
  "HIGH_RISK",
  "REFERRAL_SUBMITTED",
  "REFERRAL_APPROVED",
  "REFERRAL_REJECTED",
  "TRIAL_EXPIRING",
  "SUBSCRIPTION_EXPIRED",
];

export function isNotificationRead(row: NotificationRow): boolean {
  return row.read_at !== null;
}