import type { EnvRequirement } from "./index";

/** Browser-safe configuration metadata; server credentials are never listed here. */
export const PUBLIC_ENV_REQUIREMENTS: readonly EnvRequirement[] = [
  {
    key: "VITE_SUPABASE_URL",
    category: "secrets",
    required: true,
    description: "Public Supabase project URL",
  },
  {
    key: "VITE_SUPABASE_PROJECT_ID",
    category: "secrets",
    required: true,
    description: "Public Supabase project identity",
  },
  {
    key: "VITE_SUPABASE_PUBLISHABLE_KEY",
    category: "secrets",
    required: true,
    description: "Browser publishable key",
  },
];
