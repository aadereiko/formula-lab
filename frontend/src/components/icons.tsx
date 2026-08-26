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

/**
 * GitHub's mark, reproduced rather than drawn.
 *
 * The only icon here that does not use `base`: it is a filled trademark on a
 * 16-unit grid, not a 2px stroke on 24, and redrawing it to match the set would
 * make it a worse likeness of a logo whose whole job is to be recognised.
 * `currentColor` still applies, so it takes the colour of the link around it.
 */
export function IconGitHub({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
        0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
        1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
        0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27
        2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
        1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01
        2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}


/* ── the three destinations ──────────────────────────────────────────────
 * Shown instead of the labels on a narrow screen, where "Workspace / My
 * formulas / Constants" cannot sit beside the account button. Each is two or
 * three strokes: at 15px, detail turns to mud.
 */

/** A flask. The workspace is the bench -- and the app is called Formula Lab. */
export function IconFlask({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9 3h6" />
      <path d="M10 3v5L5 19h14L14 8V3" />
    </svg>
  );
}

/** A bookmark, for the things you kept. */
export function IconBookmark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M7 3h10v18l-5-4-5 4z" />
    </svg>
  );
}

/** A pi. Nothing else says "constants" in three strokes. */
export function IconPi({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5 8h14" />
      <path d="M9.5 8v11" />
      <path d="M15 8v11" />
    </svg>
  );
}
