import { describe, expect, it } from "vitest";
import {
  INDMONEY_REFERRAL_CODE,
  INDMONEY_REFERRAL_URL,
  REFERRAL_REWARD_DAYS,
  maskClientId,
} from "./constants";
import { REFERRAL_STATUS_LABEL, isTerminalReferralStatus } from "./types";

describe("Phase 43 · referrals helpers", () => {
  it("exposes stable INDmoney metadata", () => {
    expect(INDMONEY_REFERRAL_URL).toMatch(/^https:\/\/indmoney\.onelink\.me\//);
    expect(INDMONEY_REFERRAL_CODE).toBe("QUJLFDEOIND");
    expect(REFERRAL_REWARD_DAYS).toBe(7);
  });

  it("masks long client ids to the last 4 chars", () => {
    expect(maskClientId("ABCDEFGH1234")).toBe("••••••1234");
    expect(maskClientId("ABCD1234")).toBe("••••1234");
  });

  it("returns short client ids padded with dots", () => {
    expect(maskClientId("12")).toBe("••12");
    expect(maskClientId("")).toBe("••••");
  });

  it("labels every referral status", () => {
    expect(REFERRAL_STATUS_LABEL.PENDING).toBe("Pending");
    expect(REFERRAL_STATUS_LABEL.APPROVED).toBe("Approved");
  });

  it("classifies terminal states", () => {
    expect(isTerminalReferralStatus("APPROVED")).toBe(true);
    expect(isTerminalReferralStatus("REJECTED")).toBe(true);
    expect(isTerminalReferralStatus("EXPIRED")).toBe(true);
    expect(isTerminalReferralStatus("CANCELED")).toBe(true);
    expect(isTerminalReferralStatus("PENDING")).toBe(false);
    expect(isTerminalReferralStatus("UNDER_REVIEW")).toBe(false);
  });
});