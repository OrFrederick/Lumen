---
description: Reset all videos with extract_status='ok' back to 'pending' so /process re-extracts them after a prompt change.
---

# /rebuild — reset extractions for re-processing

Use this after editing `prompts/extract.md` (or `prompts/extract_examples.md`) to force a fresh extraction pass across the whole library.

## Step 1 — Confirm

Before doing anything, count how many rows would be affected and ask the user to confirm:

```bash
uv run python -c "from scripts.lib.db import connect; \
import sys; \
conn = connect(read_only=True); \
n = conn.execute(\"SELECT count(*) FROM videos WHERE extract_status='ok'\").fetchone()[0]; \
print(n)"
```

Print: `This will reset N videos from extract_status='ok' to 'pending'. Continue? (yes/no)`.

If the user does not reply `yes`, stop without changing anything.

## Step 2 — Reset

On confirmation, run:

```bash
uv run python -c "from scripts.lib.db import connect, transaction; \
conn = connect(); \
\\
with transaction(conn): \
    cur = conn.execute(\"UPDATE videos SET extract_status='pending' WHERE extract_status='ok'\"); \
    print(f'reset {cur.rowcount} videos')"
```

## Step 3 — Suggest next action

Tell the user:

> Reset complete. Run `/process N` (default 8) to extract again with the new prompt. Existing `data/extracted/*.json` files will be overwritten as the subagent writes new outputs.

## Notes

- This command does **not** delete `stories`, `entity_mentions`, `claims`, etc. directly. Those rows are cleared by `extract_write.py` per-video when the new extraction lands (it `DELETE`s prior stories for that video inside its transaction; cascades handle the rest).
- Version-aware rebuilds (only re-extracting videos whose stored `extract_prompt_version` lags `prompts/extract.md`'s `<!-- version: N -->` header) are deferred to a follow-up PR.
