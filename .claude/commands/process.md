---
description: Run the parallel extraction pipeline — dispatch transcript-extractor subagents on pending videos and write results to SQLite.
---

# /process — parallel transcript extraction

Usage: `/process [N] [model]`

- `N` — max number of videos to extract in this batch. Default: **8**.
- `model` — optional model override. Pass `sonnet` to upgrade the subagent from its Haiku default; otherwise the subagent's declared model is used.

## Step 1 — Build the work queue

Run:

```bash
uv run python -m scripts.extract_prep --limit ${1:-8} --out /tmp/lumen_queue.json
```

Then read `/tmp/lumen_queue.json`. It contains an array of items of the form:

```json
{"video_id": "...", "transcript_path": "...", "output_path": "..."}
```

If the array is empty, print `No pending videos. Done.` and stop.

## Step 2 — Dispatch parallel extractions

In **ONE message**, emit **one `Agent` tool call per queue item**, all in parallel. For each item set:

- `subagent_type`: `transcript-extractor`
- `description`: short, e.g. `extract {video_id}`
- `prompt`: a message that gives the subagent the two paths explicitly, for example:

  ```
  transcript_path: <transcript_path>
  output_path: <output_path>

  Read prompts/extract.md and prompts/extract_examples.md for the master
  instructions and few-shot anchors. Read the transcript at transcript_path,
  produce ONE schema-valid extraction JSON, and Write it to output_path. No
  commentary.
  ```

If the user passed `sonnet` as the second argument (`${2}` = `sonnet`), include `model: sonnet` in each `Agent` call so the subagent runs on Sonnet instead of Haiku. Otherwise omit `model` and let the agent definition's `haiku` default apply.

Cap parallelism at 10 per dispatch. If the queue is larger, batch in groups of 10 across consecutive messages.

## Step 3 — Validate + write to DB

Once **all** parallel `Agent` calls have returned, run:

```bash
uv run python -m scripts.extract_write --all
```

This validates every `data/extracted/{video_id}.json` against the schema and writes valid ones to SQLite in a single transaction per video. Invalid extractions get `extract_status='error'` and are skipped.

## Step 4 — Summary

Print:

- How many videos were dispatched.
- How many wrote successfully (`ok=...`) vs failed (`fail=...`) from `extract_write.py`'s output.
- Any error lines from `extract_write.py` verbatim so the user can inspect.

Do not retry failed videos automatically. The user can re-run `/process` (errors are eligible) or inspect `data/extracted/{video_id}.json` manually.
