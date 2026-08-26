import { LOGO_FACES } from "./logoPaths";

interface Props {
  size?: number;
}

/**
 * The app mark: an isometric cube built from twelve smaller coloured cubes.
 *
 * Inline rather than an <img> so it inherits nothing from the network and can
 * be sized freely. The geometry comes from `logoPaths.ts`, which
 * `scripts/make-icons.py` generates alongside the SVG and the PNGs — one
 * source of truth, so the three cannot drift apart.
 */
export function Logo({ size = 22 }: Props) {
  return (
    // The wrapper carries the occasional idle tumble; the svg carries the
    // hover spin. Two elements because both are transforms, and one would
    // overwrite the other.
    <span className="logo-wrap" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="logo"
        // A hairline stroke in each cell's own colour closes the sub-pixel seams
        // anti-aliasing would otherwise leave between neighbouring cells.
        strokeWidth="0.6"
        strokeLinejoin="round"
      >
        {LOGO_FACES.map((face) => (
          <path key={face.d} d={face.d} fill={face.fill} stroke={face.fill} />
        ))}
      </svg>
    </span>
  );
}
