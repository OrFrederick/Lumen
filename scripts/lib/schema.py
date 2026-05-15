"""JSON Schema for transcript-extractor subagent output.

Subagents emit one JSON document per transcript. Every document is validated
against EXTRACTION_SCHEMA before it touches SQLite (see extract_write.py).
Validation failures = quarantined output, no partial writes.
"""

from __future__ import annotations

from typing import Any

import jsonschema

ENTITY_KINDS: tuple[str, ...] = (
    "person",
    "concept",
    "work",
    "event",
    "paper",
    "experiment",
    "place",
)

STORY_KINDS: tuple[str, ...] = (
    "anecdote",
    "experiment",
    "fun_fact",
    "history",
    "quote",
    "surprise",
    "claim",
)

CLAIM_KINDS: tuple[str, ...] = ("factual", "counterintuitive", "debated", "debunked")

ENTITY_ROLES: tuple[str, ...] = ("central", "supporting", "cameo")


EXTRACTION_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Lumen Extraction",
    "type": "object",
    "required": ["video_id", "stories", "entities"],
    "additionalProperties": False,
    "properties": {
        "video_id": {"type": "string", "minLength": 1},
        "summary_oneline": {"type": "string"},
        "summary_paragraph": {"type": "string"},
        "field": {"type": ["string", "null"]},
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "weight": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        },
        "stories": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["ts_start", "kind", "title", "body"],
                "additionalProperties": False,
                "properties": {
                    "ts_start": {"type": "integer", "minimum": 0},
                    "ts_end": {"type": ["integer", "null"], "minimum": 0},
                    "kind": {"type": "string", "enum": list(STORY_KINDS)},
                    "title": {"type": "string", "minLength": 1},
                    "body": {"type": "string", "minLength": 1},
                    "significance": {"type": ["string", "null"]},
                    "historical_year": {"type": ["integer", "null"]},
                    "historical_place": {"type": ["string", "null"]},
                    "takeaway": {"type": ["string", "null"]},
                    "entities_mentioned": {
                        "type": "array",
                        "items": {"type": "string", "minLength": 1},
                    },
                    "claims": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text"],
                            "additionalProperties": False,
                            "properties": {
                                "text": {"type": "string", "minLength": 1},
                                "kind": {"type": "string", "enum": list(CLAIM_KINDS)},
                                "ts": {"type": ["integer", "null"], "minimum": 0},
                            },
                        },
                    },
                },
            },
        },
        "entities": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "kind"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "kind": {"type": "string", "enum": list(ENTITY_KINDS)},
                    "ts_first_mention": {"type": ["integer", "null"], "minimum": 0},
                    "context": {"type": ["string", "null"]},
                    "role": {"type": ["string", "null"], "enum": [*ENTITY_ROLES, None]},
                },
            },
        },
        "experiments_described": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name"],
                "additionalProperties": False,
                "properties": {
                    "ts_start": {"type": ["integer", "null"], "minimum": 0},
                    "ts_end": {"type": ["integer", "null"], "minimum": 0},
                    "name": {"type": "string", "minLength": 1},
                    "what_happened": {"type": ["string", "null"]},
                    "result": {"type": ["string", "null"]},
                },
            },
        },
        "quotes_worth_keeping": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["text"],
                "additionalProperties": False,
                "properties": {
                    "ts": {"type": ["integer", "null"], "minimum": 0},
                    "speaker": {"type": ["string", "null"]},
                    "text": {"type": "string", "minLength": 1},
                },
            },
        },
        "open_questions_raised": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "connections_suggested": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["from", "to", "kind"],
                "additionalProperties": False,
                "properties": {
                    "from": {"type": "string", "minLength": 1},
                    "to": {"type": "string", "minLength": 1},
                    "kind": {"type": "string", "minLength": 1},
                },
            },
        },
    },
}

_VALIDATOR = jsonschema.Draft202012Validator(EXTRACTION_SCHEMA)


def validate_extraction(doc: object) -> None:
    """Raise jsonschema.ValidationError if `doc` doesn't match EXTRACTION_SCHEMA."""
    _VALIDATOR.validate(doc)


def iter_extraction_errors(doc: object) -> list[jsonschema.ValidationError]:
    """Return all schema errors (sorted by path) without raising."""
    return sorted(_VALIDATOR.iter_errors(doc), key=lambda e: list(e.absolute_path))
