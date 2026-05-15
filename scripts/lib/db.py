"""SQLite connection + schema initialization for Lumen.

Single source of truth for the database schema. `init_db()` is idempotent:
all DDL uses `IF NOT EXISTS` / `CREATE VIRTUAL TABLE IF NOT EXISTS`, so calling
it on an existing database is a no-op.

Run directly: `uv run python -m scripts.lib.db init`.
"""

from __future__ import annotations

import sqlite3
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import sqlite_vec

from scripts.lib.paths import DB_PATH, ensure_data_dirs

SCHEMA_SQL: str = """
-- Videos: top-level container, one row per YouTube video.
CREATE TABLE IF NOT EXISTS videos (
  id              TEXT PRIMARY KEY,
  title           TEXT,
  channel         TEXT,
  channel_handle  TEXT,
  published_at    TEXT,
  duration_sec    INTEGER,
  url             TEXT,
  thumbnail_url   TEXT,
  description     TEXT,
  transcript_status TEXT DEFAULT 'pending',
  extract_status    TEXT DEFAULT 'pending',
  enrich_status     TEXT DEFAULT 'pending',
  embed_status      TEXT DEFAULT 'pending',
  field           TEXT,
  added_at        TEXT DEFAULT (datetime('now')),
  source          TEXT
);
CREATE INDEX IF NOT EXISTS videos_transcript_status ON videos(transcript_status);
CREATE INDEX IF NOT EXISTS videos_extract_status   ON videos(extract_status);
CREATE INDEX IF NOT EXISTS videos_enrich_status    ON videos(enrich_status);
CREATE INDEX IF NOT EXISTS videos_embed_status     ON videos(embed_status);
CREATE INDEX IF NOT EXISTS videos_channel          ON videos(channel_handle);

-- Story-moments: the atomic citizen of Lumen.
CREATE TABLE IF NOT EXISTS stories (
  id              INTEGER PRIMARY KEY,
  video_id        TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  ts_start        INTEGER,
  ts_end          INTEGER,
  kind            TEXT,
  title           TEXT,
  body            TEXT,
  significance    TEXT,
  historical_year INTEGER,
  historical_place TEXT,
  takeaway        TEXT,
  embedding_id    INTEGER
);
CREATE INDEX IF NOT EXISTS stories_video ON stories(video_id);
CREATE INDEX IF NOT EXISTS stories_year  ON stories(historical_year);
CREATE INDEX IF NOT EXISTS stories_kind  ON stories(kind);

-- FTS5 over stories. external content table (stays in sync via triggers below).
CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts
USING fts5(title, body, takeaway, content='stories', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
  INSERT INTO stories_fts(rowid, title, body, takeaway)
  VALUES (new.id, new.title, new.body, new.takeaway);
END;
CREATE TRIGGER IF NOT EXISTS stories_ad AFTER DELETE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, body, takeaway)
  VALUES('delete', old.id, old.title, old.body, old.takeaway);
END;
CREATE TRIGGER IF NOT EXISTS stories_au AFTER UPDATE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, body, takeaway)
  VALUES('delete', old.id, old.title, old.body, old.takeaway);
  INSERT INTO stories_fts(rowid, title, body, takeaway)
  VALUES (new.id, new.title, new.body, new.takeaway);
END;

-- Entities: canonicalized people/concepts/works/papers/etc.
CREATE TABLE IF NOT EXISTS entities (
  id              INTEGER PRIMARY KEY,
  kind            TEXT NOT NULL,
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE,
  description     TEXT,
  wikipedia_url   TEXT,
  wikidata_qid    TEXT UNIQUE,
  openalex_id     TEXT,
  birth_year      INTEGER,
  death_year      INTEGER,
  era_start       INTEGER,
  era_end         INTEGER,
  occupation      TEXT,
  image_url       TEXT,
  verified        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entities_kind ON entities(kind);
CREATE INDEX IF NOT EXISTS entities_name ON entities(name);

-- Alias cache: surface form (normalized) -> entity. Avoids re-querying Wikidata.
CREATE TABLE IF NOT EXISTS entity_aliases (
  alias       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  entity_id   INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source      TEXT,
  PRIMARY KEY (alias, kind)
);
CREATE INDEX IF NOT EXISTS entity_aliases_entity ON entity_aliases(entity_id);

-- Entity mentions: per-story occurrences of an entity.
CREATE TABLE IF NOT EXISTS entity_mentions (
  story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entity_id   INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ts          INTEGER,
  context     TEXT,
  role        TEXT,
  PRIMARY KEY (story_id, entity_id)
);
CREATE INDEX IF NOT EXISTS entity_mentions_entity ON entity_mentions(entity_id);

-- Graph edges between entities.
CREATE TABLE IF NOT EXISTS edges (
  src         INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dst         INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  weight      REAL,
  source      TEXT,
  PRIMARY KEY (src, dst, kind)
);
CREATE INDEX IF NOT EXISTS edges_dst  ON edges(dst);
CREATE INDEX IF NOT EXISTS edges_kind ON edges(kind);

-- Topics and story<->topic association.
CREATE TABLE IF NOT EXISTS topics (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  slug    TEXT UNIQUE,
  field   TEXT
);

CREATE TABLE IF NOT EXISTS story_topics (
  story_id  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  topic_id  INTEGER NOT NULL REFERENCES topics(id)  ON DELETE CASCADE,
  weight    REAL,
  PRIMARY KEY (story_id, topic_id)
);

-- Claims surfaced inside stories.
CREATE TABLE IF NOT EXISTS claims (
  id                   INTEGER PRIMARY KEY,
  story_id             INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  ts                   INTEGER,
  text                 TEXT NOT NULL,
  kind                 TEXT,
  supporting_paper_id  INTEGER REFERENCES entities(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS claims_story ON claims(story_id);

-- Vector tables (sqlite-vec). 384 dims = all-MiniLM-L6-v2.
CREATE VIRTUAL TABLE IF NOT EXISTS story_vecs  USING vec0(embedding float[384]);
CREATE VIRTUAL TABLE IF NOT EXISTS entity_vecs USING vec0(embedding float[384]);
"""


def connect(db_path: Path = DB_PATH, *, read_only: bool = False) -> sqlite3.Connection:
    """Open a SQLite connection with vec extension + foreign keys enabled."""
    if read_only:
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        ensure_data_dirs()
        conn = sqlite3.connect(db_path)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Wrap a block in BEGIN/COMMIT, rollback on exception."""
    try:
        conn.execute("BEGIN")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db(db_path: Path = DB_PATH) -> None:
    """Create schema if missing. Idempotent."""
    ensure_data_dirs()
    with connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        conn.commit()


def _main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "init":
        init_db()
        print(f"Initialized {DB_PATH}")
        return 0
    print("usage: python -m scripts.lib.db init", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
