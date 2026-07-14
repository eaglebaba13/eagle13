/**
 * Phase 20.2 — React hook that resolves the current user's entitlement
 * context: role + live subscription snapshot + admin override.
 */
import { useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { fetchSubscriptionSnapshot } from "./cloud-sync";
import {
  resolveEffectivePlan,
  type EffectivePlan,
  type SubscriptionSnapshot,
  type UserEntitlementContext,
} from "./entitlements";

export function useEntitlements(): {
  ctx: UserEntitlementContext;
  effective: EffectivePlan;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { role, user, isAuthenticated } = useAuth();
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(isAuthenticated);

  const refresh = async () => {
    if (!user) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await fetchSubscriptionSnapshot(user.id);
      setSnapshot(snap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const ctx: UserEntitlementContext = {
    role,
    subscription: snapshot,
    adminOverride: role === "admin",
  };
  const effective = resolveEffectivePlan(ctx);
  return { ctx, effective, loading, refresh };
}