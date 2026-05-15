"""Consume transcript-extractor subagent outputs and write to SQLite.

For each `data/extracted/{video_id}.json`:
  1. Validate against EXTRACTION_SCHEMA.
  2. On invalid -> print errors, mark `videos.extract_status='error'`, skip.
  3. On valid -> in a single transaction insert into:
       - stories (+ stories_fts via trigger)
       - entity_mentions (resolving each surface form via validate.py stub resolver)
       - claims
       - topics (+ story_topics)
     Then flip `videos.extract_status='ok'`.

Entity resolution is intentionally minimal here: each surface form becomes a
stub `entities` row with `verified=0`. Wikidata canonicalization is a follow-up
PR (`enrich_wikidata.py`).

CLI:
  --video-id ID   process exactly one video
  --all           process every pending video with an extracted JSON
  --force         re-process even if `extract_status='ok'`
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path
from typing import Any

import jsonschema

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, transaction  # noqa: E402
from scripts.lib.paths import DB_PATH, EXTRACTED_DIR, extracted_path  # noqa: E402
from scripts.lib.schema import iter_extraction_errors, validate_extraction  # noqa: E402
from scripts.lib.validate import resolve_or_create_entity, seconds_from_ts  # noqa: E402


def _slugify(name: str) -> str:
    """Cheap deterministic slug — only used to dedup topics by name."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    out: list[str] = []
    last_dash = False
    for ch in s:
        if ch.isalnum():
            out.append(ch)
            last_dash = False
        elif not last_dash:
            out.append("-")
            last_dash = True
    return "".join(out).strip("-") or "topic"


def _set_video_status(conn: sqlite3.Connection, video_id: str, status: str) -> None:
    conn.execute(
        "UPDATE videos SET extract_status = ? WHERE id = ?",
        (status, video_id),
    )


def _upsert_topic(conn: sqlite3.Connection, name: str, field: str | None) -> int:
    slug = _slugify(name)
    row = conn.execute("SELECT id FROM topics WHERE slug = ?", (slug,)).fetchone()
    if row is not None:
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO topics (name, slug, field) VALUES (?, ?, ?)",
        (name.strip(), slug, field),
    )
    return int(cur.lastrowid or 0)


def _insert_story(
    conn: sqlite3.Connection,
    video_id: str,
    story: dict[str, Any],
) -> int:
    ts_start = seconds_from_ts(story["ts_start"])
    ts_end_raw = story.get("ts_end")
    ts_end = seconds_from_ts(ts_end_raw) if ts_end_raw is not None else None
    cur = conn.execute(
        """
        INSERT INTO stories
            (video_id, ts_start, ts_end, kind, title, body,
             significance, historical_year, historical_place, takeaway)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            video_id,
            ts_start,
            ts_end,
            story["kind"],
            story["title"],
            story["body"],
            story.get("significance"),
            story.get("historical_year"),
            story.get("historical_place"),
            story.get("takeaway"),
        ),
    )
    return int(cur.lastrowid or 0)


def _entity_kind_by_name(entities: list[dict[str, Any]]) -> dict[str, str]:
    """Map declared `entities[].name` -> kind for cross-referencing story mentions."""
    out: dict[str, str] = {}
    for e in entities:
        name = str(e["name"])
        kind = str(e["kind"])
        out.setdefault(name, kind)
    return out


def write_extraction(conn: sqlite3.Connection, doc: dict[str, Any]) -> None:
    """Write a validated extraction document. Single outer transaction."""
    video_id = str(doc["video_id"])
    field = doc.get("field")
    entities_list = list(doc.get("entities", []))
    kind_by_name = _entity_kind_by_name(entities_list)

    with transaction(conn):
        # Clear previous extraction artifacts for this video (idempotent re-runs).
        # Stories cascade-delete entity_mentions, claims, story_topics.
        conn.execute("DELETE FROM stories WHERE video_id = ?", (video_id,))

        # Pre-resolve all declared entities so their stub rows + aliases exist
        # even if they aren't directly mentioned in any story.
        entity_id_by_name: dict[str, int] = {}
        for ent in entities_list:
            entity_id_by_name[str(ent["name"])] = resolve_or_create_entity(
                conn, str(ent["name"]), str(ent["kind"])
            )

        # Topics
        topic_ids: list[tuple[int, float | None]] = []
        for topic in doc.get("topics", []):
            tid = _upsert_topic(conn, str(topic["name"]), field)
            topic_ids.append((tid, topic.get("weight")))

        # Stories + per-story mentions, claims, topic links.
        for story in doc.get("stories", []):
            story_id = _insert_story(conn, video_id, story)

            # Story-topic links (per-story; same weight for all topics on this video).
            for tid, weight in topic_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO story_topics (story_id, topic_id, weight) "
                    "VALUES (?, ?, ?)",
                    (story_id, tid, weight),
                )

            # Entity mentions referenced from the story.
            for surface in story.get("entities_mentioned", []) or []:
                name = str(surface)
                kind = kind_by_name.get(name, "concept")
                entity_id = entity_id_by_name.get(name)
                if entity_id is None:
                    entity_id = resolve_or_create_entity(conn, name, kind)
                    entity_id_by_name[name] = entity_id

                # Context snippet pulled from the declared entity, if available.
                declared = next(
                    (e for e in entities_list if str(e["name"]) == name), None
                )
                ts = story["ts_start"]
                context = declared.get("context") if declared else None
                role = declared.get("role") if declared else None
                conn.execute(
                    "INSERT OR IGNORE INTO entity_mentions "
                    "(story_id, entity_id, ts, context, role) VALUES (?, ?, ?, ?, ?)",
                    (story_id, entity_id, seconds_from_ts(ts), context, role),
                )

            # Claims attached to this story.
            for claim in story.get("claims", []) or []:
                claim_ts_raw = claim.get("ts")
                claim_ts = (
                    seconds_from_ts(claim_ts_raw) if claim_ts_raw is not None else None
                )
                conn.execute(
                    "INSERT INTO claims (story_id, ts, text, kind) VALUES (?, ?, ?, ?)",
                    (story_id, claim_ts, claim["text"], claim.get("kind")),
                )

        _set_video_status(conn, video_id, "ok")


def _video_status(conn: sqlite3.Connection, video_id: str) -> str | None:
    row = conn.execute(
        "SELECT extract_status FROM videos WHERE id = ?", (video_id,)
    ).fetchone()
    return None if row is None else str(row["extract_status"])


def _process_one(
    conn: sqlite3.Connection,
    video_id: str,
    json_path: Path,
    *,
    force: bool,
) -> bool:
    """Process a single extracted JSON. Return True on success."""
    status = _video_status(conn, video_id)
    if status is None:
        print(f"[{video_id}] ERROR: video not in DB; skipping", file=sys.stderr)
        return False
    if status == "ok" and not force:
        print(f"[{video_id}] already ok; pass --force to re-process", file=sys.stderr)
        return False

    if not json_path.exists():
        print(f"[{video_id}] ERROR: missing extraction file {json_path}", file=sys.stderr)
        with transaction(conn):
            _set_video_status(conn, video_id, "error")
        return False

    try:
        raw = json_path.read_text(encoding="utf-8")
        doc = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[{video_id}] ERROR: failed to load JSON: {exc}", file=sys.stderr)
        with transaction(conn):
            _set_video_status(conn, video_id, "error")
        return False

    try:
        validate_extraction(doc)
    except jsonschema.ValidationError:
        print(f"[{video_id}] ERROR: schema validation failed:", file=sys.stderr)
        for err in iter_extraction_errors(doc)[:10]:
            path = "/".join(str(p) for p in err.absolute_path) or "<root>"
            print(f"  - {path}: {err.message}", file=sys.stderr)
        with transaction(conn):
            _set_video_status(conn, video_id, "error")
        return False

    if not isinstance(doc, dict):  # defensive — schema requires object
        print(f"[{video_id}] ERROR: extraction is not an object", file=sys.stderr)
        with transaction(conn):
            _set_video_status(conn, video_id, "error")
        return False

    if str(doc["video_id"]) != video_id:
        print(
            f"[{video_id}] ERROR: file video_id {doc['video_id']!r} mismatches "
            f"filename; refusing to write",
            file=sys.stderr,
        )
        with transaction(conn):
            _set_video_status(conn, video_id, "error")
        return False

    try:
        write_extraction(conn, doc)
    except Exception as exc:  # noqa: BLE001 - blanket so single bad video doesn't abort batch
        print(f"[{video_id}] ERROR: DB write failed: {exc}", file=sys.stderr)
        try:
            with transaction(conn):
                _set_video_status(conn, video_id, "error")
        except sqlite3.Error as e2:
            print(f"[{video_id}] ERROR: also failed to mark error: {e2}", file=sys.stderr)
        return False

    n_stories = len(doc.get("stories", []))
    n_entities = len(doc.get("entities", []))
    print(f"[{video_id}] ok  stories={n_stories} entities={n_entities}")
    return True


def _collect_targets(
    conn: sqlite3.Connection,
    *,
    video_id: str | None,
    all_pending: bool,
    force: bool,
) -> list[str]:
    if video_id is not None:
        return [video_id]

    if not all_pending:
        return []

    # All videos with a pending extract whose extracted JSON exists, plus any
    # `error` rows we should retry. With --force, include 'ok' too.
    statuses = ("pending", "error") if not force else ("pending", "error", "ok")
    placeholders = ",".join("?" * len(statuses))
    rows = conn.execute(
        f"SELECT id FROM videos WHERE extract_status IN ({placeholders}) "  # noqa: S608
        "ORDER BY added_at ASC, id ASC",
        statuses,
    ).fetchall()
    candidates = [str(r["id"]) for r in rows]
    return [vid for vid in candidates if extracted_path(vid).exists()]


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="extract_write",
        description="Validate extracted JSON outputs and write to SQLite.",
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--video-id", help="Process exactly one video by id.")
    g.add_argument(
        "--all",
        action="store_true",
        dest="all_pending",
        help="Process every video with a pending/error extract and an extracted JSON.",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-process videos even if their extract_status is already 'ok'.",
    )
    p.add_argument(
        "--db",
        type=Path,
        default=DB_PATH,
        help=f"SQLite DB path (default: {DB_PATH}).",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    if not EXTRACTED_DIR.exists():
        print(
            f"No extracted directory at {EXTRACTED_DIR}; nothing to do.",
            file=sys.stderr,
        )
        return 0

    with connect(args.db) as conn:
        targets = _collect_targets(
            conn,
            video_id=args.video_id,
            all_pending=args.all_pending,
            force=args.force,
        )

        if not targets:
            print("No videos to process.", file=sys.stderr)
            return 0

        ok = 0
        fail = 0
        for vid in targets:
            success = _process_one(conn, vid, extracted_path(vid), force=args.force)
            if success:
                ok += 1
            else:
                fail += 1

    print(f"Done. ok={ok} fail={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
