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

/** A pin seen from the side; filled once the formula is actually pinned. */
export function IconPin({ size = 14, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} {...base} fill={filled ? "currentColor" : "none"}>
      <path d="M9 4h6l-1 5 3 3H7l3-3-1-5z" />
      <path d="M12 12v8" stroke="currentColor" fill="none" />
    </svg>
  );
}

/** A crosshair: the variable being solved for. */
export function IconTarget({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  );
}

export function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

/** An eye, struck through when the thing is hidden. */
export function IconEye({ size = 14, crossed = false }: { size?: number; crossed?: boolean }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
      {crossed && <path d="M4 20L20 4" />}
    </svg>
  );
}
