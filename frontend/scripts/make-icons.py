#!/usr/bin/env python3
"""Rasterise the app icon to PNG.

iOS will not use an SVG touch icon and a web manifest wants real bitmaps, so
the SVG needs rasterising. No converter (rsvg, cairo, PIL) is assumed to be
installed, so this draws the same shapes directly and writes the PNG with
nothing but `zlib` and `struct`.

The mark is an isometric cube: three quadrilateral faces, each a different
shade. The shading carries the depth, which is why it still reads as solid at
favicon size where any outline detail would vanish.

Kept as a script rather than committed-only output so the icons can be
regenerated when the mark changes.

    python3 scripts/make-icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# The same geometry as public/icon.svg, in its 64-unit coordinate space. The
# three faces tile a hexagon exactly, so every sample lands in one of them and
# no seam can open up between two adjacent faces.
FACES: list[tuple[list[tuple[float, float]], tuple[int, int, int]]] = [
    ([(32, 6), (54, 18.7), (32, 31.4), (10, 18.7)], (0x8F, 0xB3, 0xFF)),      # top
    ([(10, 18.7), (32, 31.4), (32, 58), (10, 45.3)], (0x4D, 0x8D, 0xFF)),     # left
    ([(54, 18.7), (54, 45.3), (32, 58), (32, 31.4)], (0x24, 0x54, 0xE6)),     # right
]

# The PNGs are opaque: transparency on an iOS home screen renders as black, and
# a near-black ground matches the app while letting the blues carry.
BACKGROUND = (0x10, 0x10, 0x14)

SAMPLES = 3  # per axis, so 9 samples a pixel -- enough to hide the stair-steps


def _inside(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    """Ray casting: count edge crossings to the left of the point."""
    crossings = 0
    count = len(polygon)
    for index in range(count):
        x0, y0 = polygon[index]
        x1, y1 = polygon[(index + 1) % count]
        if (y0 > y) != (y1 > y):
            # x of the edge at this y; a crossing counts if it is to the right.
            crossing_x = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < crossing_x:
                crossings += 1
    return crossings % 2 == 1


def _pixel(u: float, v: float) -> tuple[int, int, int]:
    for polygon, colour in FACES:
        if _inside(u, v, polygon):
            return colour
    return BACKGROUND


def render(size: int) -> bytes:
    """Opaque RGB rows, supersampled."""
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
