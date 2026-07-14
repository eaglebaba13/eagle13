// Returns true once the component has mounted on the client. Handy for
// gating client-only UI without hydration mismatches. Extracted from
// live-market-terminal.tsx where an identical hook was defined inline.
import { useEffect, useState } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}