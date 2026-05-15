"""Build the extraction work queue.

Reads `videos` rows where `transcript_status='ok' AND extract_status='pending'`,
picks up to N, and emits a JSON array on stdout (or `--out PATH`) of:

    [{"video_id": "...", "transcript_path": "...", "output_path": "..."}, ...]

This script does NOT mutate the DB. The `/process` slash command consumes the
queue, dispatches subagents in parallel, then runs `extract_write.py` which
flips status flags.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TypedDict

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect  # noqa: E402
from scripts.lib.paths import DB_PATH, extracted_path, transcript_path  # noqa: E402


class QueueItem(TypedDict):
    video_id: str
    transcript_path: str
    output_path: str


def build_queue(db_path: Path, limit: int) -> list[QueueItem]:
    """Return up to `limit` pending-extract videos as queue items."""
    if limit <= 0:
        return []
    with connect(db_path, read_only=True) as conn:
        rows = conn.execute(
            """
            SELECT id
              FROM videos
             WHERE transcript_status = 'ok'
               AND extract_status   = 'pending'
             ORDER BY added_at ASC, id ASC
             LIMIT ?
            """,
            (limit,),
        ).fetchall()

    queue: list[QueueItem] = []
    for row in rows:
        vid = str(row["id"])
        queue.append(
            {
                "video_id": vid,
                "transcript_path": str(transcript_path(vid)),
                "output_path": str(extracted_path(vid)),
            }
        )
    return queue


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="extract_prep",
        description="Emit a work-queue JSON of pending-extract videos for the "
        "transcript-extractor subagent.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=8,
        help="Max number of videos to enqueue (default: 8).",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write JSON to this path instead of stdout.",
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
    if args.limit < 0:
        print("--limit must be non-negative", file=sys.stderr)
        return 2

    queue = build_queue(args.db, args.limit)
    payload = json.dumps(queue, indent=2)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload + "\n", encoding="utf-8")
        print(f"Wrote {len(queue)} item(s) to {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(payload + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
