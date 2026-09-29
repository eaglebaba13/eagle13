import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { AppRole } from "./roles";
import type { SerializedProfile } from "./profile";

export interface AuthContextValue {
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

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
