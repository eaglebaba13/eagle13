import { useEffect, useState, useCallback } from "react";
import {
  getStoredFontScale,
  increaseFontScale,
  decreaseFontScale,
  resetFontScale,
  MIN_FONT_SCALE,
  MAX_FONT_SCALE,
} from "@/lib/font-size-manager";

export function FontSizeControl({ className }: { className?: string }) {
  const [scale, setScale] = useState(100);

  useEffect(() => {
    setScale(getStoredFontScale());

    const handleScaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ scale: number }>;
      if (customEvent.detail?.scale) {
        setScale(customEvent.detail.scale);
      }
    };

    window.addEventListener("eb-font-scale-changed", handleScaleChange);
    return () => window.removeEventListener("eb-font-scale-changed", handleScaleChange);
  }, []);

  const handleDecrease = useCallback(() => {
    setScale(decreaseFontScale());
  }, []);

  const handleIncrease = useCallback(() => {
    setScale(increaseFontScale());
  }, []);

  const handleReset = useCallback(() => {
    setScale(resetFontScale());
  }, []);

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5 text-xs font-mono select-none shadow-sm ${className ?? ""}`}
      role="group"
      aria-label="Font scale adjustment"
    >
      <button
        type="button"
        onClick={handleDecrease}
        disabled={scale <= MIN_FONT_SCALE}
        className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-[11px]"
        title="Decrease font size (A-)"
        aria-label="Decrease font size"
      >
        A-
      </button>

      <button
        type="button"
        onClick={handleReset}
        className="px-1.5 py-0.5 rounded text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors font-semibold min-w-[34px] text-center"
        title="Reset font size to 100%"
        aria-label={`Reset font size (currently ${scale}%)`}
      >
        {scale}%
      </button>

      <button
        type="button"
        onClick={handleIncrease}
        disabled={scale >= MAX_FONT_SCALE}
        className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold text-[11px]"
        title="Increase font size (A+)"
        aria-label="Increase font size"
      >
        A+
      </button>
    </div>
  );
}
