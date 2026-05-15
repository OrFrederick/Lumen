"""Rebuild FTS5 + export a JSON snapshot of global library counts.

Why
---
`stories_fts` is an external-content FTS5 table kept in sync by triggers in
`scripts/lib/db.py`. Triggers cover normal INSERT/UPDATE/DELETE, but a
`rebuild` from external content is the safe fallback after bulk loads or
trigger-skipping operations (e.g. import scripts that bypass triggers).

The JSON snapshot at `data/index_snapshot.json` exposes high-level counts
(videos, stories, entities, edges-by-kind) for the Next.js frontend so it
can render a "library at a glance" panel without paying SQL on every page.

CLI
---
    uv run python scripts/build_index.py --rebuild-fts
    uv run python scripts/build_index.py --snapshot
    uv run python scripts/build_index.py --all
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from scripts.lib.db import connect
from scripts.lib.paths import DATA_DIR

SNAPSHOT_PATH: Path = DATA_DIR / "index_snapshot.json"


# --------------------------------------------------------------------------- #
# FTS rebuild
# --------------------------------------------------------------------------- #


def rebuild_fts(conn: sqlite3.Connection) -> None:
    """Rebuild stories_fts from its external content table."""
    conn.execute("INSERT INTO stories_fts(stories_fts) VALUES('rebuild')")
    conn.commit()
    n = conn.execute("SELECT count(*) AS c FROM stories_fts").fetchone()["c"]
    print(f"[fts] rebuilt stories_fts ({n} rows)")


# --------------------------------------------------------------------------- #
# Snapshot
# --------------------------------------------------------------------------- #


def build_snapshot(conn: sqlite3.Connection) -> dict[str, object]:
    """Collect global counts useful for the frontend overview."""
    videos = conn.execute("SELECT count(*) AS c FROM videos").fetchone()["c"]
    stories = conn.execute("SELECT count(*) AS c FROM stories").fetchone()["c"]
    entities = conn.execute("SELECT count(*) AS c FROM entities").fetchone()["c"]
    edges_total = conn.execute("SELECT count(*) AS c FROM edges").fetchone()["c"]

    edges_by_kind: dict[str, int] = {}
    for row in conn.execute(
        "SELECT kind, count(*) AS c FROM edges GROUP BY kind ORDER BY kind"
    ):
        edges_by_kind[row["kind"]] = row["c"]

    entities_by_kind: dict[str, int] = {}
    for row in conn.execute(
        "SELECT kind, count(*) AS c FROM entities GROUP BY kind ORDER BY kind"
    ):
        entities_by_kind[row["kind"]] = row["c"]

    snapshot: dict[str, object] = {
        "videos": videos,
        "stories": stories,
        "entities": entities,
        "entities_by_kind": entities_by_kind,
        "edges": edges_total,
        "edges_by_kind": edges_by_kind,
    }
    return snapshot


def write_snapshot(snapshot: dict[str, object], path: Path = SNAPSHOT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"[snapshot] wrote {path}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rebuild FTS5 + export index snapshot.")
    p.add_argument("--rebuild-fts", action="store_true", help="Rebuild stories_fts.")
    p.add_argument(
        "--snapshot",
        action="store_true",
        help="Write data/index_snapshot.json with global counts.",
    )
    p.add_argument(
        "--all",
        action="store_true",
        help="Equivalent to --rebuild-fts --snapshot.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if not (args.rebuild_fts or args.snapshot or args.all):
        print("nothing to do; pass --rebuild-fts, --snapshot, or --all", file=sys.stderr)
        return 2

    do_fts = args.rebuild_fts or args.all
    do_snapshot = args.snapshot or args.all

    conn = connect()
    try:
        if do_fts:
            rebuild_fts(conn)
        if do_snapshot:
            snapshot = build_snapshot(conn)
            write_snapshot(snapshot)
            print(json.dumps(snapshot, indent=2, sort_keys=True))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
