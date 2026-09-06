import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getAudioAssetUrl,
  getAudioNotificationManager,
  createAudioNotificationManager,
  type AudioEvent,
} from "./audio-notifications";

// ────────────────────── Asset Validation ───────────────────────────

describe("audio asset validation", () => {
  it("eagle-calling.wav exists in public/audio/", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const assetPath = path.resolve(__dirname, "../../public/audio/eagle-calling.wav");
    expect(fs.existsSync(assetPath)).toBe(true);
  });

  it("eagle-chirping.wav exists in public/audio/", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const assetPath = path.resolve(__dirname, "../../public/audio/eagle-chirping.wav");
    expect(fs.existsSync(assetPath)).toBe(true);
  });
});

// ────────────────────── Real Mapping Tests ─────────────────────────

describe("audio event → asset mapping", () => {
  it("RESEARCH_SIGNAL maps to /audio/eagle-calling.wav", () => {
    expect(getAudioAssetUrl("RESEARCH_SIGNAL")).toBe("/audio/eagle-calling.wav");
  });

  it("NEWS_IMPACT maps to /audio/eagle-chirping.wav", () => {
    expect(getAudioAssetUrl("NEWS_IMPACT")).toBe("/audio/eagle-chirping.wav");
  });

  it("mapping is exhaustive — all AudioEvent types have entries", () => {
    const events: AudioEvent[] = ["RESEARCH_SIGNAL", "NEWS_IMPACT"];
    for (const event of events) {
      expect(getAudioAssetUrl(event)).toBeTruthy();
      expect(getAudioAssetUrl(event)).toMatch(/^\/audio\/.*\.wav$/);
    }
  });
});

// ────────────────────── Real Playback Invocation ───────────────────

describe("audio playback invocation", () => {
  it("play attempts eagle-calling asset for RESEARCH_SIGNAL when enabled and user interacted", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    // Simulate user interaction
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    // Mock the internal playAudio to capture the URL
    let capturedUrl: string | null = null;
    const originalPlayAudio = (mgr as unknown as { playAudio: (url: string) => Promise<void> })
      .playAudio;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async (
      url: string,
    ) => {
      capturedUrl = url;
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-test-play-1");
    expect(result).toBe(true);
    expect(capturedUrl).toBe("/audio/eagle-calling.wav");
  });

  it("play attempts eagle-chirping asset for NEWS_IMPACT", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let capturedUrl: string | null = null;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async (
      url: string,
    ) => {
      capturedUrl = url;
    };

    const result = await mgr.play("NEWS_IMPACT", "fp-test-play-news-1");
    expect(result).toBe(true);
    expect(capturedUrl).toBe("/audio/eagle-chirping.wav");
  });
});

// ────────────────────── Deduplication ──────────────────────────────

describe("audio deduplication", () => {
  it("same fingerprint → no second playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    await mgr.play("RESEARCH_SIGNAL", "fp-same");
    await mgr.play("RESEARCH_SIGNAL", "fp-same");
    expect(playCount).toBe(1);
  });

  it("different fingerprint → playback allowed for each", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    await mgr.play("RESEARCH_SIGNAL", "fp-a");
    await mgr.play("RESEARCH_SIGNAL", "fp-b");
    expect(playCount).toBe(2);
  });

  it("clearDeduplication allows replaying same fingerprint", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    await mgr.play("RESEARCH_SIGNAL", "fp-clear");
    mgr.clearDeduplication();
    await mgr.play("RESEARCH_SIGNAL", "fp-clear");
    expect(playCount).toBe(2);
  });

  it("different events with same fingerprint are deduplicated", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    await mgr.play("RESEARCH_SIGNAL", "fp-shared");
    await mgr.play("NEWS_IMPACT", "fp-shared"); // same fingerprint
    expect(playCount).toBe(1); // deduplicated
  });
});

// ────────────────────── Autoplay / Disabled States ─────────────────

describe("audio autoplay and disabled states", () => {
  it("before user interaction → no playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    // userInteracted defaults to false

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-no-interact");
    expect(result).toBe(false);
    expect(playCount).toBe(0);
  });

  it("sound disabled → no playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: false, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-disabled");
    expect(result).toBe(false);
    expect(playCount).toBe(0);
  });

  it("signalSounds disabled → no signal playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: false, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-sig-off");
    expect(result).toBe(false);
    expect(playCount).toBe(0);
  });

  it("newsSounds disabled → no news playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: false });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    const result = await mgr.play("NEWS_IMPACT", "fp-news-off");
    expect(result).toBe(false);
    expect(playCount).toBe(0);
  });

  it("newsSounds disabled does NOT affect signal playback", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: false });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let playCount = 0;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      playCount++;
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-news-off-sig-on");
    expect(result).toBe(true);
    expect(playCount).toBe(1);
  });
});

// ────────────────────── Missing Asset Handling ─────────────────────

describe("missing asset handling", () => {
  it("playAudio failure returns false, no exception", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    // Mock playAudio to simulate missing asset
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      throw new Error("AudioContext decode failed");
    };

    const result = await mgr.play("RESEARCH_SIGNAL", "fp-missing");
    expect(result).toBe(false);
  });

  it("application remains functional after playback failure", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      throw new Error("Asset not found");
    };

    // First call fails
    await mgr.play("RESEARCH_SIGNAL", "fp-fail-1");
    // Second call with different fingerprint should still be attempted
    let attempted = false;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async () => {
      attempted = true;
    };
    await mgr.play("RESEARCH_SIGNAL", "fp-fail-2");
    expect(attempted).toBe(true);
  });
});

// ────────────────────── News Non-trigger ───────────────────────────

describe("news non-trigger", () => {
  it("unrelated events do NOT trigger eagle-chirping.wav", async () => {
    const mgr = createAudioNotificationManager();
    mgr.setConfig({ enabled: true, signalSounds: true, newsSounds: true });
    (mgr as unknown as { userInteracted: boolean }).userInteracted = true;

    let capturedUrl: string | null = null;
    (mgr as unknown as { playAudio: (url: string) => Promise<void> }).playAudio = async (
      url: string,
    ) => {
      capturedUrl = url;
    };

    // RESEARCH_SIGNAL should use eagle-calling, not eagle-chirping
    await mgr.play("RESEARCH_SIGNAL", "fp-not-news");
    expect(capturedUrl).toBe("/audio/eagle-calling.wav");
    expect(capturedUrl).not.toBe("/audio/eagle-chirping.wav");
  });
});

// ────────────────────── Accessibility ──────────────────────────────

describe("SoundToggle accessibility", () => {
  it("SoundToggle component exists and is importable", async () => {
    const mod = await import("@/components/SoundToggle");
    expect(mod.SoundToggle).toBeDefined();
    expect(typeof mod.SoundToggle).toBe("function");
  });
});

// ────────────────────── Security ───────────────────────────────────

describe("audio security", () => {
  it("audio-notifications.ts has no broker execution imports", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const filePath = path.resolve(__dirname, "audio-notifications.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).not.toMatch(/placeOrder|modifyOrder|cancelOrder|broker|execute.*order/i);
  });

  it("SoundToggle.tsx has no broker execution imports", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const filePath = path.resolve(__dirname, "../components/SoundToggle.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).not.toMatch(/placeOrder|modifyOrder|cancelOrder|broker|execute.*order/i);
  });

  it("use-audio-alerts.ts has no broker execution imports", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const filePath = path.resolve(__dirname, "../hooks/use-audio-alerts.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).not.toMatch(/placeOrder|modifyOrder|cancelOrder|broker|execute.*order/i);
  });
});
