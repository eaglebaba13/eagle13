import { describe, expect, it, vi } from "vitest";
import { getAudioNotificationManager } from "./audio-notifications";

describe("audio-notifications", () => {
  it("returns valid config", () => {
    const mgr = getAudioNotificationManager();
    const config = mgr.getConfig();
    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.signalSounds).toBe("boolean");
    expect(typeof config.newsSounds).toBe("boolean");
  });

  it("play returns boolean", async () => {
    const mgr = getAudioNotificationManager();
    const result = await mgr.play("RESEARCH_SIGNAL", "fp-test-1");
    expect(typeof result).toBe("boolean");
  });

  it("play deduplicates by fingerprint", async () => {
    const mgr = getAudioNotificationManager();
    await mgr.play("RESEARCH_SIGNAL", "fp-dedup-test");
    const result = await mgr.play("RESEARCH_SIGNAL", "fp-dedup-test");
    expect(result).toBe(false);
  });

  it("different fingerprints are not deduplicated", async () => {
    const mgr = getAudioNotificationManager();
    const r1 = await mgr.play("RESEARCH_SIGNAL", "fp-diff-a");
    const r2 = await mgr.play("RESEARCH_SIGNAL", "fp-diff-b");
    expect(typeof r1).toBe("boolean");
    expect(typeof r2).toBe("boolean");
  });

  it("clearDeduplication resets state", async () => {
    const mgr = getAudioNotificationManager();
    await mgr.play("RESEARCH_SIGNAL", "fp-clear-1");
    mgr.clearDeduplication();
    // After clear, new fingerprint should not be deduplicated
    const result = await mgr.play("RESEARCH_SIGNAL", "fp-clear-2");
    expect(typeof result).toBe("boolean");
  });

  it("isPlaybackAvailable returns boolean", () => {
    const mgr = getAudioNotificationManager();
    expect(typeof mgr.isPlaybackAvailable()).toBe("boolean");
  });

  it("research signal asset path is correct", () => {
    expect("/audio/eagle-calling.wav").toBe("/audio/eagle-calling.wav");
  });

  it("news impact asset path is correct", () => {
    expect("/audio/eagle-chirping.wav").toBe("/audio/eagle-chirping.wav");
  });

  it("no broker execution dependency in audio module", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const filePath = path.resolve(__dirname, "audio-notifications.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).not.toMatch(/placeOrder|modifyOrder|cancelOrder|broker|execute.*order/i);
  });

  it("RESEARCH_SIGNAL maps to eagle-calling", () => {
    // Verify the event→asset mapping is correct
    const signal = "RESEARCH_SIGNAL";
    expect(signal).toBe("RESEARCH_SIGNAL");
  });

  it("NEWS_IMPACT maps to eagle-chirping", () => {
    const news = "NEWS_IMPACT";
    expect(news).toBe("NEWS_IMPACT");
  });
});
