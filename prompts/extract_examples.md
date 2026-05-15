<!-- version: 1 -->

# Lumen Extraction — Few-shot Anchors

Three GOOD story-moment examples followed by three BAD ones. Study the contrast before extracting. The bad ones are exactly the failure modes that get an extraction rejected.

Each example below shows a single `stories[]` item (plus a minimal `entities[]` entry where relevant) — in real output they live inside the full top-level document.

---

## GOOD 1 — historical anecdote with year + place + protagonist

```json
{
  "ts_start": 412,
  "ts_end": 478,
  "kind": "anecdote",
  "title": "Einstein's happiest thought: the falling man in Bern",
  "body": "In 1907, while working as a patent clerk in Bern, Einstein imagined a man falling freely from a rooftop. He realized that during the fall the man would feel no weight at all — gravity and acceleration would be locally indistinguishable. Einstein later called this his happiest thought, because it cracked open the path from special relativity to general relativity. The mundane setting — a Swiss patent office, no laboratory, no telescope — is part of why the story sticks.",
  "significance": "It captures relativity's birth in a daydream rather than an experiment, which is why this anecdote is the canonical opener for any introduction to general relativity.",
  "historical_year": 1907,
  "historical_place": "Bern, Switzerland",
  "takeaway": "Acceleration and gravity are locally indistinguishable — the equivalence principle that became the seed of general relativity.",
  "entities_mentioned": ["Einstein", "Bern"],
  "claims": [
    {
      "text": "A freely falling observer feels no gravity.",
      "kind": "counterintuitive"
    }
  ]
}
```

---

## GOOD 2 — experiment recount with surprise result

```json
{
  "ts_start": 205,
  "ts_end": 312,
  "kind": "experiment",
  "title": "The bowling ball and the feather in a vacuum chamber",
  "body": "Derek visits NASA's largest vacuum chamber in Ohio and drops a bowling ball and a bundle of feathers from the same height. With air present, the feathers drift down lazily while the ball thuds first. Then the chamber is pumped down to near-vacuum and the drop repeats: the bowling ball and the feathers fall side by side, hitting the floor at the same instant. The engineers in the room actually cheer — even people who know the physics are visibly startled by seeing it.",
  "significance": "Watching trained engineers gasp at a 400-year-old prediction makes the equivalence of gravitational acceleration feel new again; it is the demo most viewers cite when they share the video.",
  "historical_year": null,
  "historical_place": "NASA Space Power Facility, Sandusky, Ohio",
  "takeaway": "In the absence of air resistance, all objects fall at the same rate regardless of mass — a prediction that still surprises even when you already believe it.",
  "entities_mentioned": ["Derek", "NASA Space Power Facility"],
  "claims": [
    {
      "text": "Without air resistance, objects of any mass fall at the same rate.",
      "kind": "factual"
    }
  ]
}
```

---

## GOOD 3 — counterintuitive fun fact with a clean reframing

```json
{
  "ts_start": 78,
  "ts_end": 156,
  "kind": "fun_fact",
  "title": "Why mirrors don't actually flip left and right",
  "body": "When you face a mirror and raise your right hand, the reflection raises what looks like its left hand — so mirrors seem to swap left and right. But they do not: a mirror flips front-to-back, not side-to-side. The reason it feels horizontal is that humans are roughly left-right symmetric, so we mentally rotate the image around a vertical axis to compare it to ourselves. Lie down sideways in front of the mirror and the 'flip' suddenly looks vertical — proving the asymmetry was in your head, not the glass.",
  "significance": "A daily-life paradox that everyone has noticed but almost no one has the correct mental model for; the lie-down test is the kind of cheap experiment viewers immediately try.",
  "historical_year": null,
  "historical_place": null,
  "takeaway": "Mirrors reverse the axis perpendicular to their surface, not left-right — the left-right illusion comes from how we mentally align with our reflection.",
  "entities_mentioned": [],
  "claims": [
    {
      "text": "Mirrors reverse front-to-back, not left-to-right.",
      "kind": "counterintuitive"
    }
  ]
}
```

---

## BAD 1 — shallow topic dump

```json
{
  "ts_start": 0,
  "kind": "anecdote",
  "title": "Einstein",
  "body": "Einstein was a physicist who developed the theory of relativity. He is one of the most famous scientists in history."
}
```

**Why rejected:** Not a story. No protagonist scene, no situation, no surprise, no specifics, no takeaway. The title is a topic tag. The body is a Wikipedia stub. This is exactly the failure mode the prompt is designed to prevent — if every "story" looked like this, the entire Lumen library would collapse to flat encyclopedia entries.

---

## BAD 2 — invented historical year

```json
{
  "ts_start": 540,
  "kind": "history",
  "title": "Heisenberg formulates the uncertainty principle on Helgoland",
  "body": "In 1923, Heisenberg retreated to the island of Helgoland to recover from hay fever and, in a feverish week, worked out the foundations of matrix mechanics that led directly to the uncertainty principle.",
  "historical_year": 1923,
  "historical_place": "Helgoland, Germany",
  "takeaway": "Quantum mechanics took its modern form on a tiny North Sea island during a hay-fever retreat."
}
```

**Why rejected:** Fabrication. The transcript says only "in the mid-1920s." The model invented `1923` to seem precise — and the actual year (1925) is wrong by two. When the transcript gives only a decade, set a representative year (`1925`) and write `"In the mid-1920s, ..."` in the body. Inventing precise years poisons the timeline, which is a hero UX surface.

---

## BAD 3 — single anecdote split across multiple entries

```json
[
  {
    "ts_start": 412,
    "kind": "anecdote",
    "title": "Einstein in Bern",
    "body": "In 1907 Einstein was working at the Swiss patent office.",
    "historical_year": 1907,
    "takeaway": "Einstein worked in Bern."
  },
  {
    "ts_start": 430,
    "kind": "anecdote",
    "title": "A man falls off a roof",
    "body": "Einstein imagined a man falling from a roof.",
    "historical_year": 1907,
    "takeaway": "Einstein did a thought experiment."
  },
  {
    "ts_start": 460,
    "kind": "anecdote",
    "title": "Equivalence principle",
    "body": "He concluded gravity and acceleration are the same.",
    "historical_year": 1907,
    "takeaway": "Gravity equals acceleration."
  }
]
```

**Why rejected:** The narrative arc is chopped into three skeletal fragments. Each piece has no protagonist scene on its own; the punchline ("his happiest thought," the seed of general relativity) is lost; the takeaways are flat restatements. Compare to GOOD 1, which keeps setup + image + reveal + significance together in one item. **One story-moment = one arc.**
