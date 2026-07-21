import { describe, expect, it } from "vitest";
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  isNotificationRead,
  type NotificationRow,
} from "./types";

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "u1",
    type: "BUY_CE",
    title: "Buy CE 25000",
    body: null,
    link: "/signal-history",
    payload: { instrument: "NIFTY" },
    read_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("notifications/types", () => {
  it("labels every notification type", () => {
    for (const t of ALL_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_LABEL[t]).toBeTruthy();
      expect(NOTIFICATION_TYPE_TONE[t]).toBeTruthy();
    }
  });

  it("tones the four signal + subscription types correctly", () => {
    expect(NOTIFICATION_TYPE_TONE.BUY_CE).toBe("success");
    expect(NOTIFICATION_TYPE_TONE.BUY_PE).toBe("success");
    expect(NOTIFICATION_TYPE_TONE.EXIT).toBe("info");
    expect(NOTIFICATION_TYPE_TONE.HIGH_RISK).toBe("danger");
    expect(NOTIFICATION_TYPE_TONE.REFERRAL_APPROVED).toBe("success");
    expect(NOTIFICATION_TYPE_TONE.REFERRAL_REJECTED).toBe("warn");
    expect(NOTIFICATION_TYPE_TONE.TRIAL_EXPIRING).toBe("warn");
    expect(NOTIFICATION_TYPE_TONE.SUBSCRIPTION_EXPIRED).toBe("danger");
  });

  it("isNotificationRead reflects read_at", () => {
    expect(isNotificationRead(makeRow())).toBe(false);
    expect(isNotificationRead(makeRow({ read_at: new Date().toISOString() }))).toBe(true);
  });

  it("exposes all 9 supported notification types", () => {
    expect(ALL_NOTIFICATION_TYPES).toHaveLength(9);
  });
});