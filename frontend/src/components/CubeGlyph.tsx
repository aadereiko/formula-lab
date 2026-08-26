/**
 * A wireframe cube, drawn in the current text colour.
 *
 * Deliberately not the coloured brand mark: two full-colour cubes in one header
 * would compete. This is the same solid as an outline, so the sign-in
 * invitation is recognisably part of the same app while staying quiet — until
 * it is hovered, when it tumbles.
 */
interface Props {
  size?: number;
  /** Filled reads as "assembled", which is how a signed-in account shows. */
  solid?: boolean;
}

export function CubeGlyph({ size = 15, solid = false }: Props) {
  return (
    <svg
      className={`cube-glyph${solid ? " is-solid" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill={solid ? "currentColor" : "none"}
      fillOpacity={solid ? 0.22 : undefined}
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M32 6 54 18.7 54 45.3 32 58 10 45.3 10 18.7Z" />
      <path d="M32 31.4 54 18.7" />
      <path d="M32 31.4 10 18.7" />
      <path d="M32 31.4 32 58" />
    </svg>
  );
}
