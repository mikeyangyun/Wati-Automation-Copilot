/**
 * BotAvatar — a small friendly robot face used in chat surfaces.
 *
 * Renders in the floating Test Chatbot header (and is reusable for
 * future bot-attributed surfaces). When `online` is true, a small
 * WhatsApp-green dot is overlaid at the lower-right corner — the
 * familiar "online presence" pattern from any chat client, which
 * reinforces that the test simulator is actively listening.
 */
interface BotAvatarProps {
  /**
   * Whether to render the "online" presence dot. Driven by the
   * simulation status — true once a session is active.
   */
  online?: boolean;
  size?: number;
}

export function BotAvatar({ online = false, size = 28 }: BotAvatarProps) {
  return (
    <span
      className={`bot-avatar${online ? ' bot-avatar-online' : ''}`}
      style={{ width: size, height: size }}
      data-testid="bot-avatar"
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 28 28" focusable="false">
        <defs>
          <linearGradient id="bot-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1f6feb" />
          </linearGradient>
        </defs>
        {/* antenna — orientation cue that this is a "bot" not a person */}
        <line x1="14" y1="3" x2="14" y2="6" stroke="#1f6feb" strokeWidth="1.5" />
        <circle cx="14" cy="2.5" r="1.4" fill="#25d366" />
        {/* rounded square face */}
        <rect x="3.5" y="6" width="21" height="18" rx="5" fill="url(#bot-face)" />
        {/* eyes (pill-shaped for friendliness, not hostile dots) */}
        <rect x="8.5" y="12" width="3" height="3.5" rx="1.5" fill="#ffffff" />
        <rect x="16.5" y="12" width="3" height="3.5" rx="1.5" fill="#ffffff" />
        {/* small smile */}
        <path
          d="M10 19 q4 2.4 8 0"
          stroke="#ffffff"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {online ? <span className="bot-avatar-dot" /> : null}
    </span>
  );
}
