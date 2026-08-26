#!/usr/bin/env python3
"""Fail if a class the components render has no rule in any stylesheet.

Neither `tsc` nor the bundler can catch this: `className="dialog"` is just a
string, so a stylesheet that lost half its rules still typechecks and still
builds. This closes that gap -- it is the one check that would have caught a
truncated `styles.css` immediately rather than after a visual read of the page.

Only plain literal class names are checked. A name assembled at runtime
(`` `row is-${state}` ``) is matched per-word where the words are literal, and
interpolated fragments are skipped rather than guessed at.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"

# A class name we accept as literal: lowercase, digits and dashes. This
# deliberately excludes anything with `${`, quotes or capitals, so template
# fragments cannot be mistaken for names. A trailing dash means the name was
# cut off by an interpolation (`is-${state}`), so it is a prefix, not a name.
NAME = re.compile(r"^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$")

# `className="a b"`, `className={`a b`}` and `className={"a b"}`. The template
# form keeps whatever literal words sit outside the `${...}` holes.
CLASS_ATTR = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})')

HOLE = re.compile(r"\$\{[^}]*\}")

# Names that live only in markup we do not own, or are set on <html>/<body>
# from JS rather than rendered by a component.
EXEMPT: set[str] = set()


def defined_classes() -> set[str]:
    css = "".join(path.read_text() for path in sorted(SRC.glob("*.css")))
    return set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", css))


def rendered_classes() -> dict[str, str]:
    """Every literal class name, mapped to the file that renders it."""
    found: dict[str, str] = {}
    for path in sorted(SRC.rglob("*.tsx")):
        for groups in CLASS_ATTR.findall(path.read_text()):
            # Drop the `${...}` holes first. Their contents are expressions, and
            # an identifier inside one (`mode === value`) is not a class name.
            text = HOLE.sub(" ", " ".join(groups))
            for word in text.split():
                if NAME.match(word):
                    found.setdefault(word, str(path.relative_to(SRC)))
    return found


def main() -> int:
    defined = defined_classes()
    rendered = rendered_classes()
    missing = sorted(name for name in rendered if name not in defined | EXEMPT)

    if missing:
        print(f"{len(missing)} rendered class(es) have no CSS rule:\n")
        for name in missing:
            print(f"  .{name:<24} rendered by src/{rendered[name]}")
        print("\nEither add a rule or stop rendering the class.")
        return 1

    print(f"styles ok: {len(rendered)} rendered classes all have rules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
