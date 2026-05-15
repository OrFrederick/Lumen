---
description: Resolve unverified entities to Wikidata QIDs and enrich with Wikipedia + OpenAlex data.
argument-hint: [--limit N] [--kind person|concept|paper|...] [--force]
---

# /enrich

Runs the full enrichment pipeline against `data/library.db`. Each stage is
idempotent and safely re-runnable. External calls are cached under
`data/cache/{api}/`.

## Pipeline

When the user invokes `/enrich $ARGUMENTS`:

1. Parse optional flags from `$ARGUMENTS`:
   - `--limit N` — forwarded to each script.
   - `--kind <k>` — forwarded to `resolve_entities.py` only.
   - `--force` — forwarded to `enrich_wikipedia.py`, `enrich_wikidata.py`,
     `enrich_openalex.py`.
2. Run the stages **in order**, printing the summary from each:

   ```bash
   uv run python scripts/resolve_entities.py [--limit N] [--kind K]
   uv run python scripts/enrich_wikipedia.py  [--limit N] [--force]
   uv run python scripts/enrich_wikidata.py   [--limit N] [--force]
   uv run python scripts/enrich_openalex.py   [--limit N] [--force]
   ```

3. After all four complete, print a one-line tally of:
   - verified entities (`SELECT COUNT(*) FROM entities WHERE verified=1`)
   - entities with descriptions (`description IS NOT NULL`)
   - total edges by source (`SELECT source, COUNT(*) FROM edges GROUP BY source`).

## What each stage does

- **`resolve_entities.py`** — for `verified=0, wikidata_qid IS NULL` rows:
  Wikidata search → confident match → set QID, dates, occupation, image, mark
  verified. Bulk-inserts every label/alias across all languages into
  `entity_aliases` so future surface forms hit the cache.
- **`enrich_wikipedia.py`** — for entities with QID, no description: hits the
  Wikipedia REST summary endpoint, fills `description` + `wikipedia_url`.
- **`enrich_wikidata.py`** — derives edges from Wikidata claims:
  `influenced_by` (P737), `student_of` (P184/P802), `authored_by` (P50). Edges
  only land when both endpoints exist in our DB.
- **`enrich_openalex.py`** — paper entities → OpenAlex `Work` ID + `cites`
  edges; person entities → OpenAlex `Author` ID (best-effort).

## Manual duplicate collapse

If automatic resolution misroutes a row (e.g., "Hubble" the telescope vs the
person), use:

```bash
uv run python scripts/merge_entities.py --from <bad_id> --into <good_id> [--dry-run]
```

It re-points all aliases, mentions, edges, and claim references, then deletes
the source row inside a single transaction.

## Notes

- No API key required. All endpoints are public; throttling is built-in.
- A polite `User-Agent` header (`Lumen/0.1`) is attached to every request.
- Cache files live under `data/cache/` and can be deleted to force re-fetch.
