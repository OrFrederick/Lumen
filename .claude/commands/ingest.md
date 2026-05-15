---
description: Ingest YouTube videos into the Lumen library (channels via @handle, individual videos via URL/ID).
argument-hint: <@handle | url | video_id> [...] [--limit N] [--file path]
---

# /ingest

Bulk-ingest videos into `data/library.db`. Each argument is routed by shape:

- Starts with `@` → treated as a **channel handle**, dispatched to
  `scripts/ingest_channel.py`. Optional `--limit N` applies per channel.
- Anything else (full URL, watch URL, bare video ID) → dispatched to
  `scripts/ingest_url.py`.
- `--file path` is forwarded to `ingest_url.py` (newline-separated URLs/IDs,
  `#` comments allowed).

Ingest only writes metadata yt-dlp returns in flat mode for channels; full
metadata is resolved per-video for ad-hoc URLs. Transcripts/extraction are
later stages (`/transcripts`, `/process`).

## How to run

When the user invokes `/ingest $ARGUMENTS`:

1. Split `$ARGUMENTS` into tokens. Treat tokens that start with `--` as flags;
   collect their values.
2. Partition the remaining positional tokens into:
   - `channels`: tokens starting with `@`.
   - `urls`: everything else (full URLs, `youtu.be/...`, bare 11-char IDs).
3. If `channels` is non-empty, run:
   ```bash
   uv run python scripts/ingest_channel.py <channels...> [--limit N]
   ```
4. If `urls` is non-empty OR `--file` was passed, run:
   ```bash
   uv run python scripts/ingest_url.py <urls...> [--file path]
   ```
5. Run the two commands in parallel when both apply (independent DB writes
   are guarded by SQLite WAL + per-call transactions).

## Examples

```bash
# Pull the 25 newest Veritasium videos
/ingest @veritasium --limit 25

# Add a single video by URL
/ingest https://www.youtube.com/watch?v=abc123XYZ_0

# Add by bare ID
/ingest abc123XYZ_0

# Channel + ad-hoc URL together
/ingest @sabinehossenfelder https://youtu.be/dQw4w9WgXcQ

# Bulk import from a file
/ingest --file ~/lumen-seed-urls.txt
```

## Notes

- Idempotent: re-running on the same handle/URL refreshes metadata but never
  resets `transcript_status` / `extract_status` / `enrich_status` /
  `embed_status`.
- yt-dlp errors on a single ad-hoc URL print as `! <target> error: ...` and
  do not abort the batch.
- After ingest, suggest the next stage: `/transcripts <N>`.
