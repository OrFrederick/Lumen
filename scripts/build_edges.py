"""Synthesize entity-graph edges from multiple signals.

Sources implemented here:
  - cooccurrence:  two entities mentioned in the same story  -> kind='appears_with'
  - embedding:     top-K nearest neighbors per entity vector -> kind='similar_to'

Wikidata-sourced edges are populated by `enrich_wikidata.py` and are left
untouched (we never DELETE; we use INSERT OR REPLACE keyed on
`(src, dst, kind)` so re-running this script only refreshes our own kinds).

LLM-proposed connections (`connections_suggested` in extraction output) are
wired through `extract_write.py` (separate PR) — TODO marker below.

Edge conventions
----------------
* `appears_with` is undirected. We store it as a *canonical pair*: a single
  row per pair with `src < dst`. Frontend treats this row as bidirectional.
  Weight = log1p(co_mention_count); co_mention_count is the number of
  distinct stories in which both entities are mentioned.
* `similar_to` is directional (top-K from src). Weight = cosine similarity
  in [0, 1]. We use sqlite-vec's L2 distance on L2-normalized vectors and
  convert: cos = 1 - (L2^2 / 2).
* Idempotent: INSERT OR REPLACE on PK (src, dst, kind).

CLI
---
    uv run python scripts/build_edges.py --source all
    uv run python scripts/build_edges.py --source embedding --top-k 10 --threshold 0.75
    uv run python scripts/build_edges.py --dry-run
"""

from __future__ import annotations

import argparse
import math
import sqlite3
import struct
import sys
import time
from collections import defaultdict
from collections.abc import Iterable

from scripts.lib.db import connect, transaction

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

COOCCURRENCE_SOURCE = "cooccurrence"
COOCCURRENCE_KIND = "appears_with"

EMBEDDING_SOURCE = "embedding"
EMBEDDING_KIND = "similar_to"

DEFAULT_TOP_K = 10
DEFAULT_THRESHOLD = 0.75  # cosine similarity floor
PROGRESS_EVERY = 250


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _vec_blob(values: Iterable[float]) -> bytes:
    """Pack a float32 vector for sqlite-vec MATCH params."""
    floats = list(values)
    return struct.pack(f"{len(floats)}f", *floats)


def _l2_to_cosine(distance: float) -> float:
    """sqlite-vec returns L2 distance on normalized vectors.

    For unit vectors: ||a - b||^2 = 2 - 2*cos(a, b)
    => cos = 1 - d^2 / 2.

    Embeddings produced by sentence-transformers all-MiniLM-L6-v2 are
    L2-normalized by `embed.py` (separate PR); if they are not, similarity
    values will still be monotonic in distance but no longer in [-1, 1].
    """
    return 1.0 - (distance * distance) / 2.0


# --------------------------------------------------------------------------- #
# Co-occurrence
# --------------------------------------------------------------------------- #


def build_cooccurrence_edges(conn: sqlite3.Connection, *, dry_run: bool) -> int:
    """Insert one canonical (src<dst) row per entity pair sharing >=1 story.

    Returns the number of pair edges written (0 in dry-run mode).
    """
    rows = conn.execute(
        "SELECT story_id, entity_id FROM entity_mentions ORDER BY story_id"
    ).fetchall()

    by_story: dict[int, list[int]] = defaultdict(list)
    for r in rows:
        by_story[r["story_id"]].append(r["entity_id"])

    counts: dict[tuple[int, int], int] = defaultdict(int)
    for entity_ids in by_story.values():
        unique = sorted(set(entity_ids))
        n = len(unique)
        if n < 2:
            continue
        for i in range(n):
            a = unique[i]
            for j in range(i + 1, n):
                b = unique[j]
                # a < b guaranteed because `unique` is sorted; skip self-loops
                # (impossible here because set + sorted, but defensive).
                if a == b:
                    continue
                counts[(a, b)] += 1

    if dry_run:
        print(
            f"[cooccurrence] would write {len(counts)} pair edges "
            f"across {len(by_story)} stories"
        )
        return 0

    payload = [
        (a, b, COOCCURRENCE_KIND, math.log1p(c), COOCCURRENCE_SOURCE)
        for (a, b), c in counts.items()
    ]

    with transaction(conn):
        conn.executemany(
            "INSERT OR REPLACE INTO edges(src, dst, kind, weight, source) "
            "VALUES (?, ?, ?, ?, ?)",
            payload,
        )

    print(f"[cooccurrence] wrote {len(payload)} canonical pair edges")
    return len(payload)


# --------------------------------------------------------------------------- #
# Embedding similarity
# --------------------------------------------------------------------------- #


def build_embedding_edges(
    conn: sqlite3.Connection,
    *,
    top_k: int,
    threshold: float,
    dry_run: bool,
) -> int:
    """For each entity vector, write top-K nearest neighbors above threshold."""
    # entity_vecs.rowid corresponds to entities.id by construction in embed.py.
    vec_rows = conn.execute(
        "SELECT rowid, embedding FROM entity_vecs ORDER BY rowid"
    ).fetchall()

    if not vec_rows:
        print("[embedding] entity_vecs is empty; skipping")
        return 0

    # k+1 because the nearest match is the vector itself.
    k_query = top_k + 1
    written = 0
    would_write = 0
    t0 = time.monotonic()

    cur = conn.cursor()
    pending: list[tuple[int, int, str, float, str]] = []

    for idx, row in enumerate(vec_rows, start=1):
        src_id: int = row["rowid"]
        blob: bytes = row["embedding"]

        neighbors = cur.execute(
            "SELECT rowid, distance FROM entity_vecs "
            "WHERE embedding MATCH ? AND k = ? "
            "ORDER BY distance",
            (blob, k_query),
        ).fetchall()

        for n in neighbors:
            dst_id: int = n["rowid"]
            if dst_id == src_id:
                continue
            cos = _l2_to_cosine(float(n["distance"]))
            if cos < threshold:
                continue
            if dry_run:
                would_write += 1
            else:
                pending.append((src_id, dst_id, EMBEDDING_KIND, cos, EMBEDDING_SOURCE))

        if idx % PROGRESS_EVERY == 0:
            elapsed = time.monotonic() - t0
            print(f"[embedding] {idx}/{len(vec_rows)} entities processed ({elapsed:.1f}s)")

    if dry_run:
        print(
            f"[embedding] would write {would_write} similar_to edges "
            f"(top_k={top_k}, threshold={threshold})"
        )
        return 0

    with transaction(conn):
        conn.executemany(
            "INSERT OR REPLACE INTO edges(src, dst, kind, weight, source) "
            "VALUES (?, ?, ?, ?, ?)",
            pending,
        )
    written = len(pending)
    print(
        f"[embedding] wrote {written} similar_to edges "
        f"(top_k={top_k}, threshold={threshold})"
    )
    return written


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

# TODO: LLM-suggested edges from `connections_suggested` are inserted by
# extract_write.py during ingestion (separate PR). Don't duplicate here.


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build entity-graph edges.")
    p.add_argument(
        "--source",
        choices=("all", "cooccurrence", "embedding"),
        default="all",
        help="Which edge source to compute (default: all).",
    )
    p.add_argument(
        "--top-k",
        type=int,
        default=DEFAULT_TOP_K,
        help=f"Top-K neighbors per entity for similarity edges (default: {DEFAULT_TOP_K}).",
    )
    p.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Cosine-similarity floor for similar_to edges (default: {DEFAULT_THRESHOLD}).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute counts only; write nothing.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    # Silence the unused-blob helper warning: keep _vec_blob available for
    # callers that want to query against an ad-hoc vector (e.g., search).
    _ = _vec_blob

    conn = connect()
    try:
        if args.source in ("all", "cooccurrence"):
            build_cooccurrence_edges(conn, dry_run=args.dry_run)
        if args.source in ("all", "embedding"):
            build_embedding_edges(
                conn,
                top_k=args.top_k,
                threshold=args.threshold,
                dry_run=args.dry_run,
            )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
