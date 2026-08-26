#!/usr/bin/env python3
"""Report the state of a Formula Lab database.

Run against the local file, or piped into `fly ssh console` for production --
the point of it living in a file is that the shell quoting for the latter is
otherwise unwriteable by hand. Read-only by construction: it counts and lists,
and has no code path that writes.
"""

from __future__ import annotations

import os
import sqlite3
import sys

DEFAULT = "/data/formula_lab.db"


def main(path: str) -> int:
    if not os.path.exists(path):
        print(f"no database at {path}")
        return 1

    size = os.path.getsize(path)
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    journal = con.execute("pragma journal_mode").fetchone()[0]
    print(f"{path}  {size:,} bytes  journal={journal}\n")

    tables = [row[0] for row in con.execute(
        "select name from sqlite_master where type='table' order by name")]
    width = max((len(t) for t in tables), default=0)
    for table in tables:
        count = con.execute(f"select count(*) from {table}").fetchone()[0]
        print(f"  {table:<{width}}  {count}")

    users = con.execute("select count(*) from users").fetchone()[0]
    if users:
        print("\n  accounts:")
        # Emails are the whole point of looking, but a full dump of somebody
        # else's data is not: this reports counts per account, not contents.
        for email, created in con.execute(
            "select email, created_at from users order by created_at"
        ):
            owned = con.execute(
                "select count(*) from saved_formulas where user_id ="
                " (select id from users where email = ?)", (email,)
            ).fetchone()[0]
            print(f"    {email}  joined {str(created)[:10]}  {owned} formulas")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
