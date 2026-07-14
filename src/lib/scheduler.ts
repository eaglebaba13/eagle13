// Global client-side scheduler: ONE master interval drives every recurring
// cadence in the app (1s clock, 30s market refresh, 60s planet/news refresh).
// Subscribers register a callback + period; the scheduler fires each callback
// when its period elapses. This replaces the many independent setInterval()
// timers scattered across routes, eliminating duplicate timers and drift.
//
// Pure engineering utility — it changes nothing about what the callbacks do.

type Task = {
  periodMs: number;
  cb: () => void;
  last: number;
};

const tasks = new Set<Task>();
let timer: ReturnType<typeof setInterval> | null = null;

// Master tick resolution. 250ms keeps the 1s clock visually precise while
// remaining cheap; longer cadences are gated by their own periodMs.
const TICK_MS = 250;

function pump() {
  const now = Date.now();
  for (const t of tasks) {
    if (now - t.last >= t.periodMs) {
      t.last = now;
      try {
        t.cb();
      } catch {
        /* a failing subscriber must not kill the scheduler */
      }
    }
  }
}

function ensureRunning() {
  if (timer == null && typeof window !== "undefined") {
    timer = setInterval(pump, TICK_MS);
  }
}

function stopIfIdle() {
  if (timer != null && tasks.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

export type ScheduleOptions = {
  /** Run the callback immediately on subscribe (default true). */
  immediate?: boolean;
};

/**
 * Register a recurring task on the shared scheduler.
 * Returns an unsubscribe function that also stops the master timer when the
 * last task leaves (no leaked intervals).
 */
export function schedule(
  cb: () => void,
  periodMs: number,
  opts: ScheduleOptions = {},
): () => void {
  const task: Task = { periodMs, cb, last: Date.now() };
  tasks.add(task);
  ensureRunning();
  if (opts.immediate ?? true) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
  return () => {
    tasks.delete(task);
    stopIfIdle();
  };
}

/** Test/debug helper. */
export function activeTaskCount(): number {
  return tasks.size;
}