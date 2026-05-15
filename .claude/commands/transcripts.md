---
description: Fetch transcripts for pending videos (parallel).
argument-hint: "[N]"
---

# /transcripts

Fetch YouTube transcripts for videos with `transcript_status='pending'`.

Primary path: `youtube-transcript-api` (English → auto-generated → translated).
Fallback: `yt-dlp` `.vtt` download + inline parser.

Writes JSON to `data/transcripts/{video_id}.json` and updates
`videos.transcript_status` to `ok` / `missing` / `error`.

## Usage

```
/transcripts        # process 20 pending videos (default)
/transcripts 50     # process 50
/transcripts 1      # one-at-a-time smoke test
```

`N` defaults to **20** when omitted.

## Run

!`uv run python scripts/fetch_transcript.py --limit ${1:-20} --parallel 8`

## Notes

- Idempotent: re-running skips videos that already have a transcript JSON
  unless you pass `--force`.
- For one-off targeting: `uv run python scripts/fetch_transcript.py --video-id <id>`.
- Output: one `[ok|missing|error|skipped] {video_id} {title}` line per video,
  plus a final summary.
