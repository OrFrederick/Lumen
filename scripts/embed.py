"""Local embeddings for Lumen.

Embeds `stories.body` (prefixed by title) and `entities.description` using
sentence-transformers `all-MiniLM-L6-v2` (CPU-only, 384 dims) and writes the
vectors into the `story_vecs` / `entity_vecs` sqlite-vec virtual tables.

Idempotent: rows already embedded are skipped unless `--force`. After
embedding stories, `videos.embed_status` is flipped to `'ok'` for any video
whose stories are now all embedded (videos with zero stories stay `pending`).

Usage:
    uv run python scripts/embed.py --target all
    uv run python scripts/embed.py --target stories --limit 100
    uv run python scripts/embed.py --target entities --batch 64 --force
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from typing import TYPE_CHECKING

import numpy as np

from scripts.lib.db import connect, transaction

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

MODEL_NAME: str = "all-MiniLM-L6-v2"
EMBED_DIM: int = 384
DEFAULT_BATCH: int = 32

_MODEL: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """Load (once) and return the cached sentence-transformers model."""
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer

        t0 = time.perf_counter()
        _MODEL = SentenceTransformer(MODEL_NAME, device="cpu")
        elapsed = time.perf_counter() - t0
        print(f"[embed] loaded {MODEL_NAME} on CPU in {elapsed:.2f}s", flush=True)
    return _MODEL


def encode_batch(texts: list[str]) -> list[bytes]:
    """Embed `texts` and return one float32 byte blob per row."""
    model = get_model()
    raw = model.encode(
        texts,
        batch_size=len(texts),
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    arr = np.asarray(raw, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != EMBED_DIM:
        raise RuntimeError(
            f"unexpected embedding shape {arr.shape}; expected (*, {EMBED_DIM})"
        )
    return [row.tobytes() for row in arr]


def _story_text(title: str | None, body: str | None) -> str:
    parts = [p for p in (title, body) if p]
    return " ".join(parts).strip()


def _entity_text(description: str | None) -> str:
    return (description or "").strip()


def fetch_pending_stories(
    conn: sqlite3.Connection, *, limit: int | None, force: bool
) -> list[sqlite3.Row]:
    sql = "SELECT id, title, body FROM stories WHERE body IS NOT NULL AND body != ''"
    if not force:
        sql += " AND embedding_id IS NULL"
    sql += " ORDER BY id"
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    return list(conn.execute(sql).fetchall())


def fetch_pending_entities(
    conn: sqlite3.Connection, *, limit: int | None, force: bool
) -> list[sqlite3.Row]:
    if force:
        sql = (
            "SELECT id, description FROM entities "
            "WHERE description IS NOT NULL AND description != '' "
            "ORDER BY id"
        )
    else:
        sql = (
            "SELECT e.id, e.description FROM entities e "
            "WHERE e.description IS NOT NULL AND e.description != '' "
            "AND NOT EXISTS (SELECT 1 FROM entity_vecs v WHERE v.rowid = e.id) "
            "ORDER BY e.id"
        )
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    return list(conn.execute(sql).fetchall())


def _chunks(seq: list[sqlite3.Row], n: int) -> list[list[sqlite3.Row]]:
    return [seq[i : i + n] for i in range(0, len(seq), n)]


def embed_stories(
    conn: sqlite3.Connection,
    *,
    batch_size: int,
    limit: int | None,
    force: bool,
) -> int:
    rows = fetch_pending_stories(conn, limit=limit, force=force)
    if not rows:
        print("[embed] stories: nothing to do", flush=True)
        return 0

    print(f"[embed] stories: {len(rows)} rows pending", flush=True)
    total = 0
    for batch in _chunks(rows, batch_size):
        ids = [int(r["id"]) for r in batch]
        texts = [_story_text(r["title"], r["body"]) for r in batch]

        t0 = time.perf_counter()
        blobs = encode_batch(texts)
        encode_dt = time.perf_counter() - t0

        with transaction(conn):
            if force:
                conn.executemany(
                    "DELETE FROM story_vecs WHERE rowid = ?", [(i,) for i in ids]
                )
            conn.executemany(
                "INSERT INTO story_vecs(rowid, embedding) VALUES (?, ?)",
                list(zip(ids, blobs, strict=True)),
            )
            conn.executemany(
                "UPDATE stories SET embedding_id = id WHERE id = ?",
                [(i,) for i in ids],
            )
        total += len(batch)
        rate = len(batch) / encode_dt if encode_dt > 0 else float("inf")
        print(
            f"[embed] stories +{len(batch)} (total {total}/{len(rows)}) "
            f"encode={encode_dt:.2f}s rate={rate:.1f}/s",
            flush=True,
        )
    return total


def embed_entities(
    conn: sqlite3.Connection,
    *,
    batch_size: int,
    limit: int | None,
    force: bool,
) -> int:
    rows = fetch_pending_entities(conn, limit=limit, force=force)
    if not rows:
        print("[embed] entities: nothing to do", flush=True)
        return 0

    print(f"[embed] entities: {len(rows)} rows pending", flush=True)
    total = 0
    for batch in _chunks(rows, batch_size):
        ids = [int(r["id"]) for r in batch]
        texts = [_entity_text(r["description"]) for r in batch]

        t0 = time.perf_counter()
        blobs = encode_batch(texts)
        encode_dt = time.perf_counter() - t0

        with transaction(conn):
            if force:
                conn.executemany(
                    "DELETE FROM entity_vecs WHERE rowid = ?", [(i,) for i in ids]
                )
            conn.executemany(
                "INSERT INTO entity_vecs(rowid, embedding) VALUES (?, ?)",
                list(zip(ids, blobs, strict=True)),
            )
        total += len(batch)
        rate = len(batch) / encode_dt if encode_dt > 0 else float("inf")
        print(
            f"[embed] entities +{len(batch)} (total {total}/{len(rows)}) "
            f"encode={encode_dt:.2f}s rate={rate:.1f}/s",
            flush=True,
        )
    return total


def update_video_embed_status(conn: sqlite3.Connection) -> int:
    """Flip `videos.embed_status='ok'` where every story has an embedding.

    A video with zero stories stays at its current status (skipped here).
    """
    sql = """
    UPDATE videos
       SET embed_status = 'ok'
     WHERE embed_status != 'ok'
       AND EXISTS (SELECT 1 FROM stories s WHERE s.video_id = videos.id)
       AND NOT EXISTS (
             SELECT 1 FROM stories s
              WHERE s.video_id = videos.id
                AND s.embedding_id IS NULL
           )
    """
    with transaction(conn):
        cur = conn.execute(sql)
        changed = cur.rowcount
    flipped = int(changed) if changed is not None and changed >= 0 else 0
    print(f"[embed] videos.embed_status -> 'ok': {flipped}", flush=True)
    return flipped


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Compute local MiniLM embeddings into sqlite-vec.",
    )
    p.add_argument(
        "--target",
        choices=("stories", "entities", "all"),
        default="stories",
        help="What to embed (default: stories).",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap the number of rows to embed (per target).",
    )
    p.add_argument(
        "--batch",
        type=int,
        default=DEFAULT_BATCH,
        help=f"Batch size for encoding (default: {DEFAULT_BATCH}).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-embed rows that already have vectors.",
    )
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.batch < 1:
        print("--batch must be >= 1", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    conn = connect()
    try:
        if args.target in ("stories", "all"):
            n = embed_stories(
                conn, batch_size=args.batch, limit=args.limit, force=args.force
            )
            if n > 0:
                update_video_embed_status(conn)
        if args.target in ("entities", "all"):
            embed_entities(
                conn, batch_size=args.batch, limit=args.limit, force=args.force
            )
    finally:
        conn.close()

    print(f"[embed] done in {time.perf_counter() - t0:.2f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
