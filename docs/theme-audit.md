# EagleBABA UI/UX & Institutional Colour Theme Audit

**Date:** 2026-11-25  
**Branch:** `production-release-v2`  
**Scope:** Global CSS tokens (`src/styles.css`), runtime theme injection (`src/lib/theme-manager.ts`, `src/routes/__root.tsx`), dashboard & widget cards, and hardcoded colour scan across `src/`.

---

## 1. Executive Summary — Why Cards & Surfaces Look Visually Inconsistent

1. **Competing Token Layers (`oklch` shadcn vs. `--eb-*` vs. `theme-manager.ts`):**
   - `src/styles.css` defines Tailwind v4 / shadcn tokens in `:root` (light defaults), `.dark` / `:root[data-theme="dark"]` (`--background: oklch(0.19 0.005 260)`, `--card: oklch(0.225 0.006 260)`), and `:root[data-theme="light"]`.
   - Separately, `:root` defines `--eb-bg: #070a0e`, `--eb-bg2: #0d1117`, `--eb-card: rgba(24, 24, 27, 0.45)`, and `--eb-glass: color-mix(in srgb, var(--eb-card) 72%, transparent)`.
   - On mount, `applyThemeToDOM()` (`src/lib/theme-manager.ts`) writes `--eb-base-bg`, `--eb-card-surface: rgba(24, 24, 27, 0.5)`, and `--eb-border-tint: rgba(245, 158, 11, 0.25)` from `DEFAULT_THEME_CONFIG` (`obsidian-gold`).
   - Result: Newer Tailwind components (`bg-card/50`, `bg-[#0c0e14]`, `bg-zinc-950`) render cool slate/charcoal surfaces, while legacy `.eb-card.eb-glass` cards render ~32–45% translucent zinc-900 with a gold gradient border (`--eb-gold-soft`) that lets the `.eb-space-bg` nebula & amber radial glow bleed through—producing a muddy olive/amber-tinted card background.

2. **Stacked Multi-Bar Headers & Pill Clutter (`legacy-primitives.tsx`):**
   - `Card` in `src/components/dashboard/widgets/legacy-primitives.tsx` paints a `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%)` header tint **plus** a second `data-eb-card-meta` sub-bar (`background: rgba(255,255,255,0.015)`) containing `methodology`, `DataFreshnessPill`, and `SIGNAL BLOCKED` pills alongside the header `sub` pill.
   - Up to 4 competing pills appear in the top ~65px of every core widget (`NIFTY 50 — LIVE`, `CPR LEVELS`, `SAFE ZONES`, `INDIA VIX`), diluting visual hierarchy away from the primary price and level numbers.

3. **Missing Browser Chrome Alignment:**
   - `color-scheme` was not declared on `:root[data-theme="dark"]` / `:root[data-theme="light"]`, and `<meta name="theme-color">` was absent in `src/routes/__root.tsx`.

---

## 2. CSS Variable, Theme Block & Typography Inventory (`src/styles.css`)

| Block / Selector | Key Variables | Notes |
|---|---|---|
| `@theme inline` | `--color-background`, `--color-card`, `--color-border`, `--color-market-positive/negative/neutral` | Maps CSS vars to Tailwind utility classes. |
| `:root` (shadcn light defaults) | `--background: oklch(1 0 0)`, `--card: oklch(1 0 0)`, `--border: oklch(0.929 0.013 255.508)` | Pure white default before `data-theme` applies. |
| `.dark`, `:root[data-theme="dark"]` | `--background: oklch(0.19 0.005 260)`, `--card: oklch(0.225 0.006 260)`, `--border: oklch(1 0 0 / 10%)` | Cool charcoal; previously mismatched with `--eb-bg: #070a0e`. |
| `:root[data-theme="light"]` | `--background: oklch(0.972 0.008 85)`, `--card: oklch(0.985 0.006 85)`, `--eb-bg: #f7f4ee`, `--eb-card: #fbf9f4` | Warm off-white theme. |
| `:root` (`--eb-*` layer) | `--eb-bg: #070a0e`, `--eb-bg2: #0d1117`, `--eb-bg3: #161b22`, `--eb-card: rgba(24,24,27,0.45)`, `--eb-accent: #d4af37`, `--eb-bull: #22c88a`, `--eb-bear: #ef4c5a`, `--eb-muted: #8592a8` | Legacy terminal tokens; `--eb-card` transparency caused background bleed-through. |
| Typography | `--eb-body: "Inter", system-ui, sans-serif`, `--eb-head: "Space Grotesk", system-ui, sans-serif`, `--eb-mono: "JetBrains Mono", ui-monospace, monospace` | `html` / `body` sets `font-variant-numeric: tabular-nums` globally. |

---

## 3. WCAG AA Contrast Audit (Threshold: `4.5:1` normal text, `3.0:1` large text)

| Foreground / Background Pair | Ratio (Approx.) | Status | Remediation |
|---|---|---|---|
| `#e8edf5` (`--eb-text`) on `#11161f` (elevated card) | `14.6:1` | PASS (AAA) | Keep crisp slate-white `#e8edf5` / `#f1f5f9`. |
| `#94a3b8` (`slate-400`) on `#11161f` | `6.8:1` | PASS (AA) | Use `#94a3b8` as canonical muted label colour. |
| `#71717a` (`text-zinc-500`) on `#11161f` | `3.8:1` | **FAIL (AA)** | Promote secondary labels to `#94a3b8` (`text-slate-400`). |
| `#52525b` (`text-zinc-600`) on `#0d1117` | `2.4:1` | **FAIL (AA)** | Replace with `#94a3b8` / `#cbd5e1` for readable metadata. |
| `#ef4c5a` (`--eb-bear`) on `rgba(239, 76, 90, 0.15)` over `#11161f` | `4.2:1` | **FAIL (AA small text)** | Use `#fb7185` (`rose-400`, `~6.4:1`) for badge text on dark rose tint. |
| `#22c88a` (`--eb-bull`) on `#11161f` | `8.7:1` | PASS (AA) | Keep emerald/teal `#34d399` / `#22c88a`. |
| `#f59e0b` (`amber-500`) on `#ffffff` (light mode accent) | `2.15:1` | **FAIL (AA)** | Clamp light-mode `--eb-text-accent` to `#92400e` / `#8a6400` (`>5.5:1`). |

---

## 4. Top 30 Files by Hard-Coded Colour Usage (`src/`)

Scan regex: `(bg-\[#|text-\[#|border-\[#|rgba\(|#[0-9a-fA-F]{3,8}|bg-amber-|bg-emerald-|bg-rose-|bg-zinc-|bg-slate-|border-amber-|border-emerald-|border-rose-|border-zinc-)` across **153** files:

1. `src/routes/astro.tsx` (271)
2. `src/styles.css` (229)
3. `src/routes/index.tsx` (227)
4. `src/routes/_authenticated/chronowheel.tsx` (217)
5. `src/routes/_authenticated/settings.tsx` (189)
6. `src/routes/live-chart.tsx` (149)
7. `src/routes/_authenticated/unicorn-radar.tsx` (143)
8. `src/routes\_authenticated\fo-ban-list.tsx` (113)
9. `src/routes/_authenticated/options-chain.tsx` (111)
10. `src/routes/options-analytics.tsx` (108)
11. `src/components/chart/TradingViewLightweightChart.tsx` (100)
12. `src/routes/_authenticated/alerts.tsx` (88)
13. `src/routes/_authenticated/admin.features.tsx` (85)
14. `src/components/dashboard/InstitutionalResearchDeck.tsx` (80)
15. `src/components/cycles/ChronoWheelGuideModal.tsx` (66)
16. `src/components/option-chain/OptionChainTable.tsx` (65)
17. `src/routes/_authenticated/admin.telegram.tsx` (65)
18. `src/routes/option-strategy.tsx` (64)
19. `src/routes/_authenticated/admin.theme.tsx` (63)
20. `src/routes/_authenticated/admin.users.tsx` (62)
21. `src/components/cycles/ChronoWheelAIBot.tsx` (53)
22. `src/routes/combined-pcr.tsx` (49)
23. `src/components/dashboard/IctUnicornRadarView.tsx` (48)
24. `src/lib/planet-style.ts` (48)
25. `src/routes/_authenticated/admin.plans.tsx` (47)
26. `src/routes/_authenticated/admin.navigation.tsx` (46)
27. `src/routes/_authenticated/institutional-flow.tsx` (42)
28. `src/components/option-chain/LtpBlastScreener.tsx` (39)
29. `src/components/option-chain/StockFourLineCard.tsx` (39)
30. `src/components/FiiDiiActivity.tsx` (36)

---

## 5. Planned Institutional Terminal Dark Palette & Surface Hierarchy

- **Canvas Base:** `#090c10` (`--eb-bg`, `--eb-base-bg`) and `#0d1117` (`--eb-bg2`)
- **Elevated Card Surface:** `#11161f` (`--eb-card`, `--card`) and `#141b26` (`--eb-bg3`) — solid/near-opaque institutional charcoal, **no muddy gold/olive bleed-through**
- **Hairline Borders:** `1px solid rgba(148, 163, 184, 0.14)` (`--eb-border`), hover `rgba(148, 163, 184, 0.28)`
- **Semantic Accents:**
  - Bullish / Positive: `#34d399` / `#22c88a` (emerald/teal)
  - Bearish / Negative: `#fb7185` (rose/crimson, AA-compliant on dark tints)
  - Neutral / Market-Closed: `#94a3b8` (slate) & restrained `#f59e0b` / `#fbbf24` (amber)
- **Typography:** `tabular-nums` on all prices, OI/volume, percentages, and timestamps; `A-` / `100%` / `A+` header scale control persisted in `localStorage`.
- **Global Shell:** Full-width layout (`w-full max-w-none`), top-right `≡` navigation drawer across all routes, `<meta name="theme-color">` + `color-scheme` alignment.
