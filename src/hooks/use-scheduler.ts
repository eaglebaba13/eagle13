// React bindings for the global scheduler (src/lib/scheduler.ts). One shared
// timer drives all cadences; these hooks let components subscribe without
// creating their own setInterval.
import { useEffect, useState } from "react";
import { schedule } from "@/lib/scheduler";

/** Re-render on a fixed cadence, returning the latest Date.now() tick. */
export function useTick(periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => schedule(() => setNow(Date.now()), periodMs), [periodMs]);
  return now;
}

/** IST wall-clock string (HH:MM:SS), updated once per second via the scheduler. */
export function useIstClock(): string {
  const [clock, setClock] = useState("--:--:--");
  useEffect(
    () =>
      schedule(() => {
        setClock(
          new Date().toLocaleTimeString("en-GB", {
            hour12: false,
            timeZone: "Asia/Kolkata",
          }),
        );
      }, 1000),
    [],
  );
  return clock;
}

/** Run an arbitrary callback on the shared scheduler at `periodMs`. */
export function useScheduled(cb: () => void, periodMs: number, immediate = true): void {
  useEffect(() => schedule(cb, periodMs, { immediate }), [cb, periodMs, immediate]);
}