import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let saved: Theme = "dark";
    try {
      saved = (localStorage.getItem("eb-theme") as Theme) || "dark";
    } catch {
      // localStorage may be unavailable (private mode / blocked cookies).
    }
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("eb-theme", next);
    } catch {
      // Ignore persistence failures; theme still applies for this session.
    }
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
      title={isDark ? "Day mode" : "Night mode"}
      suppressHydrationWarning
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 8,
        border: "1px solid var(--eb-border)",
        background: "var(--eb-bg3)",
        color: "var(--eb-accent)",
        cursor: "pointer",
        fontFamily: "var(--eb-body)",
        fontSize: 12,
        letterSpacing: 1,
        lineHeight: 1,
      }}
    >
      {!mounted ? (
        <Moon size={15} />
      ) : isDark ? (
        <Sun size={15} />
      ) : (
        <Moon size={15} />
      )}
      <span suppressHydrationWarning>{!mounted ? "" : isDark ? "DAY" : "NIGHT"}</span>
    </button>
  );
}
