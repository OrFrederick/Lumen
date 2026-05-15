"""Lightweight on-disk JSON cache for outbound HTTP GET requests.

Each (api, key) is stored as ``data/cache/{api}/{key}.json`` so retries and
re-runs of the enrichment scripts do not hit external APIs again. Keys are
sanitized to safe filenames.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any

import requests

from scripts.lib.paths import DATA_DIR

CACHE_ROOT = DATA_DIR / "cache"

_USER_AGENT = "Lumen/0.1 (https://github.com/OrFrederick/Lumen)"
_SAFE_KEY = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(key: str) -> str:
    """Turn arbitrary keys into a filesystem-safe filename (hashed if long)."""
    cleaned = _SAFE_KEY.sub("_", key).strip("_")
    if len(cleaned) > 120 or not cleaned:
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
        cleaned = (cleaned[:80] + "_" + digest) if cleaned else digest
    return cleaned


def cache_path(api: str, key: str) -> Path:
    """Return the on-disk path for a given (api, key) tuple."""
    folder = CACHE_ROOT / api
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{_safe_filename(key)}.json"


def cached_get(
    url: str,
    *,
    api: str,
    key: str,
    session: requests.Session | None = None,
    params: dict[str, Any] | None = None,
    throttle_ms: int = 0,
    timeout: float = 30.0,
) -> dict[str, Any] | None:
    """GET ``url`` with on-disk JSON caching.

    Returns the decoded JSON dict, or ``None`` on 404 / non-JSON / transport
    error. Idempotent and side-effect-free beyond writing the cache file.
    """
    path = cache_path(api, key)
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except (OSError, json.JSONDecodeError):
            # Corrupt cache file — fall through and re-fetch.
            pass

    sess = session or requests.Session()
    sess.headers.setdefault("User-Agent", _USER_AGENT)
    if throttle_ms > 0:
        time.sleep(throttle_ms / 1000.0)

    try:
        resp = sess.get(url, params=params, timeout=timeout)
    except requests.RequestException:
        return None

    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None

    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f)
    except OSError:
        pass

    return data
