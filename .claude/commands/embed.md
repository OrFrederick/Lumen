---
description: Compute local MiniLM embeddings for stories + entities into sqlite-vec.
argument-hint: [--target stories|entities|all] [--limit N] [--batch N] [--force]
---

# /embed

Run local sentence-transformers (`all-MiniLM-L6-v2`, CPU, 384-dim) over
`stories.body` and `entities.description`, writing vectors into the
`story_vecs` and `entity_vecs` sqlite-vec virtual tables. Powers semantic
search and the `similar_to` edges in `build_edges.py`.

Idempotent — rows already embedded are skipped unless `--force`. After
stories are embedded, `videos.embed_status` flips to `'ok'` for any video
whose stories are now all embedded.

## How to run

When the user invokes `/embed $ARGUMENTS`:

1. Forward all arguments verbatim. Default target is `all`.
2. Run:

   ```bash
   uv run python scripts/embed.py --target all $ARGUMENTS
   ```

   If `$ARGUMENTS` already contains `--target`, pass `$ARGUMENTS` alone
   without the default.

## Examples

```bash
# Embed everything that's pending
/embed

# Only stories, capped
/embed --target stories --limit 200

# Re-embed entities after a description refresh
/embed --target entities --force

# Faster batches on a beefier machine
/embed --batch 64
```

## Notes

- First run downloads ~80MB to `~/.cache/huggingface`. Subsequent runs are
  instant.
- CPU-only — no GPU/MPS required. Embedding throughput is roughly 30-80
  rows/sec on a modern Mac.
- After embedding, suggest the next stage: `/build-edges` (similarity edges).
