import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { highestRole, type AppRole } from "./roles";
import { serializeProfile, type ProfileRow, type SerializedProfile } from "./profile";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { isGuestSessionActive, clearGuestSession, GUEST_USER_ID } from "./guest-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SerializedProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const lastEvent = useRef<string | null>(null);

  const loadProfileAndRoles = useCallback(async (userId: string, targetUser?: User | null) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const rolesList = (rolesRes.data ?? []).map((r) => r.role as AppRole);

    // Also include role from user metadata if present
    const metaRole = (targetUser?.user_metadata?.role) as AppRole | undefined;
    if (metaRole && !rolesList.includes(metaRole)) {
      rolesList.push(metaRole);
    }

    setRoles(rolesList);
    const primary = highestRole(rolesList.length ? rolesList : ["free"]);
    if (profileRes.data) {
      setProfile(serializeProfile(profileRes.data as ProfileRow, primary));
    } else {
      const email = targetUser?.email || "";
      const name =
        (targetUser?.user_metadata?.full_name as string) ||
        (targetUser?.user_metadata?.name as string) ||
        email.split("@")[0] ||
        "Trader";
      const avatar =
        (targetUser?.user_metadata?.avatar_url as string) ||
        (targetUser?.user_metadata?.picture as string) ||
        null;

      setProfile({
        id: userId,
        email,
        displayName: name,
        avatarUrl: avatar,
        timezone: "Asia/Kolkata",
        country: "IN",
        currency: "INR",
        preferredBroker: null,
        preferredInstrument: "NIFTY",
        language: "en",
        theme: "dark",
        role: primary,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Wire the listener FIRST so we don't miss the initial event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      if (event !== lastEvent.current) {
        lastEvent.current = event;
      }
      if (s?.user) {
        // Defer the profile fetch — never call supabase from inside the callback.
        setTimeout(() => {
          if (!mounted) return;
          void loadProfileAndRoles(s.user.id, s.user);
        }, 0);
      } else {
        if (isGuestSessionActive()) {
          setProfile({
            id: GUEST_USER_ID,
            displayName: "Guest Researcher",
            email: "guest@eaglebaba.local",
            avatarUrl: null,
            timezone: "Asia/Kolkata",
            country: "IN",
            currency: "INR",
            preferredBroker: null,
            preferredInstrument: "NIFTY",
            language: "en",
            theme: "dark",
            role: "guest",
          });
          setRoles(["guest"]);
        } else {
          setProfile(null);
          setRoles([]);
        }
      }
    });

    // 2. Then hydrate the current session.
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void loadProfileAndRoles(data.session.user.id, data.session.user).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        if (isGuestSessionActive()) {
          setProfile({
            id: GUEST_USER_ID,
            displayName: "Guest Researcher",
            email: "guest@eaglebaba.local",
            avatarUrl: null,
            timezone: "Asia/Kolkata",
            country: "IN",
            currency: "INR",
            preferredBroker: null,
            preferredInstrument: "NIFTY",
            language: "en",
            theme: "dark",
            role: "guest",
          });
          setRoles(["guest"]);
        }
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileAndRoles]);

  const signOut = useCallback(async () => {
    // Phase 20.3A: session isolation — never leak previous user's state.
    clearGuestSession();
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setSession(null);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfileAndRoles(session.user.id, session.user);
  }, [session, loadProfileAndRoles]);

  const logAudit = useCallback(
    async (event: string, metadata: Record<string, unknown> = {}) => {
      if (!session?.user) return;
      try {
        await supabase.from("audit_log").insert({
          user_id: session.user.id,
          event,
          metadata: metadata as never,
        });
      } catch {
        /* audit failures never block UX */
      }
    },
    [session],
  );

  const role = useMemo<AppRole>(() => highestRole(roles.length ? roles : ["free"]), [roles]);
  const isGuest = !session?.user && profile?.id === GUEST_USER_ID;
  const isAuthenticated = !!session?.user || isGuest;

  const value: AuthContextValue = {
    loading,
    session,
    user: session?.user ?? (isGuest ? ({ id: GUEST_USER_ID, email: "guest@eaglebaba.local" } as never) : null),
    profile,
    roles,
    role,
    isAuthenticated,
    isGuest,
    signOut,
    refreshProfile,
    logAudit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
