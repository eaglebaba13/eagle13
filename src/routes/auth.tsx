import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import logoUrl from "@/assets/eaglebaba-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — EagleBABA" },
      {
        name: "description",
        content:
          "Sign in or create an EagleBABA account to sync your journal, watchlists, layouts and risk settings across devices.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      void navigate({ to: "/" });
    }
  }, [loading, isAuthenticated, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your inbox to confirm your email.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        router.invalidate();
        void navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      router.invalidate();
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src={logoUrl} alt="EagleBABA" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">EagleBABA</h1>
            <p className="text-xs text-muted-foreground">Engine v1.0 · SaaS Foundation</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <label className="block">
                <span className="text-xs text-muted-foreground">Display name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs text-muted-foreground">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="w-full rounded-md border border-input bg-background py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Or continue as a <Link to="/" className="underline hover:text-foreground">guest (read-only)</Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          EagleBABA Engine v1.0 — analytical, not a broker. Trading involves risk.
        </p>
      </div>
    </div>
  );
}