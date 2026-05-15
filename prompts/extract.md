<!-- version: 1 -->

# Lumen Extraction Prompt

## Role

You are extracting story-moments from a science-video transcript for the Lumen library.

## Task

1. Read the transcript JSON file at `{transcript_path}` using the `Read` tool.
2. Read the few-shot anchors at `prompts/extract_examples.md` and study every good/bad pair before extracting.
3. Emit one valid JSON document at `{output_path}` using the `Write` tool. The document must validate against the schema described below. No commentary, no markdown, no preamble in the output file — JSON only.

The transcript file is shaped like:

```json
{
  "video_id": "abc123",
  "title": "...",
  "duration_sec": 900,
  "segments": [
    {"start": 0.0, "duration": 4.2, "text": "..."},
    ...
  ]
}
```

Use `video_id` exactly as given. Timestamps in your output are integer seconds derived from `segments[].start`.

## Atomic unit: the story-moment

A **story-moment** is one of:

- **anecdote** — a narrated incident with a protagonist (often historical).
- **experiment** — a recounted lab/demo with setup, action, and result.
- **fun_fact** — a counterintuitive or memorable factoid with a hook.
- **history** — an episode from the history of science (year + place + people).
- **quote** — a memorable verbatim utterance worth preserving.
- **surprise** — a reveal/twist in the video that changes the viewer's mental model.
- **claim** — a sharp, testable assertion the host commits to.

A story-moment has a narrative arc: protagonist (or subject), situation, twist/surprise, takeaway. If you cannot write a one-sentence takeaway, the moment is too thin — drop it.

A story-moment is **NOT**:

- a topic tag ("Relativity", "Black holes").
- a bullet point ("The video discusses X.").
- a meta-description ("This video is about Y.").
- a smooth paraphrase with no specifics — that belongs in `summary_paragraph`.

## Output schema (field-by-field)

The top-level object has these properties. Required keys: `video_id`, `stories`, `entities`. `additionalProperties: false` is enforced — do not invent keys.

### Top-level

- `video_id` *(string, required)* — copy verbatim from the transcript.
- `summary_oneline` *(string, optional)* — one tight sentence describing the video. Not a story.
- `summary_paragraph` *(string, optional)* — 3–6 sentences. Where you put high-level framing that does not belong inside any story.
- `field` *(string|null, optional)* — broad discipline: `physics`, `biology`, `chemistry`, `mathematics`, `engineering`, `astronomy`, `neuroscience`, `geology`, `history_of_science`, `computer_science`, etc. Lowercase snake_case.
- `topics` *(array, optional)* — `[{name: string, weight: 0..1}]`. Topic names are short noun phrases; `weight` reflects prominence in the video.

### `stories[]` *(array, required)*

Each item:

- `ts_start` *(integer ≥ 0, required)* — seconds into the video where the moment begins.
- `ts_end` *(integer ≥ 0 or null, optional)* — seconds where the moment ends. Omit or null if you cannot pin it.
- `kind` *(enum, required)* — one of `anecdote | experiment | fun_fact | history | quote | surprise | claim`.
- `title` *(string, required)* — a specific, evocative noun phrase. Not a topic. `"Einstein's elevator thought experiment"` good; `"Relativity"` bad.
- `body` *(string, required)* — **2–6 narrative sentences**. Active voice. Name the protagonist when there is one. Preserve the punchline / surprising detail / numbers / named places. Do not summarize so smoothly that the specific moment disappears.
- `significance` *(string|null, optional)* — one sentence on why a viewer would remember or share this. What makes it sticky.
- `historical_year` *(integer|null, optional)* — the four-digit year (YYYY) when the events depicted **actually occurred**. NULL when the moment is a present-day demo, a thought experiment with no date, an abstract explanation, or when the transcript gives no year. **DO NOT INVENT YEARS.** If only a century or decade is mentioned ("the 18th century", "the 1920s"), set a representative year (1750, 1925) and acknowledge the imprecision in `body` (e.g., "Sometime in the 1920s, ...").
- `historical_place` *(string|null, optional)* — city/country/lab where it happened, if stated. Do not invent.
- `takeaway` *(string|null, optional but strongly preferred)* — one sentence on what the viewer walks away knowing. If you cannot write one, drop the story.
- `entities_mentioned` *(array of strings, optional)* — surface forms exactly as referenced in the transcript: `"Einstein"`, `"Albert Einstein"`, `"Hubble"`, `"the LIGO detector"`. Include every mention, with the variant actually used. **Do not invent QIDs or canonical names** — canonicalization happens downstream in `resolve_entities.py`.
- `claims` *(array, optional)* — `[{text: string (required), kind: factual|counterintuitive|debated|debunked, ts: int|null}]`. Use for sharp, testable assertions the host commits to *inside this story*.

### `entities[]` *(array, required)*

One entry per distinct real-world referent mentioned anywhere in the video. Each:

- `name` *(string, required)* — canonical surface form (best guess at the full name): `"Albert Einstein"`, not `"Einstein"`. Aliases live in `entities_mentioned` inside stories.
- `kind` *(enum, required)* — `person | concept | work | event | paper | experiment | place`.
  - `person` — humans.
  - `concept` — theories, principles, phenomena: `"general relativity"`, `"superposition"`.
  - `work` — books, films, artworks.
  - `event` — discrete historical happenings: `"Trinity test"`, `"1919 eclipse expedition"`.
  - `paper` — specific publications.
  - `experiment` — named experimental apparatus or canonical experiments: `"Michelson-Morley experiment"`, `"double-slit experiment"`.
  - `place` — labs, observatories, cities, geographic features.
- `ts_first_mention` *(integer ≥ 0 or null, optional)* — when the entity first appears.
- `context` *(string|null, optional)* — a short quoted snippet around the first mention.
- `role` *(enum|null, optional)* — `central | supporting | cameo` — overall role in the video.

### `experiments_described[]` *(array, optional)*

Detail-rich experiment recounts. Use this when the video walks through setup + action + result. Each: `ts_start`, `ts_end`, `name` (required), `what_happened`, `result`.

### `quotes_worth_keeping[]` *(array, optional)*

`[{ts: int|null, speaker: "Derek" or "guest:Name" or null, text: string (required)}]`. Verbatim, short, evocative.

### `open_questions_raised[]` *(array, optional)*

Strings. Questions the video poses but does not fully answer. Useful for the random-walk feed.

### `connections_suggested[]` *(array, optional)*

Edges between entities the LLM noticed but the deterministic resolver may not formalize. `[{from: string, to: string, kind: string}]`. Use names matching `entities[].name`. `kind` examples: `influenced_by`, `student_of`, `collaborated_with`, `built_on`, `contradicted`, `cites`.

## Anti-patterns (DO NOT)

- **DO NOT return topic tags as stories.** `{"title":"Relativity","body":"Einstein invented relativity."}` is rejected. No narrative arc, no specifics, no protagonist scene.
- **DO NOT pad short videos with low-content stories.** Quality over quantity. A 2-minute short with one good story is better than three forced ones.
- **DO NOT invent historical years, places, names, or quotes.** If the transcript only says "in the 1920s," set `historical_year: 1925` and write `"In the 1920s, ..."` in `body`. Never write `1923` to seem precise. Same for places and quotations.
- **DO NOT return a prose summary as a story.** Put that in `summary_paragraph`.
- **DO NOT split a single story across multiple entries.** Setup + punchline + takeaway stay in one item, otherwise the moment loses its arc.
- **DO NOT skip the takeaway.** If you cannot write one sentence on what the viewer walks away knowing, the moment is too thin — drop it.
- **DO NOT emit bullet-point bodies.** No `"- did X. - then Y."` in `body`. Write sentences.
- **DO NOT invent QIDs, slugs, or canonical IDs.** Surface forms only.
- **DO NOT include keys not in the schema.** `additionalProperties: false` will reject the document.
- **DO NOT wrap the JSON in markdown fences in the output file.** The file must be raw JSON.

## Target counts

- Typical 12–20-minute Veritasium-style video: **8–20 story-moments**. Prefer more good moments than a few vague ones.
- 5–10-minute video: 4–10 moments.
- 2–4-minute short: 1–3 moments.
- A video that is almost entirely one extended thought experiment may legitimately be 1–3 long, rich moments.

Do not force a quota. Drop weak candidates.

## Output format

Write **valid JSON only** to `{output_path}` using the `Write` tool. No commentary, no markdown, no preamble in the file. The document will be schema-validated; invalid output is rejected and the work is wasted.

Before writing: mentally walk the schema once against your draft. Confirm:

- All required keys present.
- No extra keys.
- Every story has `ts_start`, `kind`, `title`, `body`.
- Every entity has `name`, `kind`.
- Enums use exact lowercase values from the lists above.
- No invented years.
- Bodies are 2–6 sentences with specifics, not topic restatements.

Then write the file. Done.
