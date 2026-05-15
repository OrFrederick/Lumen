"""Thin wrapper around the yt-dlp Python API.

Exposes two helpers used by the ingest scripts:

* :func:`flat_channel` — enumerate videos on a channel via
  ``--flat-playlist`` (cheap, one HTTP call per page).
* :func:`video_info` — resolve a single video URL or ID to a dict with the
  metadata fields the ``videos`` table cares about.

Both functions return dicts already normalized to ``videos``-table keys.
yt-dlp's stdout/stderr chatter is suppressed.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from typing import Any

import yt_dlp  # type: ignore[import-untyped]

# Fields we care about on the videos table.
_VIDEO_KEYS: tuple[str, ...] = (
    "id",
    "title",
    "channel",
    "channel_handle",
    "published_at",
    "duration_sec",
    "url",
    "thumbnail_url",
    "description",
)


def _silent_opts(**extra: Any) -> dict[str, Any]:
    """Default yt-dlp options that silence its console output."""
    base: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "skip_download": True,
        "ignoreerrors": False,
    }
    base.update(extra)
    return base


def _format_published(raw: Any) -> str | None:
    """Convert yt-dlp's ``YYYYMMDD`` upload_date / timestamp → ISO date string."""
    if raw is None:
        return None
    if isinstance(raw, int):
        try:
            return date.fromtimestamp(raw).isoformat()
        except (OSError, ValueError, OverflowError):
            return None
    if isinstance(raw, str) and len(raw) == 8 and raw.isdigit():
        try:
            return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
        except ValueError:
            return None
    return None


def _best_thumbnail(entry: dict[str, Any]) -> str | None:
    """Pick a thumbnail URL from a yt-dlp info dict."""
    thumb = entry.get("thumbnail")
    if isinstance(thumb, str) and thumb:
        return thumb
    thumbs = entry.get("thumbnails")
    if isinstance(thumbs, list) and thumbs:
        last = thumbs[-1]
        if isinstance(last, dict):
            url = last.get("url")
            if isinstance(url, str) and url:
                return url
    return None


def _normalize_handle(channel_url: Any, uploader_id: Any) -> str | None:
    """Best-effort extraction of an ``@handle`` from a channel url / uploader id."""
    if isinstance(uploader_id, str) and uploader_id.startswith("@"):
        return uploader_id
    if isinstance(channel_url, str) and "/@" in channel_url:
        tail = channel_url.rsplit("/@", 1)[1]
        handle = tail.split("/", 1)[0].split("?", 1)[0]
        if handle:
            return f"@{handle}"
    return None


def _normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    """Normalize a yt-dlp info dict to the keys the ``videos`` table expects."""
    vid = entry.get("id")
    url = entry.get("webpage_url") or entry.get("url")
    if isinstance(vid, str) and (not isinstance(url, str) or not url.startswith("http")):
        url = f"https://www.youtube.com/watch?v={vid}"

    duration = entry.get("duration")
    duration_sec: int | None = None
    if isinstance(duration, (int, float)):
        duration_sec = int(duration)

    published = _format_published(entry.get("upload_date") or entry.get("timestamp"))

    handle = _normalize_handle(entry.get("channel_url"), entry.get("uploader_id"))

    return {
        "id": vid,
        "title": entry.get("title"),
        "channel": entry.get("channel") or entry.get("uploader"),
        "channel_handle": handle,
        "published_at": published,
        "duration_sec": duration_sec,
        "url": url,
        "thumbnail_url": _best_thumbnail(entry),
        "description": entry.get("description"),
    }


def _channel_url(handle: str) -> str:
    """Resolve a handle/URL/channel ID to a full YouTube channel URL."""
    h = handle.strip()
    if h.startswith("http://") or h.startswith("https://"):
        return h
    if h.startswith("@"):
        return f"https://www.youtube.com/{h}/videos"
    return f"https://www.youtube.com/@{h}/videos"


def flat_channel(handle: str, limit: int | None) -> Iterator[dict[str, Any]]:
    """Yield flat (id-only) entries for a channel's uploads.

    Uses ``extract_flat='in_playlist'`` so we get an entry per video without
    descending into each one — fast, one round-trip per page.
    """
    opts = _silent_opts(extract_flat="in_playlist")
    if limit is not None and limit > 0:
        opts["playlistend"] = limit

    url = _channel_url(handle)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if not isinstance(info, dict):
        return

    channel_name = info.get("channel") or info.get("uploader") or info.get("title")
    channel_handle = _normalize_handle(info.get("channel_url") or info.get("webpage_url"), handle)

    entries = info.get("entries") or []
    count = 0
    for raw in entries:
        if not isinstance(raw, dict):
            continue
        entry = dict(raw)
        entry.setdefault("channel", channel_name)
        if channel_handle and not entry.get("uploader_id"):
            entry["uploader_id"] = channel_handle
        normalized = _normalize_entry(entry)
        if not normalized["id"]:
            continue
        # In flat mode, some fields (channel/handle) often aren't on each entry —
        # fall back to the parent playlist info we already captured.
        if not normalized["channel"]:
            normalized["channel"] = channel_name
        if not normalized["channel_handle"]:
            normalized["channel_handle"] = channel_handle
        yield normalized
        count += 1
        if limit is not None and count >= limit:
            break


def video_info(url_or_id: str) -> dict[str, Any]:
    """Resolve a single video URL or ID and return a normalized dict."""
    target = url_or_id.strip()
    if not target.startswith("http"):
        target = f"https://www.youtube.com/watch?v={target}"

    opts = _silent_opts()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(target, download=False)

    if not isinstance(info, dict):
        raise RuntimeError(f"yt-dlp returned no info for {url_or_id!r}")
    return _normalize_entry(info)


__all__ = ["flat_channel", "video_info"]
