import { ensureServerSchedulerStarted } from "./server-scheduler.server";

export default function startScheduler(): void {
  ensureServerSchedulerStarted();
}
