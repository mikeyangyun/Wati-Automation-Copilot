/**
 * BrandMark — the app's inline SVG logo.
 *
 * Visual metaphor: a rounded chat bubble (the WhatsApp / Wati surface)
 * with two "typed line" strokes inside (representing prompt → generated
 * flow output) and a sparkle dot in the corner (signalling that the
 * generation is AI-driven). The bubble carries the existing indigo →
 * violet gradient used across the Prompt panel and stepper, the sparkle
 * uses a WhatsApp-green accent so the mark reads as "AI chatbot" at a
 * glance.
 *
 * Implemented as an inline SVG so it inherits sharpness at any size,
 * needs zero network round-trips, and can be themed via CSS custom
 * properties without rebuilding an asset pipeline.
 */
interface BrandMarkProps {
  /**
   * Visible label that screen readers announce. Pass an empty string to
   * render the mark as decorative (e.g. when the surrounding text already
   * names the product, like the app header).
   */
  label?: string;
  size?: number;
}

export function BrandMark({ label = '', size = 36 }: BrandMarkProps) {
  const decorative = label === '';
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 36 36"
      {...(decorative
        ? { 'aria-hidden': true, focusable: false }
        : { role: 'img', 'aria-label': label })}
    >
      <defs>
        <linearGradient id="bm-bubble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f6feb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Speech bubble with a tail at the bottom-left so it reads as
       * "someone is talking" rather than a generic rounded rectangle. */}
      <path
        d="M9 4h18a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5h-11l-6 5v-5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z"
        fill="url(#bm-bubble)"
      />
      {/* Two transcript lines — prompt + generated reply. */}
      <rect x="10" y="12" width="16" height="2.5" rx="1.25" fill="rgba(255,255,255,0.9)" />
      <rect x="10" y="17" width="11" height="2.5" rx="1.25" fill="rgba(255,255,255,0.65)" />
      {/* Sparkle / "AI on" indicator. WhatsApp green so it visually pairs
       * with the chat domain rather than competing with the indigo brand. */}
      <circle cx="28" cy="8" r="4" fill="#25d366" />
      <circle cx="28" cy="8" r="1.6" fill="#ffffff" />
    </svg>
  );
}
