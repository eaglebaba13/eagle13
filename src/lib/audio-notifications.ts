// Audio notification system for research signals.
// Provider-neutral, event-driven, deduplication-safe.
// Respects browser autoplay restrictions.

export type AudioEvent = "RESEARCH_SIGNAL" | "NEWS_IMPACT";

export interface AudioNotificationConfig {
  readonly enabled: boolean;
  readonly signalSounds: boolean;
  readonly newsSounds: boolean;
}

const DEFAULT_CONFIG: AudioNotificationConfig = {
  enabled: true,
  signalSounds: true,
  newsSounds: true,
};

const AUDIO_ASSETS: Record<AudioEvent, string> = {
  RESEARCH_SIGNAL: "/audio/eagle-calling.wav",
  NEWS_IMPACT: "/audio/eagle-chirping.wav",
};

/**
 * Get the asset URL for an audio event type.
 * Exported for testing — verifies the actual production mapping.
 */
export function getAudioAssetUrl(event: AudioEvent): string {
  return AUDIO_ASSETS[event];
}

const STORAGE_KEY = "eb-audio-prefs";

class AudioNotificationManager {
  private config: AudioNotificationConfig = { ...DEFAULT_CONFIG };
  private playedFingerprints = new Set<string>();
  private audioContext: AudioContext | null = null;
  private userInteracted = false;
  private audioBuffers = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  constructor() {
    this.loadPreferences();
    if (typeof window !== "undefined") {
      window.addEventListener("click", this.handleUserInteraction, { once: true });
      window.addEventListener("keydown", this.handleUserInteraction, { once: true });
    }
  }

  private handleUserInteraction = (): void => {
    this.userInteracted = true;
  };

  private loadPreferences(): void {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AudioNotificationConfig>;
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      // ignore invalid stored prefs
    }
  }

  private savePreferences(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // storage full or unavailable
    }
  }

  getConfig(): AudioNotificationConfig {
    return { ...this.config };
  }

  setConfig(update: Partial<AudioNotificationConfig>): void {
    this.config = { ...this.config, ...update };
    this.savePreferences();
  }

  setEnabled(enabled: boolean): void {
    this.setConfig({ enabled });
  }

  toggleEnabled(): void {
    this.setEnabled(!this.config.enabled);
  }

  /**
   * Play a sound for an event, with fingerprint-based deduplication.
   * Returns true if playback was attempted, false if suppressed.
   */
  async play(event: AudioEvent, fingerprint: string): Promise<boolean> {
    if (!this.config.enabled) return false;
    if (event === "RESEARCH_SIGNAL" && !this.config.signalSounds) return false;
    if (event === "NEWS_IMPACT" && !this.config.newsSounds) return false;

    // Deduplicate by fingerprint
    if (this.playedFingerprints.has(fingerprint)) return false;
    this.playedFingerprints.add(fingerprint);

    // Cap the set to prevent memory growth
    if (this.playedFingerprints.size > 1000) {
      const arr = [...this.playedFingerprints];
      this.playedFingerprints = new Set(arr.slice(-500));
    }

    if (!this.userInteracted) {
      // Browser autoplay blocked — will play after first interaction
      return false;
    }

    try {
      await this.playAudio(AUDIO_ASSETS[event]);
      return true;
    } catch {
      // Playback failed silently — likely autoplay block or missing asset
      return false;
    }
  }

  /**
   * Check if audio playback is likely available.
   */
  isPlaybackAvailable(): boolean {
    return this.userInteracted && this.config.enabled;
  }

  /**
   * Clear deduplication state (e.g., on session reset).
   */
  clearDeduplication(): void {
    this.playedFingerprints.clear();
  }

  private async playAudio(url: string): Promise<void> {
    // Try Web Audio API first (better control), fall back to HTMLAudioElement
    try {
      const buffer = await this.loadBuffer(url);
      if (buffer && this.audioContext) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start();
        return;
      }
    } catch {
      // Fall through to HTMLAudioElement
    }

    // HTMLAudioElement fallback
    const audio = new Audio(url);
    await audio.play();
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.audioBuffers.has(url)) return this.audioBuffers.get(url)!;
    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url)!;

    const promise = this.doLoadBuffer(url);
    this.loadingPromises.set(url, promise);

    try {
      const buffer = await promise;
      if (buffer) this.audioBuffers.set(url, buffer);
      return buffer;
    } finally {
      this.loadingPromises.delete(url);
    }
  }

  private async doLoadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }
}

/**
 * Create a fresh AudioNotificationManager instance for testing.
 * Does NOT use the singleton — each call creates a new instance.
 */
export function createAudioNotificationManager(): AudioNotificationManager {
  return new AudioNotificationManager();
}

// Module-level singleton
let instance: AudioNotificationManager | null = null;

export function getAudioNotificationManager(): AudioNotificationManager {
  if (typeof window === "undefined") {
    // Server-side: return a no-op manager
    return {
      getConfig: () => ({ ...DEFAULT_CONFIG }),
      setConfig: () => {},
      setEnabled: () => {},
      toggleEnabled: () => {},
      play: async () => false,
      isPlaybackAvailable: () => false,
      clearDeduplication: () => {},
    } as unknown as AudioNotificationManager;
  }

  if (!instance) {
    instance = new AudioNotificationManager();
  }
  return instance;
}

/**
 * Play research signal sound (eagle-calling.wav).
 * Use fingerprint from canonical alert event for deduplication.
 */
export async function playResearchSignal(fingerprint: string): Promise<boolean> {
  return getAudioNotificationManager().play("RESEARCH_SIGNAL", fingerprint);
}

/**
 * Play NIFTY50 news impact sound (eagle-chirping.wav).
 * Use fingerprint from canonical news event for deduplication.
 */
export async function playNewsImpact(fingerprint: string): Promise<boolean> {
  return getAudioNotificationManager().play("NEWS_IMPACT", fingerprint);
}
