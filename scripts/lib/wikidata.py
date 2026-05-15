"""Shared Wikidata client for Lumen enrichment.

Functions here are deliberately small + deterministic. All external calls go
through :mod:`scripts.lib.http_cache` so retries are free.

Reference docs:
- wbsearchentities: https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities
- EntityData JSON: https://www.wikidata.org/wiki/Special:EntityData/Q937.json
"""

from __future__ import annotations

import re
from typing import Any

import requests

from scripts.lib.http_cache import cached_get

USER_AGENT = "Lumen/0.1 (https://github.com/OrFrederick/Lumen)"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
THROTTLE_MS = 200

# Re-ranking hints: rough kind -> keyword bag for description heuristic.
_KIND_KEYWORDS: dict[str, tuple[str, ...]] = {
    "person": (
        "person",
        "scientist",
        "physicist",
        "mathematician",
        "biologist",
        "chemist",
        "engineer",
        "astronomer",
        "philosopher",
        "author",
        "writer",
        "researcher",
        "inventor",
        "professor",
    ),
    "concept": (
        "concept",
        "theory",
        "principle",
        "law",
        "field",
        "branch",
        "phenomenon",
        "effect",
        "model",
    ),
    "paper": ("paper", "article", "publication", "study", "preprint"),
    "experiment": ("experiment", "test", "measurement"),
    "event": ("event", "war", "discovery", "expedition"),
    "place": ("city", "country", "region", "place", "town", "village"),
    "work": ("book", "film", "work", "novel", "essay"),
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


# --- search ----------------------------------------------------------------


def search_entities(name: str, kind: str | None = None) -> list[dict[str, Any]]:
    """Search Wikidata for entities matching ``name``.

    Returns top candidates as ``[{"id": "Q...", "label": ..., "description": ...}]``.
    The ``kind`` hint re-ranks results whose description contains kind keywords;
    it is a soft signal, not a filter.
    """
    name = (name or "").strip()
    if not name:
        return []

    key = f"{name}__{kind or ''}"
    data = cached_get(
        WIKIDATA_API,
        api="wikidata_search",
        key=key,
        session=_session(),
        params={
            "action": "wbsearchentities",
            "search": name,
            "language": "en",
            "format": "json",
            "type": "item",
            "limit": 10,
        },
        throttle_ms=THROTTLE_MS,
    )
    if not data:
        return []

    raw = data.get("search") or []
    results: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        results.append(
            {
                "id": item.get("id"),
                "label": item.get("label") or "",
                "description": item.get("description") or "",
            }
        )

    if kind:
        keywords = _KIND_KEYWORDS.get(kind, ())
        if keywords:

            def score(r: dict[str, Any]) -> int:
                desc = (r.get("description") or "").lower()
                return -sum(1 for kw in keywords if kw in desc)

            results.sort(key=score)
    return results


# --- entity fetch + claim parsing -----------------------------------------


def get_entity(qid: str) -> dict[str, Any]:
    """Fetch full entity JSON and flatten interesting claims into a dict.

    Returns ``{}`` on miss. Resulting dict shape::

        {
          "qid": "Q937",
          "labels": {"en": "Albert Einstein", ...},
          "aliases": {"en": [...], "de": [...], ...},
          "sitelinks": {"enwiki": "Albert Einstein", ...},
          "instance_of": ["Q5"],
          "birth_year": 1879,
          "death_year": 1955,
          "occupations": ["Q169470", ...],
          "image": "https://commons.wikimedia.org/...",
          "influenced_by": ["Q9047", ...],
          "students_of":  ["Q12345", ...],
          "authors":      ["Q...", ...],
          "given_names":  ["Q...", ...],
          "family_names": ["Q...", ...],
        }
    """
    qid = (qid or "").strip()
    if not qid:
        return {}

    data = cached_get(
        WIKIDATA_ENTITY.format(qid=qid),
        api="wikidata_entity",
        key=qid,
        session=_session(),
        throttle_ms=THROTTLE_MS,
    )
    if not data:
        return {}
    entities = data.get("entities") or {}
    raw = entities.get(qid)
    if not isinstance(raw, dict):
        return {}

    out: dict[str, Any] = {"qid": qid}

    labels = raw.get("labels") or {}
    out["labels"] = {
        lang: v.get("value")
        for lang, v in labels.items()
        if isinstance(v, dict) and v.get("value")
    }

    aliases_raw = raw.get("aliases") or {}
    aliases_by_lang: dict[str, list[str]] = {}
    for lang, arr in aliases_raw.items():
        if not isinstance(arr, list):
            continue
        bucket: list[str] = [
            a["value"]
            for a in arr
            if isinstance(a, dict) and isinstance(a.get("value"), str) and a["value"]
        ]
        if bucket:
            aliases_by_lang[lang] = bucket
    out["aliases"] = aliases_by_lang

    sitelinks_raw = raw.get("sitelinks") or {}
    out["sitelinks"] = {
        site: v.get("title")
        for site, v in sitelinks_raw.items()
        if isinstance(v, dict) and v.get("title")
    }

    claims = raw.get("claims") or {}

    out["instance_of"] = _ids_for(claims, "P31")
    out["occupations"] = _ids_for(claims, "P106")
    out["influenced_by"] = _ids_for(claims, "P737")
    out["students_of"] = _ids_for(claims, "P802")  # student (subject is teacher)
    out["doctoral_advisor"] = _ids_for(claims, "P184")
    out["authors"] = _ids_for(claims, "P50")
    out["given_names"] = _ids_for(claims, "P735")
    out["family_names"] = _ids_for(claims, "P734")

    out["birth_year"] = _year_for(claims, "P569")
    out["death_year"] = _year_for(claims, "P570")
    out["image"] = _commons_image(claims, "P18")
    return out


def aliases_for(qid_data: dict[str, Any]) -> list[str]:
    """Collect every label + alias across all languages."""
    seen: set[str] = set()
    out: list[str] = []
    labels = qid_data.get("labels") or {}
    if isinstance(labels, dict):
        for v in labels.values():
            if isinstance(v, str) and v and v not in seen:
                seen.add(v)
                out.append(v)
    aliases = qid_data.get("aliases") or {}
    if isinstance(aliases, dict):
        for arr in aliases.values():
            if isinstance(arr, list):
                for v in arr:
                    if isinstance(v, str) and v and v not in seen:
                        seen.add(v)
                        out.append(v)
    return out


def wikipedia_url_for(qid_data: dict[str, Any]) -> str | None:
    """Derive English Wikipedia URL from sitelinks, if present."""
    sitelinks = qid_data.get("sitelinks") or {}
    title = sitelinks.get("enwiki") if isinstance(sitelinks, dict) else None
    if not title:
        return None
    return f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"


def english_title(qid_data: dict[str, Any]) -> str | None:
    """Return the English Wikipedia article title (for REST summary lookup)."""
    sitelinks = qid_data.get("sitelinks") or {}
    title = sitelinks.get("enwiki") if isinstance(sitelinks, dict) else None
    return title if isinstance(title, str) and title else None


# --- claim helpers ---------------------------------------------------------


_YEAR_RE = re.compile(r"([+-]?\d{1,5})-\d{2}-\d{2}")


def _claim_list(claims: dict[str, Any], pid: str) -> list[dict[str, Any]]:
    arr = claims.get(pid)
    return arr if isinstance(arr, list) else []


def _ids_for(claims: dict[str, Any], pid: str) -> list[str]:
    out: list[str] = []
    for c in _claim_list(claims, pid):
        mainsnak = c.get("mainsnak") if isinstance(c, dict) else None
        if not isinstance(mainsnak, dict):
            continue
        if mainsnak.get("snaktype") != "value":
            continue
        dv = mainsnak.get("datavalue") or {}
        value = dv.get("value") if isinstance(dv, dict) else None
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            out.append(value["id"])
    return out


def _year_for(claims: dict[str, Any], pid: str) -> int | None:
    for c in _claim_list(claims, pid):
        mainsnak = c.get("mainsnak") if isinstance(c, dict) else None
        if not isinstance(mainsnak, dict):
            continue
        dv = mainsnak.get("datavalue") or {}
        if not isinstance(dv, dict):
            continue
        value = dv.get("value") or {}
        if not isinstance(value, dict):
            continue
        time_str = value.get("time")
        if not isinstance(time_str, str):
            continue
        m = _YEAR_RE.match(time_str.lstrip("+"))
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                continue
            finally:
                pass
        # fallback: try to read leading signed int
        try:
            head = time_str.split("-", 1)[0] if not time_str.startswith("-") else time_str[:5]
            return int(head)
        except ValueError:
            continue
    return None


def _commons_image(claims: dict[str, Any], pid: str) -> str | None:
    for c in _claim_list(claims, pid):
        mainsnak = c.get("mainsnak") if isinstance(c, dict) else None
        if not isinstance(mainsnak, dict):
            continue
        dv = mainsnak.get("datavalue") or {}
        if not isinstance(dv, dict):
            continue
        value = dv.get("value")
        if isinstance(value, str) and value:
            name = value.replace(" ", "_")
            return f"https://commons.wikimedia.org/wiki/Special:FilePath/{name}"
    return None
