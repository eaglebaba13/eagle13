// Hook for connecting alert events to audio notifications.
// Deduplicates by fingerprint. Respects browser autoplay.

import { useEffect, useRef } from "react";
import { playResearchSignal, playNewsImpact } from "@/lib/audio-notifications";

export interface AudioAlertEvent {
  readonly fingerprint: string;
  readonly type: string;
  readonly category: string;
}

/**
 * Hook that plays audio for new research signal events.
 * Deduplicates by fingerprint — same event never plays twice.
 */
export function useSignalAudio(events: readonly AudioAlertEvent[]) {
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    for (const event of events) {
      if (seenRef.current.has(event.fingerprint)) continue;
      seenRef.current.add(event.fingerprint);

      // Only play for market signal events (BUY/SELL research signals)
      if (event.category === "MARKET_SIGNAL") {
        playResearchSignal(event.fingerprint).catch(() => {
          // Playback failed — likely autoplay block, ignore
        });
      }
    }

    // Cap the set to prevent memory growth
    if (seenRef.current.size > 1000) {
      const arr = [...seenRef.current];
      seenRef.current = new Set(arr.slice(-500));
    }
  }, [events]);
}

/**
 * Hook that plays audio for NIFTY50 news impact events.
 * Only fires for verified news-impact events with NIFTY50 instrument.
 */
export function useNewsImpactAudio(events: readonly AudioAlertEvent[]) {
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    for (const event of events) {
      if (seenRef.current.has(event.fingerprint)) continue;
      seenRef.current.add(event.fingerprint);

      // Only play for NIFTY50 news impact (future: requires verified news-impact event source)
      // Currently disabled until a canonical news-impact event type exists
      // if (event.type === "NEWS_IMPACT" && event.instrument === "NIFTY50") {
      //   playNewsImpact(event.fingerprint).catch(() => {});
      // }
    }
  }, [events]);
}
