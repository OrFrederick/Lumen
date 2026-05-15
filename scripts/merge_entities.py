"""Manually collapse two entity rows into one.

All aliases, mentions, edges, and claim references are repointed from ``--from``
to ``--into``, then the source row is deleted. Wrapped in a transaction.
Use ``--dry-run`` to preview counts without writing.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import cast

# Allow `python scripts/merge_entities.py ...` as well as `-m scripts.merge_entities`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, transaction  # noqa: E402


def _row(conn: sqlite3.Connection, eid: int) -> sqlite3.Row | None:
    r = conn.execute(
        "SELECT id, kind, name, wikidata_qid FROM entities WHERE id = ?", (eid,)
    ).fetchone()
    return cast("sqlite3.Row | None", r)


def _counts(conn: sqlite3.Connection, eid: int) -> dict[str, int]:
    def n(sql: str) -> int:
        return int(conn.execute(sql, (eid,)).fetchone()[0])

    return {
        "aliases": n("SELECT COUNT(*) FROM entity_aliases WHERE entity_id = ?"),
        "mentions": n("SELECT COUNT(*) FROM entity_mentions WHERE entity_id = ?"),
        "edges_src": n("SELECT COUNT(*) FROM edges WHERE src = ?"),
        "edges_dst": n("SELECT COUNT(*) FROM edges WHERE dst = ?"),
        "claims": n("SELECT COUNT(*) FROM claims WHERE supporting_paper_id = ?"),
    }


def merge(conn: sqlite3.Connection, *, src_id: int, dst_id: int) -> None:
    if src_id == dst_id:
        raise ValueError("--from and --into must differ")
    if _row(conn, src_id) is None:
        raise ValueError(f"--from id={src_id} not found")
    if _row(conn, dst_id) is None:
        raise ValueError(f"--into id={dst_id} not found")

    conn.execute(
        "UPDATE OR IGNORE entity_aliases SET entity_id = ? WHERE entity_id = ?",
        (dst_id, src_id),
    )
    conn.execute("DELETE FROM entity_aliases WHERE entity_id = ?", (src_id,))

    conn.execute(
        "UPDATE OR IGNORE entity_mentions SET entity_id = ? WHERE entity_id = ?",
        (dst_id, src_id),
    )
    conn.execute("DELETE FROM entity_mentions WHERE entity_id = ?", (src_id,))

    conn.execute("UPDATE OR IGNORE edges SET src = ? WHERE src = ?", (dst_id, src_id))
    conn.execute("DELETE FROM edges WHERE src = ?", (src_id,))
    conn.execute("UPDATE OR IGNORE edges SET dst = ? WHERE dst = ?", (dst_id, src_id))
    conn.execute("DELETE FROM edges WHERE dst = ?", (src_id,))

    conn.execute(
        "UPDATE claims SET supporting_paper_id = ? WHERE supporting_paper_id = ?",
        (dst_id, src_id),
    )

    conn.execute("DELETE FROM entities WHERE id = ?", (src_id,))


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Merge entity --from into entity --into.")
    p.add_argument("--from", dest="src", type=int, required=True)
    p.add_argument("--into", dest="dst", type=int, required=True)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    conn = connect()
    src = _row(conn, args.src)
    dst = _row(conn, args.dst)
    if src is None or dst is None:
        print("error: --from or --into id not found", file=sys.stderr)
        return 2

    print(f"from: id={src['id']} {src['kind']}/{src['name']!r} qid={src['wikidata_qid']}")
    print(f"into: id={dst['id']} {dst['kind']}/{dst['name']!r} qid={dst['wikidata_qid']}")
    print(f"to move: {_counts(conn, args.src)}")

    if args.dry_run:
        print("dry-run: no changes written")
        return 0

    try:
        with transaction(conn):
            merge(conn, src_id=args.src, dst_id=args.dst)
    except (sqlite3.Error, ValueError) as e:
        print(f"merge failed: {e}", file=sys.stderr)
        return 1

    print("merge: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
