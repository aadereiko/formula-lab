#!/usr/bin/env python3
"""Rasterise the app icon to PNG.

iOS will not use an SVG touch icon and a web manifest wants real bitmaps, so
the SVG needs rasterising. No converter (rsvg, cairo, PIL) is assumed to be
installed, so this draws the same two shapes directly and writes the PNG with
nothing but `zlib` and `struct`.

Kept as a script rather than committed-only output so the icons can be
regenerated when the mark changes.

    python3 scripts/make-icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# The same geometry as public/icon.svg, in its 64-unit coordinate space.
TOP_BAR = (15, 23, 42, 30)      # x0, y0, x1, y1
BOTTOM_BAR = (22, 34, 49, 41)
BAR_RADIUS = 3.5
GRADIENT_TOP = (0x5B, 0x8C, 0xFF)
GRADIENT_BOTTOM = (0x24, 0x54, 0xE6)
BOTTOM_BAR_ALPHA = 0.88

SAMPLES = 3  # per axis, so 9 samples a pixel -- enough to hide the stair-steps


def _capsule_coverage(x: float, y: float, bar: tuple[float, float, float, float]) -> float:
    """1.0 inside a round-ended bar, 0.0 outside. Sampled, not analytic."""
    x0, y0, x1, y1 = bar
    # The bar is a segment between the two end-cap centres, thickened by the
    # radius -- which is exactly a capsule, so the test is distance-to-segment.
    cy = (y0 + y1) / 2
    ax, ay = x0 + BAR_RADIUS, cy
    bx, by = x1 - BAR_RADIUS, cy

    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    if length_squared == 0:
        t = 0.0
    else:
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length_squared))
    nearest_x, nearest_y = ax + t * dx, ay + t * dy
    distance = ((x - nearest_x) ** 2 + (y - nearest_y) ** 2) ** 0.5
    return 1.0 if distance <= BAR_RADIUS else 0.0


def _pixel(u: float, v: float) -> tuple[int, int, int]:
    """Colour at a point in the 0..64 icon space."""
    blend = v / 64
    base = tuple(
        round(top + (bottom - top) * blend)
        for top, bottom in zip(GRADIENT_TOP, GRADIENT_BOTTOM)
    )

    ink = _capsule_coverage(u, v, TOP_BAR)
    if ink:
        return (255, 255, 255)

    ink = _capsule_coverage(u, v, BOTTOM_BAR)
    if ink:
        return tuple(
            round(channel + (255 - channel) * BOTTOM_BAR_ALPHA) for channel in base
        )

    return base  # type: ignore[return-value]


def render(size: int) -> bytes:
    """Full-bleed RGB rows.

    No rounded corners: iOS masks the touch icon itself, and a maskable
    manifest icon is expected to fill its canvas.
    """
    rows = []
    step = 64 / size
    offset = step / (SAMPLES * 2)

    for py in range(size):
        row = bytearray()
        for px in range(size):
            red = green = blue = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    u = (px + (sx / SAMPLES)) * step + offset
                    v = (py + (sy / SAMPLES)) * step + offset
                    r, g, b = _pixel(u, v)
                    red += r
                    green += g
                    blue += b
            count = SAMPLES * SAMPLES
            row += bytes((red // count, green // count, blue // count))
        rows.append(bytes(row))
    return b"".join(b"\x00" + row for row in rows)  # filter byte 0 per scanline


def write_png(path: Path, size: int) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">2I5B", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"{path.name}: {size}x{size}, {len(png):,} bytes")


if __name__ == "__main__":
    PUBLIC.mkdir(exist_ok=True)
    write_png(PUBLIC / "apple-touch-icon.png", 180)
    write_png(PUBLIC / "icon-192.png", 192)
    write_png(PUBLIC / "icon-512.png", 512)
