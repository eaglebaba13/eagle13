import { useState } from "react";
import defaultLogoUrl from "@/assets/eaglebaba-logo.png";

export interface EagleLogoProps {
  src?: string;
  alt?: string;
  className?: string;
  size?: number;
  width?: number;
  height?: number;
  flip?: boolean;
}

/**
 * Fallback SVG vector representation of the EagleBABA golden eagle glyph
 * rendered when network fails, offline, or during asset loading delays.
 */
function EagleVectorFallback({
  width,
  height,
  className,
}: {
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="eb-eagle-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="35%" stopColor="#f59e0b" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
        <radialGradient id="eb-eagle-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </radialGradient>
      </defs>
      {/* Eagle Head Silhouette & Feathers */}
      <path
        d="M 12 75 C 18 50, 32 30, 52 20 C 68 12, 85 18, 92 35 C 95 42, 92 50, 84 56 C 80 59, 72 61, 62 61 C 67 67, 72 73, 76 80 C 60 76, 45 74, 30 79 C 24 81, 17 83, 12 75 Z"
        fill="url(#eb-eagle-gold)"
        stroke="#f59e0b"
        strokeWidth="1.5"
      />
      {/* Beak */}
      <path
        d="M 78 45 C 88 47, 96 52, 94 62 C 86 63, 76 56, 74 52 Z"
        fill="#fbbf24"
      />
      {/* Fierce Astro Eye */}
      <circle cx="64" cy="36" r="4.5" fill="url(#eb-eagle-eye)" />
      <circle cx="65.5" cy="34.5" r="1.5" fill="#ffffff" />
    </svg>
  );
}

/**
 * Canonical EagleBABA Logo component.
 * - Always points face towards the right (`transform scale-x-[-1]`).
 * - Features graceful zero-downtime SVG fallback on network or missing asset errors.
 * - Supports custom dimensions and styling.
 */
export function EagleLogo({
  src = defaultLogoUrl,
  alt = "EagleBABA",
  className = "",
  size = 32,
  width,
  height,
  flip = true,
}: EagleLogoProps) {
  const [error, setError] = useState(false);
  const w = width ?? size;
  const h = height ?? size;

  const flipClass = flip ? "transform scale-x-[-1]" : "";
  const combinedClass = `${flipClass} ${className}`.trim();

  if (error) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-lg bg-zinc-900 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)] overflow-hidden shrink-0 ${combinedClass}`}
        style={{ width: w, height: h }}
        role="img"
        aria-label={alt}
      >
        <EagleVectorFallback width={w * 0.85} height={h * 0.85} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={w}
      height={h}
      onError={() => {
        // If relative asset URL failed, try static root /eaglebaba-logo.png once before fallback
        if (src !== "/eaglebaba-logo.png") {
          const img = new Image();
          img.onload = () => {
            // Static file works, do not trigger error
          };
          img.onerror = () => {
            setError(true);
          };
          img.src = "/eaglebaba-logo.png";
        }
        setError(true);
      }}
      className={combinedClass}
    />
  );
}

