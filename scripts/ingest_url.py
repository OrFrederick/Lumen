"""Ingest one or more individual YouTube videos into the Lumen DB.

Usage:
    uv run python scripts/ingest_url.py <url-or-id> [<url-or-id> ...]
    uv run python scripts/ingest_url.py --file urls.txt

Each target is resolved via yt-dlp and upserted with ``source='adhoc'``.
``*_status`` fields default to ``pending`` for new rows and are preserved on
re-ingest.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

# Allow running as `python scripts/ingest_url.py ...` in addition to
# `python -m scripts.ingest_url`.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib.db import connect, init_db, transaction  # noqa: E402
from scripts.lib.ytdlp import video_info  # noqa: E402

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
    cur = conn.execute("SELECT 1 FROM videos WHERE id = ?", (video["id"],))
    existed = cur.fetchone() is not None
    conn.execute(UPSERT_SQL, payload)
    return not existed


def _read_file(path: Path) -> list[str]:
    targets: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        targets.append(line)
    return targets


def ingest_urls(targets: Iterable[str]) -> tuple[int, int, int]:
    """Ingest each URL/ID. Returns (inserted, refreshed, errored)."""
    init_db()
    inserted = 0
    refreshed = 0
    errored = 0
    with connect() as conn, transaction(conn):
        for target in targets:
            try:
                video = video_info(target)
            except Exception as exc:  # noqa: BLE001 — surface yt-dlp failures per-row
                errored += 1
                print(f"  ! {target}  error: {exc}", flush=True)
                continue
            if not video.get("id"):
                errored += 1
                print(f"  ! {target}  error: missing video id in yt-dlp response", flush=True)
                continue
            title = video.get("title") or "<no title>"
            is_new = _upsert(conn, video, source="adhoc")
            if is_new:
                inserted += 1
                print(f"  + {video['id']}  {title}", flush=True)
            else:
                refreshed += 1
                print(f"  = {video['id']}  {title}", flush=True)
    return inserted, refreshed, errored


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ingest_url",
        description="Resolve YouTube video URLs/IDs via yt-dlp and upsert into Lumen DB.",
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="One or more YouTube video URLs or video IDs.",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Path to a newline-separated file of URLs/IDs (one per line, # comments allowed).",
    )
    return parser.parse_args(argv)


def _collect_targets(args: argparse.Namespace) -> Sequence[str]:
    targets: list[str] = list(args.targets)
    if args.file is not None:
        targets.extend(_read_file(args.file))
    return targets


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    targets = _collect_targets(args)
    if not targets:
        print("ingest_url: no URLs/IDs provided (pass positional args or --file).", file=sys.stderr)
        return 2
    inserted, refreshed, errored = ingest_urls(targets)
    print(
        f"done: {inserted} inserted, {refreshed} refreshed, {errored} errored "
        f"out of {len(targets)} target(s)."
    )
    return 0 if errored == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
