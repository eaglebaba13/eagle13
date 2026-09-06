// Sound control toggle for the application header.
// Minimal, accessible, provider-neutral.

import { useState, useEffect, useCallback } from "react";
import {
  getAudioNotificationManager,
  type AudioNotificationConfig,
} from "@/lib/audio-notifications";

export function SoundToggle() {
  const [config, setConfig] = useState<AudioNotificationConfig>({
    enabled: true,
    signalSounds: true,
    newsSounds: true,
  });
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const mgr = getAudioNotificationManager();
    setConfig(mgr.getConfig());
    setAvailable(mgr.isPlaybackAvailable());

    // Poll availability (user might click elsewhere on page)
    const interval = setInterval(() => {
      setAvailable(mgr.isPlaybackAvailable());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const toggle = useCallback(() => {
    const mgr = getAudioNotificationManager();
    mgr.toggleEnabled();
    setConfig(mgr.getConfig());
  }, []);

  const isOn = config.enabled;
  const label = !available ? "Sound (awaiting interaction)" : isOn ? "Sound ON" : "Sound OFF";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition ${
        isOn && available
          ? "border-green-500/30 text-green-500"
          : "border-muted-foreground/30 text-muted-foreground"
      }`}
      title={label}
      aria-label={label}
      aria-pressed={isOn}
    >
      <SoundIcon on={isOn && available} />
      <span className="hidden sm:inline">{!available ? "Sound" : isOn ? "Sound" : "Muted"}</span>
    </button>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {on ? (
        <>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
      ) : (
        <path d="M23 9l-6 6" />
      )}
    </svg>
  );
}
