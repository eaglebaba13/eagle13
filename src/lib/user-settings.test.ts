import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadUserSettings,
  saveUserSettings,
  DEFAULT_USER_PREFERENCES,
  USER_SETTINGS_STORAGE_KEY,
} from "./user-settings";

function makeMockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("user-settings", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = makeMockStorage();
    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads default settings when storage is empty", () => {
    const settings = loadUserSettings();
    expect(settings.defaultIndex).toBe("NIFTY 50");
    expect(settings.defaultTimeframe).toBe("5m");
    expect(settings.gannAngleOverlay).toBe("360");
    expect(settings.soundAlerts).toBe(true);
  });

  it("saves and persists settings updates", () => {
    const updated = saveUserSettings({
      defaultIndex: "BSE SENSEX",
      defaultTimeframe: "15m",
      gannAngleOverlay: "180",
      compactMode: true,
      numberFormat: "intl",
    });

    expect(updated.defaultIndex).toBe("BSE SENSEX");
    expect(updated.defaultTimeframe).toBe("15m");
    expect(updated.gannAngleOverlay).toBe("180");
    expect(updated.compactMode).toBe(true);
    expect(updated.numberFormat).toBe("intl");

    // Verify stored in localStorage
    const raw = mockStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.defaultIndex).toBe("BSE SENSEX");
  });

  it("preserves unmodified settings on partial update", () => {
    saveUserSettings({ defaultIndex: "BANK NIFTY" });
    saveUserSettings({ soundAlerts: false });

    const current = loadUserSettings();
    expect(current.defaultIndex).toBe("BANK NIFTY");
    expect(current.soundAlerts).toBe(false);
    expect(current.defaultTimeframe).toBe("5m"); // preserved
  });
});
