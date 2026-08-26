/**
 * Small stroke icons for the action buttons.
 *
 * Drawn on a 24-unit grid with a single stroke weight so they sit at the same
 * optical weight as the label beside them; `currentColor` means each one takes
 * the colour of whatever button it lands in.
 */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconClear({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** An arrow into a tray: the shape everyone reads as "keep this". */
export function IconSave({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3v11M12 14l-4-4M12 14l4-4" />
      <path d="M4 18v2h16v-2" />
    </svg>
  );
}

export function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M14.5 4.5l5 5L9 20H4v-5z" />
      <path d="M12.5 6.5l5 5" />
    </svg>
  );
}
