// Global client-side scheduler: ONE master interval drives every recurring
// cadence in the app (1s clock, 30s market refresh, 60s planet/news refresh).
// Subscribers register a callback + period; the scheduler fires each callback
// when its period elapses. This replaces the many independent setInterval()
// timers scattered across routes, eliminating duplicate timers and drift.
//
// Pure engineering utility — it changes nothing about what the callbacks do.

type Task = {
  id: number;
  name: string;
  periodMs: number;
  cb: () => void;
  last: number;
  runs: number;
  errors: number;
  totalMs: number;
  lastDurationMs: number;
  createdAt: number;
};

const tasks = new Set<Task>();
let timer: ReturnType<typeof setInterval> | null = null;
let nextId = 1;

// Master tick resolution. 250ms keeps the 1s clock visually precise while
// remaining cheap; longer cadences are gated by their own periodMs.
const TICK_MS = 250;

function pump() {
  const now = Date.now();
  for (const t of tasks) {
    if (now - t.last >= t.periodMs) {
      t.last = now;
      const start = now;
      try {
        t.cb();
      } catch {
        /* a failing subscriber must not kill the scheduler */
        t.errors += 1;
      }
      const dur = Date.now() - start;
      t.runs += 1;
      t.totalMs += dur;
      t.lastDurationMs = dur;
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
  /** Optional label for diagnostics. */
  name?: string;
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
  const now = Date.now();
  const task: Task = {
    id: nextId++,
    name: opts.name ?? `task#${nextId - 1}`,
    periodMs, cb,
    last: now,
    runs: 0, errors: 0, totalMs: 0, lastDurationMs: 0,
    createdAt: now,
  };
  tasks.add(task);
  ensureRunning();
  if (opts.immediate ?? true) {
    const start = Date.now();
    try {
      cb();
      task.runs += 1;
    } catch {
      /* ignore */
      task.errors += 1;
    }
    task.lastDurationMs = Date.now() - start;
    task.totalMs += task.lastDurationMs;
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

export type SchedulerTaskSnapshot = {
  id: number;
  name: string;
  periodMs: number;
  runs: number;
  errors: number;
  lastDurationMs: number;
  avgDurationMs: number;
  lastRunAt: number;
  nextRunAt: number;
  createdAt: number;
};

export function getSchedulerMetrics(): {
  running: boolean;
  tickMs: number;
  taskCount: number;
  tasks: SchedulerTaskSnapshot[];
} {
  const tasksSnap: SchedulerTaskSnapshot[] = [];
  for (const t of tasks) {
    tasksSnap.push({
      id: t.id,
      name: t.name,
      periodMs: t.periodMs,
      runs: t.runs,
      errors: t.errors,
      lastDurationMs: t.lastDurationMs,
      avgDurationMs: t.runs > 0 ? Math.round(t.totalMs / t.runs) : 0,
      lastRunAt: t.last,
      nextRunAt: t.last + t.periodMs,
      createdAt: t.createdAt,
    });
  }
  return {
    running: timer != null,
    tickMs: TICK_MS,
    taskCount: tasks.size,
    tasks: tasksSnap.sort((a, b) => a.id - b.id),
  };
}