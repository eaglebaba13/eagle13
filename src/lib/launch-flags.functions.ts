import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_LAUNCH_FLAGS, resolveLaunchFlags, type LaunchFlags } from "./launch-flags";

export const getLaunchFlags = createServerFn({ method: "GET" }).handler(
  async (): Promise<LaunchFlags> => {
    try {
      return resolveLaunchFlags(process.env as Record<string, string | undefined>);
    } catch {
      return DEFAULT_LAUNCH_FLAGS;
    }
  },
);