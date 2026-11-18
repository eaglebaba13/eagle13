import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { OI_SYMBOLS, type OiInterval } from "./oi-direction-scanner";

const input = z.object({
  symbol: z.enum(OI_SYMBOLS).default("NIFTY"),
  expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  interval: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(15)]).default(1),
});
export const getOiDirectionScanner = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    const { ensureServerSchedulerStarted } = await import("../server-scheduler.server");
    const { getOiScanner } = await import("./oi-direction-scanner.server");
    ensureServerSchedulerStarted();
    return getOiScanner(data.symbol, data.expiry, data.interval as OiInterval);
  });
