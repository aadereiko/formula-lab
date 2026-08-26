interface Props {
  size?: number;
}

/**
 * The app mark: an isometric cube, three faces each lit differently.
 *
 * Inline rather than an <img> so it inherits nothing from the network and can
 * be sized freely. Same geometry as public/icon.svg — the shading is what
 * carries the depth, which is why it survives being shrunk to a favicon.
 */
export function Logo({ size = 22 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="logo"
      // Rounded joins soften the corners and close the hairline seams that
      // anti-aliasing would otherwise leave between adjacent faces.
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M32 6 54 18.7 32 31.4 10 18.7Z" fill="#8FB3FF" stroke="#8FB3FF" />
      <path d="M10 18.7 32 31.4 32 58 10 45.3Z" fill="#4D8DFF" stroke="#4D8DFF" />
      <path d="M54 18.7 54 45.3 32 58 32 31.4Z" fill="#2454E6" stroke="#2454E6" />
    </svg>
  );
}
