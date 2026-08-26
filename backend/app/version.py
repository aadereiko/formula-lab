"""The app's version, in one place.

Lives inside ``app/`` rather than at the repository root so it ships with the
Docker image without the Dockerfile needing to know about it -- the image copies
``backend/app``, and a root-level VERSION file would simply be absent.

Semantic-ish, for something with no API consumers but its own front end:

* **major** -- stored data or the URL scheme changes in a way that is not
  backwards compatible.
* **minor** -- a feature somebody would notice (plots, categories, accounts).
* **patch** -- fixes and polish.

Bumping it means editing this line and ``frontend/package.json`` to match; a
test fails if the two drift, because a version shown in the UI that disagrees
with the package metadata is worse than no version at all.
"""

VERSION = "1.2.0"
