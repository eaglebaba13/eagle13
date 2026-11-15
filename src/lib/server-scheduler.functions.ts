import { createServerFn } from "@tanstack/react-start";

export const initServerScheduler = createServerFn({ method: "GET" }).handler(async () => {
  const { ensureServerSchedulerStarted } = await import("./server-scheduler.server");
  ensureServerSchedulerStarted();
  return { ok: true };
});
