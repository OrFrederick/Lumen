"""Resolve unverified entities to Wikidata QIDs.

For every `entities` row where ``wikidata_qid IS NULL AND verified=0``:

  1. Search Wikidata by name + kind hint.
  2. If a confident match is found:
     - if its QID already exists in our DB, merge this row into the existing.
     - otherwise, set the QID + structured facts on the row, mark verified.
  3. Bulk-insert labels/aliases into `entity_aliases`.

If nothing confident matches, the row is left untouched and logged.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import unicodedata
from collections.abc import Iterable
from pathlib import Path
from typing import Any, cast

# Allow `python scripts/resolve_entities.py ...` as well as `-m scripts.resolve_entities`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, transaction  # noqa: E402
from scripts.lib.wikidata import (  # noqa: E402
    aliases_for,
    get_entity,
    search_entities,
    wikipedia_url_for,
)

# Confidence: label must match closely OR description must hint at kind.
_GOOD_DESC_KEYWORDS = {
    "person": (
        "physicist",
        "scientist",
        "mathematician",
        "biologist",
        "chemist",
        "engineer",
        "astronomer",
        "philosopher",
        "researcher",
        "professor",
        "inventor",
    ),
    "concept": ("theory", "concept", "principle", "law", "field", "effect", "phenomenon"),
    "paper": ("paper", "article", "publication", "study"),
    "experiment": ("experiment",),
    "event": ("event",),
    "place": ("city", "country", "region", "town"),
    "work": ("book", "film", "work"),
}


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFC", (s or "").strip().lower())


def _label_close(query: str, label: str) -> bool:
    q = _normalize(query)
    lbl = _normalize(label)
    if not q or not lbl:
        return False
    if q == lbl:
        return True
    if q in lbl or lbl in q:
        return abs(len(q) - len(lbl)) <= max(4, int(0.3 * max(len(q), len(lbl))))
    return False


def _description_matches_kind(desc: str, kind: str) -> bool:
    kws = _GOOD_DESC_KEYWORDS.get(kind, ())
    if not kws:
        return False
    d = (desc or "").lower()
    return any(kw in d for kw in kws)


def _is_confident(name: str, kind: str, candidate: dict[str, Any]) -> bool:
    label = candidate.get("label") or ""
    desc = candidate.get("description") or ""
    # exact (normalized) label match → accept.
    if _normalize(label) == _normalize(name):
        return True
    # otherwise require label proximity + kind keyword hint in description.
    return _label_close(name, label) and (not kind or _description_matches_kind(desc, kind))


def _pending_rows(conn: sqlite3.Connection, *, kind: str | None, limit: int | None) -> list[Any]:
    sql = (
        "SELECT id, kind, name FROM entities "
        "WHERE wikidata_qid IS NULL AND verified = 0"
    )
    params: list[Any] = []
    if kind:
        sql += " AND kind = ?"
        params.append(kind)
    sql += " ORDER BY id"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    return list(conn.execute(sql, params).fetchall())


def _existing_qid_row(conn: sqlite3.Connection, qid: str) -> sqlite3.Row | None:
    row = conn.execute("SELECT id FROM entities WHERE wikidata_qid = ?", (qid,)).fetchone()
    return cast("sqlite3.Row | None", row)


def _merge_into(conn: sqlite3.Connection, *, src_id: int, dst_id: int) -> None:
    """Reassign aliases/mentions/edges/claims from src_id to dst_id, delete src."""
    if src_id == dst_id:
        return
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
    conn.execute(
        "UPDATE OR IGNORE edges SET src = ? WHERE src = ?",
        (dst_id, src_id),
    )
    conn.execute("DELETE FROM edges WHERE src = ?", (src_id,))
    conn.execute(
        "UPDATE OR IGNORE edges SET dst = ? WHERE dst = ?",
        (dst_id, src_id),
    )
    conn.execute("DELETE FROM edges WHERE dst = ?", (src_id,))
    conn.execute(
        "UPDATE claims SET supporting_paper_id = ? WHERE supporting_paper_id = ?",
        (dst_id, src_id),
    )
    conn.execute("DELETE FROM entities WHERE id = ?", (src_id,))


def _populate_from_qid(
    conn: sqlite3.Connection, *, entity_id: int, qid_data: dict[str, Any], qid: str
) -> None:
    description = None  # filled by /enrich-wikipedia later
    wiki_url = wikipedia_url_for(qid_data)
    occupations = qid_data.get("occupations") or []
    occupation_str = ",".join(occupations) if occupations else None
    conn.execute(
        """
        UPDATE entities SET
          wikidata_qid = ?,
          wikipedia_url = COALESCE(wikipedia_url, ?),
          birth_year = COALESCE(birth_year, ?),
          death_year = COALESCE(death_year, ?),
          occupation = COALESCE(occupation, ?),
          image_url = COALESCE(image_url, ?),
          description = COALESCE(description, ?),
          verified = 1
        WHERE id = ?
        """,
        (
            qid,
            wiki_url,
            qid_data.get("birth_year"),
            qid_data.get("death_year"),
            occupation_str,
            qid_data.get("image"),
            description,
            entity_id,
        ),
    )


def _insert_aliases(
    conn: sqlite3.Connection, *, entity_id: int, kind: str, names: Iterable[str], source: str
) -> int:
    rows = [
        (_normalize(n), kind, entity_id, source)
        for n in names
        if n and _normalize(n)
    ]
    if not rows:
        return 0
    conn.executemany(
        "INSERT OR IGNORE INTO entity_aliases (alias, kind, entity_id, source) VALUES (?,?,?,?)",
        rows,
    )
    return len(rows)


def resolve_one(
    conn: sqlite3.Connection,
    *,
    entity_id: int,
    kind: str,
    name: str,
    dry_run: bool,
) -> str:
    """Resolve a single entity. Returns one of: matched|merged|skipped|no_match."""
    candidates = search_entities(name, kind)
    if not candidates:
        return "no_match"

    top = candidates[0]
    if not _is_confident(name, kind, top):
        return "no_match"

    qid = top.get("id")
    if not isinstance(qid, str) or not qid.startswith("Q"):
        return "no_match"

    qid_data = get_entity(qid)
    if not qid_data:
        return "no_match"

    if dry_run:
        return "matched"

    existing = _existing_qid_row(conn, qid)
    if existing is not None and existing["id"] != entity_id:
        _merge_into(conn, src_id=entity_id, dst_id=existing["id"])
        _insert_aliases(
            conn,
            entity_id=existing["id"],
            kind=kind,
            names=aliases_for(qid_data),
            source="wikidata_alias",
        )
        # Also keep the original surface form on the surviving entity.
        _insert_aliases(
            conn,
            entity_id=existing["id"],
            kind=kind,
            names=[name],
            source="llm_emit",
        )
        return "merged"

    _populate_from_qid(conn, entity_id=entity_id, qid_data=qid_data, qid=qid)
    _insert_aliases(
        conn,
        entity_id=entity_id,
        kind=kind,
        names=aliases_for(qid_data),
        source="wikidata_alias",
    )
    _insert_aliases(
        conn,
        entity_id=entity_id,
        kind=kind,
        names=[name],
        source="llm_emit",
    )
    return "matched"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Resolve unverified entities to Wikidata QIDs.")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to process.")
    parser.add_argument("--kind", type=str, default=None, help="Only resolve this kind.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Search + score, but do not modify the DB.",
    )
    args = parser.parse_args(argv)

    conn = connect()
    rows = _pending_rows(conn, kind=args.kind, limit=args.limit)
    if not rows:
        print("resolve_entities: nothing to do")
        return 0

    matched = merged = no_match = 0
    for row in rows:
        eid = int(row["id"])
        kind = str(row["kind"])
        name = str(row["name"])
        try:
            if args.dry_run:
                result = resolve_one(conn, entity_id=eid, kind=kind, name=name, dry_run=True)
            else:
                with transaction(conn):
                    result = resolve_one(conn, entity_id=eid, kind=kind, name=name, dry_run=False)
        except sqlite3.Error as e:
            print(f"! id={eid} name={name!r} db_error: {e}", file=sys.stderr)
            continue

        if result == "matched":
            matched += 1
            print(f"  match  id={eid} {kind}/{name!r}")
        elif result == "merged":
            merged += 1
            print(f"  merge  id={eid} {kind}/{name!r} -> existing")
        else:
            no_match += 1
            print(f"  miss   id={eid} {kind}/{name!r}")

    print(
        f"resolve_entities: processed={len(rows)} matched={matched} "
        f"merged={merged} no_match={no_match} dry_run={args.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
