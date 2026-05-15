"""Ingest videos from one or more YouTube channels into the Lumen DB.

Usage:
    uv run python scripts/ingest_channel.py @veritasium [@another ...] [--limit N]

Uses ``yt-dlp --flat-playlist`` semantics (fast, metadata-only) and upserts each
video into the ``videos`` table with ``source='channel'`` and
``transcript_status='pending'`` for new rows. Existing rows have their
metadata refreshed but their ``*_status`` fields are preserved.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

# Allow running as `python scripts/ingest_channel.py ...` in addition to
# `python -m scripts.ingest_channel`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, init_db, transaction  # noqa: E402
from scripts.lib.ytdlp import flat_channel  # noqa: E402

UPSERT_SQL = """
INSERT INTO videos (
  id, title, channel, channel_handle, published_at,
  duration_sec, url, thumbnail_url, description, source,
  transcript_status, extract_status, enrich_status, embed_status
) VALUES (
  :id, :title, :channel, :channel_handle, :published_at,
  :duration_sec, :url, :thumbnail_url, :description, :source,
  'pending', 'pending', 'pending', 'pending'
)
ON CONFLICT(id) DO UPDATE SET
  title          = excluded.title,
  channel        = COALESCE(excluded.channel, videos.channel),
  channel_handle = COALESCE(excluded.channel_handle, videos.channel_handle),
  published_at   = COALESCE(excluded.published_at, videos.published_at),
  duration_sec   = COALESCE(excluded.duration_sec, videos.duration_sec),
  url            = COALESCE(excluded.url, videos.url),
  thumbnail_url  = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
  description    = COALESCE(excluded.description, videos.description)
;
"""


def _upsert(conn: sqlite3.Connection, video: dict[str, Any], source: str) -> bool:
    """Insert or refresh a video row. Returns True if a new row was inserted."""
    payload = {**video, "source": source}
    pre_changes = conn.total_changes
    cur = conn.execute("SELECT 1 FROM videos WHERE id = ?", (video["id"],))
    existed = cur.fetchone() is not None
    conn.execute(UPSERT_SQL, payload)
    # SQLite's total_changes increments for both INSERT and UPDATE on upsert;
    # we use the pre-check above to decide newness.
    _ = pre_changes
    return not existed


def ingest_channels(handles: Sequence[str], limit: int | None) -> tuple[int, int]:
    """Ingest each handle. Returns (inserted, refreshed) counts."""
    init_db()
    inserted = 0
    refreshed = 0
    with connect() as conn, transaction(conn):
        for handle in handles:
            print(f"== channel: {handle} ==", flush=True)
            channel_inserted = 0
            channel_refreshed = 0
            for video in flat_channel(handle, limit):
                vid = video["id"]
                title = video.get("title") or "<no title>"
                is_new = _upsert(conn, video, source="channel")
                if is_new:
                    inserted += 1
                    channel_inserted += 1
                    print(f"  + {vid}  {title}", flush=True)
                else:
                    refreshed += 1
                    channel_refreshed += 1
                    print(f"  = {vid}  {title}", flush=True)
            print(
                f"  -> {channel_inserted} inserted, {channel_refreshed} refreshed",
                flush=True,
            )
    return inserted, refreshed


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ingest_channel",
        description="Enumerate a YouTube channel via yt-dlp and upsert videos into Lumen DB.",
    )
    parser.add_argument(
        "handles",
        nargs="+",
        help="Channel handle (e.g. @veritasium) or full channel URL.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of videos to fetch per channel.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    inserted, refreshed = ingest_channels(args.handles, args.limit)
    print(
        f"done: {inserted} inserted, {refreshed} refreshed "
        f"across {len(args.handles)} channel(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
