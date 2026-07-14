import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { highestRole, type AppRole } from "./roles";
import { serializeProfile, type ProfileRow, type SerializedProfile } from "./profile";

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: SerializedProfile | null;
  roles: AppRole[];
  role: AppRole;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  logAudit: (event: string, metadata?: Record<string, unknown>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SerializedProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const lastEvent = useRef<string | null>(null);

  const loadProfileAndRoles = useCallback(async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const rolesList = (rolesRes.data ?? []).map((r) => r.role as AppRole);
    setRoles(rolesList);
    const primary = highestRole(rolesList.length ? rolesList : ["free"]);
    if (profileRes.data) {
      setProfile(serializeProfile(profileRes.data as ProfileRow, primary));
    } else {
      setProfile(null);
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
          void loadProfileAndRoles(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    // 2. Then hydrate the current session.
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void loadProfileAndRoles(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileAndRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfileAndRoles(session.user.id);
  }, [session, loadProfileAndRoles]);

  const logAudit = useCallback(
    async (event: string, metadata: Record<string, unknown> = {}) => {
      if (!session?.user) return;
      try {
        await supabase
          .from("audit_log")
          .insert({ user_id: session.user.id, event, metadata });
      } catch {
        /* audit failures never block UX */
      }
    },
    [session],
  );

  const role = useMemo<AppRole>(
    () => highestRole(roles.length ? roles : ["free"]),
    [roles],
  );

  const value: AuthContextValue = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    roles,
    role,
    isAuthenticated: !!session?.user,
    signOut,
    refreshProfile,
    logAudit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}