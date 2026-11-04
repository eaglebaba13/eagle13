import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { enableGuestSession } from "@/lib/guest-session";
import { toast } from "sonner";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { Info } from "lucide-react";

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
  const [showAdminHelp, setShowAdminHelp] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      void navigate({ to: "/" });
    }
  }, [loading, isAuthenticated, navigate]);

  function handleContinueGuest() {
    enableGuestSession();
    toast.success("Welcome! Research workstation unlocked with guest full access.");
    router.invalidate();
    void navigate({ to: "/" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const cleanEmail = email.trim();

    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error, data } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { full_name: name.trim() || cleanEmail.split("@")[0] },
          },
        });
        if (error) {
          console.error("[Auth] Sign-up failed:", { email: cleanEmail, error: error.message });
          throw error;
        }
        if (data.session) {
          toast.success("Account created and signed in!");
          router.invalidate();
          void navigate({ to: "/" });
        } else {
          toast.success("Account created — check your inbox to confirm your email.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          console.error("[Auth] Sign-in failed:", { email: cleanEmail, error: error.message });
          if (error.message.includes("Invalid login credentials")) {
            toast.error(
              "Account not found or password incorrect. Please switch to 'Create account' to register or continue as guest below.",
              { duration: 6000 },
            );
          } else if (error.message.includes("Email not confirmed")) {
            toast.error("Email not confirmed. Check your inbox or continue as guest below.", {
              duration: 6000,
            });
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success("Welcome back!");
        router.invalidate();
        void navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      console.error("[Auth] Authentication exception:", msg);
      toast.error(msg);
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
            <p className="text-xs text-muted-foreground">Astro Research Terminal</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Tabs for Sign in / Create account */}
          <div className="flex rounded-lg bg-muted p-1 mb-5">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                mode === "signin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                mode === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create Account
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
                  placeholder="Your Name"
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
                placeholder="trader@example.com"
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
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-opacity"
            >
              {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-center">
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Don&apos;t have an account? Create one
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground text-[10px] tracking-wider">or</span>
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleContinueGuest}
              className="w-full rounded-md border border-border bg-muted/40 hover:bg-muted py-2 text-xs font-semibold text-foreground transition-colors"
            >
              Continue as Guest (Full Access)
            </button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Instant research workstation access without sign-in
            </p>
          </div>
        </div>

        {/* Informational help toggle */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAdminHelp((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Info size={12} />
            Researcher & Admin access info
          </button>
          {showAdminHelp && (
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-left text-[11px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Registered Operators:</p>
              <p>• dheerajnarula13@gmail.com (Admin)</p>
              <p>• lwillshivansh@gmail.com (Admin)</p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                To create a new operator account, switch to &quot;Create Account&quot; above or use guest full access for instant research workstation session.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          EagleBABA Astro Research Terminal — analytical, not a broker.
        </p>
      </div>
    </div>
  );
}
