import {
  ASTRO_FORMULA_VERSIONS,
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroFormulaLabel,
  isLegacyAstroFormula,
  type AstroFormulaVersion,
} from "@/lib/engine-version";

type Props = {
  version?: AstroFormulaVersion | string | null;
  /** Show "EXTENDED" note when R3/S3 are on-screen. */
  extended?: boolean;
  compact?: boolean;
  title?: string;
};

/**
 * Compact pill showing which Astro formula produced the surrounding data.
 * Server outputs carry `astroFormulaVersion` — never infer client-side.
 */
export function FormulaBadge({ version, extended, compact, title }: Props) {
  const resolved = normalize(version);
  const label = astroFormulaLabel(resolved);
  const legacy = isLegacyAstroFormula(resolved);
  const bg = legacy ? "var(--eb-bear, #b45309)" : "var(--eb-accent, #0f766e)";
  const border = legacy ? "var(--eb-bear, #b45309)" : "var(--eb-border, #22314a)";
  return (
    <span
      title={title ?? `Astro Formula: ${label}${extended ? " · R3/S3 = EagleBaba Extended (non-Gann)" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "2px 8px" : "4px 10px",
        fontSize: compact ? 10 : 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: `${bg}22`,
        color: bg,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.75 }}>{legacy ? "⚠︎" : "◈"}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {extended ? <span style={{ opacity: 0.7 }}>· R3/S3 EXTENDED</span> : null}
    </span>
  );
}

function normalize(v: Props["version"]): AstroFormulaVersion {
  if (v === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1) {
    return ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1;
  }
  if (v === ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1) {
    return ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1;
  }
  return DEFAULT_ASTRO_FORMULA_VERSION;
}

export default FormulaBadge;