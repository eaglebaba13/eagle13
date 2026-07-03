const LINES = [
  { hi: "केवल शैक्षिक उद्देश्य के लिए", en: "For educational purposes only" },
  { hi: "कोई निवेश सलाह नहीं", en: "Not investment advice" },
  { hi: "हम SEBI पंजीकृत सलाहकार नहीं हैं", en: "We are not SEBI registered advisors" },
  { hi: "बाज़ार निवेश जोखिमों के अधीन है", en: "Market investments are subject to risks" },
  { hi: "DYOR - अपना शोध स्वयं करें", en: "DYOR - Do Your Own Research" },
];

export function Disclaimer() {
  return (
    <div
      style={{
        marginTop: 16,
        background: "var(--eb-card)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 13px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--eb-bear) 14%, transparent), transparent 60%)",
        }}
      >
        <span aria-hidden style={{ fontSize: 14 }}>⚠️</span>
        <span
          style={{
            fontFamily: "var(--eb-head)",
            letterSpacing: 1,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--eb-bear)",
          }}
        >
          DISCLAIMER / अस्वीकरण
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "10px 14px",
          display: "grid",
          gap: 6,
        }}
      >
        {LINES.map((l) => (
          <li
            key={l.en}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontSize: 12.5,
              color: "var(--eb-text-dim)",
            }}
          >
            <span style={{ color: "var(--eb-bear)" }}>•</span>
            <span>
              {l.hi}
              <span style={{ opacity: 0.6 }}> — {l.en}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}