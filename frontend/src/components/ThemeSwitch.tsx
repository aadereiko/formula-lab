import type { Theme } from "../useTheme";

interface Props {
  theme: Theme;
  next: Theme;
  onCycle: () => void;
}

const LABEL: Record<Theme, string> = {
  system: "matching your system",
  light: "light",
  dark: "dark",
};

/**
 * One button that cycles system → light → dark.
 *
 * A single control rather than three: the current state is legible from its
 * icon, and the label says what the next press will do, so nothing is hidden
 * behind a menu.
 */
export function ThemeSwitch({ theme, next, onCycle }: Props) {
  return (
    <button
      type="button"
      className="icon-btn theme-switch"
      title={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      onClick={onCycle}
    >
      {theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <Auto />}
    </button>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Sun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

/** Half filled: the palette is whatever the system says. */
function Auto() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
