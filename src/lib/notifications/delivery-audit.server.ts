import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AlertDeliveryRow } from "./alert-delivery.functions";

interface AuditEntry { userId: string; row: AlertDeliveryRow }
const path = () => resolve(process.env.TELEGRAM_DELIVERY_AUDIT_PATH || "config/telegram-delivery-audit.json");
let pending = Promise.resolve();

async function readEntries(): Promise<AuditEntry[]> {
  try {
    const entries: unknown = JSON.parse(await readFile(path(), "utf8"));
    return Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry.userId === "string" && entry.row?.id) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("TELEGRAM_AUDIT_READ_FAILED");
  }
}

/** Bounded server audit; no tokens or message bodies. Serialize atomic writes within this process. */
export function persistDeliveryAudit(userId: string, row: AlertDeliveryRow): Promise<void> {
  const write = pending.catch(() => {}).then(async () => {
    const entries = await readEntries();
    const next = [{ userId, row }, ...entries.filter((entry) => entry.row.id !== row.id)].slice(0, 2000);
    const destination = path();
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  });
  pending = write;
  return write;
}

export async function readDeliveryAudit(userId: string): Promise<AlertDeliveryRow[]> {
  await pending.catch(() => {});
  return (await readEntries()).filter((entry) => entry.userId === userId).map((entry) => entry.row);
}
