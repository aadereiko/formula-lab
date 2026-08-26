interface Props {
  size?: number;
}

/**
 * The app mark, inline rather than an <img> so it inherits nothing from the
 * network and can be sized freely in the header.
 *
 * Same two shapes as public/icon.svg -- an equals sign with offset bars, which
 * survives being shrunk to a favicon.
 */
export function Logo({ size = 22 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="logo-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#2454e6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-tile)" />
      <rect x="15" y="23" width="27" height="7" rx="3.5" fill="#fff" />
      <rect x="22" y="34" width="27" height="7" rx="3.5" fill="#fff" opacity="0.88" />
    </svg>
  );
}
