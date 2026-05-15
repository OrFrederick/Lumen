"""Populate `edges` from Wikidata claims on verified entities.

For each entity with ``wikidata_qid`` set, fetch full claims and insert edges
into the ``edges`` table when both endpoints already exist in our DB. Skipped
otherwise — those edges materialize once the other endpoint is resolved.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, transaction  # noqa: E402
from scripts.lib.wikidata import get_entity  # noqa: E402

# (claim_property, edge_kind, direction)
# direction = "in"  -> edge points FROM other entity TO subject (other influenced subject)
# direction = "out" -> edge points FROM subject TO other entity
_EDGE_RULES: tuple[tuple[str, str, str], ...] = (
    ("influenced_by", "influenced", "in"),
    ("doctoral_advisor", "student_of", "out"),  # subject is student of advisor
    ("students_of", "student_of", "in"),  # subject taught these students
    ("authors", "authored_by", "in"),  # paper -> author
)


def _qid_to_entity_id(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute(
        "SELECT id, wikidata_qid FROM entities WHERE wikidata_qid IS NOT NULL"
    ).fetchall()
    return {str(r["wikidata_qid"]): int(r["id"]) for r in rows}


def _verified_entities(
    conn: sqlite3.Connection, *, limit: int | None
) -> list[sqlite3.Row]:
    sql = (
        "SELECT id, kind, name, wikidata_qid FROM entities "
        "WHERE wikidata_qid IS NOT NULL ORDER BY id"
    )
    params: list[Any] = []
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    return list(conn.execute(sql, params).fetchall())


def _insert_edge(
    conn: sqlite3.Connection, *, src: int, dst: int, kind: str, source: str
) -> int:
    if src == dst:
        return 0
    cur = conn.execute(
        "INSERT OR IGNORE INTO edges (src, dst, kind, weight, source) VALUES (?,?,?,?,?)",
        (src, dst, kind, 1.0, source),
    )
    return cur.rowcount or 0


def enrich(conn: sqlite3.Connection, *, limit: int | None, force: bool) -> None:
    qid_map = _qid_to_entity_id(conn)
    rows = _verified_entities(conn, limit=limit)
    inserted = 0
    skipped = 0
    for row in rows:
        eid = int(row["id"])
        qid = str(row["wikidata_qid"])
        data = get_entity(qid)
        if not data:
            continue

        for prop, edge_kind, direction in _EDGE_RULES:
            for other_qid in data.get(prop) or []:
                other_id = qid_map.get(other_qid)
                if other_id is None:
                    skipped += 1
                    continue
                if direction == "in":
                    src, dst = other_id, eid
                else:
                    src, dst = eid, other_id
                if force:
                    conn.execute(
                        "DELETE FROM edges WHERE src=? AND dst=? AND kind=?",
                        (src, dst, edge_kind),
                    )
                inserted += _insert_edge(
                    conn, src=src, dst=dst, kind=edge_kind, source="wikidata"
                )

    print(
        f"enrich_wikidata: processed={len(rows)} "
        f"edges_inserted={inserted} skipped_missing={skipped}"
    )


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Insert Wikidata-derived edges.")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-insert edges, overwriting any existing with same (src,dst,kind).",
    )
    args = p.parse_args(argv)

    conn = connect()
    try:
        with transaction(conn):
            enrich(conn, limit=args.limit, force=args.force)
    except sqlite3.Error as e:
        print(f"enrich_wikidata: db error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
