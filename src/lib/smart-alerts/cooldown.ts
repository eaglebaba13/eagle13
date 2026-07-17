// Phase 3C — Re-export cooldown helpers for readability.
export {
  DEFAULT_COOLDOWN_SEC,
  MIN_COOLDOWN_SEC,
  MAX_COOLDOWN_SEC,
  effectiveCooldownSec,
  isInCooldown,
  isInQuietHours,
} from "./dedupe";