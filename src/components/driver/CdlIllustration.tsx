/**
 * A simplified front of a CDL with the "END" box highlighted, so drivers know where the
 * endorsement letters are printed. Colors come from the tokens only.
 */
export function CdlIllustration() {
  return (
    <svg
      viewBox="0 0 240 150"
      role="img"
      aria-label="The front of a CDL. The endorsement letters are printed in a box next to the word END."
      className="mx-auto h-auto w-full max-w-60"
    >
      <rect
        x="2"
        y="2"
        width="236"
        height="146"
        rx="8"
        className="fill-card stroke-border-strong"
        strokeWidth="3"
      />
      <path d="M2 10a8 8 0 0 1 8-8h220a8 8 0 0 1 8 8v18H2z" className="fill-sign-panel" />
      <text
        x="14"
        y="21"
        className="fill-sign-panel-foreground font-heading"
        fontWeight="700"
        fontSize="13"
      >
        COMMERCIAL DRIVER LICENSE
      </text>
      <rect x="14" y="40" width="62" height="78" rx="4" className="fill-muted" />
      <rect x="88" y="42" width="110" height="7" rx="2" className="fill-muted" />
      <rect x="88" y="56" width="80" height="7" rx="2" className="fill-muted" />
      <rect x="88" y="70" width="95" height="7" rx="2" className="fill-muted" />
      <rect x="88" y="84" width="60" height="7" rx="2" className="fill-muted" />
      <rect
        x="84"
        y="100"
        width="146"
        height="34"
        rx="4"
        className="fill-selection-tint stroke-selection"
        strokeWidth="3"
      />
      <text x="94" y="115" className="fill-muted-foreground" fontSize="10">
        END
      </text>
      <text x="124" y="124" className="fill-foreground font-heading" fontWeight="700" fontSize="22">
        H N T
      </text>
    </svg>
  );
}
