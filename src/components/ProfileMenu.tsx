import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { initials } from "@/lib/profile";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Top-right profile menu. Reflects the current session — shows "Sign in" for
 * guests, or an avatar + dropdown with Profile / Settings / License / Logout
 * for signed-in users.
 */
export function ProfileMenu() {
  const { isAuthenticated, profile, role, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (loading) {
    return <div className="h-9 w-9 rounded-full bg-muted animate-pulse" aria-hidden />;
  }

  if (!isAuthenticated) {
    return (
      <Link
        to="/auth"
        className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90"
      >
        Sign in
      </Link>
    );
  }

  const label = profile?.displayName ?? "Trader";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-muted/60 hover:bg-muted pl-1 pr-3 py-1"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials(label)}
        </span>
        <span className="text-xs font-medium max-w-[100px] truncate">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-card shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-medium truncate">{profile?.email}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[role]} plan</div>
          </div>
          <MenuItem to="/_authenticated/profile" onClick={() => setOpen(false)}>Profile</MenuItem>
          <MenuItem to="/_authenticated/settings" onClick={() => setOpen(false)}>Settings</MenuItem>
          <MenuItem to="/_authenticated/license" onClick={() => setOpen(false)}>License</MenuItem>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
              void navigate({ to: "/" });
            }}
            className="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-2 text-sm hover:bg-muted"
    >
      {children}
    </Link>
  );
}