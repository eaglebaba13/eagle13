// Phase 43 — TypeScript mirrors of the referral_requests schema.

export type ReferralBroker = "INDMONEY";

export type ReferralStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELED";

export interface ReferralRequestRow {
  id: string;
  user_id: string;
  broker: ReferralBroker;
  referral_code: string;
  broker_client_id_masked: string;
  screenshot_url: string | null;
  user_note: string | null;
  declaration_accepted: boolean;
  status: ReferralStatus;
  admin_note: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  verified_at: string | null;
  verified_by: string | null;
  reward_grant_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELED: "Canceled",
};

export function isTerminalReferralStatus(s: ReferralStatus): boolean {
  return s === "APPROVED" || s === "REJECTED" || s === "EXPIRED" || s === "CANCELED";
}