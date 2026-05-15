"""Validation + lightweight helpers shared by the extraction pipeline.

This module intentionally stays small. Heavy concerns (Wikidata enrichment,
slug generation, edge derivation) live in their own modules.

Contents:

- `normalize_alias` — surface-form canonicalization for `entity_aliases` lookups.
- `resolve_or_create_entity` — alias-cache-first stub resolver. Wikidata enrichment
  is a separate PR; this resolver only avoids duplicate stub rows within the DB.
- `seconds_from_ts` — accept ints, floats, or "MM:SS"/"HH:MM:SS" strings.
"""

from __future__ import annotations

import sqlite3
import unicodedata


def normalize_alias(name: str) -> str:
    """Normalize a surface form for alias-cache lookups.

    Steps: NFC unicode normalize -> strip surrounding whitespace -> lowercase.
    """
    return unicodedata.normalize("NFC", name).strip().lower()


def resolve_or_create_entity(conn: sqlite3.Connection, name: str, kind: str) -> int:
    """Return entity_id for `(name, kind)`, creating a stub row if needed.

    Lookup order:
      1. `entity_aliases` for `(normalized_alias, kind)` -> reuse entity_id.
      2. Miss -> INSERT new stub into `entities` (verified=0, no QID), record alias.

    Wikidata canonicalization happens later in `enrich_wikidata.py`.
    """
    alias = normalize_alias(name)
    row = conn.execute(
        "SELECT entity_id FROM entity_aliases WHERE alias = ? AND kind = ?",
        (alias, kind),
    ).fetchone()
    if row is not None:
        return int(row["entity_id"])

    cur = conn.execute(
        "INSERT INTO entities (kind, name, verified) VALUES (?, ?, 0)",
        (kind, name.strip()),
    )
    entity_id = int(cur.lastrowid or 0)
    if not entity_id:
        raise RuntimeError("Failed to obtain lastrowid for inserted entity")

    conn.execute(
        "INSERT OR IGNORE INTO entity_aliases (alias, kind, entity_id, source) "
        "VALUES (?, ?, ?, 'llm_emit')",
        (alias, kind, entity_id),
    )
    return entity_id


def seconds_from_ts(ts: int | float | str) -> int:
    """Coerce a timestamp into integer seconds.

    Accepts:
      - int                -> returned as-is
      - float              -> truncated toward zero
      - "SS" / "MM:SS" / "HH:MM:SS" (each part non-negative int)

    Raises ValueError on malformed strings.
    """
    if isinstance(ts, bool):  # bool is an int subclass — reject explicitly.
        raise TypeError(f"Invalid timestamp type: bool ({ts!r})")
    if isinstance(ts, int):
        return ts
    if isinstance(ts, float):
        return int(ts)
    if isinstance(ts, str):
        s = ts.strip()
        if not s:
            raise ValueError("empty timestamp string")
        parts = s.split(":")
        if len(parts) > 3:
            raise ValueError(f"invalid timestamp format: {ts!r}")
        try:
            nums = [int(p) for p in parts]
        except ValueError as exc:
            raise ValueError(f"non-integer component in timestamp: {ts!r}") from exc
        if any(n < 0 for n in nums):
            raise ValueError(f"negative component in timestamp: {ts!r}")
        total = 0
        for n in nums:
            total = total * 60 + n
        return total
    raise TypeError(f"unsupported timestamp type: {type(ts).__name__}")
