"""Fill `entities.description` and `wikipedia_url` from Wikipedia REST summaries.

For every entity with a ``wikidata_qid`` but missing a description (or missing
``wikipedia_url`` when ``--force`` is set), fetch
``https://en.wikipedia.org/api/rest_v1/page/summary/{title}`` and persist the
extract + canonical URL.
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
from scripts.lib.wikidata import english_title, get_entity, wikipedia_url_for  # noqa: E402

WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
USER_AGENT = "Lumen/0.1 (https://github.com/OrFrederick/Lumen)"
THROTTLE_MS = 100


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def _pending(conn: sqlite3.Connection, *, force: bool, limit: int | None) -> list[sqlite3.Row]:
    sql = (
        "SELECT id, name, wikidata_qid, description, wikipedia_url FROM entities "
        "WHERE wikidata_qid IS NOT NULL"
    )
    if not force:
        sql += " AND (description IS NULL OR description = '' OR wikipedia_url IS NULL)"
    sql += " ORDER BY id"
    params: list[Any] = []
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    return list(conn.execute(sql, params).fetchall())


def _fetch_summary(title: str) -> dict[str, Any] | None:
    url = WIKIPEDIA_SUMMARY.format(title=title.replace(" ", "_"))
    return cached_get(
        url,
        api="wikipedia_summary",
        key=title,
        session=_session(),
        throttle_ms=THROTTLE_MS,
    )


def enrich(conn: sqlite3.Connection, *, force: bool, limit: int | None) -> None:
    rows = _pending(conn, force=force, limit=limit)
    updated = 0
    misses = 0
    for row in rows:
        qid = str(row["wikidata_qid"])
        qid_data = get_entity(qid)
        title = english_title(qid_data) if qid_data else None
        if not title:
            misses += 1
            continue
        summary = _fetch_summary(title)
        if not summary:
            misses += 1
            continue
        extract = summary.get("extract") or summary.get("description")
        content_urls = summary.get("content_urls") or {}
        desktop = content_urls.get("desktop") if isinstance(content_urls, dict) else None
        wiki_url = (
            (desktop or {}).get("page")
            if isinstance(desktop, dict)
            else None
        ) or wikipedia_url_for(qid_data)
        if not extract and not wiki_url:
            misses += 1
            continue
        if force:
            conn.execute(
                "UPDATE entities SET description = COALESCE(?, description), "
                "wikipedia_url = COALESCE(?, wikipedia_url) WHERE id = ?",
                (extract, wiki_url, int(row["id"])),
            )
        else:
            conn.execute(
                "UPDATE entities SET description = COALESCE(description, ?), "
                "wikipedia_url = COALESCE(wikipedia_url, ?) WHERE id = ?",
                (extract, wiki_url, int(row["id"])),
            )
        updated += 1

    print(f"enrich_wikipedia: processed={len(rows)} updated={updated} misses={misses}")


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="Backfill descriptions from Wikipedia REST.")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--force", action="store_true", help="Overwrite even when fields are set.")
    args = p.parse_args(argv)

    conn = connect()
    try:
        with transaction(conn):
            enrich(conn, force=args.force, limit=args.limit)
    except sqlite3.Error as e:
        print(f"enrich_wikipedia: db error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
