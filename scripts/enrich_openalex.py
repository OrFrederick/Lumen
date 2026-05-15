"""Enrich paper + person entities via OpenAlex.

- ``kind='paper'`` entities → ``/works?search=...`` → top result's OpenAlex ID.
  Citations (``referenced_works``) become ``cites`` edges to any paper entities
  already in our DB.
- ``kind='person'`` entities → ``/authors?search=...`` → top result's OpenAlex ID
  (best-effort; no ORCID lookup beyond what the search returns).
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Any

import requests

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, transaction  # noqa: E402
from scripts.lib.http_cache import cached_get  # noqa: E402

OPENALEX_WORKS = "https://api.openalex.org/works"
OPENALEX_AUTHORS = "https://api.openalex.org/authors"
OPENALEX_WORK_DETAIL = "https://api.openalex.org/works/{id}"
USER_AGENT = "Lumen/0.1 (https://github.com/OrFrederick/Lumen) mailto:enrich@lumen.local"
THROTTLE_MS = 150


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def _pending(
    conn: sqlite3.Connection, *, kind: str, limit: int | None, force: bool
) -> list[sqlite3.Row]:
    sql = "SELECT id, name, openalex_id FROM entities WHERE kind = ?"
    if not force:
        sql += " AND (openalex_id IS NULL OR openalex_id = '')"
    sql += " ORDER BY id"
    params: list[Any] = [kind]
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    return list(conn.execute(sql, params).fetchall())


def _short_openalex_id(full: str | None) -> str | None:
    if not isinstance(full, str) or not full:
        return None
    return full.rsplit("/", 1)[-1]


def _search_top(endpoint: str, api: str, name: str) -> dict[str, Any] | None:
    data = cached_get(
        endpoint,
        api=api,
        key=name,
        session=_session(),
        params={"search": name, "per-page": 1},
        throttle_ms=THROTTLE_MS,
    )
    if not data:
        return None
    results = data.get("results") or []
    if not results or not isinstance(results[0], dict):
        return None
    return results[0]


def _fetch_work(openalex_id: str) -> dict[str, Any] | None:
    return cached_get(
        OPENALEX_WORK_DETAIL.format(id=openalex_id),
        api="openalex_work",
        key=openalex_id,
        session=_session(),
        throttle_ms=THROTTLE_MS,
    )


def enrich_papers(
    conn: sqlite3.Connection, *, limit: int | None, force: bool
) -> tuple[int, int, int]:
    rows = _pending(conn, kind="paper", limit=limit, force=force)
    matched = 0
    edges_added = 0
    misses = 0

    # Build OpenAlex ID -> entity_id map for cites edges.
    paper_map: dict[str, int] = {
        str(r["openalex_id"]): int(r["id"])
        for r in conn.execute(
            "SELECT id, openalex_id FROM entities "
            "WHERE kind='paper' AND openalex_id IS NOT NULL AND openalex_id != ''"
        ).fetchall()
    }

    for row in rows:
        eid = int(row["id"])
        name = str(row["name"])
        top = _search_top(OPENALEX_WORKS, "openalex_works", name)
        if not top:
            misses += 1
            continue
        full_id = top.get("id")
        short = _short_openalex_id(full_id if isinstance(full_id, str) else None)
        if not short:
            misses += 1
            continue
        conn.execute(
            "UPDATE entities SET openalex_id = ? WHERE id = ?",
            (short, eid),
        )
        paper_map[short] = eid
        matched += 1

        # Cites edges (only when referenced work is already in our DB).
        work = _fetch_work(short) or top
        for ref in work.get("referenced_works") or []:
            ref_short = _short_openalex_id(ref if isinstance(ref, str) else None)
            if not ref_short:
                continue
            dst = paper_map.get(ref_short)
            if dst is None:
                continue
            cur = conn.execute(
                "INSERT OR IGNORE INTO edges (src, dst, kind, weight, source) "
                "VALUES (?,?,?,?,?)",
                (eid, dst, "cites", 1.0, "openalex"),
            )
            edges_added += cur.rowcount or 0

    return matched, edges_added, misses


def enrich_people(
    conn: sqlite3.Connection, *, limit: int | None, force: bool
) -> tuple[int, int]:
    rows = _pending(conn, kind="person", limit=limit, force=force)
    matched = 0
    misses = 0
    for row in rows:
        eid = int(row["id"])
        name = str(row["name"])
        top = _search_top(OPENALEX_AUTHORS, "openalex_authors", name)
        if not top:
            misses += 1
            continue
        full_id = top.get("id")
        short = _short_openalex_id(full_id if isinstance(full_id, str) else None)
        if not short:
            misses += 1
            continue
        conn.execute("UPDATE entities SET openalex_id = ? WHERE id = ?", (short, eid))
        matched += 1
    return matched, misses


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Enrich paper/person entities via OpenAlex.")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--force", action="store_true")
    args = p.parse_args(argv)

    conn = connect()
    try:
        with transaction(conn):
            p_matched, edges, p_miss = enrich_papers(conn, limit=args.limit, force=args.force)
            a_matched, a_miss = enrich_people(conn, limit=args.limit, force=args.force)
    except sqlite3.Error as e:
        print(f"enrich_openalex: db error: {e}", file=sys.stderr)
        return 1

    print(
        f"enrich_openalex: papers matched={p_matched} miss={p_miss} cites_added={edges} | "
        f"authors matched={a_matched} miss={a_miss}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
