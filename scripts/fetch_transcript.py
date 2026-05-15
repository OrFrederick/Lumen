"""Fetch transcripts for videos with `transcript_status='pending'`.

Strategy per video:
1. `youtube_transcript_api`: try English variants, then any auto-generated,
   then any translatable transcript translated to English.
2. Fallback: `yt-dlp` to download .vtt subtitles (manual + auto) and parse them.

Writes JSON to `data/transcripts/{video_id}.json` and flips
`videos.transcript_status` to `ok` / `missing` / `error`.

IO-bound, so we use a thread pool. Idempotent: existing transcripts are
skipped unless `--force` is set.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

# Allow running as `python scripts/fetch_transcript.py` from repo root.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    CouldNotRetrieveTranscript,
)
from yt_dlp import YoutubeDL  # type: ignore[import-untyped]

from scripts.lib.db import connect, transaction
from scripts.lib.paths import TRANSCRIPTS_DIR, ensure_data_dirs, transcript_path

ENGLISH_LANGS: tuple[str, ...] = ("en", "en-US", "en-GB")

# Segment is a flat dict so we can JSON-serialize without further work.
Segment = dict[str, Any]


# ---------- youtube-transcript-api primary ----------

def _fetch_via_api(video_id: str) -> tuple[list[Segment], str] | None:
    """Try youtube-transcript-api. Return (segments, language_code) or None on miss."""
    api = YouTubeTranscriptApi()
    try:
        tlist = api.list(video_id)
    except CouldNotRetrieveTranscript:
        return None

    # 1. English (manual or auto)
    try:
        transcript = tlist.find_transcript(list(ENGLISH_LANGS))
        fetched = transcript.fetch()
        return _segments_from_fetched(fetched), fetched.language_code
    except Exception:  # noqa: BLE001 — library raises a few NoTranscript* types
        pass

    # 2. Any generated transcript
    try:
        transcript = tlist.find_generated_transcript(list(ENGLISH_LANGS))
        fetched = transcript.fetch()
        return _segments_from_fetched(fetched), fetched.language_code
    except Exception:  # noqa: BLE001
        pass

    # 3. Any translatable transcript -> English
    for transcript in tlist:
        if getattr(transcript, "is_translatable", False):
            try:
                translated = transcript.translate("en")
                fetched = translated.fetch()
                return _segments_from_fetched(fetched), fetched.language_code
            except Exception:  # noqa: BLE001
                continue

    return None


def _segments_from_fetched(fetched: Any) -> list[Segment]:
    return [
        {"start": float(s.start), "duration": float(s.duration), "text": str(s.text)}
        for s in fetched.snippets
    ]


# ---------- yt-dlp fallback ----------

_VTT_TIMESTAMP_RE = re.compile(
    r"^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})"
)


def _parse_vtt(content: str) -> list[Segment]:
    """Minimal WebVTT parser → list of {start, duration, text}.

    Strips cue settings (e.g. `align:start position:0%`), inline `<...>` tags,
    and merges multi-line cue text with a space.
    """
    segments: list[Segment] = []
    lines = content.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = _VTT_TIMESTAMP_RE.match(line)
        if not m:
            i += 1
            continue
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (int(g) for g in m.groups())
        start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0
        end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0
        duration = max(0.0, end - start)
        i += 1
        text_parts: list[str] = []
        while i < len(lines) and lines[i].strip() != "":
            raw = lines[i]
            # strip inline tags like <00:00:01.000><c>word</c>
            cleaned = re.sub(r"<[^>]+>", "", raw).strip()
            if cleaned:
                text_parts.append(cleaned)
            i += 1
        text = " ".join(text_parts).strip()
        if text:
            segments.append({"start": start, "duration": duration, "text": text})
    return _dedupe_segments(segments)


def _dedupe_segments(segments: list[Segment]) -> list[Segment]:
    """Auto-generated VTTs often repeat the rolling cue. Drop consecutive duplicates."""
    out: list[Segment] = []
    last_text: str | None = None
    for seg in segments:
        if seg["text"] == last_text:
            continue
        out.append(seg)
        last_text = seg["text"]
    return out


def _fetch_via_ytdlp(video_id: str) -> tuple[list[Segment], str] | None:
    """Use yt-dlp to grab a .vtt subtitle file. Returns (segments, lang) or None."""
    with tempfile.TemporaryDirectory() as tmp:
        outtmpl = str(Path(tmp) / "%(id)s.%(ext)s")
        opts: dict[str, Any] = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en", "en-US", "en-GB", "en.*"],
            "subtitlesformat": "vtt",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
        }
        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            with YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception:  # noqa: BLE001 — yt-dlp raises many subclasses
            return None

        # Find any .vtt the downloader produced (prefer plain "en" if present).
        vtt_files = sorted(Path(tmp).glob(f"{video_id}*.vtt"))
        if not vtt_files:
            return None
        vtt = next(
            (p for p in vtt_files if ".en." in p.name or p.name.endswith(".en.vtt")),
            vtt_files[0],
        )
        try:
            content = vtt.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        segments = _parse_vtt(content)
        if not segments:
            return None
        # crude language extraction: e.g. "abc.en.vtt" -> "en"
        parts = vtt.stem.split(".")
        lang = parts[-1] if len(parts) > 1 else "en"
        return segments, lang


# ---------- per-video driver ----------

class FetchResult:
    __slots__ = ("video_id", "title", "status", "message")

    def __init__(self, video_id: str, title: str, status: str, message: str = "") -> None:
        self.video_id = video_id
        self.title = title
        self.status = status  # ok | missing | error | skipped
        self.message = message


def _write_transcript_json(
    video_id: str, segments: list[Segment], language: str, source: str
) -> None:
    payload = {
        "video_id": video_id,
        "language": language,
        "source": source,
        "segments": segments,
    }
    path = transcript_path(video_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def process_video(video_id: str, title: str, *, force: bool) -> FetchResult:
    """Fetch one transcript. Pure: no DB writes here, caller flips status."""
    out_path = transcript_path(video_id)
    if out_path.exists() and not force:
        return FetchResult(video_id, title, "skipped", "exists")

    try:
        primary = _fetch_via_api(video_id)
    except Exception as exc:  # noqa: BLE001
        # Network or unexpected library failure — let the fallback try.
        primary = None
        primary_err = str(exc)
    else:
        primary_err = ""

    if primary is not None:
        segments, lang = primary
        try:
            _write_transcript_json(video_id, segments, lang, "youtube-transcript-api")
        except OSError as exc:
            return FetchResult(video_id, title, "error", f"write failed: {exc}")
        return FetchResult(video_id, title, "ok")

    try:
        fallback = _fetch_via_ytdlp(video_id)
    except Exception as exc:  # noqa: BLE001
        msg = f"yt-dlp failed: {exc}"
        if primary_err:
            msg = f"{msg}; primary: {primary_err}"
        return FetchResult(video_id, title, "error", msg)

    if fallback is not None:
        segments, lang = fallback
        try:
            _write_transcript_json(video_id, segments, lang, "yt-dlp-vtt")
        except OSError as exc:
            return FetchResult(video_id, title, "error", f"write failed: {exc}")
        return FetchResult(video_id, title, "ok")

    return FetchResult(video_id, title, "missing")


# ---------- DB I/O ----------

def _pending_videos(
    conn: sqlite3.Connection,
    *,
    limit: int | None,
    video_id: str | None,
    force: bool,
) -> list[tuple[str, str]]:
    if video_id is not None:
        row = conn.execute(
            "SELECT id, COALESCE(title, '') AS title FROM videos WHERE id = ?",
            (video_id,),
        ).fetchone()
        return [(row["id"], row["title"])] if row else []

    if force:
        sql = "SELECT id, COALESCE(title, '') AS title FROM videos ORDER BY added_at ASC"
    else:
        sql = (
            "SELECT id, COALESCE(title, '') AS title FROM videos "
            "WHERE transcript_status = 'pending' ORDER BY added_at ASC"
        )
    params: tuple[Any, ...] = ()
    if limit is not None:
        sql += " LIMIT ?"
        params = (limit,)
    return [(r["id"], r["title"]) for r in conn.execute(sql, params).fetchall()]


def _update_status(conn: sqlite3.Connection, video_id: str, status: str) -> None:
    with transaction(conn):
        conn.execute(
            "UPDATE videos SET transcript_status = ? WHERE id = ?",
            (status, video_id),
        )


# ---------- CLI ----------

def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch transcripts for pending videos.")
    p.add_argument("--limit", type=int, default=None, help="Max videos to process.")
    p.add_argument("--video-id", type=str, default=None, help="Process only this video.")
    p.add_argument("--parallel", type=int, default=4, help="Concurrent workers (IO-bound).")
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch even if transcript_status='ok' or JSON exists.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    ensure_data_dirs()
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    conn = connect()
    videos = _pending_videos(
        conn, limit=args.limit, video_id=args.video_id, force=args.force
    )

    if not videos:
        print("No videos to process.", file=sys.stderr)
        conn.close()
        return 0

    counts = {"ok": 0, "missing": 0, "error": 0, "skipped": 0}
    parallel = max(1, args.parallel)

    try:
        with ThreadPoolExecutor(max_workers=parallel) as pool:
            futures = {
                pool.submit(process_video, vid, title, force=args.force): (vid, title)
                for vid, title in videos
            }
            for fut in as_completed(futures):
                vid, title = futures[fut]
                try:
                    result = fut.result()
                except Exception as exc:  # noqa: BLE001
                    result = FetchResult(vid, title, "error", f"worker crash: {exc}")

                counts[result.status] = counts.get(result.status, 0) + 1

                # Only persist real outcomes; "skipped" leaves status untouched.
                if result.status in {"ok", "missing", "error"}:
                    try:
                        _update_status(conn, result.video_id, result.status)
                    except sqlite3.Error as exc:
                        print(
                            f"[db-error] {result.video_id} failed to update status: {exc}",
                            file=sys.stderr,
                        )

                if result.status == "error" and result.message:
                    print(
                        f"[error] {result.video_id} {result.title}: {result.message}",
                        file=sys.stderr,
                    )
                print(f"[{result.status}] {result.video_id} {result.title}")
    finally:
        conn.close()

    print(
        f"summary: ok={counts['ok']} missing={counts['missing']} "
        f"error={counts['error']} skipped={counts['skipped']} "
        f"total={sum(counts.values())}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
